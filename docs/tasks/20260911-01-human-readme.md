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
README日英3種とQuickstartの案内を同期する。PR CIで判明した文書のみの差分の誤ブロックも修正する。公開schemaと公開済みv1.6.0のtag/assetは維持する。

## 完了条件

- PRレビュー、QA、リリース前、CI集約の用途をREADMEから選べる。
- `analyze`一回からMarkdownレポート、指摘の根拠、テスト候補を確認できる。
- `scan`の包含、`readiness`の別実行、初回LLM設定不要、誤検知・最終判断の境界を説明する。
- Quickstartの配布経路とCI例をREADMEの案内へ同期する。
- 文書のみ・正常なソースの差分は指摘0件でも完全と判定し、実際の走査・読み取りの欠落や未処理ソースは不完全としてブロックする。

## 検証方針

文書の案内は公開パッケージと既存デモfixtureで初回解析・READMEのpolicy評価を確認する。差分判定の修正には回帰テストを追加し、既存のpolicy・DB差分テストと、初回CIで失敗した文書差分の再実行で検証する。
文書参照、配布状態、roadmap台帳、Birdseyeの整合を検査する。結果は[検収記録](../acceptance/AC-20260911-01-human-readme.md)へ記録する。

## 完了

README日英3種とQuickstartの更新、公開CLIでの案内手順確認、文書・YAML例・Birdseyeの検査を完了した。
PR CIで判明した`Input evidence is partial`の誤ブロックを修正した。関連84テスト、build/typecheck/lint、失敗した文書差分の同一policyでの再検証が成功した。PRの最終CI結果とmainへの反映は[PR #22](https://github.com/RNA4219/code-to-gate/pull/22)で追跡する。
