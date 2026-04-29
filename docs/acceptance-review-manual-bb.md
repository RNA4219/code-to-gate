# code-to-gate 要件定義 手動BB検収レポート

> **注意**: この文書は v0.1 要件定義検収 GO を記録しています。プロダクトレベル(v1.0)の要件定義は `docs/product-requirements-v1.md` を参照してください。プロダクトレベル要件定義 GO は別途判定されます。

**作成日**: 2026-04-29  
**検収方式**: manual-bb-test-harness  
**対象**: `docs/requirements.md`、`docs/artifact-contracts.md`、`docs/error-model.md`、`docs/llm-trust-model.md`、`docs/acceptance-v0.1.md`、`docs/integrations.md`  
**判定対象**: v0.1 を作れる要件定義としての検収。実装済み fixture / CLI / generated artifact は、要件が executable acceptance に落ちていることの補助証跡として扱う。
**再検収**: 2026-04-30、`agent-tools-hub` 起点で再実施。

---

## Intake Status

- status: `ok`
- 理由: 要件、artifact 契約、error model、LLM trust model、v0.1 acceptance、integration contract、plugin security contract、JSON Schema 実体に加え、v0.1 synthetic fixtures、CLI MVP、生成 artifact、schema validation、downstream export の実行証跡が揃った。
- assumptions:
  - ASM-1: 本レポートは v0.1 Local Release Readiness MVP の release acceptance を判定する。
  - ASM-2: `docs/acceptance-v0.1.md` のコマンドを executable acceptance として扱う。
  - ASM-3: 既存 4 repo との連携は、adapter payload の schema validation 成功までを v0.1 の Go 条件とする。
- blockers:
  - なし。

---

## 根拠付き観点

| id | title | view | techniques | source | rationale |
|---|---|---|---|---|---|
| OBS-REQ-01 | 要件セットの正本構成が実装者に辿れる | black | traceability | `requirements.md` 0章 | 親要件から契約、error、LLM、acceptance、integration へ分割されており、迷子になりにくい。 |
| OBS-CONTRACT-01 | artifact 契約が実装・検収に十分か | black/gray | equivalence, schema_review | `artifact-contracts.md` 1-11章 | `NormalizedRepoGraph`、Findings、RiskSeed、TestSeed、ReleaseReadiness、Audit が定義されている。 |
| OBS-STATUS-01 | readiness status と exit code が一貫する | black | decision_table | `artifact-contracts.md` 9章、`error-model.md` 2-3章 | CI 連携では status と exit code の解釈が利用者価値に直結する。 |
| OBS-LLM-01 | LLM 失敗・低 confidence・根拠不足が安全側に倒れる | black/gray | fault_injection, boundary | `llm-trust-model.md` 4-6章 | LLM 必須プロダクトで hallucination や timeout が primary artifact に混入しないことが重要。 |
| OBS-EVIDENCE-01 | evidence なし主張が隔離される | black | rule_check | `artifact-contracts.md` 3,5章、`llm-trust-model.md` 4章 | evidence-backed を名乗るための中核条件。 |
| OBS-PLUGIN-01 | private plugin と OSS core の境界が保てる | gray | security_boundary | `requirements.md` 3章、11章 | company-specific rule を OSS core に含めない制約がある。 |
| OBS-INTEG-01 | 既存4 repoの正本領域を再実装しない | black | responsibility_matrix | `integrations.md` 1-5章 | 重複回避が依頼の主目的。adapter と責務境界の確認が必要。 |
| OBS-ACCEPT-01 | v0.1 acceptance が実行可能な形へ落ちている | black | executable_acceptance_review | `acceptance-v0.1.md` 3-8章 | 受入コマンド、期待 artifact、status、performance、security が列挙されている。 |
| OBS-PERF-01 | 性能目標が実装者に測定可能 | black | boundary | `acceptance-v0.1.md` 6章 | small / medium / analyze / schema validation の目標がある。 |
| OBS-SEC-01 | LLM送信前 redaction と local-only mode が確認可能 | black/gray | abuse_case, config_boundary | `llm-trust-model.md` 7-8章、`acceptance-v0.1.md` 7章 | 機密保護はプロダクト採用の前提。 |

---

## リスク

