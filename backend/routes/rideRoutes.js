import { Router } from 'express'
import { createRide, nearbyDrivers, rideById, rideHistory } from '../controllers/rideController.js'
import { requireAuth } from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/roleMiddleware.js'
const router = Router()
router.use(requireAuth, requireRole('passenger'))
router.get('/nearby', nearbyDrivers)
router.get('/history', rideHistory)
router.post('/', createRide)
router.get('/:rideId', rideById)
export default router
