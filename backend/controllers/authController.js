import User from '../models/User.js'
import { generateToken, sessionCookieName, sessionCookieOptions } from '../utils/generateToken.js'
import jwt from 'jsonwebtoken'
import { createPublicKey } from 'node:crypto'
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const phonePattern = /^\+?[1-9]\d{7,14}$/
const roles = ['passenger', 'driver']
const loginRoles = ['admin', ...roles]
const vehicleTypes = ['Bike', 'Scooter', 'Auto', 'Mini', 'Sedan', 'SUV', 'Premium', 'Electric', 'Hatchback', 'MUV', 'Van', 'Other']
const fail = (res, status, message) => res.status(status).json({ success: false, message })
let googleCerts = { keys: [], expiresAt: 0 }

async function verifyGoogleCredential(credential) {
  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) throw Object.assign(new Error('Google sign-in is not configured on the server.'), { status: 503 })
  const decoded = jwt.decode(credential, { complete: true })
  if (!decoded || decoded.header.alg !== 'RS256' || !decoded.header.kid) throw Object.assign(new Error('Google credential is invalid.'), { status: 401 })
  if (googleCerts.expiresAt < Date.now() || !googleCerts.keys.some(key => key.kid === decoded.header.kid)) {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/certs', { signal: AbortSignal.timeout(5000) })
    if (!response.ok) throw new Error('Google sign-in verification is temporarily unavailable.')
    const cacheControl = response.headers.get('cache-control') || ''
    const maxAge = Number(cacheControl.match(/max-age=(\d+)/)?.[1] || 300)
    googleCerts = { keys: (await response.json()).keys || [], expiresAt: Date.now() + maxAge * 1000 }
  }
  const jwk = googleCerts.keys.find(key => key.kid === decoded.header.kid)
  if (!jwk) throw Object.assign(new Error('Google credential signing key is not recognized.'), { status: 401 })
  const payload = jwt.verify(credential, createPublicKey({ key: jwk, format: 'jwk' }), {
    algorithms: ['RS256'], audience: clientId, issuer: ['accounts.google.com', 'https://accounts.google.com'],
  })
  if (!payload.email || !payload.sub || !(payload.email_verified === true || payload.email_verified === 'true')) {
    throw Object.assign(new Error('Use a Google account with a verified email address.'), { status: 401 })
  }
  return payload
}

export async function register(req, res, next) {
  try {
    let { name, email, phone, password, role, driverDetails } = req.body ?? {}
    name = typeof name === 'string' ? name.trim() : ''
    email = typeof email === 'string' ? email.trim().toLowerCase() : ''
    phone = typeof phone === 'string' ? phone.replace(/[\s()-]/g, '') : ''
    if (!name || !email || !phone || !password || !role) return fail(res, 400, 'Please complete all required fields.')
    if (name.length < 2 || name.length > 100) return fail(res, 400, 'Name must be between 2 and 100 characters.')
    if (!emailPattern.test(email)) return fail(res, 400, 'Enter a valid email address.')
    if (!phonePattern.test(phone)) return fail(res, 400, 'Enter a valid mobile number with country code if needed.')
    if (typeof password !== 'string' || password.length < 8) return fail(res, 400, 'Password must be at least 8 characters long.')
    if (!roles.includes(role)) return fail(res, 400, 'Choose passenger or driver to continue.')
    if (role === 'driver') {
      const licenseNumber = typeof driverDetails?.licenseNumber === 'string' ? driverDetails.licenseNumber.trim().toUpperCase() : ''
      const vehicle = driverDetails?.vehicle ?? {}
      const vehicleType = vehicleTypes
      const acTypes = ['AC', 'Non-AC']
      if (licenseNumber.length < 5 || licenseNumber.length > 30) return fail(res, 400, 'Enter a valid driving licence number (5–30 characters).')
      if (!vehicleType.includes(vehicle.type)) return fail(res, 400, 'Choose a valid vehicle type.')
      for (const [field, label, maxLength] of [['make', 'Vehicle company/make', 80], ['model', 'Vehicle model', 80], ['color', 'Vehicle colour', 40]]) {
        if (typeof vehicle[field] !== 'string' || !vehicle[field].trim() || vehicle[field].trim().length > maxLength) return fail(res, 400, `Enter a valid ${label.toLowerCase()}.`)
      }
      const year = Number(vehicle.manufacturingYear)
      if (!Number.isInteger(year) || year < 1950 || year > new Date().getFullYear()) return fail(res, 400, 'Enter a valid vehicle manufacturing year.')
      const capacity = Number(vehicle.seatingCapacity)
      if (!Number.isInteger(capacity) || capacity < 1 || capacity > 20) return fail(res, 400, 'Seating capacity must be between 1 and 20.')
      if (!acTypes.includes(vehicle.acType)) return fail(res, 400, 'Choose AC or Non-AC for your vehicle.')
      driverDetails = {
        licenseNumber,
        vehicle: {
          type: vehicle.type,
          make: vehicle.make.trim(),
          model: vehicle.model.trim(),
          color: vehicle.color.trim(),
          manufacturingYear: year,
          seatingCapacity: capacity,
          acType: vehicle.acType,
        },
      }
    } else {
      driverDetails = undefined
    }
    if (await User.exists({ $or: [{ email }, { phone }, ...(driverDetails ? [{ 'driverDetails.licenseNumber': driverDetails.licenseNumber }] : [])] })) {
      return fail(res, 409, driverDetails ? 'An account already exists with that email, mobile number, or driving licence.' : 'An account with that email or mobile number already exists.')
    }
    const user = await User.create({ name, email, phone, password, role, ...(driverDetails ? { driverDetails } : {}) })
    res.cookie(sessionCookieName, generateToken(user), sessionCookieOptions())
    return res.status(201).json({ success: true, message: 'Your RideFlow account is ready.', data: { user: user.toSafeObject() } })
  } catch (error) {
    if (error?.code === 11000) {
      if (error.keyPattern?.['driverDetails.licenseNumber']) return fail(res, 409, 'That driving licence number is already registered.')
      return fail(res, 409, 'An account already exists with that email or mobile number.')
    }
    if (error?.name === 'ValidationError') return fail(res, 400, 'Please check the details you entered.')
    return next(error)
  }
}

