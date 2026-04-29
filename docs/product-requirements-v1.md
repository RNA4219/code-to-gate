# code-to-gate Product Requirements v1.0

**バージョン**: v1.0  
**作成日**: 2026-04-30  
**対象**: OSS alpha / beta / v1.0 product level  
**位置づけ**: 本書はプロダクトレベル要件定義。v0.1 MVP 要件定義は `docs/requirements.md` を参照。

---

## 1. Scope

本書は code-to-gate のプロダクトレベル要件を定義する。

対象:
- OSS alpha (Phase 1)
- OSS beta (Phase 2)
- v1.0 product (Phase 3)

v0.1 Local Release Readiness MVP は別途 `docs/requirements.md` で定義済み。本書は v0.1 完成後の次段階以降を対象とする。

---

## 2. Non-goals

- v0.1 MVP 要件の再定義 (`docs/requirements.md` を参照)
- 実装詳細 (仕様書 `docs/product-spec-v1.md` を参照)
- acceptance 詳細 (受入書 `docs/product-acceptance-v1.md` を参照)
- company-specific rule の OSS core 混入禁止 (維持)
- AI agent artifact gate engine (維持)
- agent approval / freshness / human queue (維持)
- manual black-box test final design (維持)
- workflow / Task Seed governance (維持)

---

## 3. 製品ビジョン

### 3.1 一文定義

**code-to-gate は、任意のコードベースと変更差分を解析し、品質リスクと検証材料を証拠付きで生成し、CI/PR/リリース判断に統合可能な artifact を提供する OSS 品質ハーネスである。**

### 3.2 ビジョン要素

| 要素 | 内容 |
|---|---|
| local-first | ローカル実行と CI artifact 生成を正式サポート。クラウド依存なしで基本機能が動作する。 |
| evidence-backed | すべての finding/risk/test seed は evidence 参照を持つ。LLM 生成主張も根拠と紐づく。 |
| CI-ready | exit code / JSON output / SARIF / GitHub Checks / PR comment で CI から扱える。 |
| plugin-extendable | language adapter / rule / importer / reporter を plugin で拡張可能。private rule は OSS core 外に分離。 |
| downstream-integrable | agent-gatefield / agent-state-gate / manual-bb-test-harness / workflow-cookbook に artifact を渡せる。 |

### 3.3 差別化 positioning

| 領域 | code-to-gate | 既存ツール |
|---|---|---|
| コード品質リスク抽出 | 変更差分 + 依存 graph + evidence + risk narrative | ESLint/Semgrep: rule hit のみ |
| リリース判断材料 | readiness bundle + policy threshold + audit trace | SonarQube Quality Gate: metric threshold のみ |
| QA seed 生成 | risk → test intent + affected entrypoint | 手動設計または coverage tool |
| downstream 統合 | 4 repo adapter + schema contract | 単独ツール |

---

## 4. 想定ユーザー

### 4.1 Primary Users

| ユーザー | 役割 | 欲しいもの | 利用頻度 |
|---|---|---|---|
| Developer | PR 作成者 | 変更の危険箇所と追加テスト観点 | PR 毎 |
| Reviewer | PR レビュアー | 変更影響と根拠行の短時間把握 | PR 毎 |
| QA Engineer | 手動テスト設計者 | コード由来 risk/invariant/coverage hint | Release 毎 / PR 毎 |
| Tech Lead | リリース判断者 | readiness bundle + policy + audit | Release 毎 |
| CI Engineer | CI/CD 管理者 | exit code / artifact / GitHub Checks | CI run 毎 |

### 4.2 Secondary Users

| ユーザー | 役割 | 欲しいもの | 利用頻度 |
|---|---|---|---|
| Security Engineer | セキュリティレビュー | auth/data/payment category findings | Release 毎 / Incident 時 |
| Platform Engineer | SRE/DevOps | release gate input + evidence | Release 毎 |
| Auditor | 監査担当 | audit metadata + policy + artifact hash | 監査時 |

---

## 5. 対象ユースケース

### 5.1 Primary Use Cases

