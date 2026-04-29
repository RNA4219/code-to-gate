/**
 * Plugin SDK Type Definitions
 * Based on docs/product-spec-v1.md section 16 and docs/plugin-security-contract.md
 */

export const PLUGIN_INPUT_VERSION = "ctg.plugin-input/v1";
export const PLUGIN_OUTPUT_VERSION = "ctg.plugin-output/v1";
export const PLUGIN_MANIFEST_VERSION = "ctg/v1alpha1";

/**
 * Plugin capability types
 */
export type PluginCapability =
  | "evaluate" // Rule evaluation
  | "parse" // Language parsing
  | "import" // External tool import
  | "report" // Custom reporting
  | "export"; // Downstream export

/**
 * Plugin visibility
 */
export type PluginVisibility = "public" | "private";

/**
 * Plugin kind types
 */
export type PluginKind =
  | "rule-plugin"
  | "language-plugin"
  | "importer-plugin"
  | "reporter-plugin"
  | "exporter-plugin";

/**
 * Plugin manifest security configuration
 */
export interface PluginSecurityConfig {
  network?: boolean;
  filesystem?: {
    read?: string[];
    write?: string[];
  };
  secrets?: {
    allow?: string[];
  };
}

/**
 * Plugin manifest entry configuration
 */
export interface PluginEntryConfig {
  command: string[];
  env?: Record<string, string>;
  timeout?: number; // seconds, default 60
  retry?: number; // retry count, default 1
}

/**
 * Plugin manifest structure
 * Based on docs/plugin-security-contract.md section 3
 */
export interface PluginManifest {
  apiVersion: typeof PLUGIN_MANIFEST_VERSION;
  kind: PluginKind;
  name: string;
  version: string;
  visibility: PluginVisibility;
  description?: string;
  author?: string;
  homepage?: string;
  license?: string;
  entry: PluginEntryConfig;
  capabilities: PluginCapability[];
  receives: string[]; // e.g., ["normalized-repo-graph@v1"]
  returns: string[]; // e.g., ["findings@v1", "risk-seeds@v1"]
  security?: PluginSecurityConfig;
  dependencies?: Array<{
    name: string;
    version?: string;
    optional?: boolean;
  }>;
  metadata?: Record<string, unknown>;
}

/**
 * Plugin input structure
 * Sent to plugin via stdin as JSON
 */
export interface PluginInput {
  version: typeof PLUGIN_INPUT_VERSION;
  repo_graph: unknown; // NormalizedRepoGraph
  imported_findings?: unknown; // FindingsArtifact from external imports
  config?: Record<string, unknown>;
  policy?: unknown;
  metadata?: {
    run_id?: string;
    repo_root?: string;
    work_dir?: string;
  };
}

/**
 * Plugin output structure
 * Received from plugin via stdout as JSON
 */
export interface PluginOutput {
  version: typeof PLUGIN_OUTPUT_VERSION;
  findings?: PluginFinding[];
  risk_seeds?: PluginRiskSeed[];
  invariant_seeds?: PluginInvariantSeed[];
  test_seeds?: PluginTestSeed[];
  diagnostics?: PluginDiagnostic[];
  errors?: PluginError[];
}

/**
 * Plugin finding structure
 * Subset of core Finding type
 */
export interface PluginFinding {
  id: string;
  ruleId: string;
  category: PluginFindingCategory;
  severity: PluginSeverity;
  confidence: number;
  title: string;
  summary: string;
  evidence: PluginEvidenceRef[];
  affectedSymbols?: string[];
  affectedEntrypoints?: string[];
  tags?: string[];
  upstream?: {
    tool: string;
    ruleId?: string;
  };
}

/**
 * Plugin finding categories
 */
export type PluginFindingCategory =
  | "auth"
  | "payment"
  | "validation"
  | "data"
  | "config"
  | "maintainability"
  | "testing"
  | "compatibility"
  | "release-risk"
  | "security";

/**
 * Plugin severity levels
 */
export type PluginSeverity = "low" | "medium" | "high" | "critical";

/**
 * Plugin evidence reference
 */
export interface PluginEvidenceRef {
  id: string;
  path: string;
  startLine?: number;
  endLine?: number;
  kind: "ast" | "text" | "import" | "external" | "test";
  excerptHash?: string;
  nodeId?: string;
  symbolId?: string;
  externalRef?: {
    tool: string;
    ruleId?: string;
    url?: string;
  };
}

/**
 * Plugin risk seed structure
 */
export interface PluginRiskSeed {
  id: string;
  title: string;
  severity: PluginSeverity;
  likelihood: "low" | "medium" | "high" | "unknown";
  impact: string[];
  confidence: number;
  sourceFindingIds: string[];
  evidence: PluginEvidenceRef[];
  narrative?: string;
  recommendedActions: string[];
}

/**
 * Plugin invariant seed structure
 */
export interface PluginInvariantSeed {
  id: string;
  title: string;
  description: string;
  category: "behavior" | "data" | "security" | "performance";
  evidence: PluginEvidenceRef[];
  confidence: number;
}

/**
 * Plugin test seed structure
 */
export interface PluginTestSeed {
  id: string;
  title: string;
  category: "positive" | "negative" | "edge" | "security";
  target: string;
  description: string;
  inputs: Record<string, unknown>;
  expectedOutcome: string;
  sourceRiskId?: string;
  priority: "high" | "medium" | "low";
}

/**
 * Plugin diagnostic structure
 */
export interface PluginDiagnostic {
  id: string;
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  evidence?: PluginEvidenceRef[];
}

/**
 * Plugin error structure
 */
export interface PluginError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Plugin execution status
 */
export type PluginExecutionStatus =
  | "pending"
  | "running"
  | "success"
  | "partial"
  | "failed"
  | "timeout"
  | "invalid_output";

/**
 * Plugin execution result
 */
export interface PluginExecutionResult {
  pluginId: string;
  pluginName: string;
  status: PluginExecutionStatus;
  output?: PluginOutput;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  duration?: number; // milliseconds
  retryCount?: number;
}

/**
 * Plugin load status
 */
export type PluginLoadStatus =
  | "loaded"
  | "manifest_invalid"
  | "manifest_not_found"
  | "schema_invalid"
  | "capability_mismatch";

/**
 * Plugin load result
 */
export interface PluginLoadResult {
  manifest: PluginManifest | null;
  path: string;
  status: PluginLoadStatus;
  errors?: Array<{
    code: string;
    message: string;
    path?: string;
  }>;
}

/**
 * Plugin registry entry
 */
export interface PluginRegistryEntry {
  manifest: PluginManifest;
  path: string;
  loaded: boolean;
  enabled: boolean;
  lastExecution?: PluginExecutionResult;
}

/**
 * Plugin manager configuration
 */
export interface PluginManagerConfig {
  timeout?: number; // default 60 seconds
  retry?: number; // default 1
  parallel?: boolean;
  maxConcurrent?: number;
  workDir?: string;
  validateOutput?: boolean;
  redactionPatterns?: string[];
}

/**
 * Plugin hook types
 */
export type PluginHook =
  | "before_load"
  | "after_load"
  | "before_execute"
  | "after_execute"
  | "on_error"
  | "on_timeout";

/**
 * Plugin hook callback
 */
export type PluginHookCallback = (
  plugin: PluginRegistryEntry,
  context: PluginExecutionContext
) => void | Promise<void>;

/**
 * Plugin execution context
 */
export interface PluginExecutionContext {
  runId: string;
  repoRoot: string;
  workDir: string;
  policyId?: string;
  configHash?: string;
  startTime: Date;
}