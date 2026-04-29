/**
 * Account routes - protected by user authentication.
 * Demonstrates proper use of requireUser middleware.
 */

const express = require('express');
const router = express.Router();
const { requireUser } = require('../auth/middleware');

/**
 * GET /api/account/profile
 * Get current user profile - requires authentication
 */
router.get('/profile', requireUser, (req, res) => {
  res.json({
    userId: req.user.id,
    username: req.user.username,
    email: req.user.email
  });
});

/**
 * PUT /api/account/profile
 * Update current user profile - requires authentication
 */
router.put('/profile', requireUser, (req, res) => {
  const { email, displayName } = req.body;
  res.json({
    success: true,
    updated: { email, displayName }
  });
});

/**
 * POST /api/account/change-password
 * Change password - requires authentication
 */
router.post('/change-password', requireUser, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Both passwords required' });
  }
  res.json({ success: true, message: 'Password changed' });
});

module.exports = router;