| UC ID | ユースケース | 入力 | 出力 | 利用者 |
|---|---|---|---|---|
| UC-001 | PR Risk Scan | PR diff / repo | findings / blast radius / test hints | Developer, Reviewer |
| UC-002 | Release Readiness Bundle | repo / policy | readiness bundle + all artifacts | Tech Lead, QA |
| UC-003 | Static Analysis Aggregation | ESLint/Semgrep/tsc/coverage JSON | normalized findings + unified report | CI Engineer, Developer |
| UC-004 | QA Seed Generation | repo / changed files | risk seeds / invariants / test seeds | QA Engineer |
| UC-005 | CI Gate Integration | repo / policy / base/head | exit code / SARIF / PR comment / Checks | CI Engineer |

### 5.2 Secondary Use Cases

| UC ID | ユースケース | 入力 | 出力 | 利用者 |
|---|---|---|---|
| UC-006 | Historical Comparison | previous artifact + current run | new/resolved/unchanged risks | Tech Lead |
| UC-007 | Monorepo Package Analysis | monorepo root + package boundary | package-level graph + findings | Developer, Tech Lead |
| UC-008 | Private Rulepack Execution | repo + private plugin | private findings + combined readiness | Security Engineer |
| UC-009 | Local LLM Offline Analysis | repo + local model | findings + narrative (no network) | Developer (offline) |
| UC-010 | SARIF Upload for Code Scanning | findings | SARIF file | CI Engineer |

---

## 6. 非対象ユースケース

| UC ID | ユースケース | 理由 | 正本 repo |
|---|---|---|---|
| NG-001 | AI artifact pass/hold/block 判定 | AI 生成物の gate は agent-gatefield | agent-gatefield |
| NG-002 | Agent approval/freshness 管理 | agent 実行状態は agent-state-gate | agent-state-gate |
| NG-003 | Manual BB test case 最終設計 | coverage model + case design は manual-bb-test-harness | manual-bb-test-harness |
| NG-004 | Task Seed/Acceptance 運用 | workflow pattern は workflow-cookbook | workflow-cookbook |
| NG-005 | Company-specific rule 混入 | OSS core に company rule を含めない | private plugin |
| NG-006 | 本番無人リリース承認 | 最終権限は human gate | downstream gate |

---

## 7. プロダクトレベル成功条件

### 7.1 OSS α 成功条件

| 条件 | 内容 |
|---|---|
| 実 repo 動作確認 | 3+ public repo (100-500 files) で scan/analyze/readiness が実行可能 |
| 誤検知率 | core rules の false positive rate <= 15% (human review based) |
| 見逃し率 | seeded smells の detection rate >= 80% |
| CI 動作 | GitHub Actions で PR comment / Checks / exit code が動作 |
| Documentation | README / quickstart / troubleshooting / examples |
| Performance | 500 files repo の scan <= 60s (local, LLM excluded) |

### 7.2 OSS β 成功条件

| 条件 | 内容 |
|---|---|
| 実 repo 動作確認 | 5+ public repo (500-2000 files) + monorepo で動作 |
| 誤検知率 | FP rate <= 10% |
| 見逃し率 | detection rate >= 90% |
| Suppression | suppression file で FP 管理 / 有効期限 |
| Plugin SDK | language/rule/importer plugin 作成可能 |
| Contract Tests | downstream 4 repo adapter schema validation |
| Performance | 2000 files repo の scan <= 180s |

### 7.3 v1.0 成功条件

| 条件 | 内容 |
|---|---|
| 実 repo 動作確認 | 10+ public repo + large repo (5000+ files) |
| 誤検知率 | FP rate <= 5% (with suppression) |
| 見逃し率 | detection rate >= 95% (seeded) |
| Stable Schema | artifact schema v1 stable / no breaking change for 6 months |
| Plugin Ecosystem | 3+ public plugins / private plugin 実行環境 |
| Web Viewer | artifact viewer / graph explorer / finding explorer |
| Release Evidence | workflow-cookbook Evidence 形式で保存可能 |
| Adoption | 100+ GitHub stars / 10+ real project usage |

---

## 8. 段階定義

### 8.1 Phase 0: v0.1 MVP (Completed)

**状態**: GO (要件定義・仕様書検収済み)

