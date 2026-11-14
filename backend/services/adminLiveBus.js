import { EventEmitter } from 'node:events'

export const adminLiveBus = new EventEmitter()
adminLiveBus.setMaxListeners(200)
export function publishAdminUpdate(type, rideId) {
  adminLiveBus.emit('update', { type, rideId: rideId ? String(rideId) : undefined, at: new Date().toISOString() })
}
