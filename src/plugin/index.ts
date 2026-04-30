/**
 * Plugin SDK Module
 * Main entry point for code-to-gate Plugin Development Kit
 *
 * Based on docs/product-spec-v1.md section 16 and docs/plugin-security-contract.md
 *
 * @example Loading a plugin
 * ```typescript
 * import { createPluginLoader, createPluginRunner } from '@quality-harness/code-to-gate/plugin';
 *
 * const loader = createPluginLoader();
 * const result = await loader.loadManifest('./my-plugin');
 *
 * if (result.status === 'loaded') {
 *   const runner = createPluginRunner();
 *   await runner.initialize({ timeout: 60 });
 *
 *   const input = createPluginInput(repoGraph);
 *   const execution = await runner.executePlugin({
 *     manifest: result.manifest!,
 *     path: result.path,
 *     loaded: true,
 *     enabled: true,
 *   }, input);
 * }
 * ```
 */

// === Type Definitions ===
export {
  PLUGIN_INPUT_VERSION,
  PLUGIN_OUTPUT_VERSION,
  PLUGIN_MANIFEST_VERSION,
  PluginCapability,
  PluginVisibility,
  PluginKind,
  PluginSecurityConfig,
  PluginEntryConfig,
  PluginManifest,
  PluginInput,
  PluginOutput,
  PluginFinding,
  PluginFindingCategory,
  PluginSeverity,
  PluginEvidenceRef,
  PluginRiskSeed,
  PluginInvariantSeed,
  PluginTestSeed,
  PluginDiagnostic,
  PluginError,
  PluginExecutionStatus,
  PluginExecutionResult,
  PluginLoadStatus,
  PluginLoadResult,
  PluginRegistryEntry,
  PluginManagerConfig,
  PluginHook,
  PluginHookCallback,
  PluginExecutionContext,
} from "./types.js";

// === Contract Interfaces ===
export {
  PluginContext,
  PluginLogger,
  PluginFileSystem,
  PluginSchemaValidator,
  PluginLoader,
  PluginRunner,
  PluginManager,
  PluginProvider,
  PluginRuleProvider,
  PluginRuleContext,
  PluginRuleResult,
  PluginLanguageProvider,
  PluginParseResult,
  PluginSymbol,
  PluginRelation,
  PluginExporterProvider,
  PluginImporterProvider,
  PLUGIN_CONSTANTS,
} from "./contract.js";

// === Schema Definitions ===
export {
  PLUGIN_MANIFEST_SCHEMA,
  PLUGIN_INPUT_SCHEMA,
  PLUGIN_OUTPUT_SCHEMA,
  VALID_PLUGIN_KINDS,
  VALID_PLUGIN_CAPABILITIES,
  VALID_PLUGIN_VISIBILITY,
  VALID_RECEIVE_SCHEMAS,
  VALID_RETURN_SCHEMAS,
  isValidSchemaRef,
  isValidSemver,
  isValidPluginName,
  isValidRuleId,
  isValidConfidence,
  isValidSeverity,
  isValidCategory,
  isValidEvidenceKind,
  isValidExcerptHash,
  isValidUuid,
  createDefaultManifest,
} from "./plugin-schema.js";

// === Context Implementation ===
export {
  DefaultPluginLogger,
  RestrictedPluginFileSystem,
  PluginSchemaValidatorImpl,
  createPluginContext,
  createTestPluginContext,
} from "./plugin-context.js";

// === Loader Implementation ===
export {
  PluginLoaderImpl,
  createPluginLoader,
  loadPluginManifests,
  filterPluginsByStatus,
  getLoadedManifests,
} from "./plugin-loader.js";

// === Runner Implementation ===
export {
  PluginRunnerImpl,
  createPluginRunner,
  createPluginInput,
  aggregatePluginOutputs,
  allPluginsSucceeded,
  getFailedPlugins,
} from "./plugin-runner.js";

// === Sandbox Configuration ===
export {
  SandboxMode,
  SandboxConfig,
  SandboxExecutionResult,
  SandboxResourceLimits,
  SandboxStatusCheck,
  VolumeMount,
  EnvVarFilterConfig,
  DockerSecurityOptions,
  DEFAULT_SANDBOX_CONFIG,
  DEFAULT_ENV_VAR_FILTER,
  toDockerResourceLimits,
  getDockerSecurityOptions,
  buildDockerSecurityFlags,
  buildVolumeMounts,
  toDockerVolumeFlags,
  filterEnvVars,
  createSandboxConfigFromManifest,
  parseSandboxMode,
  validateSandboxConfig,
} from "./sandbox-config.js";

// === Docker Sandbox Implementation ===
export {
  DockerSandboxRunner,
  createDockerSandboxRunner,
  isDockerSandboxAvailable,
  createSandboxRunner,
  pullDockerImage,
  listRunningPluginContainers,
  getContainerLogs,
  stopAndRemoveContainer,
} from "./docker-sandbox.js";

// === Utility Functions ===

/**
 * Validate a plugin manifest file
 */
export async function validatePluginManifest(path: string): Promise<{
  valid: boolean;
  manifest?: PluginManifest;
  errors?: Array<{ code: string; message: string; path?: string }>;
}> {
  const loader = createPluginLoader();
  const result = await loader.loadManifest(path);

  return {
    valid: result.status === "loaded",
    manifest: result.manifest ?? undefined,
    errors: result.errors,
  };
}

/**
 * Run plugin doctor check
 */
export async function pluginDoctor(pluginPath: string): Promise<{
  healthy: boolean;
  issues: string[];
  manifest?: PluginManifest;
}> {
  const loader = createPluginLoader();
  const runner = createPluginRunner();

  const loadResult = await loader.loadManifest(pluginPath);
  const issues: string[] = [];

  if (loadResult.status !== "loaded") {
    issues.push(`Manifest load failed: ${loadResult.status}`);
    if (loadResult.errors) {
      for (const error of loadResult.errors) {
        issues.push(`${error.code}: ${error.message}`);
      }
    }
    return { healthy: false, issues };
  }

  const manifest = loadResult.manifest!;
  const registryEntry: PluginRegistryEntry = {
    manifest,
    path: pluginPath,
    loaded: true,
    enabled: true,
  };

  const healthResult = await runner.healthCheck(registryEntry);
  if (!healthResult.healthy && healthResult.issues) {
    issues.push(...healthResult.issues);
  }

  return {
    healthy: issues.length === 0,
    issues,
    manifest,
  };
}

/**
 * List all loaded plugins from paths
 */
export async function listPlugins(paths: string[]): Promise<Array<{
  name: string;
  version: string;
  kind: string;
  visibility: string;
  status: string;
  path: string;
}>> {
  const loader = createPluginLoader();
  const results = await loadPluginManifests(paths);

  return results.map(r => ({
    name: r.manifest?.name ?? "unknown",
    version: r.manifest?.version ?? "unknown",
    kind: r.manifest?.kind ?? "unknown",
    visibility: r.manifest?.visibility ?? "unknown",
    status: r.status,
    path: r.path,
  }));
}

// Re-import types for utility function signatures
import type { PluginManifest, PluginRegistryEntry } from "./types.js";
import { createPluginLoader, loadPluginManifests } from "./plugin-loader.js";
import { createPluginRunner } from "./plugin-runner.js";