| 内容 | 状態 |
|---|---|
| TS/JS text fallback scan | Done |
| NormalizedRepoGraph | Done |
| core rules deterministic | Done |
| LLM structured output spec | Done |
| synthetic fixtures | Done |
| CLI MVP | Done |
| downstream export 4種 | Done |
| schema validation | Done |

**位置づけ**: v0.1 MVP は「要件定義・仕様書・CLI MVP・fixture 動作」が GO。プロダクトレベル実装は未達。

### 8.2 Phase 1: OSS α

**期間**: 2-4 weeks

**Scope**:
- TS/JS AST parser
- Real repo 動作確認
- GitHub Actions integration
- PR comment / Checks
- Basic suppression
- False positive evaluation
- Documentation

**Non-goals**:
- Python adapter
- Plugin SDK
- Web viewer
- Large repo optimization

**Exit Criteria**:
- 3+ public repo 動作
- GitHub Actions PR comment 動作
- FP rate <= 15%
- Documentation 完成

### 8.3 Phase 2: OSS β

**期間**: 4-8 weeks

**Scope**:
- Plugin SDK
- Contract tests
- Suppression expiry
- Historical comparison
- Monorepo support
- Local LLM (ollama/llama.cpp)
- Performance optimization
- Web viewer MVP

**Non-goals**:
- Python adapter full
- Large repo (5000+ files)
- Stable schema v1

**Exit Criteria**:
- 5+ public repo + monorepo 動作
- Plugin SDK 動作確認
- Contract tests CI 化
- FP rate <= 10%

### 8.4 Phase 3: v1.0 Product

**期間**: 8-12 weeks

**Scope**:
- Python adapter
- Stable schema v1
- Web viewer
- Large repo optimization
- Private plugin sandbox
- Release evidence bundle
- Comprehensive docs

**Non-goals**:
- AI agent gate (維持)
- Company rule混入 (維持)

**Exit Criteria**:
- 10+ public repo + large repo 動作
- Schema stable 6 months
- Plugin ecosystem 3+
- FP rate <= 5%
- Adoption metrics

---

## 9. 実 Repo 対応要求

### 9.1 Repository Type Coverage

| repo type | Phase 1 | Phase 2 | Phase 3 |
|---|:---:|:---:|:---:|
| Small TS/JS (100-500 files) | Required | Required | Required |
| Medium TS/JS (500-2000 files) | Recommended | Required | Required |
| Large TS/JS (2000-5000 files) | Optional | Recommended | Required |
| Monorepo (workspace) | Optional | Required | Required |
| Python (pure) | Optional | Optional | Required |
| Mixed TS/JS + Python | Optional | Optional | Required |
| Generated files heavy | N/A | Recommended | Required |
| Vendored files heavy | N/A | Recommended | Required |

### 9.2 File Handling

| file type | Phase 1 | Phase 2 | Phase 3 |
|---|:---:|:---:|:---:|
| `.ts/.tsx/.js/.jsx` | Required | Required | Required |
| `.py` | Optional | Optional | Required |
| `.json/.yaml/.md` | Required | Required | Required |
| `.env` (metadata only) | Required | Required | Required |
| Binary files | Skip | Skip | Skip |
| Minified files | Skip | Skip | Skip |
| Lockfiles (`package-lock.json`) | Skip | Parse metadata | Parse metadata |
| `node_modules/` | Skip | Skip | Skip |
| Generated (`*.generated.*`) | Skip | Skip | Skip |
| Vendored (`vendor/`, `third_party/`) | Skip | Skip | Skip |

### 9.3 Parse Failure Handling

| failure type | Phase 1 | Phase 2 | Phase 3 |
|---|---|---|---|
| Syntax error (AST) | diagnostic + text fallback | diagnostic + text fallback | diagnostic + text fallback |
| Unsupported language | diagnostic + skip | diagnostic + skip | diagnostic + skip (except Python) |
| File not found | diagnostic + skip | diagnostic + skip | diagnostic + skip |
| Large file (>1MB) | skip + diagnostic | partial parse + diagnostic | partial parse + diagnostic |
| Encoding error | diagnostic + skip | diagnostic + skip | diagnostic + skip |

---

## 10. Scanner / Parser Architecture 要求

### 10.1 TS/JS AST Parser

**Phase 1 Required**:

