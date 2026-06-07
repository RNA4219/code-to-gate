/**
 * Node.js implementation of PathService contract
 */

import path from "node:path";
import type { PathService } from "../types/contracts.js";

/**
 * Convert Windows-style paths to POSIX-style paths
 */
function toPosixInternal(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

/**
 * Node.js-based path service implementation
 */
export const nodePathService: PathService = {
  join(...segments: string[]): string {
    return path.join(...segments);
  },

  resolve(...segments: string[]): string {
    return path.resolve(...segments);
  },

  relative(from: string, to: string): string {
    return path.relative(from, to);
  },

  dirname(filePath: string): string {
    return path.dirname(filePath);
  },

  basename(filePath: string, ext?: string): string {
    return path.basename(filePath, ext);
  },

  extname(filePath: string): string {
    return path.extname(filePath);
  },

  isAbsolute(filePath: string): boolean {
    return path.isAbsolute(filePath);
  },

  toPosix(filePath: string): string {
    return toPosixInternal(filePath);
  },

  cwd(): string {
    return process.cwd();
  },
};