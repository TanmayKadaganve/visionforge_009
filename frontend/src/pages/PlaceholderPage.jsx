import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import Brand from '../components/Brand.jsx'
export default function PlaceholderPage({ title, detail }) { return <main className="placeholder-page"><div className="placeholder-nav"><Brand/><Link to="/" className="placeholder-back"><ArrowLeft size={16}/> Back to home</Link></div><section className="placeholder-content"><span className="placeholder-symbol"><Sparkles size={25}/></span><div className="eyebrow"><span className="eyebrow-dot"/> Coming soon</div><h1>{title}</h1><p>{detail}</p><Link to="/" className="button button-primary">Explore RideFlow <ArrowRight size={17}/></Link></section><div className="placeholder-foot">© {new Date().getFullYear()} RideFlow</div></main> }
