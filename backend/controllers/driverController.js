import mongoose from 'mongoose'
import User from '../models/User.js'
import Ride from '../models/Ride.js'
import { distanceKm, validCoordinates } from '../utils/geo.js'
import AllocationLog from '../models/AllocationLog.js'
import { recordRideEvent } from '../services/rideAudit.js'
import { publishAdminUpdate } from '../services/adminLiveBus.js'

const fail = (res, status, message) => res.status(status).json({ success: false, message })
const kmph = () => Number(process.env.PICKUP_ESTIMATE_SPEED_KMH || 20)
let reassignmentInProgress = false
const rideView = ride => ({
  id: ride.id, status: ride.status, pickup: ride.pickup, destination: ride.destination,
  vehicleType: ride.vehicleType || 'Mini',
  routeDistanceKm: ride.routeDistanceKm, estimatedDurationMinutes: ride.estimatedDurationMinutes,
  pickupDistanceKm: ride.pickupDistanceKm, pickupEtaMinutes: ride.pickupEtaMinutes,
  estimatedFare: ride.estimatedFare, createdAt: ride.createdAt, acceptedAt: ride.acceptedAt,
  pickupDeadlineAt: ride.pickupDeadlineAt, statusHistory: ride.statusHistory,
  passenger: ride.passenger && typeof ride.passenger === 'object' ? { id: ride.passenger.id, name: ride.passenger.name, phone: ride.passenger.phone } : undefined,
  driver: ride.driver && typeof ride.driver === 'object' ? { id: ride.driver.id, name: ride.driver.name } : undefined,
  assignmentHistory: ride.assignmentHistory,
})

async function reassignExpired(ride) {
  const oldDriverId = ride.driver?._id || ride.driver
  const lastAttempt = ride.assignmentHistory.at(-1)
  const cause = lastAttempt?.outcome === 'rejected' ? 'Driver rejected the request.' : 'Driver response or pickup deadline was missed.'
  await recordRideEvent({ ride: ride._id, eventType: 'reassignment_triggered', status: ride.status, message: `Automatic reassignment started. ${cause}`, details: { originalDriverId: oldDriverId, reason: cause } })
  const oldDriver = await User.findById(oldDriverId)
  if (oldDriver && ['requested', 'busy'].includes(oldDriver.driverDetails?.availability)) {
    oldDriver.driverDetails.availability = oldDriver.driverDetails.location ? 'available' : 'offline'
    oldDriver.driverDetails.availableSince = oldDriver.driverDetails.availability === 'available' ? new Date() : undefined
    await oldDriver.save()
  }
  const [lng, lat] = ride.pickup.location.coordinates
  const triedDrivers = [...new Set([oldDriverId, ...ride.assignmentHistory.map(item => item.driver)].filter(Boolean).map(id => String(id)))].map(id => new mongoose.Types.ObjectId(id))
  const candidates = await User.find({ role: 'driver', _id: { $nin: triedDrivers }, 'driverDetails.availability': 'available', 'driverDetails.vehicle.type': ride.vehicleType || 'Mini', 'driverDetails.locationUpdatedAt': { $gte: new Date(Date.now() - 120000) }, 'driverDetails.location': { $near: { $geometry: { type: 'Point', coordinates: [lng, lat] }, $maxDistance: 10000 } } }).limit(12)
  for (const candidate of candidates) {
    const coords = candidate.driverDetails.location.coordinates
    const km = distanceKm(lat, lng, coords[1], coords[0])
    const eta = Math.max(2, Math.ceil(km / kmph() * 60))
    const claimed = await User.findOneAndUpdate({ _id: candidate._id, 'driverDetails.availability': 'available' }, { $set: { 'driverDetails.availability': 'requested' }, $unset: { 'driverDetails.availableSince': 1 }, $inc: { 'driverDetails.assignmentCount': 1 } }, { new: true })
    if (!claimed) continue
    ride.assignmentHistory.push({ driver: candidate._id, score: Math.max(0, 100 - km * 5), reason: `${km.toFixed(1)} km away, approximately ${eta} min pickup; driver is available.`, outcome: 'pending' })
    ride.driver = candidate._id
    ride.pickupDistanceKm = Number(km.toFixed(1))
    ride.pickupEtaMinutes = eta
    ride.statusHistory.push({ status: 'Requested', at: new Date() })
    ride.createdAt = new Date()
    ride.acceptedAt = undefined
    ride.pickupDeadlineAt = undefined
    await ride.save()
    await AllocationLog.create({ ride: ride._id, vehicleType: ride.vehicleType || 'Mini', selectedDriver: candidate._id, outcome: 'reassigned', candidates: [{ driver: candidate._id, rank: 1, score: Math.max(0, 100 - km * 5), distanceKm: Number(km.toFixed(1)), pickupEtaMinutes: eta, workload: Number(candidate.driverDetails.assignmentCount || 0), idleMinutes: candidate.driverDetails.availableSince ? Math.max(0, (Date.now() - candidate.driverDetails.availableSince.getTime()) / 60000) : 0, acceptanceRate: (Number(candidate.driverDetails.acceptedCount || 0) + Number(candidate.driverDetails.rejectedCount || 0)) ? Number(candidate.driverDetails.acceptedCount || 0) / (Number(candidate.driverDetails.acceptedCount || 0) + Number(candidate.driverDetails.rejectedCount || 0)) * 100 : 80, selected: true, reason: `${km.toFixed(1)} km away, approximately ${eta} min pickup; driver is available.` }] })
    await recordRideEvent({ ride: ride._id, eventType: 'reassigned', status: 'Requested', message: `Ride reassigned to ${candidate.name}.`, details: { originalDriverId: oldDriverId, nextDriverId: candidate._id, attempt: ride.assignmentHistory.length } })
    publishAdminUpdate('ride-reassigned', ride._id)
    return true
  }
  ride.status = 'Cancelled'
  ride.statusHistory.push({ status: 'Cancelled', at: new Date() })
  await ride.save()
  await recordRideEvent({ ride: ride._id, eventType: 'reassignment_failed', status: 'Cancelled', message: 'No eligible replacement driver was available; ride was cancelled.', details: { originalDriverId: oldDriverId } })
  publishAdminUpdate('ride-cancelled', ride._id)
  return false
}

