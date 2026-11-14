import { getDrivingRoute } from '../services/routingService.js'
import { fareFor, vehicleCategories } from '../utils/pricing.js'
import { validCoordinates } from '../utils/geo.js'

const placeCache = new Map()
let nominatimQueue = Promise.resolve()
let lastNominatimRequestAt = 0

function searchNominatim(query) {
  const task = nominatimQueue.then(async () => {
    const wait = Math.max(0, 1100 - (Date.now() - lastNominatimRequestAt))
    if (wait) await new Promise(resolve => setTimeout(resolve, wait))
    lastNominatimRequestAt = Date.now()
    const url = new URL('https://nominatim.openstreetmap.org/search')
    url.search = new URLSearchParams({ q: query, format: 'jsonv2', limit: '5' })
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'RideFlow/0.1 (hackathon ride matching prototype)',
        'Accept-Language': 'en',
        Referer: process.env.CLIENT_URL?.split(',')[0] || 'http://localhost:5173',
      },
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) throw new Error('Location search is unavailable.')
    return response.json()
  })
  nominatimQueue = task.catch(() => {})
  return task
}

export async function searchPlaces(req, res) {
  const query = typeof req.query.q === 'string' ? req.query.q.trim().replace(/\s+/g, ' ') : ''
  if (query.length < 3 || query.length > 120) return res.status(400).json({ success: false, message: 'Enter a location with 3–120 characters.' })
  const key = query.toLowerCase()
  const cached = placeCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return res.json({ success: true, data: { places: cached.places } })
  try {
    const results = await searchNominatim(query)
    const places = results.map(place => ({
      label: place.display_name.slice(0, 200),
      latitude: Number(place.lat),
      longitude: Number(place.lon),
    })).filter(place => validCoordinates(place.latitude, place.longitude))
    placeCache.set(key, { places, expiresAt: Date.now() + 10 * 60 * 1000 })
    return res.json({ success: true, data: { places } })
  } catch {
    return res.status(502).json({ success: false, message: 'Location search could not reach OpenStreetMap. Try again or select a point on the map.' })
  }
}

export async function estimateRoute(req, res) {
  const pickup = { latitude: Number(req.query.pickupLat), longitude: Number(req.query.pickupLng) }
  const destination = { latitude: Number(req.query.destinationLat), longitude: Number(req.query.destinationLng) }
  const vehicleType = typeof req.query.vehicleType === 'string' ? req.query.vehicleType : 'Mini'
  if (!validCoordinates(pickup.latitude, pickup.longitude) || !validCoordinates(destination.latitude, destination.longitude)) {
    return res.status(400).json({ success: false, message: 'Choose valid pickup and destination locations.' })
  }
  if (!vehicleCategories.includes(vehicleType)) return res.status(400).json({ success: false, message: 'Choose a supported vehicle category.' })
  try {
    const route = await getDrivingRoute(pickup, destination)
    const fare = fareFor(route.distanceKm, vehicleType)
    const fareOptions = Object.fromEntries(vehicleCategories.map(category => [category, fareFor(route.distanceKm, category)]))
    return res.json({
      success: true,
      data: {
        ...route,
        vehicleType,
        distanceKm: Number(route.distanceKm.toFixed(1)),
        durationMinutes: Math.max(1, Math.round(route.durationMinutes)),
        estimatedFare: fare.amount,
        currency: fare.currency,
        fareFormula: { vehicleType, baseFare: fare.baseFare, ratePerKm: fare.ratePerKm },
        fareOptions,
        provider: 'OSRM',
      },
    })
  } catch (error) {
    return res.status(502).json({ success: false, message: error.message || 'Route estimate is unavailable right now.' })
  }
}
