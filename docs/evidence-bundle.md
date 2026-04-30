# Evidence Bundle Format

**Version**: ctg.evidence/v1alpha1
**Created**: 2026-04-30
**Status**: Draft

---

## 1. Overview

This document defines the Evidence Bundle format for code-to-gate, used for:

- Release acceptance evidence collection
- CI/CD artifact packaging
- Evidence validation and attestation
- Downstream system integration

The Evidence Bundle is a ZIP archive containing all analysis artifacts plus metadata and optional signature.

---

## 2. Bundle Structure

### 2.1 ZIP Archive Contents

```
evidence-bundle.zip
  |-- metadata.json          # Bundle metadata (required)
  |-- repo-graph.json        # Normalized repo graph (required)
  |-- findings.json          # Analysis findings (required)
  |-- risk-register.yaml     # Risk register (required)
  |-- release-readiness.json # Release readiness evaluation (required)
  |-- audit.json             # Audit trail (required)
  |-- test-seeds.json        # Test seeds (optional)
  |-- gatefield-static-result.json  # Gatefield adapter (optional)
  |-- state-gate-evidence.json      # State Gate adapter (optional)
  |-- manual-bb-seed.json           # Manual BB adapter (optional)
  |-- workflow-evidence.json        # Workflow evidence (optional)
  |-- results.sarif                # SARIF output (optional)
  |-- signature.json        # Bundle signature (optional)
```

### 2.2 Required Artifacts

| Artifact | Filename | Purpose |
|---|---|---|
| repo-graph | `repo-graph.json` | Repository structure and dependencies |
| findings | `findings.json` | Static analysis findings |
| risk-register | `risk-register.yaml` | Risk assessment register |
| release-readiness | `release-readiness.json` | Release readiness evaluation |
| audit | `audit.json` | Audit trail and inputs |

### 2.3 Optional Artifacts

| Artifact | Filename | Purpose |
|---|---|---|
| test-seeds | `test-seeds.json` | Generated test case seeds |
| gatefield-static-result | `gatefield-static-result.json` | Gatefield adapter output |
| state-gate-evidence | `state-gate-evidence.json` | State Gate adapter output |
| manual-bb-seed | `manual-bb-seed.json` | Manual black-box test seeds |
| workflow-evidence | `workflow-evidence.json` | Workflow execution evidence |
| sarif | `results.sarif` | SARIF format output |

---

## 3. Metadata Schema

### 3.1 metadata.json

```json
{
  "version": "ctg.evidence/v1alpha1",
  "generated_at": "2026-04-30T12:00:00Z",
  "bundle_id": "ctg-bundle-run-001-abc123",
  "source": {
    "repo_root": "/path/to/repo",
    "revision": "abc123def456",
    "branch": "main",
    "run_id": "run-001",
    "tool_version": "0.2.0",
    "policy_id": "policy-001"
  },
  "contents": [
    {
      "name": "findings.json",
      "path": "findings.json",
      "type": "findings",
      "size_bytes": 12345,
      "hash_sha256": "abc123...",
      "schema_version": "findings@v1",
      "generated_at": "2026-04-30T11:59:00Z"
    }
  ],
  "signature": {
    "algorithm": "sha256",
    "value": "signature-hash",
    "created_at": "2026-04-30T12:00:00Z",
    "signer": "optional-signer-name"
  },
  "validation_status": "pending"
}
```

### 3.2 Fields

| Field | Type | Required | Description |
|---|---|:---:|---|
| version | string | Yes | Evidence format version |
| generated_at | string | Yes | Bundle creation timestamp (ISO 8601) |
| bundle_id | string | Yes | Unique bundle identifier |
| source | object | Yes | Source repository context |
| contents | array | Yes | Artifact manifest list |
| signature | object | No | Bundle signature (if signed) |
| validation_status | string | Yes | Validation status (pending/valid/invalid) |

### 3.3 Source Fields

| Field | Type | Required | Description |
|---|---|:---:|---|
| repo_root | string | Yes | Repository root path |
| revision | string | No | Git revision hash |
| branch | string | No | Git branch name |
| run_id | string | Yes | Analysis run identifier |
| tool_version | string | Yes | code-to-gate version |
| policy_id | string | No | Policy identifier used |

### 3.4 Content Manifest Fields

