import { Navigation } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function Brand({ light = false }) {
  return <Link to="/" className={`brand${light ? ' brand-light' : ''}`} aria-label="RideFlow home">
    <span className="brand-mark"><Navigation size={19} strokeWidth={2.7} /></span><span>ride<span className="brand-accent">flow</span></span>
  </Link>
}
