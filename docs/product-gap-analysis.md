# code-to-gate プロダクトギャップ分析

**バージョン**: v1.0  
**作成日**: 2026-04-30  
**対象**: v0.1 MVP からプロダクトレベルへの移行  
**位置づけ**: 本書は v0.1 MVP とプロダクトレベル要件の差分分析。

---

## 1. Scope

本書は v0.1 Local Release Readiness MVP とプロダクトレベル要件（OSS alpha / beta / v1.0）のギャップを分析する。

前提:
- **v0.1 MVP は GO**: 要件定義・仕様書・CLI MVP・synthetic fixtures・schema validation・downstream export が検収済み（`docs/acceptance-review-manual-bb.md`）
- **プロダクトレベル要件**: `docs/product-requirements-v1.md` で定義
- **プロダクトレベル仕様**: `docs/product-spec-v1.md` で定義

本書は v0.1 MVP の完成を前提とし、次段階以降で必要な機能・仕様・テスト・運用・文書の不足を明確化する。

---

## 2. Non-goals

- **v0.1 MVP 再評価**: v0.1 は GO。本書では v0.1 の品質を再審査しない。
- **実装計画詳細**: 実装ロードマップは `docs/product-roadmap.md` で別途定義。
- **company-specific rule**: OSS core に混入禁止。本書では private plugin としての扱いのみ記述。
- **AI agent gate engine**: `agent-gatefield` の責務。本書では対象外。
- **agent approval/freshness**: `agent-state-gate` の責務。本書では対象外。
- **manual BB test design**: `manual-bb-test-harness` の責務。本書では対象外。
- **workflow governance**: `workflow-cookbook` の責務。本書では対象外。

---

## 3. 現状サマリー

### 3.1 v0.1 MVP 成果

v0.1 MVP は以下を実装・検収済み。

| 成果 | 状態 | 証跡 |
|---|:---:|---|
| TS/JS text fallback scan | Done | CLI MVP 実行証跡 |
| NormalizedRepoGraph 生成 | Done | `.qh/repo-graph.json` schema validation pass |
| Core rules deterministic findings | Done | 12 rules 実装、finding 生成確認 |
| Synthetic fixtures (demo-shop-ts, demo-auth-js, demo-ci-imports) | Done | `fixtures/` 配下実体存在 |
| CLI MVP (scan, analyze, diff, import, readiness, export) | Done | 全コマンド実行可能 |
| Schema validation | Done | 12 schema files + validation pass |
| Downstream export 4 types | Done | gatefield / state-gate / manual-bb / workflow-evidence |
| LLM trust model spec | Spec Done | `docs/llm-trust-model.md` 完備 |
| Plugin security contract spec | Spec Done | `docs/plugin-security-contract.md` 完備 |
| v0.1 要件定義パッケージ | Done | docs + schemas + fixtures + acceptance |
| v0.1 収レポート | Done | `docs/acceptance-review-manual-bb.md` GO 判定 |

### 3.2 v0.1 MVP 限界

v0.1 MVP は以下の限界を持つ。これらはプロダクトレベルで解消が必要。

| 限界 | 内容 | 影響 |
|---|---|---|
| Text fallback only | AST parser 未実装。import/export/route 検出は regex ベース。 | 精度低下、誤検知率高 |
| Synthetic fixtures only | 実 repo での動作未検証。`demo-shop-ts` 等は人工作成。 | 実運用適用不能 |
| No GitHub Actions integration | CI workflow template 未提供。 | PR 自動解析不能 |
| No PR comment / Checks | GitHub PR への結果投稿未実装。 | レビュアー体験未整備 |
| No SARIF upload | GitHub code scanning 連携不能。 | Security dashboard 未統合 |
| No suppression mechanism | FP 管理・有効期限・audit 未実装。 | 実運用で誤検知対応不能 |
| No plugin runtime | Plugin SDK 未提供。private plugin 実行環境なし。 | 拡張性限定 |
| No contract tests | Downstream 4 adapter の schema validation test は manual 実施のみ。CI 未整備。 | 破壊的変更検出不能 |
| No FP/FN evaluation | 誤検知率・見逃し率測定なし。 | 品質指標未整備 |
| Limited performance optimization | 並列解析・incremental cache 未実装。 | 大規模 repo 対応不能 |
| Limited documentation | README + 正本 docs は存在。quickstart / CLI reference / examples 未整備。 | OSS 利用者体験不足 |
| LLM trust layer limited | LLM trust model spec は完備。実 provider contract test 未実装。unsupported claims 隔離実装限定的。 | LLM 品質担保限定的 |
| Plugin execution guard limited | Plugin security contract spec は完備。実 runtime guard 未実装。process isolation 未整備。 | private plugin 安全性限定的 |

