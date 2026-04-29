export type CartItem = {
  sku: string;
  quantity: number;
  price: number;
};

/**
 * Add an item to a cart.
 * If the SKU already exists, quantities are merged.
 */
export function addItem(items: CartItem[], item: CartItem): CartItem[] {
  const existing = items.find((candidate) => candidate.sku === item.sku);
  if (!existing) {
    return [...items, item];
  }

  return items.map((candidate) =>
    candidate.sku === item.sku
      ? { ...candidate, quantity: candidate.quantity + item.quantity }
      : candidate
  );
}

/**
 * Remove an item from a cart by SKU.
 */
export function removeItem(items: CartItem[], sku: string): CartItem[] {
  return items.filter((item) => item.sku !== sku);
}

/**
 * Calculate the total price of items in the cart.
 * Uses client-provided prices.
 */
export function calculateCartTotal(items: CartItem[]): number {
  return items.reduce((total, item) => total + item.price * item.quantity, 0);
}