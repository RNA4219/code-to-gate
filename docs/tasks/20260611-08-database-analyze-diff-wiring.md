---
task_id: 20260611-08
intent_id: INT-SQL-DATABASE-ANALYSIS-001
owner: code-to-gate-team
status: done
last_reviewed_at: 2026-06-11
next_review_due: 2026-06-25
---
# Task Seed: Database Analyze/Diff配線

## Objective
明示フラグ時だけDB ruleをanalyze/diffへ統合する。

## Requirements
- 通常評価は`CORE_RULES`のみとする。
- DB findingsを既存policy、risk、test seed、SARIFへ流す。
- diffは変更対象のDB findingだけを出力する。

## TDD / Verification
- flag on/off analyze/diff integration test

## Acceptance Criteria
- フラグなしでDB findingが生成されず、フラグありで生成される。
