/**
 * Core service contracts for dependency injection.
 * These interfaces define the boundary between pure logic and infrastructure.
 *
 * Layer rules:
 * - types layer: No imports from other src layers (only external type imports)
 * - core layer: Uses these contracts, no direct Node.js API
 * - adapters: Implements these contracts
 * - application: Orchestrates via these contracts
 * - cli: Wires implementations (composition root)
 */

/**
 * File access interface for reading and writing files.
 * Implementations should handle errors gracefully and return null/undefined on failure.
 */
export interface FileAccess {
  /**
   * Read file content as string
   * @returns File content or null if file doesn't exist or can't be read
   */
  readFile(path: string): string | null;

  /**
   * Write content to file
   * @throws Error if write fails
   */
  writeFile(path: string, content: string): void;

  /**
   * Check if path exists
   */
  exists(path: string): boolean;

  /**
   * List directory contents
   * @returns Array of file/directory names, or empty array if path doesn't exist
   */
  readDir(path: string): string[];

  /**
   * Get file/directory stats
   * @returns Stats object or null if path doesn't exist
   */
  stat(path: string): FileStats | null;

  /**
   * Create directory recursively
   */
  mkdir(path: string): void;

  /**
   * Remove file or directory
   */
  remove(path: string): void;
}

/**
 * File/directory statistics
 */
export interface FileStats {
  size: number;
  mtimeMs: number;
  isDirectory: boolean;
}

/**
 * Hash service for generating stable hashes
 */
export interface HashService {
  /**
   * Generate SHA-256 hash of string content
   * @returns Hex-encoded hash string (64 characters)
   */
  sha256(value: string): string;

  /**
   * Generate truncated hash for fingerprinting
   * @returns First 16 characters of SHA-256 hash
   */
  fingerprint(value: string): string;
}

/**
 * Clock service for timestamp generation
 */
export interface ClockService {
  /**
   * Get current ISO 8601 timestamp
   */
  now(): string;

  /**
   * Get current epoch milliseconds
   */
  epochMs(): number;

  /**
   * Generate a unique run ID based on current timestamp
   * Format: ctg-YYYYMMDDHHMMSS
   */
  runId(): string;
}

/**
 * Path service for path operations
 */
export interface PathService {
  /**
   * Join path segments
   */
  join(...segments: string[]): string;

  /**
   * Resolve to absolute path
   */
  resolve(...segments: string[]): string;

  /**
   * Get relative path from one path to another
   */
  relative(from: string, to: string): string;

  /**
   * Get directory name of path
   */
  dirname(path: string): string;

  /**
   * Get base name of path (with optional extension removed)
   */
  basename(path: string, ext?: string): string;

  /**
   * Get extension of path
   */
  extname(path: string): string;

  /**
   * Check if path is absolute
   */
  isAbsolute(path: string): boolean;

  /**
   * Normalize path separators to POSIX format (/)
   */
  toPosix(path: string): string;

  /**
   * Get current working directory
   */
  cwd(): string;
}

/**
 * Parser adapter interface for language-specific parsing
 * This extends the ParseResult from graph.ts with adapter metadata
 */
export interface ParserAdapter {
  /**
   * Language this parser handles
   */
  language: string;

  /**
   * Parser adapter identifier
   */
  adapterId: string;

  /**
   * Parse file content and extract symbols/relations
   */
  parse(content: string, filePath: string, repoRoot: string, fileId: string): ParserAdapterResult;

  /**
   * Check if this parser is available (e.g., WASM loaded)
   */
  isAvailable(): boolean;
}

/**
 * Result from parser adapter
 */
export interface ParserAdapterResult {
  symbols: unknown[];
  relations: unknown[];
  diagnostics: unknown[];
  parserStatus: "parsed" | "text_fallback" | "skipped" | "failed";
  parserAdapter: string;
}

/**
 * Combined application context with all injected services
 */
export interface ServiceContext {
  fileAccess: FileAccess;
  hashService: HashService;
  clockService: ClockService;
  pathService: PathService;
}