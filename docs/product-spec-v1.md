# code-to-gate Product Specification v1.0

**バージョン**: v1.0  
**作成日**: 2026-04-30  
**対象**: OSS alpha / beta / v1.0 product level  
**位置づけ**: 本書はプロダクトレベル仕様書。v0.1 MVP 仕様書は `docs/artifact-contracts.md` 等を参照。

---

## 1. Scope

本書は code-to-gate プロダクトレベル実装仕様を定義する。

対象:
- CLI コマンド仕様
- Config / Policy file 仕様
- Artifact lifecycle
- Scanner / Parser / Rule engine architecture
- LLM trust layer
- Plugin runtime
- GitHub 連携
- Error handling
- Schema compatibility
- Test strategy

---

## 2. Non-goals

- v0.1 MVP 仕様の再定義 (`docs/artifact-contracts.md` 等を参照)
- 実装コード詳細
- company-specific rule
- AI agent gate engine
- agent approval/freshness
- manual BB test case design
- workflow governance

---

## 3. CLI コマンド仕様

### 3.1 共通オプション

すべてのコマンドで共通するオプション。

| option | type | default | 内容 |
|---|---|---|---|
| `--out` | string | `.qh` | 出力ディレクトリ |
| `--format` | string | `json` | 出力形式 (`json`, `yaml`, `md`, `mermaid`, `sarif`, `html`) |
| `--emit` | string | `all` | 出力 artifact (`all`, `findings`, `risks`, `seeds`, `readiness`, `audit`) |
| `--policy` | string | - | Policy file path |
| `--config` | string | `ctg.config.yaml` | Config file path |
| `--plugin` | string[] | - | Plugin paths |
| `--llm-mode` | string | `remote` | LLM mode (`remote`, `local-only`, `none`) |
| `--require-llm` | boolean | false | LLM 必須モード |
| `--log-level` | string | `info` | Log level (`debug`, `info`, `warn`, `error`) |
| `--quiet` | boolean | false | Suppress stdout (only JSON output) |
| `--debug-llm-trace` | boolean | false | Save LLM raw trace |
| `--help` | boolean | false | Show help |
| `--version` | boolean | false | Show version |

### 3.2 `scan`

**目的**: Repo graph 生成。

**Usage**:
```
code-to-gate scan <repo-path> [--out <dir>] [--format <fmt>] [--config <path>]
```

**Arguments**:
| argument | required | 内容 |
|---|:---:|---|
| `<repo-path>` | Yes | Repo root path |

**Options**:
| option | type | default | 内容 |
|---|---|---|---|
| `--languages` | string[] | `ts,js` | Target languages |
| `--exclude` | string[] | `node_modules/,*.test.*` | Exclude patterns |
| `--include-generated` | boolean | false | Include generated files |

**Outputs**:
| artifact | path | 内容 |
|---|---|---|
| Repo graph | `.qh/repo-graph.json` | NormalizedRepoGraph |
| Dependency graph | `.qh/dependency.mmd` | Mermaid diagram |

**Exit codes**:
| code | condition |
|---:|---|
| 0 | Schema validation pass |
| 3 | Parser fatal failure |
| 7 | Schema validation fail |

**Example**:
```bash
code-to-gate scan ./my-repo --out .qh --languages ts,js --exclude node_modules/
```

### 3.3 `analyze`

**目的**: Full analysis (scan + rules + LLM + readiness)。

**Usage**:
```
code-to-gate analyze <repo-path> [--out <dir>] [--emit <artifacts>] [--policy <path>] [--require-llm]
```

**Arguments**:
| argument | required | 内容 |
|---|:---:|---|
| `<repo-path>` | Yes | Repo root path |

**Outputs**:
| artifact | path | 内容 |
|---|---|---|
| Findings | `.qh/findings.json` | FindingsArtifact |
| Risk register | `.qh/risk-register.yaml` | RiskRegisterArtifact |
| Invariants | `.qh/invariants.yaml` | InvariantsArtifact |
| Test seeds | `.qh/test-seeds.json` | TestSeedsArtifact |
| Release readiness | `.qh/release-readiness.json` | ReleaseReadinessArtifact |
| Analysis report | `.qh/analysis-report.md` | Human-readable report |
| Audit | `.qh/audit.json` | AuditArtifact |

**Exit codes**:
| code | condition |
|---:|---|
| 0 | readiness status = `passed` or `passed_with_risk` |
| 1 | readiness status = `needs_review` or `blocked_input` |
| 4 | LLM required and failed |
| 7 | Schema validation fail |

**Example**:
```bash
code-to-gate analyze ./my-repo --emit all --policy ./policy.yaml --require-llm
```

### 3.4 `diff`

**目的**: PR / changed files analysis。

**Usage**:
```
code-to-gate diff <repo-path> --base <ref> --head <ref> [--out <dir>]
```

**Arguments**:
| argument | required | 内容 |
|---|:---:|---|
| `<repo-path>` | Yes | Repo root path |
| `--base` | Yes | Base ref (branch, commit, tag) |
| `--head` | Yes | Head ref (branch, commit, tag) |

**Outputs**:
| artifact | path | 内容 |
|---|---|---|
| Diff analysis | `.qh/diff-analysis.json` | Diff artifact with changed files / blast radius |
| Findings (diff only) | `.qh/findings.json` | Findings on changed files |
| Blast radius | `.qh/blast-radius.mmd` | Mermaid diagram |

**Exit codes**:
| code | condition |
|---:|---|
| 0 | Diff resolved, findings generated |
| 2 | Base ref not found |
| 3 | Parser fatal failure |

**Example**:
```bash
code-to-gate diff ./my-repo --base main --head feature-branch
```

### 3.5 `import`

**目的**: External tool result import。

