import { useState, useMemo, useEffect, useRef, Fragment } from 'react'
import type { KeyboardEvent } from 'react'
import { divIcon, latLngBounds } from 'leaflet'
import type { LatLngBounds, LatLngTuple, Layer, Point } from 'leaflet'
import { MapContainer, TileLayer, ImageOverlay, Pane, Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import Lenis from 'lenis'
import 'lenis/dist/lenis.css'
import logoUrl from './imports/logo.png'
import { mockBins } from './data/mockBins'
import { campusBoundary } from './data/campusBoundary'
import { campusBuildings } from './data/campusBuildings'

// fill bands: green 0-49, yellow 50-79, red 80-100
const WARN_AT = 50
const CRITICAL_AT = 80

// map: dots when zoomed out, labeled pins from street level in
const LABEL_ZOOM = 18
const MAX_ZOOM = 19
// apple's minimum tap size, every pin gets at least this much hit area
const PIN_TAP = 44
// hex copies of index.css colors, for places tailwind classes can't reach (svg, map, canvas)
const OFFLINE_HEX = '#9A9A8E' // status-offline
const TEAL_HEX = '#1B5B65' // teal: selected pin ring, building names

// types

type Role = 'editor' | 'viewer'
type Status = 'ok' | 'warn' | 'critical' | 'offline'
type Zone =
  | 'Main Quad'
  | 'Sacramento Hall'
  | 'Welcome Center'
  | 'Shasta Hall'
  | 'Yosemite Hall'
  | 'Lassen Hall'
  | 'Douglass Hall'
  | 'Mendocino Hall'
    | 'Zone A'
    | 'Zone B'
type Stream = 'Landfill' | 'Recycling' | 'Compost'

interface Compartment {
  label: Stream
  fill: number
}

interface Tribin {
  id: string
  name: string
  zone: Zone
  location: string
  lat: number
  lng: number
  compartments: Compartment[]
  battery: number
  sensorStatus: 'online' | 'offline'
  lastUpdated: string
}

interface Alert {
  id: string
  binId: string
  binName: string
  zone: Zone
  message: string
  severity: 'info' | 'warn' | 'critical'
  time: string
  // what tripped it, for the short summary lines ("landfill 97%", "sensor offline")
  kind: 'fill' | 'offline' | 'battery'
  stream?: Stream
  value?: number
}

interface StaffMember {
  id: string
  name: string
  role: Role
  zones: Zone[]
  email: string
}

// data

// real bins from the client spreadsheet, fills are landfill/recycling/compost
const ORIGINAL_TRIBINS: Tribin[] = [
  {
    id: 'TB-026', name: 'Bin 26', zone: 'Main Quad', location: 'Main quad',
    lat: 38.56324, lng: -121.42557,
    compartments: [{ label: 'Landfill', fill: 91 }, { label: 'Recycling', fill: 83 }, { label: 'Compost', fill: 78 }],
    battery: 72, sensorStatus: 'online', lastUpdated: '2 min ago',
  },
  {
    id: 'TB-024', name: 'Bin 24', zone: 'Sacramento Hall', location: 'Sacramento Hall front door',
    lat: 38.56372, lng: -121.42650,
    compartments: [{ label: 'Landfill', fill: 45 }, { label: 'Recycling', fill: 68 }, { label: 'Compost', fill: 30 }],
    battery: 89, sensorStatus: 'online', lastUpdated: '4 min ago',
  },
  {
    id: 'TB-010', name: 'Bin 10', zone: 'Welcome Center', location: 'In front of the Welcome Center',
    lat: 38.56448, lng: -121.42751,
    compartments: [{ label: 'Landfill', fill: 55 }, { label: 'Recycling', fill: 52 }, { label: 'Compost', fill: 48 }],
    battery: 64, sensorStatus: 'online', lastUpdated: '5 min ago',
  },
  {
    id: 'TB-041', name: 'Bin 41', zone: 'Shasta Hall', location: 'In front of Shasta Hall',
    lat: 38.56432, lng: -121.42443,
    compartments: [{ label: 'Landfill', fill: 74 }, { label: 'Recycling', fill: 61 }, { label: 'Compost', fill: 55 }],
    battery: 61, sensorStatus: 'online', lastUpdated: '6 min ago',
  },
  {
    id: 'TB-021', name: 'Bin 21', zone: 'Yosemite Hall', location: 'Yosemite Hall benches',
    lat: 38.56288, lng: -121.42706,
    compartments: [{ label: 'Landfill', fill: 0 }, { label: 'Recycling', fill: 0 }, { label: 'Compost', fill: 0 }],
    battery: 12, sensorStatus: 'offline', lastUpdated: '3 hrs ago',
  },
  {
    id: 'TB-036', name: 'Bin 36', zone: 'Lassen Hall', location: 'Lassen Hall entrance',
    lat: 38.56287, lng: -121.42556,
    compartments: [{ label: 'Landfill', fill: 38 }, { label: 'Recycling', fill: 44 }, { label: 'Compost', fill: 29 }],
    battery: 78, sensorStatus: 'online', lastUpdated: '3 min ago',
  },
  {
    id: 'TB-040', name: 'Bin 40', zone: 'Douglass Hall', location: 'In front of Douglass Hall',
    lat: 38.56275, lng: -121.42491,
    compartments: [{ label: 'Landfill', fill: 22 }, { label: 'Recycling', fill: 18 }, { label: 'Compost', fill: 10 }],
    battery: 95, sensorStatus: 'online', lastUpdated: '1 min ago',
  },
  {
    id: 'TB-035', name: 'Bin 35', zone: 'Mendocino Hall', location: 'Riverfront, near Mendocino Hall',
    lat: 38.56309, lng: -121.42413,
    compartments: [{ label: 'Landfill', fill: 14 }, { label: 'Recycling', fill: 22 }, { label: 'Compost', fill: 8 }],
    battery: 91, sensorStatus: 'online', lastUpdated: '5 min ago',
  },
]

const STAFF: StaffMember[] = [
  { id: 's1', name: 'Person 1', role: 'editor', zones: ['Zone A', 'Zone B'], email: 'person1@csus.edu' },
  { id: 's2', name: 'Person 2', role: 'viewer', zones: ['Zone A'], email: 'person2@csus.edu' },
  { id: 's3', name: 'Person 3', role: 'viewer', zones: ['Zone A'], email: 'person3@csus.edu' },
  { id: 's4', name: 'Person 4', role: 'viewer', zones: ['Zone B'], email: 'person4@csus.edu' },
  { id: 's5', name: 'Person 5', role: 'viewer', zones: ['Zone B'], email: 'person5@csus.edu' },
]

// one zone per building, so staff can filter by location
const TRIBINS: Tribin[] = mockBins as Tribin[]

// demo only: the same bins as if just emptied (a third of each fill, sensors back online),
// shown to person 3 so the "all clear" look can be previewed. the header flags it as sample data
const SAMPLE_USER_ID = 's3'
const SAMPLE_CLEAR_BINS: Tribin[] = TRIBINS.map(b => ({
  ...b,
  compartments: b.compartments.map(c => ({ ...c, fill: Math.round(c.fill / 3) })),
  sensorStatus: 'online',
  lastUpdated: b.sensorStatus === 'offline' ? '1 min ago' : b.lastUpdated,
}))

const ALL_ZONES: Zone[] = [
    ...new Set(TRIBINS.map(bin => bin.zone))
]
// helpers

function maxFill(bin: Tribin) {
  return Math.max(...bin.compartments.map(c => c.fill))
}

function avgFill(bin: Tribin) {
  return Math.round(bin.compartments.reduce((s, c) => s + c.fill, 0) / bin.compartments.length)
}

// status comes from the fullest compartment, offline wins
function binStatus(bin: Tribin): Status {
  if (bin.sensorStatus === 'offline') return 'offline'
  const top = maxFill(bin)
  if (top >= CRITICAL_AT) return 'critical'
  if (top >= WARN_AT) return 'warn'
  return 'ok'
}

function statusBg(status: Status) {
  return {
    ok: 'bg-status-ok/15 text-status-ok-ink',
    warn: 'bg-status-warn/20 text-status-warn-ink',
    critical: 'bg-status-critical/15 text-status-critical-ink',
    offline: 'bg-status-offline/20 text-status-offline-ink',
  }[status]
}

function statusLabel(status: Status) {
  return { ok: 'Good', warn: 'Warning', critical: 'Critical', offline: 'Offline' }[status]
}

// hex fill color for gauges and pins (status-critical / -warn / -ok)
function fillHex(fill: number) {
  if (fill >= CRITICAL_AT) return '#B4463F'
  if (fill >= WARN_AT) return '#D4A13A'
  return '#4E8B5F'
}

// tailwind bg class for bars
function fillBarColor(fill: number) {
  if (fill >= CRITICAL_AT) return 'bg-status-critical'
  if (fill >= WARN_AT) return 'bg-status-warn'
  return 'bg-status-ok'
}

// calrecycle's grey / blue / green, in palette shades: landfill dark grey,
// recycling teal, compost olive. none of them is a status color
function compartmentColor(label: Stream) {
  return { Landfill: '#4A4A42', Recycling: '#1B5B65', Compost: '#798F53' }[label]
}

// enter/space on a div acting as a button
function onActivate(fn: () => void) {
  return (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      fn()
    }
  }
}

// map pin helpers

// same colors as the card gauges, gray when offline
function pinHex(bin: Tribin) {
  return bin.sensorStatus === 'offline' ? OFFLINE_HEX : fillHex(maxFill(bin))
}

// which bin colors a group bubble
const PIN_RANK: Record<Status, number> = { critical: 0, warn: 1, offline: 2, ok: 3 }

// thin dark edge + drop shadow so pins lift off the muted map
const PIN_SHADOW = '0 0 0 1px rgb(0 0 0 / .18), 0 2px 5px rgb(0 0 0 / .4)'

function binIcon(bin: Tribin, labeled: boolean, selected: boolean) {
  const hex = pinHex(bin)
  const ring = selected ? `, 0 0 0 3px ${TEAL_HEX}` : ''
  const body = labeled
    ? `<span class="flex items-center gap-1 bg-white rounded-full pl-1.5 pr-2 py-0.5 font-mono text-[11px] leading-none font-bold text-forest ${selected ? 'scale-110' : ''}" style="border:2px solid ${hex};box-shadow:${PIN_SHADOW}${ring}"><span class="w-2 h-2 rounded-full" style="background:${hex}"></span>${maxFill(bin)}%</span>`
    : `<span class="block rounded-full border-[2.5px] border-white ${selected ? 'w-5 h-5' : 'w-4 h-4'}" style="background:${hex};box-shadow:${PIN_SHADOW}${ring}"></span>`
  const w = labeled ? 56 : PIN_TAP
  return divIcon({
    className: '',
    iconSize: [w, PIN_TAP],
    iconAnchor: [w / 2, PIN_TAP / 2],
    html: `<div class="w-full h-full flex items-center justify-center">${body}</div>`,
  })
}

