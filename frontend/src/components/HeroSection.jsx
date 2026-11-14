import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { ArrowRight, Navigation, MapPin, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { loadGoogleMutant } from '../maps/googleMutant.js'

function MobilityVisual() {
  const mapElement = useRef(null)
  useEffect(() => {
    if (!mapElement.current) return undefined
    const map = L.map(mapElement.current, { center: [22.5, 79], zoom: 5, scrollWheelZoom: false })
    const fallback = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map)
    loadGoogleMutant(L).then(() => {
      if (!mapElement.current) return
      fallback.remove()
      L.gridLayer.googleMutant({ type: 'roadmap' }).addTo(map)
    }).catch(() => {})
    return () => map.remove()
  }, [])

  return <div className="hero-visual hero-map-shell">
    <div ref={mapElement} className="leaflet-map" role="application" aria-label="Interactive map overview" />
    <div className="map-location-card"><span className="map-location-icon"><MapPin size={16}/></span><div><strong>Map overview</strong><small>Zoom in to explore</small></div></div>
    <div className="map-caption"><span className="map-live-dot"/> {import.meta.env.VITE_GOOGLE_MAPS_API_KEY ? 'Google Maps · Leaflet' : 'Google Maps key required'}</div>
  </div>
}
export default function HeroSection() {
  return <section className="hero" id="home"><div className="container hero-grid">
    <div className="hero-copy"><div className="eyebrow"><span className="eyebrow-dot"/> A smarter way to move</div>
      <h1>Your journey.<br/><span>Smarter. Faster.</span><br/>Better.</h1>
      <p>Meet the ride platform that brings people and journeys together. Thoughtful matching, smoother trips, and a better way to get there.</p>
      <div className="hero-buttons"><Link to="/passenger/login" className="button button-primary button-large">Book a ride <ArrowRight size={18}/></Link><Link to="/driver/login" className="button button-outline button-large"><Navigation size={17}/> Drive with us</Link></div>
      <div className="hero-note"><span className="note-mark"><Sparkles size={15}/></span>Every trip, a little more thoughtful.</div>
    </div><MobilityVisual />
  </div><a className="scroll-cue" href="#how-it-works"><span/>Scroll to explore</a></section>
}
