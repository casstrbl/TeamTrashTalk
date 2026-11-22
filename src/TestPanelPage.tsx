import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { apiRequest, triBinNumber } from './api'

// editor-only page where the client presses buttons instead of waiting on real sensors.
// supported actions use browser-only mock data when the Java server is unavailable.
// with the server online, API actions save real readings and history.

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

type BrowserHistoryRow = {
  timestamp: string
  binId: string
  binName: string
  stream: string
  percent: number
}

type Action = 'fill' | 'empty' | 'offline' | 'week' | 'reset' | 'check' | 'timer'

interface TimerStatus {
  running: boolean
  intervalSeconds: number
  simSpeed: number
  stopsAt: string | null
}

// the pickup list logs a pickup when a compartment that was at least this full reads almost empty
const PICKUP_FROM = 50

// the bin picker's two extra choices
const ALL = '__all'
const RANDOM = '__random'
// how many bins "all bins" works on at once, so the server isn't hit with every request together
const BATCH = 4

// runs fn on every item, a few at a time. returns how many worked and the first error message
async function forEachBin<T>(items: T[], fn: (item: T) => Promise<unknown>) {
  let ok = 0
  let firstError = ''
  for (let i = 0; i < items.length; i += BATCH) {
    const results = await Promise.allSettled(items.slice(i, i + BATCH).map(fn))
    for (const r of results) {
      if (r.status === 'fulfilled') ok++
      else if (!firstError) firstError = r.reason instanceof Error ? r.reason.message : 'Something went wrong.'
    }
  }
  return { ok, failed: items.length - ok, firstError }
}

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
  browserDemoReady: 'Browser simulation available',
  binsAvailable: 'Demo bins loaded',
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

