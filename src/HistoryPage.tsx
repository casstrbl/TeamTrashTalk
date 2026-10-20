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
// status-ok / -warn / -critical as hex, for svg
const STATUS_HEX: Record<Status, string> = { ok: '#4E8B5F', warn: '#D4A13A', critical: '#B4463F' }

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

// chunky bars for the compartment tiles, newest on the right and brightest
const BAR_COUNT = 14

function MiniBars({ points, dark }: { points: Point[]; dark: boolean }) {
  const bars = downsample(points, BAR_COUNT)
  const empty = Math.max(0, BAR_COUNT - bars.length)
  return (
    <div className="flex items-end justify-between gap-[3px] h-14" aria-hidden="true">
      {Array.from({ length: empty }, (_, i) => (
        <span key={`e${i}`} className={`flex-1 max-w-2.5 h-1.5 rounded-full ${dark ? 'bg-white/10' : 'bg-stone-100'}`} />
      ))}
      {bars.map((p, i) => {
        const last = i === bars.length - 1
        return (
          <span
            key={i}
            className="flex-1 max-w-2.5 rounded-full transition-all duration-500"
            style={{
              height: `${Math.max(12, p.pct)}%`,
              backgroundColor: STATUS_HEX[statusOf(p.pct)],
              opacity: last ? 1 : dark ? 0.6 : 0.45,
            }}
          />
        )
      })}
    </div>
  )
}

const PAD = { l: 36, r: 18, t: 40, b: 30 }

function FillChart({ points, label, hoverT, onHover }: {
  points: Point[]
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
  const activeHex = STATUS_HEX[statusOf(active.pct)]

  // green below 50, yellow to 80, red above, blended a little at each cutoff
  const bandStops: [number, string][] = [
    [0, STATUS_HEX.critical],
    [(100 - CRITICAL_AT - 3) / 100, STATUS_HEX.critical],
    [(100 - CRITICAL_AT + 3) / 100, STATUS_HEX.warn],
    [(100 - WARN_AT - 3) / 100, STATUS_HEX.warn],
    [(100 - WARN_AT + 3) / 100, STATUS_HEX.ok],
    [1, STATUS_HEX.ok],
  ]

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
        {/* the line and fill take the status color of the height they're at */}
        <linearGradient id="history-line" gradientUnits="userSpaceOnUse" x1={0} x2={0} y1={y(100)} y2={y(0)}>
          {bandStops.map(([o, c], i) => <stop key={i} offset={o} stopColor={c} />)}
        </linearGradient>
        <linearGradient id="history-area" gradientUnits="userSpaceOnUse" x1={0} x2={0} y1={y(100)} y2={y(0)}>
          {bandStops.map(([o, c], i) => <stop key={i} offset={o} stopColor={c} stopOpacity={0.22 - o * 0.17} />)}
        </linearGradient>
        <linearGradient id="history-bar" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={activeHex} stopOpacity={0.6} />
          <stop offset="100%" stopColor={activeHex} stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* soft warning and critical zones behind everything */}
      <rect x={PAD.l} y={y(100)} width={INNER_W} height={y(CRITICAL_AT) - y(100)} rx={10} fill="#F2DAD6" fillOpacity={0.45} />
      <rect x={PAD.l} y={y(CRITICAL_AT)} width={INNER_W} height={y(WARN_AT) - y(CRITICAL_AT)} fill="#F3E3BF" fillOpacity={0.35} />
      <text x={PAD.l + 10} y={y(100) + 15} textAnchor="start" fontSize={10} fontWeight={600} fill="#8E332D" fillOpacity={0.7}>Critical</text>
      <text x={PAD.l + 10} y={y(CRITICAL_AT) + 15} textAnchor="start" fontSize={10} fontWeight={600} fill="#7A5A12" fillOpacity={0.7}>Warning</text>

      {/* percent labels */}
      {[0, 25, 50, 75, 100].map(g => (
        <text key={g} x={PAD.l - 10} y={y(g) + 4} textAnchor="end" fontSize={11} fill="#5B6B60">{g}</text>
      ))}

      {area && <path d={area} fill="url(#history-area)" />}

      {/* soft bar dropping from the marked reading */}
      <rect x={ax - 7} y={ay} width={14} height={Math.max(0, bottom - ay)} rx={7} fill="url(#history-bar)" />

      <path d={line} fill="none" stroke="url(#history-line)" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />

      <circle cx={ax} cy={ay} r={13} fill={activeHex} fillOpacity={0.18} />
      <circle cx={ax} cy={ay} r={6.5} fill="white" stroke={activeHex} strokeWidth={3} />

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
  const [binId, setBinId] = useState<string>(bins[0]?.id ?? '')
  const [stream, setStream] = useState<Stream>('Landfill')
  const [range, setRange] = useState<RangeKey>('10m')
  const [series, setSeries] = useState<Record<Stream, Point[]> | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [hoverT, setHoverT] = useState<number | null>(null)

  // if the picked bin isn't in the list any more (zone change), fall back to the first
  const bin = bins.find(b => b.id === binId) ?? bins[0]
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

  if (bins.length === 0 || !bin) {
    return (
      <>
        <h1 className="text-3xl lg:text-4xl font-semibold text-pine">History</h1>
        <Message title="No bins to show" text="Once you have a zone with bins, their fill history will show up here." />
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
      {/* title and bin picker */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl lg:text-4xl font-semibold text-pine">History</h1>
          {!sampleData && (
            <p className="flex items-center gap-1.5 text-xs text-pine-muted mt-1">
              <span className={`w-1.5 h-1.5 rounded-full ${status === 'error' ? 'bg-status-critical' : 'bg-status-ok'}`} />
              {status === 'error' ? 'Can’t reach the backend, showing the last readings we had' : `Live, updates every ${REFRESH_MS / 1000} seconds`}
            </p>
          )}
        </div>
        <label className="flex items-center gap-2 bg-white rounded-full pl-4 pr-3 min-h-11 text-sm">
          <span className="text-pine-muted">Bin</span>
          <select
            value={bin.id}
            onChange={e => { setBinId(e.target.value); setHoverT(null) }}
            className="bg-transparent font-semibold text-pine outline-none cursor-pointer"
          >
            {bins.map(b => (
              <option key={b.id} value={b.id}>{b.name} · {b.zone}</option>
            ))}
          </select>
        </label>
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
                  <div className="my-3 sm:my-4">
                    <MiniBars points={pts} dark={picked} />
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
                  <FillChart points={drawn} label={shown} hoverT={hoverT} onHover={setHoverT} />
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