**Usage**:
```
code-to-gate import <tool> <input-file> [--out <dir>]
```

**Arguments**:
| argument | required | 内容 |
|---|:---:|---|
| `<tool>` | Yes | Tool name (`eslint`, `semgrep`, `tsc`, `coverage`, `test`) |
| `<input-file>` | Yes | Input file path |

**Outputs**:
| artifact | path | 内容 |
|---|---|---|
| Imported findings | `.qh/imports/<tool>-findings.json` | Normalized findings |

**Exit codes**:
| code | condition |
|---:|---|
| 0 | Import success |
| 8 | Import failure (parse error, file not found) |

**Example**:
```bash
code-to-gate import semgrep ./semgrep.json --out .qh/imports
```

### 3.6 `readiness`

**目的**: Release readiness evaluation。

**Usage**:
```
code-to-gate readiness <repo-path> [--policy <path>] [--from <artifact-dir>] [--out <dir>]
```

**Arguments**:
| argument | required | 内容 |
|---|:---:|---|
| `<repo-path>` | Yes | Repo root path |
| `--policy` | Yes (for evaluation) | Policy file path |
| `--from` | No | Existing artifact directory |

**Outputs**:
| artifact | path | 内容 |
|---|---|---|
| Release readiness | `.qh/release-readiness.json` | ReleaseReadinessArtifact |

**Exit codes**:
| code | condition |
|---:|---|
| 0 | status = `passed` or `passed_with_risk` |
| 1 | status = `needs_review` or `blocked_input` |
| 5 | Policy invalid |

**Example**:
```bash
code-to-gate readiness ./my-repo --policy ./policy.yaml
```

### 3.7 `export`

**目的**: Downstream adapter export。

**Usage**:
```
code-to-gate export <target> [--from <artifact-dir>] [--out <file>]
```

**Arguments**:
| argument | required | 内容 |
|---|:---:|---|
| `<target>` | Yes | Export target (`gatefield`, `state-gate`, `manual-bb`, `workflow-evidence`, `sarif`) |
| `--from` | Yes | Artifact directory |

**Outputs**:
| target | path | 内容 |
|---|---|---|
| `gatefield` | `.qh/gatefield-static-result.json` | GatefieldStaticResult |
| `state-gate` | `.qh/state-gate-evidence.json` | StateGateEvidence |
| `manual-bb` | `.qh/manual-bb-seed.json` | ManualBbSeed |
| `workflow-evidence` | `.qh/workflow-evidence.json` | WorkflowEvidence |
| `sarif` | `.qh/results.sarif` | SARIF v2.1.0 |

**Exit codes**:
| code | condition |
|---:|---|
| 0 | Export success |
| 2 | Core artifact not found |
| 9 | Adapter schema validation fail |

**Example**:
```bash
code-to-gate export gatefield --from .qh --out .qh/gatefield-static-result.json
```

### 3.8 `plugin`

**目的**: Plugin management。

**Usage**:
```
code-to-gate plugin <action> [--plugin <path>]
```

**Actions**:
| action | 内容 |
|---|---|
| `list` | List loaded plugins |
| `doctor` | Plugin health check |
| `validate <path>` | Validate plugin manifest |

**Example**:
```bash
code-to-gate plugin doctor
code-to-gate plugin validate ./my-plugin
```

### 3.9 `schema`

**目的**: Schema validation。

**Usage**:
```
code-to-gate schema validate <artifact-file>
```

**Arguments**:
| argument | required | 内容 |
|---|:---:|---|
| `<artifact-file>` | Yes | Artifact file to validate |

**Exit codes**:
| code | condition |
|---:|---|
| 0 | Validation pass |
| 7 | Validation fail |

**Example**:
```bash
code-to-gate schema validate .qh/findings.json
```

### 3.10 `fixture`

**目的**: Fixture test execution。

**Usage**:
```
code-to-gate fixture run <fixture-name> [--out <dir>]
```

**Arguments**:
| argument | required | 内容 |
|---|:---:|---|
| `<fixture-name>` | Yes | Fixture name (`demo-shop-ts`, `demo-auth-js`, etc.) |

**Example**:
```bash
code-to-gate fixture run demo-shop-ts
```

---

## 4. Config File 仕様

### 4.1 Config File Location

| location | priority |
|---|---:|
| CLI `--config` option | 1 (highest) |
| `ctg.config.yaml` in repo root | 2 |
| `ctg.config.json` in repo root | 3 |
| `~/.ctg/config.yaml` (global) | 4 (lowest) |

### 4.2 Config File Structure

```yaml
version: ctg/v1alpha1

# Target languages
languages:
  - ts
  - js
  # - py (Phase 3)

# File handling
exclude:
  - node_modules/
  - dist/
  - build/
  - "*.test.*"
  - "*.spec.*"
  - "*.generated.*"

include_generated: false
include_vendored: false

# Parser settings
parser:
  ts:
    adapter: ast
    fallback: text
  js:
    adapter: ast
    fallback: text
  py:
    adapter: ast
    fallback: text

# LLM settings
llm:
  mode: remote
  provider: openai
  model: gpt-4.1
  api_key_env: OPENAI_API_KEY
  timeout: 60
  retry: 3
  min_confidence: 0.6
  redaction:
    enabled: true
    patterns:
      - api_key
      - token
      - password
      - secret

# Plugin settings
plugins:
  - name: "@code-to-gate/lang-ts"
    enabled: true
  - name: "@code-to-gate/rules-core"
    enabled: true
  - name: "file:../private-rules"
    enabled: true
    visibility: private

# Performance settings
performance:
  parallel: true
  max_workers: 4
  cache_enabled: true
  cache_dir: .qh/cache

# Output settings
output:
  default_out: .qh
  formats:
    - json
    - yaml
  compress: false

# GitHub settings
github:
  enabled: true
  token_env: GITHUB_TOKEN
  app_id_env: GITHUB_APP_ID
  app_key_env: GITHUB_APP_KEY
  pr_comment_enabled: true
  checks_enabled: true
```

