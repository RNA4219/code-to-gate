---
task_id: 20260611-06
intent_id: INT-SQL-DATABASE-ANALYSIS-001
owner: code-to-gate-team
status: done
last_reviewed_at: 2026-06-11
next_review_due: 2026-06-25
---
# Task Seed: DB Migration運用ルール

## Objective
`DB_DROP_INDEX`、`DB_MIGRATION_NO_TRANSACTION_SIGNAL`、`DB_ROLLBACK_NOT_EVIDENCED`を実装する。

## Requirements
- transaction/rollbackは静的signalとして扱い、保証を断定しない。
- 同一ファイルと対応down/revertを反証範囲とする。

## TDD / Verification
- 各ruleのpositive/negative/refutation test

## Acceptance Criteria
- 3 ruleが根拠付きfindingを生成する。
