/**
 * Tests for order validation
 */

import { describe, it, expect } from "vitest";
import { validateQuantity, validatePrice, validateOrderItems } from "../order.js";

describe("Order Validation", () => {
  describe("validateQuantity", () => {
    it("accepts valid quantity (1-100)", () => {
      expect(validateQuantity(1)).toBe(true);
      expect(validateQuantity(50)).toBe(true);
      expect(validateQuantity(100)).toBe(true);
    });

    it("rejects quantity below minimum", () => {
      expect(validateQuantity(0)).toBe(false);
      expect(validateQuantity(-1)).toBe(false);
    });

    it("rejects quantity above maximum", () => {
      expect(validateQuantity(101)).toBe(false);
      expect(validateQuantity(1000)).toBe(false);
    });
  });

  describe("validatePrice", () => {
    it("accepts valid positive price", () => {
      expect(validatePrice(1)).toBe(true);
      expect(validatePrice(100)).toBe(true);
      expect(validatePrice(999999)).toBe(true);
    });

    it("rejects zero price", () => {
      expect(validatePrice(0)).toBe(false);
    });

    it("rejects negative price", () => {
      expect(validatePrice(-1)).toBe(false);
    });

    it("rejects price above maximum", () => {
      expect(validatePrice(1000000)).toBe(false);
    });
  });

  describe("validateOrderItems", () => {
    it("accepts valid items", () => {
      const items = [
        { sku: "ABC", quantity: 1, price: 100 },
        { sku: "XYZ", quantity: 50, price: 500 },
      ];
      expect(validateOrderItems(items)).toBe(true);
    });

    it("rejects items with invalid quantity", () => {
      const items = [
        { sku: "ABC", quantity: 0, price: 100 },
      ];
      expect(validateOrderItems(items)).toBe(false);
    });

    it("rejects items with invalid price", () => {
      const items = [
        { sku: "ABC", quantity: 1, price: -100 },
      ];
      expect(validateOrderItems(items)).toBe(false);
    });
  });
});