---

## 4. カテゴリ別ギャップ分析

### 4.1 Missing Features

プロダクトレベルで必要な機能。v0.1 MVP 未実装。

| feature | Phase | Priority | 内容 | v0.1 状態 |
|---|:---:|:---:|---|---|
| TS/JS AST parser | Phase 1 | P1 | TypeScript compiler API / Babel / tree-sitter ベース AST 解析 | text fallback only |
| GitHub Actions workflow template | Phase 1 | P1 | Reusable workflow YAML 提供 | 未実装 |
| PR comment | Phase 1 | P1 | GitHub PR summary comment 投稿 | 未実装 |
| GitHub Checks | Phase 1 | P1 | Check run + annotations 作成 | 未実装 |
| SARIF export + upload | Phase 1 | P1 | SARIF v2.1.0 生成 + code scanning upload | export spec only |
| Basic suppression | Phase 1 | P1 | Suppression file + ruleId + path + expiry | 未実装 |
| Suppression expiry warning | Phase 2 | P2 | 期限切れ suppression warning + audit | 未実装 |
| Plugin SDK | Phase 2 | P1 | Plugin manifest + runtime + schema contract | spec only |
| Python adapter | Phase 3 | P1 | Python import/function/class/test 抽出 | 未実装 |
| Web viewer MVP | Phase 2 | P2 | Artifact viewer / graph explorer / finding explorer | 未実装 |
| Historical comparison | Phase 2 | P2 | 前回 run との new/resolved/unchanged 比較 | 未実装 |
| Baseline mode | Phase 2 | P2 | Baseline artifact との比較 + regression 検出 | 未実装 |
| Local LLM (ollama/llama.cpp) | Phase 2 | P2 | localhost LLM provider 対応 | 未実装 |
| Local-only mode | Phase 2 | P2 | Network deny + local model only | spec only |
| Monorepo support | Phase 2 | P2 | Package boundary / workspace / app boundary | 未実装 |
| Incremental cache | Phase 2 | P3 | Previous graph/findings 再利用 | 未実装 |
| Large repo optimization | Phase 3 | P3 | Parallel parse + stream processing + memory limit | 未実装 |
| Plugin sandbox | Phase 3 | P2 | Docker/WASM/OS sandbox による plugin 実行 | spec only |
| Call graph extraction | Phase 2 | P3 | Function call relation extraction | 未実装 |
| Dataflow-lite | Phase 2 | P3 | Simple data flow analysis | 未実装 |
| Type inference | Phase 2 | P3 | TypeScript type inference 利用 | 未実装 |
| Redaction implementation | Phase 1 | P1 | LLM 送信前 pattern redaction 実装 | spec only |
| Evidence validator module | Phase 1 | P1 | Path/line/hash/Symbol validation 専用 module | 限定的実装 |
| Unsupported claims isolation module | Phase 1 | P1 | LLM unsupported claims 隔離専用 module | 限定的実装 |

### 4.2 Missing Specifications

プロダクトレベルで必要な仕様文書。v0.1 MVP 未整備。

| spec | Phase | Priority | 内容 | v0.1 状態 |
|---|:---:|:---:|---|---|
| CLI reference | Phase 1 | P1 | 全コマンド詳細ドキュメント | 未整備 |
| Config guide | Phase 1 | P1 | ctg.config.yaml 設定ガイド | 未整備 |
| Policy guide | Phase 1 | P1 | Policy file + suppression ガイド | 未整備 |
| Plugin guide | Phase 2 | P1 | Plugin manifest + SDK + development ガイド | spec only |
| Troubleshooting guide | Phase 1 | P2 | エラー対応・FAQ | 未整備 |
| Examples repository | Phase 1 | P1 | 公開 examples 集 | 未整備 |
| Quickstart guide | Phase 1 | P1 | 5-step クイックスタート | README に一部記載 |
| Performance tuning guide | Phase 2 | P3 | 大規模 repo 対応設定 | 未整備 |
| LLM provider setup guide | Phase 1 | P2 | OpenAI/Anthropic/local LLM 設定 | 未整備 |
| GitHub Actions integration guide | Phase 1 | P1 | workflow template 使用方法 | 未整備 |

