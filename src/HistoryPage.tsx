import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent } from 'react'

// history page: fill levels over time for one tribin, from /api/tribins/{id}/history.
// kept in its own file so App.tsx only needs an import and one line

const BIN_HEIGHT_CM = 77 // same as Bin.BIN_HEIGHT in the backend, readings come back in cm
const WARN_AT = 50
const CRITICAL_AT = 80
const REFRESH_MS = 5000 // matches the dashboard refresh
const MAX_DRAWN = 160 // most points drawn per line, longer ranges get averaged down

type Stream = 'Landfill' | 'Recycling' | 'Compost'
type Status = 'ok' | 'warn' | 'critical'
const STREAMS: Stream[] = ['Landfill', 'Recycling', 'Compost']

// same colors as the compartment bars on the other pages
const STREAM_COLOR: Record<Stream, string> = {
  Landfill: '#4A4A42',
  Recycling: '#1B5B65',
  Compost: '#798F53',
}

// ranges count back from the newest reading, so older demo data still shows
const RANGES = [
  { key: '10m', label: '10 min', ms: 10 * 60 * 1000 },
  { key: '1h', label: '1 hour', ms: 60 * 60 * 1000 },
  { key: '24h', label: '24 hours', ms: 24 * 60 * 60 * 1000 },
  { key: 'all', label: 'All', ms: Infinity },
] as const
type RangeKey = (typeof RANGES)[number]['key']

const STATUS_PILL: Record<Status, string> = {
  ok: 'bg-status-ok/15 text-status-ok-ink',
  warn: 'bg-status-warn/20 text-status-warn-ink',
  critical: 'bg-status-critical/15 text-status-critical-ink',
}
const STATUS_DOT: Record<Status, string> = {
  ok: 'bg-status-ok',
  warn: 'bg-status-warn',
  critical: 'bg-status-critical',
}
const STATUS_LABEL: Record<Status, string> = { ok: 'Good', warn: 'Warning', critical: 'Critical' }

// one row from the history endpoint
interface ApiReading {
  binID: number
  sensorID: number
  value: number
  unit: string
  timestamp: string
}

interface Point {
  t: number // ms since epoch
  pct: number // 0-100
  cm: number
}

// just what this page needs from a tribin, so it doesn't depend on App's types
interface HistoryBin {
  id: string
  name: string
  zone: string
  location: string
  compartments: { label: Stream; fill: number }[]
  sensorStatus: 'online' | 'offline'
}

type Group = Status | 'offline'

// groups on the overview, most urgent first
const GROUPS: { key: Group; title: string }[] = [
  { key: 'critical', title: 'Needs pickup' },
  { key: 'warn', title: 'Getting full' },
  { key: 'offline', title: 'Offline' },
  { key: 'ok', title: 'All good' },
]

const GROUP_DOT: Record<Group, string> = { ...STATUS_DOT, offline: 'bg-status-offline' }

function fullest(bin: HistoryBin) {
  return Math.max(0, ...bin.compartments.map(c => c.fill))
}

// same rule as the dashboard: the fullest compartment decides, offline wins
function groupOf(bin: HistoryBin): Group {
  return bin.sensorStatus === 'offline' ? 'offline' : statusOf(fullest(bin))
}

// bin ids end in 01 / 02 / 03 for landfill / recycling / compost
function streamOf(binID: number): Stream | null {
  return STREAMS[(binID % 100) - 1] ?? null
}

// the backend sends nanoseconds, the browser only wants milliseconds
function parseTime(timestamp: string) {
  return new Date(timestamp.replace(/(\.\d{3})\d+/, '$1')).getTime()
}

function toSeries(readings: ApiReading[]): Record<Stream, Point[]> {
  const out: Record<Stream, Point[]> = { Landfill: [], Recycling: [], Compost: [] }
  for (const r of readings) {
    const stream = streamOf(r.binID)
    const t = parseTime(r.timestamp)
    if (!stream || Number.isNaN(t)) continue
    const pct = Math.min(100, Math.max(0, (r.value / BIN_HEIGHT_CM) * 100))
    out[stream].push({ t, pct, cm: r.value })
  }
  for (const s of STREAMS) out[s].sort((a, b) => a.t - b.t)
  return out
}

function statusOf(fill: number): Status {
  if (fill >= CRITICAL_AT) return 'critical'
  if (fill >= WARN_AT) return 'warn'
  return 'ok'
}

