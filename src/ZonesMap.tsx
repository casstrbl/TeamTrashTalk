import { useEffect, useMemo, useRef, useState } from 'react'
import { latLngBounds } from 'leaflet'
import type { LatLng, LatLngBounds, LeafletMouseEvent } from 'leaflet'
import { MapContainer, TileLayer, CircleMarker, Rectangle, Tooltip, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { apiRequest, triBinNumber } from './api'
import type { ToolBin } from './TestPanelPage'

// zones map (editors): drag on the map to draw an area, drag the area to move it, or tap bins one
// by one. then put everything picked into a zone, an existing one or a new letter.
// the client liked making zones by picking bins or by lat/long, this does both

const OSM_CREDIT = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
const CAMPUS: [[number, number], [number, number]] = [[38.5525, -121.4300], [38.5665, -121.4175]]

// a color per zone letter, from the site's palette. no zone yet = gray
const ZONE_COLORS = ['#1B5B65', '#798F53', '#C88582', '#D4A13A', '#4A4A42', '#5B8FA0', '#8E6C9E', '#B4463F']
const NO_ZONE = '#9A9A8E'

function zoneLetter(zone: string) {
  return zone.replace(/^Zone\s*/i, '').trim().slice(0, 1).toUpperCase()
}

function zoneColor(letter: string) {
  if (!letter) return NO_ZONE
  return ZONE_COLORS[(letter.charCodeAt(0) - 65) % ZONE_COLORS.length]
}

type Gesture = { kind: 'draw'; start: LatLng } | { kind: 'move'; start: LatLng; from: LatLngBounds; x: number; y: number }

// how close (px) a tap inside the area has to be to a bin to toggle it
const TAP_RADIUS = 14

// pointer events on the map itself, so drawing works the same with a mouse, a finger or a pencil
function AreaTool({ drawing, area, bins, onArea, onDone, onTapBin }: {
  drawing: boolean
  area: LatLngBounds | null
  bins: ToolBin[]
  onArea: (bounds: LatLngBounds) => void
  onDone: () => void
  onTapBin: (id: string) => void // a tap inside the area lands here, since the area takes the press
}) {
  const map = useMap()
  const gesture = useRef<Gesture | null>(null)
  const latest = useRef({ drawing, area, bins, onArea, onDone, onTapBin })
  latest.current = { drawing, area, bins, onArea, onDone, onTapBin }

  useEffect(() => {
    const el = map.getContainer()
    // after we handle a press, the browser still sends a click; keep it from reaching leaflet too
    let swallowClick = false

    function down(e: PointerEvent) {
      swallowClick = false
      if (e.button !== 0) return
      const { drawing, area } = latest.current
      const at = map.mouseEventToLatLng(e)
      if (drawing) gesture.current = { kind: 'draw', start: at }
      else if (area && area.contains(at)) gesture.current = { kind: 'move', start: at, from: area, x: e.clientX, y: e.clientY }
      else return
      // runs before leaflet's own pan handler, so the map holds still while we draw or move
      map.dragging.disable()
      el.setPointerCapture(e.pointerId)
      e.preventDefault()
      e.stopPropagation()
    }

    function move(e: PointerEvent) {
      const g = gesture.current
      if (!g) return
      const at = map.mouseEventToLatLng(e)
      if (g.kind === 'draw') {
        latest.current.onArea(latLngBounds(g.start, at))
      } else {
        const dLat = at.lat - g.start.lat
        const dLng = at.lng - g.start.lng
        const sw = g.from.getSouthWest()
        const ne = g.from.getNorthEast()
        latest.current.onArea(latLngBounds([sw.lat + dLat, sw.lng + dLng], [ne.lat + dLat, ne.lng + dLng]))
      }
    }

    function up(e: PointerEvent) {
      const g = gesture.current
      if (!g) return
      const wasDrawing = g.kind === 'draw'
      gesture.current = null
      swallowClick = true
      // barely moved inside the area = a tap, so toggle the nearest bin
      if (g.kind === 'move' && Math.hypot(e.clientX - g.x, e.clientY - g.y) < 6) {
        const tap = map.mouseEventToContainerPoint(e)
        let best: { id: string; d: number } | null = null
        for (const b of latest.current.bins) {
          const d = map.latLngToContainerPoint([b.lat, b.lng]).distanceTo(tap)
          if (d <= TAP_RADIUS && (!best || d < best.d)) best = { id: b.id, d }
        }
        if (best) latest.current.onTapBin(best.id)
      }
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
      map.dragging.enable()
      if (wasDrawing) latest.current.onDone()
    }

    function click(e: MouseEvent) {
      if (!swallowClick) return
      swallowClick = false
      e.stopPropagation()
      e.preventDefault()
    }

    el.addEventListener('pointerdown', down, { capture: true })
    el.addEventListener('click', click, { capture: true })
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    return () => {
      el.removeEventListener('pointerdown', down, { capture: true })
      el.removeEventListener('click', click, { capture: true })
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      map.dragging.enable()
    }
  }, [map])

  // a finger on the map shouldn't scroll the page while drawing
  useEffect(() => {
    map.getContainer().style.touchAction = drawing ? 'none' : ''
    map.getContainer().style.cursor = drawing ? 'crosshair' : ''
  }, [map, drawing])

  return null
}

function fmt(n: number) {
  return n.toFixed(5)
}

export default function ZonesMap({ bins, onChanged }: { bins: ToolBin[]; onChanged: () => void }) {
  const [drawing, setDrawing] = useState(false)
  const [area, setArea] = useState<LatLngBounds | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [zone, setZone] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const placed = useMemo(() => bins.filter(b => Number.isFinite(b.lat) && Number.isFinite(b.lng) && (b.lat !== 0 || b.lng !== 0)), [bins])
  const letters = useMemo(() => [...new Set(placed.map(b => zoneLetter(b.zone)).filter(Boolean))].sort(), [placed])
  // the next unused letter, for "new zone"
  const nextLetter = useMemo(() => {
    for (let c = 65; c <= 90; c++) {
      const l = String.fromCharCode(c)
      if (!letters.includes(l)) return l
    }
    return ''
  }, [letters])
  const zoneOptions = nextLetter ? [...letters, nextLetter] : letters
  const target = zone || letters[0] || nextLetter

  const initialBounds = useMemo(() => {
    if (placed.length === 0) return latLngBounds(CAMPUS)
    return latLngBounds(placed.map(b => [b.lat, b.lng] as [number, number])).pad(0.05)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- only the first view

  // drawing or moving the area picks exactly what's inside it
  function changeArea(bounds: LatLngBounds) {
    setArea(bounds)
    setPicked(new Set(placed.filter(b => bounds.contains([b.lat, b.lng])).map(b => b.id)))
    setMessage(null)
  }

  function toggle(id: string) {
    setPicked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setMessage(null)
  }

  function clear() {
    setArea(null)
    setPicked(new Set())
    setDrawing(false)
    setMessage(null)
  }

  // the area's edges as numbers, for typing exact coordinates
  function setEdge(edge: 'south' | 'west' | 'north' | 'east', value: string) {
    const n = Number(value)
    if (!Number.isFinite(n)) return
    const b = area ?? latLngBounds(initialBounds.getCenter(), initialBounds.getCenter())
    const box = { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast(), [edge]: n }
    changeArea(latLngBounds([box.south, box.west], [box.north, box.east]))
  }

  async function assign() {
    if (picked.size === 0 || !target) return
    setSaving(true)
    setMessage(null)
    try {
      const ids = [...picked].map(triBinNumber).filter(Number.isFinite)
      const res = await apiRequest<{ message: string }>('/api/admin/zones/assign', 'POST', { zone: target, triBinIDs: ids })
      setMessage({ ok: true, text: `${res.message}.` })
      setArea(null)
      setPicked(new Set())
      onChanged()
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Could not update zones.' })
    } finally {
      setSaving(false)
    }
  }

  const pickedBins = placed.filter(b => picked.has(b.id))
  const edges = area ? { south: area.getSouth(), west: area.getWest(), north: area.getNorth(), east: area.getEast() } : null
  const edgeInput = 'w-full min-h-11 rounded-xl bg-white/70 border border-pine/10 px-3 text-sm font-mono text-pine outline-none focus:border-teal/50 focus:ring-2 focus:ring-teal/20'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => { setDrawing(d => !d); setMessage(null) }}
          aria-pressed={drawing}
          className={`min-h-11 rounded-full px-5 text-sm font-bold transition-colors ${drawing ? 'bg-teal text-ivory' : 'bg-pine text-ivory hover:bg-forest-light'}`}
        >
          {drawing ? 'Drag on the map…' : area ? 'Draw a new area' : 'Draw an area'}
        </button>
        {(area || picked.size > 0) && (
          <button onClick={clear} className="min-h-11 rounded-full px-4 text-sm font-bold glass text-pine-muted hover:text-pine">Clear</button>
        )}
        <p className="text-sm font-medium text-pine-muted">
          {drawing ? 'Press and drag to draw the area.' : area ? 'Drag the area to move it, or tap bins to add or remove them.' : 'Or tap bins one by one.'}
        </p>
      </div>

      <div data-lenis-prevent className="h-[420px] md:h-[520px] rounded-[28px] overflow-hidden border border-pine/10 glass">
        <MapContainer bounds={initialBounds} maxZoom={19} className="h-full w-full" scrollWheelZoom>
          <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} attribution={OSM_CREDIT} className="[filter:grayscale(.85)_brightness(1.05)_contrast(.9)]" />
          <AreaTool drawing={drawing} area={area} bins={placed} onArea={changeArea} onDone={() => setDrawing(false)} onTapBin={toggle} />
          {area && <Rectangle bounds={area} pathOptions={{ color: '#1B5B65', weight: 2, dashArray: '6 6', fillColor: '#1B5B65', fillOpacity: 0.1 }} interactive={false} />}
          {placed.map(b => {
            const on = picked.has(b.id)
            const color = zoneColor(zoneLetter(b.zone))
            return (
              <CircleMarker
                key={b.id}
                center={[b.lat, b.lng]}
                radius={on ? 9 : 6}
                pathOptions={{ color: on ? '#0F2E23' : '#F4F1DE', weight: on ? 3 : 1.5, fillColor: color, fillOpacity: b.zone ? 0.95 : 0.55 }}
                eventHandlers={{ click: (e: LeafletMouseEvent) => { e.originalEvent.stopPropagation(); if (!drawing) toggle(b.id) } }}
              >
                <Tooltip direction="top" offset={[0, -6]}>{b.name} · {b.zone || 'No zone'}</Tooltip>
              </CircleMarker>
            )
          })}
        </MapContainer>
      </div>

      {/* legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-2 px-1">
        {letters.map(l => (
          <span key={l} className="inline-flex items-center gap-1.5 text-xs font-bold text-pine-muted">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: zoneColor(l) }} />Zone {l}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-pine-muted">
          <span className="w-3 h-3 rounded-full opacity-60" style={{ backgroundColor: NO_ZONE }} />No zone yet
        </span>
      </div>

      {message && (
        <p role={message.ok ? 'status' : 'alert'} className={`rounded-2xl text-sm font-bold px-4 py-3 ${message.ok ? 'bg-olive-soft text-olive-ink' : 'bg-critical-soft text-status-critical-ink'}`}>{message.text}</p>
      )}

      <div className="rounded-[28px] p-5 md:p-6 glass space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[12rem]">
            <p className="text-lg font-bold text-pine">{picked.size} {picked.size === 1 ? 'bin' : 'bins'} selected</p>
            <p className="text-[13px] font-medium text-pine-muted truncate">
              {pickedBins.length ? pickedBins.slice(0, 6).map(b => b.name).join(', ') + (pickedBins.length > 6 ? ` and ${pickedBins.length - 6} more` : '') : 'Draw an area or tap bins on the map.'}
            </p>
          </div>
          <label className="w-40">
            <span className="block text-sm font-bold text-pine mb-1.5">Move to</span>
            <select value={target} onChange={e => setZone(e.target.value)} className="w-full min-h-12 rounded-2xl bg-white/70 border border-pine/10 px-4 text-base font-semibold text-pine outline-none focus:border-teal/50 focus:ring-2 focus:ring-teal/20">
              {zoneOptions.map(l => <option key={l} value={l}>Zone {l}{l === nextLetter ? ' (new)' : ''}</option>)}
            </select>
          </label>
          <button onClick={assign} disabled={saving || picked.size === 0 || !target} className="min-h-12 rounded-full bg-pine text-ivory px-6 text-[15px] font-bold hover:bg-forest-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {saving ? 'Saving…' : `Assign to Zone ${target}`}
          </button>
        </div>

        {/* exact edges, for anyone working from the client's GIS coordinates */}
        <details className="group">
          <summary className="cursor-pointer text-sm font-bold text-teal min-h-11 flex items-center">Set the area by latitude and longitude</summary>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
            {(['north', 'south', 'west', 'east'] as const).map(edge => (
              <label key={edge}>
                <span className="block text-xs font-bold text-pine-muted mb-1 capitalize">{edge} {edge === 'north' || edge === 'south' ? '(lat)' : '(long)'}</span>
                <input
                  key={edges ? fmt(edges[edge]) : 'empty'}
                  type="text"
                  inputMode="decimal"
                  defaultValue={edges ? fmt(edges[edge]) : ''}
                  onBlur={e => setEdge(edge, e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') setEdge(edge, (e.target as HTMLInputElement).value) }}
                  placeholder={edge === 'north' || edge === 'south' ? '38.5600' : '-121.4230'}
                  className={edgeInput}
                />
              </label>
            ))}
          </div>
        </details>
      </div>
    </div>
  )
}
