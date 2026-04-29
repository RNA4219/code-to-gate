import { describe, expect, it } from "vitest";
import { addItem, removeItem, calculateCartTotal } from "../domain/cart";

/**
 * Smoke tests for cart functionality.
 *
 * NOTE: These tests only cover the cart domain logic.
 * The critical checkout/order path (src/api/order/create.ts) is NOT tested,
 * which is the UNTESTED_CRITICAL_PATH smell.
 */
describe("cart", () => {
  it("merges quantities for an existing sku", () => {
    const result = addItem([{ sku: "sku-basic", quantity: 1, price: 1200 }], {
      sku: "sku-basic",
      quantity: 2,
      price: 1200
    });

    expect(result).toEqual([{ sku: "sku-basic", quantity: 3, price: 1200 }]);
  });

  it("adds a new item to empty cart", () => {
    const result = addItem([], { sku: "sku-pro", quantity: 1, price: 3400 });

    expect(result).toEqual([{ sku: "sku-pro", quantity: 1, price: 3400 }]);
  });

  it("removes an item from the cart", () => {
    const result = removeItem(
      [
        { sku: "sku-basic", quantity: 1, price: 1200 },
        { sku: "sku-pro", quantity: 2, price: 3400 }
      ],
      "sku-basic"
    );

    expect(result).toEqual([{ sku: "sku-pro", quantity: 2, price: 3400 }]);
  });

  it("calculates cart total", () => {
    const total = calculateCartTotal([
      { sku: "sku-basic", quantity: 2, price: 1200 },
      { sku: "sku-pro", quantity: 1, price: 3400 }
    ]);

    expect(total).toBe(5800);
  });
});

// MISSING: Integration tests for checkout/order flow
// MISSING: Negative tests for price manipulation
// MISSING: Abuse case tests for total tampering