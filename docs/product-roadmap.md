# code-to-gate Product Roadmap v1.0

**バージョン**: v1.0  
**作成日**: 2026-04-30  
**対象**: v0.1 MVP から v1.0 Product までのロードマップ  
**位置づけ**: 本書はプロダクト開発ロードマップ。実装詳細は `docs/product-spec-v1.md`、gap 分析は `docs/product-gap-analysis.md` を参照。

---

## 1. Scope

本書は code-to-gate の v0.1 MVP から v1.0 Product までの開発ロードマップを定義する。

### 1.1 対象範囲

| 項目 | 内容 |
|---|---|
| Phase 0 | v0.1 MVP (完了済み) |
| Phase 1 | OSS α (2-4 weeks) |
| Phase 2 | OSS β (4-8 weeks) |
| Phase 3 | v1.0 Product (8-12 weeks) |

### 1.2 依存関係

- Phase 1 は Phase 0 完了を前提
- Phase 2 は Phase 1 完了を前提
- Phase 3 は Phase 2 完了を前提

### 1.3 リスク範囲

- 技術リスク (AST parser、LLM provider、Plugin sandbox)
- 品質リスク (FP/FN rate、性能)
- 採用リスク (OSS adoption、documentation)

---

## 2. Non-goals

本書は以下を扱わない。

| 項目 | 理由 |
|---|---|
| v0.1 MVP 再計画 | 既に完了 (GO) |
| 実装詳細 | `docs/product-spec-v1.md` で定義 |
| Acceptance 詳細 | `docs/product-acceptance-v1.md` で定義 |
| Gap 分析詳細 | `docs/product-gap-analysis.md` で定義 |
| Company-specific rule | OSS core に含めない (維持) |
| AI agent gate engine | agent-gatefield の責務 (維持) |

---

## 3. Phase 0: v0.1 MVP (Completed)

### 3.1 Status

**状態**: GO (要件定義・仕様書・CLI MVP・fixture 動作 検収済み)

検収判定日: 2026-04-30

### 3.2 Achievements

| 項目 | 内容 | 状態 |
|---|---|:---:|
| TS/JS text fallback scan | regex-based import/export/route extraction | Done |
| NormalizedRepoGraph | 言語差吸収共通 IR 定義 | Done |
| Core rules deterministic | 12 rules (R001-R012) deterministic detection | Done |
| Synthetic fixtures | 6 fixtures (demo-shop-ts, demo-auth-js, etc.) | Done |
| CLI MVP | scan/analyze/diff/import/readiness/export/fixture commands | Done |
| Downstream export 4 types | gatefield/state-gate/manual-bb/workflow-evidence | Done |
| Schema validation | JSON Schema + CLI validation | Done |
| LLM structured output spec | Prompt contract + evidence binding | Done |
| Audit metadata | run/revision/policy/plugin/model recording | Done |

### 3.3 Limitations (Phase 1-3 で解決)

| limitation | Phase | 解決方法 |
|---|---|---|
| AST parser 未実装 (text fallback only) | Phase 1 | TypeScript compiler API / Babel AST parser |
| Real repo 未検証 (synthetic only) | Phase 1 | 3+ public repo で動作確認 |
| GitHub Actions 未実装 | Phase 1 | Workflow template + PR comment + Checks |
| Suppression 未実装 | Phase 1 | Suppression file + expiry |
| Plugin SDK 未実装 | Phase 2 | Plugin manifest + runtime + contract tests |
| Python adapter 未実装 | Phase 3 | Python AST parser (tree-sitter) |
| Large repo optimization 未実装 | Phase 3 | Incremental cache + parallel parse |
| Stable schema 未達 | Phase 3 | v1 schema freeze (breaking change禁止) |
| Web viewer 未実装 | Phase 3 | Artifact viewer + graph explorer |

---

## 4. Phase 1: OSS α (2-4 weeks)

### 4.1 Scope

| 項目 | 内容 |
|---|---|
| TS/JS AST parser | TypeScript compiler API or Babel AST parsing |
| GitHub Actions integration | Workflow template + Actions marketplace |
| PR comment | Markdown summary comment on PR |
| Checks | GitHub Checks run with annotations |
| Basic suppression | Suppression file + ruleId + path + expiry |
| Real repo validation | 3+ public repo (100-500 files) 動作確認 |
| FP evaluation | Human review based FP rate measurement |
| Documentation | README + quickstart + CLI reference + examples |

### 4.2 Non-goals

