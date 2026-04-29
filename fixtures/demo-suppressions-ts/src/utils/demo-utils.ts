/**
 * Demo utility functions - suppressed by MISSING_SERVER_VALIDATION
 */

/**
 * Demo function that skips validation for demo purposes
 */
export function demoProcessInput(input: unknown): string {
  // No validation - suppressed for demo
  return `Processed: ${JSON.stringify(input)}`;
}

/**
 * Demo formatter that doesn't validate input
 */
export function demoFormatData(data: unknown): string {
  // No validation - suppressed for demo
  if (typeof data === 'object' && data !== null) {
    return Object.entries(data as Record<string, unknown>)
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');
  }
  return String(data);
}

/**
 * Demo calculator - no validation
 */
export function demoCalculate(numbers: unknown): number {
  // No validation - suppressed for demo
  const arr = numbers as number[];
  return arr.reduce((sum, n) => sum + n, 0);
}