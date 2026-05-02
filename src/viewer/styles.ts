/**
 * Embedded CSS styles for the web viewer
 *
 * Self-contained CSS with no external dependencies.
 * Supports dark mode via CSS custom properties.
 */

import { BASE_CSS } from "./base-css.js";
import { MERMAID_CSS } from "./mermaid-css.js";

// Re-export CSS constants for direct access
export { BASE_CSS, MERMAID_CSS };

/**
 * Get the base CSS styles for the web viewer
 */
export function getBaseStyles(): string {
  return BASE_CSS;
}

/**
 * Get additional Mermaid-specific styles
 */
export function getMermaidStyles(): string {
  return MERMAID_CSS;
}

/**
 * Get all combined styles
 */
export function getAllStyles(): string {
  return BASE_CSS + MERMAID_CSS;
}