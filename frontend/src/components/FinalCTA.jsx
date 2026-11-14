import { ArrowRight, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
export default function FinalCTA() { return <section className="final-cta"><div className="container final-inner"><div className="final-spark"><Sparkles size={19}/></div><div><div className="eyebrow eyebrow-light">The road ahead looks good</div><h2>Ready to move smarter?</h2><p>Join a smarter mobility experience with RideFlow.</p></div><Link to="/register" className="button button-white">Get started <ArrowRight size={17}/></Link><div className="final-orbit"/></div></section> }