| capability | 内容 |
|---|---|---|
| Import extraction | `import`, `require`, dynamic import |
| Export extraction | `export`, `export default`, `export *` |
| Symbol extraction | function, class, method, variable, type, interface |
| Route extraction | Express/Fastify/NestJS route handler pattern |
| Test extraction | Jest/Vitest/Mocha test file / test relation |
| Entrypoint extraction | `main`, `index`, server entry |

**Phase 2+**:
- Call graph extraction
- Type inference
- Dataflow-lite

### 10.2 Fallback Text Parser

**Phase 1+ Required**:

| capability | 内容 |
|---|---|---|
| Line-based extraction | regex pattern for import/export/route |
| Excerpt hash | SHA-256 hash of matched excerpt |
| Evidence kind | `kind=text` with `excerptHash` required |

### 10.3 Python Adapter

**Phase 3 Required**:

| capability | 内容 |
|---|---|---|
| Import extraction | `import`, `from ... import` |
| Function extraction | `def`, `async def`, class method |
| Test extraction | pytest/unittest file |
| Entrypoint extraction | `__main__`, `app.py` |

---

## 11. Rule Engine 要求

### 11.1 Rule Metadata

すべての rule は次 metadata を持つ。

| field | required | 内容 |
|---|:---:|---|
| `ruleId` | Yes | Unique identifier (e.g., `CLIENT_TRUSTED_PRICE`) |
| `category` | Yes | `auth`, `payment`, `validation`, `data`, `config`, `maintainability`, `testing`, `compatibility`, `release-risk` |
| `severity` | Yes | `low`, `medium`, `high`, `critical` |
| `confidence` | Yes (output) | 0.0-1.0 (deterministic or LLM-assisted) |
| `title` | Yes | Short human-readable title |
| `summary` | Yes | One-line explanation |
| `evidence` | Yes (output) | At least 1 `EvidenceRef` |
| `tags` | No | Arbitrary tags for filtering |
| `upstream` | No | External tool mapping |

### 11.2 Rule Pack

| pack type | Phase | 内容 |
|---|:---:|---|
| Core rules (OSS) | Phase 1+ | v0.1 rules + additional rules |
| Private rulepack | Phase 2+ | company-specific rules via plugin |
| Community rulepack | Phase 3+ | third-party rules via plugin |

### 11.3 Custom Policy

| policy element | Phase | 内容 |
|---|:---:|---|
| Severity threshold | Phase 1+ | block on critical/high |
| Category threshold | Phase 1+ | block on auth/payment category |
| Confidence threshold | Phase 1+ | ignore low confidence findings |
| Suppression allowlist | Phase 1+ | ruleId + path + expiry |
| LLM policy | Phase 2+ | provider / model / local-only |

### 11.4 Suppression Model

**Phase 1+ Required**:

| field | required | 内容 |
|---|:---:|---|
| `ruleId` | Yes | Suppressed rule |
| `path` | Yes | Target file path (glob supported) |
| `reason` | Yes | Human-readable reason |
| `expiry` | Recommended | Expiry date (YYYY-MM-DD) |
| `author` | No | Who created suppression |

**Phase 2+**:
- Suppression expiry warning
- Suppression count limit
- Suppression audit

### 11.5 False Positive Handling

| mechanism | Phase | 内容 |
|---|:---:|---|
| Evidence validation | Phase 1+ | path exists + line range valid |
| Confidence threshold | Phase 1+ | filter by policy |
| Suppression | Phase 1+ | human-marked FP |
| FP review workflow | Phase 2+ | FP report + batch suppression |
| FP evaluation metrics | Phase 2+ | FP rate measurement |

---

## 12. Evidence 要求

### 12.1 Evidence Types

| kind | Phase | 内容 |
|---|:---:|---|
| `ast` | Phase 1+ | AST node reference |
| `text` | Phase 1+ | Text excerpt with hash |
| `import` | Phase 1+ | Import relation |
| `external` | Phase 1+ | External tool result |
| `test` | Phase 1+ | Test file relation |
| `coverage` | Phase 1+ | Coverage data |
| `diff` | Phase 2+ | Diff change |

### 12.2 Evidence Validation

**Phase 1+ Required**:

