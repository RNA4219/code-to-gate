/**
 * Protected routes - require authentication
 * This file should NOT be suppressed - auth guards present
 */

import { Router, Request, Response, NextFunction } from 'express';

const router = Router();

/**
 * Authentication middleware
 */
function authGuard(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const token = authHeader.substring(7);

  // Validate token (simplified for demo)
  if (token === 'valid-token') {
    next();
  } else {
    res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * Protected user profile endpoint
 */
router.get('/profile', authGuard, async (req, res) => {
  res.json({ user: 'authenticated-user', profile: {} });
});

/**
 * Protected settings endpoint
 */
router.get('/settings', authGuard, async (req, res) => {
  res.json({ settings: { theme: 'dark', notifications: true } });
});

/**
 * Protected admin endpoint
 */
router.get('/admin', authGuard, async (req, res) => {
  res.json({ admin: true, permissions: ['read', 'write'] });
});

export { router as protectedRoutes };