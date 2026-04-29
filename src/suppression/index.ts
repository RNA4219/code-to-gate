/**
 * Suppression module index
 * Provides suppression management for code-to-gate analysis
 */

export {
  Suppression,
  SuppressionFile,
  loadSuppressions,
  parseSuppressionYaml,
  DEFAULT_SUPPRESSION_FILE,
} from "./suppression-loader.js";

export {
  matchSuppression,
  isSuppressed,
  SuppressionMatchResult,
  SuppressionStatus,
} from "./suppression-matcher.js";

export {
  validateSuppressionFile,
  validateSuppression,
  SuppressionValidationError,
  ValidationResult,
} from "./suppression-validator.js";