---
task_id: 20260611-01
intent_id: INT-SQL-DATABASE-ANALYSIS-001
owner: code-to-gate-team
status: done
last_reviewed_at: 2026-06-11
next_review_due: 2026-06-25
---
# Task Seed: SQL DB契約・計画基盤

## Objective
`SPEC-29`、実装計画、Task Seed台帳の境界と依存を一致させる。

## Scope
- In: 仕様、実装計画、10 Task Seed、stable schema境界
- Out: 実装コード

## Requirements
- `database-assets@v1alpha1`を実験的契約とする。
- ORM完全解析と実DB接続をOut of Scopeに固定する。

## TDD / Verification
- `git diff --check`
- 仕様・計画・台帳のschema名とCLI入口を検索照合する。

## Acceptance Criteria
- 実装者に未決判断が残らない。
- 後続Task Seedが依存順に追跡できる。
