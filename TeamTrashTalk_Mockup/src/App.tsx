import { useState, useMemo, Fragment } from 'react'
import logoUrl from './imports/logo.png'

// ─── Types ────────────────────────────────────────────────────────────────────

type Role = 'admin' | 'staff'
type Status = 'ok' | 'warn' | 'critical' | 'offline'
type Zone = 'Lassen Hall' | 'Riverside Hall' | 'Yosemite Hall' | 'Mendocino Hall' | 'Sequoia Hall' | 'Sacramento Hall' | 'Douglass Hall' | 'Shasta Hall'

interface Compartment {
  label: 'Trash' | 'Recycling' | 'Compost'
  fill: number
}

interface Tribin {
  id: string
  name: string
  zone: Zone
  compartments: Compartment[]
  battery: number
  sensorStatus: 'online' | 'offline'
  lastUpdated: string
  status: Status
}

interface Alert {
  id: string
  binId: string
  binName: string
  zone: Zone
  message: string
  severity: 'info' | 'warn' | 'critical'
  time: string
  read: boolean
}

interface StaffMember {
  id: string
  name: string
  role: Role
  zones: Zone[]
  email: string
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const TRIBINS: Tribin[] = [
  {
    id: 'TB-001', name: 'Tribin 01', zone: 'Sacramento Hall',
    compartments: [{ label: 'Trash', fill: 91 }, { label: 'Recycling', fill: 83 }, { label: 'Compost', fill: 78 }],
    battery: 72, sensorStatus: 'online', lastUpdated: '2 min ago', status: 'critical',
  },
  {
    id: 'TB-002', name: 'Tribin 02', zone: 'Lassen Hall',
    compartments: [{ label: 'Trash', fill: 45 }, { label: 'Recycling', fill: 68 }, { label: 'Compost', fill: 30 }],
    battery: 89, sensorStatus: 'online', lastUpdated: '4 min ago', status: 'warn',
  },
  {
    id: 'TB-003', name: 'Tribin 03', zone: 'Sequoia Hall',
    compartments: [{ label: 'Trash', fill: 22 }, { label: 'Recycling', fill: 18 }, { label: 'Compost', fill: 10 }],
    battery: 95, sensorStatus: 'online', lastUpdated: '1 min ago', status: 'ok',
  },
  {
    id: 'TB-004', name: 'Tribin 04', zone: 'Riverside Hall',
    compartments: [{ label: 'Trash', fill: 74 }, { label: 'Recycling', fill: 61 }, { label: 'Compost', fill: 55 }],
    battery: 61, sensorStatus: 'online', lastUpdated: '6 min ago', status: 'warn',
  },
  {
    id: 'TB-005', name: 'Tribin 05', zone: 'Yosemite Hall',
    compartments: [{ label: 'Trash', fill: 0 }, { label: 'Recycling', fill: 0 }, { label: 'Compost', fill: 0 }],
    battery: 12, sensorStatus: 'offline', lastUpdated: '3 hrs ago', status: 'offline',
  },
  {
    id: 'TB-006', name: 'Tribin 06', zone: 'Mendocino Hall',
    compartments: [{ label: 'Trash', fill: 38 }, { label: 'Recycling', fill: 44 }, { label: 'Compost', fill: 29 }],
    battery: 78, sensorStatus: 'online', lastUpdated: '3 min ago', status: 'ok',
  },
  {
    id: 'TB-007', name: 'Tribin 07', zone: 'Douglass Hall',
    compartments: [{ label: 'Trash', fill: 55 }, { label: 'Recycling', fill: 70 }, { label: 'Compost', fill: 48 }],
    battery: 54, sensorStatus: 'online', lastUpdated: '8 min ago', status: 'warn',
  },
  {
    id: 'TB-008', name: 'Tribin 08', zone: 'Shasta Hall',
    compartments: [{ label: 'Trash', fill: 14 }, { label: 'Recycling', fill: 22 }, { label: 'Compost', fill: 8 }],
    battery: 91, sensorStatus: 'online', lastUpdated: '5 min ago', status: 'ok',
  },
]

const ALERTS: Alert[] = [
  { id: 'a1', binId: 'TB-001', binName: 'Tribin 01', zone: 'Sacramento Hall', message: 'Trash compartment reached 91% — immediate collection required', severity: 'critical', time: '2 min ago', read: false },
  { id: 'a2', binId: 'TB-001', binName: 'Tribin 01', zone: 'Sacramento Hall', message: 'Recycling compartment at 83%', severity: 'warn', time: '4 min ago', read: false },
  { id: 'a3', binId: 'TB-005', binName: 'Tribin 05', zone: 'Yosemite Hall', message: 'Sensor offline — last contact 3 hours ago', severity: 'critical', time: '3 hrs ago', read: false },
  { id: 'a4', binId: 'TB-004', binName: 'Tribin 04', zone: 'Riverside Hall', message: 'Trash compartment reached 74%', severity: 'warn', time: '6 min ago', read: true },
  { id: 'a5', binId: 'TB-007', binName: 'Tribin 07', zone: 'Douglass Hall', message: 'Recycling at 70% — schedule collection soon', severity: 'warn', time: '8 min ago', read: true },
  { id: 'a6', binId: 'TB-005', binName: 'Tribin 05', zone: 'Yosemite Hall', message: 'Battery critical: 12% remaining', severity: 'critical', time: '3 hrs ago', read: true },
]

const STAFF: StaffMember[] = [
  { id: 's1', name: 'Person 1', role: 'admin', zones: ['Lassen Hall', 'Riverside Hall', 'Yosemite Hall', 'Mendocino Hall', 'Sequoia Hall', 'Sacramento Hall', 'Douglass Hall', 'Shasta Hall'], email: 'person1@csus.edu' },
  { id: 's2', name: 'Person 2', role: 'staff', zones: ['Sacramento Hall', 'Douglass Hall'], email: 'person2@csus.edu' },
  { id: 's3', name: 'Person 3', role: 'staff', zones: ['Lassen Hall', 'Riverside Hall'], email: 'person3@csus.edu' },
  { id: 's4', name: 'Person 4', role: 'staff', zones: ['Sequoia Hall', 'Yosemite Hall', 'Mendocino Hall'], email: 'person4@csus.edu' },
  { id: 's5', name: 'Person 5', role: 'staff', zones: ['Shasta Hall'], email: 'person5@csus.edu' },
]

const ALL_ZONES: Zone[] = ['Lassen Hall', 'Riverside Hall', 'Yosemite Hall', 'Mendocino Hall', 'Sequoia Hall', 'Sacramento Hall', 'Douglass Hall', 'Shasta Hall']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function maxFill(bin: Tribin) {
  return Math.max(...bin.compartments.map(c => c.fill))
}

function avgFill(bin: Tribin) {
  return Math.round(bin.compartments.reduce((s, c) => s + c.fill, 0) / bin.compartments.length)
}

// Derive a bin's status from its fullest compartment. An offline sensor
// always wins; otherwise anything at 80%+ counts as critical.
function binStatus(bin: Tribin): Status {
  if (bin.sensorStatus === 'offline') return 'offline'
  const top = maxFill(bin)
  if (top >= 80) return 'critical'
  if (top >= 60) return 'warn'
  return 'ok'
}

function statusColor(status: Status) {
  return {
    ok: 'text-emerald-700',
    warn: 'text-amber-600',
    critical: 'text-red-600',
    offline: 'text-stone-400',
  }[status]
}

function statusBg(status: Status) {
  return {
    ok: 'bg-emerald-100 text-emerald-800',
    warn: 'bg-amber-100 text-amber-800',
    critical: 'bg-red-100 text-red-800',
    offline: 'bg-stone-100 text-stone-500',
  }[status]
}

function statusLabel(status: Status) {
  return { ok: 'OK', warn: 'Warning', critical: 'Critical', offline: 'Offline' }[status]
}

function fillBarColor(fill: number) {
  if (fill >= 80) return 'bg-red-500'
  if (fill >= 60) return 'bg-amber-400'
  return 'bg-emerald-500'
}

function compartmentColor(label: 'Trash' | 'Recycling' | 'Compost') {
  return { Trash: '#6b7280', Recycling: '#3b82f6', Compost: '#a16207' }[label]
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function RingGauge({ fill, size = 56 }: { fill: number; size?: number }) {
  const r = (size - 8) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (fill / 100) * circ
  const color = fill >= 80 ? '#ef4444' : fill >= 60 ? '#f59e0b' : '#10b981'
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={6} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={6}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
    </svg>
  )
}

function BatteryIcon({ level }: { level: number }) {
  const color = level <= 20 ? 'text-red-500' : level <= 40 ? 'text-amber-500' : 'text-emerald-600'
  return (
    <span className={`font-mono text-xs ${color}`} title={`Battery: ${level}%`}>
      {level <= 20 ? '⚡' : '🔋'} {level}%
    </span>
  )
}

function CompartmentBar({ label, fill }: { label: string; fill: number; color: string }) {
  const barColor = fill >= 80 ? 'bg-red-500' : fill >= 60 ? 'bg-amber-400' : 'bg-emerald-500'
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between items-center">
        <span className="text-[10px] font-medium text-stone-500 uppercase tracking-wide">{label}</span>
        <span className="font-mono text-[10px] font-medium" style={{ color: compartmentColor(label as any) }}>{fill}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-stone-200 overflow-hidden">
        <div className={`h-full rounded-full ${barColor} transition-all duration-500`} style={{ width: `${fill}%` }} />
      </div>
    </div>
  )
}