| 項目 | 理由 |
|---|---|
| Python adapter | Phase 3 対象 |
| Plugin SDK | Phase 2 対象 |
| Web viewer | Phase 3 対象 |
| Large repo optimization | Phase 3 対象 |
| Local LLM | Phase 2 対象 |
| Contract tests CI | Phase 2 対象 |

### 4.3 Acceptance Criteria

| criterion | acceptance | 測定方法 |
|---|---|---|
| Real repo 動作 | 3+ public repo で scan/analyze/readiness 動作 | 実行ログ + artifact 生成確認 |
| GitHub Actions PR comment | PR comment が正常に投稿される | GitHub PR で comment 確認 |
| GitHub Checks | Checks run with annotations が作成される | GitHub Checks tab で確認 |
| FP rate | <= 15% (human review) | Finding human review + FP count / total |
| Detection rate | >= 80% (seeded smells) | Synthetic fixture seeded smell detection |
| Performance | Small repo scan <= 30s (LLM excluded) | timing measurement |
| Documentation | README + quickstart + CLI reference 完成 | doc review |

### 4.4 Exit Criteria

- すべての Acceptance Criteria pass
- Documentation review 完了
- Phase 1 release tag (v0.2.0) 作成

### 4.5 Dependencies

| dependency | 内容 | 解決時期 |
|---|---|---|
| AST parser library | TypeScript compiler API vs Babel vs tree-sitter | Phase 1 prep |
| GitHub App / PAT | PR comment / Checks 投稿権限 | Phase 1 prep |
| Public repo list | 3+ repo selection + access | Phase 1 prep |
| FP review workflow | Human review process definition | Phase 1 prep |

### 4.6 Risks

| id | risk | mitigation |
|---|---|---|
| P1-RISK-01 | AST parser accuracy 不足 | text fallback維持 + evidence validation |
| P1-RISK-02 | AST parser library breaking change | library abstraction layer |
| P1-RISK-03 | GitHub API rate limit / changes | App/PAT両対応 + error handling |
| P1-RISK-04 | Public repo parse failure | diagnostic + text fallback + skip |
| P1-RISK-05 | FP evaluation 時間不足 | batch review + suppression recommendation |

### 4.7 Effort

| role | effort | 内容 |
|---|---|---|
| Development | 2-3 weeks | AST parser + GitHub Actions + suppression + real repo testing |
| QA | 0.5-1 week | Real repo testing + FP evaluation + acceptance verification |
| Documentation | 0.5 week | README + quickstart + CLI reference + examples |

**Total**: 3-4.5 weeks

---

## 5. Phase 2: OSS β (4-8 weeks)

### 5.1 Scope

| 項目 | 内容 |
|---|---|
| Plugin SDK | Plugin manifest + runtime + contract tests |
| Contract tests CI | Downstream 4 adapter schema validation CI化 |
| Suppression expiry | Expiry warning + expired suppression handling |
| Historical comparison | Baseline artifact + new/resolved/unchanged findings |
| Monorepo support | Package boundary + workspace detection |
| Local LLM | ollama / llama.cpp support |
| Performance optimization | Parallel parse + incremental cache |
| Web viewer MVP | Static HTML artifact viewer |

### 5.2 Non-goals

| 項目 | 理由 |
|---|---|
| Python adapter full | Phase 3 対象 |
| Large repo (5000+ files) | Phase 3 対象 |
| Stable schema v1 | Phase 3 対象 |
| Plugin sandbox | Phase 3 対象 |
| Web viewer full | Phase 3 対象 |

### 5.3 Acceptance Criteria

| criterion | acceptance | 測定方法 |
|---|---|---|
| Real repo 動作 | 5+ public repo + monorepo 動作 | 実行ログ + artifact 生成確認 |
| Plugin SDK | Plugin 作成・実行動作 | sample plugin creation + execution |
| Contract tests CI | 4 adapter schema validation CI | CI run + schema validation result |
| FP rate | <= 10% (with suppression) | Human review + suppression count |
| Detection rate | >= 90% (seeded) | Synthetic fixture seeded smell detection |
| Suppression expiry | Expiry warning + expired suppression handling | Suppression file expiry test |
| Performance | Medium repo scan <= 45s | timing measurement |

### 5.4 Exit Criteria

- すべての Acceptance Criteria pass
- Plugin SDK documented
- Contract tests CI 化完了
- Phase 2 release tag (v0.3.0) 作成

### 5.5 Dependencies

