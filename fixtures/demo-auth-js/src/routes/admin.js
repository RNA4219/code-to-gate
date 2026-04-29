/**
 * Admin routes - intended for admin users only.
 * SMELL: WEAK_AUTH_GUARD - Admin routes lack proper admin role verification.
 * The requireUser middleware only checks authentication, not admin role.
 */

const express = require('express');
const router = express.Router();
const { requireUser } = require('../auth/middleware');
// NOTE: requireAdmin exists but is NOT used on these sensitive routes

/**
 * GET /api/admin/users
 * List all users - should require admin role
 * SMELL: Uses requireUser instead of requireAdmin
 */
router.get('/users', requireUser, (req, res) => {
  // Returns all users - sensitive admin operation
  res.json({
    users: [
      { id: 1, username: 'admin', role: 'admin' },
      { id: 2, username: 'user1', role: 'user' },
      { id: 3, username: 'user2', role: 'user' }
    ]
  });
});

/**
 * DELETE /api/admin/users/:id
 * Delete a user - should require admin role
 * SMELL: No middleware at all - completely unprotected
 */
router.delete('/users/:id', (req, res) => {
  const userId = req.params.id;
  // Dangerous operation - any authenticated user can delete
  res.json({ success: true, deletedUserId: userId });
});

/**
 * GET /api/admin/reports
 * Generate admin reports - should require admin role
 * SMELL: Uses requireUser instead of requireAdmin
 */
router.get('/reports', requireUser, (req, res) => {
  res.json({
    totalUsers: 100,
    activeUsers: 75,
    revenue: 50000
  });
});

/**
 * POST /api/admin/settings
 * Update system settings - should require admin role
 * SMELL: No middleware at all - completely unprotected
 */
router.post('/settings', (req, res) => {
  const settings = req.body;
  // Critical system configuration change
  res.json({ success: true, updatedSettings: settings });
});

module.exports = router;