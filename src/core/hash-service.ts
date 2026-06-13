/**
 * Default Hash Service Implementation
 *
 * Provides SHA-256 hashing for ID generation and fingerprinting.
 */

import type { HashService } from "../types/contracts.js";
import { sha256 } from "./path-utils.js";

/**
 * Default implementation of HashService using Node.js crypto
 */
export class DefaultHashService implements HashService {
  /**
   * Generate SHA-256 hash of string content
   * @param value - String to hash
   * @returns Hex-encoded hash string (64 characters)
   */
  sha256(value: string): string {
    return sha256(value);
  }

  /**
   * Generate truncated hash for fingerprinting
   * @param value - String to hash
   * @returns First 16 characters of SHA-256 hash
   */
  fingerprint(value: string): string {
    return sha256(value).slice(0, 16);
  }
}

/**
 * Singleton instance for reuse
 */
export const defaultHashService = new DefaultHashService();