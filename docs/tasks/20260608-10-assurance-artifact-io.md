---
task_id: 20260608-10
intent_id: INT-ASSURANCE-SMELL-DETECTOR-001
owner: code-to-gate-team
status: done
last_reviewed_at: 2026-06-09
next_review_due: 2026-06-23
---

# Task Seed: Wave 2 Task 10 - Assurance Artifact I/O

## ゴール

artifact directoryをschema検証して内部bundleへ変換し、既存`findings@v1`互換の`assurance-findings.json`を出力する。

## 実装境界

- `findings.json`と`repo-graph.json`を必須とする
- 任意artifact欠落はcoverageへ残す
- 入力artifactを変更しない
- 新規artifact schemaを追加しない

## 完了条件

- [x] JSON/YAML artifactをschema検証してloadする
- [x] wrapperを内部配列へ変換する
- [x] findings@v1互換artifactをwriteする
