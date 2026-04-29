/**
 * Plugin Contract Interfaces
 * Defines the contract between code-to-gate core and plugins
 * Based on docs/plugin-security-contract.md
 */

import type {
  PluginManifest,
  PluginInput,
  PluginOutput,
  PluginExecutionResult,
  PluginLoadResult,
  PluginRegistryEntry,
  PluginManagerConfig,
  PluginHook,
  PluginHookCallback,
  PluginExecutionContext,
  PluginCapability,
} from "./types.js";

/**
 * Plugin Context Interface
 * Provides runtime context for plugin execution
 */
export interface PluginContext {
  /** Plugin manifest */
  manifest: PluginManifest;

  /** Execution context */
  executionContext: PluginExecutionContext;

  /** Configuration passed to plugin */
  config?: Record<string, unknown>;

  /** Policy configuration */
  policy?: unknown;

  /** Logger instance */
  logger: PluginLogger;

  /** File system access (restricted) */
  fs: PluginFileSystem;

  /** Schema validator */
  validator: PluginSchemaValidator;
}

/**
 * Plugin Logger Interface
 */
export interface PluginLogger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

/**
 * Plugin File System Interface (Restricted)
 */
export interface PluginFileSystem {
  /** Read file within allowed paths */
  readFile(path: string): Promise<string>;

  /** Check if file exists within allowed paths */
  exists(path: string): Promise<boolean>;

  /** Write to plugin work directory */
  writeWorkFile(filename: string, content: string): Promise<string>;

  /** Read from plugin work directory */
  readWorkFile(filename: string): Promise<string | null>;

  /** List files in plugin work directory */
  listWorkFiles(): Promise<string[]>;

  /** Delete file from plugin work directory */
  deleteWorkFile(filename: string): Promise<void>;

  /** Get allowed read paths */
  getAllowedReadPaths(): string[];

  /** Get allowed write paths */
  getAllowedWritePaths(): string[];

  /** Check if path is within allowed bounds */
  isPathAllowed(path: string, mode: "read" | "write"): boolean;
}

/**
 * Plugin Schema Validator Interface
 */
export interface PluginSchemaValidator {
  /** Validate plugin manifest */
  validateManifest(manifest: unknown): Promise<{
    valid: boolean;
    errors?: Array<{ path: string; message: string }>;
  }>;

  /** Validate plugin output */
  validateOutput(output: unknown, expectedSchemas: string[]): Promise<{
    valid: boolean;
    errors?: Array<{ path: string; message: string }>;
  }>;

  /** Validate evidence reference */
  validateEvidence(evidence: unknown): Promise<{
    valid: boolean;
    errors?: Array<{ path: string; message: string }>;
  }>;

  /** Check for secret leak patterns */
  detectSecretLeak(data: unknown): Promise<{
    detected: boolean;
    patterns?: string[];
    locations?: Array<{ path: string; pattern: string }>;
  }>;
}

/**
 * Plugin Loader Interface
 */
export interface PluginLoader {
  /** Load plugin manifest from path */
  loadManifest(path: string): Promise<PluginLoadResult>;

  /** Validate manifest structure */
  validateManifest(manifest: unknown): Promise<{
    valid: boolean;
    errors?: Array<{ code: string; message: string; path?: string }>;
  }>;

  /** Parse YAML or JSON manifest */
  parseManifest(content: string, format: "yaml" | "json"): Promise<PluginManifest | null>;

  /** Check plugin capabilities match requirements */
  checkCapabilities(
    manifest: PluginManifest,
    requiredCapabilities: PluginCapability[]
  ): boolean;

  /** Resolve plugin dependencies */
  resolveDependencies(manifest: PluginManifest): Promise<{
    resolved: boolean;
    missing?: string[];
  }>;
}

/**
 * Plugin Runner Interface
 */
export interface PluginRunner {
  /** Initialize runner with config */
  initialize(config: PluginManagerConfig): Promise<void>;

  /** Execute a single plugin */
  executePlugin(
    entry: PluginRegistryEntry,
    input: PluginInput
  ): Promise<PluginExecutionResult>;

  /** Execute multiple plugins */
  executePlugins(
    entries: PluginRegistryEntry[],
    input: PluginInput
  ): Promise<PluginExecutionResult[]>;

  /** Register hook callback */
  registerHook(hook: PluginHook, callback: PluginHookCallback): void;

  /** Unregister hook callback */
  unregisterHook(hook: PluginHook, callback: PluginHookCallback): void;

  /** Set timeout for execution */
  setTimeout(pluginName: string, timeoutMs: number): void;

  /** Check if plugin is healthy */
  healthCheck(entry: PluginRegistryEntry): Promise<{
    healthy: boolean;
    issues?: string[];
  }>;

  /** Shutdown runner */
  shutdown(): Promise<void>;
}

/**
 * Plugin Manager Interface
 */
export interface PluginManager {
  /** Load plugins from paths */
  loadPlugins(paths: string[]): Promise<PluginLoadResult[]>;

  /** Get loaded plugins */
  getPlugins(): PluginRegistryEntry[];

  /** Get plugin by name */
  getPlugin(name: string): PluginRegistryEntry | undefined;

  /** Enable/disable plugin */
  setPluginEnabled(name: string, enabled: boolean): void;

  /** Run all enabled plugins */
  runAll(input: PluginInput): Promise<PluginExecutionResult[]>;

  /** Run specific plugin */
  runPlugin(name: string, input: PluginInput): Promise<PluginExecutionResult>;

  /** Validate all plugins */
  validateAll(): Promise<{
    valid: boolean;
    invalidPlugins: Array<{ name: string; errors: string[] }>;
  }>;

