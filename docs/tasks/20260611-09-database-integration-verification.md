---
task_id: 20260611-09
intent_id: INT-SQL-DATABASE-ANALYSIS-001
owner: code-to-gate-team
status: done
last_reviewed_at: 2026-06-11
next_review_due: 2026-06-25
---
# Task Seed: Database統合・性能検証

## Objective
fixture、schema、回帰、性能、安全性を統合検証する。

## Requirements
- 8 rule fixtureとSQLなしfixtureを検証する。
- 実DB接続・network・秘密値出力がないことを確認する。

## TDD / Verification
- 対象unit/integration、smoke、architecture、package
- SQL合計10 MiB/1000 filesを30秒以内の目標で計測

## Acceptance Criteria
- 必須ゲートが成功し、既知gapを記録する。
