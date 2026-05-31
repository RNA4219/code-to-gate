# Real-Repo Validation Criteria

**Generated**: 2026-05-31
**Repository**: code-to-gate (RNA4219/code-to-gate)

---

## Purpose

Real-repo validation ensures code-to-gate produces accurate, useful findings on real-world codebases. This document defines acceptance criteria for fixture validation.

---

## Fixture Repository Coverage

| Category | Fixture | Language | Key Patterns |
|----------|---------|----------|--------------|
| E-commerce | demo-shop-ts | TypeScript | Payment, auth, validation |
| Auth system | demo-auth-js | JavaScript | Auth guards, session handling |
| CI imports | demo-ci-imports | TypeScript | Import patterns, module structure |
| Edge cases | demo-edge-cases | TypeScript | FP stress tests, boundary cases |
| GitHub Actions | demo-github-actions-ts | TypeScript | CI/CD patterns |
| Monorepo | demo-monorepo | TypeScript | Multi-package structure |
| Multilang | demo-multilang | Mixed | Cross-language patterns |
| Python | demo-python | Python | Python-specific patterns |
| Ruby | demo-ruby | Ruby | Ruby-specific patterns |
| Suppressions | demo-suppressions-ts | TypeScript | Suppression handling |

**Total fixtures**: 10

---

## Validation Criteria

### 1. Analysis Completeness

| Criterion | Threshold | Verification |
|-----------|-----------|--------------|
| Files scanned | 100% of source files | `repo-graph.json` file count |
| Symbols extracted | 100% of functions/classes | `repo-graph.json` symbol count |
| Findings generated | >= 1 per fixture | `findings.json` non-empty |
| No crash/panic | 0 runtime errors | CLI exit code 0 or 2 |

### 2. Finding Quality

| Criterion | Threshold | Verification |
|-----------|-----------|--------------|
| False positive rate | <= 15% | Manual review, issue tracking |
| Severity accuracy | >= 90% | Cross-check with known issues |
| Category match | >= 95% | Pattern-to-category mapping |
| Evidence backing | 100% | Every finding has `evidence` field |

### 3. Rule Coverage

Each built-in rule must trigger at least once across fixtures:

| Rule | Trigger Fixture | Status |
|------|-----------------|--------|
| CLIENT_TRUSTED_PRICE | demo-shop-ts | ✅ |
| WEAK_AUTH_GUARD | demo-auth-js | ✅ |
| MISSING_SERVER_VALIDATION | demo-shop-ts | ✅ |
| RAW_SQL | demo-python | ✅ |
| HARDCODED_SECRET | demo-edge-cases | ✅ |
| UNSAFE_REDIRECT | demo-shop-ts | ✅ |
| TRY_CATCH_SWALLOW | demo-shop-ts | ✅ |
| UNTESTED_CRITICAL_PATH | demo-shop-ts | ✅ |
| ENV_DIRECT_ACCESS | demo-edge-cases | ✅ |
| MISSING_RATE_LIMIT | demo-shop-ts | ✅ |
| LARGE_MODULE | demo-monorepo | ✅ |
| UNSAFE_DELETE | demo-edge-cases | ✅ |
| DEPRECATED_API_USAGE | demo-shop-ts | ✅ |
| MAGIC_NUMBER | demo-shop-ts | ✅ |
| TODO_MARKER | demo-shop-ts | ✅ |
| FUNCTION_SIGNATURE_CHANGE | demo-monorepo | ✅ |
| SUPPRESSION_PATTERN | demo-suppressions-ts | ✅ |

### 4. Performance

| Criterion | Threshold | Verification |
|-----------|-----------|--------------|
| Analysis time (per fixture) | < 30s | CI timing logs |
| Memory usage | < 512MB | Process monitoring |
| Parallel efficiency | >= 50% speedup | `--parallel` benchmark |

---

## Weekly CI Acceptance

### Workflow

Location: `.github/workflows/code-to-gate-release.yml` (acceptance job)

Schedule: Sunday 00:00 UTC (cron: `0 0 * * 0`)

Script: `scripts/fixture-acceptance.ps1`

### Expected Output

```
.qh/acceptance/fixtures/
├── demo-shop-ts/
│   ├── findings.json
│   └── release-readiness.json
├── demo-auth-js/
│   ├── findings.json
│   └── release-readiness.json
...
```

### Failure Handling

| Failure Type | Action |
|--------------|--------|
| Crash/panic | Block release, investigate root cause |
| No findings | Warn, may indicate rule regression |
| High FP rate | Investigate, adjust rule thresholds |
| Performance regression | Benchmark, optimize |

---

## Expansion Plan

### Phase 1 (Current)

- 10 internal fixtures
- Weekly CI validation
- Manual FP review

### Phase 2 (Future - P2 Backlog)

- Add external OSS fixtures (express, axios, dayjs)
- Add framework fixtures (React, Vue, Django)
- Automated FP tracking via GitHub issues

### Phase 3 (Future)

- Community fixture contributions
- Benchmark suite
- FP regression tests

---

## References

- GOVERNANCE.md: Evidence retention policy (90 days)
- RUNBOOK.md: P0-03 real repo verification
- docs/public-readiness/follow-up-backlog.md: FB-07

---

**Last Updated**: 2026-05-31
**Next Review**: 2026-07-31