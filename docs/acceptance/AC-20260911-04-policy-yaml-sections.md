# policy YAML追加修正の検収（2026-09-11）

対象: [Task Seed 20260911-04](../tasks/20260911-04-policy-yaml-sections.md)。状態: 実装・ローカル検収完了。PRのCIとマージ結果は対応するPRで追跡する。

## 修正前の確認

main `2ae224a`で以下を確認した。外部調査記録は`C:/Users/ryo-n/Codex_dev/code-to-gate-followup-review-20260911/findings.md`。

1. 品質ルールDEBT_MARKERのtrue設定は、末尾コメントを追加するとfalseになった。confidenceの0.9設定は1行形式で既定値0.6となった。いずれもpolicy検証はエラーなし。
2. 引用符付きWindows絶対パスをsuppression.fileへ指定すると、値が先頭の引用符とCだけになった。
3. 同梱policyは指定IDがdefault-policyとなり、countThresholdが欠落し、件数上限のキーがrulesへfalseとして混入した。

## 段階別の結果

- 第1段階: 回帰を先行し、inlineのrulesが欠落する修正前の失敗を確認した。解析済みオブジェクトへの統一後、parser/loader/severity-resolver/diff-policyの133テスト、typecheck、対象lintが成功した。既存releaseRisk表記の互換も維持した（commit `3ad1397`）。
- 第2段階: readiness CLIの8テスト、typecheck、対象lintが成功した。3書式でのblocking判定、引用符・空白を含むnative/forward-slash絶対パスによる実suppression/baseline利用、抑制件数とbaseline未変化判定、schema適合、不正policyのexit 5・成果物未生成を確認した。
- 第3段階: 同梱policyのIDがdefault-policyになる修正前の失敗を確認し、正式キーへ整合した。実ファイルのYAML側キーとloader結果を確認する回帰1件、parser/loaderと合わせた97テスト、typecheck、対象lintが成功した。件数上限は0/10/50/100を維持し、readiness内の未実装項目を文書とともに整理した。

## 統合検証

全ての実装・テストを固定して検証する。PRとmainのCI結果は対応するPRで追跡する。外部証跡の保存先は`C:/Users/ryo-n/Codex_dev/code-to-gate-policy-yaml-20260911`。

- build / lint / typecheck: 成功。
- ビルド済みruntimeで、コメント付きboolean・1行形式のconfidence・引用符付きWindowsパス・同梱policyのIDと件数上限を確認し成功した（`compiled-acceptance.json`）。
- 全体テスト: 通常201ファイル・3,820件、Tree-sitter 63件、保守テスト15件が成功した。失敗0件、通常テストには既存skip 4件がある（`full-tests.log`）。
- coverage: 119ファイル・1,938件成功、既存skip 4件。Statements 88.90%、Branches 80.74%、Functions 94.82%、Lines 89.84%で全4項目の80%条件を満たした（`coverage.log`）。
- package smoke: 成功。fresh buildから作成したtgzを隔離先へインストールし、CLI・rule SDK・agent・analyze・viewer・precision-review・diffを確認した（`package-smoke.log`）。
- 文書参照・配布状態・roadmap drift・Birdseye再生成/checkが成功した。禁止・承認対象パスの変更はなく、`git diff --check`も成功した。
