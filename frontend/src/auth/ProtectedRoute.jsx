import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'

export default function ProtectedRoute({ role, children }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div className="auth-loading-page"><span className="spinner"/> Restoring your RideFlow session…</div>
  if (!user) return <Navigate to={`/${role}/login`} replace state={{ from: location.pathname }} />
  if (user.role !== role) return <Navigate to={`/${user.role}/dashboard`} replace />
  return children
}
