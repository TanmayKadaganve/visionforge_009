import { BrainCircuit, Radio, Workflow, UsersRound } from 'lucide-react'
const values = [[BrainCircuit, 'Smart driver matching'], [Radio, 'Real-time updates'], [Workflow, 'Intelligent allocation'], [UsersRound, 'Shared mobility']]
export default function TrustSection() { return <section className="trust-strip" aria-label="RideFlow values"><div className="container trust-inner">{values.map(([Icon, label]) => <div className="trust-item" key={label}><span><Icon size={19}/></span>{label}</div>)}</div></section> }
