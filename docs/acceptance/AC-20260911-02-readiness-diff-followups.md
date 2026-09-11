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

未実施。公開schemaと既存の厳格policy、公開済みtag/assetを維持する。
