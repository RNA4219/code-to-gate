/**
 * Application context with injected services.
 * This is the composition point for all application-level operations.
 *
 * The application layer orchestrates via these contracts:
 * - ServiceContext: Core infrastructure services (file, hash, clock, path)
 * - ParserRegistry: Language-specific parsers
 */

import type { ServiceContext, ParserAdapter } from "../types/contracts.js";

/**
 * Extended application context with parser registry
 */
export interface ApplicationContext extends ServiceContext {
  /**
   * Parser adapters by language
   */
  parsers: Map<string, ParserAdapter>;

  /**
   * Tool version for artifact headers
   */
  toolVersion: string;

  /**
   * Check if tree-sitter is initialized
   */
  isTreeSitterReady(): boolean;
}

/**
 * Create an application context with injected services
 */
export function createApplicationContext(
  services: ServiceContext,
  parsers: Map<string, ParserAdapter>,
  toolVersion: string,
  treeSitterReady: boolean = false
): ApplicationContext {
  return {
    ...services,
    parsers,
    toolVersion,
    isTreeSitterReady: () => treeSitterReady,
  };
}