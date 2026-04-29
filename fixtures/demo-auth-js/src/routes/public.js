/**
 * Public routes - no authentication required.
 * Used as comparison baseline for protected routes.
 */

const express = require('express');
const router = express.Router();

/**
 * GET /api/health
 * Health check endpoint - public access
 */
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * GET /api/info
 * Public API information
 */
router.get('/info', (req, res) => {
  res.json({
    name: 'demo-auth-api',
    version: '1.0.0',
    description: 'Demo API with authentication patterns'
  });
});

/**
 * POST /api/login
 * Public login endpoint
 */
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  // Simplified login for demo purposes
  if (username && password) {
    res.json({ success: true, token: 'demo-token' });
  } else {
    res.status(400).json({ error: 'Username and password required' });
  }
});

module.exports = router;