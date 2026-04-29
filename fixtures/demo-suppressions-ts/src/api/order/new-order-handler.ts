/**
 * New order processing - uses server-side price validation
 * This file should NOT be suppressed
 */

import { Request, Response } from 'express';

interface OrderRequest {
  userId: string;
  items: Array<{ productId: string; quantity: number }>;
}

// Server-side price lookup
const PRICE_TABLE: Record<string, number> = {
  'product-1': 100,
  'product-2': 200,
  'product-3': 300,
};

/**
 * New create order handler - properly validates price
 */
export async function createOrder(req: Request, res: Response): Promise<void> {
  const orderData = req.body as OrderRequest;

  // Calculate price on server side
  let total = 0;
  for (const item of orderData.items) {
    const unitPrice = PRICE_TABLE[item.productId] ?? 0;
    total += unitPrice * item.quantity;
  }

  const order = {
    userId: orderData.userId,
    items: orderData.items,
    total, // Server-calculated, not client-supplied
    createdAt: new Date(),
  };

  res.json({ success: true, order });
}