import { useEffect, useState } from 'react'
import { API_URL } from './api'

// pickup list: the bins to empty next, fullest first, and the pickups the sensors already saw.
// nobody taps "emptied": the server spots a pickup when a compartment that was at least half full
// suddenly reads almost empty (GET /api/pickups/detected), so it works for every device

type Stream = 'Landfill' | 'Recycling' | 'Compost'

// just what this page needs from a tribin, so it doesn't depend on App's types
export interface PickupBin {
  id: string
  name: string
  zone: string
  location: string
  compartments: { label: Stream; fill: number }[]
  sensorStatus: 'online' | 'offline'
}

// one pickup the server found in the readings
interface DetectedPickup {
  binId: string
  binName: string
  location: string
  zone: string
  time: string // local time from the server, no zone
  fullestPct: number
  compartments: { stream: string; fromPct: number; toPct: number }[]
}

const CRITICAL_AT = 80
const REFRESH_MS = 10000
const DAYS = 7

const STREAM_COLOR: Record<Stream, string> = { Landfill: '#4A4A42', Recycling: '#1B5B65', Compost: '#798F53' }

function fullestOf(bin: PickupBin) {
  return bin.compartments.reduce((a, b) => (b.fill > a.fill ? b : a), bin.compartments[0] ?? { label: 'Landfill' as Stream, fill: 0 })
}

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

// "today 2:41 PM" / "Mon 9:05 AM"
function fmtWhen(t: number) {
  const clock = new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return t >= startOfToday() ? `Today ${clock}` : `${new Date(t).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}, ${clock}`
}

function csvCell(v: string | number) {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const text = rows.map(r => r.map(csvCell).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function Icon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      <path d={d} />
    </svg>
  )
}
const CIRCLE_CHECK = 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0M9 12l2 2l4 -4'
const DOWNLOAD = 'M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2M7 11l5 5l5 -5M12 4l0 12'
const SENSOR = 'M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M14.8 9.2a4 4 0 0 1 0 5.6M17.6 6.4a8 8 0 0 1 0 11.2M9.2 14.8a4 4 0 0 1 0 -5.6M6.4 17.6a8 8 0 0 1 0 -11.2'

