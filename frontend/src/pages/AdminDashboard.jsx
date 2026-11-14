import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import { Activity, AlertCircle, BarChart3, CarFront, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Compass, Download, Eye, FileClock, Filter, Gauge, LayoutDashboard, LocateFixed, LogOut, MapPin, Menu, Navigation, Radio, RefreshCw, Search, ShieldCheck, Signal, Users, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import { googleMapsKeyAvailable, loadGoogleMutant } from '../maps/googleMutant.js'
import { apiUrl } from '../lib/apiUrl.js'
import Brand from '../components/Brand.jsx'
import ThemeToggle from '../components/ThemeToggle.jsx'
import 'leaflet/dist/leaflet.css'
import '../styles/admin-dashboard.css'

const navItems = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'monitoring', label: 'Live Monitoring', icon: Radio },
  { id: 'rides', label: 'Ride Management', icon: CarFront },
  { id: 'allocation', label: 'Intelligent Allocation', icon: Gauge },
  { id: 'analytics', label: 'Analytics & PS02 Intelligence', icon: BarChart3 },
  { id: 'activity', label: 'Activity Logs', icon: FileClock },
]
const statusOptions = ['all', 'Requested', 'Accepted', 'Arriving', 'Ongoing', 'Completed', 'Cancelled', 'Rejected', 'Failed']
const currency = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0))
const when = value => value ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
const shortId = id => id ? `#${String(id).slice(-7).toUpperCase()}` : '—'

async function api(path) {
  const response = await fetch(apiUrl(path), { credentials: 'include' })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.message || 'Unable to load admin data.')
  return result
}

function Popup({ title, lines }) {
  const node = document.createElement('div')
  const strong = document.createElement('strong'); strong.textContent = title; node.appendChild(strong)
  lines.filter(Boolean).forEach(line => { const row = document.createElement('div'); row.textContent = line; node.appendChild(row) })
  return node
}

function AdminMap({ drivers, rides }) {
  const host = useRef(null), mapRef = useRef(null), layerRef = useRef(null)
  useEffect(() => {
    if (!host.current) return
    const map = L.map(host.current, { center: [22.5, 79], zoom: 5, scrollWheelZoom: false })
    const fallback = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map)
    loadGoogleMutant(L).then(() => {
      if (!mapRef.current) return
      fallback.remove()
      L.gridLayer.googleMutant({ type: 'roadmap' }).addTo(map)
    }).catch(() => {})
    layerRef.current = L.layerGroup().addTo(map); mapRef.current = map
    return () => { map.remove(); mapRef.current = null; layerRef.current = null }
  }, [])
  useEffect(() => {
    const group = layerRef.current
    if (!group) return
    group.clearLayers()
    const markers = []
    drivers.forEach(driver => {
      if (!driver.location) return
      const available = driver.availability === 'available'
      const icon = L.divIcon({ className: `admin-map-marker ${available ? 'driver-available' : 'driver-busy'}`, html: '<span></span>', iconSize: [28, 28], iconAnchor: [14, 14] })
      const marker = L.marker([driver.location.latitude, driver.location.longitude], { icon, title: `${driver.name} · ${driver.availability}` }).addTo(group)
      marker.bindPopup(Popup(driver.name, [`${driver.availability} · ${driver.vehicleType || 'vehicle'}`, `Updated ${when(driver.locationUpdatedAt)}`]))
      markers.push(marker)
    })
    rides.forEach(ride => {
      const pickup = ride.pickupLocation
      if (!pickup || pickup.length < 2) return
      const [lng, lat] = pickup
      const pickupIcon = L.divIcon({ className: 'admin-map-marker ride-pickup', html: '<span></span>', iconSize: [24, 24], iconAnchor: [12, 12] })
      const marker = L.marker([lat, lng], { icon: pickupIcon, title: `${ride.status} pickup` }).addTo(group)
      marker.bindPopup(Popup(`${shortId(ride.id)} · ${ride.status}`, [ride.pickup, ride.passenger?.name, ride.driver?.name ? `Driver: ${ride.driver.name}` : 'No driver assigned']))
      markers.push(marker)
    })
    if (markers.length) mapRef.current?.fitBounds(L.featureGroup(markers).getBounds().pad(.18), { maxZoom: 13 })
  }, [drivers, rides])
  return <div className="admin-map" ref={host} role="application" aria-label="Live map of online drivers and active ride locations"/>
}

function Kpi({ icon: Icon, label, value, detail, tint = 'blue', unit }) {
  return <article className="admin-kpi"><span className={`admin-kpi-icon tint-${tint}`}><Icon size={17}/></span><div className="admin-kpi-copy"><small>{label}</small><strong>{value == null ? '—' : `${value}${unit || ''}`}</strong><span>{detail}</span></div></article>
}

