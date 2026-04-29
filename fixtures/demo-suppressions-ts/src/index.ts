/**
 * Main application entry point
 */

import { publicRoutes } from './routes/public.js';
import { protectedRoutes } from './routes/protected.js';
import { createOrder, createLegacyOrder } from './api/order/new-order-handler.js';
import { createLegacyOrder as legacyCreate } from './api/order/legacy-order-handler.js';

console.log('Demo suppressions fixture loaded');
console.log('Public routes:', publicRoutes);
console.log('Protected routes:', protectedRoutes);
console.log('Order handlers:', createOrder, createLegacyOrder, legacyCreate);