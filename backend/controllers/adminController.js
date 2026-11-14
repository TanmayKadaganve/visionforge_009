import mongoose from 'mongoose'
import User from '../models/User.js'
import Ride from '../models/Ride.js'
import RideEvent from '../models/RideEvent.js'
import AllocationLog from '../models/AllocationLog.js'
import { adminLiveBus } from '../services/adminLiveBus.js'
import { distanceKm } from '../utils/geo.js'

const fail = (res, status, message) => res.status(status).json({ success: false, message })
const activeStatuses = ['Accepted', 'Arriving', 'Ongoing']
const terminalCancelled = ['Cancelled', 'Rejected', 'Failed']

function requestedRange(query) {
  const end = query.to ? new Date(`${query.to}T23:59:59.999Z`) : new Date()
  const start = query.from ? new Date(`${query.from}T00:00:00.000Z`) : new Date(end.getTime() - 6 * 86400000)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return null
  return { start, end }
}

function cell(latitude, longitude) {
  const latCell = Math.floor(latitude * 10) / 10
  const lngCell = Math.floor(longitude * 10) / 10
  return { id: `${latCell.toFixed(1)},${lngCell.toFixed(1)}`, latitude: latCell + 0.05, longitude: lngCell + 0.05 }
}

export async function overview(req, res, next) {
  try {
    const range = requestedRange(req.query)
    if (!range) return fail(res, 400, 'Choose a valid date range.')
    const recentSince = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const freshSince = new Date(Date.now() - 120000)
    const [passengerCount, driverCount, onlineDrivers, statusGroups, rideCount, waitAverage, etaAverage, dailyRows, vehicleRows, locationDrivers, recentRides, allocationGroups, reassignmentRides] = await Promise.all([
      User.countDocuments({ role: 'passenger' }),
      User.countDocuments({ role: 'driver' }),
      User.find({ role: 'driver', 'driverDetails.availability': { $in: ['available', 'requested', 'busy'] }, 'driverDetails.locationUpdatedAt': { $gte: freshSince } }).select('name driverDetails.availability driverDetails.location driverDetails.locationUpdatedAt driverDetails.vehicle'),
      Ride.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Ride.countDocuments({ createdAt: { $gte: range.start, $lte: range.end } }),
      Ride.aggregate([{ $match: { acceptedAt: { $exists: true, $ne: null }, createdAt: { $gte: range.start, $lte: range.end } } }, { $project: { wait: { $divide: [{ $subtract: ['$acceptedAt', '$createdAt'] }, 60000] } } }, { $group: { _id: null, average: { $avg: '$wait' } } }]),
      Ride.aggregate([{ $match: { createdAt: { $gte: range.start, $lte: range.end }, pickupEtaMinutes: { $gt: 0 } } }, { $group: { _id: null, average: { $avg: '$pickupEtaMinutes' } } }]),
      Ride.aggregate([{ $match: { createdAt: { $gte: range.start, $lte: range.end } } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, requested: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } }, waitSum: { $sum: { $cond: [{ $and: [{ $ne: ['$acceptedAt', null] }, { $ne: [{ $type: '$acceptedAt' }, 'missing'] }] }, { $divide: [{ $subtract: ['$acceptedAt', '$createdAt'] }, 60000] }, 0] } }, waitCount: { $sum: { $cond: [{ $and: [{ $ne: ['$acceptedAt', null] }, { $ne: [{ $type: '$acceptedAt' }, 'missing'] }] }, 1, 0] } }, drivers: { $addToSet: '$driver' } } }, { $sort: { _id: 1 } }]),
      Ride.aggregate([{ $match: { createdAt: { $gte: range.start, $lte: range.end } } }, { $group: { _id: { $ifNull: ['$vehicleType', 'Unknown'] }, rides: { $sum: 1 } } }, { $sort: { rides: -1 } }]),
      User.find({ role: 'driver', 'driverDetails.locationUpdatedAt': { $gte: freshSince }, 'driverDetails.location.coordinates.0': { $exists: true } }).select('driverDetails.location driverDetails.availability'),
      Ride.find({ createdAt: { $gte: recentSince } }).select('pickup status createdAt vehicleType').limit(5000),
      Ride.aggregate([{ $unwind: '$assignmentHistory' }, { $group: { _id: '$assignmentHistory.driver', assignments: { $sum: 1 }, accepted: { $sum: { $cond: [{ $eq: ['$assignmentHistory.outcome', 'accepted'] }, 1, 0] } }, rejected: { $sum: { $cond: [{ $eq: ['$assignmentHistory.outcome', 'rejected'] }, 1, 0] } } } }]),
      Ride.find({ 'assignmentHistory.1': { $exists: true } }).sort({ updatedAt: -1 }).limit(20).populate('passenger', 'name').populate('assignmentHistory.driver', 'name'),
    ])
    const statuses = Object.fromEntries(statusGroups.map(entry => [entry._id, entry.count]))
    const onlineCount = onlineDrivers.length
    const busyCount = onlineDrivers.filter(driver => ['requested', 'busy'].includes(driver.driverDetails.availability)).length
    const activeRides = await Ride.find({ status: { $in: activeStatuses } }).sort({ updatedAt: -1 }).limit(100).populate('passenger', 'name phone').populate('driver', 'name phone driverDetails.vehicle driverDetails.availability')
    const outstanding = await Ride.find({ status: 'Requested' }).sort({ createdAt: -1 }).limit(100).populate('passenger', 'name phone').populate('driver', 'name driverDetails.vehicle')
    const zones = new Map()
    const getZone = (lat, lng) => {
      const grid = cell(lat, lng)
      if (!zones.has(grid.id)) zones.set(grid.id, { ...grid, requestCount: 0, activeRides: 0, availableDrivers: 0, hourCounts: [0, 0, 0] })
      return zones.get(grid.id)
    }
    for (const ride of recentRides) {
      const [lng, lat] = ride.pickup.location.coordinates
      const zone = getZone(lat, lng)
      zone.requestCount++
      if (activeStatuses.includes(ride.status)) zone.activeRides++
      const ageHours = (Date.now() - ride.createdAt.getTime()) / 3600000
      if (ageHours >= 0 && ageHours < 3) zone.hourCounts[Math.floor(ageHours)]++
    }
    for (const driver of locationDrivers) {
      const [lng, lat] = driver.driverDetails.location.coordinates
      if (['available', 'requested', 'busy'].includes(driver.driverDetails.availability)) getZone(lat, lng).availableDrivers++
    }
    const zoneRows = [...zones.values()].map(zone => {
      const forecastSamples = zone.hourCounts
      const predicted = forecastSamples.reduce((sum, value) => sum + value, 0) >= 3 ? Number((forecastSamples.reduce((sum, value) => sum + value, 0) / 3).toFixed(1)) : null
      const demand = zone.requestCount >= 6 || zone.requestCount > zone.availableDrivers * 2 ? 'High' : zone.requestCount >= 2 ? 'Moderate' : 'Low'
      const shortage = Math.max(0, zone.requestCount - zone.availableDrivers)
      return { ...zone, predictedDemandNextHour: predicted, demand, shortage, repositionRecommendation: shortage > 0 ? 'Consider sending an idle driver to this zone.' : 'Supply currently covers observed requests.', simulatedSurgeMultiplier: shortage > 0 ? Number(Math.min(2, 1 + shortage / Math.max(zone.requestCount, 1) * 0.5).toFixed(2)) : 1 }
    }).sort((a, b) => b.requestCount - a.requestCount).slice(0, 20)
    const daily = dailyRows.map(row => ({ date: row._id, requests: row.requested, completed: row.completed, averageWaitingMinutes: row.waitCount ? Number((row.waitSum / row.waitCount).toFixed(1)) : null, utilizationRate: driverCount ? Number((new Set(row.drivers).size / driverCount * 100).toFixed(1)) : 0 }))
    const forecast = daily.map((row, index) => ({ ...row, predictedRequests: index >= 3 ? Number((daily.slice(index - 3, index).reduce((sum, previous) => sum + previous.requests, 0) / 3).toFixed(1)) : null, forecastMethod: 'Three-day moving average' }))
    const driverStats = allocationGroups.map(item => ({ driverId: String(item._id), assignments: item.assignments, accepted: item.accepted, rejected: item.rejected, acceptanceRate: item.accepted + item.rejected ? Number((item.accepted / (item.accepted + item.rejected) * 100).toFixed(1)) : null }))
    const driverIds = driverStats.map(item => new mongoose.Types.ObjectId(item.driverId))
    const driverNames = driverIds.length ? await User.find({ _id: { $in: driverIds } }).select('name driverDetails.availability driverDetails.idleDurationsMinutes driverDetails.availableSince driverDetails.location') : []
    const driverNameById = new Map(driverNames.map(driver => [String(driver._id), driver]))
    const fairness = driverStats.map(stat => {
      const driver = driverNameById.get(stat.driverId)
      const idle = driver?.driverDetails?.idleDurationsMinutes || []
      return { ...stat, name: driver?.name || 'Driver', availability: driver?.driverDetails?.availability || 'offline', averageIdleMinutes: idle.length ? Math.round(idle.reduce((a, b) => a + b, 0) / idle.length) : null }
    }).sort((a, b) => b.assignments - a.assignments)
    const reassignment = reassignmentRides.map(ride => ({ rideId: String(ride._id), status: ride.status, attempts: ride.assignmentHistory.length, passenger: ride.passenger?.name || 'Passenger', assignments: ride.assignmentHistory.map(entry => ({ name: entry.driver?.name || 'Driver', outcome: entry.outcome, at: entry.assignedAt, score: entry.score, reason: entry.reason })), updatedAt: ride.updatedAt }))
    const allocationLogs = await AllocationLog.find().sort({ createdAt: -1 }).limit(30).populate('selectedDriver', 'name').populate('candidates.driver', 'name')
    return res.json({ success: true, data: {
      generatedAt: new Date(),
      range: { from: range.start, to: range.end },
      metrics: { totalPassengers: passengerCount, totalDrivers: driverCount, onlineDrivers: onlineCount, totalRideRequests: rideCount, completedRides: statuses.Completed || 0, cancelledRides: (statuses.Cancelled || 0) + (statuses.Rejected || 0) + (statuses.Failed || 0), ongoingRides: statuses.Ongoing || 0, activeRides: activeRides.length, averagePassengerWaitingMinutes: waitAverage[0]?.average == null ? null : Number(waitAverage[0].average.toFixed(1)), averageDriverPickupEtaMinutes: etaAverage[0]?.average == null ? null : Number(etaAverage[0].average.toFixed(1)), driverUtilizationRate: onlineCount ? Number((busyCount / onlineCount * 100).toFixed(1)) : 0, unassignedRideRequests: await Ride.countDocuments({ status: 'Requested', $or: [{ driver: { $exists: false } }, { driver: null }] }) },
      drivers: onlineDrivers.map(driver => ({ id: String(driver._id), name: driver.name, availability: driver.driverDetails.availability, vehicleType: driver.driverDetails.vehicle?.type, location: driver.driverDetails.location ? { latitude: driver.driverDetails.location.coordinates[1], longitude: driver.driverDetails.location.coordinates[0] } : null, locationUpdatedAt: driver.driverDetails.locationUpdatedAt })),
      activeRides: activeRides.map(rideRow), requests: outstanding.map(rideRow), charts: { daily: forecast, vehicleDemand: vehicleRows.map(row => ({ category: row._id, rides: row.rides })) },
      zones: zoneRows, fairness, reassignments: reassignment, allocations: allocationLogs.map(log => ({ id: String(log._id), rideId: String(log.ride), createdAt: log.createdAt, vehicleType: log.vehicleType, outcome: log.outcome, selectedDriver: log.selectedDriver?.name || 'Unassigned', candidates: log.candidates.map(candidate => ({ name: candidate.driver?.name || 'Driver', rank: candidate.rank, score: candidate.score, distanceKm: candidate.distanceKm, pickupEtaMinutes: candidate.pickupEtaMinutes, workload: candidate.workload, idleMinutes: candidate.idleMinutes, acceptanceRate: candidate.acceptanceRate, selected: candidate.selected, reason: candidate.reason })) })), pooling: { implemented: false, activeGroups: 0, rides: [], note: 'Ride pooling has no persisted match groups yet.' },
    } })
  } catch (error) { return next(error) }
}