### 4.3 Missing Tests

プロダクトレベルで必要なテスト。v0.1 MVP 未整備。

| test | Phase | Priority | 内容 | v0.1 状態 |
|---|:---:|:---:|---|---|
| Contract tests for 4 adapters | Phase 1 | P1 | Gatefield/State Gate/manual-bb/workflow-evidence adapter schema validation CI | manual only |
| Real repo tests | Phase 1 | P1 | 3+ public repo で scan/analyze/readiness 実行テスト | 未実装 |
| FP evaluation tests | Phase 1 | P2 | Human review による FP rate 測定 | 未実装 |
| FN evaluation tests | Phase 1 | P2 | Seeded smells detection rate 測定 | 未実装 |
| Performance tests | Phase 1 | P2 | Small/medium repo timing 測定 | 未実装 |
| Large repo tests | Phase 3 | P3 | 5000+ files repo 性能テスト | 未実装 |
| AST parser accuracy tests | Phase 1 | P1 | AST extraction golden tests | 未実装 |
| Evidence validation tests | Phase 1 | P1 | Evidence validator unit tests | 未実装 |
| Suppression expiry tests | Phase 2 | P2 | Suppression expiry warning/audit tests | 未実装 |
| Plugin runtime tests | Phase 2 | P1 | Plugin manifest + execution + failure tests | 未実装 |
| LLM provider contract tests | Phase 1 | P1 | OpenAI/Anthropic API response schema tests | 未実装 |
| Redaction tests | Phase 1 | P1 | Pattern redaction verification tests | 未実装 |
| Local LLM tests | Phase 2 | P2 | ollama/llama.cpp integration tests | 未実装 |
| Baseline regression tests | Phase 2 | P2 | Baseline comparison + regression detection tests | 未実装 |
| Monorepo tests | Phase 2 | P2 | Package boundary extraction tests | 未実装 |

### 4.4 Missing Operations

プロダクトレベルで必要な運用能力。v0.1 MVP 未整備。

| ops | Phase | Priority | 内容 | v0.1 状態 |
|---|:---:|:---:|---|---|
| CI integration | Phase 1 | P1 | GitHub Actions workflow 運用 | 未整備 |
| Release evidence workflow | Phase 2 | P2 | workflow-cookbook Evidence 保存運用 | 未整備 |
| Audit trail management | Phase 1 | P2 | Audit artifact 保存・検索運用 | 未整備 |
| Suppression expiry management | Phase 2 | P2 | Suppression 有効期限管理・警告運用 | 未整備 |
| FP review workflow | Phase 2 | P2 | FP report + batch suppression workflow | 未整備 |
| Plugin provenance management | Phase 3 | P3 | Plugin manifest 署名・ provenance 管理 | 未整備 |
| Schema migration guide | Phase 2 | P3 | Schema breaking change migration | 未整備 |
| Version upgrade guide | Phase 2 | P3 | v0.1 → Phase 1 → Phase 2 migration | 未整備 |

### 4.5 Missing Documentation

プロダクトレベルで必要な文書。v0.1 MVP 未整備。

| doc | Phase | Priority | 内容 | v0.1 状態 |
|---|:---:|:---:|---|---|
| README OSS-ready | Phase 1 | P1 | Scope/non-goals/quickstart/license/origin policy 整備 | 一部記載 |
| Quickstart guide (standalone) | Phase 1 | P1 | 5-step quickstart PDF/Web | 未整備 |
| CLI reference (full) | Phase 1 | P1 | 全コマンド・全オプション詳細 | 未整備 |
| Configuration guide | Phase 1 | P1 | Config file + policy file + suppression file | 未整備 |
| Policy guide | Phase 1 | P1 | Policy 作成・threshold 設定・suppression 管理 | 未整備 |
| Plugin development guide | Phase 2 | P1 | Plugin SDK + manifest + security contract | 未整備 |
| Troubleshooting guide | Phase 1 | P2 | エラー code 一覧 + 解決方法 | 未整備 |
| Examples repository | Phase 1 | P1 | Public examples 集 (GitHub repo) | 未整備 |
| API docs (Library) | Phase 2 | P3 | Library API type docs | 未整備 |
| Contributing guide | Phase 3 | P2 | OSS contribution guidelines | 未整備 |
| Changelog | Phase 1 | P2 | Version change log | 未整備 |
| Release notes template | Phase 2 | P3 | Release note generation template | 未整備 |