---

## 5. Policy File 仕様

### 5.1 Policy File Location

CLI `--policy` option で指定。複数 policy の merge は未サポート (Phase 2+)。

### 5.2 Policy File Structure

```yaml
version: ctg/v1alpha1

policy_id: my-project-release-policy

# Blocking thresholds
blocking:
  severity:
    critical: true
    high: true
    medium: false
    low: false
  
  category:
    auth: true
    payment: true
    validation: true
    data: false
    config: false
    maintainability: false
    testing: false
  
  count_threshold:
    critical_max: 0
    high_max: 5
    medium_max: 20

# Confidence thresholds
confidence:
  min_confidence: 0.6
  low_confidence_threshold: 0.4
  filter_low: true

# Suppression
suppression:
  file: .ctg/suppressions.yaml
  expiry_warning_days: 30
  max_suppressions_per_rule: 10

# LLM policy
llm:
  enabled: true
  mode: remote
  min_confidence: 0.6
  require_llm: false
  unsupported_claims_max: 10

# Partial handling
partial:
  allow_partial: false
  partial_warning_threshold: 0.2

# Baseline (Phase 2+)
baseline:
  enabled: false
  file: .qh/baseline-readiness.json
  new_findings_block: true

# Exit code policy
exit:
  fail_on_critical: true
  fail_on_high: true
  warn_only: false
```

### 5.3 Suppression File Structure

```yaml
version: ctg/v1alpha1

suppressions:
  - rule_id: CLIENT_TRUSTED_PRICE
    path: "src/api/order/legacy-*.ts"
    reason: "Legacy code, migration planned"
    expiry: "2026-06-30"
    author: "tech-lead"
  
  - rule_id: WEAK_AUTH_GUARD
    path: "src/routes/public.ts"
    reason: "Public route, no auth required"
    expiry: "2027-01-01"
```

---

## 6. Artifact Lifecycle

### 6.1 Artifact Generation Order

```
scan
  ├─ repo-graph.json (NormalizedRepoGraph)
  └─ dependency.mmd

analyze
  ├─ repo-graph.json (from scan)
  ├─ findings.json (FindingsArtifact)
  ├─ risk-register.yaml (RiskRegisterArtifact)
  ├─ invariants.yaml (InvariantsArtifact)
  ├─ test-seeds.json (TestSeedsArtifact)
  ├─ release-readiness.json (ReleaseReadinessArtifact)
  ├─ analysis-report.md
  └─ audit.json (AuditArtifact)

diff
  ├─ diff-analysis.json
  ├─ findings.json (diff only)
  └─ blast-radius.mmd

export
  ├─ gatefield-static-result.json
  ├─ state-gate-evidence.json
  ├─ manual-bb-seed.json
  ├─ workflow-evidence.json
  └─ results.sarif
```

### 6.2 Artifact Dependencies

```
findings.json
  └─ repo-graph.json

risk-register.yaml
  └─ findings.json

invariants.yaml
  └─ findings.json

test-seeds.json
  └─ risk-register.yaml
  └─ findings.json

release-readiness.json
  └─ findings.json
  └─ risk-register.yaml
  └─ test-seeds.json

audit.json
  └─ (all artifacts)
```

### 6.3 Artifact Completeness

| completeness | 内容 |
|---|---|
| `complete` | All expected fields populated |
| `partial` | Some fields missing, diagnostics present |

Partial inheritance:
- `repo-graph.completeness=partial` → all downstream artifacts inherit `partial`
- `findings.completeness=partial` → risk-register, test-seeds inherit `partial`

### 6.4 Artifact Hash

各 artifact の SHA-256 hash を audit に記録。

```
artifact_hash = SHA-256(artifact_json_bytes)
```

同一 commit/policy/plugin/model で同一 hash (deterministic)。

---

## 7. Scanner Architecture

### 7.1 Scanner Components

```
Scanner
  ├─ RepoWalker
  │   ├─ FileSystemReader
  │   ├─ LanguageDetector
  │   └─ ExcludeFilter
  │
  ├─ ParserPool
  │   ├─ TsAstParser
  │   ├─ JsAstParser
  │   ├─ PyAstParser (Phase 3)
  │   └─ TextFallbackParser
  │
  ├─ GraphBuilder
  │   ├─ SymbolExtractor
  │   ├─ RelationExtractor
  │   ├─ TestExtractor
  │   ├─ EntrypointExtractor
  │   └─ ConfigExtractor
  │
  └─ DiagnosticCollector
```

### 7.2 RepoWalker

**責務**:
- File system walk
- Language detection
- Exclude/include filter
- File metadata (hash, size, line count)

**Output**: `files[]` in NormalizedRepoGraph

**Phase 1+**:
- Parallel walk
- Large file skip
- Encoding detection

### 7.3 ParserPool

**責務**:
- Language-specific AST parsing
- Text fallback parsing
- Parser result normalization

**Output**: `files[].parser` in NormalizedRepoGraph

**Phase 1**:
- TS/JS AST parser (TypeScript compiler API or Babel)
- Text fallback regex parser

**Phase 3**:
- Python AST parser (tree-sitter or Python AST)

### 7.4 GraphBuilder

**責務**:
- Symbol extraction (function, class, method, variable, type, interface)
- Relation extraction (imports, exports, calls, references)
- Test file detection and relation
- Entrypoint detection
- Config file detection

**Output**: `symbols[]`, `relations[]`, `tests[]`, `entrypoints[]`, `configs[]` in NormalizedRepoGraph

