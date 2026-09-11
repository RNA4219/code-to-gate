---
task_id: 20260911-03
intent_id: PARTIAL-YAML-20260911-03
owner: code-to-gate-team
status: done
last_reviewed_at: 2026-09-11
next_review_due: 2026-10-11
---

# partial設定のYAML書式による判定不一致を修正

## 背景とゴール

PR #23の追加調査で、readiness用policyの`partial: { allow_partial: true }`が反映されず、複数行形式と終了判定が異なることを確認した。ユーザーの修正依頼に従い、同じpartial設定は書式によらず同じ判定とし、不正値をpolicyエラーで拒否する。

## 修正対象と分担

- Luna: YAML parserと単体回帰の2ファイル。読み込み済みYAMLオブジェクトからpartialを解釈する。
- Luna: readiness CLIの新規回帰1ファイル。実loaderとschema準拠findingsによる終了判定を確認する。
- 親: レビュー、文書同期、統合検証、コミット、PR、CI、マージ。

対象は既存の`allow_partial`と`partial_warning_threshold`。他のpolicyセクションの再実装、公開schema、判定閾値、CI定義、公開済みtag/assetは変更しない。

## 受入条件

- 1行・複数行・コメント付きのpartialが同じ設定値になる。
- trueはpartial入力をpassed_with_risk・exit 0、falseと省略はblocked_input・exit 1とする。
- map以外のpartial、boolean以外のallow_partial、数値以外または0..1範囲外のthresholdはexit 5で拒否し、readiness成果物を新規生成しない。
- `{}`と省略時の既定値、および既存policyの挙動を維持する。
- 全体テスト、coverage 80%、build/lint/typecheck、package smoke、文書とBirdseye検査を通過する。

## 証跡

[検収記録](../acceptance/AC-20260911-03-partial-yaml.md)に再現・回帰・統合検証を記録する。