---

## 5. リスク評価

ギャップ未解消時のリスク評価。

### 5.1 P1 リスク（Phase 1 必須解消）

| id | gap | risk | impact if not addressed | mitigation |
|---|---|---|---|---|
| R-P1-01 | AST parser 未実装 | Text fallback 精度低下、誤検知率 > 20%、実 repo で実用不能 | FP rate <= 15% 未達成、OSS alpha acceptance 失敗 | Phase 1 で AST parser 実装 + text fallback 併用 |
| R-P1-02 | GitHub Actions 未実装 | CI 連携不能、PR 自動解析不能、レビュアー体験不足 | OSS 利用者が CI で使えない、adoption 阻害 | Phase 1 で workflow template + PR comment + Checks 実装 |
| R-P1-03 | Suppression 未実装 | 実運用で誤検知対応不能、FP で CI 失敗頻発 | OSS 利用者が FP で挫折、adoption 阻害 | Phase 1 で basic suppression 実装 |
| R-P1-04 | Contract tests CI 未整備 | Downstream schema breaking change 検出不能 | 4 repo adapter 連携破損、integration 失敗 | Phase 1 で adapter contract tests CI 化 |
| R-P1-05 | Real repo tests 未実装 | 実 repo 動作未検証、実用性不明 | OSS alpha acceptance 失敗、品質信頼低下 | Phase 1 で 3+ public repo tests 実施 |
| R-P1-06 | Documentation 未整備 | OSS 利用者が使えない、quickstart なし | Adoption 阻害、issue/質問増加 | Phase 1 で quickstart + CLI reference + examples 整備 |
| R-P1-07 | Redaction 実装不足 | LLM 送信で secret leak 可能 | 機密保護違反、セキュリティ incident | Phase 1 で redaction 実装 + tests |
| R-P1-08 | Evidence validator 限定的 | Evidence なし主張が混入可能 | 品質信頼低下、unsupported claims 隔離不十分 | Phase 1 で evidence validator module 専用実装 |

### 5.2 P2 リスク（Phase 2 推奨解消）

| id | gap | risk | impact if not addressed | mitigation |
|---|---|---|---|---|
| R-P2-01 | Plugin SDK 未実装 | 拡張性限定、private plugin 実行不能 | OSS beta acceptance 失敗、community 拡張阻害 | Phase 2 で plugin SDK + runtime 実装 |
| R-P2-02 | Local LLM 未実装 | Network 必須、offline 利用不能 | 機密保護 requirement 満たせない場合あり | Phase 2 で ollama/llama.cpp 対応 |
| R-P2-03 | Baseline 未実装 | Regression 検出不能、新規 finding のみ block | PR review で新規問題のみ判定、既存問題扱い不明 | Phase 2 で baseline mode 実装 |
| R-P2-04 | Historical comparison 未実装 | 前回比較不能、改善・悪化トレック不明 | Tech Lead 向け価値低下 | Phase 2 で historical comparison 実装 |
| R-P2-05 | FP/FN evaluation 未実装 | 品質指標なし、改善測定不能 | OSS beta acceptance FP rate <= 10% 未達成 | Phase 2 で FP/FN evaluation workflow 実装 |
| R-P2-06 | Monorepo 未対応 | Package 単位解析不能 | 大規模 repo / monorepo 利用者阻害 | Phase 2 で package boundary 実装 |
| R-P2-07 | Web viewer 未実装 | Artifact 可視化不能、人間向け体験不足 | Tech Lead / QA 向け価値低下 | Phase 2 で web viewer MVP 実装 |
| R-P2-08 | Suppression expiry 未実装 | 期限切れ suppression が残留 | FP 管理運用破綻、audit 不備 | Phase 2 で expiry warning + audit 実装 |

### 5.3 P3 リスク（Phase 3 対応可）

