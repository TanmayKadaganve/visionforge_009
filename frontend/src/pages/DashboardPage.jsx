import { useEffect, useState } from 'react'
import { ArrowRight, CarFront, LogOut, Navigation, ShieldCheck } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import Brand from '../components/Brand.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { apiUrl } from '../lib/apiUrl.js'

export default function DashboardPage({ role }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  useEffect(() => {
    let active = true
    fetch(apiUrl(`/api/auth/${role}-dashboard`), { credentials: 'include' }).then(async response => {
      if (response.ok) return
      const result = await response.json().catch(() => ({}))
      throw new Error(result.message || 'Unable to verify dashboard access.')
    }).catch(err => { if (active) setError(err.message) })
    return () => { active = false }
  }, [role])
  async function handleLogout() {
    setSigningOut(true)
    try { await logout() } finally { navigate('/', { replace: true }) }
  }
  const driver = role === 'driver'
  return <main className="dashboard-page"><header className="dashboard-header"><Brand/><button className="button button-quiet" onClick={handleLogout} disabled={signingOut}><LogOut size={16}/>{signingOut ? 'Signing out…' : 'Log out'}</button></header><section className="dashboard-card"><span className="dashboard-icon">{driver ? <CarFront size={25}/> : <Navigation size={25}/>}</span><span className="role-badge">{driver ? 'DRIVER' : 'PASSENGER'} ACCOUNT</span><h1>Welcome, {user?.name?.split(' ')[0] || 'there'}.</h1><p>{driver ? 'Driver availability and ride management will be available in the next development phase.' : 'Passenger ride booking will be available in the next development phase.'}</p>{error && <p className="auth-feedback auth-error" role="alert">{error}</p>}<div className="dashboard-account"><span><ShieldCheck size={16}/> Signed in as {user?.email}</span><Link to="/">Back to RideFlow <ArrowRight size={15}/></Link></div></section></main>
}
