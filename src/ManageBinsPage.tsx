import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { divIcon } from 'leaflet'
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { apiRequest, triBinNumber } from './api'
import type { ToolBin } from './TestPanelPage'

// editor-only: add a bin, edit its details, or move it (tap the map or type lat/long).
// uses crystal's /api/admin/tribins endpoints

const CAMPUS_CENTER: [number, number] = [38.5605, -121.4237]
const OSM_CREDIT = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

// same teal ring as the selected pin on the main map
const PIN = divIcon({
  className: '',
  html: '<span style="display:block;width:22px;height:22px;border-radius:9999px;background:#1B5B65;border:3px solid #F4F1DE;box-shadow:0 0 0 1px rgb(0 0 0 / .18),0 2px 5px rgb(0 0 0 / .4)"></span>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
})

interface Draft {
  mode: 'add' | 'edit'
  id?: string // "TB-12" when editing
  number: string
  zone: string // one letter, "" = none yet
  location: string
  lat: string
  lng: string
}

// "Zone A" -> "A", "" -> ""
function zoneLetter(zone: string) {
  return zone.replace(/^Zone\s*/i, '').trim().slice(0, 1).toUpperCase()
}

function validCoords(lat: string, lng: string) {
  const la = Number(lat)
  const ln = Number(lng)
  return lat.trim() !== '' && lng.trim() !== '' && Number.isFinite(la) && Number.isFinite(ln) && la >= -90 && la <= 90 && ln >= -180 && ln <= 180
}

// tap anywhere on the map to drop the pin there
function TapToPlace({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: e => onPick(e.latlng.lat, e.latlng.lng) })
  return null
}

// typed coordinates off screen? glide the map over to them
function FollowPin({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap()
  useEffect(() => {
    if (!map.getBounds().contains([lat, lng])) map.panTo([lat, lng])
  }, [map, lat, lng])
  return null
}

function LocationPicker({ lat, lng, onPick }: { lat: string; lng: string; onPick: (lat: number, lng: number) => void }) {
  const has = validCoords(lat, lng)
  const center: [number, number] = has ? [Number(lat), Number(lng)] : CAMPUS_CENTER
  return (
    <div data-lenis-prevent className="h-64 md:h-72 rounded-2xl overflow-hidden border border-pine/10">
      <MapContainer center={center} zoom={has ? 18 : 16} maxZoom={19} className="h-full w-full" scrollWheelZoom>
        <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} attribution={OSM_CREDIT} className="[filter:grayscale(.85)_brightness(1.05)_contrast(.9)]" />
        <TapToPlace onPick={onPick} />
        {has && <Marker position={[Number(lat), Number(lng)]} icon={PIN} />}
        {has && <FollowPin lat={Number(lat)} lng={Number(lng)} />}
      </MapContainer>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-bold text-pine mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-xs font-medium text-pine-muted mt-1">{hint}</span>}
    </label>
  )
}

const INPUT = 'w-full min-h-12 rounded-2xl bg-white/70 border border-pine/10 px-4 text-base text-pine placeholder:text-pine-muted/70 outline-none focus:border-teal/50 focus:ring-2 focus:ring-teal/20 transition'