| Field | Type | Required | Description |
|---|---|:---:|---|
| name | string | Yes | Artifact filename |
| path | string | Yes | Path within bundle |
| type | string | Yes | Artifact type identifier |
| size_bytes | number | Yes | File size in bytes |
| hash_sha256 | string | Yes | SHA256 hash of content |
| schema_version | string | No | Artifact schema version |
| generated_at | string | No | Artifact generation timestamp |

---

## 4. Signature Schema

### 4.1 signature.json

```json
{
  "algorithm": "sha256",
  "value": "abc123def456...",
  "created_at": "2026-04-30T12:00:00Z",
  "signer": "optional-signer-name",
  "certificate_ref": "optional-certificate-url"
}
```

### 4.2 Supported Algorithms

| Algorithm | Value Length | Description |
|---|---:|---|
| sha256 | 64 hex chars | SHA256 hash signature |
| sha512 | 128 hex chars | SHA512 hash signature |
| ed25519 | 64 hex chars | Ed25519 digital signature |

---

## 5. CLI Commands

### 5.1 Create Bundle

```bash
code-to-gate evidence bundle --from <dir> --out <bundle.zip>
```

Options:
- `--from <dir>` - Source directory containing artifacts
- `--out <bundle.zip>` - Output bundle path
- `--include-optional` - Include optional artifacts
- `--run-id <id>` - Override run ID
- `--sign` - Sign the bundle

Example:
```bash
# Create bundle from analysis output
code-to-gate evidence bundle --from .qh --out evidence-bundle.zip

# Create signed bundle with all artifacts
code-to-gate evidence bundle --from .qh --out evidence-bundle.zip \
  --include-optional --sign
```

### 5.2 Validate Bundle

```bash
code-to-gate evidence validate <bundle.zip>
```

Options:
- `--strict` - Fail on warnings
- `--validate-schemas` - Validate artifact schemas

Example:
```bash
# Basic validation
code-to-gate evidence validate evidence-bundle.zip

# Strict validation with schema checks
code-to-gate evidence validate evidence-bundle.zip --strict --validate-schemas
```

### 5.3 List Bundle Contents

```bash
code-to-gate evidence list <bundle.zip>
```

Example:
```bash
code-to-gate evidence list evidence-bundle.zip
```

### 5.4 Extract Bundle

```bash
code-to-gate evidence extract <bundle.zip> --out <dir>
```

Options:
- `--out <dir>` - Output directory for extracted contents

Example:
```bash
code-to-gate evidence extract evidence-bundle.zip --out ./extracted
```

---

## 6. Validation Rules

### 6.1 Required Artifacts Check

The validator checks for presence of all required artifacts:
- repo-graph.json
- findings.json
- risk-register.yaml
- release-readiness.json
- audit.json

Missing required artifacts result in validation failure.

### 6.2 Hash Verification

Each artifact's SHA256 hash is verified against the manifest. Hash mismatches indicate:
- File corruption
- Unauthorized modification
- Manifest tampering

### 6.3 Parseability Check

JSON artifacts must be valid JSON. YAML artifacts must be valid YAML.

### 6.4 Schema Validation (Optional)

When `--validate-schemas` is enabled, each artifact is validated against its schema:
- Check `version` field presence
- Check `artifact` field presence
- Validate structure matches schema definition

### 6.5 Signature Verification (If Present)

If signature.json is present:
- Verify signature file exists
- Verify algorithm matches manifest
- Verify signature value (hash-based verification)

---

## 7. Validation Result Format

### 7.1 JSON Output

```json
{
  "tool": "code-to-gate",
  "command": "evidence validate",
  "bundle": "evidence-bundle.zip",
  "valid": true,
  "summary": {
    "total_artifacts": 5,
    "valid_artifacts": 5,
    "invalid_artifacts": 0,
    "missing_artifacts": 0
  },
  "errors": 0,
  "warnings": 0
}
```

### 7.2 Error Codes

| Code | Description |
|---|---|
| BUNDLE_NOT_FOUND | Bundle file does not exist |
| MISSING_METADATA | metadata.json not found in bundle |
| METADATA_PARSE_ERROR | Failed to parse metadata.json |
| MISSING_REQUIRED_ARTIFACT | Required artifact not present |
| ARTIFACT_NOT_IN_BUNDLE | Artifact in manifest but not in bundle |
| HASH_MISMATCH | Artifact hash does not match manifest |
| PARSE_ERROR | Failed to parse artifact content |
| EMPTY_YAML | YAML artifact is empty |
| SIGNATURE_FILE_MISSING | Signature referenced but file missing |
| SIGNATURE_PARSE_ERROR | Failed to parse signature.json |

