---
intent_id: BP-001
owner: code-to-gate
status: active
last_reviewed_at: 2026-05-03
next_review_due: 2026-05-15
---

# code-to-gate BLUEPRINT

要件、制約、背景、設計方針。

## 1. 背景

既存の静的解析ツール(Semgrep/ESLint/SonarQube)は、それぞれの層で成熟している。しかし、これらの出力を統合し、品質評価・リスク判断・テスト設計・リリース判定へ変換する上位レイヤーが存在しない。

既存 repo との棲み分け:

| repo | 主戦場 | code-to-gate の扱い |
|---|---|---|
| `agent-gatefield` | AI 成果物の pass/hold/block 判定 | static result を渡す |
| `agent-state-gate` | エージェント作業の統合 verdict | evidence summary を渡す |
| `manual-bb-test-harness` | 手動 black-box テスト設計 | risk/invariant seed を渡す |
| `workflow-cookbook` | 作業・証跡・受入・CI 運用 | Evidence 連携 |

## 2. 一文定義

> **code-to-gate は、アプリケーションコード、変更差分、静的解析結果、テスト証跡を入力にして、コード由来の品質リスク、影響範囲、追加テスト観点、リリース判断材料を証拠付き artifact として生成するローカルファーストの品質ハーネスである。**

## 3. スコープ

### In Scope

- TypeScript / JavaScript repo scan
- Python / Ruby / Go / Rust adapter (tree-sitter WASM)
- AST / import / export / symbol / call / test 抽出
- changed files / PR diff 解析
- dependency graph / blast radius 推定
- core smell rules (10-15)
- external tool importer (ESLint/Semgrep/tsc/coverage)
- normalized findings
- risk register
- invariant candidates
- coverage gap hints
- test seed artifact
- release readiness bundle
- policy-based release gate input
- Markdown / JSON / YAML / Mermaid / SARIF 出力
- LLM summary / risk narrative / recommended actions
- private plugin / private policy 分離
- CI / PR comment / GitHub Checks 連携
- downstream adapter (4種)

### Out of Scope

- AI agent 成果物の最終判定
- agent 実行状態管理
- 手動 black-box test case 最終設計
- Task Seed / Acceptance 運用
- company-specific rule in OSS core
- private repo 解析結果の公開
- 本番無人リリース承認の最終権限

## 4. 制約

### 4.1 技術制約

- TypeScript/JavaScript 先行、Python 次段
- **LLM 連携必須** (OpenAI/Anthropic/Alibaba/OpenRouter/ollama/llama.cpp)
- AST/静的解析はデータ収集層、LLM は判断層
- ローカル実行中心

### 4.2 法務・セキュリティ制約

- 公開 OSS は MIT ライセンス汎用コア
- 社内固有ルールは private plugin 分離
- 解析結果・会社コードは非公開
- 架空 repo のみ fixtures 使用

### 4.3 開発制約

- 一人で実運用できる最小核(P0)優先
- 中規模 repo で数分内 scan 完了

## 5. 信頼モデル

### LLM の責務

- analysis summary
- risk narrative
- invariant candidate 説明
- recommended actions
- test seed 補強
- PR comment draft

### LLM が決めないもの

- finding の evidence
- gate status
- severity threshold
- policy violation
- suppression 有効性

### Evidence 原則

- すべての finding は evidence >= 1
- LLM 生成物は元 finding/evidence 紐付け
- evidence なし LLM 主張は `unsupported_claims` 隔離

## 6. 成果物モデル

| artifact | 目的 | 消費者 |
|---|---|---|
| `repo-graph.json` | NormalizedRepoGraph | 内部、reviewer |
| `findings.json` | 正規化 finding | CI、downstream |
| `risk-register.yaml` | リスク台帳 | reviewer、Tech Lead |
| `invariants.yaml` | 不変条件候補 | QA、manual-bb |
| `test-seeds.json` | QA 設計 seed | manual-bb-test-harness |
| `release-readiness.json` | 判断材料 bundle | agent-state-gate、CI |
| `analysis-report.md` | 人間向け要約 | 開発者、レビュアー |
| `audit.json` | run metadata | 監査、再現 |
| `results.sarif` | code scanning | GitHub |

## 7. 連携先

| downstream | 提供 artifact |
|---|---|
| `agent-gatefield` | gatefield-static-result.json |
| `agent-state-gate` | state-gate-evidence.json |
| `manual-bb-test-harness` | manual-bb-seed.json |
| `workflow-cookbook` | workflow-evidence.json |

## 8. 実装優先度

| Phase | 内容 | 状態 |
|---|---|:---:|
| Phase 0 | Schema foundation、fixtures、repo walker | ✓完了 |
| Phase 1 | TS/JS adapter、NormalizedRepoGraph、core rules | ✓完了 |
| Phase 2 | LLM engine、structured output、risk/invariant/test seed | ✓完了 |
| Phase 3 | Readiness policy、downstream exporters | ✓完了 |
| Phase 4 | Dataflow-lite、Type inference | ✓完了 |
| Phase 5 | Python/Ruby/Go/Rust tree-sitter WASM | ✓完了 |
| Phase 6 | repo-graph-builder統合、CLI接続 | ✓完了 |
| Phase 7 | WASM Node.js修正、tree-sitter自動化、Dataflow-full | ✓完了 |

## 9. 参照

- [docs/requirements.md](docs/requirements.md): 正本要件定義
- [docs/acceptance-v0.1.md](docs/acceptance-v0.1.md): 完成条件
- [orchestration/v0.1-implementation.md](orchestration/v0.1-implementation.md): Task Seed 形式実装計画
- [RUNBOOK.md](RUNBOOK.md): 実行手順
- [GUARDRAILS.md](GUARDRAILS.md): ガードレール