import { Router } from "express";
import { googleLogin, login, logout, me, register } from "../controllers/authController.js";
import { optionalAuth, requireAuth } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";
const router = Router();
router.post("/register", register);
router.post("/login", login);
router.post("/google", googleLogin);
router.get("/me", optionalAuth, me);
router.post("/logout", logout);
router.get(
  "/passenger-dashboard",
  requireAuth,
  requireRole("passenger"),
  (req, res) =>
    res.json({ success: true, data: { user: req.user.toSafeObject() } }),
);
router.get(
  "/driver-dashboard",
  requireAuth,
  requireRole("driver"),
  (req, res) =>
    res.json({ success: true, data: { user: req.user.toSafeObject() } }),
);
export default router;
