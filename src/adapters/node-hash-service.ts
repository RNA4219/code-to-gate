/**
 * Node.js implementation of HashService contract
 */

import { createHash } from "node:crypto";
import type { HashService } from "../types/contracts.js";

/**
 * Node.js-based hash service implementation using crypto module
 */
export const nodeHashService: HashService = {
  sha256(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  },

  fingerprint(value: string): string {
    // Return first 16 characters of SHA-256 for compact fingerprints
    return createHash("sha256").update(value).digest("hex").slice(0, 16);
  },
};