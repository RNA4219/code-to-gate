/**
 * Complex nested structures for testing.
 * Tests deeply nested functions, callbacks, and closures.
 */

import type { CartItem } from "../domain/cart";

/**
 * Outer function with nested inner functions.
 */
export function createNestedProcessor(config: { threshold: number; callback: (result: string) => void }) {
  // Nested function level 1
  function validateItem(item: CartItem): boolean {
    // Nested function level 2
    function checkPrice(): boolean {
      return item.price > 0;
    }
    // Nested function level 2
    function checkQuantity(): boolean {
      return item.quantity > config.threshold;
    }
    return checkPrice() && checkQuantity();
  }

  // Nested function level 1 - async
  async function processItems(items: CartItem[]): Promise<string[]> {
    const results: string[] = [];
    for (const item of items) {
      if (validateItem(item)) {
        // Anonymous callback inside loop
        await new Promise<string>((resolve) => {
          setTimeout(() => {
            resolve(`processed-${item.sku}`);
          }, 10);
        }).then((result) => {
          results.push(result);
          // Callback passed to then
          config.callback(result);
        });
      }
    }
    return results;
  }

  // Return object with nested methods
  return {
    validate: validateItem,
    process: processItems,
    // Nested method
    getConfig: () => ({
      threshold: config.threshold,
      // Deeply nested object with function
      nested: {
        fn: () => config.threshold * 2
      }
    })
  };
}

/**
 * Function with multiple callback patterns.
 */
export function processWithCallbacks(
  items: CartItem[],
  onSuccess: (result: CartItem[]) => void,
  onError: (error: Error) => void
): void {
  // Nested IIFE
  (function validate() {
    try {
      // Callback in forEach
      items.forEach((item) => {
        // Nested function in forEach callback
        function logItem(): void {
          console.log(`Validating: ${item.sku}`);
        }
        logItem();
      });

      // Callback in filter
      const validItems = items.filter((item) => {
        return item.price > 0;
      });

      // Callback in map
      const processedItems = validItems.map((item) => {
        // Object with nested function in map callback
        return {
          ...item,
          processor: () => `${item.sku}-processed`
        };
      });

      onSuccess(processedItems);
    } catch (err) {
      onError(err as Error);
    }
  })();
}

/**
 * Arrow function variations.
 */
export const arrowFunctionVariations = {
  // Simple arrow function
  simple: () => "simple",

  // Arrow function with parameters
  withParams: (x: number) => x * 2,

  // Arrow function with multiple parameters
  multiParams: (a: number, b: number) => a + b,

  // Arrow function returning object
  returningObject: (x: number) => ({ value: x }),

  // Async arrow function
  asyncArrow: async (x: number) => {
    await new Promise(resolve => setTimeout(resolve, 10));
    return x * 3;
  },

  // Arrow function with nested arrow
  nestedArrow: (x: number) => ((y: number) => x + y),

  // Arrow function in arrow function
  doubleNested: (x: number) => {
    const inner = (y: number) => {
      const deepest = (z: number) => x + y + z;
      return deepest;
    };
    return inner;
  }
};

/**
 * Complex function with multiple nested levels.
 */
export function deepNestingExample(data: { items: CartItem[] }): () => () => () => string {
  return () => {
    return () => {
      return () => {
        return `Processed ${data.items.length} items`;
      };
    };
  };
}

/**
 * Factory function creating functions.
 */
export function createCalculator(base: number) {
  return {
    add: (x: number) => base + x,
    subtract: (x: number) => base - x,
    multiply: (x: number) => base * x,
    // Nested factory
    createNested: (factor: number) => ({
      scale: (x: number) => base * factor * x
    })
  };
}

/**
 * Function with closure and nested async.
 */
export async function closureWithAsync(items: CartItem[]): Promise<number> {
  let total = 0;

  // Closure capturing total
  const accumulator = (item: CartItem) => {
    total += item.price * item.quantity;
  };

  // Async function using closure
  async function processBatch(batch: CartItem[]): Promise<void> {
    for (const item of batch) {
      accumulator(item);
      await new Promise(resolve => setTimeout(resolve, 5));
    }
  }

  await processBatch(items);
  return total;
}

/**
 * Anonymous function patterns.
 */
export const anonymousPatterns = {
  // Function expression
  funcExpr: function(x: number) { return x + 1; },

  // Named function expression
  namedExpr: function namedFn(x: number) { return x + 2; },

  // Anonymous in array
  arrayFns: [
    function(x: number) { return x * 2; },
    function(x: number) { return x * 3; },
    (x: number) => x * 4
  ],

  // Anonymous in object
  objFns: {
    a: function(x: number) { return x + 10; },
    b: (x: number) => x + 20
  }
};