  /** Get plugin diagnostics */
  getDiagnostics(): Array<{
    plugin: string;
    status: string;
    lastRun?: Date;
    errors?: string[];
  }>;

  /** Register hook */
  registerHook(hook: PluginHook, callback: PluginHookCallback): void;

  /** Cleanup resources */
  cleanup(): Promise<void>;
}

/**
 * Plugin Provider Interface
 * For plugin implementations to follow
 */
export interface PluginProvider {
  /** Get plugin manifest */
  getManifest(): PluginManifest;

  /** Initialize plugin */
  initialize(context: PluginContext): Promise<void>;

  /** Execute plugin */
  execute(input: PluginInput): Promise<PluginOutput>;

  /** Cleanup plugin */
  cleanup(): Promise<void>;

  /** Health check */
  healthCheck(): Promise<{ healthy: boolean; issues?: string[] }>;
}

/**
 * Plugin Rule Provider Interface
 * Specialized interface for rule evaluation plugins
 */
export interface PluginRuleProvider extends PluginProvider {
  /** Get supported rule IDs */
  getSupportedRules(): string[];

  /** Evaluate single rule */
  evaluateRule(
    ruleId: string,
    context: PluginRuleContext
  ): Promise<PluginRuleResult>;
}

/**
 * Plugin Rule Evaluation Context
 */
export interface PluginRuleContext {
  /** Target file path */
  filePath: string;

  /** File content */
  fileContent: string;

  /** AST or parsed representation */
  parsedContent?: unknown;

  /** Related symbols */
  symbols?: Array<{
    id: string;
    name: string;
    kind: string;
  }>;

  /** Related relations */
  relations?: Array<{
    from: string;
    to: string;
    kind: string;
  }>;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Plugin Rule Evaluation Result
 */
export interface PluginRuleResult {
  /** Rule ID */
  ruleId: string;

  /** Whether rule matched */
  matched: boolean;

  /** Confidence level */
  confidence: number;

  /** Evidence for match */
  evidence: Array<{
    path: string;
    startLine: number;
    endLine?: number;
    excerpt?: string;
    excerptHash?: string;
  }>;

  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Plugin Language Provider Interface
 * Specialized interface for language adapter plugins
 */
export interface PluginLanguageProvider extends PluginProvider {
  /** Get supported languages */
  getSupportedLanguages(): string[];

  /** Parse file */
  parseFile(
    filePath: string,
    content: string
  ): Promise<PluginParseResult>;

  /** Detect language from file */
  detectLanguage(filePath: string, content: string): string | null;

  /** Extract symbols */
  extractSymbols(parsedContent: unknown): Promise<PluginSymbol[]>;

  /** Extract relations */
  extractRelations(parsedContent: unknown): Promise<PluginRelation[]>;
}

/**
 * Plugin Parse Result
 */
export interface PluginParseResult {
  /** Parse status */
  status: "parsed" | "text_fallback" | "failed";

  /** Parsed content */
  parsed?: unknown;

  /** Error message if failed */
  error?: string;

  /** Diagnostics */
  diagnostics?: Array<{
    severity: "info" | "warning" | "error";
    message: string;
    line?: number;
  }>;
}

/**
 * Plugin Symbol
 */
export interface PluginSymbol {
  id: string;
  name: string;
  kind: "function" | "class" | "method" | "variable" | "type" | "interface";
  exported: boolean;
  async?: boolean;
  line?: number;
  endLine?: number;
}

/**
 * Plugin Relation
 */
export interface PluginRelation {
  from: string;
  to: string;
  kind: "imports" | "exports" | "calls" | "references";
  confidence: number;
  line?: number;
}

/**
 * Plugin Exporter Provider Interface
 * Specialized interface for downstream export plugins
 */
export interface PluginExporterProvider extends PluginProvider {
  /** Get supported export targets */
  getSupportedTargets(): string[];

  /** Export artifacts */
  export(
    artifacts: Record<string, unknown>,
    target: string
  ): Promise<{
    success: boolean;
    output?: unknown;
    error?: string;
  }>;
}

/**
 * Plugin Importer Provider Interface
 * Specialized interface for external tool import plugins
 */
export interface PluginImporterProvider extends PluginProvider {
  /** Get supported import tools */
  getSupportedTools(): string[];

  /** Import external tool result */
  import(
    tool: string,
    input: unknown
  ): Promise<{
    success: boolean;
    findings?: PluginProvider[];
    error?: string;
  }>;
}

/**
 * Plugin Contract Constants
 */
export const PLUGIN_CONSTANTS = {
  /** Default timeout in seconds */
  DEFAULT_TIMEOUT: 60,

  /** Default retry count */
  DEFAULT_RETRY: 1,

  /** Maximum findings per plugin */
  MAX_FINDINGS_PER_PLUGIN: 1000,

  /** Maximum evidence per finding */
  MAX_EVIDENCE_PER_FINDING: 10,

  /** Minimum confidence threshold */
  MIN_CONFIDENCE: 0.1,

  /** Maximum confidence */
  MAX_CONFIDENCE: 1.0,

  /** Secret leak patterns */
  SECRET_PATTERNS: [
    "api_key",
    "apikey",
    "token",
    "password",
    "secret",
    "credential",
    "private_key",
    "access_key",
    "auth_token",
  ],

  /** Exit codes */
  EXIT_CODES: {
    SUCCESS: 0,
    PLUGIN_FAILED: 6,
    SCHEMA_INVALID: 7,
    TIMEOUT: 62,
    INTERNAL_ERROR: 10,
  },
} as const;