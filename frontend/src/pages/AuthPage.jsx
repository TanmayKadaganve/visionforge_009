import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Eye, EyeOff, CarFront, UserRound, Navigation, ShieldCheck } from 'lucide-react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import Brand from '../components/Brand.jsx'
import ThemeToggle from '../components/ThemeToggle.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import '../styles/driver-auth.css'

let googleIdentityScript
function loadGoogleIdentity() {
  if (window.google?.accounts?.id) return Promise.resolve()
  if (!googleIdentityScript) googleIdentityScript = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = resolve
    script.onerror = () => { googleIdentityScript = null; reject(new Error('Google sign-in could not load. Check your connection and try again.')) }
    document.head.appendChild(script)
  })
  return googleIdentityScript
}

export default function AuthPage({ mode, fixedRole }) {
  const { role: routeRole } = useParams()
  const activeRouteRole = fixedRole || routeRole
  const navigate = useNavigate()
  const { user, loading: sessionLoading, login, googleLogin, register } = useAuth()
  const [role, setRole] = useState(activeRouteRole === 'admin' ? 'admin' : activeRouteRole === 'driver' ? 'driver' : 'passenger')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const googleButtonRef = useRef(null)
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  const [form, setForm] = useState({
    name: '', email: '', phone: '', password: '', confirmPassword: '',
    licenseNumber: '', vehicleType: '', vehicleMake: '', vehicleModel: '', vehicleColor: '',
    manufacturingYear: '', seatingCapacity: '', acType: '',
  })

  useEffect(() => {
    if (activeRouteRole === 'passenger' || activeRouteRole === 'driver' || activeRouteRole === 'admin') setRole(activeRouteRole)
  }, [activeRouteRole])
  useEffect(() => {
    if (!sessionLoading && user && (activeRouteRole === 'admin' ? user.role === 'admin' : !activeRouteRole || user.role === activeRouteRole)) {
      navigate(`/${user.role}/dashboard`, { replace: true })
    }
  }, [sessionLoading, user, activeRouteRole, navigate])
  useEffect(() => {
    if (mode !== 'login' || !googleClientId || !googleButtonRef.current) return undefined
    let mounted = true
    loadGoogleIdentity().then(() => {
      if (!mounted || !googleButtonRef.current) return
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async response => {
          setError(''); setNotice(''); setSubmitting(true)
          try {
            const authenticated = await googleLogin(response.credential, role)
            navigate(`/${authenticated.role}/dashboard`, { replace: true })
          } catch (requestError) { setError(requestError.message) }
          finally { setSubmitting(false) }
        },
      })
      googleButtonRef.current.replaceChildren()
      window.google.accounts.id.renderButton(googleButtonRef.current, { theme: 'outline', size: 'large', shape: 'rect', text: 'continue_with', width: Math.min(350, Math.max(220, googleButtonRef.current.clientWidth)), logo_alignment: 'left' })
    }).catch(error => { if (mounted) setError(error.message) })
    return () => { mounted = false; googleButtonRef.current?.replaceChildren() }
  }, [mode, role, googleClientId, googleLogin, navigate])
  if (activeRouteRole && !['passenger', 'driver', 'admin'].includes(activeRouteRole) || activeRouteRole === 'admin' && mode !== 'login') return <Navigate to="/admin/login" replace />
  const otherMode = mode === 'login' ? 'register' : 'login'
  const otherPath = activeRouteRole ? `/${role}/${otherMode}` : `/${otherMode}`
  const setField = event => setForm(current => ({ ...current, [event.target.name]: event.target.value }))

  async function handleSubmit(event) {
    event.preventDefault()
    setError(''); setNotice('')
    if (!form.email.trim() || !form.password || (mode === 'register' && (!form.name.trim() || !form.phone.trim() || !form.confirmPassword))) return setError('Please complete all required fields.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return setError('Enter a valid email address.')
    if (mode === 'register' && !/^\+?[1-9]\d{7,14}$/.test(form.phone.replace(/[\s()-]/g, ''))) return setError('Enter a valid mobile number, including country code if needed.')
    if (mode === 'register' && form.password.length < 8) return setError('Password must be at least 8 characters long.')
    if (mode === 'register' && form.password !== form.confirmPassword) return setError('Your passwords do not match.')
    if (mode === 'register' && role === 'driver') {
      const driverFields = [form.licenseNumber, form.vehicleType, form.vehicleMake, form.vehicleModel, form.vehicleColor, form.manufacturingYear, form.seatingCapacity, form.acType]
      if (driverFields.some(value => !String(value).trim())) return setError('Please complete all licence and vehicle details.')
      if (form.licenseNumber.trim().length < 5 || form.licenseNumber.trim().length > 30) return setError('Driving licence number must be 5–30 characters.')
      const year = Number(form.manufacturingYear)
      if (!Number.isInteger(year) || year < 1950 || year > new Date().getFullYear()) return setError('Enter a valid vehicle manufacturing year.')
      const capacity = Number(form.seatingCapacity)
      if (!Number.isInteger(capacity) || capacity < 1 || capacity > 20) return setError('Seating capacity must be between 1 and 20.')
    }
    setSubmitting(true)
    try {
      const driverDetails = role === 'driver' && mode === 'register' ? {
        licenseNumber: form.licenseNumber,
        vehicle: {
          type: form.vehicleType,
          make: form.vehicleMake,
          model: form.vehicleModel,
          color: form.vehicleColor,
          manufacturingYear: Number(form.manufacturingYear),
          seatingCapacity: Number(form.seatingCapacity),
          acType: form.acType,
        },
      } : undefined
      const authenticated = mode === 'login'
        ? await login({ email: form.email, password: form.password, role })
        : await register({ name: form.name, email: form.email, phone: form.phone, password: form.password, role, ...(driverDetails ? { driverDetails } : {}) })
      setNotice(mode === 'register' ? 'Your account is ready. Taking you to your dashboard…' : 'Signed in successfully. Redirecting…')
      navigate(`/${authenticated.role}/dashboard`, { replace: true })
    } catch (requestError) { setError(requestError.message) }
    finally { setSubmitting(false) }
  }

  return <main className="auth-page">
    <div className="auth-topbar"><Brand/><div className="auth-topbar-actions"><Link className="auth-home-link" to="/"><ArrowLeft size={15}/> Back to home</Link><ThemeToggle/></div></div>
    <div className="auth-layout">
      <aside className="auth-aside"><div className="auth-aside-content"><span className="auth-aside-mark"><Navigation size={22}/></span><p className="auth-kicker">A BETTER WAY TO GET THERE</p><h1>Every journey<br/><span>starts with</span><br/>RideFlow.</h1><p className="auth-aside-copy">Thoughtful connections make the distance between here and there feel a little shorter.</p><div className="auth-aside-points"><span><ShieldCheck size={16}/> Your journey, your choice</span><span><CarFront size={16}/> One platform. Two ways to move.</span></div></div><div className="auth-aside-route"><span/><span/><span/></div></aside>
      <section className="auth-panel-wrap"><div className="auth-panel">
        <div className="auth-welcome"><div className="eyebrow"><span className="eyebrow-dot"/> Welcome to RideFlow</div><h2>{mode === 'login' ? 'Good to see you.' : 'Let’s get you moving.'}</h2><p>{mode === 'login' ? 'Sign in to continue your journey.' : 'Create an account and find your flow.'}</p></div>
        {role === 'admin' ? <span className="admin-login-badge"><ShieldCheck size={14}/> Administrator access</span> : <div className="role-picker" aria-label="Choose account type">{[['passenger', UserRound, 'Passenger'], ['driver', CarFront, 'Driver']].map(([value, Icon, label]) => <button type="button" key={value} onClick={() => { setRole(value); setError('') }} className={`role-choice${role === value ? ' selected' : ''}`} aria-pressed={role === value}><Icon size={17}/>{label}</button>)}</div>}
        <div className="auth-tabs" role="tablist" aria-label="Authentication type"><Link role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'active' : ''} to={role === 'admin' ? '/admin/login' : activeRouteRole ? `/${role}/login` : '/login'}>Log in</Link>{role !== 'admin' && <Link role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'active' : ''} to={activeRouteRole ? `/${role}/register` : '/register'}>Create account</Link>}</div>
        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          {mode === 'register' && <><label className="form-field"><span>Full name</span><input name="name" value={form.name} onChange={setField} autoComplete="name" placeholder="Your full name" required minLength={2} maxLength={100}/></label></>}
          <label className="form-field"><span>Email address</span><input name="email" type="email" value={form.email} onChange={setField} autoComplete="email" placeholder="you@example.com" required/></label>
          {mode === 'register' && <label className="form-field"><span>Mobile number</span><input name="phone" type="tel" value={form.phone} onChange={setField} autoComplete="tel" placeholder="+91 98765 43210" required/></label>}
          {mode === 'register' && role === 'driver' && <>
            <div className="driver-form-heading"><CarFront size={16}/><span>Driving licence & vehicle details</span></div>
            <label className="form-field"><span>Driving licence number</span><input name="licenseNumber" value={form.licenseNumber} onChange={setField} placeholder="Enter licence number" autoComplete="off" required minLength={5} maxLength={30}/></label>
            <div className="vehicle-fields">
              <label className="form-field"><span>Vehicle type</span><select name="vehicleType" value={form.vehicleType} onChange={setField} required><option value="">Select type</option>{['Bike', 'Scooter', 'Auto', 'Mini', 'Sedan', 'SUV', 'Premium', 'Electric'].map(type => <option value={type} key={type}>{type}</option>)}</select></label>
              <label className="form-field"><span>Vehicle company/make</span><input name="vehicleMake" value={form.vehicleMake} onChange={setField} placeholder="e.g. Maruti Suzuki" required maxLength={80}/></label>
              <label className="form-field"><span>Vehicle model</span><input name="vehicleModel" value={form.vehicleModel} onChange={setField} placeholder="e.g. Swift" required maxLength={80}/></label>
              <label className="form-field"><span>Vehicle colour</span><input name="vehicleColor" value={form.vehicleColor} onChange={setField} placeholder="e.g. White" required maxLength={40}/></label>
              <label className="form-field"><span>Manufacturing year</span><input name="manufacturingYear" type="number" value={form.manufacturingYear} onChange={setField} placeholder="e.g. 2022" min="1950" max={new Date().getFullYear()} step="1" required/></label>
              <label className="form-field"><span>Seating capacity</span><input name="seatingCapacity" type="number" value={form.seatingCapacity} onChange={setField} placeholder="Including driver" min="1" max="20" step="1" required/></label>
              <label className="form-field"><span>Air conditioning</span><select name="acType" value={form.acType} onChange={setField} required><option value="">Select AC status</option><option value="AC">AC</option><option value="Non-AC">Non-AC</option></select></label>
            </div>
          </>}
          <label className="form-field"><span>Password</span><span className="password-input"><input name="password" type={showPassword ? 'text' : 'password'} value={form.password} onChange={setField} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder={mode === 'register' ? 'At least 8 characters' : 'Enter your password'} required minLength={mode === 'register' ? 8 : undefined}/><button type="button" className="password-toggle" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></span></label>
          {mode === 'register' && <label className="form-field"><span>Confirm password</span><span className="password-input"><input name="confirmPassword" type={showConfirm ? 'text' : 'password'} value={form.confirmPassword} onChange={setField} autoComplete="new-password" placeholder="Enter your password again" required minLength={8}/><button type="button" className="password-toggle" onClick={() => setShowConfirm(!showConfirm)} aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}>{showConfirm ? <EyeOff size={17}/> : <Eye size={17}/>}</button></span></label>}
          {error && <p className="auth-feedback auth-error" role="alert">{error}</p>}{notice && <p className="auth-feedback auth-success" role="status">{notice}</p>}
          <button className="button button-primary auth-submit" type="submit" disabled={submitting || sessionLoading}>{submitting ? <><span className="spinner spinner-light"/> {mode === 'login' ? 'Signing in…' : 'Creating account…'}</> : <>{mode === 'login' ? `Login as ${role === 'passenger' ? 'Passenger' : role === 'driver' ? 'Driver' : 'Admin'}` : `Create ${role} account`} <ArrowRight size={17}/></>}</button>
        </form>
        {mode === 'login' && role !== 'admin' && <div className="google-auth-block"><div className="google-auth-divider"><span>OR</span></div>{googleClientId ? <div className="google-auth-button" ref={googleButtonRef}/> : <p className="google-auth-hint">Add VITE_GOOGLE_CLIENT_ID to enable Google sign-in.</p>}</div>}
        {role !== 'admin' && <p className="auth-switch">{mode === 'login' ? 'New to RideFlow?' : 'Already have an account?'} <Link to={otherPath}>{mode === 'login' ? 'Create an account' : 'Log in'}</Link></p>}
        <p className="auth-secure-note"><ShieldCheck size={14}/> Your account details are protected.</p>
      </div></section>
    </div>
    <div className="auth-footer">© {new Date().getFullYear()} RideFlow <span>Made for the journeys ahead</span></div>
  </main>
}