function LineChart({ title, rows, series, emptyText = 'No records in this date range.' }) {
  const values = rows.flatMap(row => series.map(item => Number(row[item.key])).filter(Number.isFinite))
  const max = Math.max(1, ...values), min = Math.min(0, ...values)
  const points = series.map(item => {
    const coords = rows.map((row, index) => [rows.length <= 1 ? 160 : 22 + index * 276 / (rows.length - 1), 112 - ((Number(row[item.key]) - min) / (max - min || 1)) * 88])
    return { ...item, path: coords.map(([x, y], index) => `${index ? 'L' : 'M'}${x},${y}`).join(' '), coords }
  })
  return <article className="admin-chart-card"><div className="admin-chart-title"><h3>{title}</h3><div>{series.map(item => <span key={item.key}><i style={{ background: item.color }}/>{item.label}</span>)}</div></div>{rows.length ? <><svg viewBox="0 0 320 132" className="admin-line-chart" role="img" aria-label={title}><path d="M22 112H298" className="chart-axis"/>{[0, 1, 2, 3].map(tick => <path key={tick} d={`M22 ${24 + tick * 29}H298`} className="chart-gridline"/>)}{points.map(line => <g key={line.key}><path d={line.path} fill="none" stroke={line.color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/>{line.coords.map(([x, y], index) => <circle key={`${line.key}-${index}`} cx={x} cy={y} r="3" fill={line.color}><title>{rows[index]?.date}: {rows[index]?.[line.key]}</title></circle>)}</g>)}</svg><div className="admin-chart-labels">{rows.map(row => <span key={row.date}>{row.date?.slice(5)}</span>)}</div></> : <div className="admin-chart-empty">{emptyText}</div>}</article>
}

function BarChart({ title, rows, nameKey, valueKey, color = '#3977e4', suffix = '', emptyText = 'No records in this date range.' }) {
  const max = Math.max(1, ...rows.map(row => Number(row[valueKey]) || 0))
  return <article className="admin-chart-card"><div className="admin-chart-title"><h3>{title}</h3><span className="chart-unit">Actual records</span></div>{rows.length ? <div className="admin-bars">{rows.slice(0, 8).map(row => <div className="admin-bar-row" key={row[nameKey]}><span title={row[nameKey]}>{row[nameKey]}</span><div><i style={{ width: `${Math.max(2, (Number(row[valueKey]) || 0) / max * 100)}%`, background: color }}/></div><b>{row[valueKey]}{suffix}</b></div>)}</div> : <div className="admin-chart-empty">{emptyText}</div>}</article>
}

function StatusPill({ status }) {
  const key = String(status || 'Unknown').toLowerCase().replace(/\s+/g, '-')
  return <span className={`admin-status status-${key}`}>{status || 'Unknown'}</span>
}

function TraceModal({ ride, onClose }) {
  const [trace, setTrace] = useState(null), [error, setError] = useState('')
  useEffect(() => { let mounted = true; api(`/api/admin/rides/${ride.id}/trace`).then(result => { if (mounted) setTrace(result.data) }).catch(err => { if (mounted) setError(err.message) }); return () => { mounted = false } }, [ride.id])
  return <div className="admin-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><section className="admin-trace-modal" role="dialog" aria-modal="true" aria-label="Ride trace"><header><div><span className="admin-section-kicker">COMPLETE RIDE TRACE</span><h2>{shortId(ride.id)} · {ride.passenger?.name || 'Passenger'}</h2></div><button className="admin-icon-btn" onClick={onClose} aria-label="Close ride trace"><X size={18}/></button></header><div className="trace-ride-overview"><span><small>ROUTE</small>{ride.pickup}<i>→</i>{ride.destination}</span><span><small>VEHICLE</small>{ride.vehicleType}</span><span><small>STATUS</small><StatusPill status={ride.status}/></span></div>{error && <div className="admin-error inline"><AlertCircle size={15}/>{error}</div>}{!trace && !error && <div className="admin-loading-line"><span className="admin-spinner"/> Loading timeline and allocation detail…</div>}{trace && <div className="trace-content"><section><h3>Activity timeline</h3>{trace.events.length ? <ol className="ride-event-timeline">{trace.events.map(event => <li key={event.id} className={event.legacy ? 'legacy-event' : ''}><i/><div><strong>{event.message}</strong><span>{event.actor} · {when(event.at)}</span>{event.details?.reason && <small>{event.details.reason}</small>}</div><StatusPill status={event.status}/></li>)}</ol> : <div className="admin-empty compact">No timeline events have been recorded for this ride yet.</div>}</section><section><h3>Driver allocation comparison</h3>{trace.allocation.some(log => log.candidates.length) ? trace.allocation.map(log => <div className="trace-allocation" key={log.id}><div className="trace-allocation-head"><strong>{log.outcome === 'reassigned' ? 'Reassignment' : 'Initial assignment'} · {log.vehicleType || ride.vehicleType}</strong><span>{when(log.createdAt)}</span></div><div className="admin-table-scroll"><table className="admin-table compact-table"><thead><tr><th>Rank</th><th>Driver</th><th>Score</th><th>Distance</th><th>ETA</th><th>Workload</th><th>Idle</th><th>Acceptance</th><th>Decision</th></tr></thead><tbody>{log.candidates.map((candidate, index) => <tr key={`${log.id}-${candidate.driverId}-${index}`}><td>{candidate.rank}</td><td title={candidate.reason}>{candidate.name}</td><td>{candidate.score}</td><td>{candidate.distanceKm ?? '—'} km</td><td>{candidate.pickupEtaMinutes ?? '—'} min</td><td>{candidate.workload ?? '—'}</td><td>{candidate.idleMinutes == null ? '—' : `${Math.round(candidate.idleMinutes)} min`}</td><td>{candidate.acceptanceRate == null ? '—' : `${Math.round(candidate.acceptanceRate)}%`}</td><td>{candidate.selected ? <b className="selected-driver-mark">Selected</b> : '—'}</td></tr>)}</tbody></table></div></div>) : <div className="admin-empty compact">No allocation log is available for this ride yet. Older rides only have the recorded assignment history.</div>}</section></div>}</section></div>
}

export default function AdminDashboard() {
  const { user, logout } = useAuth(), navigate = useNavigate()
  const [data, setData] = useState(null), [rides, setRides] = useState([]), [activity, setActivity] = useState([])
  const [loading, setLoading] = useState(true), [refreshing, setRefreshing] = useState(false), [error, setError] = useState(''), [streamStatus, setStreamStatus] = useState('connecting')
  const [collapsed, setCollapsed] = useState(false), [mobileNav, setMobileNav] = useState(false), [section, setSection] = useState('overview')
  const [search, setSearch] = useState(''), [statusFilter, setStatusFilter] = useState('all'), [page, setPage] = useState(1), [pages, setPages] = useState(1), [rideTotal, setRideTotal] = useState(0), [selectedRide, setSelectedRide] = useState(null)
  const [dateRange, setDateRange] = useState(() => { const today = new Date(); const week = new Date(today); week.setDate(week.getDate() - 6); return { from: week.toISOString().slice(0, 10), to: today.toISOString().slice(0, 10) } })
  const [searchDraft, setSearchDraft] = useState('')
  const debounce = useRef(null)
  const loadOverview = useCallback(async (background = false) => {
    if (background) setRefreshing(true); else setLoading(true)
    try {
      const params = new URLSearchParams(dateRange)
      const result = await api(`/api/admin/overview?${params}`)
      const overview = result.data || {}
      setData({
        ...overview,
        activeRides: Array.isArray(overview.activeRides) ? overview.activeRides : [],
        requests: Array.isArray(overview.requests) ? overview.requests : [],
        drivers: Array.isArray(overview.drivers) ? overview.drivers : [],
        zones: Array.isArray(overview.zones) ? overview.zones : [],
        fairness: Array.isArray(overview.fairness) ? overview.fairness : [],
        charts: {
          ...overview.charts,
          daily: Array.isArray(overview.charts?.daily) ? overview.charts.daily : [],
          vehicleDemand: Array.isArray(overview.charts?.vehicleDemand) ? overview.charts.vehicleDemand : [],
        },
      }); setError('')
    } catch (err) { setError(err.message) }
    finally { setLoading(false); setRefreshing(false) }
  }, [dateRange])
  const loadRides = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page, status: statusFilter, search, ...dateRange })
      const result = await api(`/api/admin/rides?${params}`)
      setRides(Array.isArray(result.data?.rides) ? result.data.rides : []); setPages(result.data?.pages || 1); setRideTotal(result.data?.total || 0)
    } catch (err) { setError(err.message) }
  }, [page, statusFilter, search, dateRange])
  const loadActivity = useCallback(async () => {
    try { const result = await api('/api/admin/activity'); setActivity(Array.isArray(result.data?.events) ? result.data.events : []) }
    catch (err) { setError(err.message) }
  }, [])
  const refreshAll = useCallback(async (background = true) => { await Promise.all([loadOverview(background), loadRides(), loadActivity()]) }, [loadOverview, loadRides, loadActivity])
  useEffect(() => { refreshAll(false) }, [refreshAll])
  useEffect(() => {
    const stream = new EventSource(apiUrl('/api/admin/stream'), { withCredentials: true })
    stream.addEventListener('connected', () => setStreamStatus('live'))
    stream.addEventListener('update', () => { setStreamStatus('live'); refreshAll(true) })
    stream.onerror = () => setStreamStatus('reconnecting')
    const fallback = window.setInterval(() => refreshAll(true), 30000)
    return () => { stream.close(); window.clearInterval(fallback) }
  }, [refreshAll])
  useEffect(() => {
    window.clearTimeout(debounce.current)
    debounce.current = window.setTimeout(() => { setPage(1); setSearch(searchDraft) }, 350)
    return () => window.clearTimeout(debounce.current)
  }, [searchDraft])
  useEffect(() => { loadRides() }, [loadRides])
  const metrics = data?.metrics || {}
  const selectedNav = id => { setSection(id); setMobileNav(false); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
  async function signOut() { await logout(); navigate('/', { replace: true }) }
  function downloadActivity() {
    if (!activity.length) return
    const rows = [['Ride ID', 'Event', 'Status', 'Message', 'Actor', 'Time'], ...activity.map(item => [item.rideId, item.eventType, item.status, item.message, item.actor, item.at])]
    const csv = rows.map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'rideflow-activity.csv'; anchor.click(); URL.revokeObjectURL(url)
  }
  const onlineDrivers = data?.drivers || []
  const activeRides = Array.isArray(data?.activeRides) ? data.activeRides : []
  const pendingRequests = Array.isArray(data?.requests) ? data.requests : []
  const mapRides = [...activeRides, ...pendingRequests.filter(request => !activeRides.some(active => active.id === request.id))]
  const empty = loading && !data

  return <div className={`admin-app${collapsed ? ' sidebar-collapsed' : ''}`}>
    <aside className={`admin-sidebar${mobileNav ? ' mobile-open' : ''}`}><div className="admin-sidebar-top"><span className="admin-product-mark"><Navigation size={17}/></span><div className="admin-sidebar-title"><strong>RideFlow</strong><small>CONTROL CENTER</small></div><button className="admin-collapse" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}><ChevronLeft size={16}/></button><button className="admin-mobile-close" onClick={() => setMobileNav(false)} aria-label="Close menu"><X size={18}/></button></div><div className="admin-side-caption">ADMINISTRATION</div><nav className="admin-nav">{navItems.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => selectedNav(id)} title={collapsed ? label : undefined} className={section === id ? 'active' : ''}><Icon size={17}/><span>{label}</span>{id === 'monitoring' && data?.activeRides?.length > 0 && <b>{data.activeRides.length}</b>}</button>)}</nav><div className="admin-side-bottom"><div className="admin-user-card"><span className="admin-user-avatar">{(user?.name || 'A').slice(0, 1).toUpperCase()}</span><div><strong>{user?.name || 'Administrator'}</strong><small>System admin</small></div></div><button className="admin-signout" onClick={signOut}><LogOut size={16}/><span>Sign out</span></button><div className="admin-brand-bottom"><Brand light/></div></div></aside>
    {mobileNav && <button className="admin-scrim" aria-label="Close menu" onClick={() => setMobileNav(false)}/>}
    <main className="admin-main"><header className="admin-topbar"><div className="admin-top-title"><button className="admin-mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open menu"><Menu size={20}/></button><span>Administration <i>/</i> <b>{navItems.find(item => item.id === section)?.label || 'Overview'}</b></span></div><div className="admin-toolbar"><label className="admin-date-field"><span>From</span><input type="date" value={dateRange.from} onChange={event => setDateRange(current => ({ ...current, from: event.target.value }))}/></label><label className="admin-date-field"><span>To</span><input type="date" value={dateRange.to} onChange={event => setDateRange(current => ({ ...current, to: event.target.value }))}/></label><span className={`admin-live-status ${streamStatus}`}><i/>{streamStatus === 'live' ? 'Live updates' : streamStatus === 'connecting' ? 'Connecting' : 'Reconnecting'}</span><button className="admin-icon-btn" onClick={() => refreshAll(true)} aria-label="Refresh dashboard" disabled={refreshing}><RefreshCw size={16} className={refreshing ? 'spin-icon' : ''}/></button><button className="admin-top-user" onClick={signOut}><span>{(user?.name || 'A').slice(0, 1).toUpperCase()}</span><b>{user?.name || 'Admin'}</b><LogOut size={14}/></button><ThemeToggle/></div></header>
      <div className="admin-page-content">
        {error && <div className="admin-error"><AlertCircle size={17}/><span>{error}</span><button onClick={() => refreshAll(true)}>Retry</button><button className="admin-error-close" onClick={() => setError('')} aria-label="Dismiss"><X size={15}/></button></div>}
        {empty && <div className="admin-page-loading"><span className="admin-spinner"/> Loading dashboard data from RideFlow…</div>}
        {!empty && <>
          <section className="admin-section admin-overview-section" id="overview"><div className="admin-page-heading"><div><span className="admin-section-kicker"><span/> SYSTEM OVERVIEW</span><h1>Ride operations</h1><p>Current fleet and ride matching performance for the selected date range.</p></div><span className="admin-data-stamp"><Clock3 size={14}/> Updated {data?.generatedAt ? when(data.generatedAt) : when(new Date())}</span></div>
            <div className="admin-kpi-grid"><Kpi icon={Users} label="Passengers" value={metrics.totalPassengers} detail="Registered accounts" tint="blue"/><Kpi icon={CarFront} label="Drivers" value={metrics.totalDrivers} detail="Registered accounts" tint="teal"/><Kpi icon={Signal} label="Online drivers" value={metrics.onlineDrivers} detail="Fresh location · last 2 min" tint="green"/><Kpi icon={MapPin} label="Ride requests" value={metrics.totalRideRequests} detail="Selected range" tint="violet"/><Kpi icon={CheckCircle2} label="Completed" value={metrics.completedRides} detail="All-time completed" tint="green"/><Kpi icon={X} label="Cancelled" value={metrics.cancelledRides} detail="Cancelled, rejected or failed" tint="rose"/><Kpi icon={Activity} label="Ongoing rides" value={metrics.ongoingRides} detail={`${metrics.activeRides ?? 0} active in all stages`} tint="amber"/><Kpi icon={Clock3} label="Avg. wait" value={metrics.averagePassengerWaitingMinutes == null ? null : Number(metrics.averagePassengerWaitingMinutes).toFixed(1)} detail="Request to driver acceptance" tint="cyan" unit=" min"/><Kpi icon={Navigation} label="Pickup ETA" value={metrics.averageDriverPickupEtaMinutes == null ? null : Number(metrics.averageDriverPickupEtaMinutes).toFixed(1)} detail="Estimated minutes to pickup" tint="blue" unit=" min"/><Kpi icon={Gauge} label="Driver utilization" value={metrics.driverUtilizationRate} detail="Busy drivers / online drivers" tint="violet" unit="%"/></div>
            <div className="admin-chart-grid"><LineChart title="Ride requests vs completed" rows={data?.charts?.daily || []} series={[{ key: 'requests', label: 'Requests', color: '#2f6fdb' }, { key: 'completed', label: 'Completed', color: '#18a980' }]}/><LineChart title="Average passenger waiting time" rows={(data?.charts?.daily || []).filter(row => row.averageWaitingMinutes != null)} series={[{ key: 'averageWaitingMinutes', label: 'Minutes', color: '#e49c3f' }]}/><LineChart title="Driver utilization" rows={data?.charts?.daily || []} series={[{ key: 'utilizationRate', label: 'Active assigned drivers', color: '#8264d6' }]}/><BarChart title="Ride demand by vehicle category" rows={data?.charts?.vehicleDemand || []} nameKey="category" valueKey="rides" color="#3375df"/></div>
          </section>

          <section className="admin-section" id="monitoring"><SectionHeading kicker="LIVE OPERATIONS" title="Driver & ride monitoring" note="Driver location and ride events stream from the backend; location pins update when a driver shares GPS." action={<span className={`admin-live-status ${streamStatus}`}><i/>{streamStatus === 'live' ? 'Live stream connected' : 'Live stream reconnecting'}</span>}/><div className="admin-monitor-grid"><article className="admin-panel admin-monitor-map-panel"><div className="admin-panel-heading"><div><h3>Active fleet map</h3><small>{onlineDrivers.length} drivers with recent location · {mapRides.length} visible rides</small></div><span className="admin-map-provider">{googleMapsKeyAvailable() ? 'Google Maps · Leaflet' : 'OpenStreetMap'}</span></div><div className="admin-map-wrap"><AdminMap drivers={onlineDrivers} rides={mapRides}/><div className="admin-map-legend"><span><i className="legend-driver-ready"/>Available</span><span><i className="legend-driver-busy"/>Assigned/busy</span><span><i className="legend-ride-pickup"/>Ride pickup</span></div></div><p className="admin-map-foot"><LocateFixed size={14}/> India overview · map zooms to current drivers and rides</p></article><div className="admin-live-side"><article className="admin-panel"><div className="admin-panel-heading"><div><h3>Online drivers</h3><small>GPS location updated in last 2 minutes</small></div><span className="admin-panel-count">{onlineDrivers.length}</span></div><div className="admin-compact-list">{onlineDrivers.slice(0, 8).map(driver => <div className="admin-driver-row" key={driver.id}><span className={`driver-presence ${driver.availability}`}/><div><strong>{driver.name}</strong><small>{driver.vehicleType || 'Vehicle'} · {driver.location ? `${driver.location.latitude.toFixed(3)}, ${driver.location.longitude.toFixed(3)}` : 'No coordinates'}</small></div><StatusPill status={driver.availability}/></div>)}{!onlineDrivers.length && <EmptyState title="No online drivers" text="Drivers with a fresh shared location will appear here."/>}</div></article><article className="admin-panel"><div className="admin-panel-heading"><div><h3>Unanswered requests</h3><small>Currently assigned ride requests</small></div><span className="admin-panel-count">{data?.requests?.length || 0}</span></div><div className="admin-compact-list">{data?.requests?.slice(0, 5).map(ride => <button className="admin-request-row" key={ride.id} onClick={() => setSelectedRide(ride)}><span><strong>{ride.passenger?.name || 'Passenger'}</strong><small>{ride.pickup} → {ride.destination}</small></span><span><small>{ride.pickupEtaMinutes} min pickup</small><StatusPill status={ride.status}/></span></button>)}{!data?.requests?.length && <EmptyState title="No pending requests" text="There are no rides waiting for a driver response."/>}</div></article></div></div></section>

          <section className="admin-section" id="rides"><SectionHeading kicker="RIDE LIFECYCLE" title="Ride management" note="Search and filter recorded rides, then open a ride to inspect its timeline and assignment decisions." action={<span className="admin-result-count">{rideTotal.toLocaleString()} records</span>}/><div className="admin-panel admin-rides-panel"><div className="admin-filter-row"><label className="admin-search"><Search size={16}/><input value={searchDraft} onChange={event => setSearchDraft(event.target.value)} placeholder="Search ride ID, passenger, driver or location"/></label><label className="admin-status-filter"><Filter size={14}/><select value={statusFilter} onChange={event => { setStatusFilter(event.target.value); setPage(1) }}>{statusOptions.map(option => <option value={option} key={option}>{option === 'all' ? 'All statuses' : option}</option>)}</select></label><button className="admin-secondary-btn" onClick={() => { setSearchDraft(''); setStatusFilter('all'); setPage(1) }}>Clear</button></div><div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>Ride</th><th>Passenger / driver</th><th>Vehicle</th><th>Route</th><th>Pickup ETA</th><th>Fare</th><th>Status</th><th/></tr></thead><tbody>{rides.map(ride => <tr key={ride.id}><td><strong className="ride-ref">{shortId(ride.id)}</strong><small>{when(ride.createdAt)}</small></td><td><span className="cell-primary">{ride.passenger?.name || 'Passenger'}</span><small>{ride.driver?.name ? `Driver: ${ride.driver.name}` : 'Unassigned'}</small></td><td>{ride.vehicleType}</td><td className="route-cell"><span>{ride.pickup}</span><small>→ {ride.destination}</small></td><td>{ride.pickupEtaMinutes ?? '—'} min</td><td>{currency(ride.estimatedFare)}</td><td><StatusPill status={ride.status}/></td><td><button className="admin-view-btn" onClick={() => setSelectedRide(ride)}><Eye size={14}/> Trace</button></td></tr>)}</tbody></table>{!rides.length && <EmptyState title="No rides found" text="Try another search, status, or date range."/>}</div><div className="admin-pagination"><span>Page {page} of {pages}</span><div><button disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft size={16}/></button><button disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight size={16}/></button></div></div></div></section>

          <section className="admin-section" id="allocation"><SectionHeading kicker="MATCHING TRANSPARENCY" title="Intelligent allocation" note="Actual shortlist scores and reasons recorded at dispatch, including the selected driver and prior attempts." action={<span className="admin-result-count">{data?.allocations?.length || 0} recent logs</span>}/><div className="admin-panel admin-allocation-panel">{data?.allocations?.length ? <div className="admin-allocation-list">{data.allocations.map(log => <article className="admin-allocation-card" key={log.id}><div className="admin-allocation-card-head"><button onClick={() => setSelectedRide({ id: log.rideId, status: 'Allocation log' })}>{shortId(log.rideId)} <Eye size={13}/></button><span>{log.vehicleType} · {when(log.createdAt)}</span><b className={log.outcome === 'assigned' ? 'allocation-assigned' : 'allocation-reassigned'}>{log.outcome}</b></div><div className="admin-shortlist"><div className="admin-table-scroll"><table className="admin-table compact-table"><thead><tr><th>Rank</th><th>Driver</th><th>Score</th><th>Distance</th><th>Pickup ETA</th><th>Workload</th><th>Idle</th><th>Acceptance</th><th>Result</th></tr></thead><tbody>{log.candidates.map((candidate, index) => <tr key={`${log.id}-${index}`} className={candidate.selected ? 'selected-row' : ''}><td>{candidate.rank}</td><td title={candidate.reason}>{candidate.name}</td><td><strong>{candidate.score}</strong></td><td>{candidate.distanceKm ?? '—'} km</td><td>{candidate.pickupEtaMinutes ?? '—'} min</td><td>{candidate.workload ?? '—'}</td><td>{candidate.idleMinutes == null ? '—' : `${Math.round(candidate.idleMinutes)} min`}</td><td>{candidate.acceptanceRate == null ? '—' : `${Math.round(candidate.acceptanceRate)}%`}</td><td>{candidate.selected ? <span className="selected-driver-mark">SELECTED</span> : '—'}</td></tr>)}</tbody></table></div></div><p className="allocation-selected-reason"><ShieldCheck size={14}/> Selected: {log.selectedDriver}. {log.candidates.find(candidate => candidate.selected)?.reason || 'See recorded score factors above.'}</p></article>)}</div> : <EmptyState title="No allocation logs yet" text="New ride requests create a scored candidate shortlist. Earlier rides may only contain a single assignment history entry."/>}</div></section>

          <section className="admin-section" id="analytics"><SectionHeading kicker="PS02 SYSTEM INTELLIGENCE" title="Analytics & advanced feature monitoring" note="Operational measures use ride, user, location, and allocation records. Forecast and surge values are labeled by their method." action={<span className="admin-data-tag"><ShieldCheck size={13}/> Database-derived</span>}/><div className="admin-chart-grid analytics-chart-grid"><LineChart title="Ride requests vs completed" rows={data?.charts?.daily || []} series={[{ key: 'requests', label: 'Requests', color: '#2f6fdb' }, { key: 'completed', label: 'Completed', color: '#18a980' }]}/><LineChart title="Predicted vs actual requests" rows={(data?.charts?.daily || []).filter(row => row.predictedRequests != null)} series={[{ key: 'predictedRequests', label: '3-day moving average', color: '#df9d40' }, { key: 'requests', label: 'Actual requests', color: '#2f6fdb' }]} emptyText="Need at least four recorded days to compare forecast and actual demand."/><LineChart title="Average passenger wait" rows={(data?.charts?.daily || []).filter(row => row.averageWaitingMinutes != null)} series={[{ key: 'averageWaitingMinutes', label: 'Minutes', color: '#df9d40' }]}/><BarChart title="Vehicle category demand" rows={data?.charts?.vehicleDemand || []} nameKey="category" valueKey="rides"/></div><div className="admin-advanced-grid"><article className="admin-panel"><div className="admin-panel-heading"><div><span className="admin-feature-kicker">ZONE INTELLIGENCE</span><h3>Demand, driver supply & forecast</h3><small>0.1° coordinate cells · last 24h rides and current locations</small></div><span className="admin-method-badge">Moving average</span></div><div className="admin-zone-list">{data?.zones?.map(zone => <div className="admin-zone-row" key={zone.id}><span className={`admin-zone-dot demand-${zone.demand.toLowerCase()}`}/><div className="admin-zone-main"><strong>Grid {zone.id}</strong><small>{zone.latitude.toFixed(2)}, {zone.longitude.toFixed(2)}</small></div><span><small>Requests</small><b>{zone.requestCount}</b></span><span><small>Online</small><b>{zone.availableDrivers}</b></span><span><small>Active</small><b>{zone.activeRides}</b></span><span><small>Forecast/hr</small><b>{zone.predictedDemandNextHour ?? 'Insufficient data'}</b></span><span className="admin-surge-mark"><small>Simulated surge</small><b>{zone.simulatedSurgeMultiplier.toFixed(2)}×</b></span><p>{zone.repositionRecommendation}</p></div>)}{!data?.zones?.length && <EmptyState title="No recent geographic activity" text="Ride requests and fresh driver locations will form demand cells."/>}</div><small className="admin-data-disclaimer">Surge multiplier is a simulated indicator derived from observed request-to-driver shortage; it is not applied to fares.</small></article>
            <article className="admin-panel"><div className="admin-panel-heading"><div><span className="admin-feature-kicker">DRIVER FAIRNESS</span><h3>Workload distribution</h3><small>Logged assignments and response performance</small></div><span className="admin-panel-count">{data?.fairness?.length || 0}</span></div><div className="admin-table-scroll"><table className="admin-table compact-table"><thead><tr><th>Driver</th><th>Assignments</th><th>Acceptance</th><th>Idle avg.</th><th>Status</th></tr></thead><tbody>{data?.fairness?.slice(0, 10).map(driver => <tr key={driver.driverId}><td>{driver.name}</td><td>{driver.assignments}</td><td>{driver.acceptanceRate == null ? '—' : `${driver.acceptanceRate}%`}</td><td>{driver.averageIdleMinutes == null ? '—' : `${driver.averageIdleMinutes} min`}</td><td><StatusPill status={driver.availability}/></td></tr>)}</tbody></table>{!data?.fairness?.length && <EmptyState title="No allocation history" text="Driver assignments will appear after rides are matched."/>}</div></article>
            <article className="admin-panel"><div className="admin-panel-heading"><div><span className="admin-feature-kicker">RIDE POOLING</span><h3>Shared ride groups</h3><small>Passenger count and optimized stop order</small></div><span className="admin-method-badge muted">No persisted groups</span></div><EmptyState title="Pooling is not connected yet" text={data?.pooling?.note || 'No shared ride groups have been recorded.'}/></article>
            <article className="admin-panel"><div className="admin-panel-heading"><div><span className="admin-feature-kicker">AUTOMATIC RECOVERY</span><h3>Reassignment history</h3><small>Timeout and rejection attempts from ride records</small></div><span className="admin-panel-count">{data?.reassignments?.length || 0}</span></div><div className="admin-reassignment-list">{data?.reassignments?.slice(0, 8).map(item => <button key={item.rideId} onClick={() => setSelectedRide({ id: item.rideId, status: item.status, passenger: { name: item.passenger } })}><span><strong>{shortId(item.rideId)} · {item.passenger}</strong><small>{item.assignments.map(assignment => `${assignment.name} (${assignment.outcome || 'pending'})`).join(' → ')}</small></span><span><b>{item.attempts} attempt{item.attempts === 1 ? '' : 's'}</b><StatusPill status={item.status}/></span></button>)}{!data?.reassignments?.length && <EmptyState title="No reassignments recorded" text="Rejected and timed-out requests will be listed here when they occur."/>}</div></article></div></section>

          <section className="admin-section" id="activity"><SectionHeading kicker="AUDIT TRAIL" title="Activity logs" note="Chronological ride events, including matching, assignment, driver responses, status changes and recovery." action={<button className="admin-secondary-btn" onClick={downloadActivity} disabled={!activity.length}><Download size={14}/> Export CSV</button>}/><div className="admin-panel"><div className="admin-table-scroll"><table className="admin-table activity-table"><thead><tr><th>Time</th><th>Ride</th><th>Event</th><th>Details</th><th>Actor</th><th>Status</th></tr></thead><tbody>{activity.map(event => <tr key={event.id}><td>{when(event.at)}</td><td>{event.rideId ? <button className="ride-ref-button" onClick={() => setSelectedRide({ id: event.rideId, status: event.rideStatus })}>{shortId(event.rideId)}</button> : '—'}</td><td><span className="event-type">{event.eventType.replaceAll('_', ' ')}</span></td><td className="activity-message">{event.message}<small>{event.pickup && event.destination ? `${event.pickup} → ${event.destination}` : event.vehicleType || ''}</small></td><td>{event.actor}</td><td><StatusPill status={event.status}/></td></tr>)}</tbody></table>{!activity.length && <EmptyState title="No persisted activity events" text="New rides now write their matching and lifecycle events into the ride event log."/>}</div></div></section>
          <footer className="admin-footer"><span>RideFlow administrative workspace</span><span>Values shown are sourced from database records.</span></footer>
        </>}
      </div>
    </main>
    {selectedRide && <TraceModal ride={selectedRide} onClose={() => setSelectedRide(null)}/>}
  </div>
}

function SectionHeading({ kicker, title, note, action }) {
  return <div className="admin-section-heading"><div><span className="admin-section-kicker">{kicker}</span><h2>{title}</h2><p>{note}</p></div>{action}</div>
}

function EmptyState({ title, text }) {
  return <div className="admin-empty"><span><Compass size={19}/></span><strong>{title}</strong><p>{text}</p></div>
}