function groupIcon(bins: Tribin[]) {
  const worst = [...bins].sort((a, b) => PIN_RANK[binStatus(a)] - PIN_RANK[binStatus(b)])[0]
  return divIcon({
    className: '',
    iconSize: [PIN_TAP, PIN_TAP],
    iconAnchor: [PIN_TAP / 2, PIN_TAP / 2],
    html: `<div class="w-full h-full flex items-center justify-center"><span class="flex items-center justify-center w-7 h-7 rounded-full bg-white font-mono text-[11px] font-bold text-forest" style="border:3px solid ${pinHex(worst)};box-shadow:${PIN_SHADOW}">${bins.length}</span></div>`,
  })
}

function binLatLng(bin: Tribin): LatLngTuple {
  return [bin.lat, bin.lng]
}

function padMeters(bounds: LatLngBounds, meters: number) {
  const dLat = meters / 111_320
  const dLng = meters / (111_320 * Math.cos((bounds.getCenter().lat * Math.PI) / 180))
  return latLngBounds(
    [bounds.getSouth() - dLat, bounds.getWest() - dLng],
    [bounds.getNorth() + dLat, bounds.getEast() + dLng],
  )
}

// the campus outline, widened to any bin that's ever placed past it.
// you can pan at most 200 m beyond it
const CAMPUS = latLngBounds(campusBoundary.map(([lng, lat]): LatLngTuple => [lat, lng]))
  .extend(latLngBounds(TRIBINS.map(binLatLng)))
const MAP_LIMIT = padMeters(CAMPUS, 200)

// fog outside the campus outline

// reaches well past MAP_LIMIT so a zoomed-out view never sees its edge
const FOG_BOUNDS = padMeters(MAP_LIMIT, 2000)
const FOG_FEATHER_M = 120 // soft edge, in meters, from clear campus to full fog
const FOG_OPACITY = 0.8

function mercatorY(lat: number) {
  const r = (lat * Math.PI) / 180
  return Math.log(Math.tan(Math.PI / 4 + r / 2))
}

// three passes approximate a gaussian blur
function boxBlur(src: Float32Array, w: number, h: number, r: number) {
  const tmp = new Float32Array(src.length)
  const n = 2 * r + 1
  const cx = (x: number) => Math.min(w - 1, Math.max(0, x))
  const cy = (y: number) => Math.min(h - 1, Math.max(0, y))
  for (let y = 0; y < h; y++) {
    const row = y * w
    let sum = 0
    for (let x = -r; x <= r; x++) sum += src[row + cx(x)]
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum / n
      sum += src[row + cx(x + r + 1)] - src[row + cx(x - r)]
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0
    for (let y = -r; y <= r; y++) sum += tmp[cy(y) * w + x]
    for (let y = 0; y < h; y++) {
      src[y * w + x] = sum / n
      sum += tmp[cy(y + r + 1) * w + x] - tmp[cy(y - r) * w + x]
    }
  }
}

// drawn once into an image over FOG_BOUNDS (in web mercator, like the map), then the map
// scales it like a photo, so panning and zooming cost nothing: clear inside the outline,
// sage fog outside, feathered between
let fogUrl: string | undefined
function fogImage() {
  if (fogUrl) return fogUrl
  const west = FOG_BOUNDS.getWest()
  const top = mercatorY(FOG_BOUNDS.getNorth())
  const bottom = mercatorY(FOG_BOUNDS.getSouth())
  const spanX = ((FOG_BOUNDS.getEast() - west) * Math.PI) / 180
  const w = 1024
  const h = Math.round((w * (top - bottom)) / spanX)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.beginPath()
  for (const [lng, lat] of campusBoundary) {
    ctx.lineTo((((lng - west) * Math.PI) / 180 / spanX) * w, ((top - mercatorY(lat)) / (top - bottom)) * h)
  }
  ctx.fill()

  const img = ctx.getImageData(0, 0, w, h)
  const inside = new Float32Array(w * h)
  for (let i = 0; i < inside.length; i++) inside[i] = img.data[i * 4 + 3] / 255
  // feather ~ 10-90% of a gaussian (2.56 sigma), split over 3 box passes
  const metersPerPx = (spanX * 6_378_137 * Math.cos((CAMPUS.getCenter().lat * Math.PI) / 180)) / w
  const sigma = FOG_FEATHER_M / 2.56 / metersPerPx
  const r = Math.max(1, Math.round((Math.sqrt(4 * sigma * sigma + 1) - 1) / 2))
  for (let pass = 0; pass < 3; pass++) boxBlur(inside, w, h, r)
  for (let i = 0; i < inside.length; i++) {
    img.data.set([244, 241, 222, Math.round((1 - inside[i]) * FOG_OPACITY * 255)], i * 4) // ivory
  }
  ctx.putImageData(img, 0, 0)
  return (fogUrl = canvas.toDataURL())
}

// pins closer than minGap px on screen share one bubble, the picked bin always stands alone
function groupPins(bins: Tribin[], selectedId: string | null, toPoint: (bin: Tribin) => Point, minGap: number) {
  const groups: { at: Point; bins: Tribin[] }[] = []
  for (const bin of bins) {
    const at = toPoint(bin)
    const near = bin.id === selectedId
      ? undefined
      : groups.find(g => g.bins[0].id !== selectedId && g.at.distanceTo(at) < minGap)
    if (near) near.bins.push(bin)
    else groups.push({ at, bins: [bin] })
  }
  return groups.map(g => g.bins)
}

// sub-components

function RingGauge({ fill, size = 56 }: { fill: number; size?: number }) {
  const r = (size - 8) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (fill / 100) * circ
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E6E1C5" strokeWidth={6} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={fillHex(fill)} strokeWidth={6}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
    </svg>
  )
}

function BatteryIcon({ level }: { level: number }) {
  const color = level <= 20 ? 'text-status-critical-ink' : level <= 40 ? 'text-status-warn-ink' : 'text-status-ok-ink'
  return (
    <span className={`font-mono text-xs ${color}`} title={`Battery: ${level}%`}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block align-[-1px] mr-0.5">
        {level <= 20
          ? <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/>
          : <><rect x="2" y="7" width="17" height="10" rx="2"/><path d="M22 10v4"/></>}
      </svg>
      {level}%
    </span>
  )
}

function CompartmentBar({ label, fill }: { label: Stream; fill: number }) {
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between items-center">
        <span className="flex items-center gap-1.5 text-[10px] font-medium text-stone-500 uppercase tracking-wide">
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: compartmentColor(label) }} />
          {label}
        </span>
        <span className="font-mono text-[10px] font-medium text-stone-500">{fill}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-stone-200 overflow-hidden">
        <div className={`h-full rounded-full ${fillBarColor(fill)} transition-all duration-500`} style={{ width: `${fill}%` }} />
      </div>
    </div>
  )
}

function MapPinIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>
    </svg>
  )
}

