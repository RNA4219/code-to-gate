/**
 * Order processor class demonstrating class and method detection.
 */

import type { CartItem } from "../domain/cart";

export interface OrderProcessorConfig {
  maxOrdersPerMinute: number;
  retryAttempts: number;
  timeoutMs: number;
}

/**
 * Order processor class with async methods.
 * Demonstrates class and method symbol extraction.
 */
export class OrderProcessor {
  private config: OrderProcessorConfig;
  private processedCount: number = 0;

  constructor(config: OrderProcessorConfig) {
    this.config = config;
  }

  /**
   * Process an order asynchronously.
   */
  async processOrder(userId: string, items: CartItem[]): Promise<string> {
    this.processedCount++;
    // Simulate order processing
    await this.validateItems(items);
    const orderId = await this.createOrderRecord(userId, items);
    return orderId;
  }

  /**
   * Validate order items.
   */
  private async validateItems(items: CartItem[]): Promise<boolean> {
    if (!items || items.length === 0) {
      throw new Error("No items to process");
    }
    return true;
  }

  /**
   * Create order record in database.
   */
  private async createOrderRecord(userId: string, items: CartItem[]): Promise<string> {
    // Simulated database operation
    return `order-${userId}-${Date.now()}`;
  }

  /**
   * Get processing statistics.
   */
  getStats(): { processed: number; config: OrderProcessorConfig } {
    return {
      processed: this.processedCount,
      config: this.config
    };
  }

  /**
   * Reset processor state.
   */
  reset(): void {
    this.processedCount = 0;
  }
}

/**
 * Payment handler class.
 * Demonstrates another class with different method signatures.
 */
export class PaymentHandler {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Process payment for an order.
   */
  async processPayment(orderId: string, amount: number, currency: string): Promise<boolean> {
    // Simulate payment gateway call
    console.log(`Processing payment for ${orderId}: ${amount} ${currency}`);
    return true;
  }

  /**
   * Refund a payment.
   */
  async refundPayment(orderId: string): Promise<boolean> {
    console.log(`Refunding payment for ${orderId}`);
    return true;
  }

  /**
   * Get payment status.
   */
  getPaymentStatus(orderId: string): string {
    return "completed";
  }
}

/**
 * Inventory manager class.
 * Non-exported class to test private class detection.
 */
class InventoryManager {
  private stock: Map<string, number> = new Map();

  addStock(sku: string, quantity: number): void {
    const current = this.stock.get(sku) ?? 0;
    this.stock.set(sku, current + quantity);
  }

  getStock(sku: string): number {
    return this.stock.get(sku) ?? 0;
  }

  async checkAvailability(sku: string, requested: number): Promise<boolean> {
    const available = this.getStock(sku);
    return available >= requested;
  }
}

// Export default instance
export const defaultProcessor = new OrderProcessor({
  maxOrdersPerMinute: 100,
  retryAttempts: 3,
  timeoutMs: 5000
});