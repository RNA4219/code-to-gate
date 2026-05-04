/**
 * Python syntax utilities
 * Symbol classification and decorator handling
 */

import { SymbolNode } from "./py-parser-types.js";
import { getBaseSymbolKind } from "./symbol-kind-utils.js";

/**
 * Check if a decorator indicates a route handler
 */
export function isRouteDecorator(decorator: string): boolean {
  const routeDecorators = [
    "@app.route",
    "@app.get",
    "@app.post",
    "@app.put",
    "@app.delete",
    "@app.patch",
    "@router.route",
    "@router.get",
    "@router.post",
    "@router.put",
    "@router.delete",
    "@router.patch",
    "@api.route",
    "@api.get",
    "@api.post",
    "@api.put",
    "@api.delete",
    "@api.patch",
    "@get",
    "@post",
    "@put",
    "@delete",
    "@patch",
    "@route",
  ];

  // Check for exact match or prefix match
  for (const rd of routeDecorators) {
    if (decorator === rd || decorator.startsWith(rd + "(")) {
      return true;
    }
  }

  return false;
}

/**
 * Get the symbol kind based on name and context
 */
export function getSymbolKind(
  name: string,
  filePath: string,
  isMethod: boolean,
  decorator?: string
): SymbolNode["kind"] {
  // Check decorators for route handlers (Python-specific)
  if (decorator && isRouteDecorator(decorator)) {
    return "route";
  }

  // Check if it's a test method
  if (isMethod && (name.startsWith("test_") || name.startsWith("test"))) {
    return "test";
  }

  // Check common test function patterns
  if (
    name.startsWith("test_") ||
    name.startsWith("test") ||
    name.startsWith("should_") ||
    name.startsWith("should") ||
    name.startsWith("expect_") ||
    name.startsWith("expect")
  ) {
    return "test";
  }

  // Use shared utility for base kind detection
  const baseKind = getBaseSymbolKind(filePath, name);
  if (baseKind) return baseKind;

  // Methods inside classes
  if (isMethod) {
    return "method";
  }

  // Default to function
  return "function";
}

/**
 * Extract decorators from lines before a definition
 */
export function extractDecorators(
  lines: string[],
  lineIndex: number
): string[] {
  const decorators: string[] = [];

  // Look backwards for decorators
  for (let i = lineIndex - 1; i >= 0; i--) {
    const line = lines[i].trim();

    // Skip empty lines and comments
    if (line === "" || line.startsWith("#")) {
      continue;
    }

    // Check if it's a decorator
    if (line.startsWith("@")) {
      decorators.push(line);
    } else {
      // Stop if we hit a non-decorator line
      break;
    }
  }

  // Return in order (top to bottom)
  return decorators.reverse();
}