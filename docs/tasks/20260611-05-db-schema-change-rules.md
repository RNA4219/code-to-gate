---
task_id: 20260611-05
intent_id: INT-SQL-DATABASE-ANALYSIS-001
owner: code-to-gate-team
status: done
last_reviewed_at: 2026-06-11
next_review_due: 2026-06-25
---
# Task Seed: DB Schema変更ルール

## Objective
`DB_RISKY_TYPE_CHANGE`と`DB_DROP_CONSTRAINT`を実装する。

## Requirements
- 明確な型拡張は除外し、narrowingまたは不明変更をreview-requiredにする。
- constraint削除は代替整合性保証を断定しない。

## TDD / Verification
- safe widening、narrowing、不明型、constraint種別のtest

## Acceptance Criteria
- 2 ruleにpositive/negative/refutation testがある。
