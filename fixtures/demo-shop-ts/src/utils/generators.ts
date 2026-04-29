/**
 * Generator functions and async generators for testing.
 */

import type { CartItem } from "../domain/cart";

/**
 * Generator function to iterate over cart items.
 */
export function* iterateCartItems(items: CartItem[]): Generator<CartItem, void, unknown> {
  for (const item of items) {
    yield item;
  }
}

/**
 * Generator function with filtering.
 */
export function* filterCartItems(
  items: CartItem[],
  minQuantity: number
): Generator<CartItem, void, unknown> {
  for (const item of items) {
    if (item.quantity >= minQuantity) {
      yield item;
    }
  }
}

/**
 * Async generator for batch processing.
 */
export async function* processBatches(
  items: CartItem[],
  batchSize: number
): AsyncGenerator<CartItem[], void, unknown> {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    // Simulate async processing
    await new Promise(resolve => setTimeout(resolve, 10));
    yield batch;
  }
}

/**
 * Generator for SKU extraction.
 */
export function* extractSkus(items: CartItem[]): Generator<string, void, unknown> {
  for (const item of items) {
    yield item.sku;
  }
}

/**
 * Async generator for order simulation.
 */
export async function* simulateOrders(
  userIds: string[],
  itemsPerUser: number
): AsyncGenerator<{ userId: string; orderNumber: number }, void, unknown> {
  for (const userId of userIds) {
    for (let i = 0; i < itemsPerUser; i++) {
      await new Promise(resolve => setTimeout(resolve, 5));
      yield { userId, orderNumber: i + 1 };
    }
  }
}

/**
 * Infinite generator for price calculations.
 * Demonstrates generator with infinite sequence.
 */
export function* priceSequence(basePrice: number, increment: number): Generator<number, never, unknown> {
  let price = basePrice;
  while (true) {
    yield price;
    price += increment;
  }
}

/**
 * Async function using generator.
 */
export async function processCartWithGenerator(items: CartItem[]): Promise<number> {
  let total = 0;
  for (const item of iterateCartItems(items)) {
    total += item.price * item.quantity;
  }
  return total;
}

/**
 * Generator with complex return value.
 */
export function* cartSummaryGenerator(items: CartItem[]): Generator<string, { total: number; count: number }, unknown> {
  let total = 0;
  let count = 0;
  for (const item of items) {
    yield `Processing ${item.sku}: ${item.quantity} x ${item.price}`;
    total += item.price * item.quantity;
    count++;
  }
  return { total, count };
}