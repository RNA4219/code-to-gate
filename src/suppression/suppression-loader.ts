/**
 * Suppression Loader - loads and parses suppression files
 * Based on docs/product-spec-v1.md Section 5.3 and 12
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseSimpleYaml } from "../core/config-utils.js";
import { CTG_VERSION_V1ALPHA1 } from "../types/artifacts.js";

const CTG_VERSION = CTG_VERSION_V1ALPHA1;

/**
 * Default suppression file location
 */
export const DEFAULT_SUPPRESSION_FILE = ".ctg/suppressions.yaml";

/**
 * Suppression entry structure
 * Based on spec Section 5.3
 */
export interface Suppression {
  rule_id: string;
  path: string; // Glob pattern for matching file paths
  reason: string;
  expiry?: string; // ISO date string (YYYY-MM-DD)
  author?: string;
}

/**
 * Suppression file structure
 * Based on spec Section 5.3
 */
export interface SuppressionFile {
  version: string;
  suppressions: Suppression[];
}

/**
 * Parse suppression YAML content
 * @param content - YAML content string
 * @returns Parsed suppression file object
 */
export function parseSuppressionYaml(content: string): SuppressionFile {
  const baseResult = parseSimpleYaml(content);

  // Parse suppressions list from YAML
  const suppressions: Suppression[] = [];
  const lines = content.split("\n");

  let currentSuppression: Partial<Suppression> | null = null;
  let inSuppressionsBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    // Detect suppressions block start
    if (trimmed === "suppressions:") {
      inSuppressionsBlock = true;
      continue;
    }

    // Exit suppressions block on new top-level key (line without leading space or dash)
    if (inSuppressionsBlock && !line.startsWith(" ") && !line.startsWith("-") && trimmed.includes(":")) {
      inSuppressionsBlock = false;
      // Save current suppression before exiting
      if (currentSuppression && currentSuppression.rule_id && currentSuppression.path) {
        suppressions.push({
          rule_id: currentSuppression.rule_id,
          path: currentSuppression.path,
          reason: currentSuppression.reason ?? "",
          expiry: currentSuppression.expiry,
          author: currentSuppression.author,
        });
      }
      currentSuppression = null;
      continue;
    }

    if (inSuppressionsBlock) {
      // Start new suppression entry (line starting with -)
      if (trimmed.startsWith("-")) {
        // Save previous suppression if complete
        if (currentSuppression && currentSuppression.rule_id && currentSuppression.path) {
          suppressions.push({
            rule_id: currentSuppression.rule_id,
            path: currentSuppression.path,
            reason: currentSuppression.reason ?? "",
            expiry: currentSuppression.expiry,
            author: currentSuppression.author,
          });
        }
        currentSuppression = {};

        // Handle case where first field is on same line as dash
        // e.g., "- rule_id: CLIENT_TRUSTED_PRICE"
        const afterDash = trimmed.substring(1).trim();
        if (afterDash.startsWith("rule_id:")) {
          currentSuppression.rule_id = afterDash.split(":")[1]?.trim() ?? "";
        }
        continue;
      }

      // Parse suppression fields (indented under the dash line)
      if (currentSuppression !== null) {
        if (trimmed.startsWith("rule_id:")) {
          currentSuppression.rule_id = trimmed.split(":")[1]?.trim() ?? "";
        } else if (trimmed.startsWith("path:")) {
          // Handle quoted paths
          const pathValue = trimmed.substring(5).trim();
          // Remove quotes if present
          currentSuppression.path = pathValue.replace(/^["']|["']$/g, "");
        } else if (trimmed.startsWith("reason:")) {
          // Handle quoted reasons
          const reasonValue = trimmed.substring(7).trim();
          currentSuppression.reason = reasonValue.replace(/^["']|["']$/g, "");
        } else if (trimmed.startsWith("expiry:")) {
          const expiryValue = trimmed.substring(7).trim();
          // Remove quotes if present
          currentSuppression.expiry = expiryValue.replace(/^["']|["']$/g, "");
        } else if (trimmed.startsWith("author:")) {
          const authorValue = trimmed.substring(7).trim();
          currentSuppression.author = authorValue.replace(/^["']|["']$/g, "");
        }
      }
    }
  }

  // Save last suppression if complete
  if (currentSuppression && currentSuppression.rule_id && currentSuppression.path) {
    suppressions.push({
      rule_id: currentSuppression.rule_id,
      path: currentSuppression.path,
      reason: currentSuppression.reason ?? "",
      expiry: currentSuppression.expiry,
      author: currentSuppression.author,
    });
  }

  return {
    version: baseResult.version ?? CTG_VERSION,
    suppressions,
  };
}

/**
 * Load suppressions from file
 * @param suppressionPath - Path to suppression file (relative or absolute)
 * @param repoRoot - Repository root directory for resolving relative paths
 * @param policySuppressionPath - Optional policy-specified suppression path
 * @returns Loaded suppression file object or undefined if not found
 */
export function loadSuppressions(
  suppressionPath: string | undefined,
  repoRoot: string,
  policySuppressionPath?: string
): SuppressionFile | undefined {
  // Determine which path to use (policy overrides default)
  const filePath = policySuppressionPath ?? suppressionPath ?? DEFAULT_SUPPRESSION_FILE;

  // Resolve to absolute path
  const absolutePath = path.resolve(repoRoot, filePath);

  // Check if file exists
  if (!existsSync(absolutePath)) {
    return undefined;
  }

  // Read and parse file
  const content = readFileSync(absolutePath, "utf8");
  return parseSuppressionYaml(content);
}

/**
 * Get suppression file path for audit recording
 * @param suppressionPath - Suppression file path option
 * @param repoRoot - Repository root directory
 * @returns Absolute path to suppression file
 */
export function getSuppressionFilePath(
  suppressionPath: string | undefined,
  repoRoot: string
): string {
  const filePath = suppressionPath ?? DEFAULT_SUPPRESSION_FILE;
  return path.resolve(repoRoot, filePath);
}