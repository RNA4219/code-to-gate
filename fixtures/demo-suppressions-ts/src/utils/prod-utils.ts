/**
 * Production utility functions - proper validation
 * This file should NOT be suppressed
 */

/**
 * Process input with proper validation
 */
export function processInput(input: unknown): string | null {
  if (input === null || input === undefined) {
    return null;
  }

  if (typeof input !== 'object') {
    return null;
  }

  // Validated processing
  return `Processed: ${JSON.stringify(input)}`;
}

/**
 * Format data with validation
 */
export function formatData(data: unknown): string {
  if (typeof data !== 'object' || data === null) {
    return 'Invalid data';
  }

  return Object.entries(data as Record<string, unknown>)
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ');
}

/**
 * Calculate with validation
 */
export function calculate(numbers: unknown): number {
  if (!Array.isArray(numbers)) {
    return 0;
  }

  return numbers.reduce((sum, n) => {
    if (typeof n === 'number') {
      return sum + n;
    }
    return sum;
  }, 0);
}