| id | gap | risk | impact if not addressed | mitigation |
|---|---|---|---|---|
| R-P3-01 | Python adapter 未実装 | Python repo 対応不能 | Phase 3 acceptance 失敗、言語拡張阻害 | Phase 3 で Python adapter 実装 |
| R-P3-02 | Large repo optimization 未実装 | 5000+ files repo 性能不足 | 大規模 repo 利用者阻害 | Phase 3 で parallel + cache + stream 実装 |
| R-P3-03 | Plugin sandbox 未実装 | Plugin 実行安全性限定的 | private plugin 機密 leak 可能 | Phase 3 で Docker/WASM/OS sandbox 実装 |
| R-P3-04 | Schema stable 未達成 | Breaking change 可能 | v1.0 acceptance stable schema 未達成 | Phase 3 で schema freeze + 6 months stable |
| R-P3-05 | Call graph/dataflow 未実装 | 深い影響範囲解析不能 | Blast radius 精度限定的 | Phase 2/3 で call graph + dataflow-lite 実装 |

---

## 6. 優先度マトリックス

ギャップを Phase・Priority・Dependencies で整理。

### 6.1 Phase 1 必須 (OSS Alpha)

| gap | priority | dependencies | acceptance criteria |
|---|:---:|---|---|
| TS/JS AST parser | P1 | なし | import/export/symbol/route/test extraction golden tests pass |
| GitHub Actions workflow template | P1 | AST parser | PR comment + Checks + exit code 動作 |
| PR comment | P1 | GitHub Actions template | Summary comment 投稿確認 |
| GitHub Checks | P1 | GitHub Actions template | Check run + annotations 作成確認 |
| SARIF export + upload | P1 | Findings artifact | SARIF v2.1.0 schema pass + upload 確認 |
| Basic suppression | P1 | Findings artifact | Suppression file match + finding exclusion 確認 |
| Contract tests CI | P1 | Adapter schemas | 4 adapter schema validation CI pass |
| Real repo tests | P1 | AST parser + rules | 3+ public repo scan/analyze/readiness 動作 |
| Quickstart + CLI reference | P1 | なし | 文書完成 + examples 提供 |
| Redaction implementation | P1 | LLM trust layer | Pattern redaction tests pass |
| Evidence validator module | P1 | Findings artifact | Path/line/hash validation tests pass |
| Unsupported claims isolation module | P1 | LLM trust layer | Unsupported claims 隔離 tests pass |

### 6.2 Phase 2 推奨 (OSS Beta)

| gap | priority | dependencies | acceptance criteria |
|---|:---:|---|---|
| Plugin SDK | P1 | Plugin security contract | Plugin manifest + runtime + schema validation 動作 |
| Suppression expiry + audit | P2 | Basic suppression | Expiry warning + audit record 確認 |
| Historical comparison | P2 | Audit artifact | New/resolved/unchanged 比較確認 |
| Baseline mode | P2 | Audit artifact | Regression detection 確認 |
| Local LLM (ollama/llama.cpp) | P2 | LLM trust layer | Local provider 動作確認 |
| Local-only mode | P2 | Local LLM | Network deny + local model only 確認 |
| Monorepo support | P2 | AST parser | Package boundary extraction 確認 |
| FP/FN evaluation workflow | P2 | Real repo tests | FP rate <= 10% + FN rate <= 10% 確認 |
| Web viewer MVP | P2 | Artifact schemas | Viewer 起動 + artifact 表示確認 |
| Incremental cache | P3 | Scan artifact | Cache hit rate 測定 + performance 改善確認 |
| Call graph extraction | P3 | AST parser | Call relation extraction tests pass |
| Dataflow-lite | P3 | Call graph | Simple data flow tests pass |

### 6.3 Phase 3 対応 (v1.0 Product)

| gap | priority | dependencies | acceptance criteria |
|---|:---:|---|---|
| Python adapter | P1 | Plugin SDK | Python import/function/test extraction tests pass |
| Stable schema v1 | P1 | All Phase 1-2 features | 6 months no breaking change |
| Large repo optimization | P3 | Incremental cache | 5000+ files <= 120s scan |
| Plugin sandbox | P2 | Plugin SDK | Docker/WASM/OS sandbox 動作確認 |
| Web viewer full | P2 | Web viewer MVP | Graph explorer + finding explorer 完備 |
| Type inference | P3 | AST parser | Type inference 利用 tests pass |
| Contributing guide | P2 | Stable docs | OSS contribution guidelines 完備 |

---

## 7. 推奨ロードマップサマリー

詳細ロードマップは `docs/product-roadmap.md` で定義。本書では概要のみ記述。

