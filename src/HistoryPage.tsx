import { useEffect, useMemo, useState } from 'react'
import type { PointerEvent } from 'react'

// history page: fill levels over time for one tribin, from /api/tribins/{id}/history.
// kept in its own file so App.tsx only needs an import and one line

const BIN_HEIGHT_CM = 77 // same as Bin.BIN_HEIGHT in the backend, readings come back in cm
const WARN_AT = 50
const CRITICAL_AT = 80
const MAX_POINTS = 120 // newest readings kept per compartment
const REFRESH_MS = 5000 // matches the dashboard refresh

type Stream = 'Landfill' | 'Recycling' | 'Compost'
const STREAMS: Stream[] = ['Landfill', 'Recycling', 'Compost']

// same colors as the compartment bars on the other pages
const STREAM_COLOR: Record<Stream, string> = {
  Landfill: '#4A4A42',
  Recycling: '#1B5B65',
  Compost: '#798F53',
}

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
  stream: Stream
}

// just what this page needs from a tribin, so it doesn't depend on App's types
interface HistoryBin {
  id: string
  name: string
  zone: string
  sensorStatus: string
}

// bin ids end in 01 / 02 / 03 for landfill / recycling / compost
function streamOf(binID: number): Stream | null {
  return STREAMS[(binID % 100) - 1] ?? null
}

// the backend sends nanoseconds, the browser only wants milliseconds
function parseTime(timestamp: string) {
  return new Date(timestamp.replace(/(\.\d{3})\d+/, '$1')).getTime()
}

function toPoints(readings: ApiReading[]): Point[] {
  const out: Point[] = []
  for (const r of readings) {
    const stream = streamOf(r.binID)
    const t = parseTime(r.timestamp)
    if (!stream || Number.isNaN(t)) continue
    const pct = Math.min(100, Math.max(0, (r.value / BIN_HEIGHT_CM) * 100))
    out.push({ t, pct, cm: r.value, stream })
  }
  out.sort((a, b) => a.t - b.t)
  // only the newest few per compartment, the endpoint sends everything it has saved
  const kept: Point[] = []
  for (const stream of STREAMS) {
    kept.push(...out.filter(p => p.stream === stream).slice(-MAX_POINTS))
  }
  return kept.sort((a, b) => a.t - b.t)
}

function fillHex(fill: number) {
  if (fill >= CRITICAL_AT) return '#B4463F'
  if (fill >= WARN_AT) return '#D4A13A'
  return '#4E8B5F'
}

function fmtTime(t: number, withDate: boolean) {
  const d = new Date(t)
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })
  return withDate ? `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}` : time
}

// the point in this compartment closest in time to t
function nearest(points: Point[], t: number): Point | undefined {
  let best: Point | undefined
  for (const p of points) {
    if (!best || Math.abs(p.t - t) < Math.abs(best.t - t)) best = p
  }
  return best
}

// chart size (viewBox units, the svg scales to its tile)
const W = 640
const H = 260
const PAD = { l: 38, r: 14, t: 12, b: 28 }
const INNER_W = W - PAD.l - PAD.r
const INNER_H = H - PAD.t - PAD.b

const TILE = 'rounded-3xl p-5 desk:p-6 bg-white'

function Message({ title, text }: { title: string; text: string }) {
  return (
    <div className={`${TILE} py-16 text-center`}>
      <p className="text-lg font-semibold text-pine">{title}</p>
      <p className="text-sm text-pine-muted mt-1 max-w-md mx-auto">{text}</p>
    </div>
  )
}

