/**
 * Suppression Validator - validates suppression file structure
 * Based on docs/product-spec-v1.md Section 5.3
 */

import { Suppression, SuppressionFile } from "./suppression-loader.js";
import { CTG_VERSION } from "../types/artifacts.js";

/**
 * Validation error structure
 */
export interface SuppressionValidationError {
  type: "version" | "suppression" | "field";
  message: string;
  index?: number; // Index in suppressions array
  field?: string; // Field name
}

/**
 * Validation result structure
 */
export interface ValidationResult {
  valid: boolean;
  errors: SuppressionValidationError[];
  warnings: SuppressionValidationError[];
}

/**
 * Valid suppression version strings
 */
const VALID_VERSIONS = ["ctg/v1alpha1", "ctg/v1alpha2", "ctg/v1"];

/**
 * Validate suppression file structure
 * @param suppressionFile - Suppression file object to validate
 * @returns Validation result with errors and warnings
 */
export function validateSuppressionFile(
  suppressionFile: SuppressionFile
): ValidationResult {
  const errors: SuppressionValidationError[] = [];
  const warnings: SuppressionValidationError[] = [];

  // Validate version
  if (!suppressionFile.version) {
    errors.push({
      type: "version",
      message: "Missing version field",
    });
  } else if (!VALID_VERSIONS.includes(suppressionFile.version)) {
    errors.push({
      type: "version",
      message: `Invalid version: ${suppressionFile.version}. Expected one of: ${VALID_VERSIONS.join(", ")}`,
    });
  }

  // Validate suppressions array
  if (!Array.isArray(suppressionFile.suppressions)) {
    errors.push({
      type: "suppression",
      message: "suppressions must be an array",
    });
    return { valid: false, errors, warnings };
  }

  // Validate each suppression entry
  for (let i = 0; i < suppressionFile.suppressions.length; i++) {
    const suppression = suppressionFile.suppressions[i];
    const entryErrors = validateSuppression(suppression, i);

    for (const error of entryErrors.errors) {
      errors.push(error);
    }
    for (const warning of entryErrors.warnings) {
      warnings.push(warning);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate a single suppression entry
 * @param suppression - Suppression entry to validate
 * @param index - Index in suppressions array
 * @returns Validation result
 */
export function validateSuppression(
  suppression: Suppression,
  index: number
): ValidationResult {
  const errors: SuppressionValidationError[] = [];
  const warnings: SuppressionValidationError[] = [];

  // Required fields
  if (!suppression.rule_id) {
    errors.push({
      type: "field",
      message: "Missing required field: rule_id",
      index,
      field: "rule_id",
    });
  }

  if (!suppression.path) {
    errors.push({
      type: "field",
      message: "Missing required field: path",
      index,
      field: "path",
    });
  }

  if (!suppression.reason) {
    errors.push({
      type: "field",
      message: "Missing required field: reason",
      index,
      field: "reason",
    });
  }

  // Validate path pattern (basic glob syntax check)
  if (suppression.path) {
    const pathWarnings = validatePathPattern(suppression.path);
    for (const warning of pathWarnings) {
      warnings.push({
        type: "field",
        message: warning,
        index,
        field: "path",
      });
    }
  }

  // Validate expiry date format
  if (suppression.expiry) {
    const expiryResult = validateExpiryDate(suppression.expiry);
    if (!expiryResult.valid) {
      errors.push({
        type: "field",
        message: expiryResult.message ?? "Invalid expiry date format",
        index,
        field: "expiry",
      });
    } else if (expiryResult.expired) {
      warnings.push({
        type: "field",
        message: "Expiry date has already passed",
        index,
        field: "expiry",
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate path glob pattern
 * @param pattern - Glob pattern to validate
 * @returns Array of warning messages
 */
function validatePathPattern(pattern: string): string[] {
  const warnings: string[] = [];

  // Check for potentially problematic patterns
  if (pattern.includes("**") && pattern.split("**").length > 2) {
    warnings.push("Multiple ** in path pattern may cause unexpected matches");
  }

  // Check for unbalanced braces
  const openBraces = (pattern.match(/\{/g) ?? []).length;
  const closeBraces = (pattern.match(/\}/g) ?? []).length;
  if (openBraces !== closeBraces) {
    warnings.push("Unbalanced braces in path pattern");
  }

  // Check for potentially slow patterns
  if (pattern.startsWith("**") && pattern.endsWith("**")) {
    warnings.push("Pattern starting and ending with ** may be slow");
  }

  return warnings;
}

/**
 * Validate expiry date format and status
 * @param expiryDate - Expiry date string
 * @returns Validation result with expired status
 */
function validateExpiryDate(expiryDate: string): {
  valid: boolean;
  expired?: boolean;
  message?: string;
} {
  // Check format (YYYY-MM-DD or ISO 8601)
  const datePattern = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})?)?$/;

  if (!datePattern.test(expiryDate)) {
    return {
      valid: false,
      message: `Invalid date format: ${expiryDate}. Expected YYYY-MM-DD or ISO 8601`,
    };
  }

  // Parse and validate date
  const parsed = new Date(expiryDate);
  if (isNaN(parsed.getTime())) {
    return {
      valid: false,
      message: "Invalid date value",
    };
  }

  // Check if expired
  const now = new Date();
  const expired = parsed < now;

  return {
    valid: true,
    expired,
  };
}

/**
 * Check if suppression file has exceeded max suppressions per rule
 * Based on spec Section 5.2: max_suppressions_per_rule
 * @param suppressionFile - Suppression file object
 * @param maxPerRule - Maximum suppressions allowed per rule
 * @returns Array of rules that exceed the limit
 */
export function checkMaxSuppressionsPerRule(
  suppressionFile: SuppressionFile,
  maxPerRule: number
): Array<{ rule_id: string; count: number }> {
  const ruleCounts: Map<string, number> = new Map();

  for (const suppression of suppressionFile.suppressions) {
    const count = ruleCounts.get(suppression.rule_id) ?? 0;
    ruleCounts.set(suppression.rule_id, count + 1);
  }

  const exceeded: Array<{ rule_id: string; count: number }> = [];

  for (const [rule_id, count] of ruleCounts) {
    if (count > maxPerRule) {
      exceeded.push({ rule_id, count });
    }
  }

  return exceeded;
}