| dependency | 内容 | 解決時期 |
|---|---|---|
| Phase 1 complete | Phase 1 exit criteria pass | Phase 1 end |
| Local LLM setup | ollama / llama.cpp installation + model | Phase 2 prep |
| Plugin design | Plugin manifest schema + runtime design | Phase 2 prep |
| Baseline artifact | Previous readiness artifact format | Phase 2 prep |

### 5.6 Risks

| id | risk | mitigation |
|---|---|---|
| P2-RISK-01 | Plugin sandbox complexity | Phase 2: child process + timeout / Phase 3: OS sandbox |
| P2-RISK-02 | Local LLM quality 不足 | confidence threshold + unsupported_claims |
| P2-RISK-03 | Monorepo boundary detection 不正 | manual config + package.json detection |
| P2-RISK-04 | Contract tests CI 設定複雑 | reusable workflow + matrix strategy |
| P2-RISK-05 | Historical comparison diff handling | snapshot-based comparison |

### 5.7 Effort

| role | effort | 内容 |
|---|---|---|
| Development | 4-6 weeks | Plugin SDK + contract tests + suppression + historical + monorepo + local LLM + performance |
| QA | 1-2 weeks | Plugin testing + contract tests + acceptance verification |
| Documentation | 0.5-1 week | Plugin guide + config guide + policy guide |

**Total**: 5.5-9 weeks

---

## 6. Phase 3: v1.0 Product (8-12 weeks)

### 6.1 Scope

| 項目 | 内容 |
|---|---|
| Python adapter | Python AST parser (tree-sitter or Python AST) |
| Stable schema v1 | Breaking change禁止 6 months guarantee |
| Web viewer full | React/Vue artifact viewer + graph explorer + finding explorer |
| Large repo optimization | Incremental cache + parallel parse + stream processing |
| Private plugin sandbox | Docker container or OS sandbox |
| Release evidence bundle | workflow-cookbook Evidence 形式完全対応 |
| Comprehensive docs | README + guides + API docs + troubleshooting + examples |

### 6.2 Non-goals

| 項目 | 理由 |
|---|---|
| AI agent gate | agent-gatefield の責務 (維持) |
| Company rule 混入 | OSS core に company rule を含めない (維持) |
| Unstable schema | v1 schema は stable、breaking change禁止 |

### 6.3 Acceptance Criteria

| criterion | acceptance | 測定方法 |
|---|---|---|
| Real repo 動作 | 10+ public repo + large repo (5000+ files) | 実行ログ + artifact 生成確認 |
| Schema stable | No breaking change for 6 months | schema version history + change log |
| Plugin ecosystem | 3+ public plugins | plugin registry + count |
| FP rate | <= 5% (with suppression) | Human review + suppression count |
| Detection rate | >= 95% (seeded) | Synthetic fixture seeded smell detection |
| Web viewer | Artifact viewer動作 | viewer execution + artifact load |
| Adoption | 100+ GitHub stars | GitHub stars count |
| Performance | Large repo scan <= 120s | timing measurement |

### 6.4 Exit Criteria

- すべての Acceptance Criteria pass
- v1.0 release tag 作成
- Stable schema v1 freeze
- Comprehensive docs 完成
- OSS adoption metrics達成

### 6.5 Dependencies

| dependency | 内容 | 解決時期 |
|---|---|---|
| Phase 2 complete | Phase 2 exit criteria pass | Phase 2 end |
| Sandbox technology | Docker vs WASM vs OS sandbox selection | Phase 3 prep |
| Web viewer technology | React vs Vue vs static HTML selection | Phase 3 prep |
| Python parser library | tree-sitter vs Python AST selection | Phase 3 prep |

### 6.6 Risks

| id | risk | mitigation |
|---|---|---|
| P3-RISK-01 | Large repo performance 不足 | incremental cache + parallel parse + stream |
| P3-RISK-02 | Python parser accuracy 不足 | text fallback維持 + evidence validation |
| P3-RISK-03 | Sandbox implementation complexity | Docker container (simplest) first |
| P3-RISK-04 | Schema breaking change 要求 | v1 freeze後は extension only (non-breaking) |
| P3-RISK-05 | Web viewer complexity | MVP first (static HTML) → full later |
| P3-RISK-06 | Adoption metrics 未達 | documentation + examples + community engagement |

### 6.7 Effort

| role | effort | 内容 |
|---|---|---|
| Development | 6-8 weeks | Python adapter + schema freeze + web viewer + large repo optimization + sandbox + release evidence |
| QA | 2-3 weeks | Large repo testing + plugin ecosystem testing + acceptance verification |
| Documentation | 1-2 weeks | Comprehensive docs + API docs + troubleshooting + examples |