export default function HistoryPage({ bins, sampleData }: { bins: HistoryBin[]; sampleData: boolean }) {
  const [binId, setBinId] = useState<string>(bins[0]?.id ?? '')
  const [points, setPoints] = useState<Point[]>([])
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
    setPoints([])
    setStatus('loading')

    async function load() {
      if (busy) return
      busy = true
      try {
        const res = await fetch(`${apiUrl}/api/tribins/${activeId}/history`, { cache: 'no-store' })
        if (!res.ok) throw new Error('history request failed')
        const data: ApiReading[] = await res.json()
        if (active) {
          setPoints(toPoints(data))
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

  const byStream = useMemo(
    () => Object.fromEntries(STREAMS.map(s => [s, points.filter(p => p.stream === s)])) as Record<Stream, Point[]>,
    [points],
  )

  const tMin = points.length ? points[0].t : 0
  const tMax = points.length ? points[points.length - 1].t : 0
  const withDate = tMax - tMin > 12 * 60 * 60 * 1000
  const x = (t: number) => PAD.l + (tMax === tMin ? INNER_W / 2 : ((t - tMin) / (tMax - tMin)) * INNER_W)
  const y = (pct: number) => PAD.t + (1 - pct / 100) * INNER_H

  function onMove(e: PointerEvent<SVGSVGElement>) {
    if (tMax === tMin) return
    const rect = e.currentTarget.getBoundingClientRect()
    const vx = ((e.clientX - rect.left) / rect.width) * W
    const frac = Math.min(1, Math.max(0, (vx - PAD.l) / INNER_W))
    setHoverT(tMin + frac * (tMax - tMin))
  }

  if (bins.length === 0 || !bin) {
    return (
      <>
        <h1 className="text-3xl lg:text-4xl font-semibold text-pine">History</h1>
        <Message title="No bins to show" text="Once you have a zone with bins, their fill history will show up here." />
      </>
    )
  }

  const readoutT = hoverT ?? tMax
  const readout = STREAMS.map(s => ({ stream: s, point: nearest(byStream[s], readoutT) }))
  const recent = [...points].sort((a, b) => b.t - a.t).slice(0, 12)

  return (
    <>
      <h1 className="text-3xl lg:text-4xl font-semibold text-pine">History</h1>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 bg-white rounded-xl border border-stone-200 px-3 min-h-11 text-sm">
          <span className="text-stone-400 font-medium">Bin:</span>
          <select
            value={bin.id}
            onChange={e => { setBinId(e.target.value); setHoverT(null) }}
            className="bg-transparent font-medium text-forest outline-none cursor-pointer pr-1"
          >
            {bins.map(b => (
              <option key={b.id} value={b.id}>{b.name} ({b.zone})</option>
            ))}
          </select>
        </label>
        {!sampleData && (
          <span className="text-xs text-pine-muted">
            {status === 'error' ? 'Can’t reach the backend, showing the last readings we had' : `Updates every ${REFRESH_MS / 1000} seconds`}
          </span>
        )}
      </div>

      {sampleData ? (
        <Message
          title="No history for sample data"
          text="Sample bins don't have saved readings. Switch to a user with live data to see real history."
        />
      ) : status === 'loading' ? (
        <Message title="Loading history" text="Getting the saved readings for this bin." />
      ) : points.length === 0 ? (
        <Message
          title={status === 'error' ? 'Can’t load history' : 'No readings saved yet'}
          text={
            status === 'error'
              ? 'Make sure the backend is running on port 8080, then this page will fill in by itself.'
              : 'Readings show up here as the sensors send them. For the demo, start the backend with the fake sensor timer on.'
          }
        />
      ) : (
        <div className="space-y-5 desk:space-y-6">
          {/* chart */}
          <div className={TILE}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 mb-3">
              <h2 className="text-lg font-semibold text-pine">Fill level over time</h2>
              <p className="text-xs text-pine-muted font-mono">
                {hoverT === null ? 'Latest' : 'At'} {fmtTime(readoutT, withDate)}
              </p>
            </div>

            {/* what each line says right now (or where the pointer is) */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              {readout.map(({ stream, point }) => (
                <div key={stream} className="rounded-2xl bg-ivory px-3 py-2">
                  <p className="flex items-center gap-1.5 text-[11px] font-medium text-pine-muted uppercase tracking-wide">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: STREAM_COLOR[stream] }} />
                    {stream}
                  </p>
                  <p className="font-mono text-xl font-medium mt-0.5" style={{ color: point ? fillHex(point.pct) : undefined }}>
                    {point ? `${Math.round(point.pct)}%` : '–'}
                  </p>
                </div>
              ))}
            </div>

            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="w-full h-auto touch-pan-y"
              role="img"
              aria-label={`Line chart of ${bin.name} fill level over time. The table below lists the latest readings.`}
              onPointerMove={onMove}
              onPointerLeave={() => setHoverT(null)}
            >
              {/* gridlines */}
              {[0, 25, 50, 75, 100].map(g => (
                <g key={g}>
                  <line x1={PAD.l} x2={W - PAD.r} y1={y(g)} y2={y(g)} stroke="#E7E5E4" strokeWidth={1} />
                  <text x={PAD.l - 6} y={y(g) + 3.5} textAnchor="end" fontSize={10} fill="#78716C" fontFamily="DM Mono, monospace">{g}%</text>
                </g>
              ))}

              {/* warning and critical levels, same cutoffs as the status colors */}
              <line x1={PAD.l} x2={W - PAD.r} y1={y(WARN_AT)} y2={y(WARN_AT)} stroke="#D4A13A" strokeWidth={1} strokeDasharray="4 4" />
              <line x1={PAD.l} x2={W - PAD.r} y1={y(CRITICAL_AT)} y2={y(CRITICAL_AT)} stroke="#B4463F" strokeWidth={1} strokeDasharray="4 4" />

              {/* time labels */}
              <text x={PAD.l} y={H - 8} fontSize={10} fill="#78716C" fontFamily="DM Mono, monospace">{fmtTime(tMin, withDate)}</text>
              {tMax !== tMin && (
                <text x={W - PAD.r} y={H - 8} textAnchor="end" fontSize={10} fill="#78716C" fontFamily="DM Mono, monospace">{fmtTime(tMax, withDate)}</text>
              )}

              {/* one line per compartment */}
              {STREAMS.map(s => (
                <polyline
                  key={s}
                  points={byStream[s].map(p => `${x(p.t).toFixed(1)},${y(p.pct).toFixed(1)}`).join(' ')}
                  fill="none"
                  stroke={STREAM_COLOR[s]}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ))}

              {/* marker at the pointer, or at the newest reading */}
              {hoverT !== null && <line x1={x(hoverT)} x2={x(hoverT)} y1={PAD.t} y2={PAD.t + INNER_H} stroke="#0F2E23" strokeOpacity={0.25} strokeWidth={1} />}
              {readout.map(({ stream, point }) =>
                point ? <circle key={stream} cx={x(point.t)} cy={y(point.pct)} r={4} fill="white" stroke={STREAM_COLOR[stream]} strokeWidth={2} /> : null,
              )}
            </svg>

            <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-[11px] text-pine-muted">
              <span className="flex items-center gap-1.5"><span className="w-4 border-t border-dashed" style={{ borderColor: '#D4A13A' }} />Warning ({WARN_AT}%)</span>
              <span className="flex items-center gap-1.5"><span className="w-4 border-t border-dashed" style={{ borderColor: '#B4463F' }} />Critical ({CRITICAL_AT}%)</span>
            </div>
          </div>

          {/* newest readings as a table, also the text version of the chart */}
          <div className={TILE}>
            <h2 className="text-lg font-semibold text-pine mb-3">Latest readings</h2>
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm min-w-[360px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-pine-muted">
                    <th className="font-medium px-1 pb-2">Time</th>
                    <th className="font-medium px-1 pb-2">Compartment</th>
                    <th className="font-medium px-1 pb-2 text-right">Fill</th>
                    <th className="font-medium px-1 pb-2 text-right">Height</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((p, i) => (
                    <tr key={`${p.stream}-${p.t}-${i}`} className="border-t border-stone-100">
                      <td className="px-1 py-2 font-mono text-xs text-stone-600">{fmtTime(p.t, withDate)}</td>
                      <td className="px-1 py-2">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: STREAM_COLOR[p.stream] }} />
                          {p.stream}
                        </span>
                      </td>
                      <td className="px-1 py-2 text-right font-mono font-medium" style={{ color: fillHex(p.pct) }}>{Math.round(p.pct)}%</td>
                      <td className="px-1 py-2 text-right font-mono text-xs text-stone-500">{p.cm.toFixed(1)} cm</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
