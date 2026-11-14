import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import { Activity, Bell, CarFront, Check, CheckCheck, ChevronDown, Clock3, Coffee, DollarSign, Gauge, History, Home, LogOut, MapPin, Menu, Navigation, Power, Route, ShieldCheck, Star, TrendingUp, UserRound, Users, X, Zap } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Brand from '../components/Brand.jsx'
import ThemeToggle from '../components/ThemeToggle.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { apiUrl } from '../lib/apiUrl.js'
import { googleMapsKeyAvailable, loadGoogleMutant } from '../maps/googleMutant.js'
import 'leaflet/dist/leaflet.css'
import '../styles/driver-dashboard.css'

const DEFAULT_CENTER = { latitude: 22.5, longitude: 79 }
const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value || 0)
const sample = {
  user: { name: 'Arjun Patil', phone: '+91 98765 43210', email: 'arjun@example.com', driverDetails: { availability: 'offline', verificationStatus: 'verified', licenseNumber: 'KA-0220180012345', vehicle: { type: 'Sedan', make: 'Maruti Suzuki', model: 'Swift Dzire', color: 'Pearl White', manufacturingYear: 2022, seatingCapacity: 4, acType: 'AC', registrationNumber: 'KA22MN2486' } } },
  metrics: { todayEarnings: 1840, completedRides: 128, activeRides: 0, cancelledRides: 4, acceptanceRate: 92, averageIdleMinutes: 18, assignmentCount: 142, acceptedCount: 130, rejectedCount: 12 },
  requests: [{ id: 'demo-1', passenger: { name: 'Meera Kulkarni', phone: '+91 98••• ••421' }, pickup: { label: 'Pickup location', location: { coordinates: [79.002, 22.501] } }, destination: { label: 'Passenger destination', location: { coordinates: [79.007, 22.496] } }, pickupDistanceKm: 1.4, pickupEtaMinutes: 5, routeDistanceKm: 3.8, estimatedDurationMinutes: 14, estimatedFare: 96, createdAt: new Date().toISOString(), status: 'Requested', assignmentHistory: [{ score: 91, reason: '1.4 km away · 5 min pickup · available now' }] }],
  activeRide: null,
  history: [{ id: 'hist1', status: 'Completed', passenger: { name: 'Rahul Desai' }, pickup: { label: 'North Zone' }, destination: { label: 'Airport Road' }, routeDistanceKm: 9.4, estimatedDurationMinutes: 26, estimatedFare: 168, completedAt: new Date().toISOString() }, { id: 'hist2', status: 'Completed', passenger: { name: 'Ananya Rao' }, pickup: { label: 'West Zone' }, destination: { label: 'South Zone' }, routeDistanceKm: 6.2, estimatedDurationMinutes: 19, estimatedFare: 112, completedAt: new Date(Date.now() - 86400000).toISOString() }],
  zones: [{ id: 'central', name: 'Nearby Zone 1', latitude: 22.5, longitude: 79, requests: 8, activeRides: 4, availableDrivers: 3, demand: 'High', predicted: 'High' }, { id: 'north', name: 'Nearby Zone 2', latitude: 22.508, longitude: 79.008, requests: 3, activeRides: 1, availableDrivers: 5, demand: 'Moderate', predicted: 'High' }, { id: 'east', name: 'Nearby Zone 3', latitude: 22.492, longitude: 79.016, requests: 2, activeRides: 1, availableDrivers: 4, demand: 'Low', predicted: 'Moderate' }, { id: 'west', name: 'Nearby Zone 4', latitude: 22.484, longitude: 78.99, requests: 5, activeRides: 2, availableDrivers: 1, demand: 'High', predicted: 'High' }],
}
const poolPreview = [{ id: 'pool1', passenger: 'Nisha Hegde', pickup: 'Tilakwadi', destination: 'South Zone', extraKm: 1.8, extraMinutes: 7, revisedFare: 142 }]