// averages neighbors together so a long range stays smooth and fast to draw
function downsample(points: Point[], max: number): Point[] {
  if (points.length <= max) return points
  const size = Math.ceil(points.length / max)
  const out: Point[] = []
  for (let i = 0; i < points.length; i += size) {
    const chunk = points.slice(i, i + size)
    const avg = (f: (p: Point) => number) => chunk.reduce((s, p) => s + f(p), 0) / chunk.length
    out.push({ t: avg(p => p.t), pct: avg(p => p.pct), cm: avg(p => p.cm) })
  }
  out[out.length - 1] = points[points.length - 1] // the newest reading stays exact
  return out
}

// smooth line through the points that never bends past them (monotone cubic)
function smoothPath(xy: [number, number][]) {
  const n = xy.length
  if (n === 0) return ''
  if (n === 1) return `M${xy[0][0]},${xy[0][1]}`
  const dx: number[] = []
  const slope: number[] = []
  for (let i = 0; i < n - 1; i++) {
    dx.push(xy[i + 1][0] - xy[i][0])
    slope.push(dx[i] === 0 ? 0 : (xy[i + 1][1] - xy[i][1]) / dx[i])
  }
  const tan: number[] = [slope[0]]
  for (let i = 1; i < n - 1; i++) tan.push(slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2)
  tan.push(slope[n - 2])
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      tan[i] = 0
      tan[i + 1] = 0
      continue
    }
    const a = tan[i] / slope[i]
    const b = tan[i + 1] / slope[i]
    const h = a * a + b * b
    if (h > 9) {
      const k = 3 / Math.sqrt(h)
      tan[i] = k * a * slope[i]
      tan[i + 1] = k * b * slope[i]
    }
  }
  let d = `M${xy[0][0].toFixed(1)},${xy[0][1].toFixed(1)}`
  for (let i = 0; i < n - 1; i++) {
    const third = dx[i] / 3
    const c1x = xy[i][0] + third
    const c1y = xy[i][1] + tan[i] * third
    const c2x = xy[i + 1][0] - third
    const c2y = xy[i + 1][1] - tan[i + 1] * third
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${xy[i + 1][0].toFixed(1)},${xy[i + 1][1].toFixed(1)}`
  }
  return d
}

function fmtTime(t: number, span: number) {
  const d = new Date(t)
  if (span > 24 * 60 * 60 * 1000) return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  const opts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' }
  if (span <= 10 * 60 * 1000) opts.second = '2-digit'
  return d.toLocaleTimeString([], opts)
}

// the reading closest in time to t
function nearest(points: Point[], t: number): Point | undefined {
  let best: Point | undefined
  for (const p of points) {
    if (!best || Math.abs(p.t - t) < Math.abs(best.t - t)) best = p
  }
  return best
}

const TILE = 'rounded-3xl p-5 desk:p-6 bg-white'

function Message({ title, text }: { title: string; text: string }) {
  return (
    <div className={`${TILE} py-16 text-center`}>
      <p className="text-lg font-semibold text-pine">{title}</p>
      <p className="text-sm text-pine-muted mt-1 max-w-md mx-auto">{text}</p>
    </div>
  )
}

// tiny line for the compartment tiles
function Sparkline({ points, color }: { points: Point[]; color: string }) {
  const w = 120
  const h = 36
  if (points.length < 2) return <div className="h-9" />
  const t0 = points[0].t
  const span = points[points.length - 1].t - t0 || 1
  // scaled to its own low and high (at least 10 points apart) so small changes still show
  const lo = Math.min(...points.map(p => p.pct))
  const hi = Math.max(lo + 10, ...points.map(p => p.pct))
  const xy = downsample(points, 40).map((p): [number, number] => [(p.t - t0) / span * w, 3 + (1 - (p.pct - lo) / (hi - lo)) * (h - 6)])
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-9" aria-hidden="true">
      <path d={smoothPath(xy)} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

// campus average per compartment, from the bins that are online
function Overview({ bins }: { bins: HistoryBin[] }) {
  const online = bins.filter(b => b.sensorStatus === 'online')
  return (
    <div className="grid grid-cols-3 gap-3 desk:gap-4">
      {STREAMS.map(s => {
        const fills = online.map(b => b.compartments.find(c => c.label === s)?.fill).filter((f): f is number => f !== undefined)
        const avg = fills.length ? Math.round(fills.reduce((a, b) => a + b, 0) / fills.length) : null
        const full = fills.filter(f => f >= CRITICAL_AT).length
        return (
          <div key={s} className="rounded-3xl p-3 sm:p-5 bg-white">
            <span className="flex items-center gap-1.5 text-xs sm:text-sm font-medium text-pine">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: STREAM_COLOR[s] }} />
              {s}
            </span>
            <p className="flex items-baseline gap-1 mt-2 sm:mt-3">
              <span className="text-2xl sm:text-4xl font-semibold text-pine tabular-nums">{avg ?? '–'}</span>
              <span className="text-xs text-pine-muted">% avg</span>
            </p>
            <div className="h-1.5 rounded-full bg-ivory mt-2 sm:mt-3 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${avg ?? 0}%`, backgroundColor: STREAM_COLOR[s] }} />
            </div>
            <p className={`text-[11px] sm:text-xs mt-2 ${full ? 'text-status-critical-ink font-semibold' : 'text-pine-muted'}`}>
              {full ? `${full} full` : 'None full'}
            </p>
          </div>
        )
      })}
    </div>
  )
}

