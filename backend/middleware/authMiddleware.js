import jwt from 'jsonwebtoken'
import User from '../models/User.js'
import { sessionCookieName } from '../utils/generateToken.js'

export async function optionalAuth(req, res, next) {
  const token = req.cookies?.[sessionCookieName]
  if (!token) {
    req.user = null
    return next()
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    const user = await User.findById(payload.sub)
    if (!user || user.role !== payload.role) {
      return res.status(401).json({ success: false, message: 'Your session is no longer valid. Please log in again.' })
    }
    req.user = user
    return next()
  } catch {
    return res.status(401).json({ success: false, message: 'Your session is invalid or has expired. Please log in again.' })
  }
}

export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.[sessionCookieName]
    if (!token) return res.status(401).json({ success: false, message: 'Please log in to continue.' })
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    const user = await User.findById(payload.sub)
    if (!user || user.role !== payload.role) return res.status(401).json({ success: false, message: 'Your session is no longer valid. Please log in again.' })
    req.user = user
    return next()
  } catch { return res.status(401).json({ success: false, message: 'Your session is invalid or has expired. Please log in again.' }) }
}