export default function ManageBinsPage({ bins, onChanged, onScrollTop }: {
  bins: ToolBin[] // every bin, including ones with no zone yet
  onChanged: () => void
  onScrollTop: () => void // the form opens at the top, so bring it into view
}) {
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const zones = useMemo(() => {
    const letters = new Set(['A', 'B'])
    for (const b of bins) if (zoneLetter(b.zone)) letters.add(zoneLetter(b.zone))
    return [...letters].sort()
  }, [bins])

  const sorted = useMemo(() => [...bins].sort((a, b) => triBinNumber(a.id) - triBinNumber(b.id)), [bins])
  const q = query.trim().toLowerCase()
  const shown = q ? sorted.filter(b => `${b.name} ${b.location} ${b.zone}`.toLowerCase().includes(q)) : sorted
  const editingBin = draft?.mode === 'edit' ? bins.find(b => b.id === draft.id) : undefined

  function startAdd() {
    const next = Math.max(0, ...bins.map(b => triBinNumber(b.id)).filter(Number.isFinite)) + 1
    setDraft({ mode: 'add', number: String(next), zone: zones[0], location: '', lat: '', lng: '' })
    setError('')
    setNotice('')
    onScrollTop()
  }

  function startEdit(b: ToolBin) {
    setDraft({ mode: 'edit', id: b.id, number: String(triBinNumber(b.id)), zone: zoneLetter(b.zone), location: b.location, lat: String(b.lat), lng: String(b.lng) })
    setError('')
    setNotice('')
    onScrollTop()
  }

  function set(patch: Partial<Draft>) {
    setDraft(d => (d ? { ...d, ...patch } : d))
  }

  // 7 decimals is about 1 cm, plenty for a bin
  function pick(lat: number, lng: number) {
    set({ lat: lat.toFixed(7), lng: lng.toFixed(7) })
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!draft) return
    const number = Number.parseInt(draft.number, 10)
    if (draft.mode === 'add' && (!Number.isInteger(number) || number <= 0)) return setError('Enter a bin number above 0.')
    if (draft.mode === 'add' && bins.some(b => triBinNumber(b.id) === number)) return setError(`Bin ${number} already exists. Pick another number.`)
    if (!draft.zone) return setError('Pick a zone.')
    if (!draft.location.trim()) return setError('Enter a location name, like “Outside Benicia Hall”.')
    if (!validCoords(draft.lat, draft.lng)) return setError('Tap the map or type a latitude and longitude.')

    setSaving(true)
    setError('')
    try {
      if (draft.mode === 'add') {
        await apiRequest('/api/admin/tribins', 'POST', {
          triBinID: number, zone: draft.zone, location: draft.location.trim(), latitude: Number(draft.lat), longitude: Number(draft.lng),
        })
        setNotice(`Bin ${number} added. Its sensor shows offline until it sends its first reading.`)
      } else if (editingBin) {
        const changes: string[] = []
        if (draft.zone !== zoneLetter(editingBin.zone) || draft.location.trim() !== editingBin.location) {
          await apiRequest(`/api/admin/tribins/${number}`, 'PUT', { zone: draft.zone, location: draft.location.trim() })
          changes.push('details')
        }
        if (Number(draft.lat) !== editingBin.lat || Number(draft.lng) !== editingBin.lng) {
          await apiRequest(`/api/admin/tribins/${number}/location`, 'PUT', { latitude: Number(draft.lat), longitude: Number(draft.lng) })
          changes.push('location')
        }
        setNotice(changes.length ? `${editingBin.name} updated (${changes.join(' and ')}).` : 'Nothing changed.')
      }
      setDraft(null)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5 md:space-y-6">
      {notice && !draft && (
        <p role="status" className="rounded-2xl bg-olive-soft text-olive-ink text-sm font-bold px-4 py-3">{notice}</p>
      )}

      {draft && (
        <form onSubmit={save} noValidate className="rounded-[28px] p-5 md:p-6 glass space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-pine">{draft.mode === 'add' ? 'Add a bin' : `Edit ${editingBin?.name ?? 'bin'}`}</h2>
            <button type="button" onClick={() => setDraft(null)} className="ml-auto text-sm font-bold text-pine-muted hover:text-pine min-h-11 px-2 -mr-2">Cancel</button>
          </div>

          <div className="grid gap-4 md:grid-cols-[1fr_1fr_2fr]">
            <Field label="Bin number" hint={draft.mode === 'edit' ? 'Can’t be changed' : 'The number on the bin'}>
              <input type="number" inputMode="numeric" min={1} value={draft.number} disabled={draft.mode === 'edit'} onChange={e => set({ number: e.target.value })} className={`${INPUT} disabled:opacity-60`} />
            </Field>
            <Field label="Zone">
              <select value={draft.zone} onChange={e => set({ zone: e.target.value })} className={INPUT}>
                {!draft.zone && <option value="">Pick a zone</option>}
                {zones.map(z => <option key={z} value={z}>Zone {z}</option>)}
              </select>
            </Field>
            <Field label="Location name">
              <input type="text" value={draft.location} onChange={e => set({ location: e.target.value })} placeholder="Outside Benicia Hall" className={INPUT} />
            </Field>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-bold text-pine">Where is it? <span className="font-medium text-pine-muted">Tap the map, or type the coordinates.</span></p>
            <LocationPicker key={draft.id ?? 'new'} lat={draft.lat} lng={draft.lng} onPick={pick} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Latitude">
                <input type="text" inputMode="decimal" value={draft.lat} onChange={e => set({ lat: e.target.value })} placeholder="38.5605" className={INPUT} />
              </Field>
              <Field label="Longitude">
                <input type="text" inputMode="decimal" value={draft.lng} onChange={e => set({ lng: e.target.value })} placeholder="-121.4237" className={INPUT} />
              </Field>
            </div>
          </div>

          {error && <p role="alert" className="text-sm font-semibold text-status-critical-ink bg-critical-soft rounded-2xl px-4 py-3">{error}</p>}

          <button type="submit" disabled={saving} className="w-full md:w-auto md:px-10 min-h-12 rounded-full bg-pine text-ivory text-[15px] font-bold hover:bg-forest-light transition-colors disabled:opacity-60">
            {saving ? 'Saving…' : draft.mode === 'add' ? 'Add bin' : 'Save changes'}
          </button>
        </form>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by number, place or zone"
          aria-label="Search bins"
          className="flex-1 min-w-[14rem] min-h-11 rounded-full glass px-5 text-[15px] text-pine placeholder:text-pine-muted outline-none focus:ring-2 focus:ring-teal/25"
        />
        <button onClick={startAdd} className="min-h-11 rounded-full bg-pine text-ivory px-5 text-sm font-bold hover:bg-forest-light transition-colors">+ Add a bin</button>
      </div>

      <p className="text-xs font-bold uppercase tracking-[0.12em] text-pine-muted px-1">
        {shown.length} {shown.length === 1 ? 'bin' : 'bins'}
      </p>

      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {shown.map(b => (
          <li key={b.id} className={`glass rounded-3xl p-4 flex items-start gap-3 ${draft?.id === b.id ? 'ring-2 ring-teal/40' : ''}`}>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[17px] font-bold text-pine">{b.name}</span>
                {b.zone
                  ? <span className="text-[11px] font-bold bg-teal-soft text-teal rounded-full px-2.5 py-0.5">{b.zone}</span>
                  : <span className="text-[11px] font-bold bg-warn-soft text-status-warn-ink rounded-full px-2.5 py-0.5">No zone yet</span>}
              </div>
              <p className="text-sm text-pine-muted truncate mt-0.5">{b.location}</p>
              <p className="text-xs font-mono text-pine-muted mt-1">{b.lat.toFixed(5)}, {b.lng.toFixed(5)}</p>
            </div>
            <button onClick={() => startEdit(b)} aria-label={`Edit ${b.name}`} className="min-h-11 px-4 rounded-full bg-ivory/80 text-forest text-sm font-bold hover:bg-ivory transition-colors">Edit</button>
          </li>
        ))}
      </ul>
      {shown.length === 0 && <p className="text-sm text-pine-muted text-center py-6">No bins match “{query}”.</p>}
    </div>
  )
}