function rideRow(ride) {
  return { id: String(ride._id), status: ride.status, vehicleType: ride.vehicleType || 'Unknown', pickup: ride.pickup?.label, pickupLocation: ride.pickup?.location?.coordinates, destination: ride.destination?.label, destinationLocation: ride.destination?.location?.coordinates, pickupEtaMinutes: ride.pickupEtaMinutes, routeDistanceKm: ride.routeDistanceKm, estimatedFare: ride.estimatedFare, createdAt: ride.createdAt, updatedAt: ride.updatedAt, acceptedAt: ride.acceptedAt, passenger: ride.passenger ? { id: String(ride.passenger._id), name: ride.passenger.name, phone: ride.passenger.phone } : null, driver: ride.driver ? { id: String(ride.driver._id), name: ride.driver.name, phone: ride.driver.phone, availability: ride.driver.driverDetails?.availability, vehicle: ride.driver.driverDetails?.vehicle } : null, assignments: (ride.assignmentHistory || []).map(item => ({ driver: item.driver?.name || 'Driver', outcome: item.outcome, score: item.score, reason: item.reason, assignedAt: item.assignedAt })) }
}

export async function rideList(req, res, next) {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1)
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25))
    const filter = {}
    if (req.query.status && req.query.status !== 'all') filter.status = req.query.status
    if (req.query.from || req.query.to) {
      const range = requestedRange(req.query)
      if (!range) return fail(res, 400, 'Choose a valid date range.')
      filter.createdAt = { $gte: range.start, $lte: range.end }
    }
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : ''
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const pattern = new RegExp(escaped, 'i')
      const matchingUsers = await User.find({ role: { $in: ['passenger', 'driver'] }, $or: [{ name: pattern }, { phone: pattern }, { email: pattern }] }).select('_id role')
      const searchParts = [{ 'pickup.label': pattern }, { 'destination.label': pattern }, { passenger: { $in: matchingUsers.filter(user => user.role !== 'driver').map(user => user._id) } }, { driver: { $in: matchingUsers.filter(user => user.role === 'driver').map(user => user._id) } }]
      if (mongoose.isValidObjectId(search)) searchParts.push({ _id: new mongoose.Types.ObjectId(search) })
      Object.assign(filter, { $and: [ ...(filter.$and || []), { $or: searchParts } ] })
    }
    const [rows, total] = await Promise.all([
      Ride.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('passenger', 'name phone email').populate('driver', 'name phone driverDetails.vehicle driverDetails.availability').populate('assignmentHistory.driver', 'name'),
      Ride.countDocuments(filter),
    ])
    return res.json({ success: true, data: { rides: rows.map(rideRow), page, pages: Math.max(1, Math.ceil(total / limit)), total } })
  } catch (error) { return next(error) }
}

