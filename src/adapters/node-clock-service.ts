/**
 * Node.js implementation of ClockService contract
 */

import type { ClockService } from "../types/contracts.js";

/**
 * Node.js-based clock service implementation
 */
export const nodeClockService: ClockService = {
  now(): string {
    return new Date().toISOString();
  },

  epochMs(): number {
    return Date.now();
  },

  runId(): string {
    const now = new Date();
    // Format: ctg-YYYYMMDDHHMMSS
    const timestamp = now
      .toISOString()
      .replace(/[-:.TZ]/g, "")
      .slice(0, 14);
    return `ctg-${timestamp}`;
  },
};