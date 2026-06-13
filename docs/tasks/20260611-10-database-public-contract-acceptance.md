---
task_id: 20260611-10
intent_id: INT-SQL-DATABASE-ANALYSIS-001
owner: code-to-gate-team
status: done
last_reviewed_at: 2026-06-11
next_review_due: 2026-06-25
---
# Task Seed: Database公開契約・Acceptance

## Objective
CLI、artifact、rule、制約、検証結果を公開文書とAcceptance Recordへ反映する。

## Requirements
- README、CLI reference、schema versioning、CHANGELOGを整合させる。
- Task Seed、仕様、Acceptanceを相互リンクする。

## TDD / Verification
- `git diff --check`
- docs記載のCLIとschema名を検索照合する。

## Acceptance Criteria
- `docs/acceptance/AC-20260611-01.md`から全証跡へ遷移できる。
