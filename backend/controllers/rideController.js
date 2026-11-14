import mongoose from 'mongoose'
import User from '../models/User.js'
import Ride from '../models/Ride.js'
import { getDrivingRoute } from '../services/routingService.js'
import { fareFor, vehicleCategories } from '../utils/pricing.js'
import { distanceKm, validCoordinates } from '../utils/geo.js'
import AllocationLog from '../models/AllocationLog.js'
import RideEvent from '../models/RideEvent.js'
import { recordRideEvent } from '../services/rideAudit.js'
import { publishAdminUpdate } from '../services/adminLiveBus.js'

const fail = (res, status, message) => res.status(status).json({ success: false, message })
const driverSearchRadiusMeters = () => Number(process.env.DRIVER_SEARCH_RADIUS_KM || 10) * 1000
const pickupEstimateSpeedKmh = () => Number(process.env.PICKUP_ESTIMATE_SPEED_KMH || 20)

function driverResult(user, pickup) {
  const [longitude, latitude] = user.driverDetails.location.coordinates
  const distance = distanceKm(pickup.latitude, pickup.longitude, latitude, longitude)
  const detail = user.driverDetails
  const accepted = Number(detail.acceptedCount || 0), rejected = Number(detail.rejectedCount || 0)
  const acceptance = accepted + rejected ? accepted / (accepted + rejected) * 100 : 80
  const idleMinutes = detail.availableSince ? Math.max(0, (Date.now() - detail.availableSince.getTime()) / 60000) : 0
  const assignments = Number(detail.assignmentCount || 0)
  const score = Math.round(Math.max(0, 100 - distance / 10 * 100) * .3 + Math.max(0, 100 - Math.max(2, Math.ceil(distance / pickupEstimateSpeedKmh() * 60)) / 30 * 100) * .2 + Math.min(100, idleMinutes / 30 * 100) * .15 + Math.max(0, 100 - assignments / 30 * 100) * .15 + acceptance * .2)
  return {
    id: user.id,
    name: user.name,
    vehicle: user.driverDetails.vehicle,
    latitude,
    longitude,
    distanceKm: Number(distance.toFixed(1)),
    pickupEtaMinutes: Math.max(2, Math.ceil(distance / pickupEstimateSpeedKmh() * 60)),
    suitabilityScore: score,
    suitabilityReason: `${distance.toFixed(1)} km away · ${Math.max(2, Math.ceil(distance / pickupEstimateSpeedKmh() * 60))} min pickup · ${acceptance.toFixed(0)}% acceptance · ${Math.round(idleMinutes)} min idle · ${assignments} prior assignments`,
    idleMinutes,
    workload: assignments,
    acceptanceRate: Number(acceptance.toFixed(1)),
  }
}

function rideView(ride) {
  const driver = ride.driver && typeof ride.driver === 'object' ? {
    id: ride.driver.id,
    name: ride.driver.name,
    vehicle: ride.driver.driverDetails?.vehicle,
  } : { id: String(ride.driver) }
  return {
    id: ride.id,
    pickup: ride.pickup,
    destination: ride.destination,
    routeDistanceKm: ride.routeDistanceKm,
    estimatedDurationMinutes: ride.estimatedDurationMinutes,
    pickupDistanceKm: ride.pickupDistanceKm,
    pickupEtaMinutes: ride.pickupEtaMinutes,
    estimatedFare: ride.estimatedFare,
    vehicleType: ride.vehicleType || 'Mini',
    currency: ride.currency,
    fareFormula: ride.fareFormula,
    status: ride.status,
    statusHistory: ride.statusHistory,
    createdAt: ride.createdAt,
    driver,
  }
}

