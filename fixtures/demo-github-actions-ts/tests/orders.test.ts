/**
 * Tests for order module
 */

import { describe, it, expect } from "vitest";
import { createOrder, getOrderById, calculateOrderTotal } from "../src/db/orders";

describe("Order Module", () => {
  it("should create an order", async () => {
    const order = await createOrder({
      userId: "user-001",
      items: [{ productId: "prod-001", quantity: 2, price: 100 }],
      total: 200,
      currency: "USD",
    });

    expect(order.id).toBeDefined();
    expect(order.userId).toBe("user-001");
    expect(order.status).toBe("pending");
  });

  it("should calculate order total correctly", () => {
    const items = [
      { productId: "prod-001", quantity: 2, price: 100 },
      { productId: "prod-002", quantity: 1, price: 50 },
    ];

    const total = calculateOrderTotal(items);
    expect(total).toBe(250);
  });

  it("should retrieve order by ID", async () => {
    const order = await createOrder({
      userId: "user-002",
      items: [{ productId: "prod-001", quantity: 1, price: 75 }],
      total: 75,
      currency: "USD",
    });

    const retrieved = await getOrderById(order.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.userId).toBe("user-002");
  });
});