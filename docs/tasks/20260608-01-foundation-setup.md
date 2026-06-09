---
task_id: 20260608-01
intent_id: INT-ASSURANCE-SMELL-DETECTOR-001
owner: code-to-gate-team
status: done
last_reviewed_at: 2026-06-08
next_review_due: 2026-06-22
---

# Task Seed: Wave 0 - Foundation Setup

## 背景

Assurance Smell Detector実装の基盤を整備する。仕様書の終了コードが実行計画と整合しておらず、Task Seed台帳と実装計画が必要。

## ゴール

- 仕様書の終了コード修正（8 → 11）
- `ASSURANCE_FAILED`終了コード追加
- 実装計画ドキュメント作成
- Task Seed台帳作成

## 修正対象

1. `docs/assurance-smell-detector-spec.md`
   - 5.1節の終了コード表修正
2. `src/cli/exit-codes.ts`
   - `ExitCodes` interface拡張
   - `EXIT` constant拡張
3. `docs/implementation-plan-assurance-smell-detector.md`（新規）
   - Wave別Task Seed台帳
   - Architecture概要
   - 受入条件

## TDD / 検証

1. typecheck実行
   - `npm run typecheck`
2. architecture test実行
   - `npm run test:architecture`

## 完了条件

- [x] 仕様書の終了コードが11に修正
- [x] exit-codes.tsにASSURANCE_FAILED: 11追加
- [x] implementation-planドキュメント作成
- [x] typecheck成功
- [x] architecture test成功

## 検収観点

- 終了コードが既存コード（0-10）と競合しない
- Task Seed台帳が16 Tasksを網羅
- 実装計画がworkflow-cookbook様式に準拠

## 参照

- `docs/assurance-smell-detector-spec.md`
- `docs/TASKS.md`
- `docs/tasks/TASK.template.md`
- `docs/acceptance/ACCEPTANCE_TEMPLATE.md`