**Total**: 9-13 weeks

---

## 7. Dependency Graph

```
Phase 0 (v0.1 MVP) [DONE]
    │
    ├─ TS/JS text fallback scan
    ├─ NormalizedRepoGraph
    ├─ Core rules deterministic
    ├─ Synthetic fixtures
    ├─ CLI MVP
    ├─ Downstream export 4 types
    ├─ Schema validation
    └─ LLM structured output spec
    │
    ▼
Phase 1 (OSS α) ─────────────────────────────────────────
    │
    ├─ [Phase 0 complete]
    │
    ├─ AST parser library selection
    ├─ GitHub App/PAT setup
    ├─ Public repo list
    │
    ├─ TS/JS AST parser
    │   └─ depends on: AST parser library selection
    │
    ├─ GitHub Actions integration
    │   └─ depends on: GitHub App/PAT setup
    │
    ├─ PR comment / Checks
    │   └─ depends on: GitHub Actions integration
    │
    ├─ Basic suppression
    │   └─ independent
    │
    ├─ Real repo validation
    │   └─ depends on: Public repo list, AST parser
    │
    ├─ FP evaluation
    │   └─ depends on: Real repo validation
    │
    └─ Documentation
        └─ independent
    │
    ▼
Phase 2 (OSS β) ─────────────────────────────────────────
    │
    ├─ [Phase 1 complete]
    │
    ├─ Local LLM setup
    ├─ Plugin design
    ├─ Baseline artifact format
    │
    ├─ Plugin SDK
    │   └─ depends on: Plugin design
    │
    ├─ Contract tests CI
    │   └─ depends on: Phase 1 downstream export
    │
    ├─ Suppression expiry
    │   └─ depends on: Phase 1 suppression
    │
    ├─ Historical comparison
    │   └─ depends on: Baseline artifact format
    │
    ├─ Monorepo support
    │   └─ independent
    │
    ├─ Local LLM
    │   └─ depends on: Local LLM setup
    │
    ├─ Performance optimization
    │   └─ depends on: Phase 1 performance baseline
    │
    └─ Web viewer MVP
        └─ independent
    │
    ▼
Phase 3 (v1.0 Product) ─────────────────────────────────
    │
    ├─ [Phase 2 complete]
    │
    ├─ Sandbox technology selection
    ├─ Web viewer technology selection
    ├─ Python parser library selection
    │
    ├─ Python adapter
    │   └─ depends on: Python parser library selection
    │
    ├─ Stable schema v1
    │   └─ depends on: Phase 2 schema v1alpha1
    │
    ├─ Web viewer full
    │   └─ depends on: Web viewer technology selection, Phase 2 MVP
    │
    ├─ Large repo optimization
    │   └─ depends on: Phase 2 performance optimization
    │
    ├─ Private plugin sandbox
    │   └─ depends on: Sandbox technology selection, Phase 2 Plugin SDK
    │
    ├─ Release evidence bundle
    │   └─ depends on: Phase 2 historical comparison
    │
    └─ Comprehensive docs
        └─ depends on: all features complete
```

---

## 8. Milestone Timeline

| Milestone | Date | Phase | Status |
|---|---|---|:---:|
| v0.1 MVP GO | 2026-04-30 | Phase 0 | DONE |
| Phase 1 prep complete | 2026-05-07 | Phase 1 prep | Pending |
| α release (v0.2.0) | 2026-05-21 | Phase 1 | Pending |
| Phase 2 prep complete | 2026-05-28 | Phase 2 prep | Pending |
| β release (v0.3.0) | 2026-07-09 | Phase 2 | Pending |
| Phase 3 prep complete | 2026-07-16 | Phase 3 prep | Pending |
| v1.0 release | 2026-10-01 | Phase 3 | Pending |

注: 日付は予測値。実際の進捗に応じて調整。

---

## 9. Resource Planning

### 9.1 Effort Summary

| phase | Dev | QA | Docs | Total |
|---|---|---|---|---|
| Phase 1 | 2-3 weeks | 0.5-1 week | 0.5 week | 3-4.5 weeks |
| Phase 2 | 4-6 weeks | 1-2 weeks | 0.5-1 week | 5.5-9 weeks |
| Phase 3 | 6-8 weeks | 2-3 weeks | 1-2 weeks | 9-13 weeks |
| **Total** | **12-17 weeks** | **3.5-6 weeks** | **2-3.5 weeks** | **17.5-26.5 weeks** |

