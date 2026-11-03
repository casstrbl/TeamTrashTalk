import { useState, useMemo, useEffect, useLayoutEffect, useRef, Fragment, createContext, useContext } from 'react'
import type { KeyboardEvent, ReactNode, RefObject } from 'react'
import { divIcon, latLngBounds } from 'leaflet'
import type { LatLngBounds, LatLngTuple, Layer, Point } from 'leaflet'
import { MapContainer, TileLayer, ImageOverlay, Pane, Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import Lenis from 'lenis'
import 'lenis/dist/lenis.css'
import BinLogo from './BinLogo'
import LoginPage from './LoginPage'
import PickupPage from './PickupPage'
import type { PickupBin, PickupRecord } from './PickupPage'
import { mockBins } from './data/mockBins'
import { campusBoundary } from './data/campusBoundary'
import { campusBuildings } from './data/campusBuildings'
import HistoryPage from './HistoryPage'

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
type Zone = 'Zone A' | 'Zone B'
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

const STAFF: StaffMember[] = [
  { id: 's1', name: 'Person 1', role: 'editor', zones: ['Zone A', 'Zone B'], email: 'person1@csus.edu' },
  { id: 's2', name: 'Person 2', role: 'viewer', zones: ['Zone A'], email: 'person2@csus.edu' },
  { id: 's3', name: 'Person 3', role: 'viewer', zones: ['Zone A'], email: 'person3@csus.edu' },
  { id: 's4', name: 'Person 4', role: 'viewer', zones: ['Zone B'], email: 'person4@csus.edu' },
  { id: 's5', name: 'Person 5', role: 'viewer', zones: ['Zone B'], email: 'person5@csus.edu' },
]

// bins come from mockBins.ts until the site reads from the api
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

// what sets off an alert. editors change these on the admin page
interface AlertSettings {
  fillOn: boolean
  fillAt: number // percent, any compartment
  offlineOn: boolean
  batteryOn: boolean
  batteryAt: number // percent
  dailyEmail: boolean // saved, but no emails are sent while testing (the client asked for that)
}
const DEFAULT_ALERT_SETTINGS: AlertSettings = { fillOn: true, fillAt: 80, offlineOn: true, batteryOn: true, batteryAt: 20, dailyEmail: false }

// browser storage for the demo: who's signed in, the staff list (so new accounts and role or zone
// changes survive a reload), alert settings and pickup records. it's per browser, and can be
// missing or blocked (private mode), so every read and write is guarded. the backend should own
// all of this later
const STORE = { session: 'tt-session', staff: 'tt-staff-v1', alerts: 'tt-alert-settings-v1', pickups: 'tt-pickups-v1' }

function loadStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback
  } catch {
    return fallback
  }
}
function loadStoredList<T>(key: string, fallback: T[]): T[] {
  try {
    const raw = localStorage.getItem(key)
    const v = raw ? JSON.parse(raw) : null
    return Array.isArray(v) ? v : fallback
  } catch {
    return fallback
  }
}
function saveStored(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage blocked: the change still works until the page reloads
  }
}
function loadSession(): string | null {
  try {
    return localStorage.getItem(STORE.session)
  } catch {
    return null
  }
}
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
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(15 46 35 / 0.08)" strokeWidth={6} />
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
        <span className="flex items-center gap-1.5 text-[10px] font-bold text-pine-muted uppercase tracking-wide">
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: compartmentColor(label) }} />
          {label}
        </span>
        <span className="font-mono text-[11px] font-bold text-pine-muted">{fill}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-pine/10 overflow-hidden">
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
      className={`group text-left ${onShowOnMap ? 'glass' : 'glass-blur bg-white/90!'} rounded-3xl p-4 sm:p-[18px] hover:bg-white/75 hover:shadow-lg hover:shadow-pine/10 transition-all duration-200 cursor-pointer ${highlighted ? 'border-teal! ring-2 ring-teal/30' : ''}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-bold text-forest text-base">{bin.name}</p>
          <p className="text-xs font-medium text-pine-muted mt-0.5">{bin.location}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${statusBg(binStatus(bin))}`}>
            {statusLabel(binStatus(bin))}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-3">
        <div className="relative flex items-center justify-center">
          <RingGauge fill={top} size={58} />
          <span className="absolute font-mono text-[13px] font-bold" style={{ color: fillHex(top) }}>
            {top}%
          </span>
        </div>
        <div className="flex-1 space-y-1.5">
          {bin.compartments.map(c => (
            <CompartmentBar key={c.label} label={c.label} fill={c.fill} />
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between pt-2.5 border-t border-pine/[0.08]">
        <BatteryIcon level={bin.battery} />
        <div className="flex items-center gap-2">
          {/* before: pads the tap area without changing the look */}
          {onShowOnMap && (
            <button
              onClick={e => { e.stopPropagation(); onShowOnMap() }}
              className="relative inline-flex items-center gap-1 text-[11px] leading-none font-bold text-teal bg-teal-soft hover:bg-teal/20 rounded-full px-2.5 py-1 transition-colors before:absolute before:-inset-x-2 before:-inset-y-3"
              aria-label={`Show ${bin.name} on map`}
            >
              <MapPinIcon size={11} />
              Map
            </button>
          )}
          <span className="text-[11px] font-medium text-pine-muted">{bin.lastUpdated}</span>
        </div>
      </div>
    </div>
  )
}

function AlertItem({ alert, onDismiss, onSelect }: { alert: Alert; onDismiss: (id: string) => void; onSelect: (alert: Alert) => void }) {
  // rose card = needs attention; the stripe and dot carry the severity
  const dot = { critical: 'bg-status-critical', warn: 'bg-status-warn', info: 'bg-teal' }[alert.severity]
  const bg = { critical: 'tint-rose', warn: 'tint-rose', info: 'tint-teal' }[alert.severity]
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(alert)}
      onKeyDown={onActivate(() => onSelect(alert))}
      className={`flex gap-3 glass rounded-2xl px-4 py-3.5 cursor-pointer hover:shadow-md hover:shadow-forest/10 transition-shadow ${bg}`}
      title="Show on map"
    >
      <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${dot}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-forest">{alert.binName} · {alert.zone}</p>
        <p className="text-[13px] font-medium text-pine-muted mt-0.5 leading-snug">{alert.message}</p>
        <p className="text-[11px] text-pine-muted mt-1">{alert.time}</p>
      </div>
      <button
        onClick={e => { e.stopPropagation(); onDismiss(alert.id) }}
        className="relative text-pine-muted/60 hover:text-pine shrink-0 text-sm transition-colors self-start before:absolute before:-inset-3"
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-forest/30 backdrop-blur-md" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={bin.name} className="glass-blur bg-white/85! rounded-[28px] shadow-2xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="font-display text-xl font-bold text-forest">{bin.name}</h2>
            <p className="text-sm font-medium text-pine-muted">{bin.location} · {bin.zone}</p>
            <p className="text-[11px] text-pine-muted mt-0.5">{bin.id}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-11 h-11 -mt-2 -mr-2 rounded-full flex items-center justify-center text-pine-muted hover:text-pine hover:bg-pine/5 transition-colors text-lg">✕</button>
        </div>

        <div className="flex justify-center mb-5">
          <div className="relative">
            <RingGauge fill={maxFill(bin)} size={96} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-mono font-bold text-lg" style={{ color: fillHex(maxFill(bin)) }}>{maxFill(bin)}%</span>
              <span className="text-[10px] font-bold text-pine-muted uppercase tracking-wider">fullest</span>
            </div>
          </div>
        </div>

        <div className="space-y-3 mb-4">
          {bin.compartments.map(c => (
            <div key={c.label}>
              <div className="flex justify-between mb-1">
                <span className="flex items-center gap-1.5 text-xs font-bold text-pine">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: compartmentColor(c.label) }} />
                  {c.label}
                </span>
                <span className="font-mono text-xs font-bold text-pine-muted">{c.fill}%</span>
              </div>
              <div className="h-2.5 rounded-full bg-pine/10 overflow-hidden">
                <div className={`h-full rounded-full ${fillBarColor(c.fill)} transition-all duration-500`} style={{ width: `${c.fill}%` }} />
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs border-t border-pine/[0.08] pt-4">
          <div>
            <p className="text-pine-muted font-bold uppercase tracking-wider text-[10px]">Sensor</p>
            <p className={`font-medium mt-0.5 capitalize ${bin.sensorStatus === 'online' ? 'text-status-ok-ink' : 'text-status-critical-ink'}`}>{bin.sensorStatus}</p>
          </div>
          <div>
            <p className="text-pine-muted font-bold uppercase tracking-wider text-[10px]">Battery</p>
            <BatteryIcon level={bin.battery} />
          </div>
          <div>
            <p className="text-pine-muted font-bold uppercase tracking-wider text-[10px]">Status</p>
            <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusBg(binStatus(bin))}`}>{statusLabel(binStatus(bin))}</span>
          </div>
          <div>
            <p className="text-pine-muted font-bold uppercase tracking-wider text-[10px]">Last Update</p>
            <p className="font-semibold text-pine mt-0.5">{bin.lastUpdated}</p>
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
  '[&_.leaflet-popup-content-wrapper]:rounded-3xl!',
  '[&_.leaflet-popup-content-wrapper]:bg-transparent!',
  '[&_.leaflet-popup-content-wrapper]:shadow-xl!',
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
              className="absolute -top-2 -right-2 w-6 h-6 flex items-center justify-center rounded-full bg-white border border-pine/10 shadow text-pine-muted hover:text-pine text-xs transition-colors before:absolute before:-inset-2"
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
    <div className={`absolute right-2 top-2 z-[1000] max-w-[calc(100%-4rem)] pointer-events-none glass-blur rounded-2xl px-3 py-2 flex flex-wrap justify-end items-center gap-x-3 gap-y-1 text-[11px] font-bold text-pine transition-opacity ${hidden ? 'opacity-0' : ''}`}>
      {items.map(i => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: i.hex }} />
          {i.label}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="w-3.5 h-3.5 rounded-full border-2 border-pine-muted font-mono text-[8px] font-bold text-forest flex items-center justify-center">2</span>
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
    <div data-map data-lenis-prevent className="relative isolate h-[60vh] min-h-[320px] max-h-[760px] bg-white rounded-3xl border-[6px] border-white/80 shadow-[0_8px_24px_rgb(15_46_35/0.08)] overflow-hidden scroll-mt-4">
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

// slim sidebar on wide landscape screens (desk: ipad landscape, desktop), floating pill at the
// bottom otherwise (phones, and tablets in portrait, including the 1024px-wide ipad pro).
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
      <nav aria-label="Main" className="hidden desk:flex fixed inset-y-3 left-3 z-40 w-[76px] glass-dark rounded-[32px] flex-col items-center gap-3 py-5">
        <BinLogo size={44} className="mb-4" />
        {items.map(button)}
      </nav>
      <nav aria-label="Main" className="desk:hidden fixed bottom-0 inset-x-0 z-40 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pointer-events-none">
        <div className="pointer-events-auto mx-auto max-w-[420px] glass-dark rounded-full p-2 flex justify-between">
          {items.map(button)}
        </div>
      </nav>
    </>
  )
}

// avatar + greeting (tap for the account menu), synced pill, alert bell
function TopBar({ userName, role, greeting, syncedLabel, alertCount, sampleData, nextDemoUser, onSwitchUser, onLogout, onBell }: {
  userName: string
  role: Role
  greeting: string
  syncedLabel: string
  alertCount: number
  sampleData: boolean
  nextDemoUser: string // who "switch demo user" goes to
  onSwitchUser: () => void
  onLogout: () => void
  onBell: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  // a tap anywhere else, or esc, closes the menu
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: PointerEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false) }
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey) }
  }, [menuOpen])

  const menuItem = 'w-full text-left min-h-11 px-4 rounded-xl text-sm font-bold text-pine hover:bg-pine/5 transition-colors'
  return (
    <div className="flex items-center gap-3">
      <div ref={menuRef} className="relative">
        <button
          onClick={() => setMenuOpen(o => !o)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={`${userName}, ${role}. Account menu`}
          className="flex items-center gap-3 min-h-11 text-left rounded-full -ml-1 pl-1 pr-3 hover:bg-white/50 transition-colors"
        >
          <span className="w-11 h-11 rounded-full bg-pine text-ivory flex items-center justify-center text-sm font-bold shrink-0">
            {userName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
          </span>
          <span className="leading-tight min-w-0">
            <span className="block text-xs font-medium text-pine-muted">{greeting},</span>
            <span className="block text-[15px] font-bold text-pine truncate">
              {userName} <span className="font-medium text-pine-muted capitalize">· {role}</span>
            </span>
          </span>
        </button>
        {menuOpen && (
          <div role="menu" className="absolute left-0 top-full mt-2 z-50 w-60 glass-blur bg-white/[0.97]! rounded-2xl p-1.5 shadow-xl">
            <button role="menuitem" className={menuItem} onClick={() => { setMenuOpen(false); onSwitchUser() }}>
              Switch demo user
              <span className="block text-xs font-medium text-pine-muted -mt-0.5 pb-1">to {nextDemoUser}</span>
            </button>
            <button role="menuitem" className={`${menuItem} text-status-critical-ink`} onClick={() => { setMenuOpen(false); onLogout() }}>Log out</button>
          </div>
        )}
      </div>
      <div className="ml-auto flex items-center gap-2">
        {sampleData && (
          <span title="Person 3 shows the bins as if just emptied, to preview the all-clear look" className="inline-flex items-center bg-teal text-ivory text-xs font-bold px-3.5 py-2 rounded-full">Sample data</span>
        )}
        <span className="hidden sm:inline-flex items-center glass-blur text-teal text-xs font-bold px-4 py-2.5 rounded-full">{syncedLabel}</span>
        <button
          onClick={onBell}
          aria-label={`Alerts, ${alertCount} active`}
          className="relative w-11 h-11 rounded-full glass-blur text-pine flex items-center justify-center hover:bg-white/80 transition-colors"
        >
          <Icon name="bell" size={20} />
          {alertCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-rose text-pine text-[11px] font-bold flex items-center justify-center">{alertCount}</span>
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
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(244 241 222 / 0.14)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - fill / 100)}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-[22px] font-bold text-ivory">{fill}%</span>
    </div>
  )
}

function HalfGauge({ pct }: { pct: number }) {
  const len = Math.PI * 40
  const arc = 'M10 52 A40 40 0 0 1 90 52'
  return (
    <svg viewBox="0 0 100 58" className="w-full max-w-[220px] mx-auto" role="img" aria-label={`Campus average fill ${pct}%`}>
      <path d={arc} fill="none" stroke="rgb(27 91 101 / 0.15)" strokeWidth="9" strokeLinecap="round" />
      <path d={arc} fill="none" stroke="#1B5B65" strokeWidth="9" strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - pct / 100)} />
      <text x="50" y="50" textAnchor="middle" fontSize="16" fontWeight="600" fill="#1B5B65" fontFamily="Quicksand, sans-serif">{pct}%</text>
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
      <path d={SKETCH.outline} fill="rgb(121 143 83 / 0.12)" stroke="rgb(27 91 101 / 0.35)" strokeWidth="0.8" strokeLinejoin="round" />
      {zones.map(z => (
        <text key={z.zone} x={z.x} y={z.y - 5} textAnchor="middle" fontSize="4.5" fill="#1B5B65" fontWeight="700" fontFamily="Quicksand, sans-serif">{z.zone}</text>
      ))}
      {bins.map(b => {
        const [x, y] = SKETCH.project(b.lng, b.lat)
        return <circle key={b.id} cx={x} cy={y} r="2.6" fill={pinHex(b)} stroke="#fff" strokeWidth="0.8" />
      })}
    </svg>
  )
}

const TILE = 'rounded-[28px] p-5 md:p-[22px] desk:p-6'

// when the current page was opened (performance.now()), set by PageScope
const PageOpenedAt = createContext(0)

function PageScope({ children }: { children: ReactNode }) {
  const [openedAt] = useState(() => performance.now())
  return <PageOpenedAt.Provider value={openedAt}>{children}</PageOpenedAt.Provider>
}

// the element's children fade and rise into place as they scroll into view (styles in
// index.css), rippling 70ms apart in on-screen order, once per visit to a page. only lists
// there on arrival animate: ones that mount later (a filter or cards/map switch) just appear.
// children are marked here, before the first paint, not in the markup, so they can't get
// stuck hidden if this never runs
function useReveal(ref: RefObject<HTMLElement | null>) {
  const openedAt = useContext(PageOpenedAt)
  useLayoutEffect(() => {
    const root = ref.current
    if (!root || performance.now() - openedAt > 600 || !('IntersectionObserver' in window)) return
    const items = [...root.children] as HTMLElement[]
    for (const el of items) el.setAttribute('data-reveal', '')
    const io = new IntersectionObserver(entries => {
      entries
        .filter(e => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left)
        .forEach((e, i) => {
          const el = e.target as HTMLElement
          el.style.transitionDelay = `${i * 70}ms`
          el.setAttribute('data-shown', '')
          io.unobserve(el)
        })
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.12 })
    for (const el of items) io.observe(el)
    return () => io.disconnect()
  }, [])
}

// a div whose children get the reveal
function Reveal({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useReveal(ref)
  return <div ref={ref} className={className}>{children}</div>
}

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
  // tiles fade and rise into place as they scroll into view
  const gridRef = useRef<HTMLDivElement>(null)
  useReveal(gridRef)

  return (
    <>
      <div>
        <h1 className="text-3xl lg:text-4xl font-bold text-pine leading-tight tracking-tight">At a glance</h1>
        <span className="sm:hidden mt-3 inline-flex items-center glass text-teal text-xs font-bold px-3.5 py-2 rounded-full">{syncedLabel}</span>
      </div>

      {/* bento: 2 columns on phones and portrait tablets, 4 on desk (wide landscape). the pickup tile lists
          every zone as a row, so more zones grow it instead of adding tiles */}
      <div ref={gridRef} className="grid grid-cols-2 desk:grid-cols-4 gap-3 desk:gap-4
        [grid-template-areas:'hero_hero'_'pickup_pickup'_'status_status'_'gauge_map'_'alerts_alerts']
        md:[grid-template-areas:'hero_hero'_'pickup_pickup'_'status_status'_'map_map'_'gauge_alerts']
        desk:[grid-template-areas:'hero_hero_gauge_status'_'map_map_pickup_pickup'_'map_map_alerts_alerts']">

        {/* hero: fullest online bin */}
        {hero ? (
          <div
            role="button"
            tabIndex={0}
            onClick={() => onOpenDetail(hero)}
            onKeyDown={onActivate(() => onOpenDetail(hero))}
            aria-label={`${hero.name}, fullest bin at ${maxFill(hero)}%. Open details`}
            className={`[grid-area:hero] ${TILE} glass-dark text-ivory flex items-center gap-5 cursor-pointer`}
          >
            <HeroRing fill={maxFill(hero)} size={96} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-mist">Fullest bin</p>
              <p className="text-[28px] font-bold leading-tight">{hero.name}</p>
              <p className="text-sm font-medium text-mist truncate">{hero.location}, {hero.zone}</p>
              <button
                onClick={e => { e.stopPropagation(); onShowOnMap(hero.id) }}
                className="mt-3 inline-flex items-center gap-1.5 bg-ivory text-pine text-sm font-bold px-4 min-h-11 rounded-full hover:bg-white transition-colors"
              >
                <Icon name="mapPin" size={16} />
                Show on map
              </button>
            </div>
          </div>
        ) : (
          <div className={`[grid-area:hero] ${TILE} glass-dark text-ivory`}>
            <p className="text-xs font-bold text-mist">Fullest bin</p>
            <p className="text-lg font-bold mt-1">No bins are online right now</p>
          </div>
        )}

        {/* status counts as four equal mini-tiles (2x2, or 4 across when the tile is full width on
            ipad portrait); on desktop they stretch to the tile's height. each opens details for it */}
        <div className={`[grid-area:status] ${TILE} glass flex flex-col`}>
          <p className="text-xs font-bold text-pine mb-3">Status</p>
          <div className="flex-1 grid grid-cols-2 md:grid-cols-4 desk:grid-cols-2 auto-rows-fr gap-2">
            {STATUS_PILLS.map(s => (
              <button
                key={s.status}
                onClick={() => onStatus(s.status)}
                aria-label={`${statusCounts[s.status]} ${statusLabel(s.status)}. Show these bins`}
                className={`flex flex-col justify-center gap-1 min-h-11 px-3.5 desk:px-3 py-2.5 rounded-2xl text-left ${s.cls} hover:brightness-95 transition`}
              >
                <span className="text-xs font-bold">{statusLabel(s.status)}</span>
                <span className="font-mono text-2xl font-bold leading-none">{statusCounts[s.status]}</span>
              </button>
            ))}
          </div>
        </div>

        <div className={`[grid-area:gauge] ${TILE} glass tint-teal flex flex-col`}>
          <p className="text-xs font-bold text-teal mb-2">Campus average</p>
          <div className="flex-1 flex items-center"><HalfGauge pct={campusAvg} /></div>
          <p className="text-xs font-semibold text-teal text-center mt-1">average fill, {onlineCount} online bins</p>
        </div>

        {/* the campus is taller than wide, so the full-width ipad-portrait tile gets extra height */}
        <div className={`[grid-area:map] ${TILE} glass flex flex-col gap-3 min-h-[220px] md:min-h-[380px] desk:min-h-[220px]`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold text-teal">Campus map</p>
            <button onClick={onOpenMap} className="inline-flex items-center gap-1.5 bg-pine text-ivory text-sm font-bold px-4 min-h-11 rounded-full hover:bg-forest-light transition-colors">
              <Icon name="mapPin" size={16} />
              Open map
            </button>
          </div>
          {/* the sketch fills whatever height the grid gives this tile rather than setting it,
              so its tall campus shape can't stretch the rows */}
          <button onClick={onOpenMap} aria-label="Open map" className="relative flex-1 min-h-[140px] rounded-[20px] bg-ivory/70 overflow-hidden">
            <span className="absolute inset-2"><CampusSketch bins={bins} /></span>
          </button>
        </div>

        {/* one tile for pickups: the total up top, then a row per zone. rose while anything
            needs pickup, olive when nothing does. fills the whole area for any number of zones */}
        <div className={`[grid-area:pickup] ${TILE} glass flex flex-col ${needPickup === 0 ? 'tint-olive' : 'tint-rose'}`}>
          <button
            onClick={onPickup}
            aria-label={needPickup === 0 ? 'All clear, no bins need pickup. Open the pickup list' : `${needPickup} ${needPickup === 1 ? 'bin needs' : 'bins need'} pickup. Open the pickup list`}
            className="text-left rounded-2xl -m-2 p-2 hover:bg-white/40 transition-colors"
          >
            {/* the count is the title */}
            <span className="flex items-start justify-between gap-3 w-full text-pine">
              {needPickup === 0 ? (
                <span>
                  <span className="block text-3xl font-bold leading-none">All clear</span>
                  <span className="block text-sm mt-1.5 text-olive-ink">No bins need pickup</span>
                </span>
              ) : (
                <span className="text-3xl font-bold leading-tight">
                  <span className="font-mono">{needPickup}</span> {needPickup === 1 ? 'bin needs' : 'bins need'} pickup
                </span>
              )}
              <span className="shrink-0 mt-1.5"><Icon name={needPickup === 0 ? 'circleCheck' : 'arrowRight'} size={22} /></span>
            </span>
          </button>
          <div className="mt-4 border-t border-pine/10 divide-y divide-pine/10">
            {zones.map(z => (
              <button
                key={z.zone}
                onClick={() => onZone(z.zone)}
                aria-label={`${z.zone}: ${z.pickup} of ${z.total} bins need pickup. Open this zone's pickup list`}
                className="w-full flex items-center gap-3 min-h-11 py-2 px-2 -mx-2 text-left rounded-xl hover:bg-white/40 transition-colors"
              >
                <span className="flex-1 text-[15px] font-bold text-pine">{z.zone}</span>
                <span className="text-sm text-pine"><span className="font-mono font-bold">{z.pickup}</span> of {z.total} bins</span>
                <Icon name="arrowRight" size={16} />
              </button>
            ))}
          </div>
        </div>

        <div className={`[grid-area:alerts] ${TILE} glass`}>
          <div className="flex items-center gap-2 mb-2">
            <p className="text-xs font-bold text-pine">Alerts</p>
            {alertCount > 0 && <span className="text-[11px] bg-rose/25 text-pine font-bold px-2 py-0.5 rounded-full">{alertCount} active</span>}
            <button onClick={onViewAllAlerts} className="ml-auto text-sm font-bold text-teal min-h-11 px-2 -mr-2 hover:underline">View all</button>
          </div>
          {topAlerts.length === 0 ? (
            <p className="text-sm text-pine-muted py-2">No active alerts</p>
          ) : (
            <div className="space-y-1">
              {topAlerts.map(a => {
                const line = alertLine(a)
                return (
                  <button key={a.id} onClick={() => onAlert(a.binId)} className="w-full flex items-center gap-3 min-h-11 text-left rounded-xl px-2 -mx-2 hover:bg-white/60 transition-colors">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: line.hex }} />
                    <span className="text-sm min-w-0 truncate">
                      <span className="font-bold text-pine">{a.binName}</span> <span className="font-medium text-pine-muted">{line.text}</span>
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

// role and zone controls for one person, shared by the admin table and the phone cards.
// nobody can change their own role, and only editors reach admin, so an editor always remains
function StaffEditor({ member, isSelf, onToggleRole, onToggleZone }: {
  member: StaffMember
  isSelf: boolean
  onToggleRole: () => void
  onToggleZone: (zone: Zone) => void
}) {
  return (
    <div className="space-y-3.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="w-14 text-[13px] font-bold text-pine-muted">Role</span>
        <div className="inline-flex bg-ivory/80 rounded-full p-1" role="group" aria-label={`${member.name}'s role`}>
          {(['viewer', 'editor'] as const).map(r => (
            <button
              key={r}
              onClick={() => { if (member.role !== r) onToggleRole() }}
              disabled={isSelf}
              aria-pressed={member.role === r}
              className={`px-4 min-h-10 rounded-full text-sm font-bold capitalize transition-colors disabled:cursor-not-allowed ${member.role === r ? 'bg-teal text-ivory' : 'text-pine-muted hover:text-pine disabled:hover:text-pine-muted'}`}
            >
              {r}
            </button>
          ))}
        </div>
        {isSelf && <span className="text-xs font-medium text-pine-muted">You can't change your own role. Ask another editor.</span>}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="w-14 text-[13px] font-bold text-pine-muted">Zones</span>
        {ALL_ZONES.map(zone => {
          const on = member.zones.includes(zone)
          return (
            <button
              key={zone}
              onClick={() => onToggleZone(zone)}
              aria-pressed={on}
              className={`inline-flex items-center gap-1.5 min-h-10 rounded-full text-sm font-bold transition-colors ${on ? 'bg-teal-soft text-teal border-[1.5px] border-teal pl-3 pr-4' : 'glass text-pine-muted hover:text-pine px-4'}`}
            >
              {on && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5l10 -10" /></svg>}
              {zone}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// on/off switch, 44px tall tap area around the 28px track
function Switch({ on, label, onChange }: { on: boolean; label: string; onChange: (on: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className="relative shrink-0 w-14 h-11 flex items-center justify-center"
    >
      <span className={`w-12 h-7 rounded-full transition-colors ${on ? 'bg-teal' : 'bg-pine/15'}`} />
      <span className={`absolute w-[22px] h-[22px] rounded-full bg-white shadow-[0_1px_3px_rgb(15_46_35/0.25)] transition-transform ${on ? 'translate-x-[10px]' : '-translate-x-[10px]'}`} />
    </button>
  )
}

// - 80% + in steps of 5
function Stepper({ value, min, max, label, disabled, onChange }: {
  value: number
  min: number
  max: number
  label: string
  disabled?: boolean
  onChange: (v: number) => void
}) {
  const btn = 'w-9 h-10 flex items-center justify-center text-lg font-bold text-pine-muted hover:text-pine disabled:text-pine/20 transition-colors'
  return (
    <div className={`inline-flex items-center bg-ivory/85 rounded-full px-1 shrink-0 ${disabled ? 'opacity-50' : ''}`} role="group" aria-label={label}>
      <button className={btn} disabled={disabled || value <= min} onClick={() => onChange(Math.max(min, value - 5))} aria-label={`Lower ${label}`}>−</button>
      <span className="w-11 text-center text-sm font-bold text-pine tabular-nums" aria-live="polite">{value}%</span>
      <button className={btn} disabled={disabled || value >= max} onClick={() => onChange(Math.min(max, value + 5))} aria-label={`Raise ${label}`}>+</button>
    </div>
  )
}

// admin: what sets off an alert. the fill level is the same "alert at" as on the details page
function AlertSettingsCard({ settings, onChange }: { settings: AlertSettings; onChange: (next: AlertSettings) => void }) {
  const set = (patch: Partial<AlertSettings>) => onChange({ ...settings, ...patch })
  const rows: { title: string; text: string; on: boolean; toggle: (on: boolean) => void; stepper?: ReactNode }[] = [
    {
      title: 'Bin is getting full',
      text: 'Alert when any compartment reaches this level. Bins at this level also go on the pickup list.',
      on: settings.fillOn,
      toggle: on => set({ fillOn: on }),
      stepper: <Stepper value={settings.fillAt} min={10} max={100} label="full alert level" disabled={!settings.fillOn} onChange={v => set({ fillAt: v })} />,
    },
    {
      title: 'Sensor stops sending',
      text: 'Alert when a bin’s sensor goes offline.',
      on: settings.offlineOn,
      toggle: on => set({ offlineOn: on }),
    },
    {
      title: 'Low battery',
      text: 'Alert when a sensor’s battery drops to this level.',
      on: settings.batteryOn,
      toggle: on => set({ batteryOn: on }),
      stepper: <Stepper value={settings.batteryAt} min={5} max={50} label="low battery level" disabled={!settings.batteryOn} onChange={v => set({ batteryAt: v })} />,
    },
    {
      title: 'Daily email summary',
      text: 'One email each morning listing the bins that need pickup. Emails stay off while we’re testing.',
      on: settings.dailyEmail,
      toggle: on => set({ dailyEmail: on }),
    },
  ]
  return (
    <div className={`${TILE} glass`}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold text-pine">Alerts &amp; notifications</h2>
        <button
          onClick={() => onChange(DEFAULT_ALERT_SETTINGS)}
          className="ml-auto text-sm font-bold text-pine-muted hover:text-pine min-h-11 px-2 -mr-2 transition-colors"
        >
          Reset
        </button>
      </div>
      <p className="text-[13px] font-medium text-pine-muted mt-0.5 mb-2">Saved on this device for now. Once the backend stores them, they’ll apply to everyone.</p>
      <div>
        {rows.map(r => (
          <div key={r.title} className="flex flex-wrap sm:flex-nowrap items-center gap-x-4 gap-y-2 py-3 border-t border-pine/[0.07]">
            <div className="flex-1 min-w-[12rem]">
              <p className="text-[15px] font-bold text-pine">{r.title}</p>
              <p className="text-[13px] font-medium text-pine-muted">{r.text}</p>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              {r.stepper}
              <Switch on={r.on} label={r.title} onChange={r.toggle} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// a viewer with no zones assigned sees this instead of bins
function NoZonesNotice() {
  return (
    <div className={`${TILE} glass py-16 text-center`}>
      <span className="mx-auto mb-4 w-14 h-14 rounded-full bg-teal-soft text-teal flex items-center justify-center">
        <Icon name="mapPin" size={26} />
      </span>
      <p className="text-lg font-bold text-pine">No zones assigned yet</p>
      <p className="text-sm text-pine-muted mt-1 max-w-sm mx-auto">Ask an admin to add you to a zone. Its bins and alerts will show up here.</p>
    </div>
  )
}

// "2 min ago" / "3 hours ago" -> minutes
function minutesAgo(label: string) {
  if (label.trim().toLowerCase() === 'just now') return 0
  const m = label.match(/(\d+)\s*(min|hour)/)
  return m ? Number(m[1]) * (m[2] === 'hour' ? 60 : 1) : Infinity
}

// main app

export default function App() {
  // demo sign-in: the login screen picks who you are (any password). the account menu can still
  // cycle person 1 (editor), person 2 (viewer), person 3 (viewer, sample data) for demos
  const [sessionId, setSessionId] = useState<string | null>(loadSession)
  const [filterZone, setFilterZone] = useState<Zone | 'All'>('All')
  const [sortBy, setSortBy] = useState<'fill' | 'zone' | 'status' | 'name'>('fill')
  const [filterStatus, setFilterStatus] = useState<Status | 'All'>('All')
  const [alertSettings, setAlertSettings] = useState<AlertSettings>(() => loadStored(STORE.alerts, DEFAULT_ALERT_SETTINGS))
  const alertThreshold = alertSettings.fillAt
  const setAlertThreshold = (next: number | ((t: number) => number)) =>
    setAlertSettings(prev => ({ ...prev, fillAt: typeof next === 'function' ? next(prev.fillAt) : next }))
  const [pickups, setPickups] = useState<PickupRecord[]>(() => loadStoredList(STORE.pickups, []))
  const [pickupZone, setPickupZone] = useState<string>('All')
  const [dismissedIds, setDismissedIds] = useState<string[]>([])
  const [selectedBin, setSelectedBin] = useState<Tribin | null>(null)
  const [page, setPage] = useState<Page>('summary')
  const [editingStaff, setEditingStaff] = useState<string | null>(null)
  const [staffList, setStaffList] = useState<StaffMember[]>(() => loadStoredList(STORE.staff, STAFF))

  useEffect(() => { saveStored(STORE.staff, staffList) }, [staffList])
  useEffect(() => { saveStored(STORE.alerts, alertSettings) }, [alertSettings])
  // only keep the last two weeks of pickups in the browser
  useEffect(() => { saveStored(STORE.pickups, pickups.filter(p => Date.now() - p.at < 14 * 24 * 60 * 60 * 1000)) }, [pickups])
  useEffect(() => {
    try {
      if (sessionId) localStorage.setItem(STORE.session, sessionId)
      else localStorage.removeItem(STORE.session)
    } catch {
      // storage blocked: you stay signed in until the page reloads
    }
  }, [sessionId])
  const [apiBins, setApiBins] = useState<Tribin[]>(TRIBINS)

  // Poll the local Java API so simulated sensor readings show up automatically.
  // If the backend is unavailable, the site keeps its existing mock bins.
  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_URL ?? ''
    const refreshMs = 5000 // five-second demo display refresh
    let active = true
    let requestInProgress = false

    async function refreshBins() {
      if (requestInProgress) return
      requestInProgress = true
      try {
        const response = await fetch(`${apiUrl}/api/tribins`, { cache: 'no-store' })
        if (!response.ok) throw new Error('Failed to load bins')
        const data: Tribin[] = await response.json()
        if (active) setApiBins(data)
      } catch {
        // Expected when the local backend isn't running: keep sample data.
      } finally {
        requestInProgress = false
      }
    }

    void refreshBins()
    const timer = window.setInterval(() => { void refreshBins() }, refreshMs)
    return () => { active = false; window.clearInterval(timer) }
  }, [])

  // role and zones come from the staff list, so changes in admin apply right away.
  // editors see every bin; viewers only bins in the zones an admin assigned them.
  // display filtering only: real access control has to live in the backend
  const signedInUser = staffList.find(s => s.id === sessionId)
  const currentUser = signedInUser ?? staffList[0]
  const currentUserId = currentUser.id
  const currentRole = currentUser.role
  const visibleZones = currentRole === 'editor' ? ALL_ZONES : ALL_ZONES.filter(z => currentUser.zones.includes(z))
  const zonesKey = visibleZones.join()
  const sampleData = currentUserId === SAMPLE_USER_ID
  const myBins = useMemo(
    () => (sampleData ? SAMPLE_CLEAR_BINS : apiBins).filter(b => visibleZones.includes(b.zone)),
    [zonesKey, sampleData, apiBins],
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
    setPickupZone('All')
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
    const tabBar = !window.matchMedia('(min-width: 1024px) and (orientation: landscape)').matches // same as desk:
    const visibleBottom = window.innerHeight - (tabBar ? 96 : 0)
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
        if (alertSettings.offlineOn) out.push({
          id: `${bin.id}-offline`, binId: bin.id, binName: bin.name, zone: bin.zone,
          message: `Sensor offline, last contact ${bin.lastUpdated}`, severity: 'critical', time: bin.lastUpdated,
          kind: 'offline',
        })
      } else {
        for (const c of bin.compartments) {
          if (alertSettings.fillOn && c.fill >= alertThreshold) {
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
      if (alertSettings.batteryOn && bin.battery <= alertSettings.batteryAt) {
        out.push({
          id: `${bin.id}-battery`, binId: bin.id, binName: bin.name, zone: bin.zone,
          message: `Battery low: ${bin.battery}% remaining`, severity: 'warn', time: bin.lastUpdated,
          kind: 'battery', value: bin.battery,
        })
      }
    }
    return out
  }, [alertSettings, alertThreshold, myBins])

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

  // the pickup list, optionally for one zone
  function openPickups(zone: Zone | 'All') {
    setPickupZone(zone)
    setPage('pickup')
  }

  function markEmptied(bin: PickupBin) {
    const top = bin.compartments.reduce((a, b) => (b.fill > a.fill ? b : a))
    setPickups(prev => [...prev, {
      id: `${bin.id}-${Date.now()}`,
      binId: bin.id, binName: bin.name, zone: bin.zone, location: bin.location,
      stream: top.label, fill: top.fill,
      byId: currentUser.id, byName: currentUser.name, at: Date.now(),
    }])
  }

  function undoPickup(recordId: string) {
    setPickups(prev => prev.filter(p => p.id !== recordId))
  }

  function logIn(staffId: string) {
    setSessionId(staffId)
    setPage('summary')
    setDismissedIds([])
  }

  // new accounts start as viewers with no zones, until an editor assigns them
  function createAccount(name: string, email: string) {
    const id = `s${Date.now()}`
    setStaffList(prev => [...prev, { id, name, email, role: 'viewer', zones: [] }])
    logIn(id)
  }

  function logOut() {
    setSessionId(null)
    setEditingStaff(null)
  }

  const DEMO_CYCLE: Record<string, string> = { s1: 's2', s2: 's3' }
  const nextDemoId = DEMO_CYCLE[currentUserId] ?? 's1'
  const nextDemoName = staffList.find(s => s.id === nextDemoId)?.name ?? 'Person 1'

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

  if (!signedInUser) {
    return <LoginPage staff={staffList} onLogin={logIn} onCreate={createAccount} />
  }

  return (
    <div className="min-h-screen font-sans">
      {/* the soft color glows behind every page */}
      <div className="aura" aria-hidden="true" />
      <NavRail page={page} role={currentRole} onNavigate={setPage} />
      {/* left padding clears the sidebar on desk; the footer's clears the floating tab bar otherwise */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 desk:pl-[calc(88px+2rem)] desk:pr-8 pt-5 desk:pt-8 pb-6 space-y-5 md:space-y-6">
        <TopBar
          userName={userName}
          role={currentRole}
          greeting={greeting}
          syncedLabel={syncedLabel}
          alertCount={unreadCount}
          nextDemoUser={nextDemoName}
          onSwitchUser={() => setSessionId(nextDemoId)}
          onLogout={logOut}
          sampleData={sampleData}
          onBell={openAlerts}
        />

        {/* keyed by page so the content fades in on every switch; the header and nav stay put */}
        <div key={page} className="animate-page-in motion-reduce:animate-none space-y-5 md:space-y-6">
        {/* records when this page was opened, so only what is there on arrival animates */}
        <PageScope>
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
              onZone={zone => openPickups(zone)}
              onPickup={() => openPickups('All')}
              onOpenMap={openMap}
              onAlert={showOnMapFromSummary}
              onViewAllAlerts={openAlerts}
            />
          )}

          {page === 'pickup' && noZones && <NoZonesNotice />}
          {page === 'pickup' && !noZones && (
            <PickupPage
              bins={myBins}
              zones={visibleZones}
              zoneFilter={pickupZone}
              onZoneFilter={setPickupZone}
              threshold={alertThreshold}
              pickups={pickups.filter(p => visibleZones.includes(p.zone as Zone))}
              onEmptied={markEmptied}
              onUndo={undoPickup}
              onShowOnMap={showOnMap}
            />
          )}
          {page === 'history' && <HistoryPage key={currentUserId} bins={myBins} sampleData={sampleData} />}

          {page === 'details' && (
            <>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setPage('summary')}
                  aria-label="Back to Summary"
                  className="inline-flex items-center gap-1.5 glass text-pine text-sm font-bold pl-3 pr-4 min-h-11 rounded-full hover:bg-white/80 transition-colors"
                >
                  <Icon name="arrowLeft" size={18} />
                  Summary
                </button>
                <h1 className="text-3xl lg:text-4xl font-bold text-pine tracking-tight">Details</h1>
              </div>
              {/* content: bins + sidebar */}
              {noZones ? <NoZonesNotice /> : (
              <div className="flex flex-col lg:flex-row gap-6">

                {/* left: bins grid */}
                <div ref={binsRef} className="flex-1 min-w-0 space-y-4 scroll-mt-4">
                  {/* filters */}
                  <div className="flex flex-wrap gap-2 items-center">
                    <div className="flex items-center glass rounded-full p-1 text-[13px]" role="group" aria-label="View">
                      {(['cards', 'map'] as const).map(mode => (
                        <button key={mode} onClick={() => { setViewMode(mode); setMapFocus(null) }} aria-pressed={viewMode === mode}
                          className={`px-4 min-h-9 rounded-full font-bold transition-colors ${viewMode === mode ? 'bg-teal text-ivory' :'text-pine-muted hover:text-pine'}`}
                        >{mode === 'cards' ? 'Cards' : 'Map'}</button>
                      ))}
                    </div>

                    <div className="flex items-center gap-1.5 glass rounded-full px-4 min-h-11 text-[13px]">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                      <span className="text-pine-muted font-semibold mr-1">Zone:</span>
                      <select value={filterZone} onChange={e => setFilterZone(e.target.value as any)}
                        className="bg-transparent font-bold text-forest outline-none cursor-pointer pr-1">
                        <option value="All">All</option>
                        {visibleZones.map(z => <option key={z} value={z}>{z}</option>)}
                      </select>
                    </div>

                    <div className="flex items-center gap-1.5 glass rounded-full px-4 min-h-11 text-[13px]">
                      <span className="text-pine-muted font-semibold mr-1">Status:</span>
                      <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)}
                        className="bg-transparent font-bold text-forest outline-none cursor-pointer pr-1">
                        <option value="All">All</option>
                        <option value="critical">Critical</option>
                        <option value="warn">Warning</option>
                        <option value="ok">OK</option>
                        <option value="offline">Offline</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-1.5 glass rounded-full px-4 min-h-11 text-[13px]">
                      <span className="text-pine-muted font-semibold mr-1">Sort:</span>
                      <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
                        className="bg-transparent font-bold text-forest outline-none cursor-pointer pr-1">
                        <option value="fill">Fill % (high→low)</option>
                        <option value="status">Status</option>
                        <option value="zone">Zone</option>
                        <option value="name">Name</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-1.5 glass rounded-full px-4 min-h-11 text-[13px]">
                      <span className="text-pine-muted font-semibold">Alert at</span>
                      {/* -/+ look the same in every browser (ipad safari has no number arrows); before: pads the tap area */}
                      <button
                        onClick={() => setAlertThreshold(t => Math.max(10, t - 5))}
                        disabled={alertThreshold <= 10}
                        aria-label="Lower alert threshold"
                        className="relative w-5 h-5 flex items-center justify-center text-base font-bold text-pine-muted hover:text-forest disabled:text-pine/20 transition-colors before:absolute before:-inset-x-1.5 before:-inset-y-3.5"
                      >−</button>
                      <input
                        type="number" min={10} max={100} step={5} value={alertThreshold}
                        onChange={e => setAlertThreshold(Math.min(100, Math.max(10, Number(e.target.value) || 0)))}
                        aria-label="Alert threshold"
                        className="w-8 text-center bg-transparent font-bold text-forest outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                      <span className="text-pine-muted font-semibold">%</span>
                      <button
                        onClick={() => setAlertThreshold(t => Math.min(100, t + 5))}
                        disabled={alertThreshold >= 100}
                        aria-label="Raise alert threshold"
                        className="relative w-5 h-5 flex items-center justify-center text-base font-bold text-pine-muted hover:text-forest disabled:text-pine/20 transition-colors before:absolute before:-inset-x-1.5 before:-inset-y-3.5"
                      >+</button>
                    </div>

                    <span className="ml-auto text-[13px] font-bold text-pine-muted">{filteredBins.length} bin{filteredBins.length !== 1 ? 's' : ''}</span>
                  </div>

                  {/* grid or map */}
                  {shownCount === 0 ? (
                    <div className="glass rounded-[28px] py-16 text-center text-pine-muted">
                      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="block mx-auto mb-2"><path d="M4 7h16M9 7V4h6v3M10 11v6M14 11v6M6 7l1 13h10l1-13"/></svg>
                      <p className="text-sm font-semibold">No bins match these filters.</p>
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
                    <Reveal className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                      {filteredBins.map(bin => (
                        <BinCard key={bin.id} bin={bin} onClick={() => setSelectedBin(bin)} onShowOnMap={() => showOnMap(bin.id)} highlighted={bin.id === mapBinId} />
                      ))}
                    </Reveal>
                  )}
                </div>

                {/* right: alerts panel */}
                <aside className="w-full lg:w-72 xl:w-80 shrink-0 space-y-3">
                  <div ref={alertsRef} className="flex items-center justify-between scroll-mt-4">
                    <h2 className="text-xs uppercase tracking-[0.12em] text-pine-muted font-bold">Alerts</h2>
                    {unreadCount > 0 && (
                      <div className="flex items-center gap-3">
                        <button
                          onClick={clearAllAlerts}
                          className="relative text-xs font-bold text-pine-muted hover:text-forest transition-colors before:absolute before:-inset-x-2 before:-inset-y-3"
                        >Clear all</button>
                        <span className="text-[11px] bg-rose/25 text-pine font-bold px-2 py-0.5 rounded-full">{unreadCount} active</span>
                      </div>
                    )}
                  </div>

                  <div data-lenis-prevent className="max-h-[600px] overflow-y-auto pr-0.5">
                    <Reveal className="space-y-2">
                    {visibleAlerts.length === 0 ? (
                      <div className="glass rounded-2xl py-10 text-center text-pine-muted">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="block mx-auto mb-1"><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/></svg>
                        <p className="text-xs font-semibold">No active alerts</p>
                      </div>
                    ) : visibleAlerts.map(a => (
                      <AlertItem key={a.id} alert={a} onDismiss={dismissAlert} onSelect={alert => showOnMap(alert.binId)} />
                    ))}
                    </Reveal>
                  </div>

                  {/* summary stats */}
                  <Reveal>
                  <div className="glass rounded-3xl p-4 mt-4">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-pine-muted font-bold mb-3">Bin activity</p>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: 'Total Bins', value: myBins.length, color: 'text-forest' },
                        { label: 'Critical', value: myBins.filter(b => binStatus(b) === 'critical').length, color: 'text-status-critical-ink' },
                        { label: 'Warning', value: myBins.filter(b => binStatus(b) === 'warn').length, color: 'text-status-warn-ink' },
                        { label: 'Offline', value: myBins.filter(b => b.sensorStatus === 'offline').length, color: 'text-status-offline-ink' },
                      ].map(s => (
                        <div key={s.label} className="text-center py-2.5 bg-ivory/75 rounded-2xl">
                          <p className={`font-mono font-bold text-xl ${s.color}`}>{s.value}</p>
                          <p className="text-[11px] font-semibold text-pine-muted mt-0.5">{s.label}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 pt-3 border-t border-pine/[0.07]">
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="font-semibold text-pine-muted">Average fill</span>
                        <span className="font-mono font-semibold text-forest">
                          {Math.round(myBins.reduce((s, b) => s + avgFill(b), 0) / Math.max(1, myBins.length))}%
                        </span>
                      </div>
                      <div className="h-2 bg-pine/10 rounded-full overflow-hidden">
                        <div className="h-full bg-olive rounded-full" style={{ width: `${Math.round(myBins.reduce((s, b) => s + avgFill(b), 0) / Math.max(1, myBins.length))}%` }} />
                      </div>
                    </div>
                  </div>
                  </Reveal>
                </aside>
              </div>
              )}
            </>
          )}

          {/* manage tab */}
          {page === 'admin' && currentRole === 'editor' && (
            <div className="space-y-5 md:space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h1 className="text-3xl lg:text-4xl font-bold text-pine tracking-tight">Staff &amp; Zones</h1>
                  <p className="text-sm md:text-[15px] font-medium text-pine-muted mt-1">Manage roles and zone assignments for your team.</p>
                </div>
                <span className="text-xs bg-teal-soft text-teal px-3 py-1.5 rounded-full font-bold whitespace-nowrap">Editors only</span>
              </div>
              {/* phones: one card per person (the table doesn't fit) */}
              <Reveal className="md:hidden space-y-3">
                {staffList.map(member => {
                  const editing = editingStaff === member.id
                  return (
                    <div key={member.id} className="glass rounded-3xl p-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${member.role === 'editor' ? 'bg-pine text-ivory' : 'bg-teal-soft text-teal'}`}>
                          {member.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-forest">{member.name}{member.id === currentUserId && <span className="text-pine-muted font-medium"> (you)</span>}</p>
                          <p className="text-pine-muted text-xs font-medium truncate">{member.email}</p>
                        </div>
                        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${member.role === 'editor' ? 'bg-teal-soft text-teal' : 'bg-offline-soft text-status-offline-ink'}`}>
                          {member.role}
                        </span>
                      </div>
                      {!editing && (
                        <div className="flex flex-wrap gap-1.5 mt-3">
                          {member.zones.length === 0
                            ? <span className="text-xs font-semibold text-status-warn-ink">No zones yet</span>
                            : member.zones.map(z => <span key={z} className="text-[11px] font-bold bg-olive-soft text-olive-ink px-2.5 py-0.5 rounded-full">{z}</span>)}
                        </div>
                      )}
                      {editing && (
                        <div className="mt-4 pt-4 border-t border-pine/[0.07]">
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
                        className={`mt-3 w-full min-h-11 rounded-full text-sm font-bold transition-colors ${editing ? 'bg-pine text-ivory hover:bg-forest-light' : 'bg-ivory/80 text-forest hover:bg-ivory'}`}
                      >
                        {editing ? 'Done' : 'Edit'}
                      </button>
                    </div>
                  )
                })}
              </Reveal>
              {/* ipad and up: the table */}
              <Reveal className="hidden md:block">
              <div className="glass rounded-[28px] p-2 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-ivory/75">
                      {['Name', 'Email', 'Role', 'Zones'].map((h, i) => (
                        <th key={h} className={`text-left px-4 py-3 text-[11px] uppercase tracking-[0.08em] text-pine-muted font-bold ${i === 0 ? 'rounded-l-[20px]' : ''}`}>{h}</th>
                      ))}
                      <th className="px-4 py-3 rounded-r-[20px]"><span className="sr-only">Edit</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffList.map((member, i) => (
                      <Fragment key={member.id}>
                        <tr className={i > 0 ? 'border-t border-pine/[0.07]' : ''}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${member.role === 'editor' ? 'bg-pine text-ivory' : 'bg-teal-soft text-teal'}`}>
                                {member.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                              </div>
                              <span className="font-bold text-forest">{member.name}{member.id === currentUserId && <span className="text-pine-muted font-medium"> (you)</span>}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-pine-muted font-medium text-[13px]">{member.email}</td>
                          <td className="px-4 py-3">
                            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${member.role === 'editor' ? 'bg-teal-soft text-teal' : 'bg-offline-soft text-status-offline-ink'}`}>
                              {member.role}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1.5">
                              {member.zones.length === 0
                                ? <span className="text-xs font-semibold text-status-warn-ink">No zones yet</span>
                                : member.zones.map(z => (
                                  <span key={z} className="text-[11px] font-bold bg-olive-soft text-olive-ink px-2.5 py-0.5 rounded-full">{z}</span>
                                ))}
                            </div>
                          </td>
                          <td className="px-4 py-1 text-right">
                            {/* min-h-11: a 44px tap area around the small text */}
                            <button
                              onClick={() => setEditingStaff(editingStaff === member.id ? null : member.id)}
                              aria-label={`${editingStaff === member.id ? 'Done editing' : 'Edit'} ${member.name}`}
                              className={`min-h-11 px-3 -mr-3 text-[13px] font-bold transition-colors ${editingStaff === member.id ? 'text-teal' : 'text-pine-muted hover:text-forest'}`}
                            >
                              {editingStaff === member.id ? 'Done' : 'Edit'}
                            </button>
                          </td>
                        </tr>
                        {editingStaff === member.id && (
                          <tr key={`${member.id}-edit`}>
                            <td colSpan={5} className="px-2 pb-2">
                              <div className="bg-ivory/65 rounded-[20px] px-5 py-4">
                                <StaffEditor
                                  member={member}
                                  isSelf={member.id === currentUserId}
                                  onToggleRole={() => toggleStaffRole(member.id)}
                                  onToggleZone={zone => toggleZoneAssignment(member.id, zone)}
                                />
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              </Reveal>
              <AlertSettingsCard settings={alertSettings} onChange={setAlertSettings} />
            </div>
          )}

          {/* viewers can't open admin */}
          {page === 'admin' && currentRole !== 'editor' && (
            <div className="glass rounded-[28px] py-20 text-center text-pine-muted">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="block mx-auto mb-3"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
              <p className="text-sm font-semibold">Editor access required.</p>
            </div>
          )}
        </PageScope>
        </div>
      </main>

      {/* bin detail modal */}
      {selectedBin && <BinDetailModal bin={selectedBin} onClose={() => setSelectedBin(null)} />}

      {/* footer */}
      <footer className="mt-10 pt-4 pb-28 desk:pb-6 px-6 desk:pl-[calc(88px+1.5rem)] text-center">
        <p className="text-xs font-semibold text-pine-muted">Bin Monitor · {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </footer>
    </div>
  )
}
