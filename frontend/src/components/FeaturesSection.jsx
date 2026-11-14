import { BrainCircuit, TrendingUp, Map, UsersRound, Scale, RefreshCw, ArrowUpRight } from 'lucide-react'
const features = [
  [BrainCircuit, 'Intelligent driver matching', 'Connect each passenger with a suitable nearby driver based on the journey at hand.', '01'],
  [TrendingUp, 'Predictive demand forecasting', 'Anticipate where rides may be needed to help the network prepare ahead.', '02'],
  [Map, 'Smart zone intelligence', 'Understand mobility patterns across zones and make better allocation decisions.', '03'],
  [UsersRound, 'Multi-passenger ride pooling', 'Bring compatible journeys together to make shared trips more accessible.', '04'],
  [Scale, 'Driver allocation and fairness', 'Balance ride opportunities with thoughtful, transparent allocation.', '05'],
  [RefreshCw, 'Automatic driver reassignment', 'Adapt to changing circumstances and help keep every journey moving.', '06'],
]
export default function FeaturesSection() { return <section className="section features-section" id="features"><div className="container"><div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-dot"/> Built around better movement</div><h2>Intelligence in<br/><span>every connection.</span></h2></div><p>A thoughtful set of mobility capabilities designed to make the whole network work better for everyone.</p></div><div className="feature-grid">{features.map(([Icon, title, copy, num])=><article className="feature-card" key={title}><div className="feature-top"><span className="feature-icon"><Icon size={22}/></span><span className="feature-num">{num}</span></div><h3>{title}</h3><p>{copy}</p><span className="feature-link" aria-hidden="true"><ArrowUpRight size={17}/></span></article>)}</div><p className="feature-disclaimer">RideFlow’s mobility capabilities are being developed to support a smarter transportation network.</p></div></section> }
