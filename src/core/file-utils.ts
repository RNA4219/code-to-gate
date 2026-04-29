/**
 * Core file discovery and classification utilities
 */

import { readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { toPosix } from "./path-utils.js";

/**
 * Supported language types for file classification
 */
export type Language = "ts" | "tsx" | "js" | "jsx" | "py" | "unknown";

/**
 * Role types for file classification
 */
export type FileRole = "source" | "test" | "config" | "fixture" | "docs" | "generated" | "unknown";

/**
 * Default directories to ignore when walking
 */
export const DEFAULT_IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  ".qh",
  "dist",
  "coverage",
  ".cache",
  "__pycache__",
  ".svn",
  ".hg",
]);

/**
 * Detect the programming language of a file based on its extension
 * @param filePath - Path to the file
 * @returns Detected language type
 */
export function detectLanguage(filePath: string): Language {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const langMap: Record<string, Language> = {
    ts: "ts",
    tsx: "tsx",
    js: "js",
    jsx: "jsx",
    py: "py",
    mjs: "js",
    cjs: "js",
  };
  return langMap[ext] || "unknown";
}

/**
 * Detect the role/purpose of a file based on its path patterns
 * @param relPath - Relative path to the file (from repo root)
 * @returns Detected file role
 */
export function detectRole(relPath: string): FileRole {
  const normalized = toPosix(relPath);

  // Test patterns
  if (
    normalized.startsWith("tests/") ||
    normalized.startsWith("test/") ||
    normalized.includes("/tests/") ||
    normalized.includes("/test/") ||
    normalized.includes("__tests__/") ||
    normalized.includes(".test.") ||
    normalized.includes(".spec.") ||
    normalized.endsWith("_test.ts") ||
    normalized.endsWith("_test.js") ||
    normalized.endsWith("_test.py")
  ) {
    return "test";
  }

  // Fixture patterns
  if (
    normalized.startsWith("fixtures/") ||
    normalized.startsWith("fixture/") ||
    normalized.startsWith("mocks/") ||
    normalized.startsWith("stubs/") ||
    normalized.startsWith("__mocks__/") ||
    normalized.startsWith("__fixtures__/") ||
    normalized.includes("/fixtures/") ||
    normalized.includes("/fixture/") ||
    normalized.includes("__fixtures__/") ||
    normalized.includes("/mocks/") ||
    normalized.includes("/stubs/") ||
    normalized.includes("__mocks__/")
  ) {
    return "fixture";
  }

  // Documentation patterns
  if (
    normalized.startsWith("docs/") ||
    normalized.includes("/docs/") ||
    normalized.endsWith(".md") ||
    normalized.endsWith(".rst") ||
    normalized.endsWith(".txt") ||
    normalized.endsWith("README") ||
    normalized.endsWith("CHANGELOG") ||
    normalized.endsWith("LICENSE")
  ) {
    return "docs";
  }

  // Config patterns
  if (
    normalized.endsWith("package.json") ||
    normalized.endsWith("tsconfig.json") ||
    normalized.endsWith("jsconfig.json") ||
    normalized.endsWith(".eslintrc.json") ||
    normalized.endsWith(".prettierrc.json") ||
    normalized.endsWith("jest.config.js") ||
    normalized.endsWith("vitest.config.ts") ||
    normalized.endsWith(".yaml") ||
    normalized.endsWith(".yml") ||
    (normalized.endsWith(".json") &&
      (normalized.includes("config") || normalized.includes("settings")))
  ) {
    return "config";
  }

  // Generated patterns
  if (
    normalized.startsWith("dist/") ||
    normalized.startsWith("build/") ||
    normalized.startsWith("generated/") ||
    normalized.startsWith("out/") ||
    normalized.includes("/dist/") ||
    normalized.includes("/build/") ||
    normalized.includes("/generated/") ||
    normalized.includes("__generated__/") ||
    normalized.includes("/out/") ||
    normalized.endsWith(".d.ts")
  ) {
    return "generated";
  }

  return "source";
}

/**
 * Recursively walk a directory and collect all file paths
 * @param dir - Directory to walk
 * @param ignoredDirs - Set of directory names to ignore (defaults to DEFAULT_IGNORED_DIRS)
 * @returns Array of absolute file paths
 */
export function walkDir(dir: string, ignoredDirs?: Set<string>): string[] {
  const ignored = ignoredDirs ?? DEFAULT_IGNORED_DIRS;

  if (!existsSync(dir)) {
    return [];
  }

  try {
    const entries = readdirSync(dir, { withFileTypes: true });

    return entries.flatMap((entry) => {
      if (ignored.has(entry.name)) return [];

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        return walkDir(fullPath, ignored);
      }

      if (entry.isFile()) {
        return [fullPath];
      }

      return [];
    });
  } catch {
    // Handle permission errors or other issues
    return [];
  }
}

