import RideEvent from '../models/RideEvent.js'
import { publishAdminUpdate } from './adminLiveBus.js'

export async function recordRideEvent({ ride, eventType, status, message, actor, actorRole = 'system', details }) {
  const event = await RideEvent.create({ ride, eventType, status, message, actor, actorRole, details })
  publishAdminUpdate('ride-event', ride)
  return event
}
