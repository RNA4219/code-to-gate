/**
 * Legacy order processing - uses client-supplied price directly
 * This file is suppressed by CLIENT_TRUSTED_PRICE rule
 * See .ctg/suppressions.yaml for suppression details
 */

import { Request, Response } from 'express';

interface OrderRequest {
  userId: string;
  items: Array<{ productId: string; quantity: number }>;
  // VULNERABILITY: price comes from client request
  price: number;
  total: number;
}

/**
 * Legacy create order handler - suppressed
 * Uses client-provided price without server validation
 */
export async function createLegacyOrder(req: Request, res: Response): Promise<void> {
  const orderData = req.body as OrderRequest;

  // VULNERABILITY: Using client-supplied price directly
  const finalPrice = orderData.price;
  const finalTotal = orderData.total;

  // Create order with unvalidated price
  const order = {
    userId: orderData.userId,
    items: orderData.items,
    price: finalPrice, // CLIENT_TRUSTED_PRICE finding here
    total: finalTotal, // CLIENT_TRUSTED_PRICE finding here
    createdAt: new Date(),
  };

  res.json({ success: true, order });
}

/**
 * Legacy update order handler - suppressed
 */
export async function updateLegacyOrder(req: Request, res: Response): Promise<void> {
  const { orderId } = req.params;
  const updates = req.body;

  // VULNERABILITY: Using client-supplied price from updates
  if (updates.price) {
    // Update with unvalidated price
    const newPrice = updates.price;
    res.json({ success: true, orderId, newPrice });
  } else {
    res.status(400).json({ error: 'Price required' });
  }
}