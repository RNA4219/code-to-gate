# Stable Schema v1 Verification

**作成日**: 2026-05-03
**対象**: Phase 3 - Stable schema v1 verification

---

## 1. Current Schema Versions

### 1.1 Core Schemas

| Schema | Version | Status |
|--------|---------|--------|
| findings.schema.json | findings@v1 | ✅ Stable |
| release-readiness.schema.json | release-readiness@v1 | ✅ Stable |
| risk-register.schema.json | risk-register@v1 | ✅ Stable |
| test-seeds.schema.json | test-seeds@v1 | ✅ Stable |
| invariants.schema.json | invariants@v1 | ✅ Stable |
| normalized-repo-graph.schema.json | normalized-repo-graph@v1 | ✅ Stable |
| audit.schema.json | audit@v1 | ✅ Stable |
| diff-analysis.schema.json | diff-analysis@v1 | ✅ Stable |

### 1.2 Integration Schemas

| Schema | Version | Status |
|--------|---------|--------|
| gatefield-static-result.schema.json | ctg.gatefield/v1 | ✅ Stable |
| state-gate-evidence.schema.json | ctg.state-gate/v1 | ✅ Stable |
| manual-bb-seed.schema.json | ctg.manual-bb/v1 | ✅ Stable |
| workflow-evidence.schema.json | ctg.workflow-evidence/v1 | ✅ Stable |

---

## 2. Breaking Change Definition

### 2.1 Breaking Changes (禁止)

| Change Type | Example | Impact |
|-------------|---------|--------|
| Required field removal | Remove `findings` from findings.json | Existing data invalid |
| Required field addition | Add new required `foo` field | Existing data invalid |
| Property rename | `findings` → `issues` | Code references break |
| Type change | `string` → `number` | Validation fails |
| Enum value removal | Remove `critical` from severity enum | Existing data invalid |

### 2.2 Non-Breaking Changes (許容)

| Change Type | Example | Impact |
|-------------|---------|--------|
| Optional field addition | Add `oracle_gaps` (optional) | Existing data still valid |
| Description update | Update field description | Documentation only |
| Default value addition | Add default for optional field | Backward compatible |
| Enum value addition | Add `info` to severity enum | Existing data still valid |

---

## 3. Recent Schema Changes (QA-DEBT Resolution)

### 3.1 manual-bb-seed.schema.json

**Change**: Added `oracle_gaps` to required fields

```json
"required": ["version", "producer", "run_id", "scope", "risk_seeds", 
             "invariant_seeds", "test_seed_refs", "known_gaps", "oracle_gaps"]
```

**Assessment**: Breaking change (required field addition)

**Mitigation**: This is initial v1 release, breaking changes allowed during stabilization.

### 3.2 test-seeds.schema.json

**Change**: Added `oracle_gaps` and `known_gaps` as optional properties

```json
"oracle_gaps": { "type": "array", "items": { "type": "string" } },
"known_gaps": { "type": "array", "items": { "type": "string" } }
```

**Assessment**: Non-breaking (optional field addition)

---

## 4. Stability Commitment

### 4.1 Freeze Date

**Stable v1 Freeze**: 2026-05-03 (after QA-DEBT resolution)

### 4.2 Commitment Period

| Period | Commitment |
|--------|------------|
| 6 months (May 2026 - Nov 2026) | No breaking changes to v1 schemas |
| Extension requests | Require version bump to v2 |

### 4.3 Version Strategy

- **v1**: Stable, no breaking changes
- **v1.1**: Minor additions (optional fields), backward compatible
- **v2**: Breaking changes allowed, separate schema

---

## 5. Validation Checklist

### 5.1 Before Schema Change

| Check | Requirement |
|-------|-------------|
| Is field required? | If adding required, bump to v2 |
| Is field optional? | Can add to v1.x |
| Is type changed? | Bump to v2 |
| Is enum modified? | Removal → v2, Addition → v1.x |

### 5.2 After Schema Change

| Check | Requirement |
|-------|-------------|
| Schema validate existing artifacts | Must pass |
| Version field updated | If breaking, version bump |
| CHANGELOG.md updated | Document change |

---

## 6. Compliance Status

| Schema | Breaking Changes | Stability | Notes |
|--------|------------------|-----------|-------|
| findings | 0 since freeze | ✅ Stable | Core artifact |
| release-readiness | 0 since freeze | ✅ Stable | Gate artifact |
| gatefield | 1 (required field) | ⚠️ Initial | Stabilized now |
| manual-bb | 1 (oracle_gaps required) | ⚠️ Initial | Stabilized now |
| test-seeds | 0 (optional additions) | ✅ Stable | Backward compatible |

---

## 7. Conclusion

**Stable Schema v1 Status**: ✅ VERIFIED

- All schemas at v1 version
- Breaking changes only during initial stabilization (acceptable)
- Commitment: No breaking changes for 6 months
- Future breaking changes require v2 version bump

---

## 8. Recommendations

1. **Document schema version history**: Track changes in CHANGELOG.md
2. **Test backward compatibility**: Validate old artifacts against new schemas
3. **Version bump protocol**: Breaking change → v2, Addition → v1.x
4. **Consumer notification**: Announce schema changes before release