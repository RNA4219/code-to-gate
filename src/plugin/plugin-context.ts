/**
 * Plugin Context Implementation
 * Provides runtime context for plugin execution
 */

import type {
  PluginManifest,
  PluginExecutionContext,
} from "./types.js";
import type { PluginContext, PluginLogger, PluginFileSystem, PluginSchemaValidator } from "./contract.js";
import { PLUGIN_CONSTANTS } from "./contract.js";
import { isValidSeverity, isValidCategory } from "./plugin-schema.js";
import { sha256, toPosix } from "../core/index.js";
import * as fs from "fs/promises";
import * as path from "path";

/**
 * Default Plugin Logger Implementation
 */
export class DefaultPluginLogger implements PluginLogger {
  private prefix: string;
  private level: "debug" | "info" | "warn" | "error";

  constructor(pluginName: string, level: "debug" | "info" | "warn" | "error" = "info") {
    this.prefix = `[plugin:${pluginName}]`;
    this.level = level;
  }

  debug(message: string, data?: Record<string, unknown>): void {
    if (this.level === "debug") {
      console.debug(`${this.prefix} DEBUG: ${message}`, data ?? "");
    }
  }

  info(message: string, data?: Record<string, unknown>): void {
    if (this.level === "debug" || this.level === "info") {
      console.info(`${this.prefix} INFO: ${message}`, data ?? "");
    }
  }

  warn(message: string, data?: Record<string, unknown>): void {
    if (this.level !== "error") {
      console.warn(`${this.prefix} WARN: ${message}`, data ?? "");
    }
  }

  error(message: string, data?: Record<string, unknown>): void {
    console.error(`${this.prefix} ERROR: ${message}`, data ?? "");
  }
}

/**
 * Restricted Plugin File System Implementation
 */
export class RestrictedPluginFileSystem implements PluginFileSystem {
  private allowedReadPaths: string[];
  private allowedWritePaths: string[];
  private workDir: string;
  private logger: PluginLogger;

  constructor(
    workDir: string,
    allowedReadPaths: string[],
    logger: PluginLogger
  ) {
    this.workDir = workDir;
    this.allowedReadPaths = allowedReadPaths.map(p => this.normalizePath(p));
    this.allowedWritePaths = [workDir];
    this.logger = logger;
  }

  private normalizePath(p: string): string {
    return toPosix(path.resolve(p));
  }

  async readFile(filePath: string): Promise<string> {
    const normalized = this.normalizePath(filePath);

    if (!this.isPathAllowed(normalized, "read")) {
      throw new Error(`Path not allowed for reading: ${filePath}`);
    }

    try {
      return await fs.readFile(filePath, "utf-8");
    } catch (error) {
      this.logger.error(`Failed to read file: ${filePath}`, { error });
      throw error;
    }
  }

  async exists(filePath: string): Promise<boolean> {
    const normalized = this.normalizePath(filePath);

    if (!this.isPathAllowed(normalized, "read")) {
      return false;
    }

    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async writeWorkFile(filename: string, content: string): Promise<string> {
    const fullPath = path.join(this.workDir, filename);
    const normalized = this.normalizePath(fullPath);

    if (!this.isPathAllowed(normalized, "write")) {
      throw new Error(`Path not allowed for writing: ${fullPath}`);
    }

    try {
      await fs.mkdir(this.workDir, { recursive: true });
      await fs.writeFile(fullPath, content, "utf-8");
      this.logger.debug(`Wrote work file: ${filename}`);
      return fullPath;
    } catch (error) {
      this.logger.error(`Failed to write work file: ${filename}`, { error });
      throw error;
    }
  }

  async readWorkFile(filename: string): Promise<string | null> {
    const fullPath = path.join(this.workDir, filename);

    try {
      return await fs.readFile(fullPath, "utf-8");
    } catch {
      return null;
    }
  }

  async listWorkFiles(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.workDir);
      return files;
    } catch {
      return [];
    }
  }

  async deleteWorkFile(filename: string): Promise<void> {
    const fullPath = path.join(this.workDir, filename);

    try {
      await fs.unlink(fullPath);
      this.logger.debug(`Deleted work file: ${filename}`);
    } catch (error) {
      this.logger.warn(`Failed to delete work file: ${filename}`, { error });
    }
  }

  getAllowedReadPaths(): string[] {
    return [...this.allowedReadPaths];
  }

  getAllowedWritePaths(): string[] {
    return [...this.allowedWritePaths];
  }

  isPathAllowed(filePath: string, mode: "read" | "write"): boolean {
    const normalized = this.normalizePath(filePath);

    if (mode === "read") {
      return this.allowedReadPaths.some(allowed => normalized.startsWith(allowed));
    } else {
      return this.allowedWritePaths.some(allowed => normalized.startsWith(allowed));
    }
  }
}

/**
 * Plugin Schema Validator Implementation
 */
export class PluginSchemaValidatorImpl implements PluginSchemaValidator {
  private secretPatterns: string[];
  private logger: PluginLogger;

