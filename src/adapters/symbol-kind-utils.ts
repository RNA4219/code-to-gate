/**
 * Symbol kind utilities
 * Shared functions for determining symbol kinds across adapters
 */

import type { SymbolNode } from "../types/graph.js";

/**
 * Check if a file path indicates a test file
 */
export function isTestFilePath(filePath: string): boolean {
  return (
    filePath.includes("/tests/") ||
    filePath.includes("/test/") ||
    filePath.includes("__tests__/") ||
    filePath.includes(".test.") ||
    filePath.includes(".spec.") ||
    filePath.endsWith("_test.py") ||
    filePath.startsWith("test_") ||
    filePath.endsWith("_spec.rb") ||
    filePath.endsWith("Test.java") ||
    filePath.endsWith("Tests.java") ||
    filePath.endsWith("_test.go") ||
    filePath.endsWith("_test.rs") ||
    filePath.endsWith("Test.php")
  );
}

/**
 * Check if a name indicates a route/handler/controller
 */
export function isRouteSymbolName(name: string): boolean {
  const lowered = name.toLowerCase();
  return (
    lowered.includes("route") ||
    lowered.includes("handler") ||
    lowered.includes("controller") ||
    lowered.includes("endpoint")
  );
}

/**
 * Get base symbol kind from file path and name
 * Returns "test" or "route" if detected, otherwise undefined
 */
export function getBaseSymbolKind(filePath: string, name: string): SymbolNode["kind"] | undefined {
  if (isTestFilePath(filePath)) {
    return "test";
  }
  if (isRouteSymbolName(name)) {
    return "route";
  }
  return undefined;
}

/**
 * Map node type string to symbol kind (for JS/TS-like languages)
 */
export function mapNodeTypeToKind(nodeType: string): SymbolNode["kind"] {
  switch (nodeType) {
    case "FunctionDeclaration":
    case "ArrowFunctionExpression":
      return "function";
    case "ClassDeclaration":
      return "class";
    case "MethodDefinition":
    case "MethodDeclaration":
      return "method";
    case "VariableDeclarator":
      return "variable";
    case "InterfaceDeclaration":
      return "interface";
    case "TypeAliasDeclaration":
      return "type";
    default:
      return "unknown";
  }
}