### 9.2 Role Breakdown

#### Development

| task | Phase 1 | Phase 2 | Phase 3 |
|---|---|---|---|
| Parser/Adapter | AST parser (2-3 weeks) | - | Python adapter (2-3 weeks) |
| CI/GitHub | Actions + PR comment + Checks (1 week) | Contract tests CI (0.5 week) | - |
| Rules/Engine | Suppression (0.5 week) | Suppression expiry (0.5 week) | - |
| Plugin | - | Plugin SDK (2 weeks) | Sandbox (1-2 weeks) |
| Performance | - | Optimization (1 week) | Large repo (1-2 weeks) |
| Viewer | - | Web MVP (0.5 week) | Web full (1-2 weeks) |
| Schema | - | - | v1 freeze (0.5 week) |
| Evidence | - | Historical (1 week) | Release bundle (0.5 week) |

#### QA/Testing

| task | Phase 1 | Phase 2 | Phase 3 |
|---|---|---|---|
| Real repo testing | 3+ repo (0.5 week) | 5+ repo + monorepo (1 week) | 10+ repo + large (2 weeks) |
| FP evaluation | Human review (0.5 week) | FP rate measurement (0.5 week) | FP rate verification (0.5 week) |
| Acceptance | Verification (0.5 week) | Verification (1 week) | Verification (1 week) |

#### Documentation

| task | Phase 1 | Phase 2 | Phase 3 |
|---|---|---|---|
| README | Quickstart + scope (0.25 week) | Update (0.25 week) | Final (0.25 week) |
| Guides | CLI reference (0.25 week) | Plugin + config (0.5 week) | API docs (1 week) |
| Examples | Basic examples (0.25 week) | Plugin example (0.25 week) | Comprehensive (0.5 week) |

### 9.3 Project Management

| task | effort | 内容 |
|---|---|---|
| Phase prep | 0.5 week per phase | Dependency resolution + planning |
| Milestone tracking | 0.5 week total | Progress tracking + reporting |
| Release management | 0.5 week total | Release tag + changelog + announcement |

---

## 10. Risks (Cross-phase)

### 10.1 Technical Risks

| id | priority | risk | phase | mitigation |
|---|---:|---|---|---|
| TR-01 | P1 | AST parser library breaking change | Phase 1+ | library abstraction + text fallback |
| TR-02 | P1 | AST parser accuracy不足 | Phase 1+ | text fallback維持 + evidence validation |
| TR-03 | P2 | Local LLM quality不足 | Phase 2+ | confidence threshold + unsupported_claims |
| TR-04 | P2 | Plugin sandbox complexity | Phase 3 | Phase 2: child process / Phase 3: Docker |
| TR-05 | P3 | Python parser accuracy不足 | Phase 3 | text fallback維持 + evidence validation |
| TR-06 | P3 | Large repo performance不足 | Phase 3 | incremental cache + parallel + stream |

### 10.2 Quality Risks

| id | priority | risk | phase | mitigation |
|---|---:|---|---|---|
| QR-01 | P1 | False positive多発 | Phase 1+ | FP evaluation + suppression mechanism |
| QR-02 | P1 | Detection rate不足 | Phase 1+ | seeded smell testing + rule tuning |
| QR-03 | P2 | Schema breaking change要求 | Phase 3 | v1 freeze後は extension only |
| QR-04 | P3 | Web viewer complexity | Phase 3 | MVP first → full later |

### 10.3 External Risks

| id | priority | risk | phase | mitigation |
|---|---:|---|---|---|
| ER-01 | P1 | GitHub API rate limit / changes | Phase 1+ | App/PAT両対応 + error handling |
| ER-02 | P2 | LLM provider変更・停止 | Phase 2+ | Provider fallback + local-only mode |
| ER-03 | P2 | Downstream schema変更 | Phase 2+ | Adapter versioning + contract tests |
| ER-04 | P3 | OSS adoption低 | Phase 3+ | documentation + examples + community |

### 10.4 Process Risks

| id | priority | risk | phase | mitigation |
|---|---:|---|---|---|
| PR-01 | P1 | FP evaluation時間不足 | Phase 1 | batch review + suppression recommendation |
| PR-02 | P2 | Contract tests CI設定複雑 | Phase 2 | reusable workflow + matrix strategy |
| PR-03 | P3 | Large repo testing resource不足 | Phase 3 | CI resource allocation + incremental testing |

---

## 11. Open Questions

### 11.1 GO Blockers

