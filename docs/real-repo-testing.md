# Real Repository Testing Guide for code-to-gate Phase 1

**Version**: v1.0
**Date**: 2026-04-30
**Purpose**: Validate code-to-gate against public repositories for Phase 1 Alpha acceptance

---

## 1. Overview

This document describes the real repository testing methodology for code-to-gate Phase 1 Alpha release acceptance testing.

Real repo testing validates that code-to-gate:
- Executes successfully on real-world codebases
- Generates valid artifacts with correct schema
- Returns appropriate exit codes
- Performs within target time limits

---

## 2. Acceptance Criteria

From `docs/product-acceptance-v1.md` Section 3.1.1:

| Criterion | Requirement |
|-----------|-------------|
| Real repo count | 3+ public repos |
| Repo size | 100-500 files (TS/JS) each |
| Repo types | 1 Backend (Express/Fastify), 1 Frontend SPA, 1 Library |
| Execution | scan/analyze/readiness runnable |
| Exit codes | 0 or 1 (matching expected values) |
| Schema validation | Generated artifacts pass schema validation |

---

## 3. Test Repositories

### 3.1 Repository Selection

| Repository | Type | Description | Expected Exit Code |
|------------|------|-------------|-------------------|
| `expressjs/express` | Backend | Express.js web framework | 0 or 1 |
| `vercel/next.js` (examples) | Frontend | Next.js React framework examples | 0 or 1 |
| `microsoft/TypeScript` | Library | TypeScript compiler/language | 0 |

### 3.2 Repository Details

#### expressjs/express
- **URL**: https://github.com/expressjs/express.git
- **Type**: Backend web framework
- **Files**: ~100-300 TS/JS files (within target range)
- **Characteristics**: Mature Node.js backend framework with middleware patterns

#### vercel/next.js (examples only)
- **URL**: https://github.com/vercel/next.js.git
- **Type**: Frontend framework
- **Scope**: `examples/` directory only (to reduce file count)
- **Files**: ~200-400 TS/JS files in examples
- **Characteristics**: Modern React/Next.js patterns, SSR, routing

#### microsoft/TypeScript
- **URL**: https://github.com/microsoft/TypeScript.git
- **Type**: Language/compiler library
- **Files**: ~50-150 relevant source files (filtered)
- **Expected**: Exit code 0 (library should pass cleanly)
- **Characteristics**: Core TypeScript implementation, complex AST handling

---

## 4. Test Execution

### 4.1 Prerequisites

Before running real repo tests:

```bash
# 1. Build the CLI
npm run build

# 2. Verify CLI is available
node dist/cli.js --help
```

### 4.2 Running the Test Script

```bash
# Run all repos
./scripts/real-repo-test.sh

# Run specific repo
./scripts/real-repo-test.sh --repo express

# Clean up cloned repos after testing
./scripts/real-repo-test.sh --clean
```

### 4.3 Manual Testing Steps

For manual verification:

```bash
# 1. Clone a test repo
git clone --depth 1 https://github.com/expressjs/express.git .real-repo-temp/express

# 2. Run scan
node dist/cli.js scan .real-repo-temp/express --out .real-repo-results/express/scan

# 3. Run analyze
node dist/cli.js analyze .real-repo-temp/express --emit all --out .real-repo-results/express/analyze --llm-mode none

# 4. Run readiness
node dist/cli.js readiness .real-repo-temp/express --out .real-repo-results/express/readiness --llm-mode none

# 5. Validate schemas
node dist/cli.js schema validate .real-repo-results/express/analyze/repo-graph.json
node dist/cli.js schema validate .real-repo-results/express/analyze/findings.json
node dist/cli.js schema validate .real-repo-results/express/analyze/risk-register.yaml
node dist/cli.js schema validate .real-repo-results/express/analyze/release-readiness.json
node dist/cli.js schema validate .real-repo-results/express/analyze/audit.json
```

---

## 5. Expected Results

### 5.1 Per-Repository Expectations

#### expressjs/express

| Test | Expected |
|------|----------|
| scan exit code | 0 |
| analyze exit code | 0 or 1 |
| readiness exit code | 0 or 1 |
| repo-graph.json | Generated and valid |
| findings.json | Generated and valid |
| schema validation | All pass |

**Note**: Express may trigger findings due to its age and patterns. Exit code 1 (needs_review) is acceptable.

#### vercel/next.js (examples)

| Test | Expected |
|------|----------|
| scan exit code | 0 |
| analyze exit code | 0 or 1 |
| readiness exit code | 0 or 1 |
| repo-graph.json | Generated and valid |
| findings.json | Generated and valid |
| schema validation | All pass |

**Note**: Examples directory may have varied patterns. Both exit codes are acceptable.

#### microsoft/TypeScript

| Test | Expected |
|------|----------|
| scan exit code | 0 |
| analyze exit code | 0 (clean library) |
| readiness exit code | 0 |
| repo-graph.json | Generated and valid |
| findings.json | Generated and valid |
| schema validation | All pass |

**Note**: TypeScript compiler should be well-structured. Expect clean pass (exit 0).

### 5.2 Performance Targets

From acceptance criteria:

