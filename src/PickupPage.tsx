// pickup list: the bins to empty next, fullest first. "emptied" records who did it and when
// (the client asked for that). records live in the browser for now, until the backend has a
// pickups endpoint that saves them for everyone

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

export interface PickupRecord {
  id: string
  binId: string
  binName: string
  zone: string
  location: string
  stream: Stream // the fullest compartment when it was emptied
  fill: number
  byId: string
  byName: string
  at: number // ms since epoch
}

const CRITICAL_AT = 80
// a bin just marked emptied stays off the to-empty list this long, so it doesn't pop straight
// back while the sensor catches up. after that, if it still reads full, it comes back
const HIDE_AFTER_EMPTIED_MS = 60 * 60 * 1000

const STREAM_COLOR: Record<Stream, string> = { Landfill: '#4A4A42', Recycling: '#1B5B65', Compost: '#798F53' }

function fullestOf(bin: PickupBin) {
  return bin.compartments.reduce((a, b) => (b.fill > a.fill ? b : a), bin.compartments[0] ?? { label: 'Landfill' as Stream, fill: 0 })
}

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function fmtClock(t: number) {
  return new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
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
const CHECK = 'M5 12l5 5l10 -10'
const CIRCLE_CHECK = 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0M9 12l2 2l4 -4'
const DOWNLOAD = 'M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2M7 11l5 5l5 -5M12 4l0 12'

export default function PickupPage({ bins, zones, zoneFilter, onZoneFilter, threshold, pickups, onEmptied, onUndo, onShowOnMap }: {
  bins: PickupBin[]
  zones: string[]
  zoneFilter: string // 'All' or a zone
  onZoneFilter: (zone: string) => void
  threshold: number
  pickups: PickupRecord[]
  onEmptied: (bin: PickupBin) => void
  onUndo: (recordId: string) => void
  onShowOnMap: (binId: string) => void
}) {
  const now = Date.now()
  const today = startOfToday()
  const inZone = (zone: string) => zoneFilter === 'All' || zone === zoneFilter

  const justEmptied = new Set(pickups.filter(p => now - p.at < HIDE_AFTER_EMPTIED_MS).map(p => p.binId))
  const toEmpty = bins
    .filter(b => b.sensorStatus === 'online' && inZone(b.zone) && fullestOf(b).fill >= threshold && !justEmptied.has(b.id))
    .sort((a, b) => fullestOf(b).fill - fullestOf(a).fill)
  const offline = bins.filter(b => b.sensorStatus === 'offline' && inZone(b.zone)).length
  const doneToday = pickups.filter(p => p.at >= today && inZone(p.zone)).sort((a, b) => b.at - a.at)

  function exportToday() {
    const day = new Date().toISOString().slice(0, 10)
    downloadCsv(`pickups-${day}.csv`, [
      ['Bin', 'Zone', 'Location', 'Fullest compartment', 'Fill when emptied (%)', 'Emptied by', 'Time'],
      ...doneToday.map(p => [p.binName, p.zone, p.location, p.stream, p.fill, p.byName, new Date(p.at).toLocaleString()]),
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
          onClick={exportToday}
          disabled={doneToday.length === 0}
          className="inline-flex items-center gap-1.5 glass rounded-full pl-3.5 pr-4 min-h-11 text-sm font-bold text-pine hover:bg-white/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Download today's pickups as a spreadsheet (CSV)"
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
                <li key={b.id} className="animate-page-in motion-reduce:animate-none glass rounded-3xl flex items-center gap-3 sm:gap-4 pl-4 pr-3 sm:pr-4 py-4">
                  <span className={`w-10 h-10 rounded-full shrink-0 flex items-center justify-center font-mono font-bold ${critical ? 'bg-critical-soft text-status-critical-ink' : 'bg-warn-soft text-status-warn-ink'}`}>{i + 1}</span>
                  <button onClick={() => onShowOnMap(b.id)} className="flex-1 min-w-0 text-left" title="Show on map">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[17px] font-bold text-pine">{b.name}</span>
                      <span className="text-[11px] font-bold bg-teal-soft text-teal rounded-full px-2.5 py-0.5">{b.zone}</span>
                    </span>
                    <span className="block text-sm text-pine-muted truncate mt-0.5">{b.location}</span>
                    <span className={`flex items-center gap-1.5 text-sm font-bold mt-1 ${critical ? 'text-status-critical-ink' : 'text-status-warn-ink'}`}>
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: STREAM_COLOR[top.label] }} />
                      {top.label} {top.fill}% full
                    </span>
                  </button>
                  <button
                    onClick={() => onEmptied(b)}
                    className="inline-flex items-center gap-1.5 bg-pine text-ivory rounded-full pl-3.5 pr-4 min-h-11 text-sm font-bold hover:bg-forest-light transition-colors shrink-0"
                  >
                    <Icon d={CHECK} size={16} />
                    Emptied
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
        <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-pine-muted px-1">
          Done today <span className="font-mono text-pine">{doneToday.length}</span>
        </h2>
        {doneToday.length === 0 ? (
          <p className="glass rounded-3xl px-5 py-6 text-sm text-pine-muted text-center">Nothing emptied yet today.</p>
        ) : (
          <ul className="space-y-2.5">
            {doneToday.map(p => {
              const bin = bins.find(b => b.id === p.binId)
              const reading = bin ? fullestOf(bin).fill : null
              const sensorLine = !bin || bin.sensorStatus === 'offline'
                ? 'Sensor offline, can’t confirm yet'
                : reading! >= threshold
                  ? `Sensor still reads ${reading}%, waiting for a new reading`
                  : `Sensor now reads ${reading}%`
              return (
                <li key={p.id} className="animate-page-in motion-reduce:animate-none glass tint-olive rounded-3xl flex items-center gap-3 sm:gap-4 px-4 py-3.5">
                  <span className="text-status-ok"><Icon d={CIRCLE_CHECK} size={26} /></span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-pine truncate">{p.binName} · {p.location}</p>
                    <p className="text-sm text-status-ok-ink">Emptied by {p.byName} at {fmtClock(p.at)}</p>
                    <p className="text-xs text-pine-muted mt-0.5">{sensorLine}</p>
                  </div>
                  <button onClick={() => onUndo(p.id)} className="text-sm font-bold text-pine-muted hover:text-pine min-h-11 px-2 -mr-1 transition-colors">Undo</button>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </>
  )
}
