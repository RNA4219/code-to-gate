/**
 * Plugin Schema Definitions
 * JSON Schema objects for plugin manifest validation
 */

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
 * Plugin Output Schema definitions
 */
const EVIDENCE_REF_DEFINITION = {
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
};

const FINDING_DEFINITION = {
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
};

const RISK_SEED_DEFINITION = {
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
};

const DIAGNOSTIC_DEFINITION = {
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
};

const ERROR_DEFINITION = {
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
    finding: FINDING_DEFINITION,
    evidence_ref: EVIDENCE_REF_DEFINITION,
    risk_seed: RISK_SEED_DEFINITION,
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
    diagnostic: DIAGNOSTIC_DEFINITION,
    error: ERROR_DEFINITION,
  },
};