**Phase 1**:
- Import/export extraction
- Test file pattern detection
- Entrypoint pattern detection

**Phase 2+**:
- Call graph extraction
- Dataflow-lite

---

## 8. Parser / Adapter Architecture

### 8.1 TS/JS AST Parser

**Phase 1 Required**:

| extraction | pattern |
|---|---|
| Import | `import { ... } from ...`, `import ... from ...`, `require(...)`, `import(...)` |
| Export | `export ...`, `export default ...`, `export * from ...` |
| Function | `function ...`, `const ... = () =>`, `async function ...` |
| Class | `class ...`, methods, properties |
| Interface | `interface ...` |
| Type | `type ... =` |
| Variable | `const ...`, `let ...`, `var ...` |

**Entrypoint Detection**:
| pattern | detection |
|---|---|
| Express | `app.listen(...)`, `router.*(...)` |
| Fastify | `fastify.listen(...)`, `fastify.route(...)` |
| NestJS | `@Controller`, `@Get`, `@Post` |
| Serverless | Handler export pattern |

**Test Detection**:
| pattern | detection |
|---|---|
| Jest/Vitest | `*.test.ts`, `*.spec.ts`, `describe`, `test`, `it` |
| Mocha | `*.test.js`, `describe`, `it` |

### 8.2 Text Fallback Parser

**Pattern-based extraction**:

```yaml
patterns:
  import:
    - "import\\s+.*\\s+from\\s+['\"](.*)['\"]"
    - "require\\s*\\(['\"](.*)['\"]\\)"
  
  export:
    - "export\\s+(function|class|const|let|var)\\s+(\\w+)"
    - "export\\s+default\\s+"
  
  route:
    - "router\\.get\\s*\\(['\"](.*)['\"]"
    - "router\\.post\\s*\\(['\"](.*)['\"]"
    - "app\\.listen\\s*\\("
```

**Evidence**:
- `kind=text`
- `excerptHash` required (SHA-256 of matched excerpt)

### 8.3 Parser Failure Handling

```
file.parser.status:
  ├─ parsed: AST parse success
  ├─ text_fallback: AST failed, text fallback used
  ├─ skipped: Excluded or unsupported language
  └─ failed: Both AST and text fallback failed
```

Diagnostic:
- `PARSER_FAILED`: Parse error details
- `UNSUPPORTED_LANGUAGE`: Language not supported
- `PARTIAL_GRAPH`: Some files failed

---

## 9. Rule Engine Architecture

### 9.1 Rule Engine Components

```
RuleEngine
  ├─ RuleRegistry
  │   ├─ CoreRulesPack
  │   ├─ PrivateRulesPack (Plugin)
  │   └─ CommunityRulesPack (Plugin)
  │
  ├─ RuleEvaluator
  │   ├─ PatternMatcher
  │   ├─ GraphAnalyzer
  │   ├─ DataflowAnalyzer (Phase 2+)
  │   └─ ConfidenceCalculator
  │
  ├─ EvidenceValidator
  │   ├─ PathValidator
  │   ├─ LineRangeValidator
  │   ├─ ExcerptHashValidator
  │   └─ SymbolValidator (Phase 2+)
  │
  ├─ FindingAggregator
  │   ├─ Deduplication
  │   ├─ Merge
  │   └─ SeverityMapping
  │
  └─ SuppressionManager
      ├─ SuppressionLoader
      ├─ ExpiryChecker
      └─ SuppressionAudit
```

### 9.2 Rule Definition

```yaml
rule_id: CLIENT_TRUSTED_PRICE
category: payment
severity: critical
title: Client-supplied price used directly
summary: Price or total from client request is used without server validation.

patterns:
  - type: ast
    match:
      kind: property_access
      chain:
        - "req.body"
        - "price|total|amount"
  
  - type: graph
    match:
      symbol:
        kind: function
        name_pattern: "createOrder|processPayment"
      relation:
        kind: calls
        to:
          category: payment

confidence_factors:
  ast_match: 0.8
  graph_match: 0.3
  evidence_count: +0.1 per evidence

tags:
  - payment
  - security
  - owasp-a01

description: |
  Long description for documentation.

recommendations:
  - Validate price on server side
  - Use server-side price lookup
  - Add negative test for price tampering
```

### 9.3 Core Rules (Phase 1)

| rule_id | category | severity | detection |
|---|---|---|---|
| `CLIENT_TRUSTED_PRICE` | payment | critical | AST + graph |
| `MISSING_SERVER_VALIDATION` | validation | high | AST |
| `WEAK_AUTH_GUARD` | auth | high | AST + graph |
| `TRY_CATCH_SWALLOW` | maintainability | medium | AST |
| `RAW_SQL` | data | high | AST + text |
| `UNSAFE_DELETE` | data | high | AST |
| `UNTESTED_CRITICAL_PATH` | testing | medium | graph |
| `ENV_DIRECT_ACCESS` | config | medium | AST |
| `WRAPPER_ONLY_FUNCTION` | maintainability | low | AST |
| `LARGE_MODULE` | maintainability | low | metrics |
| `HIGH_FANOUT_CHANGE` | release-risk | medium | graph + diff |
| `PUBLIC_API_BEHAVIOR_CHANGE` | compatibility | high | graph + diff |

### 9.4 Rule Evaluation Flow

```
Input: NormalizedRepoGraph

For each file:
  For each rule:
    ├─ Pattern match check
    ├─ Graph relation check
    ├─ Generate candidate finding
    └─ Evidence extraction

Evidence validation:
  ├─ Path exists check
  ├─ Line range valid check
  ├─ Excerpt hash match (text)
  └─ Confidence calculation

Finding aggregation:
  ├─ Deduplicate by ruleId + path + symbol
  ├─ Merge evidence from multiple sources
  └─ Apply severity mapping

Suppression check:
  ├─ Load suppressions
  ├─ Match ruleId + path
  ├─ Check expiry
  └─ Apply or warn

Output: FindingsArtifact
```

