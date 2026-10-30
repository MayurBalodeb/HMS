/**
 * Role-based access control.
 * Usage: requireRole(['admin', 'doctor'])
 * Must be used AFTER the `authenticate` middleware (relies on req.user.role).
 */
function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authenticated.' });
    }
    if (allowedRoles.length && !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role(s): ${allowedRoles.join(', ')}.`
      });
    }
    next();
  };
}

module.exports = requireRole;
