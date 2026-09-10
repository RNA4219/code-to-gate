---
intent_id: DOC-LEGACY
owner: code-to-gate-team
status: active
last_reviewed_at: 2026-09-10
next_review_due: 2026-10-10
---

# Task Seeds 運用ガイド

## 1. 目的

- `CLAUDE.md` で抽出された課題を、着手可能な Task Seed として整理する。
- インシデント記録や品質基準（`CHECKLISTS.md`）と突合し、再発防止と受け入れ条件を明文化する。
- `CHECKLISTS.md` の出荷基準を満たすための実施ログを残し、後続レビューで追跡できるようにする。

## 2. 記入テンプレート

Task Seed は `docs/tasks/TASK.template.md` に定義されたテンプレートに準拠し、以下の要点を押さえる。

```markdown
---
task_id: YYYYMMDD-xx
intent_id: INT-xxx
owner: contributor-handle
status: draft|in_progress|done|blocked
last_reviewed_at: YYYY-MM-DD
next_review_due: YYYY-MM-DD
---

# Task Seed Title

## 背景
- 背景と課題を記述

## ゴール
- 達成したい状態を記述

## 修正対象
- 影響範囲（ディレクトリや機能名）

## TDD / 検証
- テスト設計と検証コマンド

## 完了条件
- Lint/Type/Test のゼロエラーを必須条件

## 検収観点
- 受け入れ基準
```

## 3. 検証ログ（TDD 前提）

1. **テスト設計を先行**: 着手前に必要なユニット/統合テストを列挙し、期待する失敗/成功条件を記す。
2. **実行コマンドの記録**: 実際に走らせたコマンドと結果（例: `npm test` → fail/pass）を時系列で追記する。
3. **チェックリスト照合**: ゲート通過後は `CHECKLISTS.md` の該当項目を確認し、未完了項目があれば Follow-up へ移す。

## 4. フォローアップ手順

- **未解決事項**: 実装後も残るリスクや TODO は `Follow-ups` セクションに列挙し、必要なら新規 Task Seed を起票する。
- **レビュー結果の反映**: レビュアーからの追加要求は `Notes` に記録し、着手が別タスクになる場合は Task Seed ID を採番して紐付ける。
- **完了判定**: `CHECKLISTS.md` の条件を満たし、検証ログがすべてグリーンであることを確認して `status: done` へ更新する。
- **検収記録**: 完了時は `docs/acceptance/AC-YYYYMMDD-xx.md` を作成し、Task Seed からリンクする。
- **成果の転記**: 完了した Task Seed の成果差分は `[Unreleased](../CHANGELOG.md#unreleased)` に記録する。

## 5. 登録済み Task Seeds

- [20260910-01-ledger-sync](tasks/20260910-01-ledger-sync.md) — 改修台帳・文書同期（技術検収済み）
- [20260910-02-precision-review](tasks/20260910-02-precision-review.md) — 実 repo 精度レビューの機能（技術検収済み、人手判定は別途）
- [20260910-03-release-prep](tasks/20260910-03-release-prep.md) — 1.6.0 次版準備（ローカル検証済み、公開は別途）
- [20260910-04-birdseye](tasks/20260910-04-birdseye.md) — Birdseye generator/check（技術検収済み）
- [20260910-05-severity-tuning](tasks/20260910-05-severity-tuning.md) — SPEC-26 severity tuning（技術検収済み）
- [20260910-07-ci-maintenance](tasks/20260910-07-ci-maintenance.md) — maintenance検証のCI接続
- [20260910-08-run-identity](tasks/20260910-08-run-identity.md) — 実行IDの衝突防止
- [20260910-09-diff-severity](tasks/20260910-09-diff-severity.md) — diffへのseverity policy適用
- [20260910-10-precision-workbench](tasks/20260910-10-precision-workbench.md) — 精度レビュー操作画面
- [20260910-11-severity-report](tasks/20260910-11-severity-report.md) — severity調整理由の表示

---

更新日: 2026-09-10
