import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { loadGoogleMutant } from '../maps/googleMutant.js'
import 'leaflet/dist/leaflet.css'

const DEFAULT_MAP_CENTER = [22.5, 79]

function safePopup(lines) {
  const element = document.createElement('div')
  lines.forEach((line, index) => {
    if (index) element.appendChild(document.createElement('br'))
    const span = document.createElement('span')
    span.textContent = line
    element.appendChild(span)
  })
  return element
}

function locationIcon(kind) {
  return L.divIcon({
    className: `passenger-map-marker marker-${kind}`,
    html: `<span class="marker-halo"></span><span class="marker-core"></span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  })
}

export default function PassengerMap({ pickup, destination, drivers, route, focus, mapTarget, onMapPick }) {
  const elementRef = useRef(null)
  const mapRef = useRef(null)
  const layersRef = useRef(null)
  const onMapPickRef = useRef(onMapPick)
  const mapTargetRef = useRef(mapTarget)
  onMapPickRef.current = onMapPick
  mapTargetRef.current = mapTarget

  useEffect(() => {
    if (!elementRef.current) return undefined
    const map = L.map(elementRef.current, { center: DEFAULT_MAP_CENTER, zoom: 5, scrollWheelZoom: false })
    const fallback = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map)
    window.L = L
    loadGoogleMutant(L).then(() => {
      if (!mapRef.current) return
      fallback.remove()
      L.gridLayer.googleMutant({ type: 'roadmap' }).addTo(map)
    }).catch(() => {})
    const layers = L.layerGroup().addTo(map)
    map.on('click', event => {
      const target = mapTargetRef.current
      if (target) onMapPickRef.current(target, event.latlng.lat, event.latlng.lng)
    })
    mapRef.current = map
    layersRef.current = layers
    return () => {
      map.remove()
      mapRef.current = null
      layersRef.current = null
    }
  }, [])

  useEffect(() => {
    const layers = layersRef.current
    if (!layers) return
    layers.clearLayers()
    if (route?.geometry?.coordinates?.length) {
      L.geoJSON(route.geometry, { style: { color: '#2563eb', weight: 5, opacity: 0.82 } }).addTo(layers)
    }
    if (pickup) L.marker([pickup.latitude, pickup.longitude], { icon: locationIcon('pickup'), title: 'Pickup location', alt: 'Passenger pickup location' }).addTo(layers).bindPopup(safePopup(['Pickup', pickup.label]))
    if (destination) L.marker([destination.latitude, destination.longitude], { icon: locationIcon('destination'), title: 'Destination', alt: 'Passenger destination' }).addTo(layers).bindPopup(safePopup(['Destination', destination.label]))
    drivers.forEach(driver => L.marker([driver.latitude, driver.longitude], { icon: locationIcon('driver'), title: `Available driver: ${driver.name}`, alt: `Available driver ${driver.name}` })
      .addTo(layers).bindPopup(safePopup([driver.name, `${driver.vehicle.make} ${driver.vehicle.model}`, `${driver.distanceKm} km away`])))
  }, [pickup, destination, drivers, route])

  useEffect(() => {
    if (focus && mapRef.current) mapRef.current.setView([focus.latitude, focus.longitude], 15)
    else if (pickup && mapRef.current) mapRef.current.setView([pickup.latitude, pickup.longitude], 13)
  }, [focus, pickup?.latitude, pickup?.longitude])

  return <div className="passenger-map-frame">
    <div ref={elementRef} className="passenger-map" role="application" aria-label="Interactive map. Click to place the selected pickup or destination." />
    {mapTarget && <div className="map-click-hint">Click map to set {mapTarget}</div>}
  </div>
}
