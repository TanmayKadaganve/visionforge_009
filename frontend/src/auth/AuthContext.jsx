import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { apiUrl } from '../lib/apiUrl.js'

const AuthContext = createContext(null)
async function request(path, options = {}) {
  const response = await fetch(apiUrl(`/api/auth/${path}`), {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  })
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('RideFlow API is unavailable. Start MongoDB and the backend, then try again.')
  }
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.message || 'Something went wrong. Please try again.')
  return result
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true
    request('me').then(result => { if (active) setUser(result.data.user) })
      .catch(() => { if (active) setUser(null) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  const login = useCallback(async credentials => {
    const result = await request('login', { method: 'POST', body: JSON.stringify(credentials) })
    setUser(result.data.user)
    return result.data.user
  }, [])
  const googleLogin = useCallback(async (credential, role) => {
    const result = await request('google', { method: 'POST', body: JSON.stringify({ credential, role }) })
    setUser(result.data.user)
    return result.data.user
  }, [])
  const register = useCallback(async details => {
    const result = await request('register', { method: 'POST', body: JSON.stringify(details) })
    setUser(result.data.user)
    return result.data.user
  }, [])
  const logout = useCallback(async () => {
    try { await request('logout', { method: 'POST' }) } finally { setUser(null) }
  }, [])
  const value = useMemo(() => ({ user, loading, login, googleLogin, register, logout }), [user, loading, login, googleLogin, register, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
