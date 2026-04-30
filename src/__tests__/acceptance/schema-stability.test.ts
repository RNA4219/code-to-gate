/**
 * Schema Stability Tests
 * Validates backward compatibility between v1alpha1 and v1 schemas
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const SCHEMA_DIR = path.join(process.cwd(), "schemas");
const INTEGRATION_SCHEMA_DIR = path.join(SCHEMA_DIR, "integrations");

// Schema file paths
const CORE_SCHEMA_FILES = [
  "shared-defs.schema.json",
  "findings.schema.json",
  "risk-register.schema.json",
  "invariants.schema.json",
  "test-seeds.schema.json",
  "release-readiness.schema.json",
  "audit.schema.json",
  "normalized-repo-graph.schema.json",
];

const INTEGRATION_SCHEMA_FILES = [
  "state-gate-evidence.schema.json",
  "manual-bb-seed.schema.json",
  "workflow-evidence.schema.json",
  "gatefield-static-result.schema.json",
];

// Helper to load schema JSON
function loadSchema(schemaPath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(schemaPath, "utf8"));
}

describe("Schema Stability Tests", () => {
  describe("Schema Version Verification", () => {
    it("shared-defs should define v1 version constant", () => {
      const sharedDefs = loadSchema(path.join(SCHEMA_DIR, "shared-defs.schema.json"));
      expect(sharedDefs.$defs.version.const).toBe("ctg/v1");
    });

    it("shared-defs should preserve v1alpha1 version constant for backward compatibility", () => {
      const sharedDefs = loadSchema(path.join(SCHEMA_DIR, "shared-defs.schema.json"));
      expect(sharedDefs.$defs.versionV1Alpha1.const).toBe("ctg/v1alpha1");
    });

    it("shared-defs should define artifactHeaderV1Alpha1 for backward compatibility", () => {
      const sharedDefs = loadSchema(path.join(SCHEMA_DIR, "shared-defs.schema.json"));
      expect(sharedDefs.$defs.artifactHeaderV1Alpha1).toBeDefined();
    });

    it("all core schemas should exist", () => {
      for (const schemaFile of CORE_SCHEMA_FILES) {
        expect(existsSync(path.join(SCHEMA_DIR, schemaFile))).toBe(true);
      }
    });

    it("all integration schemas should exist", () => {
      for (const schemaFile of INTEGRATION_SCHEMA_FILES) {
        expect(existsSync(path.join(INTEGRATION_SCHEMA_DIR, schemaFile))).toBe(true);
      }
    });
  });

  describe("Core Schema Version Checks", () => {
    it("findings schema should reference v1 version", () => {
      const findingsSchema = loadSchema(path.join(SCHEMA_DIR, "findings.schema.json"));
      expect(findingsSchema.properties.schema.const).toBe("findings@v1");
    });

    it("risk-register schema should reference v1 version", () => {
      const schema = loadSchema(path.join(SCHEMA_DIR, "risk-register.schema.json"));
      expect(schema.properties.schema.const).toBe("risk-register@v1");
    });

    it("invariants schema should reference v1 version", () => {
      const schema = loadSchema(path.join(SCHEMA_DIR, "invariants.schema.json"));
      expect(schema.properties.schema.const).toBe("invariants@v1");
    });

    it("test-seeds schema should reference v1 version", () => {
      const schema = loadSchema(path.join(SCHEMA_DIR, "test-seeds.schema.json"));
      expect(schema.properties.schema.const).toBe("test-seeds@v1");
    });

    it("release-readiness schema should reference v1 version", () => {
      const schema = loadSchema(path.join(SCHEMA_DIR, "release-readiness.schema.json"));
      expect(schema.properties.schema.const).toBe("release-readiness@v1");
    });

    it("audit schema should reference v1 version", () => {
      const schema = loadSchema(path.join(SCHEMA_DIR, "audit.schema.json"));
      expect(schema.properties.schema.const).toBe("audit@v1");
    });

    it("normalized-repo-graph schema should reference v1 version", () => {
      const schema = loadSchema(path.join(SCHEMA_DIR, "normalized-repo-graph.schema.json"));
      expect(schema.properties.schema.const).toBe("normalized-repo-graph@v1");
    });
  });

  describe("Integration Schema Version Checks", () => {
    it("state-gate-evidence should use v1 version", () => {
      const schema = loadSchema(path.join(INTEGRATION_SCHEMA_DIR, "state-gate-evidence.schema.json"));
      expect(schema.properties.version.const).toBe("ctg.state-gate/v1");
    });

    it("manual-bb-seed should use v1 version", () => {
      const schema = loadSchema(path.join(INTEGRATION_SCHEMA_DIR, "manual-bb-seed.schema.json"));
      expect(schema.properties.version.const).toBe("ctg.manual-bb/v1");
    });

    it("workflow-evidence should use v1 version", () => {
      const schema = loadSchema(path.join(INTEGRATION_SCHEMA_DIR, "workflow-evidence.schema.json"));
      expect(schema.properties.version.const).toBe("ctg.workflow-evidence/v1");
    });

    it("gatefield-static-result should use v1 version", () => {
      const schema = loadSchema(path.join(INTEGRATION_SCHEMA_DIR, "gatefield-static-result.schema.json"));
      expect(schema.properties.version.const).toBe("ctg.gatefield/v1");
    });
  });

  describe("Backward Compatibility Verification", () => {
    it("shared-defs should have both v1 and v1alpha1 version definitions", () => {
      const sharedDefs = loadSchema(path.join(SCHEMA_DIR, "shared-defs.schema.json"));
      // v1 is the primary version
      expect(sharedDefs.$defs.version.const).toBe("ctg/v1");
      // v1alpha1 is preserved for backward compatibility
      expect(sharedDefs.$defs.versionV1Alpha1).toBeDefined();
      expect(sharedDefs.$defs.versionV1Alpha1.const).toBe("ctg/v1alpha1");
    });

    it("both artifact header definitions should exist", () => {
      const sharedDefs = loadSchema(path.join(SCHEMA_DIR, "shared-defs.schema.json"));
      expect(sharedDefs.$defs.artifactHeader).toBeDefined();
      expect(sharedDefs.$defs.artifactHeaderV1Alpha1).toBeDefined();
    });

    it("v1alpha1 artifact header should reference v1alpha1 version", () => {
      const sharedDefs = loadSchema(path.join(SCHEMA_DIR, "shared-defs.schema.json"));
      const v1alpha1Header = sharedDefs.$defs.artifactHeaderV1Alpha1;
      expect(v1alpha1Header.properties.version.$ref).toBe("#/$defs/versionV1Alpha1");
    });

    it("v1 artifact header should reference v1 version", () => {
      const sharedDefs = loadSchema(path.join(SCHEMA_DIR, "shared-defs.schema.json"));
      const v1Header = sharedDefs.$defs.artifactHeader;
      expect(v1Header.properties.version.$ref).toBe("#/$defs/version");
    });
  });

  describe("Schema Structure Preservation", () => {
    it("shared definitions should have all required types", () => {
      const sharedDefs = loadSchema(path.join(SCHEMA_DIR, "shared-defs.schema.json"));

      const requiredDefs = [
        "version",
        "versionV1Alpha1",
        "isoDateTime",
        "repoRef",
        "toolRef",
        "artifactHeader",
        "artifactHeaderV1Alpha1",
        "evidenceRef",
        "completeness",
        "severity",
        "confidence",
      ];

      for (const def of requiredDefs) {
        expect(sharedDefs.$defs[def]).toBeDefined();
      }
    });

    it("evidence kinds should be preserved", () => {
      const sharedDefs = loadSchema(path.join(SCHEMA_DIR, "shared-defs.schema.json"));

      const evidenceKinds = sharedDefs.$defs.evidenceRef.properties.kind.enum as string[];
      expect(evidenceKinds).toContain("ast");
      expect(evidenceKinds).toContain("text");
      expect(evidenceKinds).toContain("import");
      expect(evidenceKinds).toContain("external");
      expect(evidenceKinds).toContain("test");
      expect(evidenceKinds).toContain("coverage");
      expect(evidenceKinds).toContain("diff");
    });

    it("severity levels should be preserved", () => {
      const sharedDefs = loadSchema(path.join(SCHEMA_DIR, "shared-defs.schema.json"));

      const severityLevels = sharedDefs.$defs.severity.enum as string[];
      expect(severityLevels).toContain("low");
      expect(severityLevels).toContain("medium");
      expect(severityLevels).toContain("high");
      expect(severityLevels).toContain("critical");
    });

    it("completeness levels should be preserved", () => {
      const sharedDefs = loadSchema(path.join(SCHEMA_DIR, "shared-defs.schema.json"));

      const completenessLevels = sharedDefs.$defs.completeness.enum as string[];
      expect(completenessLevels).toContain("complete");
      expect(completenessLevels).toContain("partial");
    });

    it("finding categories should be preserved", () => {
      const findingsSchema = loadSchema(path.join(SCHEMA_DIR, "findings.schema.json"));

      const categories = findingsSchema.properties.findings.items.properties.category.enum as string[];
      expect(categories).toContain("auth");
      expect(categories).toContain("payment");
      expect(categories).toContain("validation");
      expect(categories).toContain("data");
      expect(categories).toContain("config");
      expect(categories).toContain("maintainability");
      expect(categories).toContain("testing");
      expect(categories).toContain("compatibility");
      expect(categories).toContain("release-risk");
    });
  });

  describe("TypeScript Type Verification", () => {
    it("artifacts.ts should export CTG_VERSION_V1 constant", () => {
      const artifactsTypes = readFileSync(
        path.join(process.cwd(), "src/types/artifacts.ts"),
        "utf8"
      );
      expect(artifactsTypes).toContain("CTG_VERSION_V1");
    });

    it("artifacts.ts should export CTG_VERSION_V1ALPHA1 constant", () => {
      const artifactsTypes = readFileSync(
        path.join(process.cwd(), "src/types/artifacts.ts"),
        "utf8"
      );
      expect(artifactsTypes).toContain("CTG_VERSION_V1ALPHA1");
    });

    it("artifacts.ts should export SCHEMA_VERSIONS constant", () => {
      const artifactsTypes = readFileSync(
        path.join(process.cwd(), "src/types/artifacts.ts"),
        "utf8"
      );
      expect(artifactsTypes).toContain("SCHEMA_VERSIONS");
    });

    it("graph.ts should export version constants", () => {
      const graphTypes = readFileSync(
        path.join(process.cwd(), "src/types/graph.ts"),
        "utf8"
      );
      expect(graphTypes).toContain("CTG_VERSION_V1");
    });

    it("ArtifactHeader version should accept both v1 and v1alpha1", () => {
      const artifactsTypes = readFileSync(
        path.join(process.cwd(), "src/types/artifacts.ts"),
        "utf8"
      );
      expect(artifactsTypes).toContain('"ctg/v1" | "ctg/v1alpha1"');
    });
  });

  describe("Documentation Verification", () => {
    it("schema-versioning.md should exist", () => {
      expect(existsSync(path.join(process.cwd(), "docs/schema-versioning.md"))).toBe(true);
    });

    it("schema-migration-v1alpha1-to-v1.md should exist", () => {
      expect(existsSync(path.join(process.cwd(), "docs/schema-migration-v1alpha1-to-v1.md"))).toBe(true);
    });

    it("schema-versioning.md should document v1 freeze", () => {
      const versioningDoc = readFileSync(
        path.join(process.cwd(), "docs/schema-versioning.md"),
        "utf8"
      );
      expect(versioningDoc).toContain("v1 schema freeze");
      expect(versioningDoc).toContain("backward compatible");
    });

    it("migration guide should document v1alpha1 to v1 changes", () => {
      const migrationDoc = readFileSync(
        path.join(process.cwd(), "docs/schema-migration-v1alpha1-to-v1.md"),
        "utf8"
      );
      expect(migrationDoc).toContain("v1alpha1");
      expect(migrationDoc).toContain("v1");
      expect(migrationDoc).toContain("backward compatibility");
    });
  });

  describe("No Breaking Changes Verification", () => {
    it("schemas should not have new required fields since v1alpha1", () => {
      // This test verifies that all fields added are optional
      // Required fields from original v1alpha1 should remain the same

      const findingsSchema = loadSchema(path.join(SCHEMA_DIR, "findings.schema.json"));

      // Original required fields for findings
      const expectedRequired = [
        "id",
        "ruleId",
        "category",
        "severity",
        "confidence",
        "title",
        "summary",
        "evidence",
      ];

      const actualRequired = findingsSchema.properties.findings.items.required as string[];
      expect(actualRequired).toEqual(expectedRequired);
    });

    it("schemas should preserve all existing optional fields", () => {
      const findingsSchema = loadSchema(path.join(SCHEMA_DIR, "findings.schema.json"));

      // Optional fields that must still exist
      const optionalFields = [
        "affectedSymbols",
        "affectedEntrypoints",
        "tags",
        "upstream",
      ];

      for (const field of optionalFields) {
        expect(findingsSchema.properties.findings.items.properties[field]).toBeDefined();
      }
    });

    it("enum values should not have removed items", () => {
      const findingsSchema = loadSchema(path.join(SCHEMA_DIR, "findings.schema.json"));

      // Original categories must all be present
      const originalCategories = [
        "auth",
        "payment",
        "validation",
        "data",
        "config",
        "maintainability",
        "testing",
        "compatibility",
        "release-risk",
      ];

      const actualCategories = findingsSchema.properties.findings.items.properties.category.enum as string[];

      for (const cat of originalCategories) {
        expect(actualCategories).toContain(cat);
      }
    });

    it("shared-defs repoRef should have all original fields", () => {
      const sharedDefs = loadSchema(path.join(SCHEMA_DIR, "shared-defs.schema.json"));
      const repoRef = sharedDefs.$defs.repoRef;

      const originalFields = ["root", "revision", "branch", "base_ref", "head_ref", "dirty"];
      for (const field of originalFields) {
        expect(repoRef.properties[field]).toBeDefined();
      }
      // root is still required
      expect(repoRef.required).toContain("root");
    });

    it("shared-defs toolRef should have all original fields", () => {
      const sharedDefs = loadSchema(path.join(SCHEMA_DIR, "shared-defs.schema.json"));
      const toolRef = sharedDefs.$defs.toolRef;

      const originalFields = ["name", "version", "config_hash", "policy_id", "plugin_versions"];
      for (const field of originalFields) {
        expect(toolRef.properties[field]).toBeDefined();
      }
      // name, version, plugin_versions are still required
      expect(toolRef.required).toContain("name");
      expect(toolRef.required).toContain("version");
      expect(toolRef.required).toContain("plugin_versions");
    });
  });

  describe("Schema $id and $schema Verification", () => {
    it("all schemas should have valid $schema declaration", () => {
      const expectedSchemaUri = "https://json-schema.org/draft/2020-12/schema";

      for (const schemaFile of CORE_SCHEMA_FILES) {
        const schema = loadSchema(path.join(SCHEMA_DIR, schemaFile));
        expect(schema.$schema).toBe(expectedSchemaUri);
      }
    });

    it("all schemas should have unique $id", () => {
      const seenIds: string[] = [];

      for (const schemaFile of CORE_SCHEMA_FILES) {
        const schema = loadSchema(path.join(SCHEMA_DIR, schemaFile));
        const id = schema.$id as string;
        expect(id).toBeDefined();
        expect(seenIds).not.toContain(id);
        seenIds.push(id);
      }

      for (const schemaFile of INTEGRATION_SCHEMA_FILES) {
        const schema = loadSchema(path.join(INTEGRATION_SCHEMA_DIR, schemaFile));
        const id = schema.$id as string;
        expect(id).toBeDefined();
        expect(seenIds).not.toContain(id);
        seenIds.push(id);
      }
    });
  });
});