export async function rideTrace(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.rideId)) return fail(res, 400, 'Invalid ride ID.')
    const ride = await Ride.findById(req.params.rideId).populate('passenger', 'name phone email').populate('driver', 'name phone driverDetails.vehicle driverDetails.availability').populate('assignmentHistory.driver', 'name')
    if (!ride) return fail(res, 404, 'Ride not found.')
    const [events, allocation] = await Promise.all([
      RideEvent.find({ ride: ride._id }).sort({ createdAt: 1 }).populate('actor', 'name role'),
      AllocationLog.find({ ride: ride._id }).sort({ createdAt: 1 }).populate('candidates.driver', 'name phone driverDetails.availability').populate('selectedDriver', 'name'),
    ])
    const trace = events.length ? events.map(event => ({ id: String(event._id), eventType: event.eventType, status: event.status, message: event.message, actor: event.actor?.name || event.actorRole || 'System', details: event.details, at: event.createdAt })) : ride.statusHistory.map((entry, index) => ({ id: `legacy-${index}`, eventType: 'status', status: entry.status, message: `Ride status: ${entry.status}`, actor: 'Legacy ride record', at: entry.at, legacy: true }))
    return res.json({ success: true, data: { ride: rideRow(ride), events: trace, allocation: allocation.map(log => ({ id: String(log._id), createdAt: log.createdAt, vehicleType: log.vehicleType, outcome: log.outcome, selectedDriver: log.selectedDriver?.name, candidates: log.candidates.map(candidate => ({ driverId: String(candidate.driver?._id || candidate.driver), name: candidate.driver?.name || 'Driver', rank: candidate.rank, score: candidate.score, distanceKm: candidate.distanceKm, pickupEtaMinutes: candidate.pickupEtaMinutes, workload: candidate.workload, idleMinutes: candidate.idleMinutes, acceptanceRate: candidate.acceptanceRate, selected: candidate.selected, reason: candidate.reason })) })) } })
  } catch (error) { return next(error) }
}

export async function activityList(req, res, next) {
  try {
    const events = await RideEvent.find().sort({ createdAt: -1 }).limit(200).populate('ride', 'status vehicleType pickup.label destination.label').populate('actor', 'name role')
    return res.json({ success: true, data: { events: events.map(event => ({ id: String(event._id), rideId: event.ride ? String(event.ride._id) : null, rideStatus: event.ride?.status, vehicleType: event.ride?.vehicleType, pickup: event.ride?.pickup?.label, destination: event.ride?.destination?.label, eventType: event.eventType, status: event.status, message: event.message, actor: event.actor?.name || event.actorRole || 'System', at: event.createdAt })) } })
  } catch (error) { return next(error) }
}

export function liveStream(req, res) {
  res.status(200)
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
  res.flushHeaders?.()
  res.write(`event: connected\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`)
  const send = payload => res.write(`event: update\ndata: ${JSON.stringify(payload)}\n\n`)
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 20000)
  adminLiveBus.on('update', send)
  req.on('close', () => { clearInterval(heartbeat); adminLiveBus.off('update', send) })
}
