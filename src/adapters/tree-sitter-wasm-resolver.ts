/**
 * Tree-sitter WASM path resolver
 *
 * Resolves WASM grammar paths for Node.js and browser environments.
 */

import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/**
 * Resolve WASM grammar path for a given language
 *
 * In Node.js: returns path to node_modules/tree-sitter-{lang}/*.wasm
 * In browser: returns CDN URL
 */
export function resolveWasmPath(language: string): string {
  // Check if running in Node.js
  if (typeof process !== "undefined" && process.versions?.node) {
    try {
      // Resolve WASM file from node_modules
      const packageName = `tree-sitter-${language}`;
      const wasmFileName = `tree-sitter-${language}.wasm`;

      // Use require.resolve to find package directory
      const packageDir = path.dirname(require.resolve(`${packageName}/package.json`));
      const wasmPath = path.join(packageDir, wasmFileName);

      return wasmPath;
    } catch {
      // Fallback to CDN if package not found
      return getWasmCdnUrl(language);
    }
  }

  // Browser environment: use CDN
  return getWasmCdnUrl(language);
}

/**
 * Load WASM grammar as Buffer (Node.js only)
 *
 * In Node.js: reads WASM file from node_modules and returns Buffer
 * In browser: returns null (use URL-based loading)
 */
export function loadWasmBuffer(language: string): Buffer | null {
  if (typeof process === "undefined" || !process.versions?.node) {
    return null; // Browser environment - use URL
  }

  try {
    const wasmPath = resolveWasmPath(language);
    if (fs.existsSync(wasmPath)) {
      return fs.readFileSync(wasmPath);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get CDN URL for WASM grammar
 */
function getWasmCdnUrl(language: string): string {
  return `https://tree-sitter.github.io/tree-sitter/assets/wasm/tree-sitter-${language}.wasm`;
}

/**
 * List of supported tree-sitter languages
 */
export const SUPPORTED_TREE_SITTER_LANGUAGES = [
  "python",
  "ruby",
  "go",
  "rust",
  "javascript",
  "typescript",
  "java",
  "c",
  "cpp",
  "php",
  "json",
  "yaml",
  "html",
  "css",
  "markdown",
  "bash",
  "sql",
] as const;

export type TreeSitterLanguage = typeof SUPPORTED_TREE_SITTER_LANGUAGES[number];

/**
 * Check if tree-sitter language package is installed
 */
export function isLanguagePackageInstalled(language: string): boolean {
  if (typeof process === "undefined" || !process.versions?.node) {
    return false; // Browser environment
  }

  try {
    const packageName = `tree-sitter-${language}`;
    require.resolve(`${packageName}/package.json`);
    return true;
  } catch {
    return false;
  }
}