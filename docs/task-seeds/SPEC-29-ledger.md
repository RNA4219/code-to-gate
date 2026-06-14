---
spec_id: SPEC-29
title: SQL/Database Change Risk Analysis
status: done
created_at: 2026-06-11
updated_at: 2026-06-14
wave_count: 5
task_count: 10
---

# Task Seed Ledger: SPEC-29

## Overview

SPEC-29 implements SQL/Database change risk analysis in code-to-gate CLI.

**Status**: done - Phase 1-3全Verification Gate・strict品質ゲート通過

**Key Constraints**:
- No external SQL parser dependencies
- No real database connections
- Lightweight tokenizer/parser only
- ORM固有構文の完全解析は対象外。path/contentからのbest-effort分類のみ許可

## Task Seeds

| Wave | Task Seed ID | Objective | Status | Dependencies |
|------|--------------|-----------|--------|--------------|
| 0 | 20260611-01 | Contract/Task Seed foundation | done | - |
| 1 | 20260611-02 | Database artifact types | done | 20260611-01 |
| 1 | 20260611-03 | SQL lightweight parser | done | 20260611-02 |
| 2 | 20260611-04 | Destructive ops rules (3 rules) | done | 20260611-03 |
| 2 | 20260611-05 | Schema change rules (2 rules) | done | 20260611-04 |
| 2 | 20260611-06 | Migration ops rules (3 rules) | done | 20260611-05 |
| 3 | 20260611-07 | Scan wiring (--database-analysis) | done | 20260611-06 |
| 3 | 20260611-08 | Analyze/Diff integration | done | 20260611-07 |
| 4 | 20260611-09 | Integration tests + fixtures | done | 20260611-08 |
| 4 | 20260611-10 | Public contract + docs | done | 20260611-09 |

## Open Decisions (Finalized in Wave 0)

### Decision 1: --database-analysis CLI Flag Behavior
**Decision**: Default OFF, explicit `--database-analysis` enables DB scanning.
- Rationale: Keeps code-to-gate scope minimal for general use
- Alternative considered: Auto-detect via file patterns - rejected due to false positives

### Decision 2: Artifact Output Location
**Decision**: `database-assets.json` alongside `findings.json` in `.qh/`.
- Same directory as other artifacts
- Schema version: `database-assets@v1alpha1`

### Decision 3: Transaction Guarantee Detection
**Decision**: Static heuristics only (no runtime analysis).
- Patterns: `BEGIN/COMMIT`, `transaction()`, `Transaction` decorator
- Confidence: 0.70 (heuristic, not proof)

### Decision 4: Rollback Evidence Scope
**Decision**: Best-effort rollback pattern detection.
- Patterns: `ROLLBACK`, `down()`, `revert()` in migration files
- Note: Cannot guarantee rollback correctness without runtime

### Decision 5: ORM Scope
**Decision**: ORM固有migrationの完全解析は対象外。
- 初期対応はpath/contentからのbest-effort分類のみ
- ORM別の意味解析は後続仕様で扱う

## Rule IDs (8 Rules)

| Rule ID | Category | Severity | Description |
|---------|----------|----------|-------------|
| DB_DROP_TABLE | data | critical | DROP TABLE detected |
| DB_DROP_COLUMN | data | high | DROP COLUMN without migration guard |
| DB_ADD_NOT_NULL_WITHOUT_DEFAULT | data | high | NOT NULL constraint without default |
| DB_RISKY_TYPE_CHANGE | data | medium | Type change that may lose data |
| DB_DROP_CONSTRAINT | data | high | DROP CONSTRAINT detected |
| DB_DROP_INDEX | data | medium | DROP INDEX detected |
| DB_MIGRATION_NO_TRANSACTION_SIGNAL | data | medium | Migration without transaction wrapper |
| DB_ROLLBACK_NOT_EVIDENCED | data | medium | Migration rollback pattern missing |

## Acceptance Criteria

1. `--database-analysis` flag functional ✓
2. `database-assets.json` generated with valid schema ✓
3. All 8 rules produce findings on fixtures ✓
4. FP rate <= 15% (Phase 1 target) ✓
5. Integration tests pass ✓
6. Schema validation passes ✓

## Acceptance Record (2026-06-11)

### Execution Results

| Test Suite | Status | Tests |
|------------|--------|-------|
| Unit tests (database-analyzer) | PASS | 100+ |
| Integration tests | PASS | 140 tests |
| Edge case tests | PASS | 8 tests |
| Performance test | PASS | 2 tests |

### Performance Measurement

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| 1000 SQL files | 30 sec | 6.26 sec | ✓ |
| 10 MiB total | N/A | ~10 MiB | ✓ |
| Memory | Stable | Stable | ✓ |

### Known Gaps

1. **ORM Migration Parsing**: Limited support for ORM-specific syntax (TypeORM, Sequelize, Django). Best-effort classification only.
2. **Transaction Detection**: Static heuristics only (BEGIN/COMMIT patterns). Cannot verify actual transaction behavior.
3. **Rollback Evidence**: Pattern-based detection only. Cannot verify rollback correctness without runtime.
4. **Dialect Confidence**: Dialect detection based on syntax hints. Unknown dialect fallback may miss dialect-specific risks.

### Traceability Verified

- DB findings → findings.json ✓
- DB findings → test-seeds.json ✓
- DB findings → results.sarif ✓
- DB findings → release-readiness.json ✓

### Files Modified/Created

**New Files**:
- `src/types/database-assets.ts`
- `src/core/sql-lightweight-parser.ts`
- `src/core/database-analyzer.ts`
- `src/rules/db-destructive-ops.ts`
- `src/rules/db-schema-change.ts`
- `src/rules/db-migration-ops.ts`
- `schemas/database-assets.schema.json`
- `fixtures/demo-migrations-ts/`
- `tests/integration/database-edge-cases.test.ts`
- `tests/integration/database-performance.test.ts`

**Modified Files**:
- `src/cli/scan.ts` (--database-analysis flag)
- `src/cli/analyze.ts` (DB findings wiring)
- `src/cli/diff.ts` (Diff semantic DB rules)
- `src/rules/index.ts` (Register DB rules)
- `src/application/rule-evaluator.ts` (Explicit rule set selection)

## Timeline

- Wave 0: 2026-06-11 (Day 1) - Planning
- Wave 1: 2026-06-11 (Day 1) - Foundation
- Wave 2: 2026-06-12 (Day 2) - Rules
- Wave 3: 2026-06-12 (Day 2) - CLI wiring
- Wave 4: 2026-06-13 (Day 3) - Integration
