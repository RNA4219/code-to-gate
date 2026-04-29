/**
 * Plugin Schema Definitions
 * JSON Schema for plugin manifest validation
 * Based on docs/plugin-security-contract.md and docs/product-spec-v1.md
 */

import type { PluginManifest, PluginCapability, PluginKind, PluginVisibility } from "./types.js";

/**
 * Plugin Manifest Schema (JSON Schema format)
 */
export const PLUGIN_MANIFEST_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "plugin-manifest.schema.json",
  title: "Plugin Manifest",
  description: "Schema for code-to-gate plugin manifest",
  type: "object",
  required: ["apiVersion", "kind", "name", "version", "visibility", "entry", "capabilities", "receives", "returns"],
  properties: {
    apiVersion: {
      type: "string",
      const: "ctg/v1alpha1",
      description: "Plugin API version",
    },
    kind: {
      type: "string",
      enum: ["rule-plugin", "language-plugin", "importer-plugin", "reporter-plugin", "exporter-plugin"],
      description: "Plugin kind/type",
    },
    name: {
      type: "string",
      pattern: "^[a-z0-9][a-z0-9-]*[a-z0-9]$",
      minLength: 2,
      maxLength: 64,
      description: "Plugin name (lowercase, alphanumeric with hyphens)",
    },
    version: {
      type: "string",
      pattern: "^\\d+\\.\\d+\\.\\d+(-[a-z0-9.]+)?$",
      description: "Plugin version (semver format)",
    },
    visibility: {
      type: "string",
      enum: ["public", "private"],
      description: "Plugin visibility level",
    },
    description: {
      type: "string",
      maxLength: 256,
      description: "Plugin description",
    },
    author: {
      type: "string",
      maxLength: 128,
      description: "Plugin author",
    },
    homepage: {
      type: "string",
      format: "uri",
      description: "Plugin homepage URL",
    },
    license: {
      type: "string",
      description: "Plugin license (SPDX identifier)",
    },
    entry: {
      type: "object",
      required: ["command"],
      properties: {
        command: {
          type: "array",
          items: {
            type: "string",
          },
          minItems: 1,
          description: "Command to execute plugin",
        },
        env: {
          type: "object",
          additionalProperties: {
            type: "string",
          },
          description: "Environment variables for plugin execution",
        },
        timeout: {
          type: "number",
          minimum: 1,
          maximum: 300,
          default: 60,
          description: "Execution timeout in seconds",
        },
        retry: {
          type: "integer",
          minimum: 0,
          maximum: 5,
          default: 1,
          description: "Retry count on failure",
        },
      },
      additionalProperties: false,
    },
    capabilities: {
      type: "array",
      items: {
        type: "string",
        enum: ["evaluate", "parse", "import", "report", "export"],
      },
      minItems: 1,
      description: "Plugin capabilities",
    },
    receives: {
      type: "array",
      items: {
        type: "string",
        pattern: "^[a-z0-9-]+@v[0-9]+$",
      },
      description: "Input schemas the plugin receives",
    },
    returns: {
      type: "array",
      items: {
        type: "string",
        pattern: "^[a-z0-9-]+@v[0-9]+$",
      },
      minItems: 1,
      description: "Output schemas the plugin returns",
    },
    security: {
      type: "object",
      properties: {
        network: {
          type: "boolean",
          default: false,
          description: "Whether plugin needs network access",
        },
        filesystem: {
          type: "object",
          properties: {
            read: {
              type: "array",
              items: {
                type: "string",
              },
              description: "Allowed read paths (supports ${repoRoot}, ${workDir})",
            },
            write: {
              type: "array",
              items: {
                type: "string",
              },
              description: "Allowed write paths",
            },
          },
          additionalProperties: false,
        },
        secrets: {
          type: "object",
          properties: {
            allow: {
              type: "array",
              items: {
                type: "string",
              },
              description: "Allowed secret patterns",
            },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
    dependencies: {
      type: "array",
      items: {
        type: "object",
        required: ["name"],
        properties: {
          name: {
            type: "string",
            description: "Dependency name",
          },
          version: {
            type: "string",
            description: "Dependency version requirement",
          },
          optional: {
            type: "boolean",
            default: false,
            description: "Whether dependency is optional",
          },
        },
        additionalProperties: false,
      },
    },
    metadata: {
      type: "object",
      additionalProperties: true,
      description: "Additional plugin metadata",
    },
  },
  additionalProperties: false,
};

/**
 * Plugin Input Schema
 */
export const PLUGIN_INPUT_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "plugin-input.schema.json",
  title: "Plugin Input",
  description: "Schema for input sent to plugin via stdin",
  type: "object",
  required: ["version", "repo_graph"],
  properties: {
    version: {
      type: "string",
      const: "ctg.plugin-input/v1",
    },
    repo_graph: {
      type: "object",
      description: "NormalizedRepoGraph structure",
    },
    imported_findings: {
      type: "object",
      description: "Imported findings from external tools",
    },
    config: {
      type: "object",
      description: "Plugin configuration",
    },
    policy: {
      type: "object",
      description: "Policy configuration",
    },
    metadata: {
      type: "object",
      properties: {
        run_id: {
          type: "string",
        },
        repo_root: {
          type: "string",
        },
        work_dir: {
          type: "string",
        },
      },
    },
  },
};

/**
 * Plugin Output Schema
 */
export const PLUGIN_OUTPUT_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "plugin-output.schema.json",
  title: "Plugin Output",
  description: "Schema for output received from plugin via stdout",
  type: "object",
  required: ["version"],
  properties: {
    version: {
      type: "string",
      const: "ctg.plugin-output/v1",
    },
    findings: {
      type: "array",
      items: {
        $ref: "#/definitions/finding",
      },
    },
    risk_seeds: {
      type: "array",
      items: {
        $ref: "#/definitions/risk_seed",
      },
    },
    invariant_seeds: {
      type: "array",
      items: {
        $ref: "#/definitions/invariant_seed",
      },
    },
    test_seeds: {
      type: "array",
      items: {
        $ref: "#/definitions/test_seed",
      },
    },
    diagnostics: {
      type: "array",
      items: {
        $ref: "#/definitions/diagnostic",
      },
    },
    errors: {
      type: "array",
      items: {
        $ref: "#/definitions/error",
      },
    },
  },
  definitions: {
    finding: {
      type: "object",
      required: ["id", "ruleId", "category", "severity", "confidence", "title", "summary", "evidence"],
      properties: {
        id: {
          type: "string",
          format: "uuid",
        },
        ruleId: {
          type: "string",
          pattern: "^[A-Z][A-Z0-9_]*$",
        },
        category: {
          type: "string",
          enum: ["auth", "payment", "validation", "data", "config", "maintainability", "testing", "compatibility", "release-risk", "security"],
        },
        severity: {
          type: "string",
          enum: ["low", "medium", "high", "critical"],
        },
        confidence: {
          type: "number",
          minimum: 0,
          maximum: 1,
        },
        title: {
          type: "string",
          maxLength: 128,
        },
        summary: {
          type: "string",
          maxLength: 512,
        },
        evidence: {
          type: "array",
          items: {
            $ref: "#/definitions/evidence_ref",
          },
          minItems: 1,
        },
        affectedSymbols: {
          type: "array",
          items: {
            type: "string",
          },
        },
        affectedEntrypoints: {
          type: "array",
          items: {
            type: "string",
          },
        },
        tags: {
          type: "array",
          items: {
            type: "string",
          },
        },
        upstream: {
          type: "object",
          properties: {
            tool: {
              type: "string",
            },
            ruleId: {
              type: "string",
            },
          },
        },
      },
    },
    evidence_ref: {
      type: "object",
      required: ["id", "path", "kind"],
      properties: {
        id: {
          type: "string",
        },
        path: {
          type: "string",
        },
        startLine: {
          type: "integer",
          minimum: 1,
        },
        endLine: {
          type: "integer",
          minimum: 1,
        },
        kind: {
          type: "string",
          enum: ["ast", "text", "import", "external", "test"],
        },
        excerptHash: {
          type: "string",
          pattern: "^[a-f0-9]{64}$",
        },
        nodeId: {
          type: "string",
        },
        symbolId: {
          type: "string",
        },
        externalRef: {
          type: "object",
          properties: {
            tool: {
              type: "string",
            },
            ruleId: {
              type: "string",
            },
            url: {
              type: "string",
              format: "uri",
            },
          },
        },
      },
    },
    risk_seed: {
      type: "object",
      required: ["id", "title", "severity", "likelihood", "impact", "confidence", "sourceFindingIds", "evidence", "recommendedActions"],
      properties: {
        id: {
          type: "string",
        },
        title: {
          type: "string",
        },
        severity: {
          type: "string",
          enum: ["low", "medium", "high", "critical"],
        },
        likelihood: {
          type: "string",
          enum: ["low", "medium", "high", "unknown"],
        },
        impact: {
          type: "array",
          items: {
            type: "string",
          },
        },
        confidence: {
          type: "number",
        },
        sourceFindingIds: {
          type: "array",
          items: {
            type: "string",
          },
        },
        evidence: {
          type: "array",
          items: {
            $ref: "#/definitions/evidence_ref",
          },
        },
        narrative: {
          type: "string",
        },
        recommendedActions: {
          type: "array",
          items: {
            type: "string",
          },
        },
      },
    },
    invariant_seed: {
      type: "object",
      required: ["id", "title", "description", "category", "evidence", "confidence"],
      properties: {
        id: {
          type: "string",
        },
        title: {
          type: "string",
        },
        description: {
          type: "string",
        },
        category: {
          type: "string",
          enum: ["behavior", "data", "security", "performance"],
        },
        evidence: {
          type: "array",
          items: {
            $ref: "#/definitions/evidence_ref",
          },
        },
        confidence: {
          type: "number",
        },
      },
    },
    test_seed: {
      type: "object",
      required: ["id", "title", "category", "target", "description", "inputs", "expectedOutcome", "priority"],
      properties: {
        id: {
          type: "string",
        },
        title: {
          type: "string",
        },
        category: {
          type: "string",
          enum: ["positive", "negative", "edge", "security"],
        },
        target: {
          type: "string",
        },
        description: {
          type: "string",
        },
        inputs: {
          type: "object",
        },
        expectedOutcome: {
          type: "string",
        },
        sourceRiskId: {
          type: "string",
        },
        priority: {
          type: "string",
          enum: ["high", "medium", "low"],
        },
      },
    },
    diagnostic: {
      type: "object",
      required: ["id", "severity", "code", "message"],
      properties: {
        id: {
          type: "string",
        },
        severity: {
          type: "string",
          enum: ["info", "warning", "error"],
        },
        code: {
          type: "string",
        },
        message: {
          type: "string",
        },
        evidence: {
          type: "array",
          items: {
            $ref: "#/definitions/evidence_ref",
          },
        },
      },
    },
    error: {
      type: "object",
      required: ["code", "message"],
      properties: {
        code: {
          type: "string",
        },
        message: {
          type: "string",
        },
        details: {
          type: "object",
        },
      },
    },
  },
};

/**
 * Valid plugin kinds
 */
export const VALID_PLUGIN_KINDS: PluginKind[] = [
  "rule-plugin",
  "language-plugin",
  "importer-plugin",
  "reporter-plugin",
  "exporter-plugin",
];

/**
 * Valid plugin capabilities
 */
export const VALID_PLUGIN_CAPABILITIES: PluginCapability[] = [
  "evaluate",
  "parse",
  "import",
  "report",
  "export",
];

/**
 * Valid plugin visibility levels
 */
export const VALID_PLUGIN_VISIBILITY: PluginVisibility[] = [
  "public",
  "private",
];

/**
 * Valid schema references that plugins can receive
 */
export const VALID_RECEIVE_SCHEMAS = [
  "normalized-repo-graph@v1",
  "findings@v1",
  "risk-register@v1",
  "test-seeds@v1",
];

/**
 * Valid schema references that plugins can return
 */
export const VALID_RETURN_SCHEMAS = [
  "findings@v1",
  "risk-seeds@v1",
  "invariant-seeds@v1",
  "test-seeds@v1",
  "diagnostics@v1",
];

/**
 * Validate schema reference format
 */
export function isValidSchemaRef(ref: string): boolean {
  const pattern = /^[a-z0-9-]+@v[0-9]+$/;
  return pattern.test(ref);
}

/**
 * Validate semver version format
 */
export function isValidSemver(version: string): boolean {
  const pattern = /^\d+\.\d+\.\d+(-[a-z0-9.]+)?$/;
  return pattern.test(version);
}

/**
 * Validate plugin name format
 */
export function isValidPluginName(name: string): boolean {
  const pattern = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
  return pattern.test(name) && name.length >= 2 && name.length <= 64;
}

/**
 * Validate rule ID format
 */
export function isValidRuleId(ruleId: string): boolean {
  const pattern = /^[A-Z][A-Z0-9_]*$/;
  return pattern.test(ruleId);
}

/**
 * Validate confidence value
 */
export function isValidConfidence(confidence: number): boolean {
  return confidence >= 0 && confidence <= 1;
}

/**
 * Validate severity value
 */
export function isValidSeverity(severity: string): boolean {
  return ["low", "medium", "high", "critical"].includes(severity);
}

/**
 * Validate category value
 */
export function isValidCategory(category: string): boolean {
  return [
    "auth",
    "payment",
    "validation",
    "data",
    "config",
    "maintainability",
    "testing",
    "compatibility",
    "release-risk",
    "security",
  ].includes(category);
}

/**
 * Validate evidence kind
 */
export function isValidEvidenceKind(kind: string): boolean {
  return ["ast", "text", "import", "external", "test"].includes(kind);
}

/**
 * Validate excerpt hash (SHA-256)
 */
export function isValidExcerptHash(hash: string): boolean {
  const pattern = /^[a-f0-9]{64}$/;
  return pattern.test(hash);
}

/**
 * Validate UUID format
 */
export function isValidUuid(id: string): boolean {
  const pattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
  return pattern.test(id);
}

/**
 * Create default manifest for testing
 */
export function createDefaultManifest(name: string = "example-plugin"): PluginManifest {
  return {
    apiVersion: "ctg/v1alpha1",
    kind: "rule-plugin",
    name,
    version: "0.1.0",
    visibility: "public",
    description: "Example plugin",
    entry: {
      command: ["node", "./dist/index.js"],
      timeout: 60,
      retry: 1,
    },
    capabilities: ["evaluate"],
    receives: ["normalized-repo-graph@v1"],
    returns: ["findings@v1"],
    security: {
      network: false,
      filesystem: {
        read: ["${repoRoot}"],
        write: ["${workDir}/plugin-output"],
      },
      secrets: {
        allow: [],
      },
    },
  };
}