export default function PickupPage({ bins, zones, zoneFilter, onZoneFilter, threshold, onShowOnMap }: {
  bins: PickupBin[]
  zones: string[]
  zoneFilter: string // 'All' or a zone
  onZoneFilter: (zone: string) => void
  threshold: number
  onShowOnMap: (binId: string) => void
}) {
  const [pickups, setPickups] = useState<DetectedPickup[]>([])
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')

  // the server's pickups, refreshed every few seconds like the bins
  useEffect(() => {
    let active = true
    let busy = false
    async function load() {
      if (busy) return
      busy = true
      try {
        const res = await fetch(`${API_URL}/api/pickups/detected?days=${DAYS}`, { cache: 'no-store' })
        if (!res.ok) throw new Error('pickups request failed')
        const data: DetectedPickup[] = await res.json()
        if (active) {
          setPickups(data)
          setLoadState('ready')
        }
      } catch {
        if (active) setLoadState(prev => (prev === 'ready' ? 'ready' : 'error'))
      } finally {
        busy = false
      }
    }
    void load()
    const id = window.setInterval(() => { void load() }, REFRESH_MS)
    return () => { active = false; window.clearInterval(id) }
  }, [])

  const inZone = (zone: string) => zoneFilter === 'All' || zone === zoneFilter
  const visibleIds = new Set(bins.map(b => b.id))

  const toEmpty = bins
    .filter(b => b.sensorStatus === 'online' && inZone(b.zone) && fullestOf(b).fill >= threshold)
    .sort((a, b) => fullestOf(b).fill - fullestOf(a).fill)
  const offline = bins.filter(b => b.sensorStatus === 'offline' && inZone(b.zone)).length

  // only pickups for bins this person can see, in the picked zone
  const recent = pickups
    .filter(p => visibleIds.has(p.binId) && inZone(p.zone))
    .map(p => ({ ...p, at: new Date(p.time).getTime() }))
  const todayCount = recent.filter(p => p.at >= startOfToday()).length

  function exportPickups() {
    const day = new Date().toISOString().slice(0, 10)
    downloadCsv(`pickups-${day}.csv`, [
      ['Bin', 'Zone', 'Location', 'Time', 'Compartments emptied', 'Fullest before pickup (%)'],
      ...recent.map(p => [
        p.binName, p.zone, p.location, new Date(p.at).toLocaleString(),
        p.compartments.map(c => `${c.stream} ${c.fromPct}% to ${c.toPct}%`).join('; '),
        p.fullestPct,
      ]),
    ])
  }

  const chip = (label: string, value: string) => (
    <button
      key={value}
      onClick={() => onZoneFilter(value)}
      aria-pressed={zoneFilter === value}
      className={`px-4 min-h-10 rounded-full text-sm font-bold transition-colors ${zoneFilter === value ? 'bg-teal-soft text-teal border border-teal/30' : 'glass text-pine-muted hover:text-pine'}`}
    >
      {label}
    </button>
  )

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl lg:text-4xl font-bold text-pine tracking-tight">Pickup List</h1>
        </div>
        <button
          onClick={exportPickups}
          disabled={recent.length === 0}
          className="inline-flex items-center gap-1.5 glass rounded-full pl-3.5 pr-4 min-h-11 text-sm font-bold text-pine hover:bg-white/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title={`Download the last ${DAYS} days of pickups as a spreadsheet (CSV)`}
        >
          <Icon d={DOWNLOAD} size={16} />
          Export
        </button>
      </div>

      {zones.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Zone">
          {chip('All zones', 'All')}
          {zones.map(z => chip(z, z))}
        </div>
      )}

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-pine-muted px-1">
          To empty <span className="font-mono text-pine">{toEmpty.length}</span>
        </h2>
        {toEmpty.length === 0 ? (
          <div className="rounded-3xl glass tint-olive px-5 py-8 text-center">
            <span className="mx-auto mb-3 w-12 h-12 rounded-full bg-white/70 text-olive-ink flex items-center justify-center"><Icon d={CIRCLE_CHECK} size={24} /></span>
            <p className="text-lg font-bold text-pine">All clear</p>
            <p className="text-sm text-olive-ink mt-1">No bins are at {threshold}% or more right now.</p>
          </div>
        ) : (
          <ol className="space-y-3">
            {toEmpty.map((b, i) => {
              const top = fullestOf(b)
              const critical = top.fill >= CRITICAL_AT
              return (
                <li key={b.id} className="animate-page-in motion-reduce:animate-none">
                  <button onClick={() => onShowOnMap(b.id)} title="Show on map" className="w-full text-left glass rounded-3xl flex items-center gap-3 sm:gap-4 px-4 py-4 hover:bg-white/80 transition-colors">
                    <span className={`w-10 h-10 rounded-full shrink-0 flex items-center justify-center font-mono font-bold ${critical ? 'bg-critical-soft text-status-critical-ink' : 'bg-warn-soft text-status-warn-ink'}`}>{i + 1}</span>
                    <span className="flex-1 min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-[17px] font-bold text-pine">{b.name}</span>
                        <span className="text-[11px] font-bold bg-teal-soft text-teal rounded-full px-2.5 py-0.5">{b.zone}</span>
                      </span>
                      <span className="block text-sm text-pine-muted truncate mt-0.5">{b.location}</span>
                    </span>
                    <span className={`flex items-center gap-1.5 text-sm font-bold shrink-0 ${critical ? 'text-status-critical-ink' : 'text-status-warn-ink'}`}>
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: STREAM_COLOR[top.label] }} />
                      {top.label} {top.fill}%
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        )}
        {offline > 0 && (
          <p className="text-xs text-pine-muted px-1">{offline} offline {offline === 1 ? 'bin isn’t' : 'bins aren’t'} listed, since {offline === 1 ? 'its' : 'their'} last reading may be old.</p>
        )}
      </section>

      <section className="space-y-3">
        <div className="px-1">
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-pine-muted">
            Recent pickups <span className="font-mono text-pine">{recent.length}</span>
            {todayCount > 0 && <span className="normal-case tracking-normal font-semibold">· {todayCount} today</span>}
          </h2>
          <p className="flex items-center gap-1.5 text-xs text-pine-muted mt-1">
            <Icon d={SENSOR} size={14} />
            Logged automatically when a sensor sees a bin go from full to empty.
          </p>
        </div>
        {recent.length === 0 ? (
          <p className="glass rounded-3xl px-5 py-6 text-sm text-pine-muted text-center">
            {loadState === 'error'
              ? 'Can’t reach the server right now. Pickups will show up here once it’s back.'
              : loadState === 'loading' ? 'Loading pickups…' : `No pickups detected in the last ${DAYS} days.`}
          </p>
        ) : (
          <ul className="space-y-2.5">
            {recent.slice(0, 30).map(p => (
              <li key={`${p.binId}-${p.time}`} className="animate-page-in motion-reduce:animate-none glass tint-olive rounded-3xl flex items-center gap-3 sm:gap-4 px-4 py-3.5">
                <span className="text-status-ok"><Icon d={CIRCLE_CHECK} size={26} /></span>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-pine truncate">{p.binName}{p.location ? ` · ${p.location}` : ''}</p>
                  <p className="text-sm text-status-ok-ink">Emptied {fmtWhen(p.at)}{p.zone ? ` · ${p.zone}` : ''}</p>
                  <p className="text-xs text-pine-muted mt-0.5">
                    {p.compartments.map(c => `${c.stream} ${c.fromPct}% → ${c.toPct}%`).join(' · ')}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
