---
task_id: 20260911-01
intent_id: HUMAN-README-20260911-01
owner: code-to-gate-team
status: done
last_reviewed_at: 2026-09-11
next_review_due: 2026-10-11
---

# 人間向けREADMEの用途と初回導線

## 目的と範囲

初めて読む利用者が、使う場面、最小の実行手順、出力の読み方、次の行動を選べるようにする。
README日英3種とQuickstartの案内を同期する。CLI・schema・公開済みv1.6.0のtag/assetは変更しない。

## 完了条件

- PRレビュー、QA、リリース前、CI集約の用途をREADMEから選べる。
- `analyze`一回からMarkdownレポート、指摘の根拠、テスト候補を確認できる。
- `scan`の包含、`readiness`の別実行、初回LLM設定不要、誤検知・最終判断の境界を説明する。
- Quickstartの配布経路とCI例をREADMEの案内へ同期する。

## 検証方針

文書変更のため新規ユニットテストは作らない。公開パッケージを使い、既存デモfixtureで初回解析とREADMEのpolicyによる評価を確認する。
文書参照、配布状態、roadmap台帳、Birdseyeの整合を検査する。結果は[検収記録](../acceptance/AC-20260911-01-human-readme.md)へ記録する。

## 完了

README日英3種とQuickstartの更新、公開CLIでの案内手順確認、文書・YAML例・Birdseyeの検査を完了した。