### 7.1 Phase 1: OSS Alpha (2-4 weeks)

**主目標**: 実 repo 動作 + CI 連携 + 基礎整備

**必須実装**:
- TS/JS AST parser (TypeScript compiler API / Babel / tree-sitter)
- GitHub Actions workflow template
- PR comment + GitHub Checks
- SARIF export + code scanning upload
- Basic suppression file
- Contract tests CI 化
- Real repo tests (3+ public repo)
- Quickstart + CLI reference + Examples
- Redaction + Evidence validator + Unsupported claims isolation

**Exit Criteria**:
- 3+ public repo 動作
- GitHub Actions PR comment 動作
- FP rate <= 15%
- Documentation 完成
- Contract tests CI pass

### 7.2 Phase 2: OSS Beta (4-8 weeks)

**主目標**: 拡張性 + 運用整備 + 品質測定

**必須実装**:
- Plugin SDK + runtime
- Suppression expiry + audit
- Historical comparison + baseline mode
- Local LLM (ollama/llama.cpp)
- Monorepo support
- FP/FN evaluation workflow
- Web viewer MVP
- Incremental cache

**Exit Criteria**:
- 5+ public repo + monorepo 動作
- Plugin SDK 動作確認
- FP rate <= 10%
- Contract tests CI pass
- Suppression expiry 動作

### 7.3 Phase 3: v1.0 Product (8-12 weeks)

**主目標**: 言語拡張 + 安定化 + 大規模対応

**必須実装**:
- Python adapter
- Stable schema v1
- Large repo optimization
- Plugin sandbox
- Web viewer full
- Contributing guide

**Exit Criteria**:
- 10+ public repo + large repo 動作
- Schema stable 6 months
- Plugin ecosystem 3+
- FP rate <= 5%
- Adoption metrics (100+ stars)

---

## 8. 工数見積

概算工数。詳細は実装計画で調整。

### 8.1 Phase 1 (OSS Alpha)

| 項目 | 工数 (weeks) | 内容 |
|---|:---:|---|
| AST parser 実装 | 0.5-1 | TS/JS AST extraction + tests |
| GitHub Actions template | 0.5 | Workflow YAML + actions 作成 |
| PR comment + Checks | 0.5-1 | GitHub API integration |
| SARIF export | 0.25 | SARIF builder + upload test |
| Suppression | 0.5 | Suppression file + match logic |
| Contract tests CI | 0.25 | CI workflow + tests |
| Real repo tests | 0.5-1 | 3+ repo test setup + execution |
| Documentation | 0.5-1 | Quickstart + CLI reference + examples |
| Redaction + validators | 0.5 | Redaction + evidence validator + unsupported claims |
| Testing + integration | 0.5-1 | Unit tests + integration tests |
| Buffer | 0.5 | 不測事態対応 |
| **Total** | **2-4** | |

### 8.2 Phase 2 (OSS Beta)

| 項目 | 工数 (weeks) | 内容 |
|---|:---:|---|
| Plugin SDK | 1-2 | Manifest + runtime + schema contract |
| Suppression expiry + audit | 0.5 | Expiry check + audit record |
| Historical + baseline | 0.5-1 | Comparison + regression detection |
| Local LLM | 0.5-1 | ollama/llama.cpp adapter |
| Monorepo support | 0.5-1 | Package boundary extraction |
| FP/FN evaluation | 0.5-1 | Evaluation workflow + tools |
| Web viewer MVP | 1-2 | Viewer implementation |
| Incremental cache | 0.5 | Cache implementation |
| Testing + integration | 1-2 | Unit + integration + contract tests |
| Buffer | 0.5-1 | 不測事態対応 |
| **Total** | **4-8** | |

### 8.3 Phase 3 (v1.0 Product)

| 項目 | 工数 (weeks) | 内容 |
|---|:---:|---|
| Python adapter | 1-2 | Python AST + extraction |
| Schema freeze | 0.5 | Schema review + stabilization |
| Large repo optimization | 1-2 | Parallel + cache + stream |
| Plugin sandbox | 1-2 | Docker/WASM/OS sandbox |
| Web viewer full | 1-2 | Full viewer features |
| Contributing guide | 0.25 | OSS guidelines |
| Testing + integration | 1-2 | Full test suite |
| Buffer | 1-2 | 不測事態対応 + stabilization |
| **Total** | **8-12** | |

---

