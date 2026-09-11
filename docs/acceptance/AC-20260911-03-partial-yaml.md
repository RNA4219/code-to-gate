# partial YAML修正の検収（2026-09-11）

対象: [Task Seed 20260911-03](../tasks/20260911-03-partial-yaml.md)。状態: 実装・ローカル検収完了。PRのCIとマージ結果は対応するPRで追跡する。

## 修正前の再現

main `5bea483`で、schemaに適合する指摘0件・partialのfindingsと1行形式のallow_partial=trueをreadinessへ渡した結果、blocked_input・exit 1となった。複数行形式ではpassed_with_risk・exit 0となる既存挙動と一致しない。

外部証跡: `C:/Users/ryo-n/Codex_dev/code-to-gate-partial-yaml-20260911/before-inline.log`。

## 回帰と統合検証

- parserと既存loader: 73テスト成功。1行・複数行・引用key・コメント・indent、map/boolean/numberの型、不正値、空mapと省略時の既定値を確認した。
- readiness CLI: 13テスト成功。実loaderでtrue/falseと省略時の判定、不正な型と範囲のexit 5・成果物未生成を確認した。
- 共通loaderのparseエラー接頭辞を`Invalid policy YAML`へ補正し、partial型エラーをseverity overrideの問題と誤表示しないようにした。補正後のparser/loader 74テストが成功した。
- 旧エラー文を固定していたseverity resolverの既存テストを新しい共通エラー契約へ同期し、元の具体的parseエラーと拒否動作を維持した。parser/loader/severity/readinessの関連5ファイル104テストが成功した。
- 修正版の実CLIは1行・複数行の双方でpassed_with_risk・exit 0となり、同じsummaryを出力した。両方のreadiness artifactが既存schemaに適合した（`after-inline.log`、`after-block.log`）。
- 全体テスト: 通常199ファイル・3,789件、Tree-sitter 63件、保守テスト15件が成功した。失敗0件、通常テストには既存のskip 4件がある（`full-tests-verified.log`）。
- build / lint / typecheck: 成功。
- coverage: 117ファイル・1,907件成功、既存skip 4件。Statements 88.86%、Branches 80.69%、Functions 94.80%、Lines 89.84%で、全4項目の80%条件を満たした（`coverage.log`）。
- package smoke: 成功。fresh buildから作成したtgzを隔離先へインストールし、CLI・rule SDK・agent・analyze・viewer・precision-review・diffを確認した（`package-smoke.log`）。
- 不正な文字列booleanを実CLIへ渡すと`Invalid policy YAML: partial.allow_partial must be a boolean`でexit 5となり、readiness成果物を生成しない（`invalid-string-final.log`）。
- 文書参照・配布状態・roadmap drift検査とBirdseye再生成/checkが成功した。禁止・承認対象パスの変更はなく、`git diff --check`も成功した。

検証過程では、全体実行中のエラー文補正が旧moduleと混在した1件と、既存の旧文言assert 1件が失敗した。ソースとテストを固定して全体実行をやり直し、最終判定には`full-tests-verified.log`を用いる。