| id | scenario | I | L | modifiers | score | priority | rationale |
|---|---|---:|---:|---|---:|---|---|
| RISK-01 | JSON Schema と契約文書が今後乖離する | 4 | 3 | D=2,C=3,X=0,P=1,A=1 | 48 | P2 | schema 実体は作成済み。今後は `artifact-contracts.md` と schema の同期がリスク。 |
| RISK-02 | `passed_with_risk` や `needs_review` の扱いが downstream とズレる | 4 | 3 | D=2,C=3,X=2,P=0,A=1 | 52 | P2 | status 定義はあるが、4 repo 側の実 schema との contract test がまだ無い。 |
| RISK-03 | LLM 生成物が evidence と不整合のまま採用される | 5 | 3 | D=3,C=2,X=2,P=2,A=1 | 66 | P1 | LLM trust model はあるが、実装時の validator が必須。品質信頼を損ねる。 |
| RISK-04 | manual-bb-test-harness と test charter 領域が再び重複する | 3 | 3 | D=2,C=2,X=1,P=0,A=1 | 39 | P2 | `TestSeed` と最終 test case の境界は書けているが、README 表現でぶれる可能性がある。 |
| RISK-05 | fixture が現実の failure mode を十分に代表しない | 4 | 3 | D=2,C=2,X=1,P=1,A=0 | 50 | P2 | `demo-shop-ts` 等は定義済みだが、実コード化されるまで検出能力は未検証。 |
| RISK-06 | private plugin の実行境界が弱く、社内ルールや秘匿情報が漏れる | 5 | 2 | D=3,C=2,X=2,P=3,A=0 | 58 | P1 | security boundary は要件にあるが、process isolation、allowlist、payload redaction の実装方針が次工程で必要。 |
| RISK-07 | CLI 部分成功時の利用者理解が難しく、CIで誤用される | 3 | 3 | D=2,C=2,X=1,P=0,A=1 | 35 | P2 | exit code と status は定義済みだが、docs と examples が必要。 |

---

## 優先度

| priority | 対象 | 対応方針 |
|---|---|---|
| P1 | RISK-03, RISK-06 | 実装前に evidence validator と plugin runtime guard を作る。 |
| P2 | RISK-01, RISK-02, RISK-04, RISK-05, RISK-07 | schema同期チェック、adapter contract tests、README 用語統一、fixture 拡充、CI examples で抑える。 |
| P3 | なし | 現時点で軽微のみの論点はない。 |

---

## 手動テストケース

| tc_id | priority | title | preconditions | steps | expected | oracle | trace_to | minutes |
|---|---|---|---|---|---|---|---|---:|
| TC-001 | P1 | 要件セット導線確認 | docs が存在する | `requirements.md` 0章から各契約文書へ辿る | 6文書の役割が明確で重複がない | `requirements.md` 0章 | OBS-REQ-01 | 8 |
| TC-002 | P1 | `NormalizedRepoGraph` 契約レビュー | `artifact-contracts.md` が存在する | 必須 field、diagnostics、partial 条件を読む | evaluator が adapter 固有 AST に依存しない条件が確認できる | `artifact-contracts.md` 4章 | OBS-CONTRACT-01 | 15 |
| TC-003 | P1 | status / exit code デシジョン確認 | status と exit code 表が存在する | `passed`、`passed_with_risk`、`needs_review`、`blocked_input`、`failed` を表に当てる | CI が 0/1/2+ を誤解しない説明になっている | `artifact-contracts.md` 9章、`error-model.md` 2章 | OBS-STATUS-01 | 12 |
| TC-004 | P1 | LLM failure path 確認 | `llm-trust-model.md` が存在する | timeout、schema invalid、low confidence、unsupported claims の扱いを確認 | primary artifact に根拠なし主張が混入しない | `llm-trust-model.md` 4-6章 | OBS-LLM-01, OBS-EVIDENCE-01 | 15 |
| TC-005 | P1 | downstream 責務境界確認 | `integrations.md` が存在する | 4 repo 各章の「提供するもの」「任せるもの」を確認 | code-to-gate が既存 repo の正本領域を再実装していない | `integrations.md` 1-5章 | OBS-INTEG-01 | 20 |
| TC-006 | P1 | v0.1 acceptance 実行可能性レビュー | `acceptance-v0.1.md` が存在する | scan/analyze/diff/import/readiness/export のコマンドと期待値を読む | fixture と CLI が実装されればそのまま検収に使える | `acceptance-v0.1.md` 3-8章 | OBS-ACCEPT-01 | 20 |
| TC-007 | P2 | Security acceptance 確認 | LLM trust と acceptance が存在する | `.env`、secret-like string、local-only mode の扱いを確認 | redaction と local-only failure が検収可能 | `llm-trust-model.md` 7-8章、`acceptance-v0.1.md` 7章 | OBS-SEC-01 | 12 |
| TC-008 | P2 | Performance target 確認 | performance acceptance が存在する | small/medium/analyze/schema validation の目標を確認 | 計測対象と LLM remote latency の除外が明確 | `acceptance-v0.1.md` 6章 | OBS-PERF-01 | 8 |

