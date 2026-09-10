/**
 * Node.js implementation of ClockService contract
 */

import type { ClockService } from "../types/contracts.js";
import { createUniqueRunId } from "../utils/run-id.js";

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
    return createUniqueRunId("ctg");
  },
};
