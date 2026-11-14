import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, CarFront, Clock3, LocateFixed, LogOut, MapPin, Navigation, Search, ShieldCheck, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Brand from '../components/Brand.jsx'
import ThemeToggle from '../components/ThemeToggle.jsx'
import PassengerMap from '../components/PassengerMap.jsx'
import { apiUrl } from '../lib/apiUrl.js'
import { useAuth } from '../auth/AuthContext.jsx'
import '../styles/passenger-page.css'

async function api(path, options = {}) {
  const response = await fetch(apiUrl(path), {
    ...options,
    credentials: 'include',
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  })
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('RideFlow API is unavailable. Start MongoDB and the backend, then try again.')
  }
  const result = await response.json()
  if (!response.ok) throw new Error(result.message || 'The request could not be completed.')
  return result
}

const formatMoney = amount => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount)
const formatStatus = status => status === 'Ongoing' ? 'On your way' : status
const rideStages = ['Requested', 'Accepted', 'Arriving', 'Ongoing', 'Completed']
const vehicleCategories = ['Bike', 'Scooter', 'Auto', 'Mini', 'Sedan', 'SUV', 'Premium', 'Electric']

function LocationSearch({ kind, value, query, onQuery, onSearch, results, searching, error, onSelect, onPickMap, onUseCurrent }) {
  const pickup = kind === 'pickup'
  return <section className="passenger-location-block">
    <label className="passenger-location-label" htmlFor={`${kind}-search`}><span className={`location-symbol ${pickup ? 'symbol-pickup' : 'symbol-destination'}`}><MapPin size={14}/></span>{pickup ? 'Pickup location' : 'Destination'}</label>
    <div className="location-search-row"><input id={`${kind}-search`} value={query} onChange={event => onQuery(event.target.value)} placeholder={value?.label || (pickup ? 'Search pickup location' : 'Search destination')} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); onSearch() } }}/><button className="location-search-button" onClick={onSearch} disabled={searching || query.trim().length < 3} aria-label={`Search ${pickup ? 'pickup' : 'destination'}`}><Search size={16}/></button></div>
    <div className="location-actions"><button type="button" onClick={onPickMap}><MapPin size={13}/> Pick on map</button>{pickup && <button type="button" onClick={onUseCurrent}><LocateFixed size={13}/> Use my location</button>}</div>
    {value && <p className="selected-location"><span/>{value.label}</p>}
    {searching && <p className="passenger-subtle">Searching OpenStreetMap…</p>}
    {error && <p className="passenger-inline-error" role="alert">{error}</p>}
    {results.length > 0 && <div className="place-results" role="listbox" aria-label={`${pickup ? 'Pickup' : 'Destination'} search results`}>{results.map((place, index) => <button type="button" role="option" key={`${place.latitude}-${place.longitude}-${index}`} onClick={() => onSelect(place)}><MapPin size={14}/><span>{place.label}</span></button>)}</div>}
  </section>
}

function RideProgress({ ride }) {
  const terminal = ['Rejected', 'Cancelled'].includes(ride.status)
  const activeIndex = rideStages.indexOf(ride.status)
  return <section className="ride-progress-card" aria-live="polite">
    <div className="ride-progress-head"><div><span className="passenger-section-kicker">YOUR RIDE</span><h3>{ride.status === 'Requested' ? 'Request sent' : ride.status === 'Completed' ? 'Ride completed' : `Ride ${ride.status.toLowerCase()}`}</h3></div><span className={`ride-status-pill status-${ride.status.toLowerCase()}`}>{ride.status}</span></div>
    <div className="ride-progress-route"><span className="route-dot route-dot-pickup"/><div><small>Pickup</small><strong>{ride.pickup.label}</strong></div><span className="route-dot route-dot-destination"/><div><small>Destination</small><strong>{ride.destination.label}</strong></div></div>
    <div className="ride-progress-metrics"><span><Navigation size={14}/>{ride.routeDistanceKm} km</span><span><Clock3 size={14}/>{ride.estimatedDurationMinutes} min est.</span><strong>{formatMoney(ride.estimatedFare)} est.</strong></div>
    <div className={`ride-timeline${terminal ? ' timeline-terminal' : ''}`} aria-label={`Ride status: ${ride.status}`}>{rideStages.map((stage, index) => <div key={stage} className={`ride-timeline-step${!terminal && index <= activeIndex ? ' is-done' : ''}${ride.status === stage ? ' is-current' : ''}`}><span/>{stage}</div>)}</div>
    {ride.driver && <p className="ride-driver-line"><CarFront size={15}/> {ride.vehicleType || 'Mini'} ride · request sent to {ride.driver.name}{ride.driver.vehicle ? ` · ${ride.driver.vehicle.make} ${ride.driver.vehicle.model}` : ''}</p>}
    <p className="passenger-subtle">Ride updates refresh every 5 seconds while this request is active.</p>
  </section>
}

