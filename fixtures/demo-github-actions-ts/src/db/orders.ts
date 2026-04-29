/**
 * Order Database Module
 *
 * Contains patterns for testing CLIENT_TRUSTED_PRICE detection.
 */

import { Request } from "express";

export type OrderItem = {
  productId: string;
  quantity: number;
  price: number; // Price per item - CLIENT_TRUSTED_PRICE risk
};

export type Order = {
  id: string;
  userId: string;
  items: OrderItem[];
  total: number; // CLIENT_TRUSTED_PRICE - should be calculated server-side
  currency: string;
  status: "pending" | "paid" | "shipped" | "delivered";
  createdAt: Date;
};

/**
 * Create order in database
 *
 * CLIENT_TRUSTED_PRICE: Accepts total directly without server calculation
 */
export async function createOrder(data: {
  userId: string;
  items: OrderItem[];
  total: number;
  currency: string;
}): Promise<Order> {
  // MISSING_SERVER_VALIDATION: No validation of:
  // - Product IDs exist
  // - Quantities are valid
  // - Prices match actual product prices
  // - Total matches sum of items

  const order: Order = {
    id: generateOrderId(),
    userId: data.userId,
    items: data.items,
    total: data.total, // CLIENT_TRUSTED_PRICE - trusted from caller
    currency: data.currency,
    status: "pending",
    createdAt: new Date(),
  };

  // In real implementation, would persist to database
  orders.set(order.id, order);

  return order;
}

/**
 * Get order by ID
 */
export async function getOrderById(id: string): Promise<Order | null> {
  return orders.get(id) || null;
}

/**
 * Update order status
 */
export async function updateOrderStatus(id: string, status: Order["status"]): Promise<Order | null> {
  const order = orders.get(id);
  if (!order) {
    return null;
  }

  order.status = status;
  orders.set(id, order);

  return order;
}

/**
 * Delete order - UNSAFE_DELETE pattern
 */
export async function deleteOrder(id: string): Promise<boolean> {
  // UNSAFE_DELETE: No check if order exists, no audit log
  return orders.delete(id);
}

// In-memory store for fixture
const orders = new Map<string, Order>();

function generateOrderId(): string {
  return `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Calculate order total - SECURE version (not used in insecure endpoints)
 *
 * This is the correct pattern that should be used instead of
 * accepting client-provided total.
 */
export function calculateOrderTotal(items: OrderItem[]): number {
  return items.reduce((sum, item) => {
    // In real implementation, price would be fetched from product DB
    return sum + (item.price * item.quantity);
  }, 0);
}

/**
 * Validate order items - SECURE version (not used in insecure endpoints)
 */
export async function validateOrderItems(items: OrderItem[]): Promise<boolean> {
  for (const item of items) {
    // MISSING_SERVER_VALIDATION: This should check:
    // - Product exists in catalog
    // - Price matches catalog price
    // - Quantity is within limits

    if (!item.productId || item.quantity <= 0 || item.price <= 0) {
      return false;
    }
  }
  return true;
}