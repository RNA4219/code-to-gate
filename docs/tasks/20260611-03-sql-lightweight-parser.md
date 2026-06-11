---
task_id: 20260611-03
intent_id: INT-SQL-DATABASE-ANALYSIS-001
owner: code-to-gate-team
status: done
last_reviewed_at: 2026-06-11
next_review_due: 2026-06-25
---
# Task Seed: SQL Lightweight Parser

## Objective
外部依存なしで共通DDLとmigration signalを抽出する。

## Requirements
- comment、quote、複数statement、主要DDL、transaction/rollback signalを扱う。
- 未対応構文は断定せず部分解析として扱う。

## TDD / Verification
- PostgreSQL/MySQL/SQLite fixtureのunit test
- 同一入力でoperation IDと順序が安定すること

## Acceptance Criteria
- 主要DDLを根拠行付きで抽出できる。
