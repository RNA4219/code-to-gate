# 補助文書とreadiness・diff修正の検収（2026-09-11）

状態: 作業中。対象は[Task Seed 20260911-02](../tasks/20260911-02-readiness-diff-followups.md)。

## 実施記録

ユーザー指定の順番で、補助文書から着手する。各修正の検証結果を以下へ追記する。

### 1. 補助文書（完了）

- troubleshootingの無効なthresholds例を、rule/path/reasonを含む現行severity_overridesの例へ置換した。
- YAML・bash・PowerShellのcode fenceを分離し、APIキー値を出力しない設定確認へ変更した。
- 公開readiness backlogをGitHub v1.6.0公開済み・npm未公開・人手精度未判定へ同期した。
- 既存parser/merge/validatorでpolicy例の2件のoverrideと理由・selectorの保持を確認し、文書参照検査が成功した。

## 統合検証

### 2. readiness入力検証（完了）

- 既存findings@v1 schemaを評価前に検証し、不正JSON・別artifact・必須項目欠落・未知enum・入れ子の不正値をexit 7で拒否する。
- readiness/severity調整の2テストファイル46件が成功した。既存fixtureはschemaの必須情報とfingerprint長へ同期した。
- 公開v1.6.0で生成した正常なデモartifactを修正版readinessで評価し、exit 0・passedを確認した。
- build/typecheck/対象ESLintが成功。ログは`C:/Users/ryo-n/Codex_dev/code-to-gate-fixes-20260911/readiness-tests.log`と`readiness-valid-release.log`。

未実施。公開schemaと既存の厳格policy、公開済みtag/assetを維持する。
