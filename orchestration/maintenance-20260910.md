# 改修実行記録 2026-09-10

依頼: 既存の改修案を優先順に進める。実装は Luna、親エージェントは分割・レビュー・検証を担当する。

対象: `code-to-gate`。開始時 HEAD: `53897b912b390914dda145c98dd72d8147ab6b0e`。
開始時 branch: `agent/security-and-evidence-fixes`。開始時の作業ツリーは clean。

## 実施順と完了条件

| 段階 | 内容 | 完了条件 | 状態 |
|---|---|---|---|
| 1 | 台帳と文書の同期 | 実装・公開・人手検証の状態を区別し、完了チェックの誤検出を修正する | 完了: AC-20260910-01 |
| 2 | 実 repo 精度評価 | 判定を finding ID と入力 hash に結び付け、人間/AI/未判定を区別して保存・検証・集計できる | 完了。1449件で試行、人手精度は未主張 |
| 3 | 次版の準備 | 依存更新を取り込み、未リリース変更と検証結果を整理する | 完了。1.6.0候補、依存・配布検証成功 |
| 4 | Birdseye 修復 | 索引・capsule・実ファイル参照を再生成し、参照切れと鮮度を検証できる | 完了。実repo生成・check成功 |
| 5 | ルール別 severity | 任意設定、元の重要度と変更理由の記録、analyze/readiness/baseline の整合を検証する | 完了。型・schema・report・baseline・全体検証成功 |

既存の将来案（GitLab/Azure、通知、VS Code、Java/C++ AST の本格拡張）は、この5項目の外として残す。
公開・merge・tag 作成は実施していない。リリース準備の後に追加する変更は、最終検証へ含める。

## 開始時の検証

実行ログ: `C:/Users/ryo-n/Codex_dev/code-to-gate-work-20260910/`。

| 検証 | 結果 |
|---|---|
| `npm run build` | pass |
| `npm run lint` | pass |
| `npm test` | 通常182ファイル中178 pass / 4 fail。3604 pass / 5 fail / 4 skipped。277.52秒。時間制限による5失敗。tree-sitterは未到達 |
| 失敗した4ファイルを `vitest run --maxWorkers=2` で再実行 | 65 tests pass、78.51秒 |

全体テストの成功やリリース承認を、部分テストの成功で代替しない。

## 精度評価の境界

7月4日の実repo記録は4 repo / 1721 findingsで、すべて人手判定未実施。
対象commitのローカルcloneは存在するが、その実行のartifact本体は現在のworkspaceにない。
今回再生成したartifactは新しい実行として識別し、過去の1721件を判定済みと書き換えない。
AI補助判定はhuman判定として数えない。

## 監督レビュー

- 第1段階: 未リリース修正をv1.5.1公開済みと混同しないよう差し戻した。
- 第1段階: self-referenceのsuppressionとdetector改善を区別するよう差し戻した。
- 完了チェック: 表のstatus列とaction/task表を識別し、IDの完全一致を検証する。
- 精度評価: 配列順照合をfinding ID照合へ変更し、入力hashやrepoの不一致を拒否する。
- 精度評価: 保存済みreportableフラグを信用せず、入力条件から再計算するよう差し戻した。
- 精度評価: wrapperの回答stream混同を修正し、Git Bash/PowerShellで複数回答・日本語・空コメントの保存と既存出力の保護を実行テストした。
- 過去FP4件: 現行source/distで非再現を確認。過去原因の解明や人手精度合格とは扱わない。
- 依存: root fast-uri 3.1.7、fixture qs 6.16.0のinstall成功。npmが生じさせた無関係なpeer metadata差分は除き、指定更新に限定した。
- Birdseye: 生成物の自己入力、capsule内容の検証不足、import文字列誤認、capsule名衝突を修正対象とした。
- Severity: override削除時も元severityへ戻し、currentとbaselineを同じpolicyで比較するよう指示した。
- 最終レビュー: quoted/flow形式の壊れたYAMLが黙って無視される経路を修正した。
- 最終レビュー: Markdown/self-analysisのrawをsnapshotへ結び付け、suppressionをfinding IDで照合するよう修正した。
- 初回統合: 通常3646、tree-sitter63、maintenance12が成功。追加修正後coverage1777 testsとpackage smokeが成功した。
- 最終統合: 通常3647、tree-sitter63、maintenance12（計3722）が成功。既存4件skip。全coverage指標80%以上。
- 台帳の追加確認: 参照不足候補34件のうち32件を成果物へ対応づけた。NA-05/NA-09は決定・開催記録が未確認のため旧DoneをUnverifiedへ訂正し、完了チェックは候補0となった。

## 残件

実装・技術検証の結果は `docs/acceptance/AC-20260910-06-maintenance.md` を参照。
人手の精度判定は、実際の判定記録が得られるまで未完として管理する。
リリース公開と過去の意思決定・会議の確認は、今回の技術検収とは区別する。
