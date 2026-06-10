---
task_id: 20260608-08
intent_id: INT-ASSURANCE-SMELL-DETECTOR-001
owner: code-to-gate-team
status: done
last_reviewed_at: 2026-06-09
next_review_due: 2026-06-23
---

# Task Seed: Wave 2 Task 08 - Release Decision Unsupported

## ゴール

passed系readinessを覆さず、判断根拠の不足をreview-required candidateとして表現する。

## 実装境界

- readiness未入力時はunsupported claimとする
- `needs_review`、`blocked_input`、`failed`は評価対象外とする
- partial readiness、参照artifact欠落、dangling condition ref、high/critical evidence gapを根拠化する
- decision fieldやreadiness statusを生成・変更しない

## 完了条件

- [x] readiness単位で根拠を集約したcandidateを生成する
- [x] 十分なpassed readinessではcandidateを生成しない
- [x] application層でI/Oを行わない