// three little fill bars, one per compartment
function MiniBars({ bin }: { bin: HistoryBin }) {
  const offline = bin.sensorStatus === 'offline'
  return (
    <div className="flex items-end gap-2.5 shrink-0">
      {STREAMS.map(s => {
        const fill = bin.compartments.find(c => c.label === s)?.fill ?? 0
        return (
          <div key={s} className="flex flex-col items-center gap-1" title={`${s} ${Math.round(fill)}%`}>
            <div className="w-2 h-8 rounded-full bg-ivory overflow-hidden flex items-end">
              <div className={`w-full rounded-full ${offline ? 'bg-status-offline' : STATUS_DOT[statusOf(fill)]}`} style={{ height: `${Math.min(100, fill)}%` }} />
            </div>
            <span className="text-[10px] text-pine-muted tabular-nums leading-none">{Math.round(fill)}</span>
          </div>
        )
      })}
    </div>
  )
}

// every bin, sorted into status groups, tap one to see its history
function BinGroups({ bins, onPick }: { bins: HistoryBin[]; onPick: (id: string) => void }) {
  return (
    <div className="grid gap-5 desk:gap-6">
      {GROUPS.map(g => {
        const list = bins.filter(b => groupOf(b) === g.key).sort((a, b) => fullest(b) - fullest(a))
        if (list.length === 0) return null
        return (
          <section key={g.key}>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-pine mb-2 px-1">
              <span className={`w-2 h-2 rounded-full ${GROUP_DOT[g.key]}`} />
              {g.title}
              <span className="text-pine-muted font-normal">{list.length}</span>
            </h2>
            <div className="grid gap-2 md:grid-cols-2">
              {list.map(b => (
                <button
                  key={b.id}
                  onClick={() => onPick(b.id)}
                  className="flex items-center justify-between gap-3 bg-white rounded-2xl pl-4 pr-3 py-3 text-left hover:bg-white/70 transition-colors"
                >
                  <span className="min-w-0">
                    <span className="block font-semibold text-pine truncate">{b.name}</span>
                    <span className="block text-xs text-pine-muted truncate">{b.location} · {b.zone}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <MiniBars bin={b} />
                    <svg viewBox="0 0 24 24" className="w-4 h-4 text-pine-muted" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

const PAD = { l: 36, r: 18, t: 40, b: 30 }

function FillChart({ points, color, label, hoverT, onHover }: {
  points: Point[]
  color: string
  label: string
  hoverT: number | null
  onHover: (t: number | null) => void
}) {
  // drawn at the tile's real width, so labels stay the same size on a phone and a desktop
  const boxRef = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(640)
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => setW(Math.max(260, Math.round(entries[0].contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const H = W < 480 ? 220 : 250
  const INNER_W = W - PAD.l - PAD.r
  const INNER_H = H - PAD.t - PAD.b

  const tMin = points[0].t
  const tMax = points[points.length - 1].t
  const span = tMax - tMin
  const x = (t: number) => PAD.l + (span === 0 ? INNER_W / 2 : ((t - tMin) / span) * INNER_W)
  const y = (pct: number) => PAD.t + (1 - pct / 100) * INNER_H
  const bottom = PAD.t + INNER_H

  const xy = points.map((p): [number, number] => [x(p.t), y(p.pct)])
  const line = smoothPath(xy)
  const area = xy.length > 1 ? `${line} L${xy[xy.length - 1][0].toFixed(1)},${bottom} L${xy[0][0].toFixed(1)},${bottom} Z` : ''

  // the marked reading: under the pointer, otherwise the newest one
  const active = (hoverT === null ? points[points.length - 1] : nearest(points, hoverT))!
  const ax = x(active.t)
  const ay = y(active.pct)
  const pillText = `${Math.round(active.pct)}%`
  const pillW = 14 + pillText.length * 8
  const pillX = Math.min(W - PAD.r - pillW, Math.max(PAD.l, ax - pillW / 2))

  // fewer time labels on narrow screens so they don't run together
  const fracs = W < 480 ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1]
  const ticks = span === 0 ? [tMin] : fracs.map(f => tMin + f * span)
  const activeTick = nearest(ticks.map(t => ({ t, pct: 0, cm: 0 })), active.t)?.t

  function onMove(e: PointerEvent<SVGSVGElement>) {
    if (span === 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const vx = ((e.clientX - rect.left) / rect.width) * W
    const frac = Math.min(1, Math.max(0, (vx - PAD.l) / INNER_W))
    onHover(tMin + frac * span)
  }

  return (
    <div ref={boxRef}>
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      className="block h-auto touch-pan-y select-none"
      role="img"
      aria-label={`${label} fill level over time, from ${Math.round(points[0].pct)}% to ${Math.round(points[points.length - 1].pct)}%. The list of latest readings has the exact values.`}
      onPointerMove={onMove}
      onPointerLeave={() => onHover(null)}
    >
      <defs>
        <linearGradient id="history-area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.16} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
        <linearGradient id="history-bar" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.55} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* percent labels, no gridlines, like the reference */}
      {[0, 25, 50, 75, 100].map(g => (
        <text key={g} x={PAD.l - 10} y={y(g) + 4} textAnchor="end" fontSize={11} fill="#5B6B60">{g}</text>
      ))}

      {/* warning and critical levels, same cutoffs as the status colors */}
      <line x1={PAD.l} x2={W - PAD.r} y1={y(WARN_AT)} y2={y(WARN_AT)} stroke="#D4A13A" strokeOpacity={0.6} strokeWidth={1} strokeDasharray="3 5" />
      <line x1={PAD.l} x2={W - PAD.r} y1={y(CRITICAL_AT)} y2={y(CRITICAL_AT)} stroke="#B4463F" strokeOpacity={0.6} strokeWidth={1} strokeDasharray="3 5" />

      {area && <path d={area} fill="url(#history-area)" />}

      {/* soft bar dropping from the marked reading */}
      <rect x={ax - 6} y={ay} width={12} height={Math.max(0, bottom - ay)} rx={6} fill="url(#history-bar)" />

      <path d={line} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

      <circle cx={ax} cy={ay} r={6} fill="white" stroke={color} strokeWidth={2.5} />

      {/* value pill above the marked reading */}
      <rect x={pillX} y={ay - 36} width={pillW} height={24} rx={12} fill="#0F2E23" />
      <text x={pillX + pillW / 2} y={ay - 20} textAnchor="middle" fontSize={12} fontWeight={600} fill="#F4F1DE">{pillText}</text>

      {/* time labels, the one nearest the marked reading is darker */}
      {ticks.map((t, i) => (
        <text
          key={i}
          x={x(t)}
          y={H - 8}
          textAnchor={ticks.length === 1 ? 'middle' : i === 0 ? 'start' : i === ticks.length - 1 ? 'end' : 'middle'}
          fontSize={11}
          fontWeight={t === activeTick ? 600 : 400}
          fill={t === activeTick ? '#0F2E23' : '#5B6B60'}
        >
          {fmtTime(t, span)}
        </text>
      ))}
    </svg>
    </div>
  )
}

export default function HistoryPage({ bins, sampleData }: { bins: HistoryBin[]; sampleData: boolean }) {
  const [binId, setBinId] = useState<string | null>(null) // null = the overview
  const [stream, setStream] = useState<Stream>('Landfill')
  const [range, setRange] = useState<RangeKey>('10m')
  const [series, setSeries] = useState<Record<Stream, Point[]> | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [hoverT, setHoverT] = useState<number | null>(null)

  // if the picked bin isn't in the list any more (zone change), go back to the overview
  const bin = bins.find(b => b.id === binId)
  const activeId = bin?.id

  useEffect(() => {
    if (!activeId || sampleData) return
    const apiUrl = import.meta.env.VITE_API_URL ?? ''
    let active = true
    let busy = false
    setSeries(null)
    setStatus('loading')

    async function load() {
      if (busy) return
      busy = true
      try {
        const res = await fetch(`${apiUrl}/api/tribins/${activeId}/history`, { cache: 'no-store' })
        if (!res.ok) throw new Error('history request failed')
        const data: ApiReading[] = await res.json()
        if (active) {
          setSeries(toSeries(data))
          setStatus('ready')
        }
      } catch {
        // keep whatever we already had, just flag it
        if (active) setStatus('error')
      } finally {
        busy = false
      }
    }

    void load()
    const timer = window.setInterval(() => { void load() }, REFRESH_MS)
    return () => { active = false; window.clearInterval(timer) }
  }, [activeId, sampleData])

  // every compartment cut down to the picked range
  const windowed = useMemo(() => {
    const out: Record<Stream, Point[]> = { Landfill: [], Recycling: [], Compost: [] }
    if (!series) return out
    const newest = Math.max(...STREAMS.map(s => series[s][series[s].length - 1]?.t ?? -Infinity))
    const ms = RANGES.find(r => r.key === range)!.ms
    for (const s of STREAMS) out[s] = series[s].filter(p => newest - p.t <= ms)
    return out
  }, [series, range])

  const hasData = STREAMS.some(s => windowed[s].length > 0)
  // if the picked compartment has nothing, show one that does
  const shown: Stream = windowed[stream].length > 0 ? stream : STREAMS.find(s => windowed[s].length > 0) ?? stream
  const points = windowed[shown]
  const drawn = useMemo(() => downsample(points, MAX_DRAWN), [points])

  if (bins.length === 0) {
    return (
      <>
        <h1 className="text-3xl lg:text-4xl font-semibold text-pine">History</h1>
        <Message title="No bins to show" text="Once you have a zone with bins, their fill history will show up here." />
      </>
    )
  }

  function openBin(id: string) {
    setBinId(id)
    setHoverT(null)
    window.scrollTo({ top: 0 })
  }

  if (!bin) {
    return (
      <>
        <h1 className="text-3xl lg:text-4xl font-semibold text-pine">History</h1>
        <Overview bins={bins} />
        <BinGroups bins={bins} onPick={openBin} />
      </>
    )
  }

  const latest = points[points.length - 1]
  const active = hoverT === null || points.length === 0 ? latest : nearest(points, hoverT)
  const pcts = points.map(p => p.pct)
  const stats = points.length
    ? [
        { label: 'Average', value: pcts.reduce((s, v) => s + v, 0) / pcts.length },
        { label: 'Lowest', value: Math.min(...pcts) },
        { label: 'Highest', value: Math.max(...pcts) },
      ]
    : []
  const recent = [...points].reverse().slice(0, 8)
  const span = points.length ? points[points.length - 1].t - points[0].t : 0

  function pickStream(s: Stream) {
    setStream(s)
    setHoverT(null)
  }

  return (
    <>
      {/* back to the overview, then the bin's name */}
      <div>
        <button
          onClick={() => { setBinId(null); setHoverT(null) }}
          className="inline-flex items-center gap-1 bg-white rounded-full pl-2.5 pr-4 min-h-10 text-sm font-medium text-pine hover:bg-white/70 transition-colors"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
          All bins
        </button>
        <h1 className="text-3xl lg:text-4xl font-semibold text-pine mt-3">{bin.name}</h1>
        <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-pine-muted mt-1">
          <span>{bin.location} · {bin.zone}</span>
          {!sampleData && (
            <>
              <span aria-hidden="true">·</span>
              <span className={`w-1.5 h-1.5 rounded-full ${status === 'error' ? 'bg-status-critical' : 'bg-status-ok'}`} />
              <span>{status === 'error' ? 'Can’t reach the backend, showing the last readings we had' : `Live, updates every ${REFRESH_MS / 1000} seconds`}</span>
            </>
          )}
        </p>
      </div>

      {sampleData ? (
        <Message
          title="No history for sample data"
          text="Sample bins don't have saved readings. Switch to a user with live data to see real history."
        />
      ) : status === 'loading' ? (
        <Message title="Loading history" text="Getting the saved readings for this bin." />
      ) : !hasData ? (
        <Message
          title={status === 'error' ? 'Can’t load history' : 'No readings saved yet'}
          text={
            status === 'error'
              ? 'Make sure the backend is running on port 8080, then this page will fill in by itself.'
              : 'Readings show up here as the sensors send them. For the demo, start the backend with the fake sensor timer on.'
          }
        />
      ) : (
        <>
          {/* one tile per compartment, the picked one is dark */}
          <div className="grid grid-cols-3 gap-3 desk:gap-4">
            {STREAMS.map(s => {
              const pts = windowed[s]
              const now = pts[pts.length - 1]
              const picked = s === shown
              return (
                <button
                  key={s}
                  onClick={() => pickStream(s)}
                  aria-pressed={picked}
                  disabled={pts.length === 0}
                  className={`rounded-3xl p-3 sm:p-4 text-left transition-colors disabled:opacity-50 ${picked ? 'bg-pine text-ivory' : 'bg-white text-pine hover:bg-white/70'}`}
                >
                  <span className="flex items-center gap-1.5 text-xs sm:text-sm font-medium">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: picked ? '#F4F1DE' : STREAM_COLOR[s] }} />
                    {s}
                  </span>
                  <div className="my-2 sm:my-3">
                    <Sparkline points={pts} color={picked ? '#B9C4B4' : STREAM_COLOR[s]} />
                  </div>
                  <span className="flex items-baseline gap-1">
                    <span className="text-2xl sm:text-3xl font-semibold tabular-nums">{now ? Math.round(now.pct) : '–'}</span>
                    <span className={`text-xs ${picked ? 'text-mist' : 'text-pine-muted'}`}>%</span>
                  </span>
                </button>
              )
            })}
          </div>

          <div className="grid gap-5 desk:gap-6 lg:grid-cols-3">
            {/* main chart */}
            <div className={`${TILE} lg:col-span-2`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-pine-muted">{shown} fill</p>
                  <p className="flex items-baseline gap-1.5 mt-0.5">
                    <span className="text-5xl font-semibold text-pine tabular-nums">{active ? Math.round(active.pct) : '–'}</span>
                    <span className="text-sm text-pine-muted">% full</span>
                  </p>
                  <p className="text-xs text-pine-muted mt-1">
                    {active ? (hoverT === null ? `Latest, ${fmtTime(active.t, 0)}` : fmtTime(active.t, 0)) : ''}
                  </p>
                </div>
                {active && (
                  <span className={`inline-flex items-center gap-1.5 rounded-full pl-2.5 pr-3 py-1 text-xs font-semibold ${STATUS_PILL[statusOf(active.pct)]}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[statusOf(active.pct)]}`} />
                    {STATUS_LABEL[statusOf(active.pct)]}
                  </span>
                )}
              </div>

              <div className="mt-2 -mx-1">
                {drawn.length > 0 && (
                  <FillChart points={drawn} color={STREAM_COLOR[shown]} label={shown} hoverT={hoverT} onHover={setHoverT} />
                )}
              </div>

              {/* average, lowest, highest for the range */}
              <div className="grid grid-cols-3 divide-x divide-stone-200 border-t border-stone-100 mt-3 pt-4 text-center">
                {stats.map(s => (
                  <div key={s.label}>
                    <p className="text-xs text-pine-muted">{s.label}</p>
                    <p className="text-2xl font-semibold text-pine tabular-nums mt-0.5">{Math.round(s.value)}<span className="text-xs font-normal text-pine-muted ml-0.5">%</span></p>
                  </div>
                ))}
              </div>

              {/* time range */}
              <div className="flex justify-center mt-5">
                <div className="inline-flex flex-wrap justify-center bg-ivory rounded-full p-1" role="group" aria-label="Time range">
                  {RANGES.map(r => (
                    <button
                      key={r.key}
                      onClick={() => { setRange(r.key); setHoverT(null) }}
                      aria-pressed={range === r.key}
                      className={`px-4 min-h-10 rounded-full text-sm font-medium transition-colors ${range === r.key ? 'bg-pine text-ivory' : 'text-pine-muted hover:text-pine'}`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* newest readings, also the text version of the chart */}
            <div className={TILE}>
              <div className="flex items-baseline justify-between mb-2">
                <h2 className="text-lg font-semibold text-pine">Latest readings</h2>
                <span className="text-xs text-pine-muted">{shown}</span>
              </div>
              <ul>
                {recent.map((p, i) => (
                  <li key={`${p.t}-${i}`} className="flex items-center justify-between gap-3 py-2.5 border-t border-stone-100 first:border-t-0">
                    <span className="flex items-center gap-2.5 min-w-0">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[statusOf(p.pct)]}`} />
                      <span className="text-sm text-pine tabular-nums">{fmtTime(p.t, span)}</span>
                    </span>
                    <span className="text-right">
                      <span className="text-sm font-semibold text-pine tabular-nums">{Math.round(p.pct)}%</span>
                      <span className="block text-[11px] text-pine-muted tabular-nums">{p.cm.toFixed(1)} cm</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </>
  )
}
