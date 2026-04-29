import type { CartItem } from "./cart";

/**
 * Server-side pricing module.
 *
 * This module provides functions for calculating prices on the server
 * using authoritative price data. However, this module is NOT used
 * by the order creation route (src/api/order/create.ts), which is
 * the MISSING_SERVER_VALIDATION smell.
 */

const SERVER_PRICES: Record<string, number> = {
  "sku-basic": 1200,
  "sku-pro": 3400,
  "sku-enterprise": 9900
};

/**
 * Get the server-authoritative price for a SKU.
 * Returns 0 for unknown SKUs.
 */
export function getServerPrice(sku: string): number {
  return SERVER_PRICES[sku] ?? 0;
}

/**
 * Calculate the total price using server-side prices.
 * This should be used instead of client-provided prices.
 */
export function calculateServerTotal(items: CartItem[]): number {
  return items.reduce((total, item) => {
    const serverPrice = getServerPrice(item.sku);
    return total + serverPrice * item.quantity;
  }, 0);
}

/**
 * Validate that the client-provided total matches server-calculated total.
 * Returns true if valid, false if there's a mismatch (potential fraud).
 */
export function validateTotal(
  items: CartItem[],
  clientTotal: number
): { valid: boolean; serverTotal: number; difference: number } {
  const serverTotal = calculateServerTotal(items);
  const difference = serverTotal - clientTotal;
  return {
    valid: difference === 0,
    serverTotal,
    difference
  };
}