export async function nearbyDrivers(req, res, next) {
  try {
    const pickup = { latitude: Number(req.query.lat), longitude: Number(req.query.lng) }
    const vehicleType = typeof req.query.vehicleType === 'string' ? req.query.vehicleType : 'Mini'
    if (!validCoordinates(pickup.latitude, pickup.longitude)) return fail(res, 400, 'Choose a valid pickup location first.')
    if (!vehicleCategories.includes(vehicleType)) return fail(res, 400, 'Choose a supported vehicle category.')
    const freshSince = new Date(Date.now() - 2 * 60 * 1000)
    const users = await User.find({
      role: 'driver',
      'driverDetails.availability': 'available',
      'driverDetails.vehicle.type': vehicleType,
      'driverDetails.locationUpdatedAt': { $gte: freshSince },
      'driverDetails.location': {
        $near: {
          $geometry: { type: 'Point', coordinates: [pickup.longitude, pickup.latitude] },
          $maxDistance: driverSearchRadiusMeters(),
        },
      },
    }).select('name driverDetails.vehicle driverDetails.location driverDetails.availableSince driverDetails.assignmentCount driverDetails.acceptedCount driverDetails.rejectedCount').limit(20)
    const drivers = users.map(user => driverResult(user, pickup))
    return res.json({ success: true, data: { drivers, searchRadiusKm: driverSearchRadiusMeters() / 1000 } })
  } catch (error) { return next(error) }
}