| Operation | Target | Maximum |
|-----------|--------|---------|
| Small repo scan (100-500 files) | <= 30s | 60s |
| Small repo analyze (no LLM) | <= 60s | 120s |
| Schema validation (per artifact) | <= 5s | 10s |

---

## 6. Results Collection

### 6.1 Output Structure

```
.real-repo-results/
  express/
    scan/
      repo-graph.json
    analyze/
      repo-graph.json
      findings.json
      risk-register.yaml
      test-seeds.json
      release-readiness.json
      audit.json
    readiness/
      release-readiness.json
  express-results.yaml
  nextjs/
    ...
  nextjs-results.yaml
  typescript/
    ...
  typescript-results.yaml
  overall-summary.yaml
```

### 6.2 Results YAML Format

Each repository generates a results file:

```yaml
# Real repo test results for express
repo: expressjs/express
type: backend
date: 2026-04-30T12:00:00Z
file_count: 150

tests:
  scan:
    exit_code: 0
    expected: 0
    result: pass
    duration_seconds: 18
    target_seconds: 30
    performance_result: pass
  
  analyze:
    exit_code: 1
    expected: 0_or_1
    result: pass
    duration_seconds: 45
    target_seconds: 60
    performance_result: pass
  
  readiness:
    exit_code: 1
    expected: 0_or_1
    result: pass
    duration_seconds: 40
  
  schema_validation:
    failures: 0
    result: pass

summary:
  tests_passed: 4
  tests_total: 4
  overall_result: pass
```

### 6.3 Overall Summary

```yaml
# Real repo test overall summary - Phase 1
date: 2026-04-30T12:00:00Z
repos_tested:
  - name: express
    description: expressjs/express
    result: pass
  - name: nextjs
    description: vercel/next.js (examples only)
    result: pass
  - name: typescript
    description: microsoft/TypeScript
    result: pass

summary:
  repos_passed: 3
  repos_failed: 0
  repos_total: 3
  phase1_criteria:
    real_repo_count: 3
    real_repo_target: 3
    meets_criteria: true
  
  overall_result: pass
```

---

## 7. Acceptance Evidence

### 7.1 Required Evidence Package

For Phase 1 acceptance, collect:

1. **Artifact Evidence**: Generated `.qh/` artifacts for each repo
2. **Exit Code Evidence**: Recorded exit codes matching expectations
3. **Schema Validation Evidence**: All artifact validations passed
4. **Timing Evidence**: Performance within targets
5. **Results YAML**: Summary files for each repo

### 7.2 Evidence Integration

Include in acceptance package:

```
.qh/acceptance-evidence/real-repos/
  artifacts/
    express/
      repo-graph.json
      findings.json
      ...
    nextjs/
      ...
    typescript/
      ...
  express-results.yaml
  nextjs-results.yaml
  typescript-results.yaml
  overall-summary.yaml
```

---

## 8. Troubleshooting

### 8.1 Common Issues

| Issue | Cause | Resolution |
|-------|-------|------------|
| Clone timeout | Large repo | Use `--depth 1` shallow clone |
| Too many files | Full repo cloned | Use subdirectory (e.g., examples/) |
| Schema validation fail | Invalid artifact | Check artifact generation logic |
| Exit code mismatch | Unexpected findings | Review finding rules |
| Performance slow | Many files | Filter to relevant files |

### 8.2 Exit Code Reference

| Code | Name | Condition |
|------|------|-----------|
| 0 | OK | Success / passed |
| 1 | READINESS_NOT_CLEAR | needs_review / blocked_input |
| 2 | USAGE_ERROR | CLI argument error |
| 3 | SCAN_FAILED | Parser failure |
| 10 | INTERNAL_ERROR | Unknown error |

---

## 9. Test Automation

### 9.1 CI Integration

For GitHub Actions integration:

```yaml
# .github/workflows/real-repo-test.yaml
name: Real Repo Test

on:
  schedule:
    - cron: '0 0 * * 0'  # Weekly
  workflow_dispatch:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Build
        run: npm run build
      
      - name: Run Real Repo Tests
        run: ./scripts/real-repo-test.sh --clean
      
      - name: Upload Results
        uses: actions/upload-artifact@v4
        with:
          name: real-repo-results
          path: .real-repo-results/
```

### 9.2 Vitest Integration

Real repo tests can also be run via Vitest:

```bash
npm run test:real-repo
```

See `src/__tests__/real-repos/` for test implementation.

---

## 10. Appendix

### 10.1 File Count Estimation

```bash
# Count TS/JS files in a repo
find <repo-dir> -type f \( -name "*.ts" -o -name "*.js" -o -name "*.tsx" -o -name "*.jsx" \) | wc -l
```

### 10.2 Quick Validation

```bash
# Quick check of a single repo
node dist/cli.js scan <repo> --out .test && node dist/cli.js schema validate .test/repo-graph.json
```

### 10.3 Reference Documents

| Document | Path | Purpose |
|----------|------|---------|
| Product Acceptance v1 | `docs/product-acceptance-v1.md` | Full acceptance criteria |
| Error Model | `docs/error-model.md` | Exit code definitions |
| Artifact Contracts | `docs/artifact-contracts.md` | Artifact specifications |
| Schema Files | `schemas/*.schema.json` | Schema definitions |