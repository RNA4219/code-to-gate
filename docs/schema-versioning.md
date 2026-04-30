# code-to-gate Schema Versioning

**Version**: v1 (stable freeze)
**Date**: 2026-04-30
**Scope**: All machine-readable artifacts and integration payloads

---

## 1. Overview

This document describes the schema versioning strategy for code-to-gate artifacts. The v1 schema freeze represents a stable, backward-compatible version that guarantees interoperability with downstream systems.

### Version String Format

code-to-gate uses a hierarchical version format:

```
ctg/<version>
```

Examples:
- `ctg/v1` - Stable version (current)
- `ctg/v1alpha1` - Alpha/preview version (legacy)
- `ctg/v2` - Future major version (not yet released)

---

## 2. v1 Schema Freeze

The v1 schema freeze establishes the following guarantees:

### 2.1 Stability Guarantees

1. **No breaking changes**: v1 schemas will never remove fields, change types, or modify enum semantics
2. **Additive-only changes**: New fields may be added without requiring version bump
3. **Backward compatibility**: v1 parsers must accept v1alpha1 artifacts
4. **Forward compatibility**: v1alpha1 parsers may reject v1 artifacts if strict validation is enabled

### 2.2 Supported Schema Versions

| Schema | v1 Version | v1alpha1 Version | Status |
|--------|------------|------------------|--------|
| findings | `findings@v1` | `findings@v1` | Stable |
| risk-register | `risk-register@v1` | `risk-register@v1` | Stable |
| invariants | `invariants@v1` | `invariants@v1` | Stable |
| test-seeds | `test-seeds@v1` | `test-seeds@v1` | Stable |
| release-readiness | `release-readiness@v1` | `release-readiness@v1` | Stable |
| audit | `audit@v1` | `audit@v1` | Stable |
| normalized-repo-graph | `normalized-repo-graph@v1` | `normalized-repo-graph@v1` | Stable |

### 2.3 Integration Schema Versions

| Schema | v1 Version | v1alpha1 Version |
|--------|------------|------------------|
| state-gate-evidence | `ctg.state-gate/v1` | `ctg.state-gate/v1alpha1` |
| manual-bb-seed | `ctg.manual-bb/v1` | `ctg.manual-bb/v1alpha1` |
| workflow-evidence | `ctg.workflow-evidence/v1` | `ctg.workflow-evidence/v1alpha1` |
| gatefield-static-result | `ctg.gatefield/v1` | `ctg.gatefield/v1alpha1` |

---

## 3. Versioning Rules

### 3.1 Breaking Changes

The following changes require a major version bump (v2, v3, etc.):

1. Removing a required field
2. Changing a field type
3. Adding a new required field
4. Changing enum value semantics
5. Renaming a field
6. Changing validation rules to be more restrictive

### 3.2 Additive Changes (Allowed in v1)

The following changes are allowed without version bump:

1. Adding optional fields
2. Adding new enum values (parsers should handle unknown values)
3. Relaxing validation rules
4. Adding new schema definitions

### 3.3 Version Bump Policy

| Change Type | Version Change | Example |
|-------------|----------------|---------|
| Breaking | Major bump | v1 -> v2 |
| Additive | No change | v1 -> v1 |
| Deprecation | No change | v1 -> v1 (with deprecation marker) |

---

## 4. Backward Compatibility

### 4.1 v1alpha1 to v1 Migration

v1 parsers must accept v1alpha1 artifacts by:

1. Recognizing `ctg/v1alpha1` version string as valid
2. Applying schema validation against v1 definitions
3. Normalizing missing optional fields to defaults

### 4.2 Implementation Guidelines

When implementing schema validation:

```typescript
// Example: Accept both v1 and v1alpha1
const SUPPORTED_VERSIONS = ["ctg/v1", "ctg/v1alpha1"];

function validateArtifact(artifact: unknown): boolean {
  if (!SUPPORTED_VERSIONS.includes(artifact.version)) {
    throw new Error(`Unsupported version: ${artifact.version}`);
  }
  // Apply v1 schema validation
  return validateAgainstV1Schema(artifact);
}
```

### 4.3 Version Detection

```typescript
function normalizeVersion(version: string): string {
  if (version === "ctg/v1alpha1") {
    return "ctg/v1"; // Treat as compatible
  }
  return version;
}
```

---

## 5. Schema Registry

All schemas are registered in the `schemas/` directory:

```
schemas/
  shared-defs.schema.json      # Common definitions
  findings.schema.json         # Findings artifact
  risk-register.schema.json    # Risk register artifact
  invariants.schema.json       # Invariants artifact
  test-seeds.schema.json       # Test seeds artifact
  release-readiness.schema.json # Release readiness artifact
  audit.schema.json            # Audit artifact
  normalized-repo-graph.schema.json # Repository graph
  evidence-ref.schema.json     # Evidence reference
  plugin-manifest.json         # Plugin manifest
  integrations/
    state-gate-evidence.schema.json
    manual-bb-seed.schema.json
    workflow-evidence.schema.json
    gatefield-static-result.schema.json
```

### 5.1 Schema $id Format

Each schema has a unique `$id` following this format:

```
https://code-to-gate.local/schemas/<name>.schema.json
https://code-to-gate.local/schemas/integrations/<name>.schema.json
```

---

## 6. Deprecation Policy

### 6.1 Field Deprecation

When deprecating a field:

1. Mark the field with `"deprecated": true` in schema
2. Add `"deprecatedMessage"` explaining migration path
3. Maintain field for 2 major versions before removal

### 6.2 Version Deprecation

When deprecating a version:

1. Announce deprecation in CHANGELOG
2. Support for 12 months after deprecation notice
3. Provide migration tooling

---

## 7. Testing Requirements

All schema changes must pass:

1. **Schema stability tests**: Validate v1alpha1 artifacts against v1 schemas
2. **Backward compatibility tests**: Ensure v1 parsers accept v1alpha1
3. **Migration tests**: Validate migration tool correctness

Test location: `src/__tests__/acceptance/schema-stability.test.ts`

---

## 8. Integration Guidance

### 8.1 Downstream Systems

Downstream systems consuming code-to-gate artifacts should:

1. Support both `ctg/v1` and `ctg/v1alpha1` version strings
2. Apply schema validation using v1 definitions
3. Handle missing optional fields gracefully

### 8.2 Upstream Systems

Upstream systems producing artifacts for code-to-gate should:

1. Use `ctg/v1` version string for new artifacts
2. Follow v1 schema definitions
3. Include all required fields

---

## 9. Version History

| Version | Date | Status | Notes |
|---------|------|--------|-------|
| v1alpha1 | 2026-04-15 | Deprecated | Initial preview version |
| v1 | 2026-04-30 | Stable | Schema freeze, backward compatible |

---

## 10. References

- [Artifact Contracts](./artifact-contracts.md)
- [Migration Guide](./schema-migration-v1alpha1-to-v1.md)
- [CHANGELOG](../CHANGELOG.md)
- [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12/schema)