export async function createRide(req, res, next) {
  let claimedDriverId
  let createdRideId
  try {
    const { pickup, destination } = req.body ?? {}
    const vehicleType = req.body?.vehicleType || 'Mini'
    if (!vehicleCategories.includes(vehicleType)) return fail(res, 400, 'Choose a supported vehicle category.')
    if (!pickup?.label || !destination?.label || typeof pickup.label !== 'string' || typeof destination.label !== 'string') {
      return fail(res, 400, 'Choose both pickup and destination locations.')
    }
    const pickupCoords = { latitude: Number(pickup.latitude), longitude: Number(pickup.longitude) }
    const destinationCoords = { latitude: Number(destination.latitude), longitude: Number(destination.longitude) }
    if (!validCoordinates(pickupCoords.latitude, pickupCoords.longitude) || !validCoordinates(destinationCoords.latitude, destinationCoords.longitude)) {
      return fail(res, 400, 'Choose valid pickup and destination locations.')
    }
    if (pickup.label.length > 200 || destination.label.length > 200) return fail(res, 400, 'Location labels must be 200 characters or less.')
    const route = await getDrivingRoute(pickupCoords, destinationCoords)
    const fare = fareFor(route.distanceKm, vehicleType)
    const candidates = await User.find({
      role: 'driver',
      'driverDetails.availability': 'available',
      'driverDetails.vehicle.type': vehicleType,
      'driverDetails.locationUpdatedAt': { $gte: new Date(Date.now() - 2 * 60 * 1000) },
      'driverDetails.location': {
        $near: {
          $geometry: { type: 'Point', coordinates: [pickupCoords.longitude, pickupCoords.latitude] },
          $maxDistance: driverSearchRadiusMeters(),
        },
      },
    }).select('name driverDetails.vehicle driverDetails.location driverDetails.availableSince driverDetails.assignmentCount driverDetails.acceptedCount driverDetails.rejectedCount').limit(20)
    if (!candidates.length) return fail(res, 409, 'No available nearby drivers right now. Try again when a driver is online.')
    candidates.sort((left, right) => driverResult(right, pickupCoords).suitabilityScore - driverResult(left, pickupCoords).suitabilityScore)

    let selectedDriver
    let selectedCandidate
    for (const candidate of candidates) {
      const claimed = await User.findOneAndUpdate(
        { _id: candidate._id, 'driverDetails.availability': 'available' },
        { $set: { 'driverDetails.availability': 'requested' } },
        { new: true },
      )
      if (claimed) {
        selectedDriver = claimed
        selectedCandidate = driverResult(candidate, pickupCoords)
        claimedDriverId = claimed._id
        if (selectedCandidate.idleMinutes > 0) await User.updateOne({ _id: claimed._id }, { $push: { 'driverDetails.idleDurationsMinutes': { $each: [selectedCandidate.idleMinutes], $slice: -100 } } })
        break
      }
    }
    if (!selectedDriver) return fail(res, 409, 'Nearby drivers just became unavailable. Refresh and try again.')

    try {
      const ride = await Ride.create({
        passenger: req.user._id,
        driver: selectedDriver._id,
        pickup: { label: pickup.label.trim(), location: { type: 'Point', coordinates: [pickupCoords.longitude, pickupCoords.latitude] } },
        destination: { label: destination.label.trim(), location: { type: 'Point', coordinates: [destinationCoords.longitude, destinationCoords.latitude] } },
        routeDistanceKm: Number(route.distanceKm.toFixed(1)),
        vehicleType,
        estimatedDurationMinutes: Math.max(1, Math.round(route.durationMinutes)),
        pickupDistanceKm: selectedCandidate.distanceKm,
        pickupEtaMinutes: selectedCandidate.pickupEtaMinutes,
        estimatedFare: fare.amount,
        currency: fare.currency,
        fareFormula: { vehicleType, baseFare: fare.baseFare, ratePerKm: fare.ratePerKm },
        status: 'Requested',
        statusHistory: [{ status: 'Requested' }],
        assignmentHistory: [{ driver: selectedDriver._id, score: selectedCandidate.suitabilityScore, reason: selectedCandidate.suitabilityReason, outcome: 'pending' }],
      })
      createdRideId = ride._id
      await AllocationLog.create({
        ride: ride._id,
        vehicleType,
        selectedDriver: selectedDriver._id,
        outcome: 'assigned',
        candidates: candidates.map((candidate, index) => {
          const ranked = driverResult(candidate, pickupCoords)
          return { driver: candidate._id, rank: index + 1, score: ranked.suitabilityScore, distanceKm: ranked.distanceKm, pickupEtaMinutes: ranked.pickupEtaMinutes, workload: ranked.workload, idleMinutes: ranked.idleMinutes, acceptanceRate: ranked.acceptanceRate, selected: String(candidate._id) === String(selectedDriver._id), reason: ranked.suitabilityReason }
        }),
      })
      await recordRideEvent({ ride: ride._id, eventType: 'requested', status: 'Requested', message: 'Passenger requested a ride.', actor: req.user._id, actorRole: 'passenger', details: { vehicleType } })
      await recordRideEvent({ ride: ride._id, eventType: 'matching_started', status: 'Searching', message: 'Driver matching started for the selected vehicle category.' })
      await recordRideEvent({ ride: ride._id, eventType: 'eligible_drivers_identified', status: 'Searching', message: `${candidates.length} eligible driver(s) were identified.`, details: { eligibleCount: candidates.length, vehicleType } })
      await recordRideEvent({ ride: ride._id, eventType: 'driver_ranking_generated', status: 'Searching', message: 'Eligible drivers were ranked using distance, pickup ETA, idle time, workload and acceptance performance.' })
      await recordRideEvent({ ride: ride._id, eventType: 'driver_assigned', status: 'Requested', message: `${selectedDriver.name} was assigned to the ride.`, details: { driverId: selectedDriver._id, score: selectedCandidate.suitabilityScore, reason: selectedCandidate.suitabilityReason } })
      await User.updateOne({ _id: selectedDriver._id }, { $inc: { 'driverDetails.assignmentCount': 1 }, $unset: { 'driverDetails.availableSince': 1 } })
      publishAdminUpdate('driver-availability', ride._id)
      const populated = await Ride.findById(ride._id).populate('driver', 'name driverDetails.vehicle')
      return res.status(201).json({ success: true, message: 'Ride request sent to a nearby driver.', data: { ride: rideView(populated) } })
    } catch (error) {
      if (createdRideId) {
        await Promise.allSettled([Ride.deleteOne({ _id: createdRideId }), AllocationLog.deleteMany({ ride: createdRideId }), RideEvent.deleteMany({ ride: createdRideId })])
      }
      await User.updateOne({ _id: claimedDriverId, 'driverDetails.availability': 'requested' }, { $set: { 'driverDetails.availability': 'available' } })
      claimedDriverId = null
      throw error
    }
  } catch (error) {
    if (error instanceof mongoose.Error.ValidationError) return fail(res, 400, 'Ride details are invalid. Check the selected locations and try again.')
    return next(error)
  }
}

export async function rideHistory(req, res, next) {
  try {
    const rides = await Ride.find({ passenger: req.user._id }).sort({ createdAt: -1 }).limit(50).populate('driver', 'name driverDetails.vehicle')
    return res.json({ success: true, data: { rides: rides.map(rideView) } })
  } catch (error) { return next(error) }
}

export async function rideById(req, res, next) {
  try {
    const ride = await Ride.findOne({ _id: req.params.rideId, passenger: req.user._id }).populate('driver', 'name driverDetails.vehicle')
    if (!ride) return fail(res, 404, 'Ride not found.')
    return res.json({ success: true, data: { ride: rideView(ride) } })
  } catch (error) { return next(error) }
}
