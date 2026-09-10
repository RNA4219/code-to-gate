---
task_id: 20260910-03
intent_id: RELEASE-PREP-20260910-03
owner: code-to-gate-team
status: done
last_reviewed_at: 2026-09-10
next_review_due: 2026-10-10
---

# 1.6.0 次版準備

## 背景

第1段の台帳同期と第2段の精度レビューを、公開済み `v1.5.1` と混同せず
ローカルの次版候補として整理する。optional severity と Birdseye 修復は
実装・対象検証・最終full test済みだが、公開版の機能としてはまだ扱わない。

## ゴール

- package と lock の root version を `1.6.0` に揃える。
- 指定された2つの依存更新だけを lockfile に反映する。
- maintenance Node tests を npm の full test 導線へ追加する。
- worker 上限と配布状態、候補版、残る final gates を文書化する。

## 修正対象

`package.json`、root/fixture lockfile、Vitest設定、README各言語版、
`docs/distribution-status.md`、`CHANGELOG.md`、`.gitattributes`、
`docs/releases/next-release-1.6.0.md`。

## TDD / 検証

この段階では依存 install、build、Vitest、coverage、package smoke は親が統合後に実行する。
本段階では JSON parse、npm scripts と version の照合、指定 lock entry の一意性、
配布文書の状態、`git diff --check` を read-only で確認する。

開始時の全体 baseline は 3,604 passed / 5 timeout系失敗 / 4 skipped。
4対象ファイルの `--maxWorkers=2` 再実行は 65 passed だが、全体合格とは扱わない。

## 完了条件

- `1.6.0` は候補版としてのみ記録され、GitHub/npm 公開済みと記載しない。
- GitHub の公開最新版は `v1.5.1`、npm は未公開のまま整合する。
- `fast-uri 3.1.7` と fixture `qs 6.16.0` 以外の依存差分を作らない。
- optional severity と Birdseye は対象検証済み。候補版レビューと公開判断は別ゲートとして残す。
- 最終full test、build、lint、coverage、package smokeは検証済み。統合結果は `docs/acceptance/AC-20260910-06-maintenance.md`へ導く。

## 残る final gates

候補版レビュー、公開根拠の最終確認、及び `docs/acceptance/AC-20260910-06-maintenance.md`
への統合結果追記。最終full test、coverage 80%、package smoke、optional severity の
analyze/readiness/baseline 整合、Birdseye index/capsule の再生成・参照検証は完了済み。