**なし**。現時点でロードマップ実行の blocker なし。

Phase 0 v0.1 MVP は GO。Phase 1-3 の前提条件は明確。

### 11.2 Follow-up Questions

| id | question | phase | decision deadline |
|---|---|---|---|
| Q-01 | AST parser library choice (TypeScript compiler vs Babel vs tree-sitter) | Phase 1 prep | 2026-05-07 |
| Q-02 | GitHub App vs PAT for PR comment / Checks | Phase 1 prep | 2026-05-07 |
| Q-03 | FP evaluation method (human review vs automated) | Phase 1 prep | 2026-05-07 |
| Q-04 | Public repo evaluation list (3+ repos) | Phase 1 prep | 2026-05-07 |
| Q-05 | Local LLM setup (ollama vs llama.cpp) | Phase 2 prep | 2026-05-28 |
| Q-06 | Plugin sandbox technology (Docker vs WASM vs OS sandbox) | Phase 3 prep | 2026-07-16 |
| Q-07 | Web viewer technology (React vs Vue vs static HTML) | Phase 3 prep | 2026-07-16 |
| Q-08 | Python parser library (tree-sitter vs Python AST) | Phase 3 prep | 2026-07-16 |

---

## 12. Next Actions

### 12.1 Immediate Actions (Phase 1 Prep)

| id | action | owner | deadline | status |
|---|---|---|---|:---:|
| NA-01 | `docs/product-acceptance-v1.md` 作成 | QA | 2026-04-30 | Done |
| NA-02 | `docs/product-gap-analysis.md` 作成 | Analyst | 2026-04-30 | Done |
| NA-03 | `docs/product-roadmap.md` 作成 | PM | 2026-04-30 | Done |
| NA-04 | AST parser library evaluation | Dev | 2026-05-07 | Pending |
| NA-05 | GitHub App/PAT setup decision | Dev | 2026-05-07 | Pending |
| NA-06 | Public repo evaluation list作成 | QA | 2026-05-07 | Pending |
| NA-07 | FP evaluation workflow定義 | QA | 2026-05-07 | Pending |
| NA-08 | GitHub Actions template design | Dev | 2026-05-07 | Pending |
| NA-09 | Phase 1 kickoff meeting | PM | 2026-05-07 | Pending |

### 12.2 Phase 1 Development Actions

| id | action | owner | week |
|---|---|---|:---:|
| P1-DEV-01 | AST parser implementation | Dev | 1-2 |
| P1-DEV-02 | GitHub Actions workflow implementation | Dev | 2 |
| P1-DEV-03 | PR comment implementation | Dev | 2 |
| P1-DEV-04 | Checks implementation | Dev | 2 |
| P1-DEV-05 | Suppression file implementation | Dev | 2-3 |
| P1-DEV-06 | Real repo testing setup | Dev | 3 |
| P1-DEV-07 | Documentation update | Dev | 3 |

### 12.3 Phase 1 QA Actions

| id | action | owner | week |
|---|---|---|:---:|
| P1-QA-01 | AST parser accuracy test | QA | 1-2 |
| P1-QA-02 | Real repo scan test (3+ repos) | QA | 2-3 |
| P1-QA-03 | GitHub Actions test | QA | 2-3 |
| P1-QA-04 | FP evaluation (human review) | QA | 3-4 |
| P1-QA-05 | Acceptance criteria verification | QA | 4 |

### 12.4 Phase 1 Documentation Actions

| id | action | owner | week |
|---|---|---|:---:|
| P1-DOC-01 | README update (quickstart, examples) | Docs | 3-4 |
| P1-DOC-02 | CLI reference update | Docs | 3-4 |
| P1-DOC-03 | GitHub Actions guide | Docs | 3-4 |

---

## Appendix: Reference Documents

| document | path | 内容 |
|---|---|---|
| v0.1 MVP Requirements | `docs/requirements.md` | MVP level要件定義 |
| Product Requirements v1 | `docs/product-requirements-v1.md` | Product level要件定義 |
| Product Spec v1 | `docs/product-spec-v1.md` | Product level仕様書 |
| Product Acceptance v1 | `docs/product-acceptance-v1.md` | Product level受入基準 |
| Product Gap Analysis | `docs/product-gap-analysis.md` | Gap分析 |
| Artifact Contracts | `docs/artifact-contracts.md` | Artifact契約 |
| LLM Trust Model | `docs/llm-trust-model.md` | LLM信頼モデル |
| Plugin Security Contract | `docs/plugin-security-contract.md` | Plugin安全契約 |