| validation | 内容 |
|---|---|
| Path exists | `path` は repo root からの相対パスで実在する |
| Line range valid | `startLine`/`endLine` は 1-based で file line count 内 |
| Excerpt hash (text) | `excerptHash` は該当 excerpt の SHA-256 と一致 |
| External ref (external) | `externalRef.tool` が存在 |

**Phase 2+**:
- Symbol exists
- Entrypoint exists
- Coverage data valid

### 12.3 Evidence Missing Handling

| situation | handling |
|---|---|
| Path not found | `diagnostic` + `completeness=partial` |
| Line range invalid | `diagnostic` + adjust range |
| Excerpt hash mismatch | `diagnostic` + regenerate |
| External tool ref missing | `unsupported_claims` |

---

## 13. LLM Trust 要求

### 13.1 LLM Role

LLM は補助役割。最終判定者ではない。

| LLM 担当 | LLM 不担当 |
|---|---|
| Summary / narrative | Finding evidence |
| Risk narrative | Gate status |
| Invariant candidate explanation | Severity threshold |
| Recommended actions | Policy violation |
| Test seed補強 | Suppression validity |
| PR comment draft | Source existence |

### 13.2 LLM Provider

**Phase 1**:
- OpenAI (GPT-4.x)
- Anthropic (Claude 4.x)
- Remote API required for LLM features

**Phase 2+**:
- Local LLM (ollama, llama.cpp)
- Local-only mode (--llm-mode local-only)
- Provider fallback chain

### 13.3 LLM Failure Handling

| failure | Phase 1 | Phase 2+ |
|---|---|---|
| Connection failed | exit code 4 or needs_review | retry + fallback |
| Timeout | retry + needs_review | bounded retry |
| Schema invalid | repair prompt + retry | repair + unsupported_claims |
| Low confidence | filter by policy | filter + needs_review_hint |
| Hallucination | unsupported_claims | evidence validator |

### 13.4 Redaction

**Phase 1+ Required**:

| pattern | 内容 |
|---|---|
| API key pattern | `api_key`, `apikey`, `API_KEY` values |
| Token pattern | `token`, `access_token` values |
| Password assignment | `password`, `pwd` assignments |
| `.env` body | Entire `.env` file content |
| Private key block | PEM private key content |
| Configured patterns | User-defined redaction patterns |

### 13.5 Local-only Mode

**Phase 2+**:

| mode | network | provider |
|---|---|---|
| `remote` | Allowed | OpenAI/Anthropic/etc. |
| `local-only` | Denied | ollama/llama.cpp localhost only |
| `none` | Denied | No LLM |

Local-only modeで local model なしの場合、exit code 4。

### 13.6 LLM Audit

**Phase 1+ Required**:

| audit field | 内容 |
|---|---|
| Provider | `openai`, `anthropic`, `ollama`, etc. |
| Model | Model ID |
| Prompt version | Prompt template version |
| Request hash | SHA-256 of request payload |
| Response hash | SHA-256 of response payload |
| Redaction enabled | Boolean |
| Unsupported claim count | Integer |

Raw prompt/response は `--debug-llm-trace` 指定時のみ保存。

---

## 14. CI / GitHub 要求

### 14.1 GitHub Actions

**Phase 1+ Required**:

| element | 内容 |
|---|---|---|
| Workflow template | Reusable workflow YAML |
| Input parameters | repo, base, head, policy |
| Outputs | exit code, artifact path |
| Artifact upload | `.qh/` upload to GitHub Actions artifact |

### 14.2 PR Comment

**Phase 1+ Required**:

| element | 内容 |
|---|---|---|
| Summary comment | Finding count / risk summary / readiness status |
| Markdown format | GitHub markdown |
| Bot account | GitHub App or bot token |
| Update existing | Update existing comment on re-run |

### 14.3 GitHub Checks

**Phase 1+ Required**:

| element | 内容 |
|---|---|---|
| Check run | Create Check run with status/conclusion |
| Annotation | Finding per-file annotation |
| Summary | Overall summary |
| Details URL | Link to artifact / report |

### 14.4 SARIF Export

**Phase 1+ Required**:

| element | 内容 |
|---|---|---|
| SARIF version | SARIF v2.1.0 |
| Rules section | ruleId / description / severity |
| Results section | finding per-location |
| Upload | GitHub code scanning upload |

