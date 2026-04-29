/**
 * Route registration module.
 * Demonstrates mixing public, protected, and admin routes.
 */

const express = require('express');
const publicRoutes = require('./routes/public');
const accountRoutes = require('./routes/account');
const adminRoutes = require('./routes/admin');

const app = express();
app.use(express.json());

// Public routes - no authentication required
app.use('/api', publicRoutes);

// Protected routes - require user authentication
app.use('/api/account', accountRoutes);

// Admin routes - intended for admin users only
// SMELL: Admin routes are mounted without proper admin middleware
app.use('/api/admin', adminRoutes);

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;