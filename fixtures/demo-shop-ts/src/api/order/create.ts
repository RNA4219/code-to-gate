import { requireUser } from "../../auth/guard";
import { createOrder } from "../../db/orders";
import { validateOrderItems } from "../../validation/order"; // SMELL: MISSING_SERVER_VALIDATION - imported but not used

export type OrderRequest = {
  headers: Record<string, string | undefined>;
  body: {
    items: Array<{ sku: string; quantity: number; price: number }>;
    total: number;
    currency: string;
  };
};

/**
 * Checkout/Order creation entrypoint.
 *
 * SMELL: CLIENT_TRUSTED_PRICE
 * This route handler trusts the client-supplied price/total without
 * server-side validation or recalculation.
 */
export async function createOrderRoute(req: OrderRequest) {
  const user = requireUser(req.headers.authorization);

  // Input validation for required fields only (no price validation)
  // SMELL: MISSING_SERVER_VALIDATION - no quantity/price boundary checks
  if (!req.body.items || !Array.isArray(req.body.items)) {
    return { status: 400, body: { error: "items required" } };
  }
  if (!req.body.currency) {
    return { status: 400, body: { error: "currency required" } };
  }
  // MISSING: boundary validation for quantity (max 100, min 1) and price (positive)

  // SMELL: CLIENT_TRUSTED_PRICE - Lines 35-42
  // The total is taken directly from the request body without any
  // server-side validation or recalculation. An attacker can set
  // total=1 or modify item prices to pay less than the actual cost.
  const clientTotal = req.body.total;
  const order = await createOrder({
    userId: user.id,
    items: req.body.items,
    total: clientTotal,  // VULNERABLE: client-controlled value used directly
    currency: req.body.currency
  });
  // END SMELL

  return { status: 201, body: order };
}