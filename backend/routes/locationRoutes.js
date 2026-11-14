import { Router } from 'express'
import { estimateRoute, searchPlaces } from '../controllers/locationController.js'
import { requireAuth } from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/roleMiddleware.js'
const router = Router()
router.get('/search', requireAuth, requireRole('passenger'), searchPlaces)
router.get('/route', requireAuth, estimateRoute)
export default router