---

## 8. Integration with CI/CD

### 8.1 GitHub Actions Example

```yaml
# .github/workflows/evidence-bundle.yaml
name: Create Evidence Bundle

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  evidence:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      
      - name: Install code-to-gate
        run: npm install -g @quality-harness/code-to-gate
      
      - name: Run analysis
        run: |
          code-to-gate analyze . --emit all --out .qh \
            --policy .github/policy.yaml
      
      - name: Create evidence bundle
        run: |
          code-to-gate evidence bundle --from .qh \
            --out evidence-bundle.zip --include-optional --sign
      
      - name: Validate bundle
        run: |
          code-to-gate evidence validate evidence-bundle.zip \
            --strict --validate-schemas
      
      - name: Upload evidence bundle
        uses: actions/upload-artifact@v4
        with:
          name: evidence-bundle
          path: evidence-bundle.zip
```

### 8.2 Evidence Package for Release

For release acceptance, create evidence package with:

```bash
# Create acceptance evidence directory
mkdir -p .qh/acceptance-evidence

# Run acceptance tests
code-to-gate analyze fixtures/demo-shop-ts --out .qh/acceptance-evidence/demo-shop-ts
code-to-gate analyze fixtures/demo-auth-js --out .qh/acceptance-evidence/demo-auth-js

# Create evidence bundle for each fixture
code-to-gate evidence bundle --from .qh/acceptance-evidence/demo-shop-ts \
  --out .qh/acceptance-evidence/demo-shop-ts-bundle.zip

code-to-gate evidence bundle --from .qh/acceptance-evidence/demo-auth-js \
  --out .qh/acceptance-evidence/demo-auth-js-bundle.zip
```

---

## 9. Acceptance Evidence Package

### 9.1 Evidence Package Structure (from product-acceptance-v1.md)

```
.qh/acceptance-evidence/
  |-- artifacts/
  |   |-- demo-shop-ts/
  |   |   |-- repo-graph.json
  |   |   |-- findings.json
  |   |   |-- ... (all artifacts)
  |   |-- demo-auth-js/
  |   |-- express-example/
  |   |-- ...
  |-- demo-shop-ts-bundle.zip
  |-- demo-auth-js-bundle.zip
  |-- exit-code-evidence.yaml
  |-- schema-validation-evidence.yaml
  |-- timing-evidence.yaml
  |-- fp-fn-evidence.yaml
  |-- documentation-evidence.yaml
  |-- acceptance-summary.yaml
```

### 9.2 Acceptance Summary Evidence

```yaml
# acceptance-summary.yaml
product: code-to-gate
phase: Phase 1 a
version: v0.2.0
date: 2026-04-30
status: GO

criteria_results:
  real_repo_acceptance: pass
  fixture_acceptance: pass
  schema_acceptance: pass
  cli_acceptance: pass
  performance_acceptance: pass

evidence_package: .qh/acceptance-evidence/

decision: GO
decision_date: 2026-04-30
decision_by: tech-lead
```

---

## 10. Exit Codes

| Code | Name | Condition |
|---:|---|---|
| 0 | OK | Bundle valid, all checks pass |
| 2 | USAGE_ERROR | Invalid CLI arguments |
| 7 | SCHEMA_FAILED | Bundle validation failed |
| 10 | INTERNAL_ERROR | Internal error during bundle operation |

---

## 11. Future Enhancements

### 11.1 Planned Features

- Ed25519 digital signature support
- Certificate-based attestation
- Timestamp server integration
- Compressed bundle support
- Incremental bundle updates

### 11.2 Version History

| Version | Date | Changes |
|---|---|---|
| ctg.evidence/v1alpha1 | 2026-04-30 | Initial release |

---

## 12. References

| Document | Path | Purpose |
|---|---|---|
| Product Acceptance | `docs/product-acceptance-v1.md` | Acceptance evidence requirements |
| Artifact Contracts | `docs/artifact-contracts.md` | Artifact type definitions |
| Schema Definitions | `schemas/*.schema.json` | Artifact schemas |
| Evidence Types | `src/evidence/evidence-types.ts` | TypeScript type definitions |
| Bundle Builder | `src/evidence/bundle-builder.ts` | Bundle implementation |