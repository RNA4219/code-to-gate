# 補助文書とreadiness・diff修正の検収（2026-09-11）

状態: 作業中。対象は[Task Seed 20260911-02](../tasks/20260911-02-readiness-diff-followups.md)。

## 実施記録

ユーザー指定の順番で、補助文書から着手する。各修正の検証結果を以下へ追記する。

### 1. 補助文書（完了）

- troubleshootingの無効なthresholds例を、rule/path/reasonを含む現行severity_overridesの例へ置換した。
- YAML・bash・PowerShellのcode fenceを分離し、APIキー値を出力しない設定確認へ変更した。
- 公開readiness backlogをGitHub v1.6.0公開済み・npm未公開・人手精度未判定へ同期した。
- 既存parser/merge/validatorでpolicy例の2件のoverrideと理由・selectorの保持を確認し、文書参照検査が成功した。

### 2. readiness入力検証（完了）

- 既存findings@v1 schemaを評価前に検証し、不正JSON・別artifact・必須項目欠落・未知enum・入れ子の不正値をexit 7で拒否する。
- readiness/severity調整の2テストファイル46件が成功した。既存fixtureはschemaの必須情報とfingerprint長へ同期した。
- 公開v1.6.0で生成した正常なデモartifactを修正版readinessで評価し、exit 0・passedを確認した。
- build/typecheck/対象ESLintが成功。ログは`C:/Users/ryo-n/Codex_dev/code-to-gate-fixes-20260911/readiness-tests.log`と`readiness-valid-release.log`。
- demo-shop/CI-imports/DB-migrationsのCLI統合29テストも成功した（`readiness-integration.log`）。

### 3. diffのGit snapshot（完了）

読み取り専用adapterの5テストが成功した。固定commit、空白・日本語path、未コミット/未追跡ファイルの非混入、既存の除外、各走査上限、期限、空commitと取得失敗の区別を確認した。Git呼び出しはblobのまとめ読みとし、作業ツリーを変更しない。

- diff/policy/completeness/snapshot/DB差分の6ファイル90テストが成功した。補強したsnapshot回帰も単独で成功した。
- 実CLIで固定base/headを指定し、head checkout・base checkout・未コミット編集の3状態ともDEBT_MARKER 1件・complete・exit 0となった。
- 既存のpartial回帰は実snapshotを制限する方式へ移し、走査上限・本文欠落・Go/Rust・DB分析の有無に応じた判定を維持した。
- 自repoの同一135ファイル差分はcompleteのまま。1回の観測値は変更前8.25秒、変更後11.89秒（後者はテスト同時実行中）であり、性能保証値とはしない。
- ログ: `C:/Users/ryo-n/Codex_dev/code-to-gate-fixes-20260911/diff-snapshot-tests.log`、`diff-snapshot-repro.json`、`diff-after-time.json`。

### 4. 削除差分（完了）

- 削除済みファイルをheadの未処理ファイル判定から除外し、未参照TSの削除は指摘0件・complete・exit 0となった。
- 削除＋Go変更はpartial・exit 1、削除ファイルを参照する残存TSはblast radiusに含まれる。
- diff/deletion/snapshot/policyの80テスト、typecheck、対象lintが成功した。
- 実CLIの削除差分もcomplete・exit 0へ改善し、固定headの3状態一致を維持した（`diff-deletion-repro.json`）。

### 5. 不完全入力の説明（完了）

- strict policyで指摘0件・partialの入力を評価し、INCOMPLETE_INPUT、`Blocked: input evidence is partial`、原因確認とanalyze/diff・readiness再実行の2操作を出力した。
- partial許可時はpassed_with_risk・exit 0を維持し、summaryにpolicyによるpartial許可を明示する。
- config evaluator 36テストとreadiness 36テスト、typecheck、全体lintが成功した。
- 実CLIのstrict partial出力は既存release-readiness schemaに適合した（`readiness-partial-strict/release-readiness.json`）。

## 統合検証

実施中。公開schemaと既存の厳格policy、公開済みtag/assetを維持する。
