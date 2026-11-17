import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { apiRequest, triBinNumber } from './api'

// editor-only page where the client presses buttons instead of waiting on real sensors.
// every button calls /api/simulate/..., which saves readings the same way a real sensor would,
// so the rest of the app (cards, alerts, pickup list, history) reacts for real

type Stream = 'Landfill' | 'Recycling' | 'Compost'

export interface ToolBin {
  id: string
  name: string
  zone: string
  location: string
  lat: number
  lng: number
  compartments: { label: Stream; fill: number }[]
  sensorStatus: 'online' | 'offline'
  lastUpdated: string
}

interface SimResult {
  message: string
  id?: string
  fullest?: number
  sensorStatus?: string
  readingsAdded?: number
  binsReset?: number
}

interface LogEntry {
  id: number
  at: Date
  text: string
  ok: boolean
}

type Action = 'fill' | 'empty' | 'offline' | 'week' | 'reset' | 'check'

const STREAMS: Stream[] = ['Landfill', 'Recycling', 'Compost']

// matches the fill bands everywhere else: green 0-49, yellow 50-79, red 80-100
function bandClass(fill: number) {
  return fill >= 80 ? 'bg-status-critical' : fill >= 50 ? 'bg-status-warn' : 'bg-status-ok'
}

// friendly names for crystal's system check results
const CHECK_LABELS: Record<string, string> = {
  databaseConnected: 'Database connected',
  loginWorks: 'Login works',
  alertWorks: 'Alert fires at the set %',
  csvExportWorks: 'CSV export works',
  sensorFailureFlagWorks: 'Sensor failure flag works',
}

function ActionTile({ step, title, text, children }: { step: string; title: string; text: string; children: ReactNode }) {
  return (
    <div className="rounded-[28px] p-5 glass flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-full bg-teal-soft text-teal font-bold flex items-center justify-center shrink-0">{step}</span>
        <div className="min-w-0">
          <h3 className="text-[17px] font-bold text-pine">{title}</h3>
          <p className="text-[13px] font-medium text-pine-muted mt-0.5">{text}</p>
        </div>
      </div>
      <div className="mt-auto">{children}</div>
    </div>
  )
}

const BUTTON = 'w-full min-h-12 rounded-full bg-pine text-ivory text-[15px] font-bold hover:bg-forest-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

