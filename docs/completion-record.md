# Completion Record

この文書は、RUNBOOK から切り出した完了事項の記録である。
RUNBOOK は運用入口と現在の判断に集中させ、完了済みの作業証跡は本書に集約する。

## 2026-05-01 P0/P1 完了

### P0 完了事項

| id | 完了内容 | 証跡 |
|---|---|---|
| P0-01 | CI/release procedure connected | RUNBOOK product gate checklist |
| P0-02 | Policy evaluator unified | `src/config/policy-evaluator.ts` |
| P0-03 | 3 real repos verified | `.qh/acceptance/real-repo/summary.yaml` |
| P0-04 | FP rate <= 15% | express 0% FP |

### P1 完了事項

| id | 完了内容 | 証跡 |
|---|---|---|
| P1-01 | GitHub PR comment/Checks/SARIF upload verified | PR #1 |
| P1-02 | LLM trust/redaction tests added | `src/cli/__tests__/llm-trust.test.ts` 18 tests |
| P1-03 | Docs package prepared | `docs/quickstart.md`, `docs/cli-reference.md` |
| P1-06 | macOS CI analyze/readiness/schema validate | `.github/workflows/code-to-gate-pr.yml` |
| P1-07 | Bash 3.2 syntax check | `scripts/fp-review.sh` compatibility fix |

Gate status: go, pending P2 tasks at the time.

## 2026-05-02 Phase 2 完了

Phase 2 OSS beta の主要項目は完了済み。

| 項目 | 状態 | 証跡 |
|---|---|---|
| Plugin SDK | 完了 | sample plugin execution tests, plugin docs |
| Contract tests CI | 完了 | `code-to-gate-pr.yml` contract-tests job |
| Performance optimization | 完了 | parallel tests, cache tests, `--parallel` / `--cache` options |
| Web viewer MVP | 完了 | viewer tests, static HTML generation |
| Suppression expiry | 完了 | suppression expiry field, suppression loader |
| Historical comparison | 完了 | `src/historical/*`, comparison tests |

Gate status: go, Phase 3 残項目あり。

## 2026-05-02 Phase 3 完了

Phase 3 v1.0 Product の主要項目は完了済み。

| 項目 | 状態 | 証跡 |
|---|---|---|
| Stable schema v1 | 完了 | `CTG_VERSION` migration to v1, artifacts use `ctg/v1` |
| Large repo optimization | 完了 | `file-processor.ts` streaming/batch/chunk/lazy symbols |
| Private plugin sandbox | 完了 | `docker-sandbox.ts`, sandbox tests |
| Web viewer full | 完了 | `graph-viewer.ts`, `finding-viewer.ts` |
| Release evidence bundle | 完了 | `bundle-builder.ts` |
| Python adapter split | 完了 | `py-adapter.ts` split into parser modules |

Gate status: go, v1.0 release ready at the time.

## Python Adapter 分割完了

自己解析負債で P1 として扱っていた `py-adapter.ts` の大型化は分割済み。

| 項目 | 分割前 | 分割後 |
|---|---:|---|
| `src/adapters/py-adapter.ts` | 1295 lines | 約300 lines |
| parser modules | なし | `py-parser-*.ts` に分割 |
| 各ファイル上限 | 500 lines 超過 | 各ファイル 500 lines 以下 |

RUNBOOK の自己解析負債では、この項目を未完了負債ではなく完了済み分割事項として扱う。

## 運用ルール

- 完了済みの大きな作業表は RUNBOOK に増やさず、本書に追記する。
- RUNBOOK には現在の判断、未解決の負債、運用手順、参照リンクだけを残す。
- 新しい完了記録を追加するときは、日付、項目、状態、証跡を必ず書く。
