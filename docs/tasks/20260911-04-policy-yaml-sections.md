---
task_id: 20260911-04
intent_id: POLICY-YAML-SECTIONS-20260911-04
owner: code-to-gate-team
status: done
last_reviewed_at: 2026-09-11
next_review_due: 2026-10-11
---

# policyのYAML書式・パス・同梱設定を順に修正

## 目的

main `2ae224a`の追加調査で確認した3件を順に直し、設定のコメントや書式、Windowsの絶対パス、同梱policyの項目名によって指定値が失われる問題を解消する。

## 作業段階と所有者

1. Luna: `src/config/policy-yaml-parser.ts`と単体テストの2ファイル。回帰を先に追加し、partial以外の既存設定も解析済みYAMLオブジェクトから読む。
2. Luna: パスの回帰・統合テスト。Windows絶対パス、引用符、空白、コロンを保持し、指定した抑制・baselineファイルを利用することを確認する。第1段階の共通修正を利用する。
3. Luna: `.ctg/policy.yaml`と同梱設定の回帰。既存の意図した設定値を正式なキーで指定し、IDと件数上限が読み込み結果へ反映されることを確認する。
4. 親: 各段階のレビュー、文書同期、統合検証、コミット、PR、CI成功確認、マージとmainの検証。

各実装段階は100行または2ファイル以内とする。公開schema、判定アルゴリズム、既定値、CI定義、公開済みバージョンは変更しない。未知キー全体の拒否や新規camelCase互換機能は追加しない。

## 受入条件

- 既知のpolicy設定は1行・複数行・末尾コメント・引用key・異なるインデントで同じ値となる。
- 既知項目の不正な型はpolicyエラーとなり、省略時の既定値と明示false/0を維持する。
- partial、DSL、severity override、rule optionsとdiff/readinessの既存契約を維持する。
- suppression/baselineのパスを切り詰めたり引用符付きのまま扱ったりせず、指定したファイルを利用する。
- 同梱policyのIDと0/10/50/100の件数上限が実loaderの結果へ反映され、件数キーがrulesへ混入しない。
- build/lint/typecheck、全体テスト、coverage全4項目80%、package smoke、文書参照・配布状態・roadmap・Birdseyeの確認を通過する。

## 読み込みと証跡

Birdseye世代`birdseye-29078f245fa179da`のparser・loader・readiness・同梱policyを確認し、1 hopを入口に変更契約を絞った。関係のないcore/rules実装は対象外。

[検収記録](../acceptance/AC-20260911-04-policy-yaml-sections.md)に修正前、各段階、最終検証を記録する。