export default function TestPanelPage({ bins, fillOn, fillAt, offlineOn, onChanged, usingSampleData, onBrowserSimulate }: {
  bins: ToolBin[]
  fillOn: boolean // the signed-in user's own alert settings, so messages match what they'll see
  fillAt: number
  offlineOn: boolean
  onChanged: () => void
  usingSampleData: boolean
  onBrowserSimulate: (operations: {
    action: 'fill' | 'empty' | 'offline' | 'reset'
    input?: { triBinID?: number; stream?: string; percent?: number }
  }[]) => { message: string }
}) {
  const sorted = useMemo(() => [...bins].sort((a, b) => triBinNumber(a.id) - triBinNumber(b.id)), [bins])
  // start on a bin that's reporting, so the first button press shows a change right away
  const [binId, setBinId] = useState(() => (sorted.find(b => b.sensorStatus === 'online') ?? sorted[0])?.id ?? '')
  const [stream, setStream] = useState<Stream>('Recycling')
  const [percent, setPercent] = useState(85)
  const [busy, setBusy] = useState<Action | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [log, setLog] = useState<LogEntry[]>([])
  const [checks, setChecks] = useState<Record<string, boolean> | null>(null)
  const [timer, setTimer] = useState<TimerStatus | null>(null)
  const nextLogId = useRef(1)
  const [browserHistory, setBrowserHistory] = useState<BrowserHistoryRow[]>([])

  // is the live simulation running? checked on open, then every 15 seconds (it can stop by itself)
  useEffect(() => {
    if (usingSampleData) { setTimer(null); return }
    let active = true
    async function load() {
      try {
        const res = await apiRequest<TimerStatus>('/api/simulate/timer')
        if (active) setTimer(res)
      } catch {
        // the tile shows the start button, and pressing it reports the error
      }
    }
    void load()
    const id = window.setInterval(() => { void load() }, 15000)
    return () => { active = false; window.clearInterval(id) }
  }, [usingSampleData])

  // Local-only sensor timer; never saves readings to the Java API.
  useEffect(() => {
    if (!usingSampleData || !timer?.running) return
    const tick = () => {
      if (timer.stopsAt && Date.now() >= new Date(timer.stopsAt).getTime()) {
        setTimer({ ...timer, running: false, stopsAt: null })
        return
      }
      const online = bins.filter(b => b.zone && b.sensorStatus === 'online')
      if (!online.length) return
      const bin = online[Math.floor(Math.random() * online.length)]
      const compartment = bin.compartments[Math.floor(Math.random() * bin.compartments.length)]
      if (!compartment) return
      try {
        onBrowserSimulate([{
          action: 'fill',
          input: {
            triBinID: triBinNumber(bin.id),
            stream: compartment.label.toLowerCase(),
            percent: Math.min(100, compartment.fill + 1 + Math.floor(Math.random() * 4))
          }
        }])
      } catch {
        // Never call the backend for browser-demo sensor ticks.
      }
    }
    const id = window.setInterval(tick, 5000)
    return () => window.clearInterval(id)
  }, [usingSampleData, timer?.running, timer?.stopsAt, bins, onBrowserSimulate])

  // the last bin "random bin" landed on, so its levels show at the top
  const [lastRandomId, setLastRandomId] = useState<string | null>(null)
  const mode = binId === ALL ? 'all' : binId === RANDOM ? 'random' : 'one'

  // the picked bin can disappear (zone change, reset); fall back to the first one
  const bin = mode === 'one'
    ? sorted.find(b => b.id === binId) ?? sorted[0]
    : mode === 'random' ? sorted.find(b => b.id === lastRandomId) ?? null : null

  // which bins a button press works on: the picked one, every bin, or one picked at random right now
  function targets(): ToolBin[] {
    if (mode === 'all') return sorted
    if (mode === 'random') {
      const pick = sorted[Math.floor(Math.random() * sorted.length)]
      if (!pick) return []
      setLastRandomId(pick.id)
      return [pick]
    }
    return bin ? [bin] : []
  }

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
      if (usingSampleData) {
        if (path === 'fill' || path === 'empty' || path === 'offline' || path === 'reset') {
          const result = onBrowserSimulate([{
            action: path,
            input: body as { triBinID?: number; stream?: string; percent?: number }
          }])
          addLog(`${result.message} (browser demo only)`, true)
        } else {
          addLog(`${action} requires the backend.`, false)
        }
        return
      }
      const res = await apiRequest<SimResult>(`/api/simulate/${path}`, 'POST', body)
      addLog(describe(res), true)
      onChanged()
    } catch (err) {
      addLog(err instanceof Error ? err.message : 'Something went wrong.', false)
    } finally {
      setBusy(null)
    }
  }

  // one button press on every bin (all bins): one summary line instead of one per bin
  async function runAll(action: Action, list: ToolBin[], path: string, bodyFor: (b: ToolBin) => object, done: string) {
    setBusy(action)
    try {
      if (usingSampleData) {
        if (path === 'fill' || path === 'empty' || path === 'offline') {
          const browserAction = path as 'fill' | 'empty' | 'offline'
          const operations = list.map(b => ({
            action: browserAction,
            input: bodyFor(b) as { triBinID?: number; stream?: string; percent?: number }
          }))
          onBrowserSimulate(operations)
          addLog(`${done.replace('{n}', String(list.length))} (browser demo only)`, true)
        } else {
          addLog(`${action} requires the backend.`, false)
        }
        return
      }
      const { ok, failed, firstError } = await forEachBin(list, b => apiRequest<SimResult>(`/api/simulate/${path}`, 'POST', bodyFor(b)))
      if (ok > 0) addLog(`${done.replace('{n}', String(ok))}${failed ? ` (${failed} didn’t work: ${firstError})` : ''}`, failed === 0)
      else addLog(firstError || 'Something went wrong.', false)
      onChanged()
    } catch (err) {
      addLog(err instanceof Error ? err.message : 'Could not simulate the bins.', false)
    } finally {
      setBusy(null)
    }
  }

  function fill() {
    const list = targets()
    if (list.length === 0) return
    const what = `${stream.toLowerCase()} set to ${percent}%`
    const alertNote = !fillOn ? 'fill alerts are off in your settings' : percent >= fillAt ? 'alerts sent' : `below your ${fillAt}% alert level, no alerts`
    if (list.length > 1) {
      return runAll('fill', list, 'fill', b => ({ triBinID: triBinNumber(b.id), stream: stream.toLowerCase(), percent }), `{n} bins ${what} → ${alertNote}`)
    }
    const one = list[0]
    run('fill', 'fill', { triBinID: triBinNumber(one.id), stream: stream.toLowerCase(), percent }, () => {
      const base = `${one.name} ${what}`
      if (!fillOn) return `${base} → fill alerts are off in your settings`
      return percent >= fillAt ? `${base} → alert sent` : `${base} → below your ${fillAt}% alert level, no alert`
    })
  }

  function empty() {
    const list = targets()
    if (list.length === 0) return
    if (list.length > 1) {
      const pickups = list.filter(b => Math.max(...b.compartments.map(c => c.fill)) >= PICKUP_FROM).length
      return runAll('empty', list, 'empty', b => ({ triBinID: triBinNumber(b.id) }), `{n} bins emptied → ${pickups} ${pickups === 1 ? 'pickup' : 'pickups'} logged`)
    }
    const one = list[0]
    const fullestBefore = Math.max(...one.compartments.map(c => c.fill))
    run('empty', 'empty', { triBinID: triBinNumber(one.id) }, res => {
      const base = `${one.name} emptied → all compartments at ${res.fullest ?? 2}%`
      return fullestBefore >= PICKUP_FROM ? `${base}, pickup logged` : `${base} (under ${PICKUP_FROM}% before, so no pickup logged)`
    })
  }

  function offline() {
    const list = targets()
    if (list.length === 0) return
    const note = offlineOn ? 'offline alerts sent' : 'offline alerts are off in your settings'
    if (list.length > 1) {
      return runAll('offline', list, 'offline', b => ({ triBinID: triBinNumber(b.id) }), `{n} sensors went offline → ${note}`)
    }
    const one = list[0]
    run('offline', 'offline', { triBinID: triBinNumber(one.id) }, () =>
      `${one.name} sensor went offline → ${offlineOn ? 'offline alert sent' : 'offline alerts are off in your settings'}`)
  }

  function downloadBrowserHistory() {
    const csvCell = (cell: string | number) => '"' + String(cell).replace(/"/g, '""') + '"'
    const rows = [
      ['timestamp', 'binId', 'binName', 'stream', 'percent'],
      ...browserHistory.map(row => [row.timestamp, row.binId, row.binName, row.stream, row.percent])
    ]
    const csv = rows.map(row => row.map(csvCell).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'trashtalk-browser-demo-history.csv'
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  function demoWeek() {
    if (usingSampleData) {
      const list = targets()
      if (!list.length) return
      const now = Date.now()
      const created: BrowserHistoryRow[] = list.flatMap(bin =>
        bin.compartments.flatMap(compartment =>
          Array.from({ length: 168 }, (_, hour) => ({
            timestamp: new Date(now - (167 - hour) * 3600000).toISOString(),
            binId: bin.id,
            binName: bin.name,
            stream: compartment.label,
            percent: Math.min(100, Math.max(0,
              Math.round(compartment.fill + 14 * Math.sin(hour / 9) + (hour % 6) - 3)
            ))
          }))
        )
      )
      setBrowserHistory(prev => [...prev, ...created])
      addLog(`Generated ${created.length} browser-only hourly readings. Download the CSV below; server History is unchanged.`, true)
      return
    }
    const list = targets()
    if (list.length === 0) return
    if (list.length > 1) {
      return runAll('week', list, 'demo-week', b => ({ triBinID: triBinNumber(b.id) }), '{n} bins got a week of demo readings → see them on the History page')
    }
    const one = list[0]
    run('week', 'demo-week', { triBinID: triBinNumber(one.id) }, res =>
      `${one.name} got a week of demo readings${res.readingsAdded ? ` (${res.readingsAdded})` : ''} → see them on the History page`)
  }

  function reset() {
    if (!confirmReset) return setConfirmReset(true)
    setConfirmReset(false)
    run('reset', 'reset', {}, res => `${res.message} → past readings stay in History`)
  }

  async function toggleTimer() {
    if (usingSampleData) {
      const starting = !timer?.running
      setTimer(starting ? {
        running: true,
        intervalSeconds: 5,
        simSpeed: 1,
        stopsAt: new Date(Date.now() + 30 * 60 * 1000).toISOString()
      } : { running: false, intervalSeconds: 5, simSpeed: 1, stopsAt: null })
      addLog(starting ? 'Browser sensor simulation started (local demo only)' : 'Browser sensor simulation stopped', true)
      return
    }
    const starting = !timer?.running
    setBusy('timer')
    try {
      const res = await apiRequest<TimerStatus>(`/api/simulate/${starting ? 'timer-start' : 'timer-stop'}`, 'POST', {})
      setTimer(res)
      addLog(starting
        ? `Live sensor simulation started → zoned bins report every ${res.intervalSeconds} seconds`
        : 'Live sensor simulation stopped', true)
      onChanged()
    } catch (err) {
      addLog(err instanceof Error ? err.message : 'Could not change the simulation.', false)
    } finally {
      setBusy(null)
    }
  }

  async function systemCheck() {
    if (usingSampleData) {
      const results = { browserDemoReady: true, binsAvailable: bins.length > 0 }
      setChecks(results)
      addLog('Browser-only system check complete. Java server, database and authentication were NOT tested.', results.binsAvailable)
      return
    }
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

  if (sorted.length === 0) {
    return (
      <div className="rounded-[28px] p-8 glass text-center">
        <p className="text-lg font-bold text-pine">No bins to test yet</p>
        <p className="text-sm text-pine-muted mt-1">Add a bin on the Manage bins tab first.</p>
      </div>
    )
  }

  const offlineNow = mode === 'one' && bin?.sensorStatus === 'offline'
  const onlineCount = sorted.filter(b => b.sensorStatus === 'online').length
  const fullestBin = sorted.reduce<ToolBin | null>((best, b) => {
    const f = Math.max(...b.compartments.map(c => c.fill))
    return !best || f > Math.max(...best.compartments.map(c => c.fill)) ? b : best
  }, null)

  return (
    <div className="space-y-5 md:space-y-6">
      {/* pick a bin + what it looks like right now */}
      <div className="rounded-[28px] p-5 md:p-6 glass">
        <div className="flex flex-col md:flex-row md:items-end gap-4">
          <label className="flex-1 min-w-0">
            <span className="block text-sm font-bold text-pine mb-1.5">Bin to test</span>
            <select
              value={mode === 'one' && bin ? bin.id : binId}
              onChange={e => setBinId(e.target.value)}
              className="w-full min-h-12 rounded-2xl bg-white/70 border border-pine/10 px-4 text-base font-semibold text-pine outline-none focus:border-teal/50 focus:ring-2 focus:ring-teal/20"
            >
              <option value={ALL}>All bins ({sorted.length})</option>
              <option value={RANDOM}>Random bin (a new one each press)</option>
              <optgroup label="One bin">
                {sorted.map(b => <option key={b.id} value={b.id}>{b.name} · {b.location}</option>)}
              </optgroup>
            </select>
          </label>
          {bin && (
            <span className={`self-start md:self-auto text-xs font-bold px-3 py-1.5 rounded-full ${bin.sensorStatus === 'offline' ? 'bg-offline-soft text-status-offline-ink' : 'bg-olive-soft text-olive-ink'}`}>
              {mode === 'random' ? `Last pick: ${bin.name} · ` : ''}{bin.sensorStatus === 'offline' ? 'Sensor offline' : 'Sensor online'} · {bin.lastUpdated}
            </span>
          )}
        </div>
        {mode === 'all' && (
          <p className="text-sm font-semibold text-pine-muted mt-4">
            Buttons below work on all {sorted.length} bins on your dashboard. {onlineCount} {onlineCount === 1 ? 'sensor is' : 'sensors are'} online
            {fullestBin ? `, and the fullest is ${fullestBin.name} at ${Math.max(...fullestBin.compartments.map(c => c.fill))}%` : ''}.
          </p>
        )}
        {mode === 'random' && !bin && (
          <p className="text-sm font-semibold text-pine-muted mt-4">Each button press picks a random bin, and its levels show up here.</p>
        )}
        {bin && <div className="grid grid-cols-3 gap-2 sm:gap-3 mt-4">
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
        </div>}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <ActionTile step="1" title="Set fill level" text="Simulate a sensor reading for one compartment.">
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
          <button onClick={fill} disabled={busy !== null} className={BUTTON}>{busy === 'fill' ? 'Sending…' : `Set ${stream.toLowerCase()} to ${percent}%`}</button>
        </ActionTile>

        <ActionTile step="2" title="Empty bin" text={usingSampleData ? 'Empty demo bins in this browser; no server pickup record is created.' : 'Simulate a collection. Every compartment drops to near empty, and the pickup is logged automatically.'}>
          <button onClick={empty} disabled={busy !== null} className={BUTTON}>{busy === 'empty' ? 'Sending…' : mode === 'all' ? 'Empty all bins' : 'Empty bin'}</button>
        </ActionTile>

        <ActionTile step="3" title="Take sensor offline" text={usingSampleData ? 'Mark a demo sensor offline in the browser. Server alerts remain untouched.' : 'Simulate a sensor that stops reporting. An offline alert is raised.'}>
          <button onClick={offline} disabled={busy !== null || offlineNow} className={BUTTON}>
            {busy === 'offline' ? 'Sending…' : offlineNow ? 'Sensor is offline' : mode === 'all' ? 'Take all sensors offline' : 'Take sensor offline'}
          </button>
          {offlineNow && <p className="text-xs font-semibold text-pine-muted mt-2 text-center">A new fill or empty reading brings it back online.</p>}
        </ActionTile>

        <ActionTile step="4" title="Add demo history" text={usingSampleData ? 'Generate 7 days of browser-only readings as a CSV; server History remains unchanged.' : 'Generate 7 days of hourly readings for the History chart and CSV export.'}>
          <button onClick={demoWeek} disabled={busy !== null} className={BUTTON}>{busy === 'week' ? 'Adding…' : mode === 'all' ? 'Add 7 days to every bin' : 'Add 7 days of readings'}</button>
          {usingSampleData && browserHistory.length > 0 && (
            <button onClick={downloadBrowserHistory} className="mt-2 w-full min-h-11 rounded-full bg-ivory text-pine text-sm font-bold">
              Download browser demo history CSV ({browserHistory.length} rows)
            </button>
          )}
        </ActionTile>

        <ActionTile
          step="5"
          title="Live sensor simulation"
           text={usingSampleData ? 'Simulate local browser sensor readings every 5 seconds for up to 30 minutes.' : `Every bin with a zone reports every ${timer?.intervalSeconds ?? 5} seconds at ${timer?.simSpeed ?? 60}× speed. Stops automatically after 30 minutes.`}
        >
          {timer?.running && (
            <p className="flex items-center justify-center gap-2 text-sm font-bold text-olive-ink mb-3">
              <span className="w-2 h-2 rounded-full bg-status-ok animate-pulse motion-reduce:animate-none" />
              Running{timer.stopsAt ? ` · stops at ${new Date(timer.stopsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}
            </p>
          )}
          <button onClick={toggleTimer} disabled={busy !== null} className={BUTTON}>
            {usingSampleData ? (timer?.running ? 'Stop browser simulation' : 'Start browser simulation') : busy === 'timer' ? 'Working…' : timer?.running ? 'Stop simulation' : 'Start simulation'}
          </button>
        </ActionTile>

        <ActionTile step="6" title="Reset demo" text={usingSampleData ? 'Restore original browser-demo bin values; server records remain unchanged.' : 'Restore every bin to its starting level and status. History is kept.'}>
          <button onClick={reset} disabled={busy !== null}
            className={confirmReset ? `${BUTTON.replace('bg-pine', 'bg-status-critical').replace('hover:bg-forest-light', 'hover:brightness-110')}` : BUTTON}
          >
            {busy === 'reset' ? 'Resetting…' : confirmReset ? 'Tap again to reset every bin' : 'Reset demo'}
          </button>
        </ActionTile>

        <ActionTile step="7" title="System check" text={usingSampleData ? 'Check browser-demo readiness only (does not test the backend or database).' : 'Verify the database, login, alerts, CSV export and sensor failure detection.'}>
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
          <button onClick={systemCheck} disabled={busy !== null} className={BUTTON}>{usingSampleData ? 'Run browser check' : busy === 'check' ? 'Checking…' : 'Run system check'}</button>
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
          <p className="text-sm text-pine-muted py-2">Results appear here. Browser-demo actions update bin displays locally, but do not create saved server history.</p>
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