// div instead of button so the map button can sit inside it
function BinCard({ bin, onClick, onShowOnMap, highlighted = false }: {
  bin: Tribin
  onClick: () => void
  onShowOnMap?: () => void // no map button when omitted (the card inside the map popup)
  highlighted?: boolean
}) {
  const top = maxFill(bin)
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={onActivate(onClick)}
      className={`group text-left bg-white rounded-2xl border p-4 hover:border-teal/40 hover:shadow-lg hover:shadow-pine/5 transition-all duration-200 cursor-pointer ${highlighted ? 'border-mint ring-2 ring-mint/30' : 'border-stone-200/80'}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-bold text-forest text-sm">{bin.name}</p>
          <p className="text-xs text-stone-400 mt-0.5">{bin.location}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusBg(binStatus(bin))}`}>
            {statusLabel(binStatus(bin))}
          </span>
          {bin.sensorStatus === 'offline' && (
            <span className="text-[9px] text-stone-400 font-mono">OFFLINE</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 mb-3">
        <div className="relative flex items-center justify-center">
          <RingGauge fill={top} size={52} />
          <span className="absolute font-mono text-[11px] font-bold" style={{ color: fillHex(top) }}>
            {top}%
          </span>
        </div>
        <div className="flex-1 space-y-1.5">
          {bin.compartments.map(c => (
            <CompartmentBar key={c.label} label={c.label} fill={c.fill} />
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-stone-100">
        <BatteryIcon level={bin.battery} />
        <div className="flex items-center gap-2">
          {/* before: pads the tap area without changing the look */}
          {onShowOnMap && (
            <button
              onClick={e => { e.stopPropagation(); onShowOnMap() }}
              className="relative inline-flex items-center gap-1 text-[10px] leading-none font-semibold text-mint-dark bg-mint/10 hover:bg-mint/20 rounded-full px-2 py-0.5 transition-colors before:absolute before:-inset-x-2 before:-inset-y-3"
              aria-label={`Show ${bin.name} on map`}
            >
              <MapPinIcon size={9} />
              Map
            </button>
          )}
          <span className="text-[10px] text-stone-400 font-mono">{bin.lastUpdated}</span>
        </div>
      </div>
    </div>
  )
}

function AlertItem({ alert, onDismiss, onSelect }: { alert: Alert; onDismiss: (id: string) => void; onSelect: (alert: Alert) => void }) {
  // rose card = needs attention; the stripe and dot carry the severity
  const dot = { critical: 'bg-status-critical', warn: 'bg-status-warn', info: 'bg-teal' }[alert.severity]
  const bg = { critical: 'border-l-status-critical bg-rose/15', warn: 'border-l-status-warn bg-rose/15', info: 'border-l-teal bg-teal/10' }[alert.severity]
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(alert)}
      onKeyDown={onActivate(() => onSelect(alert))}
      className={`flex gap-3 p-3 border-l-2 rounded-r-lg cursor-pointer hover:shadow-md hover:shadow-forest/5 transition-shadow ${bg}`}
      title="Show on map"
    >
      <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${dot}`} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-forest">{alert.binName} · {alert.zone}</p>
        <p className="text-xs text-stone-600 mt-0.5 leading-snug">{alert.message}</p>
        <p className="text-[10px] text-stone-400 font-mono mt-1">{alert.time}</p>
      </div>
      <button
        onClick={e => { e.stopPropagation(); onDismiss(alert.id) }}
        className="text-stone-300 hover:text-stone-500 shrink-0 text-xs transition-colors"
        title="Dismiss"
        aria-label="Dismiss alert"
      >✕</button>
    </div>
  )
}

// modal: bin detail

function BinDetailModal({ bin, onClose }: { bin: Tribin; onClose: () => void }) {
  // esc closes
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-forest/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="font-display text-xl font-bold text-forest">{bin.name}</h2>
            <p className="text-sm text-stone-400">{bin.zone}</p>
            <p className="text-[11px] text-stone-400 font-mono mt-0.5">{bin.id}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-stone-300 hover:text-stone-600 transition-colors text-lg">✕</button>
        </div>

        <div className="flex justify-center mb-5">
          <div className="relative">
            <RingGauge fill={maxFill(bin)} size={96} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-mono font-bold text-lg" style={{ color: fillHex(maxFill(bin)) }}>{maxFill(bin)}%</span>
              <span className="text-[9px] text-stone-400 uppercase tracking-wider">max fill</span>
            </div>
          </div>
        </div>

        <div className="space-y-3 mb-4">
          {bin.compartments.map(c => (
            <div key={c.label}>
              <div className="flex justify-between mb-1">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-stone-600">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: compartmentColor(c.label) }} />
                  {c.label}
                </span>
                <span className="font-mono text-xs font-bold text-stone-500">{c.fill}%</span>
              </div>
              <div className="h-2.5 rounded-full bg-stone-100 overflow-hidden">
                <div className={`h-full rounded-full ${fillBarColor(c.fill)} transition-all duration-500`} style={{ width: `${c.fill}%` }} />
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs border-t border-stone-100 pt-4">
          <div>
            <p className="text-stone-400 uppercase tracking-wider text-[10px]">Sensor</p>
            <p className={`font-medium mt-0.5 capitalize ${bin.sensorStatus === 'online' ? 'text-status-ok-ink' : 'text-status-critical-ink'}`}>{bin.sensorStatus}</p>
          </div>
          <div>
            <p className="text-stone-400 uppercase tracking-wider text-[10px]">Battery</p>
            <BatteryIcon level={bin.battery} />
          </div>
          <div>
            <p className="text-stone-400 uppercase tracking-wider text-[10px]">Status</p>
            <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusBg(binStatus(bin))}`}>{statusLabel(binStatus(bin))}</span>
          </div>
          <div>
            <p className="text-stone-400 uppercase tracking-wider text-[10px]">Last Update</p>
            <p className="font-mono text-stone-600 mt-0.5">{bin.lastUpdated}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// map view

interface MapFocus {
  id: string
  n: number // bumps so jumping to the same bin twice still flies there
}

// leaflet.css is unlayered so it beats tailwind utilities, hence the !s.
// strips leaflet's popup chrome so the bin card is the popup, and undoes its
// `.leaflet-popup-content p` margins (the card's second p has mt-0.5)
const BIN_POPUP_CLASS = [
  '[&_.leaflet-popup-content-wrapper]:p-0!',
  '[&_.leaflet-popup-content-wrapper]:rounded-2xl!',
  '[&_.leaflet-popup-content]:m-0!',
  '[&_.leaflet-popup-content_p]:my-0!',
  '[&_.leaflet-popup-content_p+p]:mt-0.5!',
].join(' ')

interface BinMapProps {
  bins: Tribin[]
  fitKey: string
  selectedId: string | null
  focus: MapFocus | null
  onSelect: (id: string) => void
  onClosePopup: () => void
  onOpenDetail: (bin: Tribin) => void
}

function BinMapLayers({ bins, fitKey, selectedId, focus, onSelect, onClosePopup, onOpenDetail }: BinMapProps) {
  const map = useMap()
  const [zoom, setZoom] = useState(() => map.getZoom())
  useMapEvents({
    zoomend: () => setZoom(map.getZoom()),
    // tapping empty map closes the card, marker taps don't reach here
    click: onClosePopup,
  })
  const popupBin = bins.find(b => b.id === selectedId)

  // can't zoom out past the whole campus; depends on the map's size, so redo on resize
  useEffect(() => {
    const fit = () => map.setMinZoom(map.getBoundsZoom(CAMPUS))
    fit()
    map.on('resize', fit)
    return () => { map.off('resize', fit) }
  }, [map])

  // refit when the filters change, not on first render
  const lastFitKey = useRef(fitKey)
  useEffect(() => {
    if (lastFitKey.current === fitKey) return
    lastFitKey.current = fitKey
    map.flyToBounds(latLngBounds(bins.map(binLatLng)), { padding: [40, 40], maxZoom: LABEL_ZOOM, duration: 0.6 })
  }, [fitKey, bins, map])

  // fly to a bin jumped to from a card, alert or the spotlight
  const lastFocus = useRef(focus?.n)
  useEffect(() => {
    if (!focus || focus.n === lastFocus.current) return
    lastFocus.current = focus.n
    const bin = bins.find(b => b.id === focus.id)
    if (!bin) return
    const z = Math.max(map.getZoom(), LABEL_ZOOM)
    // aim below center so the popup card (~210-225px tall) fits above the pin
    const h = map.getSize().y
    const lift = Math.min(Math.max(40 + 225 - h / 2, 0), h / 2 - 40)
    map.flyTo(map.unproject(map.project(binLatLng(bin), z).subtract([0, lift]), z), z, { duration: 0.6 })
  }, [focus, bins, map])

  const labeled = zoom >= LABEL_ZOOM
  const groups = useMemo(
    () => groupPins(bins, selectedId, b => map.project(binLatLng(b), zoom), labeled ? 50 : PIN_TAP),
    [bins, selectedId, zoom, labeled, map],
  )

  return (
    <>
      {groups.map(group => {
        if (group.length === 1) {
          const bin = group[0]
          const selected = bin.id === selectedId
          return (
            <Marker
              key={bin.id}
              position={binLatLng(bin)}
              icon={binIcon(bin, labeled, selected)}
              title={`${bin.name} · ${maxFill(bin)}%`}
              zIndexOffset={selected ? 1000 : 0}
              riseOnHover
              eventHandlers={{ click: () => onSelect(bin.id) }}
            />
          )
        }
        const bounds = latLngBounds(group.map(binLatLng))
        return (
          <Marker
            key={group.map(b => b.id).join()}
            position={bounds.getCenter()}
            icon={groupIcon(group)}
            title={`${group.map(b => b.name).join(', ')}: tap to zoom in`}
            riseOnHover
            eventHandlers={{ click: () => map.flyToBounds(bounds, { padding: [60, 60], maxZoom: MAX_ZOOM, duration: 0.6 }) }}
          />
        )
      })}

      {/* the picked bin's card, pinned to its marker. we own closing (✕ / map tap)
          so leaflet's own close paths are off and can't get out of sync with state */}
      {popupBin && (
        <Popup
          key={popupBin.id}
          position={binLatLng(popupBin)}
          offset={[0, -8]}
          className={BIN_POPUP_CLASS}
          closeButton={false}
          closeOnClick={false}
          closeOnEscapeKey={false}
          autoPanPaddingTopLeft={[16, 24]}
          // room below the card for the pin itself and the attribution line
          autoPanPaddingBottomRight={[16, 48]}
        >
          <div className="relative w-64 font-sans text-base leading-normal">
            <BinCard bin={popupBin} onClick={() => onOpenDetail(popupBin)} />
            <button
              onClick={onClosePopup}
              className="absolute -top-2 -right-2 w-6 h-6 flex items-center justify-center rounded-full bg-white border border-stone-200 shadow text-stone-400 hover:text-stone-600 text-xs transition-colors before:absolute before:-inset-2"
              aria-label="Close bin card"
            >✕</button>
          </div>
        </Popup>
      )}
    </>
  )
}

// base map: openfreemap's positron (free, no key, no limits, osm data), drawn by maplibre
const VECTOR_STYLE = 'https://tiles.openfreemap.org/styles/positron'
const VECTOR_CREDIT =
  '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>'
const OSM_CREDIT = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
// dotted/dashed clutter: footpaths and their names, rail hatching, admin boundaries
// positron's gray water and parks, tinted toward the palette: pale teal, pale olive
const PALETTE_PAINT: Record<string, Record<string, string>> = {
  water: { 'fill-color': '#C6D6D8' },
  waterway: { 'line-color': '#C6D6D8' },
  park: { 'fill-color': '#E2E6D9' },
  landcover_wood: { 'fill-color': '#E2E6D9' },
}
const HIDDEN_LAYERS = new Set([
  'highway_path', 'highway-name-path',
  'railway_dashline', 'railway_transit_dashline', 'railway_service_dashline',
  'boundary_2', 'boundary_3', 'boundary_disputed',
])

// positron's data has no names for plain campus buildings, so we bring our own (from osm).
// maplibre hides labels that would collide; bigger buildings claim their spot first.
// maplibre zooms run one below leaflet's (512px tiles), so 14.5 here is 15.5 in leaflet:
// one step in from the whole-campus view
const BUILDING_NAMES_SOURCE = {
  type: 'geojson',
  data: {
    type: 'FeatureCollection',
    features: campusBuildings.map(b => ({
      type: 'Feature',
      properties: { name: b.name, size: b.size },
      geometry: { type: 'Point', coordinates: [b.lng, b.lat] },
    })),
  },
}
const BUILDING_NAMES_LAYER = {
  id: 'campus-building-names',
  type: 'symbol',
  source: 'campusBuildings',
  minzoom: 14.5,
  layout: {
    'text-field': ['get', 'name'],
    'text-font': ['Noto Sans Regular'], // a font positron's glyph server has
    'text-size': ['interpolate', ['linear'], ['zoom'], 14.5, 10, 17, 13],
    'text-max-width': 8,
    'text-padding': 4,
    'symbol-sort-key': ['-', ['get', 'size']], // lower key places first
  },
  paint: {
    'text-color': TEAL_HEX,
    'text-halo-color': 'rgba(255, 255, 255, 0.9)',
    'text-halo-width': 1.5,
  },
}

// maplibre + its worker (~420 KB gzipped) are only fetched when map view first opens. if it, the style,
// or webgl fails, falls back to the plain osm tiles, grayed so the pins still stand out
function BaseMap() {
  const map = useMap()
  const [fallback, setFallback] = useState(false)

  useEffect(() => {
    let cancelled = false
    let layer: Layer | undefined
    const fail = () => {
      if (layer) map.removeLayer(layer)
      layer = undefined
      if (!cancelled) setFallback(true)
    }
    Promise.all([
      import('maplibre-gl'),
      // maplibre finds its worker next to its own file at runtime, which vite neither
      // bundles nor keeps in place; ?worker&url makes vite bundle it and hand us the url
      import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'),
      import('@maplibre/maplibre-gl-leaflet'),
      import('maplibre-gl/dist/maplibre-gl.css'),
      fetch(VECTOR_STYLE).then(r => (r.ok ? r.json() : Promise.reject(r.status))),
    ])
      .then(([maplibre, { default: workerUrl }, { maplibreGL }, , style]) => {
        if (cancelled) return
        maplibre.setWorkerUrl(workerUrl)
        // hide before first paint rather than after load, so the clutter never flashes
        for (const l of style.layers) {
          if (HIDDEN_LAYERS.has(l.id)) l.layout = { ...l.layout, visibility: 'none' }
          if (l.id in PALETTE_PAINT) l.paint = { ...l.paint, ...PALETTE_PAINT[l.id] }
        }
        style.sources.campusBuildings = BUILDING_NAMES_SOURCE
        style.layers.push(BUILDING_NAMES_LAYER)
        layer = maplibreGL({ style, attributionControl: { customAttribution: VECTOR_CREDIT } }).addTo(map)
        const gl = (layer as ReturnType<typeof maplibreGL>).getMaplibreMap()
        let loaded = false
        gl.once('load', () => { loaded = true })
        gl.on('error', () => { if (!loaded) fail() })
      })
      .catch(fail)
    return () => {
      cancelled = true
      if (layer) map.removeLayer(layer)
    }
  }, [map])

  return fallback ? (
    <TileLayer
      url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      maxZoom={MAX_ZOOM}
      attribution={OSM_CREDIT}
      className="[filter:grayscale(.85)_brightness(1.05)_contrast(.9)]"
    />
  ) : null
}

// the fog sits in its own pane between the base map and the pins, so pins and cards stay sharp
function CampusFog() {
  return (
    <Pane name="campusFog" style={{ zIndex: 450 }}>
      <ImageOverlay url={fogImage()} bounds={FOG_BOUNDS} />
    </Pane>
  )
}

// fades out while a bin card is open: leaflet stacks pins and popups in one pane,
// so the legend can't sit between them and would cover the card
function MapLegend({ hidden }: { hidden: boolean }) {
  const items: { label: string; hex: string }[] = [
    { label: statusLabel('ok'), hex: fillHex(0) },
    { label: statusLabel('warn'), hex: fillHex(WARN_AT) },
    { label: statusLabel('critical'), hex: fillHex(CRITICAL_AT) },
    { label: statusLabel('offline'), hex: OFFLINE_HEX },
  ]
  return (
    // top right: bottom corners hold the osm attribution, top left the zoom buttons
    <div className={`absolute right-2 top-2 z-[1000] max-w-[calc(100%-4rem)] pointer-events-none bg-white/95 rounded-xl border border-stone-200 px-2.5 py-1.5 flex flex-wrap justify-end items-center gap-x-3 gap-y-1 text-[10px] font-medium text-stone-500 transition-opacity ${hidden ? 'opacity-0' : ''}`}>
      {items.map(i => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: i.hex }} />
          {i.label}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="w-3.5 h-3.5 rounded-full border-2 border-stone-400 font-mono text-[8px] font-bold text-forest flex items-center justify-center">2</span>
        Grouped
      </span>
    </div>
  )
}

function BinMap(props: BinMapProps) {
  const { bins, focus } = props
  // starting view: the bin being jumped to, otherwise fit every pin
  const [initial] = useState(() => {
    const bin = focus && bins.find(b => b.id === focus.id)
    return bin
      ? { center: binLatLng(bin), zoom: LABEL_ZOOM }
      : { bounds: latLngBounds(bins.map(binLatLng)), boundsOptions: { padding: [40, 40] as [number, number], maxZoom: LABEL_ZOOM } }
  })

  return (
    // isolate keeps leaflet's z-indexes (up to 1000) below the sticky nav and the detail popup
    <div data-map data-lenis-prevent className="relative isolate h-[60vh] min-h-[320px] max-h-[640px] bg-white rounded-2xl border border-stone-200/80 overflow-hidden scroll-mt-4">
      <MapContainer {...initial} maxZoom={MAX_ZOOM} maxBounds={MAP_LIMIT} maxBoundsViscosity={1} className="h-full w-full">
        <BaseMap />
        <CampusFog />
        <BinMapLayers {...props} />
      </MapContainer>
      <MapLegend hidden={bins.some(b => b.id === props.selectedId)} />
    </div>
  )
}

// pages and navigation

type Page = 'summary' | 'details' | 'pickup' | 'history' | 'admin'

// tabler icons (MIT, tabler.io/icons), inlined like the app's other svgs
const ICONS = {
  home: <><path d="M5 12l-2 0l9 -9l9 9l-2 0" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7" /><path d="M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6" /></>,
  listCheck: <><path d="M3.5 5.5l1.5 1.5l2.5 -2.5" /><path d="M3.5 11.5l1.5 1.5l2.5 -2.5" /><path d="M3.5 17.5l1.5 1.5l2.5 -2.5" /><path d="M11 6l9 0" /><path d="M11 12l9 0" /><path d="M11 18l9 0" /></>,
  chartLine: <><path d="M4 19l16 0" /><path d="M4 15l4 -6l4 2l4 -5l4 4" /></>,
  settings: <><path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z" /><path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" /></>,
  bell: <><path d="M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6" /><path d="M9 17v1a3 3 0 0 0 6 0v-1" /></>,
  mapPin: <><path d="M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" /><path d="M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0z" /></>,
  layoutGrid: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
  circleCheck: <><path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" /><path d="M9 12l2 2l4 -4" /></>,
  arrowRight: <><path d="M5 12l14 0" /><path d="M13 18l6 -6" /><path d="M13 6l6 6" /></>,
  arrowLeft: <><path d="M5 12l14 0" /><path d="M5 12l6 6" /><path d="M5 12l6 -6" /></>,
}

function Icon({ name, size = 20 }: { name: keyof typeof ICONS; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      {ICONS[name]}
    </svg>
  )
}

const NAV_ITEMS: { page: Page; label: string; icon: keyof typeof ICONS; editorsOnly?: boolean }[] = [
  { page: 'summary', label: 'Summary', icon: 'home' },
  { page: 'details', label: 'Details', icon: 'layoutGrid' },
  { page: 'pickup', label: 'Pickup List', icon: 'listCheck' },
  { page: 'history', label: 'History', icon: 'chartLine' },
  { page: 'admin', label: 'Admin', icon: 'settings', editorsOnly: true },
]

// slim sidebar from 1024px (ipad landscape, desktop), floating pill at the bottom below that.
// buttons are 48px, a little over apple's 44px minimum
function NavRail({ page, role, onNavigate }: { page: Page; role: Role; onNavigate: (page: Page) => void }) {
  const items = NAV_ITEMS.filter(i => !i.editorsOnly || role === 'editor')
  const button = (i: (typeof NAV_ITEMS)[number]) => (
    <button
      key={i.page}
      onClick={() => onNavigate(i.page)}
      aria-label={i.label}
      title={i.label}
      aria-current={page === i.page ? 'page' : undefined}
      className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${page === i.page ? 'bg-ivory text-pine' : 'text-mist hover:text-ivory hover:bg-ivory/10'}`}
    >
      <Icon name={i.icon} size={22} />
    </button>
  )
  return (
    <>
      <nav aria-label="Main" className="hidden lg:flex fixed inset-y-0 left-0 z-40 w-[76px] bg-pine flex-col items-center gap-3 py-5">
        <img src={logoUrl} alt="Sac State Sustainability" className="w-14 h-auto mb-4" />
        {items.map(button)}
      </nav>
      <nav aria-label="Main" className="lg:hidden fixed bottom-0 inset-x-0 z-40 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pointer-events-none">
        <div className="pointer-events-auto mx-auto max-w-md bg-pine rounded-full p-1.5 flex justify-between shadow-lg shadow-pine/30">
          {items.map(button)}
        </div>
      </nav>
    </>
  )
}

// avatar + greeting (tap to switch the demo user), synced pill, alert bell
function TopBar({ userName, role, greeting, syncedLabel, alertCount, sampleData, onSwitchUser, onBell }: {
  userName: string
  role: Role
  greeting: string
  syncedLabel: string
  alertCount: number
  sampleData: boolean
  onSwitchUser: () => void
  onBell: () => void
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onSwitchUser}
        title="Switch demo user"
        aria-label={`${userName}, ${role}. Switch demo user`}
        className="flex items-center gap-3 min-h-11 text-left rounded-full -ml-1 pl-1 pr-3 hover:bg-white/60 transition-colors"
      >
        <span className="w-11 h-11 rounded-full bg-pine text-ivory flex items-center justify-center text-sm font-semibold">
          {userName.split(' ').map(n => n[0]).join('')}
        </span>
        <span className="leading-tight">
          <span className="block text-xs text-pine-muted">{greeting},</span>
          <span className="block text-sm font-semibold text-pine">
            {userName} <span className="font-medium text-pine-muted capitalize">· {role}</span>
          </span>
        </span>
      </button>
      <div className="ml-auto flex items-center gap-2">
        {sampleData && (
          <span title="Person 3 shows the bins as if just emptied, to preview the all-clear look" className="inline-flex items-center bg-teal text-ivory text-xs font-semibold px-3.5 py-2 rounded-full">Sample data</span>
        )}
        <span className="hidden sm:inline-flex items-center bg-white text-teal text-xs font-semibold px-3.5 py-2 rounded-full">{syncedLabel}</span>
        <button
          onClick={onBell}
          aria-label={`Alerts, ${alertCount} active`}
          className="relative w-11 h-11 rounded-full bg-white text-pine flex items-center justify-center hover:bg-white/70 transition-colors"
        >
          <Icon name="bell" size={20} />
          {alertCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 rounded-full bg-rose text-pine text-[10px] font-bold flex items-center justify-center">{alertCount}</span>
          )}
        </button>
      </div>
    </div>
  )
}

// ring on the pine hero: dark track, and critical reads in rose (critical red is too dark on pine)
function HeroRing({ fill, size = 88 }: { fill: number; size?: number }) {
  const stroke = 8
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const color = fill >= CRITICAL_AT ? '#C88582' : fill >= WARN_AT ? '#D4A13A' : '#798F53'
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#2A4A3E" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - fill / 100)}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-xl font-bold text-ivory">{fill}%</span>
    </div>
  )
}

function HalfGauge({ pct }: { pct: number }) {
  const len = Math.PI * 40
  const arc = 'M10 52 A40 40 0 0 1 90 52'
  return (
    <svg viewBox="0 0 100 58" className="w-full max-w-[220px] mx-auto" role="img" aria-label={`Campus average fill ${pct}%`}>
      <path d={arc} fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round" />
      <path d={arc} fill="none" stroke="#1B5B65" strokeWidth="9" strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - pct / 100)} />
      <text x="50" y="50" textAnchor="middle" fontSize="16" fontWeight="600" fill="#0F2E23" fontFamily="'DM Mono', monospace">{pct}%</text>
    </svg>
  )
}

// campus outline and bins as dots, projected like the map (web mercator) but drawn as plain
// svg, so the home screen never loads the map library
const SKETCH = (() => {
  const pad = 8
  const toXY = ([lng, lat]: [number, number]) => [(lng * Math.PI) / 180, mercatorY(lat)]
  const pts = campusBoundary.map(toXY)
  const minX = Math.min(...pts.map(p => p[0])), maxX = Math.max(...pts.map(p => p[0]))
  const minY = Math.min(...pts.map(p => p[1])), maxY = Math.max(...pts.map(p => p[1]))
  const k = (100 - 2 * pad) / (maxX - minX)
  const project = (lng: number, lat: number) => {
    const [x, y] = toXY([lng, lat])
    return [pad + (x - minX) * k, pad + (maxY - y) * k] as const
  }
  return {
    height: (maxY - minY) * k + 2 * pad,
    outline: 'M' + campusBoundary.map(([lng, lat]) => project(lng, lat).map(n => n.toFixed(1)).join(' ')).join('L') + 'Z',
    project,
  }
})()

function CampusSketch({ bins }: { bins: Tribin[] }) {
  const zones = [...new Set(bins.map(b => b.zone))].map(zone => {
    const zb = bins.filter(b => b.zone === zone).map(b => SKETCH.project(b.lng, b.lat))
    return { zone, x: zb.reduce((s, p) => s + p[0], 0) / zb.length, y: Math.min(...zb.map(p => p[1])) }
  })
  return (
    <svg viewBox={`0 0 100 ${SKETCH.height.toFixed(1)}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <path d={SKETCH.outline} fill="#fff" stroke="#DCE8E9" strokeWidth="1.2" strokeLinejoin="round" />
      {zones.map(z => (
        <text key={z.zone} x={z.x} y={z.y - 5} textAnchor="middle" fontSize="4.5" fill="#5B6B60" fontFamily="Outfit, sans-serif">{z.zone}</text>
      ))}
      {bins.map(b => {
        const [x, y] = SKETCH.project(b.lng, b.lat)
        return <circle key={b.id} cx={x} cy={y} r="2.6" fill={pinHex(b)} stroke="#fff" strokeWidth="0.8" />
      })}
    </svg>
  )
}

const TILE = 'rounded-3xl p-5 lg:p-6'

const STATUS_PILLS: { status: Status; cls: string }[] = [
  { status: 'critical', cls: 'bg-critical-soft text-status-critical-ink' },
  { status: 'warn', cls: 'bg-warn-soft text-status-warn-ink' },
  { status: 'ok', cls: 'bg-olive-soft text-olive-ink' },
  { status: 'offline', cls: 'bg-offline-soft text-status-offline-ink' },
]

// one short line per bin for the alerts tile
function alertLine(a: Alert) {
  if (a.kind === 'offline') return { text: 'sensor offline', hex: OFFLINE_HEX }
  if (a.kind === 'battery') return { text: `battery ${a.value}%`, hex: fillHex(WARN_AT) }
  return { text: `${a.stream?.toLowerCase()} ${a.value}%`, hex: fillHex(a.value ?? 0) }
}

function SummaryPage({
  bins, needPickup, syncedLabel, hero, statusCounts, campusAvg, onlineCount, zones, topAlerts, alertCount,
  onShowOnMap, onOpenDetail, onStatus, onZone, onPickup, onOpenMap, onAlert, onViewAllAlerts,
}: {
  bins: Tribin[] // the signed-in user's bins
  needPickup: number
  syncedLabel: string
  hero: Tribin | undefined
  statusCounts: Record<Status, number>
  campusAvg: number
  onlineCount: number
  zones: { zone: Zone; pickup: number; total: number }[]
  topAlerts: Alert[]
  alertCount: number
  onShowOnMap: (binId: string) => void
  onOpenDetail: (bin: Tribin) => void
  onStatus: (status: Status) => void
  onZone: (zone: Zone) => void
  onPickup: () => void
  onOpenMap: () => void
  onAlert: (binId: string) => void
  onViewAllAlerts: () => void
}) {
  return (
    <>
      <div>
        <h1 className="text-3xl lg:text-4xl font-semibold text-pine leading-tight">At a glance</h1>
        <span className="sm:hidden mt-3 inline-flex items-center bg-white text-teal text-xs font-semibold px-3.5 py-2 rounded-full">{syncedLabel}</span>
      </div>

      {/* bento: 2 columns on phone and ipad portrait, 4 from 1024px. the pickup tile lists
          every zone as a row, so more zones grow it instead of adding tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4
        [grid-template-areas:'hero_hero'_'status_status'_'pickup_pickup'_'gauge_map'_'alerts_alerts']
        md:[grid-template-areas:'hero_hero'_'status_status'_'pickup_pickup'_'map_map'_'gauge_alerts']
        lg:[grid-template-areas:'hero_hero_gauge_status'_'map_map_pickup_pickup'_'map_map_alerts_alerts']">

        {/* hero: fullest online bin */}
        {hero ? (
          <div
            role="button"
            tabIndex={0}
            onClick={() => onOpenDetail(hero)}
            onKeyDown={onActivate(() => onOpenDetail(hero))}
            aria-label={`${hero.name}, fullest bin at ${maxFill(hero)}%. Open details`}
            className={`[grid-area:hero] ${TILE} bg-pine text-ivory flex items-center gap-5 cursor-pointer`}
          >
            <HeroRing fill={maxFill(hero)} />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-mist">Fullest bin</p>
              <p className="text-2xl font-semibold leading-tight">{hero.name}</p>
              <p className="text-sm text-mist truncate">{hero.location}, {hero.zone}</p>
              <button
                onClick={e => { e.stopPropagation(); onShowOnMap(hero.id) }}
                className="mt-3 inline-flex items-center gap-1.5 bg-ivory text-pine text-sm font-semibold px-4 min-h-11 rounded-full hover:bg-white transition-colors"
              >
                <Icon name="mapPin" size={16} />
                Show on map
              </button>
            </div>
          </div>
        ) : (
          <div className={`[grid-area:hero] ${TILE} bg-pine text-ivory`}>
            <p className="text-xs text-mist">Fullest bin</p>
            <p className="text-lg font-semibold mt-1">No bins are online right now</p>
          </div>
        )}

        {/* status counts as four equal mini-tiles (2x2, or 4 across when the tile is full width on
            ipad portrait); on desktop they stretch to the tile's height. each opens details for it */}
        <div className={`[grid-area:status] ${TILE} bg-white flex flex-col`}>
          <p className="text-xs font-semibold text-pine mb-3">Status</p>
          <div className="flex-1 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-2 auto-rows-fr gap-2">
            {STATUS_PILLS.map(s => (
              <button
                key={s.status}
                onClick={() => onStatus(s.status)}
                aria-label={`${statusCounts[s.status]} ${statusLabel(s.status)}. Show these bins`}
                className={`flex flex-col justify-center gap-1 min-h-11 px-3.5 lg:px-3 py-2.5 rounded-2xl text-left ${s.cls} hover:brightness-95 transition`}
              >
                <span className="text-xs font-semibold">{statusLabel(s.status)}</span>
                <span className="font-mono text-2xl font-bold leading-none">{statusCounts[s.status]}</span>
              </button>
            ))}
          </div>
        </div>

        <div className={`[grid-area:gauge] ${TILE} bg-teal-soft flex flex-col`}>
          <p className="text-xs font-semibold text-teal mb-2">Campus average</p>
          <div className="flex-1 flex items-center"><HalfGauge pct={campusAvg} /></div>
          <p className="text-[11px] text-teal text-center mt-1">average fill, {onlineCount} online bins</p>
        </div>

        {/* the campus is taller than wide, so the full-width ipad-portrait tile gets extra height */}
        <div className={`[grid-area:map] ${TILE} bg-white flex flex-col gap-3 min-h-[220px] md:min-h-[380px] lg:min-h-[220px]`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-teal">Campus map</p>
            <button onClick={onOpenMap} className="inline-flex items-center gap-1.5 bg-pine text-ivory text-sm font-semibold px-4 min-h-11 rounded-full hover:bg-forest-light transition-colors">
              <Icon name="mapPin" size={16} />
              Open map
            </button>
          </div>
          {/* the sketch fills whatever height the grid gives this tile rather than setting it,
              so its tall campus shape can't stretch the rows */}
          <button onClick={onOpenMap} aria-label="Open map" className="relative flex-1 min-h-[140px] rounded-2xl bg-ivory overflow-hidden">
            <span className="absolute inset-2"><CampusSketch bins={bins} /></span>
          </button>
        </div>

        {/* one tile for pickups: the total up top, then a row per zone. rose while anything
            needs pickup, olive when nothing does. fills the whole area for any number of zones */}
        <div className={`[grid-area:pickup] ${TILE} flex flex-col ${needPickup === 0 ? 'bg-olive-soft' : 'bg-rose/20'}`}>
          <button
            onClick={onPickup}
            aria-label={needPickup === 0 ? 'All clear, no bins need pickup. Show all bins' : `${needPickup} ${needPickup === 1 ? 'bin needs' : 'bins need'} pickup. Show bins, fullest first`}
            className="text-left rounded-2xl -m-2 p-2 hover:bg-white/40 transition-colors"
          >
            <span className="flex items-center justify-between w-full text-sm font-semibold text-pine">
              Needs pickup
              <Icon name={needPickup === 0 ? 'circleCheck' : 'arrowRight'} size={18} />
            </span>
            {needPickup === 0 ? (
              <>
                <span className="block mt-3 text-3xl font-bold text-pine leading-none">All clear</span>
                <span className="block text-sm mt-1.5 text-olive-ink">No bins need pickup</span>
              </>
            ) : (
              <span className="block mt-3 text-3xl font-bold text-pine leading-tight">
                <span className="font-mono">{needPickup}</span> {needPickup === 1 ? 'bin needs' : 'bins need'} pickup
              </span>
            )}
          </button>
          <div className="mt-4 border-t border-pine/10 divide-y divide-pine/10">
            {zones.map(z => (
              <button
                key={z.zone}
                onClick={() => onZone(z.zone)}
                aria-label={`${z.zone}: ${z.pickup} of ${z.total} bins need pickup. Show this zone`}
                className="w-full flex items-center gap-3 min-h-11 py-2 px-2 -mx-2 text-left rounded-xl hover:bg-white/40 transition-colors"
              >
                <span className="flex-1 text-sm font-semibold text-pine">{z.zone}</span>
                <span className="text-sm text-pine"><span className="font-mono font-bold">{z.pickup}</span> of {z.total} bins</span>
                <Icon name="arrowRight" size={16} />
              </button>
            ))}
          </div>
        </div>

        <div className={`[grid-area:alerts] ${TILE} bg-white`}>
          <div className="flex items-center gap-2 mb-2">
            <p className="text-xs font-semibold text-pine">Alerts</p>
            {alertCount > 0 && <span className="text-[10px] bg-rose/25 text-pine font-semibold px-2 py-0.5 rounded-full">{alertCount} active</span>}
            <button onClick={onViewAllAlerts} className="ml-auto text-sm font-semibold text-teal min-h-11 px-2 -mr-2 hover:underline">View all</button>
          </div>
          {topAlerts.length === 0 ? (
            <p className="text-sm text-pine-muted py-2">No active alerts</p>
          ) : (
            <div className="space-y-1">
              {topAlerts.map(a => {
                const line = alertLine(a)
                return (
                  <button key={a.id} onClick={() => onAlert(a.binId)} className="w-full flex items-center gap-3 min-h-11 text-left rounded-xl px-2 -mx-2 hover:bg-ivory transition-colors">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: line.hex }} />
                    <span className="text-sm min-w-0 truncate">
                      <span className="font-semibold text-pine">{a.binName}</span> <span className="text-pine-muted">{line.text}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function ComingSoon({ title, icon, text }: { title: string; icon: keyof typeof ICONS; text: string }) {
  return (
    <>
      <h1 className="text-3xl lg:text-4xl font-semibold text-pine">{title}</h1>
      <div className={`${TILE} bg-white py-16 text-center`}>
        <span className="mx-auto mb-4 w-14 h-14 rounded-full bg-olive-soft text-olive-ink flex items-center justify-center">
          <Icon name={icon} size={26} />
        </span>
        <p className="text-lg font-semibold text-pine">Coming soon</p>
        <p className="text-sm text-pine-muted mt-1 max-w-sm mx-auto">{text}</p>
      </div>
    </>
  )
}

// role and zone controls for one person, shared by the admin table and the phone cards.
// nobody can change their own role, and only editors reach admin, so an editor always remains
function StaffEditor({ member, isSelf, onToggleRole, onToggleZone }: {
  member: StaffMember
  isSelf: boolean
  onToggleRole: () => void
  onToggleZone: (zone: Zone) => void
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-xs font-semibold text-stone-500">Role:</span>
        <button
          onClick={onToggleRole}
          disabled={isSelf}
          className="text-xs min-h-11 px-4 rounded-lg border border-stone-200 bg-white hover:border-mint transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-stone-200"
        >
          Toggle → {member.role === 'editor' ? 'viewer' : 'editor'}
        </button>
        {isSelf && <span className="text-xs text-stone-500">You can't change your own role. Ask another editor.</span>}
      </div>
      <div>
        <p className="text-xs font-semibold text-stone-500 mb-2">Zone assignments:</p>
        <div className="flex flex-wrap gap-2">
          {ALL_ZONES.map(zone => (
            <button
              key={zone}
              onClick={() => onToggleZone(zone)}
              className={`text-xs min-h-11 px-4 rounded-lg border transition-colors font-medium ${
                member.zones.includes(zone)
                  ? 'bg-mint/20 border-mint text-mint-dark'
                  : 'bg-white border-stone-200 text-stone-400 hover:border-stone-300'
              }`}
            >
              {zone}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// a viewer with no zones assigned sees this instead of bins
function NoZonesNotice() {
  return (
    <div className={`${TILE} bg-white py-16 text-center`}>
      <span className="mx-auto mb-4 w-14 h-14 rounded-full bg-teal-soft text-teal flex items-center justify-center">
        <Icon name="mapPin" size={26} />
      </span>
      <p className="text-lg font-semibold text-pine">No zones assigned yet</p>
      <p className="text-sm text-pine-muted mt-1 max-w-sm mx-auto">Ask an admin to add you to a zone. Its bins and alerts will show up here.</p>
    </div>
  )
}

// "2 min ago" / "3 hours ago" -> minutes
function minutesAgo(label: string) {
  const m = label.match(/(\d+)\s*(min|hour)/)
  return m ? Number(m[1]) * (m[2] === 'hour' ? 60 : 1) : Infinity
}

// main app

export default function App() {
  // demo sign-in: the avatar cycles person 1 (editor), person 2 (viewer), person 3 (viewer, sample data)
  const [currentUserId, setCurrentUserId] = useState('s1')
  const [filterZone, setFilterZone] = useState<Zone | 'All'>('All')
  const [sortBy, setSortBy] = useState<'fill' | 'zone' | 'status' | 'name'>('fill')
  const [filterStatus, setFilterStatus] = useState<Status | 'All'>('All')
  const [alertThreshold, setAlertThreshold] = useState(80)
  const [dismissedIds, setDismissedIds] = useState<string[]>([])
  const [selectedBin, setSelectedBin] = useState<Tribin | null>(null)
  const [page, setPage] = useState<Page>('summary')
  const [editingStaff, setEditingStaff] = useState<string | null>(null)
  const [staffList, setStaffList] = useState<StaffMember[]>(STAFF)

  // role and zones come from the staff list, so changes in admin apply right away.
  // editors see every bin; viewers only bins in the zones an admin assigned them.
  // display filtering only: real access control has to live in the backend
  const currentUser = staffList.find(s => s.id === currentUserId) ?? staffList[0]
  const currentRole = currentUser.role
  const visibleZones = currentRole === 'editor' ? ALL_ZONES : ALL_ZONES.filter(z => currentUser.zones.includes(z))
  const zonesKey = visibleZones.join()
  const sampleData = currentUserId === SAMPLE_USER_ID
  const myBins = useMemo(
    () => (sampleData ? SAMPLE_CLEAR_BINS : TRIBINS).filter(b => visibleZones.includes(b.zone)),
    [zonesKey, sampleData],
  )
  const noZones = myBins.length === 0

  const [viewMode, setViewMode] = useState<'cards' | 'map'>('cards')
  // bin whose card is open on the map, highlighted in cards view until the card is closed
  const [mapBinId, setMapBinId] = useState<string | null>(null)
  const [mapFocus, setMapFocus] = useState<MapFocus | null>(null)
  const [scrollReq, setScrollReq] = useState<{ target: 'bins' | 'alerts'; n: number } | null>(null)
  const binsRef = useRef<HTMLDivElement>(null)
  const alertsRef = useRef<HTMLDivElement>(null)

  // eased, gliding wheel/trackpad scrolling (like framer's smooth scroll). touch keeps the device's
  // own scrolling, and lenis turns smoothing off when "reduce motion" is set. the map and the
  // alerts list opt out with data-lenis-prevent so they keep their own wheel behavior
  const lenisRef = useRef<Lenis | null>(null)
  useEffect(() => {
    const lenis = new Lenis({ autoRaf: true, lerp: 0.1, smoothWheel: true, syncTouch: false })
    lenisRef.current = lenis
    return () => {
      lenis.destroy()
      lenisRef.current = null
    }
  }, [])

  // each page starts at the top, straight away since its content is new (runs before the
  // scroll request below, which may then glide it)
  useEffect(() => {
    const lenis = lenisRef.current
    if (lenis) {
      lenis.resize() // the new page's height, or later scrolls get clamped to the old one
      lenis.scrollTo(0, { immediate: true, force: true })
    } else {
      window.scrollTo(0, 0)
    }
  }, [page])

  // a filter or open card from before a user/zone change may point outside the new zones
  useEffect(() => {
    setFilterZone('All')
    setMapBinId(null)
    setSelectedBin(null)
  }, [currentUserId, zonesKey])

  // scroll after render, and only when the target isn't fully on screen. in map view the target
  // is the map itself, so a jumped-to pin (aimed low in the map) clears the floating tab bar
  useEffect(() => {
    if (!scrollReq) return
    const holder = { bins: binsRef, alerts: alertsRef }[scrollReq.target].current
    const el = (scrollReq.target === 'bins' && holder?.querySelector<HTMLElement>('[data-map]')) || holder
    if (!el) return
    const { top, bottom } = el.getBoundingClientRect()
    const visibleBottom = window.innerHeight - (window.innerWidth < 1024 ? 96 : 0) // tab bar
    if (top >= 8 && bottom <= visibleBottom) return
    const lenis = lenisRef.current
    if (lenis) lenis.scrollTo(el, { force: true }) // lenis honors the target's scroll-mt-4 gap
    else el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [scrollReq])

  function requestScroll(target: 'bins' | 'alerts') {
    setScrollReq(prev => ({ target, n: (prev?.n ?? 0) + 1 }))
  }

  // alerts rebuild when the threshold changes
  const alerts = useMemo<Alert[]>(() => {
    const out: Alert[] = []
    for (const bin of myBins) {
      if (bin.sensorStatus === 'offline') {
        out.push({
          id: `${bin.id}-offline`, binId: bin.id, binName: bin.name, zone: bin.zone,
          message: `Sensor offline, last contact ${bin.lastUpdated}`, severity: 'critical', time: bin.lastUpdated,
          kind: 'offline',
        })
      } else {
        for (const c of bin.compartments) {
          if (c.fill >= alertThreshold) {
            const isCritical = c.fill >= CRITICAL_AT
            out.push({
              id: `${bin.id}-${c.label}`, binId: bin.id, binName: bin.name, zone: bin.zone,
              message: `${c.label} compartment at ${c.fill}%${isCritical ? ': immediate collection required' : ''}`,
              severity: isCritical ? 'critical' : 'warn', time: bin.lastUpdated,
              kind: 'fill', stream: c.label, value: c.fill,
            })
          }
        }
      }
      if (bin.battery <= 20) {
        out.push({
          id: `${bin.id}-battery`, binId: bin.id, binName: bin.name, zone: bin.zone,
          message: `Battery low: ${bin.battery}% remaining`, severity: 'warn', time: bin.lastUpdated,
          kind: 'battery', value: bin.battery,
        })
      }
    }
    return out
  }, [alertThreshold, myBins])

  const visibleAlerts = alerts.filter(a => !dismissedIds.includes(a.id))
  const unreadCount = visibleAlerts.length

  // summary numbers. offline sensors report stale fills, so they're left out of fill-based ones
  const onlineBins = myBins.filter(b => b.sensorStatus === 'online')
  const needPickup = onlineBins.filter(b => maxFill(b) >= alertThreshold).length
  const heroBin = [...onlineBins].sort((a, b) => maxFill(b) - maxFill(a))[0]
  const statusCounts = { critical: 0, warn: 0, ok: 0, offline: 0 }
  for (const b of myBins) statusCounts[binStatus(b)]++
  const campusAvg = onlineBins.length ? Math.round(onlineBins.reduce((s, b) => s + avgFill(b), 0) / onlineBins.length) : 0
  const zoneCounts = visibleZones.map(zone => {
    const zb = myBins.filter(b => b.zone === zone)
    return { zone, pickup: zb.filter(b => b.sensorStatus === 'online' && maxFill(b) >= alertThreshold).length, total: zb.length }
  })
  const syncedMin = Math.min(...onlineBins.map(b => minutesAgo(b.lastUpdated)))
  const syncedLabel = !Number.isFinite(syncedMin) ? 'Not synced' : syncedMin < 60 ? `Synced ${syncedMin} min ago` : `Synced ${Math.floor(syncedMin / 60)} hr ago`
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const userName = currentUser.name

  // top alerts tile: each bin's most urgent alert, full-critical first, then offline, then the rest
  const alertRank = (a: Alert) => (a.kind === 'fill' ? ((a.value ?? 0) >= CRITICAL_AT ? 0 : 2) : a.kind === 'offline' ? 1 : 3)
  const worstPerBin = new Map<string, Alert>()
  for (const a of visibleAlerts) {
    const cur = worstPerBin.get(a.binId)
    if (!cur || alertRank(a) < alertRank(cur) || (alertRank(a) === alertRank(cur) && (a.value ?? 0) > (cur.value ?? 0))) worstPerBin.set(a.binId, a)
  }
  const topAlerts = [...worstPerBin.values()]
    .sort((a, b) => alertRank(a) - alertRank(b) || (b.value ?? 0) - (a.value ?? 0))
    .slice(0, 3)

  const filteredBins = useMemo(() => {
    let bins = [...myBins]
    if (filterZone !== 'All') bins = bins.filter(b => b.zone === filterZone)
    if (filterStatus !== 'All') bins = bins.filter(b => binStatus(b) === filterStatus)
    bins.sort((a, b) => {
      if (sortBy === 'fill') return maxFill(b) - maxFill(a)
      if (sortBy === 'zone') return a.zone.localeCompare(b.zone)
      if (sortBy === 'name') return a.name.localeCompare(b.name)
      if (sortBy === 'status') {
        const order = { critical: 0, warn: 1, ok: 2, offline: 3 }
        return order[binStatus(a)] - order[binStatus(b)]
      }
      return 0
    })
    return bins
  }, [myBins, filterZone, filterStatus, sortBy])

  const mapBin = myBins.find(b => b.id === mapBinId) ?? null

  // the picked bin keeps its pin even when the filters hide it
  const mapBins = useMemo(
    () => (mapBin && !filteredBins.includes(mapBin) ? [...filteredBins, mapBin] : filteredBins),
    [filteredBins, mapBin],
  )
  const shownCount = viewMode === 'map' ? mapBins.length : filteredBins.length

  function showOnMap(binId: string) {
    setPage('details')
    setViewMode('map')
    setMapBinId(binId)
    setMapFocus(prev => ({ id: binId, n: (prev?.n ?? 0) + 1 }))
    requestScroll('bins')
  }

  // details, filtered to what was tapped on the summary
  function openDetails(filter: { status?: Status; zone?: Zone }) {
    setFilterStatus(filter.status ?? 'All')
    setFilterZone(filter.zone ?? 'All')
    setViewMode('cards')
    setPage('details')
  }

  // every bin, fullest first, so the ones needing pickup lead
  function openPickupBins() {
    setSortBy('fill')
    openDetails({})
  }

  // the whole campus, nothing picked
  function openMap() {
    openDetails({})
    setViewMode('map')
    setMapBinId(null)
    setMapFocus(null)
    requestScroll('bins')
  }

  // jumps from the summary start from all bins; inside details, showOnMap keeps the filters
  function showOnMapFromSummary(binId: string) {
    setFilterStatus('All')
    setFilterZone('All')
    showOnMap(binId)
  }

  function openAlerts() {
    setPage('details')
    requestScroll('alerts')
  }

  function dismissAlert(id: string) {
    setDismissedIds(prev => (prev.includes(id) ? prev : [...prev, id]))
  }

  function clearAllAlerts() {
    setDismissedIds(prev => [...new Set([...prev, ...visibleAlerts.map(a => a.id)])])
  }

  function toggleZoneAssignment(staffId: string, zone: Zone) {
    setStaffList(prev => prev.map(s => {
      if (s.id !== staffId) return s
      const has = s.zones.includes(zone)
      return { ...s, zones: has ? s.zones.filter(z => z !== zone) : [...s.zones, zone] }
    }))
  }

  function toggleStaffRole(staffId: string) {
    if (staffId === currentUserId) return // can't change your own role (the button is disabled too)
    setStaffList(prev => prev.map(s =>
      s.id === staffId ? { ...s, role: s.role === 'editor' ? 'viewer' : 'editor' } : s
    ))
  }

  return (
    <div className="min-h-screen bg-sage font-sans" style={{ fontFamily: 'Outfit, system-ui, sans-serif' }}>
      <NavRail page={page} role={currentRole} onNavigate={setPage} />

      {/* left padding clears the sidebar from 1024px; the footer's clears the floating tab bar below that */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:pl-[calc(76px+2rem)] lg:pr-8 pt-5 lg:pt-8 pb-6 space-y-5 lg:space-y-6">
        <TopBar
          userName={userName}
          role={currentRole}
          greeting={greeting}
          syncedLabel={syncedLabel}
          alertCount={unreadCount}
          onSwitchUser={() => setCurrentUserId(id => ({ s1: 's2', s2: 's3' } as Record<string, string>)[id] ?? 's1')}
          sampleData={sampleData}
          onBell={openAlerts}
        />

        {/* keyed by page so the content fades in on every switch; the header and nav stay put */}
        <div key={page} className="animate-page-in motion-reduce:animate-none space-y-5 lg:space-y-6">
          {page === 'summary' && noZones && <NoZonesNotice />}
          {page === 'summary' && !noZones && (
            <SummaryPage
              bins={myBins}
              needPickup={needPickup}
              syncedLabel={syncedLabel}
              hero={heroBin}
              statusCounts={statusCounts}
              campusAvg={campusAvg}
              onlineCount={onlineBins.length}
              zones={zoneCounts}
              topAlerts={topAlerts}
              alertCount={unreadCount}
              onShowOnMap={showOnMapFromSummary}
              onOpenDetail={setSelectedBin}
              onStatus={status => openDetails({ status })}
              onZone={zone => openDetails({ zone })}
              onPickup={openPickupBins}
              onOpenMap={openMap}
              onAlert={showOnMapFromSummary}
              onViewAllAlerts={openAlerts}
            />
          )}

          {page === 'pickup' && <ComingSoon title="Pickup List" icon="listCheck" text="The bins to empty next, in pickup order, will live here." />}
          {page === 'history' && <ComingSoon title="History" icon="chartLine" text="Past fill levels and pickups for each bin will live here." />}

          {page === 'details' && (
            <>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setPage('summary')}
                  aria-label="Back to Summary"
                  className="inline-flex items-center gap-1.5 bg-white text-pine text-sm font-semibold pl-3 pr-4 min-h-11 rounded-full hover:bg-white/70 transition-colors"
                >
                  <Icon name="arrowLeft" size={18} />
                  Summary
                </button>
                <h1 className="text-3xl lg:text-4xl font-semibold text-pine">Details</h1>
              </div>
              {/* content: bins + sidebar */}
              {noZones ? <NoZonesNotice /> : (
              <div className="flex flex-col lg:flex-row gap-6">

                {/* left: bins grid */}
                <div ref={binsRef} className="flex-1 min-w-0 space-y-4 scroll-mt-4">
                  {/* filters */}
                  <div className="flex flex-wrap gap-2 items-center">
                    <div className="flex items-center bg-white rounded-xl border border-stone-200 p-0.5 text-xs" role="group" aria-label="View">
                      {(['cards', 'map'] as const).map(mode => (
                        <button key={mode} onClick={() => { setViewMode(mode); setMapFocus(null) }} aria-pressed={viewMode === mode}
                          className={`px-3 py-1.5 rounded-[10px] font-medium transition-colors ${viewMode === mode ? 'bg-teal text-ivory' :'text-stone-400 hover:text-stone-600'}`}
                        >{mode === 'cards' ? 'Cards' : 'Map'}</button>
                      ))}
                    </div>

                    <div className="flex items-center gap-1.5 bg-white rounded-xl border border-stone-200 px-3 py-2 text-xs">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                      <span className="text-stone-400 font-medium mr-1">Zone:</span>
                      <select value={filterZone} onChange={e => setFilterZone(e.target.value as any)}
                        className="bg-transparent font-medium text-forest outline-none cursor-pointer pr-1">
                        <option value="All">All</option>
                        {visibleZones.map(z => <option key={z} value={z}>{z}</option>)}
                      </select>
                    </div>

                    <div className="flex items-center gap-1.5 bg-white rounded-xl border border-stone-200 px-3 py-2 text-xs">
                      <span className="text-stone-400 font-medium mr-1">Status:</span>
                      <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)}
                        className="bg-transparent font-medium text-forest outline-none cursor-pointer pr-1">
                        <option value="All">All</option>
                        <option value="critical">Critical</option>
                        <option value="warn">Warning</option>
                        <option value="ok">OK</option>
                        <option value="offline">Offline</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-1.5 bg-white rounded-xl border border-stone-200 px-3 py-2 text-xs">
                      <span className="text-stone-400 font-medium mr-1">Sort:</span>
                      <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
                        className="bg-transparent font-medium text-forest outline-none cursor-pointer pr-1">
                        <option value="fill">Fill % (high→low)</option>
                        <option value="status">Status</option>
                        <option value="zone">Zone</option>
                        <option value="name">Name</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-1.5 bg-white rounded-xl border border-stone-200 px-3 py-2 text-xs">
                      <span className="text-stone-400 font-medium">Alert at</span>
                      {/* -/+ look the same in every browser (ipad safari has no number arrows); before: pads the tap area */}
                      <button
                        onClick={() => setAlertThreshold(t => Math.max(10, t - 5))}
                        disabled={alertThreshold <= 10}
                        aria-label="Lower alert threshold"
                        className="relative w-4 h-4 flex items-center justify-center font-semibold text-stone-400 hover:text-forest disabled:text-stone-200 transition-colors before:absolute before:-inset-x-1.5 before:-inset-y-3.5"
                      >−</button>
                      <input
                        type="number" min={10} max={100} step={5} value={alertThreshold}
                        onChange={e => setAlertThreshold(Math.min(100, Math.max(10, Number(e.target.value) || 0)))}
                        aria-label="Alert threshold"
                        className="w-7 text-center bg-transparent font-medium text-forest outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                      <span className="text-stone-400 font-medium">%</span>
                      <button
                        onClick={() => setAlertThreshold(t => Math.min(100, t + 5))}
                        disabled={alertThreshold >= 100}
                        aria-label="Raise alert threshold"
                        className="relative w-4 h-4 flex items-center justify-center font-semibold text-stone-400 hover:text-forest disabled:text-stone-200 transition-colors before:absolute before:-inset-x-1.5 before:-inset-y-3.5"
                      >+</button>
                    </div>

                    <span className="ml-auto text-xs text-stone-400 font-mono">{filteredBins.length} bin{filteredBins.length !== 1 ? 's' : ''}</span>
                  </div>

                  {/* grid or map */}
                  {shownCount === 0 ? (
                    <div className="py-16 text-center text-stone-400">
                      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="block mx-auto mb-2"><path d="M4 7h16M9 7V4h6v3M10 11v6M14 11v6M6 7l1 13h10l1-13"/></svg>
                      <p className="text-sm">No bins match these filters.</p>
                    </div>
                  ) : viewMode === 'map' ? (
                    <BinMap
                      bins={mapBins}
                      fitKey={filteredBins.map(b => b.id).join()}
                      selectedId={mapBinId}
                      focus={mapFocus}
                      onSelect={setMapBinId}
                      onClosePopup={() => setMapBinId(null)}
                      onOpenDetail={setSelectedBin}
                    />
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                      {filteredBins.map(bin => (
                        <BinCard key={bin.id} bin={bin} onClick={() => setSelectedBin(bin)} onShowOnMap={() => showOnMap(bin.id)} highlighted={bin.id === mapBinId} />
                      ))}
                    </div>
                  )}
                </div>

                {/* right: alerts panel */}
                <aside className="w-full lg:w-72 xl:w-80 shrink-0 space-y-3">
                  <div ref={alertsRef} className="flex items-center justify-between scroll-mt-4">
                    <h2 className="text-xs uppercase tracking-widest text-stone-400 font-semibold">Alerts</h2>
                    {unreadCount > 0 && (
                      <div className="flex items-center gap-3">
                        <button
                          onClick={clearAllAlerts}
                          className="relative text-[10px] font-semibold text-stone-400 hover:text-forest transition-colors before:absolute before:-inset-x-2 before:-inset-y-3"
                        >Clear all</button>
                        <span className="text-[10px] bg-rose/25 text-pine font-semibold px-2 py-0.5 rounded-full">{unreadCount} active</span>
                      </div>
                    )}
                  </div>

                  <div data-lenis-prevent className="space-y-2 max-h-[600px] overflow-y-auto pr-0.5">
                    {visibleAlerts.length === 0 ? (
                      <div className="py-10 text-center text-stone-400">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="block mx-auto mb-1"><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/></svg>
                        <p className="text-xs">No active alerts</p>
                      </div>
                    ) : visibleAlerts.map(a => (
                      <AlertItem key={a.id} alert={a} onDismiss={dismissAlert} onSelect={alert => showOnMap(alert.binId)} />
                    ))}
                  </div>

                  {/* summary stats */}
                  <div className="bg-white rounded-2xl border border-stone-200 p-4 mt-4">
                    <p className="text-[11px] uppercase tracking-widest text-stone-400 font-semibold mb-3">Landfill Activity</p>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: 'Total Bins', value: myBins.length, color: 'text-forest' },
                        { label: 'Critical', value: myBins.filter(b => binStatus(b) === 'critical').length, color: 'text-status-critical-ink' },
                        { label: 'Warning', value: myBins.filter(b => binStatus(b) === 'warn').length, color: 'text-status-warn-ink' },
                        { label: 'Offline', value: myBins.filter(b => b.sensorStatus === 'offline').length, color: 'text-status-offline-ink' },
                      ].map(s => (
                        <div key={s.label} className="text-center py-2 bg-sage rounded-xl">
                          <p className={`font-mono font-bold text-xl ${s.color}`}>{s.value}</p>
                          <p className="text-[10px] text-stone-400 mt-0.5">{s.label}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 pt-3 border-t border-stone-100">
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-stone-400">Landfill activity</span>
                        <span className="font-mono font-semibold text-forest">
                          {Math.round(myBins.reduce((s, b) => s + avgFill(b), 0) / Math.max(1, myBins.length))}%
                        </span>
                      </div>
                      <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                        <div className="h-full bg-olive rounded-full" style={{ width: `${Math.round(myBins.reduce((s, b) => s + avgFill(b), 0) / Math.max(1, myBins.length))}%` }} />
                      </div>
                    </div>
                  </div>
                </aside>
              </div>
              )}
            </>
          )}

          {/* manage tab */}
          {page === 'admin' && currentRole === 'editor' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-2xl text-forest">Staff &amp; Zone Management</h2>
                  <p className="text-sm text-stone-400 mt-0.5">Manage roles and zone assignments for your team.</p>
                </div>
                <span className="text-xs bg-mint/20 text-mint-dark px-3 py-1.5 rounded-full font-semibold whitespace-nowrap">Editors only</span>
              </div>

              {/* phones: one card per person (the table doesn't fit) */}
              <div className="md:hidden space-y-3">
                {staffList.map(member => {
                  const editing = editingStaff === member.id
                  return (
                    <div key={member.id} className="bg-white rounded-2xl border border-stone-200 p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-mint/20 flex items-center justify-center text-xs font-bold text-mint-dark shrink-0">
                          {member.name.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-forest">{member.name}{member.id === currentUserId && <span className="text-stone-400 font-normal"> (you)</span>}</p>
                          <p className="text-stone-400 font-mono text-xs truncate">{member.email}</p>
                        </div>
                        <span className={`text-[11px] font-semibold px-2 py-1 rounded-full ${member.role === 'editor' ? 'bg-mint/20 text-mint-dark' : 'bg-stone-100 text-stone-500'}`}>
                          {member.role}
                        </span>
                      </div>
                      {!editing && (
                        <div className="flex flex-wrap gap-1 mt-3">
                          {member.zones.length === 0
                            ? <span className="text-xs text-stone-400">No zones</span>
                            : member.zones.map(z => <span key={z} className="text-[10px] bg-sage-dark text-stone-600 px-2 py-0.5 rounded-md">{z}</span>)}
                        </div>
                      )}
                      {editing && (
                        <div className="mt-4 pt-4 border-t border-stone-100">
                          <StaffEditor
                            member={member}
                            isSelf={member.id === currentUserId}
                            onToggleRole={() => toggleStaffRole(member.id)}
                            onToggleZone={zone => toggleZoneAssignment(member.id, zone)}
                          />
                        </div>
                      )}
                      <button
                        onClick={() => setEditingStaff(editing ? null : member.id)}
                        aria-label={`${editing ? 'Done editing' : 'Edit'} ${member.name}`}
                        className="mt-3 w-full min-h-11 rounded-xl border border-stone-200 text-sm font-semibold text-forest hover:border-mint transition-colors"
                      >
                        {editing ? 'Done' : 'Edit'}
                      </button>
                    </div>
                  )
                })}
              </div>

              {/* ipad and up: the table */}
              <div className="hidden md:block bg-white rounded-2xl border border-stone-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-stone-100 bg-sage">
                      <th className="text-left px-5 py-3 text-[11px] uppercase tracking-wider text-stone-400 font-semibold">Name</th>
                      <th className="text-left px-5 py-3 text-[11px] uppercase tracking-wider text-stone-400 font-semibold">Email</th>
                      <th className="text-left px-5 py-3 text-[11px] uppercase tracking-wider text-stone-400 font-semibold">Role</th>
                      <th className="text-left px-5 py-3 text-[11px] uppercase tracking-wider text-stone-400 font-semibold">Zones</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {staffList.map((member, i) => (
                      <Fragment key={member.id}>
                        <tr className={`border-b border-stone-50 hover:bg-sage/50 transition-colors ${i === staffList.length - 1 ? 'border-0' : ''}`}>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-full bg-mint/20 flex items-center justify-center text-xs font-bold text-mint-dark">
                                {member.name.split(' ').map(n => n[0]).join('')}
                              </div>
                              <span className="font-medium text-forest">{member.name}{member.id === currentUserId && <span className="text-stone-400 font-normal"> (you)</span>}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-stone-400 font-mono text-xs">{member.email}</td>
                          <td className="px-5 py-3.5">
                            <span className={`text-[11px] font-semibold px-2 py-1 rounded-full ${member.role === 'editor' ? 'bg-mint/20 text-mint-dark' : 'bg-stone-100 text-stone-500'}`}>
                              {member.role}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex flex-wrap gap-1">
                              {member.zones.map(z => (
                                <span key={z} className="text-[10px] bg-sage-dark text-stone-600 px-2 py-0.5 rounded-md">{z}</span>
                              ))}
                            </div>
                          </td>
                          <td className="px-5 py-1 text-right">
                            {/* min-h-11: a 44px tap area around the small text */}
                            <button
                              onClick={() => setEditingStaff(editingStaff === member.id ? null : member.id)}
                              aria-label={`${editingStaff === member.id ? 'Done editing' : 'Edit'} ${member.name}`}
                              className="min-h-11 px-3 -mr-3 text-xs text-stone-400 hover:text-forest transition-colors font-medium"
                            >
                              {editingStaff === member.id ? 'Done' : 'Edit'}
                            </button>
                          </td>
                        </tr>
                        {editingStaff === member.id && (
                          <tr key={`${member.id}-edit`} className="bg-sage/40">
                            <td colSpan={5} className="px-5 py-4">
                              <StaffEditor
                                member={member}
                                isSelf={member.id === currentUserId}
                                onToggleRole={() => toggleStaffRole(member.id)}
                                onToggleZone={zone => toggleZoneAssignment(member.id, zone)}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* viewers can't open admin */}
          {page === 'admin' && currentRole !== 'editor' && (
            <div className="py-24 text-center">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="block mx-auto mb-3"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>
              <p className="text-stone-500 text-sm">Editor access required.</p>
            </div>
          )}
        </div>
      </main>

      {/* bin detail modal */}
      {selectedBin && <BinDetailModal bin={selectedBin} onClose={() => setSelectedBin(null)} />}

      {/* footer */}
      <footer className="mt-10 border-t border-stone-200 pt-4 pb-28 lg:pb-4 px-6 lg:pl-[calc(76px+1.5rem)] text-center">
        <p className="text-[11px] text-stone-400 font-mono">Bin Monitor · {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </footer>
    </div>
  )
}
