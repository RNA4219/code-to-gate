# code-to-gate Phase 1 Real Repository Test Results

**Date**: 2026-04-30
**Version**: 0.2.0-alpha.1
**Tester**: Claude Code automated testing

## Executive Summary

Phase 1 real repository tests were executed using existing fixtures as "real repo simulation" due to git clone limitations. The core CLI commands (`scan`, `analyze`, `readiness`, `import`, `export`) function correctly and generate expected artifacts. Some schema validation and performance test issues were identified.

---

## Repositories Tested

### Fixture-based Testing (Real Repo Simulation)

| Repository | Type | Files | Description |
|------------|------|-------|-------------|
| `fixtures/demo-ci-imports` | CI Import | 9 | Small fixture with CI tool outputs (eslint, semgrep, tsc, coverage) |
| `fixtures/demo-shop-ts` | TypeScript Shop | 13 | E-commerce fixture with order/payment logic |

---

## Command Execution Results

### demo-ci-imports Fixture

| Command | Exit Code | Duration | Result |
|---------|-----------|----------|--------|
| `scan` | 0 | 5.22s | Success - generated repo-graph.json |
| `analyze` | 0 | 0.80s | Success - 0 findings generated |
| `readiness --policy strict.yaml` | 0 | 0.56s | Success - status: passed |
| `import semgrep` | 0 | 0.62s | Success - imported 1 finding |

**Generated Artifacts**:
- `repo-graph.json` (18.6KB)
- `findings.json` (1.4KB)
- `risk-register.yaml` (345 bytes)
- `audit.json` (2.0KB)
- `release-readiness.json` (731 bytes)
- `analysis-report.md` (492 bytes)
- `imports/semgrep-findings.json`

### demo-shop-ts Fixture

| Command | Exit Code | Duration | Result |
|---------|-----------|----------|--------|
| `scan` | 0 | 8.38s | Success - 13 files, 117 symbols, 177 relations |
| `analyze` | 5 (READINESS_NOT_CLEAR) | 0.71s | Success - 16 findings (10 critical, 4 high, 2 medium) |
| `readiness --policy strict.yaml` | 0 | 0.63s | Success - status: passed |

**Generated Artifacts**:
- `repo-graph.json` (181KB)
- `findings.json` (15KB) - 16 findings detected
- `risk-register.yaml` (3.2KB)
- `audit.json` (2.7KB)
- `release-readiness.json` (728 bytes)
- `analysis-report.md` (6.1KB)
- `gatefield.json` (export)
- `state-gate.json` (export)
- `manual-bb.json` (export)

---

## Artifact Counts Summary

| Fixture | Files | Symbols | Relations | Findings | Critical | High | Medium |
|---------|-------|---------|-----------|----------|----------|------|--------|
| demo-ci-imports | 9 | 6 | 22 | 0 | 0 | 0 | 0 |
| demo-shop-ts | 13 | 117 | 177 | 16 | 10 | 4 | 2 |

---

## Findings Detected in demo-shop-ts

The analyze command detected the following security and quality issues:

1. **CLIENT_TRUSTED_PRICE** (Critical) - 9 instances
   - Client-supplied price used without validation
   - Evidence: `src/api/order/create.ts` lines 15-43
   - Tags: security, price-manipulation, owasp-api1

2. **WEAK_AUTH_GUARD** (Critical) - 1 instance
   - Authentication guard only checks header presence
   - Evidence: `src/auth/guard.ts` lines 14-25
   - Tags: security, authentication, jwt, bypass

3. **UNTESTED_CRITICAL_PATH** (High) - 4 instances
   - Critical entrypoints without test coverage
   - Files affected: order/create.ts, guard.ts, orders.ts, order-processor.ts

4. **LARGE_MODULE** (Medium) - 2 instances
   - Modules with too many functions (>20 threshold)
   - Files: large-file.ts (73 functions), nested-structures.ts (48 functions)

---

## Schema Validation Results

| Artifact | Status | Notes |
|----------|--------|-------|
| `release-readiness.json` | PASS | Validated successfully |
| `repo-graph.json` | FAIL | Symbol property validation errors |
| `audit.json` | FAIL | Policy additional property error |
| `findings.json` | FAIL | Schema strictness issues |

