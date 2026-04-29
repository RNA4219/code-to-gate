/**
 * Public routes - intentionally no auth required
 * Suppressed by WEAK_AUTH_GUARD rule
 */

import { Router } from 'express';

const router = Router();

/**
 * Public health check endpoint - no auth needed
 */
router.get('/health', async (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

/**
 * Public info endpoint - no auth needed
 */
router.get('/info', async (req, res) => {
  res.json({
    name: 'Demo Service',
    version: '1.0.0',
    description: 'Public information endpoint',
  });
});

/**
 * Public docs endpoint - no auth needed
 */
router.get('/docs', async (req, res) => {
  res.json({
    documentation: 'https://docs.example.com',
  });
});

export { router as publicRoutes };