### 9.5 Confidence Calculation

```
confidence = base_confidence + evidence_bonus - uncertainty_penalty

base_confidence:
  - AST match: 0.8
  - Graph match: 0.6
  - Text match: 0.5
  - External import: 0.7

evidence_bonus:
  - +0.1 per valid evidence (max +0.3)

uncertainty_penalty:
  - -0.2 for text fallback file
  - -0.1 for unsupported language
  - -0.1 for missing test coverage
```

---

## 10. Finding Lifecycle

### 10.1 Finding Generation

```
FindingCandidate (internal)
  ├─ ruleId
  ├─ candidate evidence
  ├─ confidence
  └─ source (AST/graph/text)

Evidence validation:
  ├─ Path validator
  ├─ Line range validator
  ├─ Excerpt hash validator (text)
  └─ Generate EvidenceRef

Finding (final)
  ├─ id: generated (UUID or hash-based)
  ├─ ruleId
  ├─ category
  ├─ severity
  ├─ confidence (validated)
  ├─ title
  ├─ summary
  ├─ evidence[] (validated)
  ├─ affectedSymbols[]
  ├─ affectedEntrypoints[]
  ├─ tags[]
  └─ upstream (if external)
```

### 10.2 Finding Deduplication

Deduplication key: `ruleId + path + startLine + symbolId`

- Same key → merge evidence, max confidence
- Different path/symbol → separate finding

### 10.3 Finding Merge

Multiple sources for same finding:
- AST + graph → merge evidence
- External + native → keep both with upstream reference

---

## 11. Evidence Validator

### 11.1 Evidence Validator Components

```
EvidenceValidator
  ├─ PathValidator
  │   ├─ File existence check
  │   └─ Path normalization
  │
  ├─ LineRangeValidator
  │   ├─ Line count check
  │   ├─ Start/end line valid
  │   └─ Line adjustment (if needed)
  │
  ├─ ExcerptHashValidator
  │   ├─ Text excerpt extraction
  │   ├─ SHA-256 hash calculation
  │   └─ Hash match check
  │
  ├─ SymbolValidator (Phase 2+)
  │   ├─ Symbol existence in repo-graph
  │   └─ SymbolId match
  │
  └─ ExternalRefValidator
  │   ├─ Tool name valid
  │   └─ RuleId format valid
```

### 11.2 Validation Rules

| evidence.kind | validation |
|---|---|
| `ast` | Path exists, nodeId/symbolId valid |
| `text` | Path exists, line range valid, excerptHash matches |
| `import` | Path exists, relation exists in repo-graph |
| `external` | externalRef.tool valid, path exists |
| `test` | Path exists, test relation exists |
| `coverage` | Coverage data valid |
| `diff` | Path exists in changed files |

### 11.3 Validation Failure Handling

| failure | handling |
|---|---|
| Path not found | Diagnostic + evidence dropped |
| Line range invalid | Diagnostic + line adjustment |
| Excerpt hash mismatch | Diagnostic + regenerate hash |
| Symbol not found | Diagnostic (Phase 2+) |

---

## 12. Suppression Model

### 12.1 Suppression File Location

| location | 内容 |
|---|---|
| `.ctg/suppressions.yaml` | Repo local suppressions |
| Policy `suppression.file` | Policy-specified suppressions |

### 12.2 Suppression Matching

```
suppression applies if:
  rule_id matches
  AND path matches (glob pattern)
  AND expiry not passed (if specified)
```

### 12.3 Suppression Effects

| effect | 内容 |
|---|---|
| Finding not in findings.json | Suppressed finding excluded |
| Finding in suppressed section | Alternative: add `suppressed` field |
| Audit record | Suppression recorded in audit |

### 12.4 Expiry Handling

```
if expiry set:
  if now > expiry:
    ├─ Suppression invalid
    ├─ Warning in diagnostics
    └─ Finding included

  elif now + 30 days > expiry:
    ├─ Warning: suppression expiring soon
```

---

## 13. Baseline / Diff / Regression Model

### 13.1 Baseline Artifact

Phase 2+:

```yaml
baseline:
  enabled: true
  file: .qh/baseline-readiness.json
  new_findings_block: true
```

Baseline comparison:
- New findings: Not in baseline → potential block
- Resolved findings: In baseline, not current → info
- Unchanged findings: In both → warn if suppressed

### 13.2 Diff Mode

```
diff-analysis.json:
  ├─ changed_files[]
  ├─ added_files[]
  ├─ deleted_files[]
  ├─ modified_files[]
  │   ├─ path
  │   ├─ additions (lines)
  │   ├─ deletions (lines)
  │   └─ hunks[]
  ├─ blast_radius[]
  │   ├─ affected_files[]
  │   ├─ affected_symbols[]
  │   ├─ affected_tests[]
  │   └─ affected_entrypoints[]
  └─ diff_findings[]
      ├─ new_findings[]
      ├─ potentially_affected_findings[]
      └─ resolved_findings[] (if baseline)
```

### 13.3 Blast Radius Calculation

```
For each changed file:
  ├─ Find importers (files that import changed file)
  ├─ Find callers (symbols that call changed symbols)
  ├─ Find test relations
  └─ Find entrypoint relations

Transitive blast radius:
  ├─ Level 1: Direct importers
  ├─ Level 2: Transitive importers
  └─ Max depth configurable
```

### 13.4 Regression Detection

Phase 2+:

```
Regression = finding of same ruleId on same path
  AND in baseline suppressed/resolved
  AND in current not suppressed
```

