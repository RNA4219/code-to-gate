---
task_id: 20260611-02
intent_id: INT-SQL-DATABASE-ANALYSIS-001
owner: code-to-gate-team
status: done
last_reviewed_at: 2026-06-11
next_review_due: 2026-06-25
---
# Task Seed: Database Asset契約

## Objective
`database-assets@v1alpha1`の型、schema、optional validationを実装する。

## Requirements
- 既存stable schemaを変更しない。
- operationとevidenceを決定的に追跡可能にする。

## TDD / Verification
- schema positive/negative test
- `code-to-gate schema validate database-assets.json`

## Acceptance Criteria
- 新artifactがschema-validで、既存schema stability testが回帰しない。