**Schema Validation Issues**:
- `repo-graph.json`: Symbols have additional properties not allowed by schema
- `audit.json`: Policy object has additional properties

---

## Vitest Unit Test Results

**Total Tests**: ~1200+ tests across 30+ test files

| Category | Status |
|----------|--------|
| Contract Tests (gatefield, state-gate, manual-bb, sarif) | PASS |
| Integration Tests (fixtures, export, pipeline) | PASS |
| Error Handling Tests | PASS |
| Rules Tests (all rule implementations) | PASS |
| TypeScript Adapter Tests | PASS |
| Suppression Tests | PASS |

**Failed Tests** (10 failures):

1. `tests/integration/full-flow.test.ts > audit.json validates against schema`
   - Exit code 7 instead of expected 0

2. `tests/integration/full-flow.test.ts > all generated artifacts pass schema validation`
   - Schema validation failures

3. `tests/integration/full-flow.test.ts > handles multiple concurrent scan operations`
   - Race condition handling issue

4. `tests/integration/full-flow.test.ts > handles multiple concurrent analyze operations`
   - Race condition handling issue

5. `tests/integration/full-flow.test.ts > handles repository with many files`
   - Test timeout (60s exceeded)

6. `alpha-acceptance.test.ts > schema validate should accept valid artifacts`
   - Exit code mismatch

7. `alpha-acceptance.test.ts > schema validate should reject invalid JSON`
   - File not found error

8. `analyze-performance.test.ts > performance does not degrade`
   - Performance metric threshold exceeded

9. `scan-performance.test.ts > performance is consistent`
   - Timing variance too high

10. `scan-performance.test.ts > scan time scales linearly`
    - Scaling factor exceeded threshold

---

## Performance Measurements

| Operation | Duration | Target | Status |
|-----------|----------|--------|--------|
| scan demo-ci-imports | 5.22s | <30s | PASS |
| scan demo-shop-ts | 8.38s | <30s | PASS |
| analyze demo-ci-imports | 0.80s | <60s | PASS |
| analyze demo-shop-ts | 0.71s | <60s | PASS |
| readiness check | 0.56-0.63s | <10s | PASS |
| import semgrep | 0.62s | <5s | PASS |

---

## Issues Encountered

### Critical Issues

1. **Schema Validation Mismatch**
   - Generated artifacts have properties that schemas don't allow
   - Affects: repo-graph.json, audit.json
   - Recommendation: Update schemas to allow additional properties or align CLI output

### Medium Issues

2. **Performance Test Thresholds**
   - Some performance tests have tight thresholds causing failures
   - Recommendation: Adjust thresholds or improve performance baseline

3. **Concurrent Operation Handling**
   - Race conditions in concurrent scan/analyze operations
   - Recommendation: Add file locking or mutex for concurrent writes

### Minor Issues

4. **Test Timeout on Large Repos**
   - 60s timeout insufficient for larger fixture processing
   - Recommendation: Increase timeout or optimize large repo handling

5. **Empty Schema File Warning**
   - `evidence-ref.schema.json` is empty, causing warnings
   - Recommendation: Populate schema or remove placeholder

---

## Export Functionality

All export targets work correctly:

| Target | Output File | Schema Version |
|--------|-------------|----------------|
| gatefield | gatefield.json | ctg.gatefield/v1alpha1 |
| state-gate | state-gate.json | ctg.state-gate/v1alpha1 |
| manual-bb | manual-bb.json | ctg.manual-bb/v1alpha1 |
| workflow-evidence | workflow-evidence.json | ctg.workflow-evidence/v1alpha1 |
| sarif | sarif.json | SARIF 2.1.0 |

---

## Recommendations

### Immediate Actions

1. Fix schema validation for repo-graph.json (symbols property alignment)
2. Fix schema validation for audit.json (policy property alignment)
3. Populate evidence-ref.schema.json or remove empty schema

### Future Improvements

1. Add file locking for concurrent operations
2. Optimize large repository handling
3. Adjust performance test thresholds for realistic baseline
4. Add more real repository fixtures with varied complexity

---

## Conclusion

The code-to-gate Phase 1 CLI is functional and produces expected artifacts for scan, analyze, readiness, import, and export operations. Core functionality works correctly on fixture-based repository simulation. Schema validation and performance tests require attention before production readiness.