export async function login(req, res, next) {
  try {
    const { email, password, role } = req.body ?? {}
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
    if (!normalizedEmail || !password || !role) return fail(res, 400, 'Email, password, and account type are required.')
    if (!loginRoles.includes(role)) return fail(res, 400, 'Choose a valid account type to continue.')
    const user = await User.findOne({ email: normalizedEmail }).select('+password')
    if (!user || !(await user.comparePassword(password))) return fail(res, 401, 'Email or password is incorrect.')
    if (user.role !== role) return fail(res, 403, 'The selected account type does not match. Choose the type used when registering.')
    res.cookie(sessionCookieName, generateToken(user), sessionCookieOptions())
    return res.json({ success: true, message: 'You are signed in.', data: { user: user.toSafeObject() } })
  } catch (error) { return next(error) }
}

export async function googleLogin(req, res, next) {
  try {
    const { credential, role } = req.body ?? {}
    if (typeof credential !== 'string' || credential.length > 10000 || !roles.includes(role)) return fail(res, 400, 'A Google credential and account type are required.')
    const profile = await verifyGoogleCredential(credential)
    const email = profile.email.toLowerCase()
    let user = await User.findOne({ googleId: profile.sub }).select('+googleId')
    if (!user) user = await User.findOne({ email }).select('+googleId')
    if (!user) return fail(res, 404, `No RideFlow ${role} account is registered with this Google email. Create that account first, then use Google sign-in.`)
    if (user.role !== role) return fail(res, 403, `This Google email is registered as a ${user.role}. Choose ${user.role} to continue.`)
    if (user.googleId && user.googleId !== profile.sub) return fail(res, 409, 'This RideFlow account is linked to a different Google account.')
    if (!user.googleId) { user.googleId = profile.sub; await user.save() }
    res.cookie(sessionCookieName, generateToken(user), sessionCookieOptions())
    return res.json({ success: true, message: 'You are signed in with Google.', data: { user: user.toSafeObject() } })
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') return fail(res, 401, 'Google sign-in expired or could not be verified. Please try again.')
    if (error.status) return fail(res, error.status, error.message)
    return next(error)
  }
}
export function me(req, res) { return res.json({ success: true, data: { user: req.user ? req.user.toSafeObject() : null } }) }
export function logout(req, res) {
  const { maxAge, ...options } = sessionCookieOptions()
  res.clearCookie(sessionCookieName, options)
  return res.json({ success: true, message: 'You are signed out.' })
}
