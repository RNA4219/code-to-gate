# 5項目改修の統合検収（2026-09-10）

状態: ローカル改修の技術検収済み。公開承認の記録ではない。

基準HEAD: `53897b912b390914dda145c98dd72d8147ab6b0e`。
ローカル開発候補: `1.6.0`。公開版の記録は `docs/distribution-status.md` を参照する。
各段階をLunaが実装し、親エージェントが分割、差し戻し、実repo試行と統合検証を担当した。

## 検収対象

| 段階 | Task Seed | 証跡・完了条件 |
|---|---|---|
| 1 | `20260910-01-ledger-sync` | `AC-20260910-01.md`。表のstatus列とID完全一致で完了状況を判定 |
| 2 | `20260910-02-precision-review` | `AC-20260910-02-precision-review.md`、`AC-20260910-02-fp-reproduction.md`。入力との照合とAI/人手区別 |
| 3 | `20260910-03-release-prep` | `../releases/next-release-1.6.0.md`。候補版と依存の同期、公開状態の分離 |
| 4 | `20260910-04-birdseye` | `node scripts/birdseye.mjs check`。source/capsule/graphの一致 |
| 5 | `20260910-05-severity-tuning` | `../severity-tuning.md`。任意policyと元severity、baseline比較の一致 |

## 検証結果

最終sourceで通常・tree-sitter・maintenanceの全体検証とcoverage、配布検証を実施した。

| 検証 | 結果 |
|---|---|
| 依存同期 | root fast-uri 3.1.7、fixture qs 6.16.0をinstall済み。lock差分はこの2更新とroot versionのみ |
| build / typecheck / lint | 修正後すべて成功 |
| npm test（通常・tree-sitter・maintenance） | 通常186 files / 3647 pass / 4 skipped、tree-sitter 6 files / 63 pass、Node 12 pass。計3722 pass。通常436.94秒 |
| coverage（4指標80%以上） | 107 files / 1777 pass / 4 skipped。文88.14%、分岐80.27%、関数93.34%、行88.94%。閾値を維持して成功 |
| package smoke | 1.6.0をpack/installし、version/help、rule-sdk import、agent capabilities/idempotent run、analyze/viewer/diffが成功。作成物をcleanup済み |
| Birdseye実repo生成・check | 最終文書を含め、103 nodes / 122 edges / 103 capsで成功 |
| 台帳・文書整合 | 32件のIDに成果物の根拠を追加、過去記録2件をUnverifiedへ訂正。完了チェックの候補0 |

ログroot: `C:/Users/ryo-n/Codex_dev/code-to-gate-work-20260910/`。
`final-tests.log`、`final-coverage.log`、`final-package.log`、`final-lint.log`、
`final-typecheck.log`に結果を保存。package smokeは新規buildも実施した。
開始時の無制限並列テストでは時間制限による5失敗があり、同じ4ファイルを
maxWorkers=2で再実行すると65件成功した。通常・coverageの同時実行数を2へ
設定し、時間制限やcoverage閾値は緩めていない。

最終sourceの対象回帰検証では、引用キーやflow形式の壊れたseverity YAMLを拒否した。
suppression実ケースではraw 18 / effective 8 / suppressed 10となり、Markdownと
self-analysisのraw countsをJSONと突合した。suppression照合はオブジェクト参照ではなく
finding IDを使うため、severity調整によるコピー後も有効件数へ混入しない。

## 検収の境界

- 実repo1449件はAI案または未判定。人間による精度検証は未実施。
- 過去FP4件の非再現は当時の原因の特定や製品全体の精度合格を意味しない。
- 過去のApp/PAT採用決定（NA-05）とキックオフ開催（NA-09）は記録未確認。旧DoneをUnverifiedへ訂正し、他32件の成果物との対応確認とは区別した。
- GitLab/Azure、通知、VS Code、Java/C++ ASTの本格拡張は今回の対象外。
- commit、push、merge、tag、GitHub Release、npm publishは行っていない。
