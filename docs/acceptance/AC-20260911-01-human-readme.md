# 人間向けREADMEの検収（2026-09-11）

状態: 文書と案内手順、および文書差分の誤ブロック修正のローカル検証を完了。最終CIとマージ結果はPR #22で追跡する。

[Task Seed](../tasks/20260911-01-human-readme.md)の範囲で、README日英3種へ用途・初回実行・結果の読み方・利用上の限界を追加し、Quickstartを同期する。

## 検証

- 公開済みv1.6.0パッケージで`fixtures/demo-ci-imports`を`analyze --emit all`した結果はexit 0。`repo-graph.json`、`analysis-report.md`、`findings.json`、`test-seeds.json`の生成と、`release-readiness.json`が未生成であることを確認した。
- README_JAのpolicy例で再解析し、続けて`readiness --from`を実行して両方exit 0。`status: passed`と`summary`・`recommendedActions`を確認した。これはデモfixtureのpolicy評価結果であり、製品全体の品質保証ではない。
- 実行証跡: `C:/Users/ryo-n/Codex_dev/code-to-gate-readme-20260911/`の`first-run.log`、`with-policy.log`、`readiness.log`と各出力ディレクトリ。
- 文書参照・配布状態・roadmap台帳・差分チェックは成功。Birdseyeを再生成し、鮮度チェックも成功した。
- README日英3種とQuickstartのYAML例は計4ブロックの構文を確認した。GitHub Actionsの例は今回クラウド上では実行していない。

ユーザビリティ調査や人手の精度測定は、この文書検収の範囲には含めない。

## PR CIで判明した問題

[PR #22](https://github.com/RNA4219/code-to-gate/pull/22)の初回CIでは、lint/typecheck、coverage、契約テスト、package smoke、3 OSの検証、Security Gateは成功した。
[analyze job](https://github.com/RNA4219/code-to-gate/actions/runs/34542528371/job/103088084098)では、文書8件とBirdseye生成物121件の差分がfinding 0件にもかかわらず`completeness: partial`となり、厳格policyが`Input evidence is partial`でブロックした。QEGの`no_go`と集約status-checkの失敗はこの判定を受けたものである。

公開v1.6.0 CLIによる同じdiff/readinessコマンドでもexit 1を再現した。再現証跡は`C:/Users/ryo-n/Codex_dev/code-to-gate-readme-20260911/ci-repro/`に保存した。
文書差分を正しく評価する修正と、実際に不完全な解析が引き続きブロックされる回帰テストを追加した。policyの閾値と`allow_partial: false`は維持している。

## 修正後の検証

- `npm run build`、`npm run typecheck`、`npm run lint`が成功した。
- diff本体・policy・completeness・DB差分統合の4テストファイル、計84テストが成功した。
- 文書のみ・正常なTypeScriptの指摘0件の差分が`complete`となること、走査の欠落・読み取り失敗・未処理Go/Rustが`partial`を維持することを確認した。
- SQL差分はDB解析無効なら`partial`、有効なら解析結果を反映する。走査が不完全な場合はDB指摘が追加されても`complete`へ昇格しない。既存policyの重大指摘ブロックも維持する。
- 修正版CLIで初回CIと同じ文書129ファイルの差分（head `d62338fb6f310d7ceba44bfe64c8175300ebb30d`）を再実行した。diff/readinessともexit 0、`completeness: complete`、`status: passed`、指摘0件、failedConditions 0件となった。
- 証跡: `C:/Users/ryo-n/Codex_dev/code-to-gate-readme-20260911/`の`fix-tests.log`、`fix-lint.log`、`ci-fixed-diff.log`、`ci-fixed-readiness.log`、`ci-fixed/`。
