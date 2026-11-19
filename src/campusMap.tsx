import { useEffect, useState } from 'react'
import { latLngBounds } from 'leaflet'
import type { LatLngBounds, LatLngTuple, Layer } from 'leaflet'
import { TileLayer, ImageOverlay, Pane, useMap } from 'react-leaflet'
import { campusBoundary } from './data/campusBoundary'
import { campusBuildings } from './data/campusBuildings'
import { mockBins } from './data/mockBins'

// the campus base map, its bounds and the fog around it. shared by the bin map and the zones map
// so both look the same and neither scrolls off campus

export const MAX_ZOOM = 19
const TEAL_HEX = '#1B5B65' // building names

export function padMeters(bounds: LatLngBounds, meters: number) {
  const dLat = meters / 111_320
  const dLng = meters / (111_320 * Math.cos((bounds.getCenter().lat * Math.PI) / 180))
  return latLngBounds(
    [bounds.getSouth() - dLat, bounds.getWest() - dLng],
    [bounds.getNorth() + dLat, bounds.getEast() + dLng],
  )
}

// the campus outline, widened to any bin that's ever placed past it.
// you can pan at most 200 m beyond it
export const CAMPUS = latLngBounds(campusBoundary.map(([lng, lat]): LatLngTuple => [lat, lng]))
  .extend(latLngBounds(mockBins.map((b): LatLngTuple => [b.lat, b.lng])))
export const MAP_LIMIT = padMeters(CAMPUS, 200)

// fog outside the campus outline

// reaches well past MAP_LIMIT so a zoomed-out view never sees its edge
const FOG_BOUNDS = padMeters(MAP_LIMIT, 2000)
const FOG_FEATHER_M = 120 // soft edge, in meters, from clear campus to full fog
const FOG_OPACITY = 0.8

export function mercatorY(lat: number) {
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


// base map: openfreemap's positron (free, no key, no limits, osm data), drawn by maplibre
const VECTOR_STYLE = 'https://tiles.openfreemap.org/styles/positron'
const VECTOR_CREDIT =
  '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>'
export const OSM_CREDIT = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
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
export function BaseMap() {
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
export function CampusFog() {
  return (
    <Pane name="campusFog" style={{ zIndex: 450 }}>
      <ImageOverlay url={fogImage()} bounds={FOG_BOUNDS} />
    </Pane>
  )
}