async function api(path, options = {}) {
  const response = await fetch(apiUrl(path), { ...options, credentials: 'include', headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.message || 'The request could not be completed.')
  return result
}

function DriverMap({ dashboard, position, route }) {
  const el = useRef(null), map = useRef(null), layers = useRef(null), baseLayer = useRef(null)
  useEffect(() => {
    if (!el.current) return
    const instance = L.map(el.current, { center: [DEFAULT_CENTER.latitude, DEFAULT_CENTER.longitude], zoom: 2, scrollWheelZoom: false })
    const fallback = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(instance)
    baseLayer.current = fallback
    loadGoogleMutant(L).then(() => {
      if (!map.current) return
      const googleLayer = L.gridLayer.googleMutant({ type: 'roadmap' })
      fallback.remove()
      googleLayer.addTo(instance)
      baseLayer.current = googleLayer
    }).catch(() => {})
    layers.current = L.layerGroup().addTo(instance); map.current = instance
    return () => { instance.remove(); map.current = null }
  }, [])
  useEffect(() => {
    if (!layers.current) return
    layers.current.clearLayers()
    if (route?.geometry?.coordinates?.length) L.geoJSON(route.geometry, { style: { color: '#286bdd', weight: 5, opacity: .85 } }).addTo(layers.current)
    const loc = position || dashboard.user?.driverDetails?.location?.coordinates
    const lat = Array.isArray(loc) ? loc[1] : loc?.latitude || dashboard.zones?.[0]?.latitude || DEFAULT_CENTER.latitude
    const lng = Array.isArray(loc) ? loc[0] : loc?.longitude || dashboard.zones?.[0]?.longitude || DEFAULT_CENTER.longitude
    const driverIcon = L.divIcon({ className: 'driver-map-pin driver-map-self', html: '<span></span>', iconSize: [28, 28], iconAnchor: [14, 14] })
    L.marker([lat, lng], { icon: driverIcon, title: 'Your location' }).addTo(layers.current).bindPopup('Your location')
    dashboard.requests.forEach(req => {
      const [pLng, pLat] = req.pickup.location.coordinates
      const icon = L.divIcon({ className: 'driver-map-pin driver-map-pickup', html: '<span></span>', iconSize: [24, 24], iconAnchor: [12, 12] })
      L.marker([pLat, pLng], { icon, title: `Pickup: ${req.passenger?.name || 'Passenger'}` }).addTo(layers.current).bindPopup(`${req.passenger?.name || 'Passenger'} · ${req.pickup.label}`)
    })
    map.current?.setView([lat, lng], position || dashboard.user?.driverDetails?.location ? 13 : 5)
  }, [dashboard.requests, dashboard.user, position, route])
  return <div className="driver-map" ref={el} role="application" aria-label="Interactive driver map showing your location and passenger pickups" />
}

function StatCard({ icon: Icon, label, value, note, tone }) {
  return <article className="driver-stat"><span className={`driver-stat-icon ${tone}`}><Icon size={19}/></span><div><small>{label}</small><strong>{value}</strong><span>{note}</span></div></article>
}

export default function DriverDashboard() {
  const { user: authUser, logout } = useAuth(), navigate = useNavigate()
  const [data, setData] = useState(sample), [demo, setDemo] = useState(true), [busy, setBusy] = useState(false)
  const [error, setError] = useState(''), [toast, setToast] = useState(''), [position, setPosition] = useState(null)
  const [mobileMenu, setMobileMenu] = useState(false), [profileOpen, setProfileOpen] = useState(false), [profile, setProfile] = useState({ name: '', phone: '', registrationNumber: '' }), [notifications, setNotifications] = useState(false)
  const [now, setNow] = useState(Date.now()), [poolDecisions, setPoolDecisions] = useState({})
  const [activeRoute, setActiveRoute] = useState(null)
  const gpsWatch = useRef(null)
  const refresh = useCallback(async () => {
    try { const result = await api('/api/driver/dashboard'); setData(result.data); setDemo(false); setError('') }
    catch (err) { setDemo(true); setError(err.message) }
  }, [authUser])
  useEffect(() => { refresh(); const poll = window.setInterval(refresh, 5000); const tick = window.setInterval(() => setNow(Date.now()), 1000); return () => { window.clearInterval(poll); window.clearInterval(tick); if (gpsWatch.current !== null) navigator.geolocation?.clearWatch(gpsWatch.current) } }, [refresh])
  const online = data.user?.driverDetails?.availability === 'available'
  const activeRide = data.activeRide
  const hasPendingRequest = data.user?.driverDetails?.availability === 'requested'
  useEffect(() => {
    if (!activeRide) { setActiveRoute(null); return }
    const [pickupLng, pickupLat] = activeRide.pickup.location.coordinates
    const [destinationLng, destinationLat] = activeRide.destination.location.coordinates
    const params = new URLSearchParams({ pickupLat, pickupLng, destinationLat, destinationLng })
    let live = true
    api(`/api/locations/route?${params}`).then(result => { if (live) setActiveRoute(result.data) }).catch(() => { if (live) setActiveRoute(null) })
    return () => { live = false }
  }, [activeRide?.id])
  const requests = data.requests || []
  const setMessage = text => { setToast(text); window.setTimeout(() => setToast(''), 3500) }

  async function pushLocation(latitude, longitude) {
    setPosition({ latitude, longitude })
    if (!demo) await api('/api/driver/location', { method: 'PATCH', body: JSON.stringify({ latitude, longitude }) })
  }
  function getLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('This browser does not support location sharing.'))
      navigator.geolocation.getCurrentPosition(pos => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }), () => reject(new Error('Allow location access to go online.')), { enableHighAccuracy: true, timeout: 10000, maximumAge: 10000 })
    })
  }
  async function toggleAvailability() {
    if (activeRide || requests.length && data.user?.driverDetails?.availability === 'requested') return setMessage('Availability is managed while a ride is assigned.')
    setBusy(true); setError('')
    try {
      if (online) {
        if (!demo) await api('/api/driver/availability', { method: 'PATCH', body: JSON.stringify({ online: false }) })
        if (gpsWatch.current !== null) navigator.geolocation?.clearWatch(gpsWatch.current)
        gpsWatch.current = null
        setData(current => ({ ...current, user: { ...current.user, driverDetails: { ...current.user.driverDetails, availability: 'offline' } } }))
      } else {
        const loc = await getLocation(); await pushLocation(loc.latitude, loc.longitude)
        if (!demo) await api('/api/driver/availability', { method: 'PATCH', body: JSON.stringify({ online: true }) })
        setData(current => ({ ...current, user: { ...current.user, driverDetails: { ...current.user.driverDetails, availability: 'available' } } }))
        if (navigator.geolocation && !demo) gpsWatch.current = navigator.geolocation.watchPosition(pos => pushLocation(pos.coords.latitude, pos.coords.longitude).catch(() => {}), () => {}, { enableHighAccuracy: true, maximumAge: 5000 })
        setMessage('You are online. Location sharing is active.')
      }
      if (!demo) refresh()
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  async function rideAction(ride, action, status) {
    setBusy(true); setError('')
    try {
      if (demo) {
        if (action === 'accept') setData(current => ({ ...current, requests: current.requests.filter(r => r.id !== ride.id), activeRide: { ...ride, status: 'Accepted', acceptedAt: new Date().toISOString(), pickupDeadlineAt: new Date(Date.now() + (ride.pickupEtaMinutes + 5) * 60000).toISOString() }, metrics: { ...current.metrics, activeRides: 1 } }))
        else if (action === 'reject') setData(current => ({ ...current, requests: current.requests.filter(r => r.id !== ride.id), metrics: { ...current.metrics, rejectedCount: current.metrics.rejectedCount + 1, acceptanceRate: Math.round(current.metrics.acceptedCount / (current.metrics.acceptedCount + current.metrics.rejectedCount + 1) * 100) } }))
        else setData(current => ({ ...current, activeRide: status === 'Completed' || status === 'Cancelled' ? null : { ...current.activeRide, status }, metrics: { ...current.metrics, activeRides: status === 'Completed' || status === 'Cancelled' ? 0 : 1, completedRides: current.metrics.completedRides + (status === 'Completed' ? 1 : 0), todayEarnings: current.metrics.todayEarnings + (status === 'Completed' ? ride.estimatedFare : 0) }, history: status === 'Completed' ? [{ ...ride, status, completedAt: new Date().toISOString() }, ...current.history] : current.history }))
        setMessage(`Demo: ride ${action === 'status' ? status.toLowerCase() : action + 'ed'}.`)
      } else {
        if (action === 'accept' || action === 'reject') await api(`/api/driver/rides/${ride.id}/${action}`, { method: 'POST' })
        else await api(`/api/driver/rides/${ride.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })
        await refresh(); setMessage(action === 'status' ? `Ride marked ${status.toLowerCase()}.` : `Ride ${action}ed.`)
      }
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  async function saveProfile(e) {
    e.preventDefault(); setBusy(true)
    try {
      if (!demo) await api('/api/driver/profile', { method: 'PATCH', body: JSON.stringify(profile) })
      setData(current => ({ ...current, user: { ...current.user, name: profile.name, phone: profile.phone, driverDetails: { ...current.user.driverDetails, vehicle: { ...current.user.driverDetails.vehicle, registrationNumber: profile.registrationNumber } } } }))
      setProfileOpen(false); setMessage(demo ? 'Demo profile updated for this session.' : 'Profile updated.')
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  async function signOut() { await logout(); navigate('/', { replace: true }) }
  const metric = data.metrics || sample.metrics
  const earningsSummary = useMemo(() => {
    const completed = (data.history || []).filter(ride => ride.status === 'Completed')
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0)
    const weekAgo = new Date(startOfToday); weekAgo.setDate(weekAgo.getDate() - 6)
    const monthAgo = new Date(startOfToday); monthAgo.setDate(monthAgo.getDate() - 29)
    const at = ride => new Date(ride.completedAt || ride.createdAt)
    const sum = from => completed.filter(ride => at(ride) >= from).reduce((total, ride) => total + Number(ride.estimatedFare || 0), 0)
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(weekAgo); date.setDate(date.getDate() + index)
      const amount = completed.filter(ride => at(ride).toDateString() === date.toDateString()).reduce((total, ride) => total + Number(ride.estimatedFare || 0), 0)
      return { label: date.toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 1), amount }
    })
    const max = Math.max(1, ...days.map(day => day.amount))
    return { today: sum(startOfToday), week: sum(weekAgo), month: sum(monthAgo), days: days.map(day => ({ ...day, height: day.amount ? Math.max(6, Math.round(day.amount / max * 100)) : 3 })) }
  }, [data.history])
  const requestCountdown = ride => Math.max(0, 30 - Math.floor((now - new Date(ride.createdAt).getTime()) / 1000))
  const idleLabel = useMemo(() => metric.averageIdleMinutes < 60 ? `${metric.averageIdleMinutes} min` : `${Math.floor(metric.averageIdleMinutes / 60)}h ${metric.averageIdleMinutes % 60}m`, [metric.averageIdleMinutes])
  const vehicle = data.user?.driverDetails?.vehicle || {}

  const nav = [{ icon: Home, label: 'Overview', id: 'overview' }, { icon: MapPin, label: 'Live map & requests', id: 'live-map' }, { icon: Activity, label: 'Demand zones', id: 'zones' }, { icon: Users, label: 'Ride pooling', id: 'pooling' }, { icon: Gauge, label: 'Performance', id: 'performance' }, { icon: History, label: 'Earnings & history', id: 'earnings' }, { icon: UserRound, label: 'Driver profile', id: 'profile' }]
  return <div className="driver-app">
    <aside className={`driver-sidebar${mobileMenu ? ' sidebar-open' : ''}`}><div className="driver-brand"><Brand/><button className="driver-close-menu" onClick={() => setMobileMenu(false)} aria-label="Close menu"><X size={19}/></button></div><div className="driver-side-label">DRIVER WORKSPACE</div><nav>{nav.map(({ icon: Icon, label, id }, index) => <a key={id} href={`#${id}`} className={index === 0 ? 'selected' : ''} onClick={() => setMobileMenu(false)}><Icon size={17}/>{label}{id === 'live-map' && requests.length > 0 && <b>{requests.length}</b>}</a>)}</nav><div className="driver-sidebar-bottom"><div className="driver-sidebar-status"><span className={`status-light${online ? ' is-online' : ''}`}/><div><strong>{activeRide ? 'Busy · on a ride' : hasPendingRequest ? 'Ride request pending' : online ? 'You’re online' : 'You’re offline'}</strong><small>{activeRide ? 'Availability managed by this ride' : hasPendingRequest ? 'Respond to the request on your dashboard' : online ? 'Ready to receive requests' : 'Turn online when you’re ready'}</small></div></div><button onClick={signOut}><LogOut size={16}/> Sign out</button></div></aside>
    {mobileMenu && <button className="driver-menu-scrim" onClick={() => setMobileMenu(false)} aria-label="Close navigation"/>}
    <main className="driver-main"><header className="driver-topbar"><button className="driver-mobile-menu" onClick={() => setMobileMenu(true)} aria-label="Open menu"><Menu size={21}/></button><div className="driver-breadcrumb">Driver workspace <span>/</span> Dashboard</div><div className="driver-top-actions"><span className={`driver-data-mode ${demo ? 'is-demo' : ''}`}><i/>{demo ? 'Demo preview' : 'Live data'}</span><button className="driver-icon-button" onClick={() => setNotifications(!notifications)} aria-label="Notifications"><Bell size={18}/>{requests.length > 0 && <i/>}</button>{notifications && <div className="driver-notice-pop"><strong>Notifications</strong>{requests.length ? <p>{requests.length} ride request{requests.length > 1 ? 's' : ''} waiting for your response.</p> : <p>You’re all caught up.</p>}</div>}<button className="driver-profile-chip" onClick={() => { document.getElementById('profile')?.scrollIntoView({ behavior: 'smooth' }) }}><span className="driver-avatar">{(data.user?.name || 'D').split(' ').map(x => x[0]).slice(0, 2).join('')}</span><span>{data.user?.name || authUser?.name || 'Driver'}<small>Driver</small></span><ChevronDown size={14}/></button><ThemeToggle/></div></header>
      <div className="driver-content"><section className="driver-welcome" id="overview"><div><div className="driver-eyebrow"><span/> YOUR DRIVER DASHBOARD</div><h1>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {(data.user?.name || authUser?.name || 'Driver').split(' ')[0]}.</h1><p>Here’s your driving summary and what’s happening nearby.</p></div><button className={`driver-online-toggle${online ? ' online' : ''}`} onClick={toggleAvailability} disabled={busy || Boolean(activeRide) || hasPendingRequest}><span className="toggle-indicator"/><span><strong>{activeRide ? 'BUSY' : hasPendingRequest ? 'REQUEST' : online ? 'ONLINE' : 'OFFLINE'}</strong><small>{activeRide ? 'Ride in progress' : hasPendingRequest ? 'Respond to assigned request' : online ? 'Taking ride requests' : 'Tap to go online'}</small></span><Power size={18}/></button></section>
      {demo && <div className="driver-demo-banner"><Zap size={16}/><span><strong>Demo preview</strong> — sample dashboard data is shown because the driver API isn’t connected. Real actions will save when the backend is available.</span></div>}
      {error && <div className="driver-alert" role="status"><span>{error}</span><button onClick={() => { setError(''); refresh() }}>Retry</button></div>}
      <section className="driver-stats-grid"><StatCard icon={DollarSign} label="Today’s earnings" value={money(metric.todayEarnings)} note="Completed rides today" tone="blue"/><StatCard icon={CheckCheck} label="Completed rides" value={metric.completedRides} note="All-time completed" tone="green"/><StatCard icon={CarFront} label="Active rides" value={metric.activeRides} note={activeRide ? activeRide.status : 'No active ride'} tone="violet"/><StatCard icon={X} label="Cancelled rides" value={metric.cancelledRides} note="Cancelled or rejected" tone="rose"/><StatCard icon={TrendingUp} label="Acceptance rate" value={`${metric.acceptanceRate}%`} note={`${metric.acceptedCount} accepted · ${metric.rejectedCount} rejected`} tone="amber"/><StatCard icon={Coffee} label="Average idle time" value={idleLabel} note="Current available period" tone="cyan"/></section>
        <section className="driver-section-grid" id="live-map"><div className="driver-panel driver-map-panel"><div className="driver-panel-head"><div><span className="driver-kicker">LIVE AVAILABILITY</span><h2>Nearby activity map</h2><small className="map-provider-note">{googleMapsKeyAvailable() ? 'Google Maps' : 'OpenStreetMap'}</small></div><span className={`driver-live-pill${online ? ' on' : ''}`}><i/>{online ? 'GPS sharing' : 'Map preview'}</span></div><div className="driver-map-wrap"><DriverMap dashboard={data} position={position}/><div className="driver-map-legend"><span><i className="legend-self"/> Your location</span><span><i className="legend-pickup"/> Passenger pickup</span></div></div><div className="driver-map-foot"><span><MapPin size={15}/>{position ? `GPS ${position.latitude.toFixed(4)}, ${position.longitude.toFixed(4)}` : 'Waiting for a location'}</span><span>{online ? 'Location updates while online' : 'Go online to share your GPS'}</span></div></div>
        <div className="driver-panel driver-requests-panel"><div className="driver-panel-head"><div><span className="driver-kicker">RIDE DISPATCH</span><h2>Incoming requests <b className="driver-count">{requests.length}</b></h2></div><span className="driver-refresh-label"><span/> Auto-refresh · 5 sec</span></div>{requests.length ? <div className="driver-request-list">{requests.map(ride => <article className="driver-request" key={ride.id}><div className="request-passenger"><span className="request-avatar"><UserRound size={17}/></span><div><strong>{ride.passenger?.name || 'Passenger'}</strong><small>{ride.vehicleType || 'Mini'} · Request received · {new Date(ride.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></div><span className="request-timer"><Clock3 size={13}/>{requestCountdown(ride)}s</span></div><div className="request-route"><div><i className="route-origin"/><span><small>PICKUP</small><strong>{ride.pickup.label}</strong></span></div><div><i className="route-destination"/><span><small>DESTINATION</small><strong>{ride.destination.label}</strong></span></div></div><div className="request-metrics"><span><Navigation size={13}/>{ride.pickupDistanceKm} km <small>away</small></span><span><Clock3 size={13}/>{ride.pickupEtaMinutes} min <small>pickup</small></span><span><Route size={13}/>{ride.routeDistanceKm} km <small>trip</small></span><strong>{money(ride.estimatedFare)}</strong></div><details className="allocation-details"><summary><Gauge size={13}/> Allocation score {ride.assignmentHistory?.at(-1)?.score ?? '—'} <span>Why assigned?</span></summary><p>{ride.assignmentHistory?.at(-1)?.reason || `${ride.pickupDistanceKm} km away · ${ride.pickupEtaMinutes} min pickup estimate. Workload and fairness are included when available.`}</p></details><div className="request-buttons"><button disabled={busy} onClick={() => rideAction(ride, 'accept')}><Check size={15}/> Accept ride</button><button disabled={busy} onClick={() => rideAction(ride, 'reject')}><X size={15}/> Reject</button></div></article>)}</div> : <div className="driver-empty"><span><Check size={20}/></span><strong>No incoming requests</strong><p>New nearby pickups will appear here when you’re online.</p></div>}</div></section>
      {activeRide && <section className="driver-panel active-ride-panel"><div className="driver-panel-head"><div><span className="driver-kicker">ACTIVE RIDE</span><h2>Passenger ride management</h2></div><span className={`ride-state-pill state-${activeRide.status.toLowerCase()}`}><i/>{activeRide.status}</span></div><div className="active-ride-grid"><div className="active-ride-summary"><div className="active-passenger"><span className="request-avatar"><UserRound size={19}/></span><div><strong>{activeRide.passenger?.name || 'Passenger'}</strong><small>{activeRide.passenger?.phone || 'Passenger contact details'}</small></div><button className="driver-icon-button" aria-label="Call passenger" onClick={() => activeRide.passenger?.phone && (window.location.href = `tel:${activeRide.passenger.phone}`)}><Navigation size={16}/></button></div><div className="request-route active-route"><div><i className="route-origin"/><span><small>PICKUP</small><strong>{activeRide.pickup.label}</strong></span></div><div><i className="route-destination"/><span><small>DESTINATION</small><strong>{activeRide.destination.label}</strong></span></div></div><div className="active-ride-facts"><span><Route size={15}/>{activeRide.routeDistanceKm} km trip</span><span><Clock3 size={15}/>{activeRide.estimatedDurationMinutes} min est.</span><strong>{money(activeRide.estimatedFare)}</strong></div>{activeRide.pickupDeadlineAt && <div className={`pickup-deadline${now > new Date(activeRide.pickupDeadlineAt).getTime() ? ' delayed' : ''}`}><Clock3 size={15}/><span>{now > new Date(activeRide.pickupDeadlineAt).getTime() ? 'Pickup delayed · reassignment will start automatically' : 'Pickup deadline'}<strong>{new Date(activeRide.pickupDeadlineAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong></span></div>}<RideControls ride={activeRide} onStatus={status => rideAction(activeRide, 'status', status)} busy={busy}/></div><div className="active-route-map"><DriverMap dashboard={{ ...data, requests: [{ ...activeRide, passenger: activeRide.passenger }] }} position={position} route={activeRoute}/><span><Navigation size={14}/>{activeRoute ? `${activeRoute.distanceKm} km route · ${activeRoute.durationMinutes} min` : 'Loading route preview…'}</span></div></div></section>}
      <section className="driver-panel" id="zones"><div className="driver-panel-head"><div><span className="driver-kicker">ZONE INTELLIGENCE</span><h2>Demand nearby</h2></div><span className="preview-chip">Demand preview</span></div><p className="driver-panel-subtitle">Zone activity from ride records. Forecast and reposition signals are demonstration indicators until enough history is available.</p><div className="zone-grid">{data.zones.length ? data.zones.map(zone => <article className="zone-card" key={zone.id}><div className="zone-title"><span className={`zone-dot zone-${zone.demand.toLowerCase()}`}/><strong>{zone.name}</strong><span className={`zone-demand zone-${zone.demand.toLowerCase()}`}>{zone.demand} demand</span></div><div className="zone-stats"><span><small>Requests</small><b>{zone.requests}</b></span><span><small>Available drivers</small><b>{zone.availableDrivers ?? '—'}</b></span><span><small>Active rides</small><b>{zone.activeRides}</b></span><span><small>Forecast</small><b>{zone.predicted || 'Preview'}</b></span></div><div className="zone-recommendation"><TrendingUp size={14}/>{zone.demand === 'High' ? `Consider heading toward ${zone.name}` : `Demand currently ${zone.demand.toLowerCase()}`}</div></article>) : <div className="zone-empty">Share location to see nearby demand zones.</div>}</div></section>
      <section className="driver-panel" id="pooling"><div className="driver-panel-head"><div><span className="driver-kicker">SHARED JOURNEYS</span><h2>Ride pooling</h2></div><span className="preview-chip">Prototype preview</span></div><p className="driver-panel-subtitle">Potential nearby match preview. Pool compatibility and shared routing are not yet connected to live ride dispatch.</p>{poolPreview.filter(item => !poolDecisions[item.id]).map(pool => <article className="pool-card" key={pool.id}><div className="pool-main"><span className="pool-icon"><Users size={18}/></span><div><strong>Possible match · {pool.passenger}</strong><small>{pool.pickup} → {pool.destination}</small></div><span className="pool-fit"><Zap size={13}/> Nearby route</span></div><div className="pool-stats"><span><small>Extra distance</small><b>+{pool.extraKm} km</b></span><span><small>Extra time</small><b>+{pool.extraMinutes} min</b></span><span><small>Revised fare</small><b>{money(pool.revisedFare)}</b></span><div className="pool-actions"><button onClick={() => setPoolDecisions({ ...poolDecisions, [pool.id]: 'accepted' })}>Accept suggestion</button><button onClick={() => setPoolDecisions({ ...poolDecisions, [pool.id]: 'rejected' })}>Dismiss</button></div></div></article>)}{Object.keys(poolDecisions).length > 0 && <p className="driver-inline-note">Demo suggestion {poolDecisions.pool1} for this session.</p>}</section>
      <section className="driver-two-col" id="performance"><div className="driver-panel performance-panel"><div className="driver-panel-head"><div><span className="driver-kicker">FAIRNESS & SERVICE</span><h2>Your performance</h2></div><Star size={19} className="performance-star"/></div><div className="performance-score"><strong>{metric.acceptanceRate}%</strong><span>Acceptance rate</span><div className="performance-meter"><i style={{ width: `${metric.acceptanceRate}%` }}/></div></div><div className="performance-list"><div><span><CheckCheck size={15}/> Completed rides</span><b>{metric.completedRides}</b></div><div><span><X size={15}/> Rejected rides</span><b>{metric.rejectedCount}</b></div><div><span><Activity size={15}/> Driver workload</span><b>{activeRide ? '1 active ride' : 'Available'}</b></div><div><span><Clock3 size={15}/> Average idle</span><b>{idleLabel}</b></div><div><span><Gauge size={15}/> Previous assignments</span><b>{metric.assignmentCount}</b></div></div><p className="performance-note">Assignments consider pickup distance and ETA. Broader workload and fairness scoring improves as ride history grows.</p></div>
        <div className="driver-panel earnings-panel" id="earnings"><div className="driver-panel-head"><div><span className="driver-kicker">YOUR EARNINGS</span><h2>Earnings overview</h2></div><span className="preview-chip">INR</span></div><div className="earnings-total"><strong>{money(metric.todayEarnings)}</strong><span><TrendingUp size={14}/> Today</span></div><div className="earnings-periods"><div><small>Today</small><b>{money(metric.todayEarnings)}</b></div><div><small>Last 7 days</small><b>{money(earningsSummary.week)}</b></div><div><small>Last 30 days</small><b>{money(earningsSummary.month)}</b></div></div><div className="earnings-chart" aria-label="Earnings for the last seven days">{earningsSummary.days.map((day, i) => <div key={i}><span style={{ height: `${day.height}%` }} title={`${day.label}: ${money(day.amount)}`}/><small>{day.label}</small></div>)}</div><p className="chart-caption">Daily earnings · {demo ? 'sample history' : 'recent ride history'}</p></div></section>
      <section className="driver-panel history-panel"><div className="driver-panel-head"><div><span className="driver-kicker">TRIP RECORD</span><h2>Recent ride history</h2></div><span className="history-count">{data.history.length} rides</span></div><div className="history-table-wrap"><table className="history-table"><thead><tr><th>Passenger</th><th>Route</th><th>Date</th><th>Distance</th><th>Fare</th><th>Status</th></tr></thead><tbody>{data.history.slice(0, 6).map(ride => <tr key={ride.id}><td><span className="table-passenger"><span>{(ride.passenger?.name || 'P')[0]}</span>{ride.passenger?.name || 'Passenger'}</span></td><td><div className="table-route">{ride.pickup.label}<small>to {ride.destination.label}</small></div></td><td>{new Date(ride.completedAt || ride.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td><td>{ride.routeDistanceKm} km</td><td><strong>{money(ride.estimatedFare)}</strong></td><td><span className={`history-status ${ride.status === 'Completed' ? 'done' : 'cancel'}`}>{ride.status}</span></td></tr>)}</tbody></table>{!data.history.length && <div className="driver-empty compact"><p>Completed rides will show here.</p></div>}</div></section>
      <section className="driver-panel driver-profile-panel" id="profile"><div className="driver-panel-head"><div><span className="driver-kicker">ACCOUNT DETAILS</span><h2>Driver profile</h2></div><button className="edit-profile-button" onClick={() => { setProfile({ name: data.user?.name || '', phone: data.user?.phone || '', registrationNumber: vehicle.registrationNumber || '' }); setProfileOpen(true) }}>Edit profile</button></div><div className="driver-profile-body"><div className="profile-identity"><span className="profile-large-avatar">{(data.user?.name || 'D').split(' ').map(x => x[0]).slice(0, 2).join('')}</span><div><h3>{data.user?.name || 'Driver name'}</h3><p>{data.user?.phone || 'Phone number not added'}</p><span className={`verification-badge verify-${data.user?.driverDetails?.verificationStatus || 'pending'}`}><ShieldCheck size={13}/>{data.user?.driverDetails?.verificationStatus || 'pending'} verification</span></div></div><div className="profile-detail-grid"><div><small>VEHICLE</small><strong>{vehicle.make || 'Vehicle'} {vehicle.model || ''}</strong><span>{vehicle.color || 'Color'} · {vehicle.type || 'Type'} · {vehicle.acType || 'AC'}</span></div><div><small>REGISTRATION</small><strong>{vehicle.registrationNumber || 'Not added'}</strong><span>Vehicle registration number</span></div><div><small>DRIVING LICENCE</small><strong>{data.user?.driverDetails?.licenseNumber || 'Not added'}</strong><span>Verification status: {data.user?.driverDetails?.verificationStatus || 'pending'}</span></div><div><small>VEHICLE DETAILS</small><strong>{vehicle.manufacturingYear || '—'} · {vehicle.seatingCapacity || '—'} seats</strong><span>{vehicle.type || 'Vehicle type'} · {vehicle.acType || 'AC status'}</span></div></div></div></section>
      <footer className="driver-footer"><Brand/><span>Drive safe. We’ll keep your dashboard up to date.</span></footer></div>
    </main>
    {profileOpen && <div className="driver-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setProfileOpen(false) }}><form className="driver-profile-modal" onSubmit={saveProfile}><div className="driver-modal-head"><div><span className="driver-kicker">PROFILE SETTINGS</span><h2>Edit your details</h2></div><button type="button" onClick={() => setProfileOpen(false)} aria-label="Close edit profile"><X size={19}/></button></div><label>Full name<input value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} required minLength="2" maxLength="100"/></label><label>Phone number<input value={profile.phone} onChange={e => setProfile({ ...profile, phone: e.target.value })} required/></label><label>Vehicle registration number<input value={profile.registrationNumber} onChange={e => setProfile({ ...profile, registrationNumber: e.target.value })} maxLength="20" placeholder="KA22AB1234"/></label><div className="driver-modal-actions"><button type="button" onClick={() => setProfileOpen(false)}>Cancel</button><button type="submit" disabled={busy}>Save changes</button></div></form></div>}
    {toast && <div className="driver-toast" role="status"><Check size={16}/>{toast}</div>}
  </div>
}

function RideControls({ ride, onStatus, busy }) {
  const buttons = { Accepted: ['Arrived at pickup', 'Arriving'], Arriving: ['Start ride', 'Ongoing'], Ongoing: ['Complete ride', 'Completed'] }
  const next = buttons[ride.status]
  return <div className="ride-control-buttons">{next && <button className="primary" disabled={busy} onClick={() => onStatus(next[1])}><Check size={15}/>{next[0]}</button>}{ride.status !== 'Ongoing' && <button className="cancel-ride-button" disabled={busy} onClick={() => onStatus('Cancelled')}>Cancel ride</button>}{ride.status === 'Ongoing' && <button className="cancel-ride-button" disabled={busy} onClick={() => onStatus('Cancelled')}>Cancel ride</button>}</div>
}
