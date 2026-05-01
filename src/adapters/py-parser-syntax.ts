/**
 * Python syntax utilities
 * Symbol classification and decorator handling
 */

import { SymbolNode } from "./py-parser-types.js";

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
  // Check if it's a test file
  if (
    filePath.includes("/tests/") ||
    filePath.includes("/test/") ||
    filePath.includes("_test.py") ||
    filePath.includes("test_") ||
    filePath.endsWith(".spec.py")
  ) {
    return "test";
  }

  // Check decorators for route handlers
  if (decorator && isRouteDecorator(decorator)) {
    return "route";
  }

  // Check if function name contains 'route'
  if (name.includes("route") || name.includes("handler") || name.includes("endpoint")) {
    return "route";
  }

  // Check if it's a test method
  if (isMethod && (name.startsWith("test_") || name.startsWith("test"))) {
    return "test";
  }

  // Check if it's a route method (common patterns)
  if (
    isMethod &&
    (name === "get" ||
      name === "post" ||
      name === "put" ||
      name === "delete" ||
      name === "patch")
  ) {
    return "route";
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