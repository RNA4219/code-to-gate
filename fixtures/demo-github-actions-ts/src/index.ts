/**
 * Demo GitHub Actions API Module
 *
 * This fixture demonstrates patterns that code-to-gate should detect:
 * - CLIENT_TRUSTED_PRICE: Accepting price from client without validation
 * - WEAK_AUTH_GUARD: Weak authorization checks
 * - MISSING_SERVER_VALIDATION: Missing input validation
 */

import express, { Request, Response } from "express";
import { createOrder, getOrderById } from "./db/orders";
import { authenticateToken, requireRole } from "./auth/middleware";

const app = express();
app.use(express.json());

/**
 * Public health check endpoint
 */
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

/**
 * Create order endpoint - SECURITY ISSUE: accepts price from client
 *
 * RISK: CLIENT_TRUSTED_PRICE - The total and currency are accepted
 * directly from the client request without server-side validation.
 * An attacker could manipulate the price to get free items.
 */
app.post("/api/orders", authenticateToken, async (req: Request, res: Response) => {
  const { userId, items, total, currency } = req.body;

  // MISSING_SERVER_VALIDATION: No validation of item IDs, quantities, or prices
  // The total is trusted from client - should be calculated server-side

  try {
    const order = await createOrder({
      userId,
      items,
      total, // CLIENT_TRUSTED_PRICE - price comes directly from client
      currency,
    });

    res.json({ success: true, order });
  } catch (error) {
    // TRY_CATCH_SWALLOW: Error is logged but not properly handled
    console.error("Order creation failed:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Get order by ID endpoint
 */
app.get("/api/orders/:id", authenticateToken, async (req: Request, res: Response) => {
  const orderId = req.params.id;
  const order = await getOrderById(orderId);

  if (!order) {
    return res.status(404).json({ error: "Order not found" });
  }

  res.json(order);
});

/**
 * Admin endpoint - WEAK_AUTH_GUARD: Role check is insufficient
 *
 * RISK: The admin check only verifies the role string, not the actual
 * permissions or session validity. Could be bypassed with role manipulation.
 */
app.delete("/api/orders/:id", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
  const orderId = req.params.id;

  // UNSAFE_DELETE: No verification that the order exists or belongs to user
  // No audit log for deletion

  try {
    // In real implementation, would delete from database
    res.json({ success: true, message: `Order ${orderId} deleted` });
  } catch (error) {
    console.error("Delete failed:", error);
    res.status(500).json({ error: "Delete failed" });
  }
});

/**
 * Payment processing endpoint - CLIENT_TRUSTED_PRICE variant
 *
 * RISK: Payment amount is taken directly from request body
 */
app.post("/api/payments", authenticateToken, async (req: Request, res: Response) => {
  const { orderId, amount, paymentMethod } = req.body;

  // MISSING_SERVER_VALIDATION: amount should be retrieved from order
  // not trusted from client request

  // Process payment with client-provided amount - SECURITY ISSUE
  const paymentResult = await processPayment({
    orderId,
    amount, // CLIENT_TRUSTED_PRICE
    paymentMethod,
  });

  res.json(paymentResult);
});

/**
 * Stub payment processor
 */
async function processPayment(params: {
  orderId: string;
  amount: number;
  paymentMethod: string;
}): Promise<{ success: boolean; transactionId: string }> {
  // In real implementation, would call payment gateway
  return {
    success: true,
    transactionId: `txn_${Date.now()}`,
  };
}

/**
 * Start server
 */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export { app };