export default function PassengerPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [pickup, setPickup] = useState(null)
  const [destination, setDestination] = useState(null)
  const [vehicleType, setVehicleType] = useState('Mini')
  const [focus, setFocus] = useState(null)
  const [mapTarget, setMapTarget] = useState('')
  const [pickupQuery, setPickupQuery] = useState('')
  const [destinationQuery, setDestinationQuery] = useState('')
  const [search, setSearch] = useState({ target: '', loading: false, results: [], error: '' })
  const [route, setRoute] = useState(null)
  const [routeLoading, setRouteLoading] = useState(false)
  const [routeError, setRouteError] = useState('')
  const [drivers, setDrivers] = useState([])
  const [driversLoading, setDriversLoading] = useState(false)
  const [driversError, setDriversError] = useState('')
  const [activeRide, setActiveRide] = useState(null)
  const [history, setHistory] = useState([])
  const [requesting, setRequesting] = useState(false)
  const [pageError, setPageError] = useState('')
  const [signingOut, setSigningOut] = useState(false)

  const refreshHistory = useCallback(async () => {
    const result = await api('/api/rides/history')
    setHistory(result.data.rides)
  }, [])

  useEffect(() => { refreshHistory().catch(() => {}) }, [refreshHistory])

  useEffect(() => {
    if (!pickup) { setDrivers([]); setDriversError(''); return undefined }
    let active = true
    let firstLoad = true
    const loadDrivers = async () => {
      if (firstLoad && active) setDriversLoading(true)
      try {
        const params = new URLSearchParams({ lat: pickup.latitude, lng: pickup.longitude, vehicleType })
        const result = await api(`/api/rides/nearby?${params}`)
        if (active) { setDrivers(Array.isArray(result.data?.drivers) ? result.data.drivers : []); setDriversError('') }
      } catch (error) { if (active) setDriversError(error.message) }
      finally { if (active) { setDriversLoading(false); firstLoad = false } }
    }
    loadDrivers()
    const timer = window.setInterval(loadDrivers, 10000)
    return () => { active = false; window.clearInterval(timer) }
  }, [pickup?.latitude, pickup?.longitude, vehicleType])

  useEffect(() => {
    if (!pickup || !destination) { setRoute(null); setRouteError(''); return undefined }
    const controller = new AbortController()
    let active = true
    const params = new URLSearchParams({ pickupLat: pickup.latitude, pickupLng: pickup.longitude, destinationLat: destination.latitude, destinationLng: destination.longitude, vehicleType })
    setRoute(null); setRouteLoading(true); setRouteError('')
    api(`/api/locations/route?${params}`, { signal: controller.signal })
      .then(result => { if (active) setRoute(result.data) })
      .catch(error => { if (active && error.name !== 'AbortError') setRouteError(error.message) })
      .finally(() => { if (active) setRouteLoading(false) })
    return () => { active = false; controller.abort() }
  }, [pickup?.latitude, pickup?.longitude, destination?.latitude, destination?.longitude, vehicleType])

  useEffect(() => {
    if (!activeRide || ['Completed', 'Cancelled', 'Rejected'].includes(activeRide.status)) return undefined
    let active = true
    const updateRide = async () => {
      try {
        const result = await api(`/api/rides/${activeRide.id}`)
        if (active) {
          setActiveRide(current => current?.id === result.data.ride.id ? result.data.ride : current)
          if (['Completed', 'Cancelled', 'Rejected'].includes(result.data.ride.status)) refreshHistory().catch(() => {})
        }
      } catch { /* Keep the current ride state visible if a refresh is temporarily unavailable. */ }
    }
    const timer = window.setInterval(updateRide, 5000)
    return () => { active = false; window.clearInterval(timer) }
  }, [activeRide?.id, activeRide?.status, refreshHistory])

  async function searchPlaces(target) {
    const query = (target === 'pickup' ? pickupQuery : destinationQuery).trim()
    if (query.length < 3) return setSearch({ target, loading: false, results: [], error: 'Enter at least 3 characters to search.' })
    setSearch({ target, loading: true, results: [], error: '' })
    try {
      const params = new URLSearchParams({ q: query })
      const result = await api(`/api/locations/search?${params}`)
      setSearch({ target, loading: false, results: result.data.places, error: result.data.places.length ? '' : 'No locations found. Try a nearby landmark or use the map.' })
    } catch (error) { setSearch({ target, loading: false, results: [], error: error.message }) }
  }

  function chooseLocation(target, place) {
    const value = { label: place.label, latitude: place.latitude, longitude: place.longitude }
    if (target === 'pickup') { setPickup(value); setPickupQuery(value.label) }
    else { setDestination(value); setDestinationQuery(value.label) }
    setFocus(value); setMapTarget(''); setSearch({ target: '', loading: false, results: [], error: '' }); setPageError('')
  }

  function changeLocationQuery(target, value) {
    if (target === 'pickup') {
      setPickupQuery(value)
      if (pickup && value !== pickup.label) setPickup(null)
    } else {
      setDestinationQuery(value)
      if (destination && value !== destination.label) setDestination(null)
    }
  }

  function pickFromMap(target, latitude, longitude) {
    const label = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
    chooseLocation(target, { label, latitude, longitude })
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) return setPageError('This browser does not provide location access. Search for your pickup or choose it on the map.')
    navigator.geolocation.getCurrentPosition(
      position => chooseLocation('pickup', { label: `Current location (${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)})`, latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => setPageError('Location access was unavailable. Allow location permission or choose your pickup on the map.'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    )
  }

  async function requestRide() {
    setRequesting(true); setPageError('')
    try {
      const result = await api('/api/rides', {
        method: 'POST',
        body: JSON.stringify({ pickup, destination, vehicleType }),
      })
      setActiveRide(result.data.ride)
      setDrivers(current => current.filter(driver => driver.id !== result.data.ride.driver.id))
      await refreshHistory()
    } catch (error) { setPageError(error.message) }
    finally { setRequesting(false) }
  }

  async function signOut() {
    setSigningOut(true)
    try { await logout() } finally { navigate('/', { replace: true }) }
  }

  const rideInProgress = activeRide && !['Completed', 'Cancelled', 'Rejected'].includes(activeRide.status)
  const canRequest = pickup && destination && route && drivers.length > 0 && !routeLoading && !requesting && !rideInProgress
  const firstDriver = drivers[0]

  return <main className="passenger-page">
    <header className="passenger-header"><Brand/><div className="passenger-header-right"><span className="passenger-user"><span className="passenger-user-dot"/> {user?.name}</span><button className="button button-quiet passenger-logout" onClick={signOut} disabled={signingOut}><LogOut size={15}/>{signingOut ? 'Signing out…' : 'Log out'}</button><ThemeToggle/></div></header>
    <div className="passenger-content">
      <div className="passenger-page-title"><div><div className="eyebrow"><span className="eyebrow-dot"/> PASSENGER</div><h1>Where are you headed?</h1><p>Choose your pickup and destination to see real nearby drivers and a route estimate.</p></div><span className="passenger-role-chip"><ShieldCheck size={14}/> Passenger account</span></div>

      <div className="passenger-layout">
        <section className="passenger-map-card"><div className="passenger-map-card-head"><div><h2>Trip map</h2><p>Search a place or select a point directly on the map.</p></div></div>
          <PassengerMap pickup={pickup} destination={destination} drivers={drivers} route={route} focus={focus} mapTarget={mapTarget} onMapPick={pickFromMap}/>
        </section>

        <aside className="passenger-booking-card"><div className="booking-card-heading"><span className="passenger-section-kicker">PLAN YOUR RIDE</span><h2>Set your journey</h2></div>
          <LocationSearch kind="pickup" value={pickup} query={pickupQuery} onQuery={value => changeLocationQuery('pickup', value)} onSearch={() => searchPlaces('pickup')} searching={search.target === 'pickup' && search.loading} results={search.target === 'pickup' ? search.results : []} error={search.target === 'pickup' ? search.error : ''} onSelect={place => chooseLocation('pickup', place)} onPickMap={() => setMapTarget('pickup')} onUseCurrent={useCurrentLocation}/>
          <div className="location-connector" aria-hidden="true"/>
          <LocationSearch kind="destination" value={destination} query={destinationQuery} onQuery={value => changeLocationQuery('destination', value)} onSearch={() => searchPlaces('destination')} searching={search.target === 'destination' && search.loading} results={search.target === 'destination' ? search.results : []} error={search.target === 'destination' ? search.error : ''} onSelect={place => chooseLocation('destination', place)} onPickMap={() => setMapTarget('destination')} onUseCurrent={() => {}}/>
          <section className="vehicle-category-picker" aria-label="Choose ride vehicle category"><div className="vehicle-picker-heading"><span className="passenger-section-kicker">VEHICLE CATEGORY</span><small>Prototype rates · estimated fare</small></div><div className="vehicle-category-options">{vehicleCategories.map(category => <button type="button" key={category} className={`vehicle-category-option${vehicleType === category ? ' selected' : ''}`} onClick={() => setVehicleType(category)} aria-pressed={vehicleType === category}><span>{category}</span><strong>{route?.fareOptions?.[category] ? formatMoney(route.fareOptions[category].amount) : '—'}</strong></button>)}</div></section>
          {routeLoading && <div className="passenger-loading"><span className="spinner"/> Calculating driving route…</div>}
          {routeError && <p className="passenger-inline-error" role="alert">{routeError}</p>}
          {route && <div className="route-estimate"><span className="passenger-section-kicker">{vehicleType.toUpperCase()} ESTIMATE</span><div className="estimate-metrics"><div><strong>{route.distanceKm} km</strong><small>Driving distance</small></div><div><strong>{route.durationMinutes} min</strong><small>Route duration</small></div><div><strong>{formatMoney(route.estimatedFare)}</strong><small>{vehicleType} estimate</small></div></div><p>{vehicleType} rate: {formatMoney(route.fareFormula.baseFare)} base + {formatMoney(route.fareFormula.ratePerKm)} per km. Other category estimates are shown above. Final fare may vary.</p></div>}
          {pageError && <p className="passenger-inline-error" role="alert">{pageError}<button aria-label="Dismiss message" onClick={() => setPageError('')}><X size={13}/></button></p>}
          <button className="button button-primary request-ride-button" disabled={!canRequest} onClick={requestRide}>{requesting ? <><span className="spinner spinner-light"/> Sending request…</> : <>Request a ride <ArrowRight size={17}/></>}</button>
          {!drivers.length && pickup && <p className="request-disabled-note">A ride can be requested when an available driver is nearby.</p>}
        </aside>
      </div>

      {activeRide && <RideProgress ride={activeRide}/>}

      {pickup && <section className="nearby-section"><div className="passenger-section-head"><div><span className="passenger-section-kicker">LIVE AVAILABILITY</span><h2>Nearby available drivers</h2><p>Availability refreshes every 10 seconds. Drivers must share a recent location to appear.</p></div>{driversLoading && <span className="refresh-indicator"><span className="spinner"/> Updating</span>}</div>
        {driversError ? <p className="passenger-inline-error" role="alert">{driversError}</p> : drivers.length ? <div className="nearby-driver-list">{drivers.map((driver, index) => <article className={`nearby-driver-card${index === 0 ? ' nearest-driver' : ''}`} key={driver.id}><span className="driver-car-icon"><CarFront size={20}/></span><div className="nearby-driver-main"><strong>{driver.name}{index === 0 && <span className="nearest-tag">CLOSEST</span>}</strong><span>{driver.vehicle.make} {driver.vehicle.model} · {driver.vehicle.color} · {driver.vehicle.acType}</span></div><div className="nearby-driver-metrics"><strong>{driver.distanceKm} km</strong><span>approx. {driver.pickupEtaMinutes} min pickup</span></div></article>)}</div> : <div className="no-drivers-card"><span><CarFront size={20}/></span><div><strong>{driversLoading ? 'Checking nearby drivers…' : 'No available drivers nearby yet'}</strong><p>{driversLoading ? 'Looking for drivers who are online with a recent location.' : 'The list will show real drivers after they go online and share their location.'}</p></div></div>}
        {drivers.length > 0 && <p className="passenger-subtle">The nearest available driver is selected when you request. Pickup time is approximate, based on direct distance and configured pickup speed.</p>}
      </section>}

      <section className="passenger-history-section"><div className="passenger-section-head"><div><span className="passenger-section-kicker">YOUR ACCOUNT</span><h2>Ride history</h2><p>Past requests and their recorded fare estimates.</p></div></div>
        {history.length ? <div className="ride-history-list">{history.map(ride => <article className="ride-history-card" key={ride.id}><div className="history-route"><span className="route-dot route-dot-pickup"/><strong>{ride.pickup.label}</strong><ArrowRight size={14}/><span className="route-dot route-dot-destination"/><strong>{ride.destination.label}</strong></div><div className="history-meta"><span className={`ride-status-pill status-${ride.status.toLowerCase()}`}>{ride.status}</span><span>{ride.vehicleType || 'Mini'} · {ride.routeDistanceKm} km · {ride.estimatedDurationMinutes} min</span><strong>{formatMoney(ride.estimatedFare)} est.</strong><time dateTime={ride.createdAt}>{new Date(ride.createdAt).toLocaleDateString('en-IN')}</time></div></article>)}</div> : <div className="history-empty"><Clock3 size={18}/><span>No rides in your history yet.</span></div>}
      </section>
      <footer className="passenger-page-footer">Passenger ride estimates use OSRM road routes.</footer>
    </div>
  </main>
}
