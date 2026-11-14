import { Router } from 'express'
import { activityList, liveStream, overview, rideList, rideTrace } from '../controllers/adminController.js'
import { requireAuth } from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/roleMiddleware.js'

const router = Router()
router.use(requireAuth, requireRole('admin'))
router.get('/stream', liveStream)
router.get('/overview', overview)
router.get('/rides', rideList)
router.get('/rides/:rideId/trace', rideTrace)
router.get('/activity', activityList)
export default router
