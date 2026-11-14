import { Navigate, Route, Routes } from 'react-router-dom'
import Home from './pages/Home.jsx'
import AuthPage from './pages/AuthPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import PassengerPage from './pages/PassengerPage.jsx'
import DriverDashboard from './pages/DriverDashboard.jsx'
import AdminDashboard from './pages/AdminDashboard.jsx'
import { AuthProvider } from './auth/AuthContext.jsx'
import ProtectedRoute from './auth/ProtectedRoute.jsx'

export default function App() {
  return <AuthProvider><Routes>
    <Route path="/" element={<Home />} />
    <Route path="/admin/login" element={<AuthPage mode="login" fixedRole="admin" />} />
    <Route path="/admin/dashboard" element={<ProtectedRoute role="admin"><AdminDashboard /></ProtectedRoute>} />
    <Route path="/login" element={<AuthPage mode="login" />} />
    <Route path="/register" element={<AuthPage mode="register" />} />
    <Route path="/:role/login" element={<AuthPage mode="login" />} />
    <Route path="/:role/register" element={<AuthPage mode="register" />} />
    <Route path="/passenger/dashboard" element={<ProtectedRoute role="passenger"><PassengerPage /></ProtectedRoute>} />
    <Route path="/driver/dashboard" element={<ProtectedRoute role="driver"><DriverDashboard /></ProtectedRoute>} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></AuthProvider>
}