### 14.5 Exit Code Policy

**Phase 1+ Required**:

| policy | exit code behavior |
|---|---|
| `fail-on-critical` | exit code 1 on any critical finding |
| `fail-on-high` | exit code 1 on any high finding |
| `warn-only` | exit code 0 always, status in artifact |
| `baseline` | exit code 1 only on new findings |

### 14.6 Baseline Mode

**Phase 2+**:

| element | 内容 |
|---|---|
| Baseline artifact | Previous `.qh/release-readiness.json` |
| New findings | Findings not in baseline |
| Resolved findings | Findings in baseline but not current |
| Regression | New finding of same ruleId |

---

## 15. Plugin Security 要求

### 15.1 Plugin Types

| type | Phase | 内容 |
|---|:---:|---|
| Language adapter | Phase 1+ | TS/JS AST, text fallback, Python (Phase 3) |
| Rule plugin | Phase 2+ | Core rules, private rules, community rules |
| Importer | Phase 1+ | ESLint, Semgrep, TypeScript, coverage |
| Reporter | Phase 1+ | SARIF, HTML, Markdown |
| Downstream exporter | Phase 1+ | Gatefield, State Gate, manual-bb, workflow |

### 15.2 Plugin Manifest

**Phase 2+ Required**:

```yaml
apiVersion: ctg/v1alpha1
kind: rule-plugin
name: private-order-rules
version: 0.1.0
visibility: private
entry:
  command: ["node", "./dist/index.js"]
capabilities:
  - evaluate
receives:
  - normalized-repo-graph@v1
returns:
  - findings@v1
security:
  network: false
  filesystem:
    read:
      - "${repoRoot}"
    write:
      - "${workDir}/plugin-output"
  secrets:
    allow: []
```

### 15.3 Plugin Execution

**Phase 2+**:

| mechanism | 内容 |
|---|---|
| Child process | Plugin は core process と別 process |
| stdin/stdout JSON | Communication via JSON |
| Timeout | Per-plugin timeout (default 60s) |
| Schema validation | Plugin output validated before adoption |

**Phase 3+**:
- OS sandbox (Docker container or sandbox)
- Network deny by default
- Signed plugin manifest
- Plugin provenance

### 15.4 Plugin Failure Handling

| failure | handling |
|---|---|
| Manifest invalid | Plugin load failed, exit code 6 |
| Plugin timeout | Retry (1x), then PLUGIN_FAILED |
| Output schema invalid | Invalid output isolated, exit code 7 or 6 |
| Secret leak pattern | Output rejected, needs_review |
| Network attempt | Policy-based fail or warning |

---

## 16. Performance / Scalability 要求

### 16.1 Performance Targets

| target | Phase 1 | Phase 2 | Phase 3 |
|---|---|---|---|
| Small repo (100-500 files) scan | <= 30s | <= 20s | <= 15s |
| Medium repo (500-2000 files) scan | <= 60s | <= 45s | <= 30s |
| Large repo (2000-5000 files) scan | N/A | <= 180s | <= 120s |
| Analyze (small, no LLM) | <= 15s | <= 10s | <= 8s |
| Analyze (small, remote LLM) | <= 60s | <= 45s | <= 30s |
| Schema validation | <= 5s | <= 3s | <= 2s |

注: LLM remote latency は別計測。

### 16.2 Scalability Mechanisms

| mechanism | Phase | 内容 |
|---|:---:|---|
| Parallel file parse | Phase 1+ | Multi-thread file parsing |
| Incremental cache | Phase 2+ | Cache previous graph/findings |
| Diff-only scan | Phase 1+ | Changed files + blast radius only |
| Stream processing | Phase 3+ | Large file streaming |
| Memory limits | Phase 2+ | Configurable memory limit |

---

## 17. Usability / Documentation 要求

### 17.1 Installation

**Phase 1+**:

| method | 内容 |
|---|---|
| npm | `npm install -g @code-to-gate/cli` |
| Binary | Pre-built binary for Windows/macOS/Linux |
| Docker | `docker run code-to-gate/cli` |

### 17.2 Quickstart

**Phase 1+ Required**:

| step | 内容 |
|---|---|
| 1 | Install |
| 2 | `code-to-gate scan ./my-repo` |
| 3 | Review `.qh/repo-graph.json` |
| 4 | `code-to-gate analyze ./my-repo --emit all` |
| 5 | Review `.qh/release-readiness.json` |

### 17.3 Documentation

**Phase 1+ Required**:

| doc | 内容 |
|---|---|
| README | Scope, non-goals, quickstart, license |
| Product requirements | 本書 |
| Product specification | `docs/product-spec-v1.md` |
| Product acceptance | `docs/product-acceptance-v1.md` |
| CLI reference | `docs/cli-reference.md` |
| Configuration guide | `docs/config-guide.md` |
| Policy guide | `docs/policy-guide.md` |
| Plugin guide | `docs/plugin-guide.md` |
| Troubleshooting | `docs/troubleshooting.md` |

### 17.4 Examples

**Phase 1+ Required**:

| example | 内容 |
|---|---|
| Basic scan | Simple repo scan example |
| PR analysis | PR diff analysis example |
| CI integration | GitHub Actions workflow example |
| Policy config | Policy file example |
| Suppression | Suppression file example |
| Plugin | Custom plugin example |

### 17.5 Error Messages

**Phase 1+ Required**:

| type | 内容 |
|---|---|
| Human-readable | Clear error message for human |
| Machine-readable | JSON error object for CI |
| Code reference | Error code for documentation lookup |
| Suggestion | Actionable suggestion when possible |

---

## 18. Observability / Audit 要求

### 18.1 Audit Artifact

**Phase 1+ Required**:

| field | 内容 |
|---|---|
| Version | `ctg/v1alpha1` |
| Generated at | ISO 8601 timestamp |
| Run ID | Unique run identifier |
| Repo ref | Root, revision, branch |
| Tool ref | Name, version, config hash, policy ID |
| Plugin versions | Plugin name, version, visibility |
| LLM info | Provider, model, hashes, redaction |
| Policy | Policy ID, hash |
| Exit | Exit code, status, reason |

### 18.2 Reproducibility

**Phase 1+ Required**:

| condition | 内容 |
|---|---|
| Same commit | Same repo revision produces same artifact hash |
| Same policy | Same policy produces same readiness status |
| Same plugin | Same plugin versions produce same findings |
| Deterministic mode | No LLM = fully deterministic |

### 18.3 Observability

**Phase 2+**:

| element | 内容 |
|---|---|
| Progress log | Scan/analyze progress logging |
| Timing metrics | Per-phase timing metrics |
| Error tracking | Error count by type |
| Cache hit rate | Incremental cache effectiveness |

---

## 19. Compatibility / Versioning 要求

### 19.1 Schema Versioning

| version | 内容 |
|---|---|
| `ctg/v1alpha1` | Current (Phase 1-2) |
| `ctg/v1alpha2` | Breaking change (Phase 2+) |
| `ctg/v1` | Stable (Phase 3+) |

**Breaking change definition**:
- Field deletion
- Type change
- Enum value meaning change
- Required field addition

**Non-breaking change**:
- Field addition
- Optional field addition
- Enum value addition

### 19.2 CLI Versioning

| version | compatibility |
|---|---|
| v0.1.x | v0.1 MVP features |
| v0.2.x | Phase 1 features |
| v0.3.x | Phase 2 features |
| v1.0.x | Phase 3 features |

SemVer: MAJOR.MINOR.PATCH

### 19.3 Downstream Compatibility

| adapter | Phase | Schema version |
|---|:---:|---|
| Gatefield | Phase 1+ | `ctg.gatefield/v1alpha1` |
| State Gate | Phase 1+ | `ctg.state-gate/v1alpha1` |
| Manual-bb | Phase 1+ | `ctg.manual-bb/v1alpha1` |
| Workflow evidence | Phase 1+ | `ctg.workflow-evidence/v1alpha1` |

Adapter schema breaking change は adapter version を上げる。

---

## 20. Release / Maintenance / Support Policy

### 20.1 Release Policy

| release type | frequency | 内容 |
|---|---|---|
| Major | Yearly | Breaking changes |
| Minor | Monthly | New features |
| Patch | Weekly | Bug fixes |
| Pre-release | As needed | Alpha/Beta |

### 20.2 Maintenance Policy

