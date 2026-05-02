/**
 * Config module index
 * Exports all config-related functionality
 */

// Config schema and defaults
export {
  CONFIG_VERSION,
  DEFAULT_PARSER_CONFIG,
  DEFAULT_LLM_CONFIG,
  DEFAULT_OUTPUT_CONFIG,
  DEFAULT_EXCLUDE_PATTERNS,
  DEFAULT_LANGUAGES,
  DEFAULT_PLUGINS,
  createDefaultConfig,
  isValidConfigVersion,
  isValidLanguage,
  isValidParserAdapter,
  isValidLlmMode,
  isValidLlmProvider,
  type CtgConfig,
  type SupportedLanguage,
  type ParserAdapter,
  type LlmMode,
  type LlmProvider,
  type ParserConfig,
  type LlmConfig,
  type LlmRedactionConfig,
  type PluginConfig,
  type PerformanceConfig,
  type OutputConfig,
  type GitHubConfig,
} from "./config-schema.js";

// Config loader
export {
  CONFIG_LOCATIONS,
  GLOBAL_CONFIG_LOCATION,
  loadConfig,
  validateConfig,
  getConfigPath,
} from "./config-loader.js";

// Policy loader
export {
  POLICY_VERSION,
  loadPolicyFile,
  loadSuppressionFile,
  validatePolicy,
  isValidPolicyVersion,
  isSuppressed,
} from "./policy-loader.js";

// Policy types and defaults
export {
  createDefaultPolicy,
  type CtgPolicy,
  type BlockingSeverityConfig,
  type BlockingCategoryConfig,
  type BlockingCountThreshold,
  type BlockingConfig,
  type ConfidenceConfig,
  type SuppressionConfig,
  type SuppressionEntry,
  type SuppressionFile,
  type LlmPolicyConfig,
  type PartialConfig,
  type BaselineConfig,
  type ExitConfig,
} from "./policy-types.js";

// Policy evaluator
export {
  evaluatePolicy,
  getExitCode,
  isBlockingStatus,
  getStatusMessage,
  generateEvaluationSummary,
  type ReadinessStatus,
  type FailedCondition,
  type PolicyEvaluationResult,
} from "./policy-evaluator.js";