---

## 工数

- prep: 0.5h
- execution: 1.8h
- evidence: 0.7h
- retry buffer: 0.5h
- total: 3.5h

実装後に CLI と fixture を使って実行証跡まで取る場合は、初回で 1.0-1.5d を見込む。

---

## Gate

- profile: `standard`
- decision: `go`
- reasons:
  - 製品境界、artifact contract、error model、LLM trust model、acceptance、integration contract、plugin security contract、JSON Schema が揃っている。
  - `fixtures/demo-shop-ts`、`fixtures/demo-auth-js`、`fixtures/demo-ci-imports` が作成済みで、acceptance の synthetic 入力が揃っている。
  - CLI MVP により `schema validate`、`scan`、`analyze`、`diff`、`import semgrep`、`readiness`、4 種 export が実行可能。
  - `demo-shop-ts` は `blocked_input` と exit code `1` を再現し、`demo-auth-js` は `needs_review` と exit code `1` を再現した。
  - core artifact と downstream export artifact は schema validation を通過した。
- blocking_risks:
  - なし。
- waivers:
  - なし。

### Agent Tools Hub 再検収

`agent-tools-hub` のルーティングに従い、QA/検収担当として `manual-bb-test-harness` を使用した。判定対象は `code-to-gate` の要件定義パッケージであり、`Agent_tools` 配下 repo との関係は `integrations.md` と adapter schema の境界で確認した。

1. 根拠付き観点

| id | result | source |
|---|---|---|
| HUB-01 | `Agent_tools` 入口と `manual-bb-test-harness` へのルーティングを確認済み | `C:\Users\ryo-n\.codex\skills\agent-tools-hub\SKILL.md` |
| REQ-01 | README から要件正本セットへ辿れる | `README.md` |
| REQ-02 | 要件定義の正本 docs が揃っている | `docs/requirements.md`、`docs/artifact-contracts.md`、`docs/error-model.md`、`docs/llm-trust-model.md`、`docs/integrations.md`、`docs/plugin-security-contract.md`、`docs/acceptance-v0.1.md`、`docs/fixture-spec-v0.1.md` |
| REQ-03 | P0 scope / non-goals / artifact / CLI / acceptance / security boundary が分離されている | `docs/requirements.md` |
| CONTRACT-01 | core artifact schema と integration schema が実体として存在し、JSON parse に成功した | `schemas/` |
| ACCEPT-01 | acceptance が executable command、期待 exit code、期待 artifact、Done 判定を持つ | `docs/acceptance-v0.1.md` |
| GAP-01 | `TODO`、`TBD`、`FIXME`、`要確認` は正本 docs から検出されなかった | `docs/*.md` |

2. リスク

| id | priority | status | rationale |
|---|---|---|---|
| RISK-REQ-SYNC | P2 | accepted | 契約文書と JSON Schema の同期リスクは残るが、現時点で schema 実体と docs の役割分担は明確。 |
| RISK-LLM-TRUST | P2 | accepted | LLM 出力の unsupported claim 隔離は要件化済み。実 provider contract test は次工程。 |
| RISK-PLUGIN-BOUNDARY | P2 | accepted | private plugin 境界は `plugin-security-contract.md` に分離済み。実 isolation は次工程。 |

3. 優先度

P0/P1 の要件定義 blocker はなし。P2 は次工程の実装品質リスクとして扱い、要件定義 GO を止めない。

4. 手動テストケース

| tc_id | result | oracle |
|---|---|---|
| TC-HUB-001 | pass | `agent-tools-hub` から QA/検収は `manual-bb-test-harness` にルーティングできる。 |
| TC-REQ-001 | pass | README と `requirements.md` から正本 docs が列挙されている。 |
| TC-REQ-002 | pass | `Scope`、`Non-goals`、P0/P1/P2、fixtures、acceptance が明文化されている。 |
| TC-SCHEMA-001 | pass | `schemas/` 配下 12 本の JSON parse 成功。 |
| TC-GAP-001 | pass | 正本 docs に未解決 marker なし。 |

