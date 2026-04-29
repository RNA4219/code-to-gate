/**
 * Core path handling utilities
 */

import { createHash } from "node:crypto";
import path from "node:path";

/**
 * Convert Windows-style paths to POSIX-style paths
 * @param value - Path string to convert
 * @returns POSIX-style path with forward slashes
 */
export function toPosix(value: string): string {
  return value.replace(/\\/g, "/");
}

/**
 * Generate SHA-256 hash of a string value
 * @param value - String to hash
 * @returns Hex-encoded SHA-256 hash
 */
export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Get the relative path from a base directory to a target file
 * @param basePath - Base directory path
 * @param targetPath - Target file path
 * @returns Relative path in POSIX format
 */
export function getRelativePath(basePath: string, targetPath: string): string {
  return toPosix(path.relative(basePath, targetPath));
}

/**
 * Join path segments and convert to POSIX format
 * @param segments - Path segments to join
 * @returns POSIX-style joined path
 */
export function joinPosix(...segments: string[]): string {
  return toPosix(path.join(...segments));
}

/**
 * Resolve path to absolute and convert to POSIX format
 * @param segments - Path segments to resolve
 * @returns POSIX-style absolute path
 */
export function resolvePosix(...segments: string[]): string {
  return toPosix(path.resolve(...segments));
}

/**
 * Check if a path is an absolute path
 * @param filePath - Path to check
 * @returns True if the path is absolute
 */
export function isAbsolutePath(filePath: string): boolean {
  return path.isAbsolute(filePath);
}

/**
 * Get the file extension from a path
 * @param filePath - File path
 * @returns Extension including the dot (e.g., ".ts") or empty string
 */
export function getExtension(filePath: string): string {
  // Handle hidden files like .gitignore, .env
  const baseName = path.basename(filePath);
  if (baseName.startsWith(".") && baseName.length > 1 && !baseName.includes(".", 1)) {
    // File like .gitignore - the entire name after the dot is the "extension"
    return baseName;
  }
  return path.extname(filePath);
}

/**
 * Get the directory name from a path
 * @param filePath - File path
 * @returns Directory portion of the path
 */
export function getDirectoryName(filePath: string): string {
  return path.dirname(filePath);
}

/**
 * Get the base name (file name) from a path
 * @param filePath - File path
 * @returns File name portion of the path
 */
export function getBaseName(filePath: string): string {
  return path.basename(filePath);
}

/**
 * Normalize a path and convert to POSIX format
 * @param filePath - Path to normalize
 * @returns Normalized POSIX-style path
 */
export function normalizePosix(filePath: string): string {
  return toPosix(path.normalize(filePath));
}