  constructor(secretPatterns: string[], logger: PluginLogger) {
    this.secretPatterns = secretPatterns;
    this.logger = logger;
  }

  async validateManifest(manifest: unknown): Promise<{
    valid: boolean;
    errors?: Array<{ path: string; message: string }>;
  }> {
    const errors: Array<{ path: string; message: string }> = [];

    if (!manifest || typeof manifest !== "object") {
      return { valid: false, errors: [{ path: "", message: "Manifest must be an object" }] };
    }

    const m = manifest as Record<string, unknown>;

    // Required fields
    const requiredFields = ["apiVersion", "kind", "name", "version", "visibility", "entry", "capabilities"];
    for (const field of requiredFields) {
      if (!m[field]) {
        errors.push({ path: field, message: `Required field '${field}' is missing` });
      }
    }

    // Validate apiVersion
    if (m.apiVersion !== "ctg/v1" && m.apiVersion !== "ctg/v1alpha1") {
      errors.push({ path: "apiVersion", message: "Invalid apiVersion, must be 'ctg/v1' or 'ctg/v1alpha1'" });
    }

    // Validate kind
    const validKinds = ["rule-plugin", "language-plugin", "importer-plugin", "reporter-plugin", "exporter-plugin"];
    if (!validKinds.includes(m.kind as string)) {
      errors.push({ path: "kind", message: `Invalid kind, must be one of: ${validKinds.join(", ")}` });
    }

    // Validate name
    if (typeof m.name === "string") {
      const namePattern = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
      if (!namePattern.test(m.name)) {
        errors.push({ path: "name", message: "Name must be lowercase alphanumeric with hyphens" });
      }
    }

    // Validate version
    if (typeof m.version === "string") {
      const versionPattern = /^\d+\.\d+\.\d+(-[a-z0-9.]+)?$/;
      if (!versionPattern.test(m.version)) {
        errors.push({ path: "version", message: "Version must be semver format (e.g., 1.0.0)" });
      }
    }

    // Validate visibility
    if (!["public", "private"].includes(m.visibility as string)) {
      errors.push({ path: "visibility", message: "Visibility must be 'public' or 'private'" });
    }

    // Validate entry
    if (m.entry && typeof m.entry === "object") {
      const entry = m.entry as Record<string, unknown>;
      if (!entry.command || !Array.isArray(entry.command) || entry.command.length === 0) {
        errors.push({ path: "entry.command", message: "Entry command must be a non-empty array" });
      }
      if (entry.timeout !== undefined && typeof entry.timeout !== "number") {
        errors.push({ path: "entry.timeout", message: "Timeout must be a number" });
      }
    }

    // Validate capabilities
    if (m.capabilities && Array.isArray(m.capabilities)) {
      const validCapabilities = ["evaluate", "parse", "import", "report", "export"];
      for (const cap of m.capabilities) {
        if (!validCapabilities.includes(cap as string)) {
          errors.push({ path: "capabilities", message: `Invalid capability: ${cap}` });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  async validateOutput(
    output: unknown,
    expectedSchemas: string[]
  ): Promise<{
    valid: boolean;
    errors?: Array<{ path: string; message: string }>;
  }> {
    const errors: Array<{ path: string; message: string }> = [];

    if (!output || typeof output !== "object") {
      return { valid: false, errors: [{ path: "", message: "Output must be an object" }] };
    }

    const o = output as Record<string, unknown>;

    // Validate version
    if (o.version !== "ctg.plugin-output/v1") {
      errors.push({ path: "version", message: "Invalid output version" });
    }

    // Validate findings if present
    if (o.findings && Array.isArray(o.findings)) {
      for (let i = 0; i < o.findings.length; i++) {
        const findingErrors = this.validateFinding(o.findings[i], `findings[${i}]`);
        errors.push(...findingErrors);
      }
    }

    // Validate risk_seeds if present
    if (o.risk_seeds && Array.isArray(o.risk_seeds)) {
      for (let i = 0; i < o.risk_seeds.length; i++) {
        const riskErrors = this.validateRiskSeed(o.risk_seeds[i], `risk_seeds[${i}]`);
        errors.push(...riskErrors);
      }
    }

    // Validate diagnostics if present
    if (o.diagnostics && Array.isArray(o.diagnostics)) {
      for (let i = 0; i < o.diagnostics.length; i++) {
        const diag = o.diagnostics[i] as Record<string, unknown>;
        if (!diag.id || !diag.severity || !diag.code || !diag.message) {
          errors.push({ path: `diagnostics[${i}]`, message: "Diagnostic missing required fields" });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  private validateFinding(
    finding: unknown,
    basePath: string
  ): Array<{ path: string; message: string }> {
    const errors: Array<{ path: string; message: string }> = [];

    if (!finding || typeof finding !== "object") {
      errors.push({ path: basePath, message: "Finding must be an object" });
      return errors;
    }

    const f = finding as Record<string, unknown>;

    // Required fields
    if (!f.id) errors.push({ path: `${basePath}.id`, message: "Finding id required" });
    if (!f.ruleId) errors.push({ path: `${basePath}.ruleId`, message: "Finding ruleId required" });
    if (!f.category || !isValidCategory(f.category as string)) {
      errors.push({ path: `${basePath}.category`, message: "Invalid category" });
    }
    if (!f.severity || !isValidSeverity(f.severity as string)) {
      errors.push({ path: `${basePath}.severity`, message: "Invalid severity" });
    }
    if (typeof f.confidence !== "number" || f.confidence < 0 || f.confidence > 1) {
      errors.push({ path: `${basePath}.confidence`, message: "Confidence must be between 0 and 1" });
    }
    if (!f.title) errors.push({ path: `${basePath}.title`, message: "Finding title required" });
    if (!f.summary) errors.push({ path: `${basePath}.summary`, message: "Finding summary required" });
    if (!f.evidence || !Array.isArray(f.evidence)) {
      errors.push({ path: `${basePath}.evidence`, message: "Finding evidence required" });
    }

    return errors;
  }

  private validateRiskSeed(
    risk: unknown,
    basePath: string
  ): Array<{ path: string; message: string }> {
    const errors: Array<{ path: string; message: string }> = [];

    if (!risk || typeof risk !== "object") {
      errors.push({ path: basePath, message: "Risk seed must be an object" });
      return errors;
    }

    const r = risk as Record<string, unknown>;

    if (!r.id) errors.push({ path: `${basePath}.id`, message: "Risk seed id required" });
    if (!r.title) errors.push({ path: `${basePath}.title`, message: "Risk seed title required" });
    if (!r.severity || !isValidSeverity(r.severity as string)) {
      errors.push({ path: `${basePath}.severity`, message: "Invalid severity" });
    }

    return errors;
  }

  async validateEvidence(evidence: unknown): Promise<{
    valid: boolean;
    errors?: Array<{ path: string; message: string }>;
  }> {
    const errors: Array<{ path: string; message: string }> = [];

    if (!evidence || typeof evidence !== "object") {
      return { valid: false, errors: [{ path: "", message: "Evidence must be an object" }] };
    }

    const e = evidence as Record<string, unknown>;

    if (!e.id) errors.push({ path: "id", message: "Evidence id required" });
    if (!e.path) errors.push({ path: "path", message: "Evidence path required" });

    const validKinds = ["ast", "text", "import", "external", "test"];
    if (!e.kind || !validKinds.includes(e.kind as string)) {
      errors.push({ path: "kind", message: "Invalid evidence kind" });
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  async detectSecretLeak(data: unknown): Promise<{
    detected: boolean;
    patterns?: string[];
    locations?: Array<{ path: string; pattern: string }>;
  }> {
    const locations: Array<{ path: string; pattern: string }> = [];
    const detectedPatterns: string[] = [];

    const checkObject = (obj: unknown, path: string): void => {
      if (typeof obj === "string") {
        for (const pattern of this.secretPatterns) {
          if (obj.toLowerCase().includes(pattern.toLowerCase())) {
            detectedPatterns.push(pattern);
            locations.push({ path, pattern });
          }
        }
      } else if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
          checkObject(obj[i], `${path}[${i}]`);
        }
      } else if (obj && typeof obj === "object") {
        for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
          checkObject(value, `${path}.${key}`);
        }
      }
    };

    checkObject(data, "");

    return {
      detected: locations.length > 0,
      patterns: detectedPatterns.length > 0 ? detectedPatterns : undefined,
      locations: locations.length > 0 ? locations : undefined,
    };
  }
}

/**
 * Create Plugin Context
 */
export function createPluginContext(
  manifest: PluginManifest,
  executionContext: PluginExecutionContext,
  config?: Record<string, unknown>,
  policy?: unknown
): PluginContext {
  const logger = new DefaultPluginLogger(manifest.name, "info");

  // Resolve allowed read paths
  const allowedReadPaths: string[] = [];
  if (manifest.security?.filesystem?.read) {
    for (const p of manifest.security.filesystem.read) {
      const resolved = p
        .replace("${repoRoot}", executionContext.repoRoot)
        .replace("${workDir}", executionContext.workDir);
      allowedReadPaths.push(resolved);
    }
  } else {
    allowedReadPaths.push(executionContext.repoRoot);
  }

  const fsImpl = new RestrictedPluginFileSystem(
    executionContext.workDir,
    allowedReadPaths,
    logger
  );

  const validator = new PluginSchemaValidatorImpl(
    [...PLUGIN_CONSTANTS.SECRET_PATTERNS],
    logger
  );

  return {
    manifest,
    executionContext,
    config,
    policy,
    logger,
    fs: fsImpl,
    validator,
  };
}

/**
 * Create default plugin context for testing
 */
export function createTestPluginContext(
  manifest: PluginManifest,
  repoRoot: string = "/test/repo",
  workDir: string = "/test/work"
): PluginContext {
  return createPluginContext(
    manifest,
    {
      runId: "test-run",
      repoRoot,
      workDir,
      startTime: new Date(),
    },
    {},
    {}
  );
}