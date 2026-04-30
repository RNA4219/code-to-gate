# Schema Migration Guide: v1alpha1 to v1

**Version**: v1.0
**Date**: 2026-04-30
**Scope**: Migration from v1alpha1 to stable v1 schemas

---

## 1. Overview

This guide describes the migration from v1alpha1 (preview) schemas to v1 (stable) schemas. The migration is designed to be seamless with no breaking changes required for existing artifacts.

### Key Points

- v1 schemas are **backward compatible** with v1alpha1 artifacts
- No data transformation required for existing artifacts
- Version string update recommended but not mandatory
- Integration schemas have version string changes

---

## 2. Changes Summary

### 2.1 Core Artifacts (No Breaking Changes)

The following core artifacts have **no structural changes**:

| Artifact | v1alpha1 Schema | v1 Schema | Changes |
|----------|-----------------|-----------|---------|
| findings | `findings@v1` | `findings@v1` | None |
| risk-register | `risk-register@v1` | `risk-register@v1` | None |
| invariants | `invariants@v1` | `invariants@v1` | None |
| test-seeds | `test-seeds@v1` | `test-seeds@v1` | None |
| release-readiness | `release-readiness@v1` | `release-readiness@v1` | None |
| audit | `audit@v1` | `audit@v1` | None |
| normalized-repo-graph | `normalized-repo-graph@v1` | `normalized-repo-graph@v1` | None |

### 2.2 Version String Changes

| Schema Type | v1alpha1 Version | v1 Version |
|-------------|------------------|------------|
| Artifact Header | `ctg/v1alpha1` | `ctg/v1` |
| state-gate-evidence | `ctg.state-gate/v1alpha1` | `ctg.state-gate/v1` |
| manual-bb-seed | `ctg.manual-bb/v1alpha1` | `ctg.manual-bb/v1` |
| workflow-evidence | `ctg.workflow-evidence/v1alpha1` | `ctg.workflow-evidence/v1` |
| gatefield-static-result | `ctg.gatefield/v1alpha1` | `ctg.gatefield/v1` |

---

## 3. Migration Steps

### 3.1 For Artifact Producers

If you generate code-to-gate artifacts:

1. **Update version string** (recommended):
   ```json
   {
     "version": "ctg/v1",  // Changed from "ctg/v1alpha1"
     ...
   }
   ```

2. **No structural changes required**: All fields remain identical

3. **Update schema imports** (if using TypeScript):
   ```typescript
   // Old
   import { CTG_VERSION } from './types/artifacts';
   
   // New (recommended)
   import { CTG_VERSION_V1, CTG_VERSION } from './types/artifacts';
   // CTG_VERSION now equals "ctg/v1"
   ```

### 3.2 For Artifact Consumers

If you consume code-to-gate artifacts:

1. **Update version validation** to accept both versions:
   ```typescript
   const ACCEPTABLE_VERSIONS = ['ctg/v1', 'ctg/v1alpha1'];
   
   function validateVersion(version: string): boolean {
     return ACCEPTABLE_VERSIONS.includes(version);
   }
   ```

2. **No data handling changes required**: Field structures identical

3. **Consider normalizing version** for downstream processing:
   ```typescript
   function normalizeVersion(version: string): string {
     return version === 'ctg/v1alpha1' ? 'ctg/v1' : version;
   }
   ```

---

## 4. Integration Schema Migration

### 4.1 State-Gate Evidence

```json
// v1alpha1
{
  "version": "ctg.state-gate/v1alpha1",
  ...
}

// v1
{
  "version": "ctg.state-gate/v1",
  ...
}
```

No other changes required.

### 4.2 Manual-BB Seed

```json
// v1alpha1
{
  "version": "ctg.manual-bb/v1alpha1",
  ...
}

// v1
{
  "version": "ctg.manual-bb/v1",
  ...
}
```

No other changes required.

### 4.3 Workflow Evidence

```json
// v1alpha1
{
  "version": "ctg.workflow-evidence/v1alpha1",
  ...
}

// v1
{
  "version": "ctg.workflow-evidence/v1",
  ...
}
```

No other changes required.

### 4.4 Gatefield Static Result

```json
// v1alpha1
{
  "version": "ctg.gatefield/v1alpha1",
  ...
}

// v1
{
  "version": "ctg.gatefield/v1",
  ...
}
```

No other changes required.

---

## 5. Automated Migration

### 5.1 Migration Script

Use the following script to update artifact version strings:

```bash
# Update artifact header version
node scripts/migrate-v1alpha1-to-v1.js --input ./artifacts/
```

The script will:
1. Scan all JSON files in the input directory
2. Update `version` fields from `ctg/v1alpha1` to `ctg/v1`
3. Update integration schema version strings
4. Preserve all other fields unchanged

### 5.2 Validation After Migration

```bash
# Validate migrated artifacts against v1 schemas
npx code-to-gate schema validate --schema-dir ./schemas/ --artifacts ./artifacts/
```

---

## 6. Backward Compatibility Testing

### 6.1 Test Matrix

| Artifact Version | Schema Version | Expected Result |
|------------------|----------------|-----------------|
| v1alpha1 artifact | v1 schema | PASS (compatible) |
| v1 artifact | v1 schema | PASS |
| v1 artifact | v1alpha1 schema | PASS (same schema) |

### 6.2 Test Implementation

```typescript
describe('Schema backward compatibility', () => {
  it('should validate v1alpha1 artifact against v1 schema', () => {
    const v1alpha1Artifact = loadArtifact('v1alpha1-findings.json');
    const result = validateAgainstV1Schema(v1alpha1Artifact);
    expect(result.valid).toBe(true);
  });
  
  it('should validate v1 artifact against v1 schema', () => {
    const v1Artifact = loadArtifact('v1-findings.json');
    const result = validateAgainstV1Schema(v1Artifact);
    expect(result.valid).toBe(true);
  });
});
```

---

## 7. Common Migration Issues

### 7.1 Version Not Recognized

**Problem**: Downstream system rejects `ctg/v1alpha1` version.

**Solution**: Update version validation to accept both versions:
```typescript
const SUPPORTED_VERSIONS = ['ctg/v1', 'ctg/v1alpha1'];
```

### 7.2 Schema Validation Failure

**Problem**: Schema validation fails on v1alpha1 artifact.

**Solution**: Ensure you're using v1 schemas for validation (they are compatible).

### 7.3 Integration Payload Version

**Problem**: Integration system expects specific version string.

**Solution**: 
- For state-gate, manual-bb, workflow, gatefield: Update version string to v1 format
- Or configure downstream to accept both versions

---

## 8. Timeline

| Phase | Date | Action |
|-------|------|--------|
| Phase 1 | 2026-04-30 | v1 schema freeze announcement |
| Phase 2 | 2026-05-15 | v1alpha1 deprecation notice |
| Phase 3 | 2027-04-30 | v1alpha1 support ends (12 months) |

---

## 9. Support

During the migration period:

- Both `ctg/v1` and `ctg/v1alpha1` are supported
- v1alpha1 artifacts will validate against v1 schemas
- No breaking behavior changes

After Phase 3 (2027-04-30):

- v1alpha1 artifacts may produce warnings
- Full support only for v1

---

## 10. References

- [Schema Versioning](./schema-versioning.md)
- [Artifact Contracts](./artifact-contracts.md)
- [CHANGELOG](../CHANGELOG.md)