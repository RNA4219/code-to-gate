/**
 * Server-side validation for order requests
 */

export function validateQuantity(quantity: number): boolean {
  return quantity >= 1 && quantity <= 100;
}

export function validatePrice(price: number): boolean {
  return price > 0 && price < 1000000;
}

export function validateOrderItems(items: Array<{ sku: string; quantity: number; price: number }>): boolean {
  return items.every(item => validateQuantity(item.quantity) && validatePrice(item.price));
}