| phase | support | 内容 |
|---|---|---|
| v1.0.x | 12 months | Bug fixes, security patches |
| v0.x | 6 months | Bug fixes only |

### 20.3 Support Channels

| channel | Phase | 内容 |
|---|:---:|---|
| GitHub Issues | Phase 1+ | Bug reports, feature requests |
| GitHub Discussions | Phase 2+ | Questions, discussions |
| Discord/Slack | Phase 3+ | Community chat |

### 20.4 Security Policy

| element | 内容 |
|---|---|
| Security issue | Report via GitHub Security Advisory |
| Response time | 48 hours initial response |
| Fix time | Critical: 7 days, High: 14 days |
| Disclosure | Coordinated disclosure |

---

## 21. Product-level Acceptance Criteria

### 21.1 α Acceptance

| criterion | acceptance |
|---|---|---|
| Real repo動作 | 3+ public repo で scan/analyze/readiness 動作 |
| GitHub Actions | PR comment / Checks / exit code 動作 |
| FP rate | <= 15% (human review) |
| Detection rate | >= 80% (seeded) |
| Documentation | README + quickstart + CLI reference |
| Performance | Small repo <= 30s scan |

### 21.2 β Acceptance

| criterion | acceptance |
|---|---|---|
| Real repo動作 | 5+ public repo + monorepo 動作 |
| Plugin SDK | Plugin作成・実行動作 |
| Contract tests | Downstream 4 adapter schema validation CI |
| FP rate | <= 10% |
| Detection rate | >= 90% |
| Suppression | Expiry + audit動作 |
| Performance | Medium repo <= 45s scan |

### 21.3 v1.0 Acceptance

| criterion | acceptance |
|---|---|---|
| Real repo動作 | 10+ public repo + large repo動作 |
| Stable schema | No breaking change for 6 months |
| Plugin ecosystem | 3+ public plugins |
| FP rate | <= 5% |
| Detection rate | >= 95% |
| Web viewer | Artifact viewer動作 |
| Adoption | 100+ GitHub stars |

詳細は `docs/product-acceptance-v1.md`。

---

## 22. Risks

| id | priority | risk | mitigation |
|---|---:|---|---|
| RISK-01 | P1 | AST parser accuracy 不足 | text fallback + evidence validation |
| RISK-02 | P1 | False positive 多発 | FP evaluation + suppression mechanism |
| RISK-03 | P2 | LLM provider 変更・停止 | Provider fallback + local-only mode |
| RISK-04 | P2 | Downstream schema 変更 | Adapter versioning + contract tests |
| RISK-05 | P2 | Plugin sandbox 実装複雑 | Phase 3 で段階実装 |
| RISK-06 | P3 | Large repo 性能不足 | Incremental cache + parallel parse |
| RISK-07 | P3 | OSS adoption 低 | Documentation + examples + community |

---

## 23. Open Questions

### 23.1 Product-level GO Blockers

なし。現時点でプロダクトレベル要件定義の blocker なし。

### 23.2 Follow-up Questions (Phase 1-2)

| id | question | phase |
|---|---|---|
| Q-01 | AST parser ライブラリ選択 | Phase 1 |
| Q-02 | GitHub App vs Bot token for PR comment | Phase 1 |
| Q-03 | FP evaluation 方法 (human review vs automated) | Phase 2 |
| Q-04 | Plugin sandbox 実装方式 (Docker vs OS sandbox) | Phase 3 |
| Q-05 | Web viewer 技術選択 | Phase 3 |

---

## 24. Next Actions

| id | action | owner | phase |
|---|---|---|---|
| NA-01 | `docs/product-spec-v1.md` 作成 | Spec writer | Immediate |
| NA-02 | `docs/product-acceptance-v1.md` 作成 | QA | Immediate |
| NA-03 | `docs/product-gap-analysis.md` 作成 | Analyst | Immediate |
| NA-04 | `docs/product-roadmap.md` 作成 | PM | Immediate |
| NA-05 | AST parser ライブラリ評価 | Dev | Phase 1 prep |
| NA-06 | Public repo evaluation list 作成 | QA | Phase 1 prep |
| NA-07 | GitHub Actions template 作成 | Dev | Phase 1 prep |