---
task_id: 20260611-04
intent_id: INT-SQL-DATABASE-ANALYSIS-001
owner: code-to-gate-team
status: done
last_reviewed_at: 2026-06-11
next_review_due: 2026-06-25
---
# Task Seed: DB破壊的操作ルール

## Objective
`DB_DROP_TABLE`、`DB_DROP_COLUMN`、`DB_ADD_NOT_NULL_WITHOUT_DEFAULT`を実装する。

## Requirements
- findingはevidenceとreview-required表現を持つ。
- rollback/default/backfill signalを反証材料として扱う。

## TDD / Verification
- 各ruleのpositive/negative/refutation test

## Acceptance Criteria
- 3 ruleが既存`findings@v1`へ正規化される。
