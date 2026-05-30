# Pull Request テンプレート

> **必須**: `Intent: INT-xxx` と `EVALUATION` のアンカーを本文に含めないと CI が失敗します。

## Intent Metadata

| 項目 | 記入例 |
| --- | --- |
| Intent ID | INT-___ |
| EVALUATION Anchor | [Acceptance Criteria](../docs/acceptance/ACCEPTANCE_TEMPLATE.md#acceptance-criteria) |
| Acceptance Record | [AC-YYYYMMDD-xx](docs/acceptance/AC-YYYYMMDD-xx.md) |
| Priority Score | `number` |

## 記入項目

### 概要

- 種別: feature / fix / chore / docs
- 主要変更点: <!-- 箇条書きで記載 -->

### リンク

- SKILL: [code-to-gate Skill](../skills/code-to-gate/SKILL.md)
- TASK: <!-- docs/tasks/YYYYMMDD-xx.md -->
- Acceptance Record: <!-- docs/acceptance/AC-YYYYMMDD-xx.md -->

## EVALUATION

- 受入条件リンク: [Acceptance Criteria](../docs/acceptance/ACCEPTANCE_TEMPLATE.md#acceptance-criteria)
- 補足: <!-- 必要に応じて記載 -->

### リスクとロールバック

- 主要リスク:
- Canary条件: （/governance/policy.yaml に準拠）
- Rollback手順: git revert <commit-hash>

### チェックリスト

- [ ] 受入基準（EVALUATION）緑
- [ ] CHECKLISTS 該当項目完了
- [ ] CHANGELOG 追記
- [ ] Test Coverage >= 80%
- 禁止パス遵守チェック（governance/policy.yaml）: <!-- 例: OK / 対象外 / 詳細 -->
- Priority Score: <!-- 例: 5 -->

## INT Logs

- YYYY-MM-DD: <!-- Intentの経緯や承認ログを箇条書きで記載 -->
- YYYY-MM-DD: <!-- 追加の更新履歴 -->

## Docs matrix (FYI)

- CLAUDE.md: updated? [ ] yes / [ ] no
- GUARDRAILS.md: updated? [ ] yes / [ ] no
- CHECKLISTS.md: checked? [ ] yes / [ ] no