---

## 14. External Importers

### 14.1 ESLint Importer

**Input**: ESLint formatter JSON output

```json
[
  {
    "filePath": "src/api/order.ts",
    "messages": [
      {
        "ruleId": "no-unused-vars",
        "severity": 2,
        "message": "'x' is defined but never used.",
        "line": 10,
        "column": 5
      }
    ]
  }
]
```

**Normalization**:
| ESLint field | code-to-gate field |
|---|---|
| `filePath` | `evidence.path` |
| `line` | `evidence.startLine` |
| `ruleId` | `upstream.ruleId` |
| `severity` | `severity` (2→high, 1→medium) |
| `message` | `summary` |

### 14.2 Semgrep Importer

**Input**: Semgrep JSON output

```json
{
  "results": [
    {
      "check_id": "security.security-test",
      "path": "src/auth.ts",
      "start": { "line": 10, "col": 5 },
      "end": { "line": 15, "col": 10 },
      "extra": { "message": "Security issue" }
    }
  ]
}
```

**Normalization**:
| Semgrep field | code-to-gate field |
|---|---|
| `path` | `evidence.path` |
| `start.line` | `evidence.startLine` |
| `end.line` | `evidence.endLine` |
| `check_id` | `upstream.ruleId` |
| `extra.message` | `summary` |

### 14.3 TypeScript Importer

**Input**: TypeScript diagnostics (tsc output or custom)

```json
[
  {
    "file": "src/types.ts",
    "code": 2322,
    "message": "Type 'string' is not assignable to type 'number'.",
    "start": { "line": 10, "character": 5 },
    "end": { "line": 10, "character": 15 }
  }
]
```

**Normalization**:
| TS field | code-to-gate field |
|---|---|
| `file` | `evidence.path` |
| `start.line` | `evidence.startLine` |
| `code` | `upstream.ruleId` (TSxxxx) |
| `message` | `summary` |

### 14.4 Coverage Importer

**Input**: Istanbul/nyc coverage summary

```json
{
  "coverageMap": {
    "src/api/order.ts": {
      "lines": { "total": 100, "covered": 80, "skipped": 0 },
      "functions": { "total": 10, "covered": 8 },
      "branches": { "total": 20, "covered": 15 }
    }
  }
}
```

**Normalization**:
- Coverage evidence per file
- Coverage gap finding for low coverage

---

## 15. LLM Trust Layer

### 15.1 LLM Components

```
LLMTrustLayer
  ├─ PromptBuilder
  │   ├─ SummaryPrompt
  │   ├─ RiskNarrativePrompt
  │   ├─ InvariantPrompt
  │   ├─ TestSeedPrompt
  │   └─ RecommendationPrompt
  │
  ├─ Redactor
  │   ├─ PatternRedactor
  │   ├─ FileRedactor
  │   └─ CustomRedactor
  │
  ├─ ProviderClient
  │   ├─ OpenAIClient
  │   ├─ AnthropicClient
  │   ├─ OllamaClient (Phase 2+)
  │   └─ LlamaCppClient (Phase 2+)
  │
  ├─ ResponseParser
  │   ├─ SchemaValidator
  │   ├─ RepairPrompt (if invalid)
  │   └─ UnsupportedClaimExtractor
  │
  └─ ConfidenceCalculator
      ├─ Model confidence (from response)
      ├─ Evidence binding check
      └─ Final confidence
```

### 15.2 LLM Prompt Contract

**Input to LLM**:
- Repo metadata (name, language, size)
- NormalizedRepoGraph summary (not full graph)
- Findings summary (not full details)
- Evidence excerpts (redacted)
- Policy summary

**Prohibited input**:
- Private secrets
- Raw `.env`
- Credential-like strings
- Configured redaction patterns
- Allowlist外の大容量 file body

### 15.3 LLM Output Schema

```ts
interface LlmSectionResult<T> {
  section: "summary" | "risk_narrative" | "invariants" | "test_seeds" | "recommendations";
  status: "ok" | "partial" | "failed";
  model: string;
  prompt_version: string;
  confidence: number;
  data?: T;
  errors?: CtgLlmError[];
  unsupported_claims: UnsupportedClaim[];
}
```

### 15.4 LLM Failure Handling

| failure | handling |
|---|---|
| Connection failed | Retry (3x), then fallback/needs_review |
| Timeout | Retry, then needs_review |
| Schema invalid | Repair prompt (1x), then unsupported_claims |
| Low confidence | Filter by policy threshold |
| Hallucination | Evidence validation, unsupported_claims |

---

## 16. Plugin Runtime Model

### 16.1 Plugin Lifecycle

```
PluginManager
  ├─ ManifestLoader
  │   ├─ Parse manifest YAML
  │   ├─ Validate schema
  │   └─ Check capabilities
  │
  ├─ ProcessLauncher
  │   ├─ Spawn child process
  │   ├─ Set timeout
  │   └─ Configure stdin/stdout
  │
  ├─ InputSerializer
  │   ├─ Serialize NormalizedRepoGraph
  │   └─ Serialize imported findings
  │
  ├─ OutputDeserializer
  │   ├─ Parse plugin output JSON
  │   ├─ Schema validation
  │   └─ Evidence validation
  │
  └─ SandboxGuard (Phase 3+)
      ├─ Network restriction
      ├─ Filesystem restriction
      └─ Process monitoring
```

### 16.2 Plugin Communication

**Input (stdin)**:
```json
{
  "version": "ctg.plugin-input/v1",
  "repo_graph": { ... },
  "imported_findings": { ... },
  "config": { ... }
}
```

