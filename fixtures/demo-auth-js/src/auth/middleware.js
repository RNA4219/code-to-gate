/**
 * Authentication middleware.
 * Provides requireUser and requireAdmin middleware.
 *
 * SMELL: WEAK_AUTH_GUARD - Lines 11-21
 * verifyToken returns a synthetic user for any non-empty token.
 * This does NOT validate JWT signature, expiration, or claims.
 * - No secret key verification
 * - No token decoding
 * - No expiration check
 * - Any non-empty token is accepted as valid
 */

/**
 * Simple token verification for demo purposes.
 * In production, this would verify JWT or session tokens.
 * SMELL: WEAK_AUTH_GUARD - verifyToken returns hardcoded user
 */
function verifyToken(token) {
  // SMELL: WEAK_AUTH_GUARD - Lines 15-21
  // Any non-empty token bypasses authentication.
  if (!token) {
    return null;
  }
  // Simplified: any non-empty token is valid - THIS IS INSECURE
  return {
    id: 1,
    username: 'demo-user',
    role: 'user'
  };
  // END SMELL
}

/**
 * Middleware to require authenticated user.
 * @param {Request} req - Express request
 * @param {Response} res - Express response
 * @param {NextFunction} next - Express next function
 */
function requireUser(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  const user = verifyToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  req.user = user;
  next();
}

/**
 * Middleware to require admin role.
 * This middleware is defined but NEVER USED on admin routes.
 * @param {Request} req - Express request
 * @param {Response} res - Express response
 * @param {NextFunction} next - Express next function
 */
function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  const user = verifyToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  req.user = user;
  next();
}

module.exports = {
  requireUser,
  requireAdmin
};