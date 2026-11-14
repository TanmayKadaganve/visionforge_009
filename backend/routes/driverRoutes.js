import { Router } from 'express'
import { requireAuth } from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/roleMiddleware.js'
import { dashboard, setAvailability, updateLocation, decideRide, updateRideStatus, updateProfile } from '../controllers/driverController.js'

const router = Router()
router.use(requireAuth, requireRole('driver'))
router.get('/dashboard', dashboard)
router.patch('/availability', setAvailability)
router.patch('/location', updateLocation)
router.post('/rides/:rideId/accept', (req, res, next) => decideRide(req, res, next, 'accept'))
router.post('/rides/:rideId/reject', (req, res, next) => decideRide(req, res, next, 'reject'))
router.patch('/rides/:rideId/status', updateRideStatus)
router.patch('/profile', updateProfile)
export default router
