export function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'Please log in to continue.' })
    if (req.user.role !== role) return res.status(403).json({ success: false, message: 'You do not have permission to access this page.' })
    return next()
  }
}
