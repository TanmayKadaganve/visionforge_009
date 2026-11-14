import jwt from 'jsonwebtoken'
export const sessionCookieName = 'rideflow_session'
export const generateToken = user => jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' })
export const sessionCookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: process.env.COOKIE_SAME_SITE || (process.env.NODE_ENV === 'production' ? 'none' : 'lax'), path: '/', maxAge: 7 * 24 * 60 * 60 * 1000 })