**Output (stdout)**:
```json
{
  "version": "ctg.plugin-output/v1",
  "findings": [ ... ],
  "risk_seeds": [ ... ],
  "invariant_seeds": [ ... ],
  "diagnostics": [ ... ]
}
```

### 16.3 Plugin Failure Handling

| failure | handling |
|---|---|
| Manifest invalid | Load failed, exit code 6 |
| Process spawn failed | Retry (1x), then PLUGIN_FAILED |
| Timeout | Retry (1x), then PLUGIN_FAILED |
| Output schema invalid | Invalid output isolated, exit code 7 |
| Secret leak pattern | Output rejected, needs_review |

---

## 17. Exporter Architecture

### 17.1 Exporter Components

```
Exporter
  ├─ ArtifactReader
  │   ├─ Read findings.json
  │   ├─ Read risk-register.yaml
  │   ├─ Read test-seeds.json
  │   └─ Read release-readiness.json
  │
  ├─ AdapterRegistry
  │   ├─ GatefieldAdapter
  │   ├─ StateGateAdapter
  │   ├─ ManualBbAdapter
  │   ├─ WorkflowEvidenceAdapter
  │   └─ SarifAdapter
  │
  ├─ PayloadBuilder
  │   ├─ Build target-specific payload
  │   └─ Map fields
  │
  └─ SchemaValidator
      ├─ Validate against adapter schema
      └─ Return result
```

### 17.2 SARIF Exporter

**Output**: SARIF v2.1.0

```json
{
  "$schema": "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
  "version": "2.1.0",
  "runs": [
    {
      "tool": {
        "driver": {
          "name": "code-to-gate",
          "version": "1.0.0",
          "rules": [
            {
              "id": "CLIENT_TRUSTED_PRICE",
              "shortDescription": { "text": "Client-supplied price used directly" }
            }
          ]
        }
      },
      "results": [
        {
          "ruleId": "CLIENT_TRUSTED_PRICE",
          "level": "error",
          "message": { "text": "Price from client request used without validation" },
          "locations": [
            {
              "physicalLocation": {
                "artifactLocation": { "uri": "src/api/order/create.ts" },
                "region": { "startLine": 10, "endLine": 15 }
              }
            }
          ]
        }
      ]
    }
  ]
}
```

---

## 18. GitHub Actions / PR comment / Checks Integration

### 18.1 GitHub Actions Workflow

```yaml
name: code-to-gate PR Analysis

on:
  pull_request:
    branches: [main]

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      
      - name: Setup code-to-gate
        uses: code-to-gate/setup-action@v1
      
      - name: Run diff analysis
        run: |
          code-to-gate diff . \
            --base origin/main \
            --head HEAD \
            --policy .github/ctg-policy.yaml \
            --out .qh
      
      - name: Export SARIF
        run: code-to-gate export sarif --from .qh --out .qh/results.sarif
      
      - name: Upload SARIF
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: .qh/results.sarif
      
      - name: Create PR comment
        uses: code-to-gate/pr-comment-action@v1
        with:
          artifact_dir: .qh
      
      - name: Create Check run
        uses: code-to-gate/checks-action@v1
        with:
          artifact_dir: .qh
      
      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: ctg-artifacts
          path: .qh/
```

### 18.2 PR Comment Template

```markdown
## code-to-gate Analysis

**Status**: {{status}}

### Summary
- **Critical**: {{critical_count}}
- **High**: {{high_count}}
- **Medium**: {{medium_count}}
- **Risks**: {{risk_count}}
- **Test Seeds**: {{seed_count}}

### Key Findings
{{#each findings}}
- **{{ruleId}}** ({{severity}}): {{summary}} at {{path}}:{{line}}
{{/each}}

### Recommended Actions
{{#each recommendations}}
- {{this}}
{{/each}}

[View full report](artifact_url)
```

### 18.3 GitHub Checks Annotation

```
Check run:
  ├─ name: code-to-gate Analysis
  ├─ status: completed
  ├─ conclusion: success / failure / neutral
  ├─ output:
  │   ├─ title: {{status}}
  │   ├─ summary: {{counts}}
  │   └─ annotations:
  │       ├─ path: {{finding.path}}
  │       ├─ start_line: {{finding.line}}
  │       ├─ end_line: {{finding.endLine}}
  │       ├─ annotation_level: failure / warning
  │       ├─ message: {{finding.summary}}
  │       └─ title: {{finding.ruleId}}
```

---

## 19. Local-first Security Model

### 19.1 Network Policy

| mode | network allowed |
|---|---|
| `remote` | LLM provider API only |
| `local-only` | localhost only (ollama, llama.cpp) |
| `none` | No network |

### 19.2 Filesystem Policy

| access | allowed |
|---|---|
| Repo root read | Yes |
| Config read | Yes |
| `.qh/` write | Yes |
| `node_modules/` read | Metadata only |
| `.env` read | Metadata only (no body) |
| Arbitrary path read | No |

### 19.3 Redaction

**Pre-LLM redaction**:

| pattern | replacement |
|---|---|
| API key value | `<REDACTED_API_KEY>` |
| Token value | `<REDACTED_TOKEN>` |
| Password assignment | `password = "<REDACTED>"` |
| `.env` body | `<REDACTED_ENV_BODY>` |
| Private key | `<REDACTED_PRIVATE_KEY>` |
| Custom pattern | `<REDACTED>` |

---

## 20. Error Handling

### 20.1 Error Types

| code | name | handling |
|---:|---|---|
| 0 | `OK` | Success |
| 1 | `READINESS_NOT_CLEAR` | needs_review/block |
| 2 | `USAGE_ERROR` | CLI argument error |
| 3 | `SCAN_FAILED` | Parser fatal failure |
| 4 | `LLM_FAILED` | LLM required and failed |
| 5 | `POLICY_FAILED` | Policy invalid |
| 6 | `PLUGIN_FAILED` | Plugin failure |
| 7 | `SCHEMA_FAILED` | Schema validation failure |
| 8 | `IMPORT_FAILED` | External import failure |
| 9 | `INTEGRATION_EXPORT_FAILED` | Export failure |
| 10 | `INTERNAL_ERROR` | Unknown internal error |

