---
task_id: 20260517-01
intent_id: INT-SELF-ANALYSIS-001
owner: code-to-gate
status: planned
priority: P0
dependencies:
  - docs/self-analysis-debt-inventory-2026-05-17.md
  - docs/self-analysis-remediation-requirements.md
  - docs/self-analysis-remediation-spec.md
---

# Task Seed: Self-Analysis Remediation

## Objective

self-analysis の raw findings と suppression 後の effective findings を分離し、readiness が負債を隠さないようにする。

## Scope

### In

- suppression class 追加
- self-analysis debt summary artifact
- readiness の raw/suppressed summary
- broad suppression review
- `.ctg/suppressions.yaml` migration plan

### Out

- すべての debt finding の即時修正
- tree-sitter compatibility 修正
- public fixture の意味変更

## Requirements

1. `docs/self-analysis-remediation-requirements.md` の `SAR-001` から `SAR-008` を満たす。
2. 既存 suppression file は migration 前でも読める。
3. `passed` readiness でも raw critical/high の存在は artifact 上で確認できる。
4. broad suppression は review-required として可視化される。

## Commands

```powershell
npm run build
npx vitest run src/config src/reporters src/cli --reporter=dot
node .\dist\cli.js analyze . --emit all --out .\.qh-self
node .\dist\cli.js readiness . --policy .\fixtures\policies\strict.yaml --from .\.qh-self --out .\.qh-self
```

## Deliverables

- suppression class 対応
- self-analysis debt artifact / report section
- readiness self-analysis summary
- migration 済み `.ctg/suppressions.yaml`
- 更新済み acceptance evidence

## Risks

- suppression class の migration を急ぐと、現状 gate を一時的に赤化させる可能性がある。
- debt fix と detector precision 改善を同時に扱うと、成果判定が曖昧になる。

## Acceptance Link

- `docs/self-analysis-remediation-acceptance.md`
