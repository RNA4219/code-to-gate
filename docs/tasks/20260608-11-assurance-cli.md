---
task_id: 20260608-11
intent_id: INT-ASSURANCE-SMELL-DETECTOR-001
owner: code-to-gate-team
status: done
last_reviewed_at: 2026-06-09
next_review_due: 2026-06-23
---

# Task Seed: Wave 2 Task 11 - Assurance Inspect CLI

## ゴール

artifact-only detectorを明示実行する`code-to-gate assurance inspect`をcomposition rootへ追加する。

## 実装境界

- candidate有無に関係なく成功はexit 0
- usage errorは2、artifact/schema errorは7、detector errorは11
- 通常analyzeとrelease gateへ自動追加しない

## 完了条件

- [x] repo、from、out、confidence optionを処理する
- [x] 既定pathへassurance-findings.jsonを出力する
- [x] 入力artifactを変更しない