export default function TestPanelPage({ bins, fillOn, fillAt, offlineOn, onChanged }: {
  bins: ToolBin[]
  fillOn: boolean // the signed-in user's own alert settings, so messages match what they'll see
  fillAt: number
  offlineOn: boolean
  onChanged: () => void // refresh the bins right away instead of waiting for the next poll
}) {
  const sorted = useMemo(() => [...bins].sort((a, b) => triBinNumber(a.id) - triBinNumber(b.id)), [bins])
  const [binId, setBinId] = useState(() => sorted[0]?.id ?? '')
  const [stream, setStream] = useState<Stream>('Recycling')
  const [percent, setPercent] = useState(85)
  const [busy, setBusy] = useState<Action | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [log, setLog] = useState<LogEntry[]>([])
  const [checks, setChecks] = useState<Record<string, boolean> | null>(null)
  const nextLogId = useRef(1)

  // the picked bin can disappear (zone change, reset); fall back to the first one
  const bin = sorted.find(b => b.id === binId) ?? sorted[0]

  // a second tap within a few seconds confirms the reset
  useEffect(() => {
    if (!confirmReset) return
    const timer = window.setTimeout(() => setConfirmReset(false), 4000)
    return () => window.clearTimeout(timer)
  }, [confirmReset])

  function addLog(text: string, ok: boolean) {
    setLog(prev => [{ id: nextLogId.current++, at: new Date(), text, ok }, ...prev].slice(0, 30))
  }

  async function run(action: Action, path: string, body: object, describe: (res: SimResult) => string) {
    setBusy(action)
    try {
      const res = await apiRequest<SimResult>(`/api/simulate/${path}`, 'POST', body)
      addLog(describe(res), true)
      onChanged()
    } catch (err) {
      addLog(err instanceof Error ? err.message : 'Something went wrong.', false)
    } finally {
      setBusy(null)
    }
  }

  function fill() {
    if (!bin) return
    run('fill', 'fill', { triBinID: triBinNumber(bin.id), stream: stream.toLowerCase(), percent }, () => {
      const base = `${bin.name} ${stream.toLowerCase()} set to ${percent}%`
      if (!fillOn) return `${base} → fill alerts are off in your settings`
      return percent >= fillAt ? `${base} → alert sent` : `${base} → below your ${fillAt}% alert level, no alert`
    })
  }

  function empty() {
    if (!bin) return
    const wasOnList = Math.max(...bin.compartments.map(c => c.fill)) >= fillAt
    run('empty', 'empty', { triBinID: triBinNumber(bin.id) }, res =>
      `${bin.name} emptied → all three compartments at ${res.fullest ?? 2}%${wasOnList ? ', off the pickup list' : ''}`)
  }

  function offline() {
    if (!bin) return
    run('offline', 'offline', { triBinID: triBinNumber(bin.id) }, () =>
      `${bin.name} sensor went offline → ${offlineOn ? 'offline alert sent' : 'offline alerts are off in your settings'}`)
  }

  function demoWeek() {
    if (!bin) return
    run('week', 'demo-week', { triBinID: triBinNumber(bin.id) }, res =>
      `${bin.name} got a week of demo readings${res.readingsAdded ? ` (${res.readingsAdded})` : ''} → see them on the History page`)
  }

  function reset() {
    if (!confirmReset) return setConfirmReset(true)
    setConfirmReset(false)
    run('reset', 'reset', {}, res => `${res.message} → past readings stay in History`)
  }

  async function systemCheck() {
    setBusy('check')
    setChecks(null)
    try {
      const res = await apiRequest<Record<string, boolean>>('/api/system-check')
      setChecks(res)
      const failed = Object.values(res).filter(v => !v).length
      addLog(failed === 0 ? 'System check → everything passed' : `System check → ${failed} check${failed === 1 ? '' : 's'} failed`, failed === 0)
    } catch (err) {
      addLog(err instanceof Error ? err.message : 'System check failed.', false)
    } finally {
      setBusy(null)
    }
  }

  if (!bin) {
    return (
      <div className="rounded-[28px] p-8 glass text-center">
        <p className="text-lg font-bold text-pine">No bins to test yet</p>
        <p className="text-sm text-pine-muted mt-1">Add a bin on the Manage bins tab first.</p>
      </div>
    )
  }

  const offlineNow = bin.sensorStatus === 'offline'

  return (
    <div className="space-y-5 md:space-y-6">
      {/* pick a bin + what it looks like right now */}
      <div className="rounded-[28px] p-5 md:p-6 glass">
        <div className="flex flex-col md:flex-row md:items-end gap-4">
          <label className="flex-1 min-w-0">
            <span className="block text-sm font-bold text-pine mb-1.5">Bin to test</span>
            <select
              value={bin.id}
              onChange={e => setBinId(e.target.value)}
              className="w-full min-h-12 rounded-2xl bg-white/70 border border-pine/10 px-4 text-base font-semibold text-pine outline-none focus:border-teal/50 focus:ring-2 focus:ring-teal/20"
            >
              {sorted.map(b => <option key={b.id} value={b.id}>{b.name} · {b.location}</option>)}
            </select>
          </label>
          <span className={`self-start md:self-auto text-xs font-bold px-3 py-1.5 rounded-full ${offlineNow ? 'bg-offline-soft text-status-offline-ink' : 'bg-olive-soft text-olive-ink'}`}>
            {offlineNow ? 'Sensor offline' : 'Sensor online'} · {bin.lastUpdated}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:gap-3 mt-4">
          {bin.compartments.map(c => (
            <div key={c.label} className="bg-ivory/75 rounded-2xl px-3 py-2.5">
              <div className="flex justify-between text-xs font-semibold text-pine-muted">
                <span>{c.label}</span>
                <span className="font-mono text-pine">{c.fill}%</span>
              </div>
              <div className="h-2 bg-pine/10 rounded-full overflow-hidden mt-1.5">
                <div className={`h-full rounded-full transition-[width] duration-500 ${bandClass(c.fill)}`} style={{ width: `${c.fill}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <ActionTile step="①" title={`Fill bin to ${percent}%`} text="Pretend a sensor just reported this level for one compartment.">
          <div className="flex flex-wrap gap-1.5 mb-3" role="group" aria-label="Compartment">
            {STREAMS.map(s => (
              <button key={s} onClick={() => setStream(s)} aria-pressed={stream === s}
                className={`px-3.5 min-h-10 rounded-full text-sm font-bold transition-colors ${stream === s ? 'bg-teal text-ivory' : 'bg-ivory/80 text-pine-muted hover:text-pine'}`}
              >{s}</button>
            ))}
          </div>
          <div className="flex items-center gap-2 mb-3">
            <button onClick={() => setPercent(p => Math.max(0, p - 5))} aria-label="Lower fill percent" className="w-11 h-11 rounded-full bg-ivory/80 text-pine text-xl font-bold hover:bg-ivory">−</button>
            <span className="flex-1 text-center font-mono text-2xl font-bold text-pine">{percent}%</span>
            <button onClick={() => setPercent(p => Math.min(100, p + 5))} aria-label="Raise fill percent" className="w-11 h-11 rounded-full bg-ivory/80 text-pine text-xl font-bold hover:bg-ivory">+</button>
          </div>
          <button onClick={fill} disabled={busy !== null} className={BUTTON}>{busy === 'fill' ? 'Sending…' : `Fill ${stream.toLowerCase()} to ${percent}%`}</button>
        </ActionTile>

        <ActionTile step="②" title="Empty bin" text="All three compartments drop to almost empty, like right after a pickup. No “emptied” button needed.">
          <button onClick={empty} disabled={busy !== null} className={BUTTON}>{busy === 'empty' ? 'Sending…' : 'Empty bin'}</button>
        </ActionTile>

        <ActionTile step="③" title="Sensor goes offline" text="The sensor stops reporting. Its last contact moves back 6 hours and an offline alert shows up.">
          <button onClick={offline} disabled={busy !== null || offlineNow} className={BUTTON}>
            {busy === 'offline' ? 'Sending…' : offlineNow ? 'Already offline' : 'Sensor goes offline'}
          </button>
          {offlineNow && <p className="text-xs font-semibold text-pine-muted mt-2 text-center">Fill or empty the bin to bring it back online.</p>}
        </ActionTile>

        <ActionTile step="④" title="Add a week of demo data" text="Adds 7 days of hourly readings to this bin so the History graph and CSV export have something to show.">
          <button onClick={demoWeek} disabled={busy !== null} className={BUTTON}>{busy === 'week' ? 'Adding…' : 'Add a week of demo data'}</button>
        </ActionTile>

        <ActionTile step="⑤" title="Reset demo" text="Puts every bin back to its starting level and status. Past readings stay in History.">
          <button onClick={reset} disabled={busy !== null}
            className={confirmReset ? `${BUTTON.replace('bg-pine', 'bg-status-critical').replace('hover:bg-forest-light', 'hover:brightness-110')}` : BUTTON}
          >
            {busy === 'reset' ? 'Resetting…' : confirmReset ? 'Tap again to reset every bin' : 'Reset demo'}
          </button>
        </ActionTile>

        <ActionTile step="✓" title="System check" text="Runs quick checks on the server and shows a ✓ or ✗ for each.">
          {checks && (
            <ul className="space-y-1.5 mb-3">
              {Object.entries(checks).map(([key, ok]) => (
                <li key={key} className="flex items-center gap-2 text-sm font-semibold text-pine">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${ok ? 'bg-olive-soft text-olive-ink' : 'bg-critical-soft text-status-critical-ink'}`}>{ok ? '✓' : '✗'}</span>
                  {CHECK_LABELS[key] ?? key}
                </li>
              ))}
            </ul>
          )}
          <button onClick={systemCheck} disabled={busy !== null} className={BUTTON}>{busy === 'check' ? 'Checking…' : 'Run system check'}</button>
        </ActionTile>
      </div>

      {/* what happened, newest first */}
      <div className="rounded-[28px] p-5 md:p-6 glass">
        <div className="flex items-center gap-2 mb-2">
          <h2 className="text-lg font-bold text-pine">What happened</h2>
          {log.length > 0 && (
            <button onClick={() => setLog([])} className="ml-auto text-sm font-bold text-pine-muted hover:text-pine min-h-11 px-2 -mr-2">Clear</button>
          )}
        </div>
        {log.length === 0 ? (
          <p className="text-sm text-pine-muted py-2">Press a button above. What it did shows up here, and the Summary, Details, Pickup List and History pages update too.</p>
        ) : (
          <ul aria-live="polite">
            {log.map(entry => (
              <li key={entry.id} className="flex items-start gap-3 py-2.5 border-t border-pine/[0.07] first:border-t-0">
                <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${entry.ok ? 'bg-status-ok' : 'bg-status-critical'}`} />
                <span className={`flex-1 text-[15px] font-semibold ${entry.ok ? 'text-pine' : 'text-status-critical-ink'}`}>{entry.text}</span>
                <span className="text-xs font-mono text-pine-muted shrink-0 mt-0.5">{entry.at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
