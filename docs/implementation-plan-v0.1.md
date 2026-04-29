# code-to-gate v0.1 Implementation Plan

**作成日**: 2026-04-29  
**方式**: Shipyard-cp 型 `plan -> dev -> acceptance -> integrate`

---

## 1. Plan

v0.1 は Local Release Readiness MVP とする。

実装順:

1. schema validation foundation
2. synthetic fixtures
3. repo walker
4. TS/JS adapter
5. NormalizedRepoGraph writer
6. core rule evaluator
7. deterministic findings / risk seeds
8. LLM structured output
9. release readiness policy
10. downstream exporters

---

## 2. Dev Slices

| slice | scope | done |
|---|---|---|
| DEV-01 | `schemas/*.schema.json` と schema validate CLI | valid / invalid fixture を判定できる |
| DEV-02 | `fixtures/demo-shop-ts` / `demo-auth-js` / `demo-ci-imports` | acceptance の入力が揃う |
| DEV-03 | `scan` | `.qh/repo-graph.json` が生成される |
| DEV-04 | TS/JS AST adapter | imports / exports / symbols / tests / entrypoints が抽出される |
| DEV-05 | core rules | v0.1 rules の主要 finding が出る |
| DEV-06 | LLM trust layer | unsupported claims が隔離される |
| DEV-07 | readiness | status と exit code が契約通り |
| DEV-08 | integrations | 4 export が schema validation を通る |

---

## 3. Acceptance

正本は `docs/acceptance-v0.1.md`。

最初に通すコマンド:

```powershell
code-to-gate schema validate schemas/normalized-repo-graph.schema.json
code-to-gate scan fixtures/demo-shop-ts --out .qh
code-to-gate analyze fixtures/demo-shop-ts --emit all --out .qh --require-llm
code-to-gate export gatefield --from .qh --out .qh/gatefield-static-result.json
```

---

## 4. Integrate

統合時に確認するもの:

- README の短い製品説明と docs の中身が一致している。
- `requirements.md` の P0 と `acceptance-v0.1.md` の Done 判定が一致している。
- `artifact-contracts.md` と `schemas/*.schema.json` が乖離していない。
- `integrations.md` と `schemas/integrations/*.schema.json` が乖離していない。
- `manual-bb-test-harness` の検収レポートが最新の要件セットを参照している。