## 9. ギャップ解消リスク

ギャップ解消過程で予見されるリスク。

| id | phase | risk | mitigation |
|---|:---:|---|---|
| GR-01 | Phase 1 | AST parser library choice (TypeScript compiler vs Babel vs tree-sitter) で方針転換発生 | 評価期間を設け、fallback parser 併用で safety net 確保 |
| GR-02 | Phase 1 | GitHub API rate limit / token 管理 complexity | GitHub App + PAT 両対応、retry + cache 機構 |
| GR-03 | Phase 1 | Real repo tests で未知の edge case 発見 | Edge case を issue として記録、Phase 1-2 で段階解消 |
| GR-04 | Phase 1 | Documentation 作成工数超過 | 文書 template + generator 利用、段階整備 |
| GR-05 | Phase 2 | Plugin SDK design 変更可能性 | Phase 1 で plugin security contract review、Phase 2 で早期 prototype |
| GR-06 | Phase 2 | Local LLM model performance 不足 | Provider fallback chain + remote/local hybrid mode |
| GR-07 | Phase 2 | FP/FN evaluation human review 工数 | Automated metrics + selective human review workflow |
| GR-08 | Phase 3 | Python adapter library ecosystem complexity | tree-sitter + Python AST 併用、段階実装 |
| GR-09 | Phase 3 | Plugin sandbox technology choice complexity | Docker priority + WASM/OS sandbox 段階評価 |
| GR-10 | Phase 3 | Schema breaking change requirement 発生 | Adapter schema versioning + migration guide |

---

## 10. Open Questions

### 10.1 プロダクトレベル GO Blockers

**現時点で blocker なし**。v0.1 MVP は GO であり、Phase 1-3 のギャップは段階解消可能。

### 10.2 Follow-up Questions

Phase 1-2 で決定必要な論点。

| id | question | phase | decision owner |
|---|---|---|---|
| Q-01 | AST parser library choice: TypeScript compiler API vs Babel vs tree-sitter | Phase 1 prep | Dev |
| Q-02 | GitHub App vs PAT for PR comment: security vs simplicity | Phase 1 prep | Dev + Security |
| Q-03 | Real repo test targets: which 3+ public repos to test | Phase 1 prep | QA |
| Q-04 | FP evaluation method: human review vs automated metrics | Phase 2 prep | QA + Tech Lead |
| Q-05 | Web viewer technology: React vs Vue vs static HTML | Phase 2 prep | Dev + UX |
| Q-06 | Plugin sandbox technology: Docker vs WASM vs OS sandbox | Phase 3 prep | Dev + Security |
| Q-07 | Python AST library: tree-sitter vs Python AST module | Phase 3 prep | Dev |
| Q-08 | Documentation generator: static site vs markdown only | Phase 1 prep | Dev + PM |

---

## 11. Next Actions

即時対応アクション。

| id | action | owner | priority | phase |
|---|---|---|:---:|---|
| NA-01 | `docs/product-roadmap.md` 作成 | PM | P1 | Immediate |
| NA-02 | AST parser library evaluation | Dev | P1 | Phase 1 prep |
| NA-03 | Public repo evaluation list 作成 | QA | P1 | Phase 1 prep |
| NA-04 | GitHub Actions template design | Dev | P1 | Phase 1 prep |
| NA-05 | Contract test CI setup design | QA | P1 | Phase 1 prep |
| NA-06 | Documentation outline 作成 | PM | P1 | Phase 1 prep |
| NA-07 | Real repo test strategy 作成 | QA | P1 | Phase 1 prep |
| NA-08 | Phase 1 kick-off meeting | PM | P1 | Phase 1 prep |

---

## 12. 結論

v0.1 MVP は GO。プロダクトレベル要件とのギャップは明確であり、Phase 1-3 の段階解消が可能。

主要ギャップ:
- **Phase 1 必須**: AST parser + GitHub 連携 + suppression + contract tests + real repo tests + documentation
- **Phase 2 推奨**: Plugin SDK + local LLM + baseline + FP/FN evaluation + web viewer
- **Phase 3 対応**: Python adapter + stable schema + large repo + plugin sandbox

工数見積:
- Phase 1: 2-4 weeks
- Phase 2: 4-8 weeks
- Phase 3: 8-12 weeks

次アクション: `docs/product-roadmap.md` 作成 + Phase 1 prep 実施。