function BinCard({ bin, onClick }: { bin: Tribin; onClick: () => void }) {
  const top = maxFill(bin)
  return (
    <button
      onClick={onClick}
      className="group text-left bg-white rounded-2xl border border-stone-200/80 p-4 hover:border-emerald-300 hover:shadow-lg hover:shadow-emerald-900/5 transition-all duration-200 cursor-pointer"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-bold text-forest text-sm">{bin.name}</p>
          <p className="text-xs text-stone-400 mt-0.5">{bin.zone}</p>
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
          <span className="absolute font-mono text-[11px] font-bold" style={{ color: top >= 80 ? '#ef4444' : top >= 60 ? '#f59e0b' : '#10b981' }}>
            {top}%
          </span>
        </div>
        <div className="flex-1 space-y-1.5">
          {bin.compartments.map(c => (
            <CompartmentBar key={c.label} label={c.label} fill={c.fill} color={compartmentColor(c.label)} />
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-stone-100">
        <BatteryIcon level={bin.battery} />
        <span className="text-[10px] text-stone-400 font-mono">{bin.lastUpdated}</span>
      </div>
    </button>
  )
}

function AlertItem({ alert, onDismiss }: { alert: Alert; onDismiss: (id: string) => void }) {
  const icon = { critical: '🔴', warn: '🟡', info: '🔵' }[alert.severity]
  const bg = { critical: 'border-l-red-500 bg-red-50', warn: 'border-l-amber-400 bg-amber-50', info: 'border-l-blue-400 bg-blue-50' }[alert.severity]
  return (
    <div className={`flex gap-3 p-3 border-l-2 rounded-r-lg ${bg} ${alert.read ? 'opacity-60' : ''}`}>
      <span className="text-sm mt-0.5 shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-forest">{alert.binName} · {alert.zone}</p>
        <p className="text-xs text-stone-600 mt-0.5 leading-snug">{alert.message}</p>
        <p className="text-[10px] text-stone-400 font-mono mt-1">{alert.time}</p>
      </div>
      <button
        onClick={() => onDismiss(alert.id)}
        className="text-stone-300 hover:text-stone-500 shrink-0 text-xs transition-colors"
        title="Dismiss"
      >✕</button>
    </div>
  )
}

// ─── Modal: bin detail ─────────────────────────────────────────────────────────

function BinDetailModal({ bin, onClose }: { bin: Tribin; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-forest/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="font-display text-xl font-bold text-forest">{bin.name}</h2>
            <p className="text-sm text-stone-400">{bin.zone} · {bin.id}</p>
          </div>
          <button onClick={onClose} className="text-stone-300 hover:text-stone-600 transition-colors text-lg">✕</button>
        </div>

        <div className="flex justify-center mb-5">
          <div className="relative">
            <RingGauge fill={maxFill(bin)} size={96} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-mono font-bold text-lg" style={{ color: maxFill(bin) >= 80 ? '#ef4444' : maxFill(bin) >= 60 ? '#f59e0b' : '#10b981' }}>{maxFill(bin)}%</span>
              <span className="text-[9px] text-stone-400 uppercase tracking-wider">max fill</span>
            </div>
          </div>
        </div>

        <div className="space-y-3 mb-4">
          {bin.compartments.map(c => (
            <div key={c.label}>
              <div className="flex justify-between mb-1">
                <span className="text-xs font-semibold text-stone-600">{c.label}</span>
                <span className="font-mono text-xs font-bold" style={{ color: compartmentColor(c.label) }}>{c.fill}%</span>
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
            <p className={`font-medium mt-0.5 capitalize ${bin.sensorStatus === 'online' ? 'text-emerald-600' : 'text-red-500'}`}>{bin.sensorStatus}</p>
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

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [currentRole, setCurrentRole] = useState<Role>('admin')
  const [filterZone, setFilterZone] = useState<Zone | 'All'>('All')
  const [sortBy, setSortBy] = useState<'fill' | 'zone' | 'status' | 'name'>('fill')
  const [filterStatus, setFilterStatus] = useState<Status | 'All'>('All')
  const [alerts, setAlerts] = useState<Alert[]>(ALERTS)
  const [selectedBin, setSelectedBin] = useState<Tribin | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'admin'>('overview')
  const [editingStaff, setEditingStaff] = useState<string | null>(null)
  const [staffList, setStaffList] = useState<StaffMember[]>(STAFF)

  const unreadCount = alerts.filter(a => !a.read).length

  const fullestBin = useMemo(() => {
    return [...TRIBINS].sort((a, b) => maxFill(b) - maxFill(a))[0]
  }, [])

  const filteredBins = useMemo(() => {
    let bins = [...TRIBINS]
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
  }, [filterZone, filterStatus, sortBy])

  function dismissAlert(id: string) {
    setAlerts(prev => prev.filter(a => a.id !== id))
  }

  function toggleZoneAssignment(staffId: string, zone: Zone) {
    setStaffList(prev => prev.map(s => {
      if (s.id !== staffId) return s
      const has = s.zones.includes(zone)
      return { ...s, zones: has ? s.zones.filter(z => z !== zone) : [...s.zones, zone] }
    }))
  }

  function toggleStaffRole(staffId: string) {
    setStaffList(prev => prev.map(s =>
      s.id === staffId ? { ...s, role: s.role === 'admin' ? 'staff' : 'admin' } : s
    ))
  }

  return (
    <div className="min-h-screen bg-sage font-sans" style={{ fontFamily: 'Outfit, system-ui, sans-serif' }}>

      {/* ── Nav ─────────────────────────────────────────── */}
      <nav className="sticky top-0 z-40 bg-forest text-white px-5 py-0 flex items-center justify-between h-14 shadow-lg shadow-forest/30">
        <div className="flex items-center gap-3">
          <img src={logoUrl} alt="Sac State Sustainability" className="h-10 w-auto object-contain shrink-0" />

          <div>
            <span className="font-bold text-sm tracking-tight">Bin Monitor</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Role toggle (demo) */}
          <div className="flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1.5 cursor-pointer" onClick={() => setCurrentRole(r => r === 'admin' ? 'staff' : 'admin')}>
            <div className={`w-1.5 h-1.5 rounded-full ${currentRole === 'admin' ? 'bg-mint' : 'bg-amber-400'}`} />
            <span className="text-xs font-medium">{currentRole === 'admin' ? 'Person 1' : 'Person 2'}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wider ${currentRole === 'admin' ? 'bg-mint/20 text-mint' : 'bg-amber-400/20 text-amber-300'}`}>
              {currentRole}
            </span>
          </div>

          {/* Alert bell */}
          <button className="relative p-2 rounded-lg hover:bg-white/10 transition-colors" onClick={() => setActiveTab('overview')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full text-[9px] font-bold flex items-center justify-center">{unreadCount}</span>
            )}
          </button>

          <span className="hidden sm:block text-white/20 text-sm">|</span>

          <div className="hidden sm:flex items-center gap-2 text-xs text-white/50">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live
          </div>
        </div>
      </nav>

      {/* ── Tab bar (admin only gets extra tab) ─────────── */}
      <div className="bg-white border-b border-stone-200 px-5">
        <div className="flex gap-0 max-w-7xl mx-auto">
          {(['overview'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors capitalize ${activeTab === tab ? 'border-mint-dark text-forest' : 'border-transparent text-stone-400 hover:text-stone-600'}`}
            >{tab === 'overview' ? 'Dashboard' : tab}</button>
          ))}
          {currentRole === 'admin' && (
            <button onClick={() => setActiveTab('admin')}
              className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'admin' ? 'border-mint-dark text-forest' : 'border-transparent text-stone-400 hover:text-stone-600'}`}
            >Staff &amp; Zones</button>
          )}
        </div>
      </div>

      {/* ── Main ────────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {activeTab === 'overview' && (
          <>
            {/* ── Spotlight: fullest bin ─────────────────── */}
            <section>
              <p className="text-[11px] uppercase tracking-widest text-stone-400 font-semibold mb-2">Needs Immediate Attention</p>
              <div className="relative overflow-hidden rounded-2xl bg-forest text-white px-6 py-5 flex flex-col sm:flex-row items-start sm:items-center gap-5 shadow-xl shadow-forest/20">
                {/* bg texture */}
                <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 80% 50%, #52b788 0%, transparent 60%)' }} />

                <div className="flex items-center gap-4">
                  <div className="relative shrink-0">
                    <RingGauge fill={maxFill(fullestBin)} size={80} />
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="font-mono font-bold text-xl text-red-400">{maxFill(fullestBin)}%</span>
                    </div>
                  </div>
                  <div>
                    <h1 className="font-display text-2xl sm:text-3xl font-bold leading-tight">
                      {fullestBin.name}
                    </h1>
                    <p className="text-white/60 text-sm mt-0.5">{fullestBin.zone} · {fullestBin.id}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {fullestBin.compartments.map(c => (
                        <span key={c.label} className="text-[11px] font-mono bg-white/10 rounded-md px-2 py-0.5">
                          {c.label} <span className={c.fill >= 80 ? 'text-red-400' : c.fill >= 60 ? 'text-amber-400' : 'text-emerald-400'}>{c.fill}%</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="sm:ml-auto flex flex-col items-start sm:items-end gap-2">
                  <span className="inline-flex items-center gap-1.5 bg-red-500/90 text-white text-xs font-semibold px-3 py-1.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    Critical — Collect Now
                  </span>
                  <span className="text-white/40 text-xs font-mono">Updated {fullestBin.lastUpdated}</span>
                </div>
              </div>
            </section>

            {/* ── Content: bins + sidebar ────────────────── */}
            <div className="flex flex-col lg:flex-row gap-6">

              {/* Left: bins grid */}
              <div className="flex-1 min-w-0 space-y-4">
                {/* Filters */}
                <div className="flex flex-wrap gap-2 items-center">
                  <div className="flex items-center gap-1.5 bg-white rounded-xl border border-stone-200 px-3 py-2 text-xs">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                    <span className="text-stone-400 font-medium mr-1">Zone:</span>
                    <select value={filterZone} onChange={e => setFilterZone(e.target.value as any)}
                      className="bg-transparent font-medium text-forest outline-none cursor-pointer pr-1">
                      <option value="All">All</option>
                      {ALL_ZONES.map(z => <option key={z} value={z}>{z}</option>)}
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

                  <span className="ml-auto text-xs text-stone-400 font-mono">{filteredBins.length} bin{filteredBins.length !== 1 ? 's' : ''}</span>
                </div>

                {/* Grid */}
                {filteredBins.length === 0 ? (
                  <div className="py-16 text-center text-stone-400">
                    <p className="text-4xl mb-2">🗑</p>
                    <p className="text-sm">No bins match these filters.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {filteredBins.map(bin => (
                      <BinCard key={bin.id} bin={bin} onClick={() => setSelectedBin(bin)} />
                    ))}
                  </div>
                )}
              </div>

              {/* Right: alerts panel */}
              <aside className="w-full lg:w-72 xl:w-80 shrink-0 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs uppercase tracking-widest text-stone-400 font-semibold">Alerts</h2>
                  {unreadCount > 0 && (
                    <span className="text-[10px] bg-red-100 text-red-700 font-semibold px-2 py-0.5 rounded-full">{unreadCount} unread</span>
                  )}
                </div>

                <div className="space-y-2 max-h-[600px] overflow-y-auto pr-0.5">
                  {alerts.length === 0 ? (
                    <div className="py-10 text-center text-stone-400">
                      <p className="text-2xl mb-1">✅</p>
                      <p className="text-xs">No active alerts</p>
                    </div>
                  ) : alerts.map(a => (
                    <AlertItem key={a.id} alert={a} onDismiss={dismissAlert} />
                  ))}
                </div>

                {/* Summary stats */}
                <div className="bg-white rounded-2xl border border-stone-200 p-4 mt-4">
                  <p className="text-[11px] uppercase tracking-widest text-stone-400 font-semibold mb-3">Trash Activity</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Total Bins', value: TRIBINS.length, color: 'text-forest' },
                      { label: 'Critical', value: TRIBINS.filter(b => binStatus(b) === 'critical').length, color: 'text-red-600' },
                      { label: 'Warning', value: TRIBINS.filter(b => binStatus(b) === 'warn').length, color: 'text-amber-600' },
                      { label: 'Offline', value: TRIBINS.filter(b => b.sensorStatus === 'offline').length, color: 'text-stone-400' },
                    ].map(s => (
                      <div key={s.label} className="text-center py-2 bg-sage rounded-xl">
                        <p className={`font-mono font-bold text-xl ${s.color}`}>{s.value}</p>
                        <p className="text-[10px] text-stone-400 mt-0.5">{s.label}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 pt-3 border-t border-stone-100">
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-stone-400">Trash activity</span>
                      <span className="font-mono font-semibold text-forest">
                        {Math.round(TRIBINS.reduce((s, b) => s + avgFill(b), 0) / TRIBINS.length)}%
                      </span>
                    </div>
                    <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.round(TRIBINS.reduce((s, b) => s + avgFill(b), 0) / TRIBINS.length)}%` }} />
                    </div>
                  </div>
                </div>
              </aside>
            </div>
          </>
        )}

        {/* ── Admin tab ─────────────────────────────────── */}
        {activeTab === 'admin' && currentRole === 'admin' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-2xl text-forest">Staff &amp; Zone Management</h2>
                <p className="text-sm text-stone-400 mt-0.5">Manage roles and zone assignments for your team.</p>
              </div>
              <span className="text-xs bg-mint/20 text-mint-dark px-3 py-1.5 rounded-full font-semibold">Admin only</span>
            </div>

            <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-100 bg-sage">
                    <th className="text-left px-5 py-3 text-[11px] uppercase tracking-wider text-stone-400 font-semibold">Name</th>
                    <th className="text-left px-5 py-3 text-[11px] uppercase tracking-wider text-stone-400 font-semibold">Email</th>
                    <th className="text-left px-5 py-3 text-[11px] uppercase tracking-wider text-stone-400 font-semibold">Role</th>
                    <th className="text-left px-5 py-3 text-[11px] uppercase tracking-wider text-stone-400 font-semibold hidden md:table-cell">Zones</th>
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
                            <span className="font-medium text-forest">{member.name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-stone-400 font-mono text-xs">{member.email}</td>
                        <td className="px-5 py-3.5">
                          <span className={`text-[11px] font-semibold px-2 py-1 rounded-full ${member.role === 'admin' ? 'bg-mint/20 text-mint-dark' : 'bg-stone-100 text-stone-500'}`}>
                            {member.role}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 hidden md:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {member.zones.map(z => (
                              <span key={z} className="text-[10px] bg-sage-dark text-stone-600 px-2 py-0.5 rounded-md">{z}</span>
                            ))}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <button
                            onClick={() => setEditingStaff(editingStaff === member.id ? null : member.id)}
                            className="text-xs text-stone-400 hover:text-forest transition-colors font-medium"
                          >
                            {editingStaff === member.id ? 'Done' : 'Edit'}
                          </button>
                        </td>
                      </tr>
                      {editingStaff === member.id && (
                        <tr key={`${member.id}-edit`} className="bg-sage/40">
                          <td colSpan={5} className="px-5 py-4">
                            <div className="space-y-3">
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-semibold text-stone-500">Role:</span>
                                <button
                                  onClick={() => toggleStaffRole(member.id)}
                                  className="text-xs px-3 py-1.5 rounded-lg border border-stone-200 bg-white hover:border-mint transition-colors font-medium"
                                >
                                  Toggle → {member.role === 'admin' ? 'staff' : 'admin'}
                                </button>
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-stone-500 mb-2">Zone assignments:</p>
                                <div className="flex flex-wrap gap-2">
                                  {ALL_ZONES.map(zone => (
                                    <button
                                      key={zone}
                                      onClick={() => toggleZoneAssignment(member.id, zone)}
                                      className={`text-xs px-3 py-1.5 rounded-lg border transition-colors font-medium ${
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

        {/* Guard: non-admin trying to access admin tab (shouldn't happen, but safety) */}
        {activeTab === 'admin' && currentRole !== 'admin' && (
          <div className="py-24 text-center">
            <p className="text-4xl mb-3">🔒</p>
            <p className="text-stone-500 text-sm">Admin access required.</p>
          </div>
        )}
      </main>

      {/* ── Bin detail modal ─────────────────────────────── */}
      {selectedBin && <BinDetailModal bin={selectedBin} onClose={() => setSelectedBin(null)} />}

      {/* ── Footer ─────────────────────────────────────── */}
      <footer className="mt-10 border-t border-stone-200 py-4 px-6 text-center">
        <p className="text-[11px] text-stone-400 font-mono">Bin Monitor · {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </footer>
    </div>
  )
}