export async function processExpiredAssignments() {
  if (reassignmentInProgress) return
  reassignmentInProgress = true
  try {
    const now = new Date()
    const [expired, delayed] = await Promise.all([
      Ride.find({ status: 'Requested', createdAt: { $lte: new Date(now.getTime() - 30000) } }).limit(50),
      Ride.find({ status: { $in: ['Accepted', 'Arriving'] }, pickupDeadlineAt: { $lte: now } }).limit(50),
    ])
    for (const ride of [...expired, ...delayed]) {
      const assignment = ride.assignmentHistory.at(-1)
      if (assignment) assignment.outcome = 'timeout'
      await reassignExpired(ride)
    }
  } finally { reassignmentInProgress = false }
}

export async function dashboard(req, res, next) {
  try {
    const fromDay = new Date(); fromDay.setHours(0, 0, 0, 0)
    const [rides, history, currentUser, zoneRides, availableDrivers, counts, todayTotals] = await Promise.all([
      Ride.find({ driver: req.user._id, status: 'Requested' }).sort({ createdAt: -1 }).populate('passenger', 'name phone').limit(10),
      Ride.find({ driver: req.user._id }).sort({ createdAt: -1 }).populate('passenger', 'name phone').limit(50),
      User.findById(req.user._id).select('-password'),
      Ride.find({ createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }).select('pickup destination status createdAt').limit(1000),
      User.find({ role: 'driver', 'driverDetails.availability': 'available', 'driverDetails.locationUpdatedAt': { $gte: new Date(Date.now() - 120000) } }).select('driverDetails.location'),
      Ride.aggregate([{ $match: { driver: req.user._id } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Ride.aggregate([{ $match: { driver: req.user._id, status: 'Completed', $or: [{ completedAt: { $gte: fromDay } }, { completedAt: { $exists: false }, updatedAt: { $gte: fromDay } }] } }, { $group: { _id: null, total: { $sum: '$estimatedFare' } } }]),
    ])
    const activeRide = history.find(r => ['Accepted', 'Arriving', 'Ongoing'].includes(r.status))
    const byStatus = Object.fromEntries(counts.map(item => [item._id, item.count]))
    const completedCount = byStatus.Completed || 0
    const cancelled = (byStatus.Cancelled || 0) + (byStatus.Rejected || 0)
    const detail = currentUser.driverDetails
    const responseUser = currentUser.toSafeObject()
    responseUser.driverDetails = { ...detail.toObject(), location: detail.location?.toObject?.() || detail.location }
    const coordinates = detail.location?.coordinates
    const zoneOffsets = [[0, 0], [0.014, 0.014], [-0.014, 0.014], [0.014, -0.014]]
    const zones = (coordinates ? zoneOffsets.map(([latOffset, lngOffset], index) => ({ id: `zone-${index + 1}`, name: `Nearby Zone ${index + 1}`, latitude: coordinates[1] + latOffset, longitude: coordinates[0] + lngOffset })) : []).map(zone => {
      const nearby = zoneRides.filter(r => distanceKm(zone.latitude, zone.longitude, r.pickup.location.coordinates[1], r.pickup.location.coordinates[0]) < 2)
      const supply = availableDrivers.filter(driver => {
        const coords = driver.driverDetails.location?.coordinates
        return coords && distanceKm(zone.latitude, zone.longitude, coords[1], coords[0]) < 2
      }).length
      const hourly = [0, 1, 2].map(offset => zoneRides.filter(r => {
        const age = (Date.now() - new Date(r.createdAt).getTime()) / 3600000
        return age >= offset && age < offset + 1 && distanceKm(zone.latitude, zone.longitude, r.pickup.location.coordinates[1], r.pickup.location.coordinates[0]) < 2
      }).length)
      const predictedCount = Math.round(hourly.reduce((sum, count) => sum + count, 0) / Math.max(hourly.length, 1))
      const demand = nearby.length >= 5 || nearby.length > supply * 2 ? 'High' : nearby.length >= 2 ? 'Moderate' : 'Low'
      const predicted = zoneRides.length >= 3 ? predictedCount >= Math.max(2, supply) ? 'High' : predictedCount ? 'Moderate' : 'Low' : 'Insufficient data'
      return { ...zone, requests: nearby.length, activeRides: nearby.filter(r => ['Accepted', 'Arriving', 'Ongoing'].includes(r.status)).length, demand, availableDrivers: supply, predicted, predictedRequestsNextHour: predictedCount }
    })
    const accepted = Number(detail.acceptedCount || 0), rejected = Number(detail.rejectedCount || 0)
    const idleSamples = [...(detail.idleDurationsMinutes || [])]
    if (detail.availableSince) idleSamples.push((Date.now() - detail.availableSince.getTime()) / 60000)
    const averageIdleMinutes = idleSamples.length ? Math.round(idleSamples.reduce((sum, value) => sum + value, 0) / idleSamples.length) : 0
    return res.json({ success: true, data: {
      user: responseUser, requests: rides.map(rideView), activeRide: activeRide ? rideView(activeRide) : null,
      history: history.map(rideView), zones,
      metrics: { todayEarnings: todayTotals[0]?.total || 0, completedRides: completedCount, activeRides: (byStatus.Accepted || 0) + (byStatus.Arriving || 0) + (byStatus.Ongoing || 0), cancelledRides: cancelled, acceptanceRate: accepted + rejected ? Math.round(accepted / (accepted + rejected) * 100) : 0, averageIdleMinutes, assignmentCount: detail.assignmentCount || 0, acceptedCount: accepted, rejectedCount: rejected },
    } })
  } catch (error) { return next(error) }
}

export async function setAvailability(req, res, next) {
  try {
    const online = req.body?.online
    if (typeof online !== 'boolean') return fail(res, 400, 'Choose online or offline.')
    const detail = req.user.driverDetails
    if (['requested', 'busy'].includes(detail.availability)) return fail(res, 409, 'Availability is managed while you have an assigned ride.')
    if (online && (!detail.location || !detail.locationUpdatedAt || Date.now() - detail.locationUpdatedAt.getTime() > 120000)) return fail(res, 400, 'Share a fresh location before going online.')
    if (!online && detail.availableSince) {
      detail.idleDurationsMinutes.push((Date.now() - detail.availableSince.getTime()) / 60000)
      if (detail.idleDurationsMinutes.length > 100) detail.idleDurationsMinutes.splice(0, detail.idleDurationsMinutes.length - 100)
    }
    detail.availability = online ? 'available' : 'offline'
    detail.availableSince = online ? new Date() : undefined
    await req.user.save()
    publishAdminUpdate('driver-availability')
    return res.json({ success: true, data: { availability: detail.availability } })
  } catch (error) { return next(error) }
}

export async function updateLocation(req, res, next) {
  try {
    const lat = Number(req.body?.latitude), lng = Number(req.body?.longitude)
    if (!validCoordinates(lat, lng)) return fail(res, 400, 'A valid GPS location is required.')
    req.user.driverDetails.location = { type: 'Point', coordinates: [lng, lat] }
    req.user.driverDetails.locationUpdatedAt = new Date()
    await req.user.save()
    publishAdminUpdate('driver-location')
    return res.json({ success: true, data: { latitude: lat, longitude: lng, updatedAt: req.user.driverDetails.locationUpdatedAt } })
  } catch (error) { return next(error) }
}

export async function decideRide(req, res, next, action) {
  try {
    if (!mongoose.isValidObjectId(req.params.rideId)) return fail(res, 400, 'Invalid ride request.')
    const ride = await Ride.findOne({ _id: req.params.rideId, driver: req.user._id, status: 'Requested' }).populate('passenger', 'name phone')
    if (!ride) return fail(res, 404, 'This ride request is no longer available.')
    const latest = ride.assignmentHistory.at(-1)
    if (latest) latest.outcome = action === 'accept' ? 'accepted' : 'rejected'
    if (action === 'accept') {
      ride.status = 'Accepted'; ride.acceptedAt = new Date(); ride.pickupDeadlineAt = new Date(Date.now() + Math.max(5, ride.pickupEtaMinutes + 5) * 60000)
      ride.statusHistory.push({ status: 'Accepted', at: new Date() })
      req.user.driverDetails.acceptedCount = Number(req.user.driverDetails.acceptedCount || 0) + 1
      req.user.driverDetails.availability = 'busy'
    } else {
      ride.status = 'Rejected'; ride.statusHistory.push({ status: 'Rejected', at: new Date() })
      req.user.driverDetails.rejectedCount = Number(req.user.driverDetails.rejectedCount || 0) + 1
      req.user.driverDetails.availability = req.user.driverDetails.location ? 'available' : 'offline'
      req.user.driverDetails.availableSince = req.user.driverDetails.availability === 'available' ? new Date() : undefined
    }
    await Promise.all([ride.save(), req.user.save()])
    await recordRideEvent({ ride: ride._id, eventType: action === 'accept' ? 'driver_accepted' : 'driver_rejected', status: ride.status, message: action === 'accept' ? 'Driver accepted the ride request.' : 'Driver rejected the ride request.', actor: req.user._id, actorRole: 'driver', details: { driverId: req.user._id } })
    publishAdminUpdate('ride-status', ride._id)
    if (action === 'reject') await reassignExpired(ride)
    const latestRide = await Ride.findById(ride._id).populate('passenger', 'name phone')
    return res.json({ success: true, data: { ride: rideView(latestRide) } })
  } catch (error) { return next(error) }
}

export async function updateRideStatus(req, res, next) {
  try {
    const { status } = req.body || {}
    const allowed = { Accepted: ['Arriving', 'Cancelled'], Arriving: ['Ongoing', 'Cancelled'], Ongoing: ['Completed', 'Cancelled'] }
    const ride = await Ride.findOne({ _id: req.params.rideId, driver: req.user._id, status: { $in: Object.keys(allowed) } }).populate('passenger', 'name phone')
    if (!ride) return fail(res, 404, 'Active ride not found.')
    if (!allowed[ride.status].includes(status)) return fail(res, 400, 'That ride status change is not allowed.')
    ride.status = status; ride.statusHistory.push({ status, at: new Date() })
    if (status === 'Completed') ride.completedAt = new Date()
    if (status === 'Cancelled' || status === 'Completed') {
      req.user.driverDetails.availability = req.user.driverDetails.location ? 'available' : 'offline'
      req.user.driverDetails.availableSince = req.user.driverDetails.availability === 'available' ? new Date() : undefined
    }
    await Promise.all([ride.save(), req.user.save()])
    await recordRideEvent({ ride: ride._id, eventType: status.toLowerCase(), status, message: `Ride status changed to ${status}.`, actor: req.user._id, actorRole: 'driver' })
    publishAdminUpdate('ride-status', ride._id)
    return res.json({ success: true, data: { ride: rideView(ride), availability: req.user.driverDetails.availability } })
  } catch (error) { return next(error) }
}

export async function updateProfile(req, res, next) {
  try {
    const { name, phone, registrationNumber } = req.body || {}
    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) return fail(res, 400, 'Enter a valid name.')
    if (typeof phone !== 'string' || !/^\+?[1-9]\d{7,14}$/.test(phone.replace(/[\s()-]/g, ''))) return fail(res, 400, 'Enter a valid phone number.')
    const normalizedPhone = phone.replace(/[\s()-]/g, '')
    if (await User.exists({ phone: normalizedPhone, _id: { $ne: req.user._id } })) return fail(res, 409, 'That phone number is already in use.')
    const normalizedRegistration = typeof registrationNumber === 'string' ? registrationNumber.trim().toUpperCase() : ''
    if (normalizedRegistration && await User.exists({ 'driverDetails.vehicle.registrationNumber': normalizedRegistration, _id: { $ne: req.user._id } })) return fail(res, 409, 'That vehicle registration number is already registered.')
    req.user.name = name.trim(); req.user.phone = normalizedPhone
    if (typeof registrationNumber === 'string') req.user.driverDetails.vehicle.registrationNumber = normalizedRegistration
    await req.user.save()
    return res.json({ success: true, data: { user: req.user.toSafeObject() } })
  } catch (error) { return next(error) }
}
