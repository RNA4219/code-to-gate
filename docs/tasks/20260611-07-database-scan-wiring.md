---
task_id: 20260611-07
intent_id: INT-SQL-DATABASE-ANALYSIS-001
owner: code-to-gate-team
status: done
last_reviewed_at: 2026-06-11
next_review_due: 2026-06-25
---
# Task Seed: Database Scan配線

## Objective
`scan --database-analysis`でoptional database artifactを出力する。

## Requirements
- フラグなしのrepo graphを変更しない。
- stable graphへSQL固有enumを追加しない。

## TDD / Verification
- flag on/off CLI integration test
- repo graph schema validation

## Acceptance Criteria
- flag onでdatabase artifact、offで従来artifactのみ生成する。