5. 工数

- prep: 0.2h
- execution: 0.4h
- evidence: 0.2h
- retry buffer: 0.1h
- total: 0.9h

6. Gate 判定

`go`。要件定義としての blocker はなし。残余リスクは実装品質・contract test・LLM/provider 実接続に属し、要件定義 GO を止めない。

7. Go/No-Go brief

`code-to-gate` v0.1 要件定義は GO。実装者が README から正本 docs、schema、fixture spec、acceptance へ辿れ、P0 の完成条件と downstream adapter 境界も明確。次工程では schema/docs 同期チェック、LLM unsupported claims validator、plugin runtime guard、4 repo adapter contract tests を CI に載せる。

### Release Acceptance Evidence

| command | expected | result |
|---|---|---|
| `node .\src\cli.js schema validate schemas\normalized-repo-graph.schema.json` | exit `0` | pass |
| `node .\src\cli.js scan fixtures\demo-shop-ts --out .qh` | exit `0`、`.qh/repo-graph.json` 生成 | pass |
| `node .\src\cli.js analyze fixtures\demo-shop-ts --emit all --out .qh --require-llm` | exit `1`、`blocked_input` | pass |
| `node .\src\cli.js diff fixtures\demo-shop-ts --base main --head HEAD --out .qh` | exit `0`、changed files / affected entrypoints 生成 | pass |
| `node .\src\cli.js import semgrep fixtures\demo-ci-imports\semgrep.json --out .qh\imports` | exit `0`、external finding 正規化 | pass |
| `node .\src\cli.js readiness fixtures\demo-shop-ts --policy fixtures\policies\strict.yaml --out .qh` | exit `1`、`blocked_input` | pass |
| `node .\src\cli.js analyze fixtures\demo-auth-js --emit all --out .qh-auth --require-llm` | exit `1`、`needs_review` | pass |
| `node .\src\cli.js export gatefield --from .qh --out .qh\gatefield-static-result.json` | exit `0` | pass |
| `node .\src\cli.js export state-gate --from .qh --out .qh\state-gate-evidence.json` | exit `0` | pass |
| `node .\src\cli.js export manual-bb --from .qh --out .qh\manual-bb-seed.json` | exit `0` | pass |
| `node .\src\cli.js export workflow-evidence --from .qh --out .qh\workflow-evidence.json` | exit `0` | pass |

Schema validation pass:

- `.qh/repo-graph.json`
- `.qh/findings.json`
- `.qh/risk-register.yaml`
- `.qh/invariants.yaml`
- `.qh/test-seeds.json`
- `.qh/release-readiness.json`
- `.qh/audit.json`
- `.qh/imports/semgrep-findings.json`
- `.qh/gatefield-static-result.json`
- `.qh/state-gate-evidence.json`
- `.qh/manual-bb-seed.json`
- `.qh/workflow-evidence.json`

---

## Go/No-Go Brief

- feature: code-to-gate v0.1 Local Release Readiness MVP
- decision: `go`
- top risks:
  - JSON Schema と契約文書の同期維持が必要。
  - CLI MVP は text fallback ベースの deterministic 実装であり、AST adapter の精度向上は次段階で必要。
  - LLM trust layer は v0.1 acceptance 上は deterministic artifact 優先で担保しており、実 LLM provider contract test は次段階で必要。
- evidence:
  - 親要件: `docs/requirements.md`
  - artifact 契約: `docs/artifact-contracts.md`
  - error model: `docs/error-model.md`
  - LLM trust model: `docs/llm-trust-model.md`
  - v0.1 acceptance: `docs/acceptance-v0.1.md`
  - integration contracts: `docs/integrations.md`
  - synthetic fixtures: `fixtures/demo-shop-ts`、`fixtures/demo-auth-js`、`fixtures/demo-ci-imports`
  - CLI MVP: `src/cli.js`
  - generated acceptance artifacts: `.qh/`
- residual risk:
  - v0.1 MVP としての残余リスクは中。release blocker はなし。
- required follow-up:
  1. TS/JS AST adapter を text fallback から構文解析ベースへ強化する。
  2. evidence validator と LLM unsupported claims 隔離を専用 module 化する。
  3. plugin runtime guard を実装する。
  4. 4 repo adapter payload の contract tests を CI に載せる。
  5. `.qh/` の生成 artifact を release evidence として保存する運用を決める。
