import type { CartItem } from "../domain/cart";

export type User = {
  id: string;
  role: "user" | "admin";
};

export type StoredOrder = {
  id: string;
  userId: string;
  items: CartItem[];
  total: number;
  currency: string;
};

/**
 * Order persistence adapter.
 * Creates an order record in the database.
 *
 * NOTE: This function accepts the total directly without validation.
 * The caller is responsible for ensuring the total is correct.
 */
export async function createOrder(order: Omit<StoredOrder, "id">): Promise<StoredOrder> {
  // In a real implementation, this would persist to a database
  // For this fixture, we return a synthetic order
  return {
    id: "order_synthetic_001",
    ...order
  };
}

/**
 * Retrieve an order by ID.
 */
export async function getOrderById(id: string): Promise<StoredOrder | null> {
  // Stub for fixture purposes
  if (id === "order_synthetic_001") {
    return {
      id: "order_synthetic_001",
      userId: "synthetic-user",
      items: [],
      total: 0,
      currency: "USD"
    };
  }
  return null;
}