/**
 * Check if a file is a target file type for analysis
 * @param filePath - Path to the file
 * @returns True if the file should be analyzed
 */
export function isTargetFile(filePath: string): boolean {
  return (
    /\.(ts|tsx|js|jsx|py|mjs|cjs|json|yaml|yml|md)$/.test(filePath) &&
    !filePath.endsWith(".d.ts")
  );
}

/**
 * Check if a file path suggests it's an entrypoint
 * @param relPath - Relative path to the file
 * @param body - File content (optional, for additional checks)
 * @returns True if the file appears to be an entrypoint
 */
export function isEntrypoint(relPath: string, body?: string): boolean {
  const normalized = toPosix(relPath);

  // Path-based detection
  if (
    normalized.startsWith("api/") ||
    normalized.startsWith("routes/") ||
    normalized.startsWith("handlers/") ||
    normalized.startsWith("controllers/") ||
    normalized.includes("/api/") ||
    normalized.includes("/routes/") ||
    normalized.includes("/handlers/") ||
    normalized.includes("/controllers/") ||
    normalized === "server.ts" ||
    normalized === "server.js" ||
    normalized.startsWith("src/server.ts") ||
    normalized.startsWith("src/server.js") ||
    normalized === "app.ts" ||
    normalized === "app.js" ||
    normalized.startsWith("src/app.ts") ||
    normalized.startsWith("src/app.js") ||
    normalized === "index.ts" ||
    normalized === "index.js" ||
    normalized.startsWith("src/index.ts") ||
    normalized.startsWith("src/index.js") ||
    normalized === "main.ts" ||
    normalized === "main.js" ||
    normalized.startsWith("src/main.ts") ||
    normalized.startsWith("src/main.js") ||
    normalized.includes("/server.ts") ||
    normalized.includes("/server.js") ||
    normalized.includes("/app.ts") ||
    normalized.includes("/app.js") ||
    normalized.includes("/index.ts") ||
    normalized.includes("/index.js") ||
    normalized.includes("/main.ts") ||
    normalized.includes("/main.js")
  ) {
    return true;
  }

  // Content-based detection if body is provided
  if (body) {
    const entrypointPatterns = [
      /app\.use/,
      /app\.listen/,
      /express\(\)/,
      /createServer/,
      /createOrderRoute/,
      /adminRoutes/,
      /accountRoutes/,
      /publicRoutes/,
      /router\./,
      /express\.Router/,
    ];

    for (const pattern of entrypointPatterns) {
      if (pattern.test(body)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Determine the kind of entrypoint based on file path
 * @param relPath - Relative path to the file
 * @returns Entry point kind string
 */
export function entrypointKind(relPath: string): string {
  const normalized = toPosix(relPath);

  if (normalized.includes("admin")) return "admin-route";
  if (normalized.includes("order") || normalized.includes("checkout")) return "checkout-route";
  if (normalized.includes("api")) return "api-route";
  if (normalized.includes("routes") || normalized.includes("router")) return "route";
  if (normalized.includes("server") || normalized.includes("app")) return "server-entry";
  if (normalized.includes("index") || normalized.includes("main")) return "main-entry";

  return "entrypoint";
}

/**
 * Get file statistics (size and line count)
 * @param filePath - Path to the file
 * @param content - File content (optional, will be read if not provided)
 * @returns File statistics object
 */
export function getFileStats(filePath: string, content?: string): {
  sizeBytes: number;
  lineCount: number;
} {
  try {
    const fileContent = content ?? "";
    const stats = statSync(filePath);

    return {
      sizeBytes: stats.size,
      lineCount: fileContent.split(/\r?\n/).length,
    };
  } catch {
    return {
      sizeBytes: 0,
      lineCount: 0,
    };
  }
}

/**
 * Check if a directory exists and is valid
 * @param dirPath - Path to check
 * @returns True if the path is a valid directory
 */
export function isValidDirectory(dirPath: string): boolean {
  try {
    return existsSync(dirPath) && statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Get test framework based on file extension
 * @param filePath - File path
 * @returns Test framework name
 */
export function detectTestFramework(filePath: string): string {
  const ext = path.extname(filePath);

  if (ext === ".py") return "pytest";
  if (ext === ".js") return "node:test";
  if (ext === ".ts" || ext === ".tsx") return "vitest";

  return "unknown";
}