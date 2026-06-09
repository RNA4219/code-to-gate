---
task_id: 20260608-09
intent_id: INT-ASSURANCE-SMELL-DETECTOR-001
owner: code-to-gate-team
status: done
last_reviewed_at: 2026-06-09
next_review_due: 2026-06-23
---

# Task Seed: Wave 2 Task 09 - Assurance Orchestrator

## ゴール

artifact-only ruleを固定順で実行し、決定的なAssurance Finding集合を返す純粋APIを提供する。

## 実装境界

- 既定confidence下限は0.60、candidate上限は500件
- stable IDで重複除去し、severity/rule/id順にsortする
- rule例外は握り潰さない
- application層でI/Oを行わない

## 完了条件

- [x] `inspectAssurance`が固定rule setを実行する
- [x] filter、deduplicate、sort、truncateが決定的である
- [x] coverageと実行rule IDを返す