### 20.2 Partial Success Handling

```
Partial artifact:
  ├─ completeness: partial
  ├─ diagnostics[]: error details
  ├─ Generated artifacts kept
  └─ Invalid artifacts isolated to .qh/invalid/
```

---

## 21. Schema Compatibility

### 21.1 Schema Versioning

| version | phase | breaking change |
|---|---|---|
| `ctg/v1alpha1` | Phase 0-2 | Allowed |
| `ctg/v1alpha2` | Phase 2+ | Allowed |
| `ctg/v1` | Phase 3+ | Not allowed (stable) |

### 21.2 Breaking Change Definition

| change | breaking |
|---|:---:|
| Field addition | No |
| Optional field addition | No |
| Enum value addition | Depends on downstream |
| Field deletion | Yes |
| Type change | Yes |
| Required field addition | Yes |
| Enum value meaning change | Yes |

### 21.3 Adapter Schema Versioning

| adapter | version | compatibility |
|---|---|---|
| Gatefield | `ctg.gatefield/v1alpha1` | Independent |
| State Gate | `ctg.state-gate/v1alpha1` | Independent |
| Manual-bb | `ctg.manual-bb/v1alpha1` | Independent |
| Workflow evidence | `ctg.workflow-evidence/v1alpha1` | Independent |

Adapter schema breaking change → adapter version upgrade.

---

## 22. Test Strategy

### 22.1 Test Categories

| category | purpose |
|---|---|
| Unit tests | Component logic validation |
| Integration tests | End-to-end flow validation |
| Contract tests | Downstream adapter schema validation |
| Fixture tests | Synthetic repo acceptance |
| Real repo tests | Public repo acceptance |
| Performance tests | Timing validation |
| FP/FN evaluation | Detection accuracy |

### 22.2 Test Priorities

| phase | test focus |
|---|---|
| Phase 1 | Unit + Fixture + Contract |
| Phase 2 | Integration + Real repo + Performance |
| Phase 3 | FP/FN evaluation + Large repo |

### 22.3 Contract Test Structure

```
Contract Tests:
  ├─ Gatefield adapter schema validation
  ├─ State Gate adapter schema validation
  ├─ Manual-bb adapter schema validation
  ├─ Workflow evidence adapter schema validation
  └─ Core artifact schema validation
```

### 22.4 FP/FN Evaluation

```
FP Evaluation:
  ├─ Generate findings on real repo
  ├─ Human review each finding
  ├─ Mark as TP / FP / Uncertain
  ├─ Calculate FP rate
  └─ Generate suppression recommendations

FN Evaluation:
  ├─ Seed known smells in synthetic repo
  ├─ Run analysis
  ├─ Check detection rate
  └─ Calculate FN rate
```

---

## 23. Migration Path from v0.1 MVP

### 23.1 v0.1 → Phase 1

| migration | 内容 |
|---|---|---|
| CLI options | Add `--languages`, `--exclude`, `--llm-mode` |
| Config file | Add full config support |
| Policy file | Add full policy support |
| Parser | Add AST parser (keep text fallback) |
| GitHub | Add Actions/PR comment/Checks |

### 23.2 Phase 1 → Phase 2

| migration | 内容 |
|---|---|---|
| Plugin SDK | Add plugin runtime |
| Baseline | Add baseline mode |
| Historical | Add historical comparison |
| Local LLM | Add ollama/llama.cpp support |

### 23.3 Phase 2 → Phase 3

| migration | 内容 |
|---|---|---|
| Python | Add Python adapter |
| Schema | Freeze to v1 stable |
| Web viewer | Add artifact viewer |
| Sandbox | Add plugin sandbox |
| Large repo | Add optimization |

---

## 24. Risks

| id | priority | risk | mitigation |
|---|---:|---|---|
| S-RISK-01 | P1 | AST parser library breaking change | Fallback parser + library abstraction |
| S-RISK-02 | P1 | LLM provider API change | Provider abstraction + fallback |
| S-RISK-03 | P2 | Downstream schema mismatch | Contract tests + versioning |
| S-RISK-04 | P2 | Plugin sandbox complexity | Phase 3 gradual implementation |
| S-RISK-05 | P3 | Large repo performance | Incremental cache + parallel |

---

## 25. Open Questions

### 25.1 Product-level GO Blockers

なし。

### 25.2 Follow-up Questions

| id | question | phase |
|---|---|---|
| SQ-01 | AST parser library choice (TypeScript compiler vs Babel vs tree-sitter) | Phase 1 prep |
| SQ-02 | GitHub App vs PAT for PR comment | Phase 1 prep |
| SQ-03 | Web viewer technology (React vs Vue vs static HTML) | Phase 3 prep |
| SQ-04 | Plugin sandbox technology (Docker vs WASM vs OS sandbox) | Phase 3 prep |

---

## 26. Next Actions

| id | action | owner | phase |
|---|---|---|---|
| SN-01 | `docs/product-acceptance-v1.md` 作成 | QA | Immediate |
| SN-02 | `docs/product-gap-analysis.md` 作成 | Analyst | Immediate |
| SN-03 | `docs/product-roadmap.md` 作成 | PM | Immediate |
| SN-04 | AST parser library evaluation | Dev | Phase 1 prep |
| SN-05 | GitHub Actions template design | Dev | Phase 1 prep |
| SN-06 | Contract test CI setup | QA | Phase 1 prep |