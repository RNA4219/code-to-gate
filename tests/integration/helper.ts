/**
 * Integration test helper utilities
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const FIXTURES_DIR = path.join(PROJECT_ROOT, "fixtures");
const DIST_CLI = path.join(PROJECT_ROOT, "dist", "cli.js");

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Run the code-to-gate CLI with given arguments
 */
export function runCli(args: string[], cwd: string = PROJECT_ROOT, timeoutMs: number = 60000): RunResult {
  const cmd = `node "${DIST_CLI}" ${args.join(" ")}`;

  let stdout = "";
  let stderr = "";
  let exitCode = 0;

  try {
    stdout = execSync(cmd, {
      cwd,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: timeoutMs,
    });
  } catch (error: unknown) {
    const execError = error as { stdout?: string; stderr?: string; status?: number };
    stdout = execError.stdout || "";
    stderr = execError.stderr || "";
    exitCode = execError.status || 1;
  }

  return { stdout, stderr, exitCode };
}

/**
 * Get fixture path
 */
export function fixturePath(fixtureName: string): string {
  return path.join(FIXTURES_DIR, fixtureName);
}

/**
 * Get schema path
 */
export function schemaPath(schemaName: string): string {
  if (schemaName.includes("/")) {
    return path.join(PROJECT_ROOT, "schemas", schemaName);
  }
  return path.join(PROJECT_ROOT, "schemas", `${schemaName}.schema.json`);
}

/**
 * Read JSON file
 */
export function readJson(filePath: string): unknown {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const content = readFileSync(filePath, "utf8");
  return JSON.parse(content);
}

/**
 * Read YAML file (simple parsing for test purposes)
 */
export function readYaml(filePath: string): Record<string, unknown> {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const content = readFileSync(filePath, "utf8");
  // Simple YAML parsing for basic structures
  const result: Record<string, unknown> = {};
  const lines = content.split("\n");

  for (const line of lines) {
    if (line.startsWith("#") || line.trim() === "") continue;
    const match = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (match) {
      const key = match[1].replace(/-/g, "_");
      const value = match[2].trim();
      if (value === "" || value.startsWith("|")) {
        // Skip complex YAML structures for now
        continue;
      }
      result[key] = value;
    }
  }

  return result;
}

/**
 * Create a temporary output directory for tests
 * Includes retry logic for Windows EPERM race conditions
 */
export function createTempOutDir(testName: string, retries = 3, delayMs = 100): string {
  const tempDir = path.join(PROJECT_ROOT, ".test-temp", testName);

  if (existsSync(tempDir)) {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        rmSync(tempDir, { recursive: true, force: true });
        break;
      } catch (err: any) {
        if (err.code === "EPERM" && attempt < retries - 1) {
          // Windows file lock race condition - wait and retry
          const waitMs = delayMs * (attempt + 1);
          // Busy-wait for small delay (sync function)
          const start = Date.now();
          while (Date.now() - start < waitMs) {}
          continue;
        }
        // On final attempt, try to proceed anyway - directory may be usable
        if (attempt === retries - 1) {
          console.warn(`Warning: Could not remove ${tempDir} (EPERM), proceeding anyway`);
        }
      }
    }
  }

  mkdirSync(tempDir, { recursive: true });
  return tempDir;
}

/**
 * Clean up temporary output directory
 * Includes retry logic for Windows EPERM race conditions
 */
export function cleanupTempDir(tempDir: string, retries = 3, delayMs = 100): void {
  if (existsSync(tempDir)) {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        rmSync(tempDir, { recursive: true, force: true });
        return;
      } catch (err: any) {
        if (err.code === "EPERM" && attempt < retries - 1) {
          const waitMs = delayMs * (attempt + 1);
          const start = Date.now();
          while (Date.now() - start < waitMs) {}
          continue;
        }
        // Silent fail on cleanup - not critical
        console.warn(`Warning: Could not cleanup ${tempDir}: ${err.code}`);
        return;
      }
    }
  }
}

/**
 * Check if file exists
 */
export function fileExists(filePath: string): boolean {
  return existsSync(filePath);
}

/**
 * Get project root path
 */
export function getProjectRoot(): string {
  return PROJECT_ROOT;
}

/**
 * Write a file to the given path
 */
export function writeFile(filePath: string, content: string): void {
  writeFileSync(filePath, content, "utf8");
}

/**
 * Create a test fixture directory with specified files
 */
export function createTestFixture(testName: string, files: Array<{ path: string; content: string }>): string {
  const fixtureDir = path.join(PROJECT_ROOT, ".test-temp", "fixtures", testName);
  if (existsSync(fixtureDir)) {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
  mkdirSync(fixtureDir, { recursive: true });

  for (const file of files) {
    const filePath = path.join(fixtureDir, file.path);
    const dir = path.dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(filePath, file.content, "utf8");
  }

  return fixtureDir;
}

/**
 * Generate a large file content with repetitive patterns
 */
export function generateLargeContent(lines: number, pattern: string = "export function testFunc() { return 1; }"): string {
  const content: string[] = [];
  for (let i = 0; i < lines; i++) {
    content.push(`// Line ${i}`);
    content.push(pattern);
  }
  return content.join("\n");
}