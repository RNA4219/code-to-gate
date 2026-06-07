/**
 * Node.js implementation of FileAccess contract
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  statSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import type { FileAccess, FileStats } from "../types/contracts.js";

/**
 * Node.js-based file access implementation
 */
export const nodeFileAccess: FileAccess = {
  readFile(path: string): string | null {
    try {
      return readFileSync(path, "utf8");
    } catch {
      return null;
    }
  },

  writeFile(path: string, content: string): void {
    writeFileSync(path, content, "utf8");
  },

  exists(path: string): boolean {
    return existsSync(path);
  },

  readDir(path: string): string[] {
    try {
      return readdirSync(path);
    } catch {
      return [];
    }
  },

  stat(path: string): FileStats | null {
    try {
      const stats = statSync(path);
      return {
        size: stats.size,
        mtimeMs: stats.mtimeMs,
        isDirectory: stats.isDirectory(),
      };
    } catch {
      return null;
    }
  },

  mkdir(path: string): void {
    mkdirSync(path, { recursive: true });
  },

  remove(path: string): void {
    rmSync(path, { recursive: true, force: true });
  },
};