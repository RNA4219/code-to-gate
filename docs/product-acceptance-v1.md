# code-to-gate Product Acceptance v1.0

**バージョン**: v1.0
**作成日**: 2026-04-30
**対象**: OSS alpha / beta / v1.0 product level
**位置づけ**: 本書はプロダクトレベル受入仕様書。v0.1 MVP 受入仕様書は `docs/acceptance-v0.1.md` を参照。

---

## 1. Scope

本書は code-to-gate のプロダクトレベル受入基準を定義する。

対象フェーズ:
- Phase 1: OSS α (Alpha Release)
- Phase 2: OSS β (Beta Release)
- Phase 3: v1.0 Product (Stable Release)

対象内容:
- 各フェーズの受入基準
- 実行可能な受入コマンド
- Go/No-Go 判定条件
- 受入証跡要件
- FP/FN 評価方法
- Real repo 動作確認方法

v0.1 Local Release Readiness MVP の受入基準は `docs/acceptance-v0.1.md` で定義済み。本書は Phase 1 以降を対象とする。

---

## 2. Non-goals

本書の非対象:

- v0.1 MVP 受入基準の再定義 (`docs/acceptance-v0.1.md` を参照)
- 実装詳細 (`docs/product-spec-v1.md` を参照)
- 要件定義の再定義 (`docs/product-requirements-v1.md` を参照)
- company-specific rule 受入 (private plugin 範囲外)
- AI agent gate engine 受入 (agent-gatefield 範囲外)
- agent approval/freshness 受入 (agent-state-gate 範囲外)
- manual BB test case design 受入 (manual-bb-test-harness 範囲外)
- workflow governance 受入 (workflow-cookbook 範囲外)

---

## 3. Phase Acceptance

### 3.1 α Acceptance (Phase 1)

Phase 1 OSS α の受入基準。すべての基準を満たした場合に GO。

#### 3.1.1 Real Repo Acceptance

| 基準 | 受入条件 |
|---|---|
| Real repo 数 | 3+ public repo で scan/analyze/readiness 実行可能 |
| Repo size | 各 repo 100-500 files (TS/JS) |
| Repo type | 最低 1 Express/Fastify style backend, 1 frontend SPA, 1 library |
| 実行結果 | 各 repo で exit code 0 or 1 (期待値に合致) |
| Schema validation | 各 repo で生成 artifact の schema validation pass |

**Real Repo 動作確認リスト**:

| repo | type | files | 期待 exit code | 期待 status |
|---|---|---:|---:|---|
| `express-example` | Backend (Express) | 150-300 | 1 | needs_review |
| `react-admin-dashboard` | Frontend (React) | 200-400 | 0 or 1 | passed or needs_review |
| `typescript-utils-lib` | Library | 50-150 | 0 | passed |

#### 3.1.2 Fixture Acceptance

v0.1 fixture + Phase 1 新 fixture。

| fixture | 期待結果 |
|---|---|
| `demo-shop-ts` | CLIENT_TRUSTED_PRICE (critical), blocked_input |
| `demo-auth-js` | WEAK_AUTH_GUARD (high), TRY_CATCH_SWALLOW (medium), needs_review |
| `demo-ci-imports` | External import success, normalized findings |
| `demo-suppressions-ts` (Phase 1 新規) | Suppression 動作, expiry warning |
| `demo-github-actions-ts` (Phase 1 新規) | GitHub Actions workflow 動作 |

**Fixture 受入コマンド**:

```bash
code-to-gate fixture run demo-shop-ts --out .qh/fixtures/demo-shop-ts
code-to-gate fixture run demo-auth-js --out .qh/fixtures/demo-auth-js
code-to-gate fixture run demo-ci-imports --out .qh/fixtures/demo-ci-imports
code-to-gate fixture run demo-suppressions-ts --out .qh/fixtures/demo-suppressions-ts
code-to-gate fixture run demo-github-actions-ts --out .qh/fixtures/demo-github-actions-ts
```

期待結果:
- 各 fixture で exit code 0 or 1
- 生成 artifact schema validation pass
- 期待 finding/risk/status が生成される

#### 3.1.3 Schema Acceptance

| 基準 | 受入条件 |
|---|---|
| Core schema | `repo-graph.json`, `findings.json`, `risk-register.yaml`, `test-seeds.json`, `release-readiness.json`, `audit.json` の schema validation |
| Adapter schema | `gatefield-static-result.json`, `state-gate-evidence.json`, `manual-bb-seed.json`, `workflow-evidence.json` の schema validation |
| SARIF schema | `results.sarif` の SARIF v2.1.0 schema validation |

**Schema Validation Commands**:

```bash
code-to-gate schema validate .qh/repo-graph.json
code-to-gate schema validate .qh/findings.json
code-to-gate schema validate .qh/risk-register.yaml
code-to-gate schema validate .qh/test-seeds.json
code-to-gate schema validate .qh/release-readiness.json
code-to-gate schema validate .qh/audit.json
code-to-gate schema validate .qh/gatefield-static-result.json
code-to-gate schema validate .qh/state-gate-evidence.json
code-to-gate schema validate .qh/manual-bb-seed.json
code-to-gate schema validate .qh/workflow-evidence.json
code-to-gate schema validate .qh/results.sarif
```

期待結果:
- すべて exit code 0
- Invalid artifact は exit code 7

#### 3.1.4 CLI Acceptance

| コマンド | 受入条件 |
|---|---|
| `scan` | NormalizedRepoGraph 生成, exit code 0 |
| `analyze` | Full analysis, exit code 0 or 1 |
| `diff` | Diff analysis, blast radius 生成 |
| `import` | ESLint/Semgrep/tsc/coverage import |
| `readiness` | ReleaseReadiness evaluation |
| `export` | 4 downstream + SARIF export |
| `plugin` | doctor / list / validate 動作 |
| `schema` | validate 動作 |
| `fixture` | run 動作 |

**CLI Acceptance Commands**:

```bash
# Scan
code-to-gate scan fixtures/demo-shop-ts --out .qh/scan-test
# 期待: exit code 0, repo-graph.json 生成

# Analyze
code-to-gate analyze fixtures/demo-shop-ts --emit all --out .qh/analyze-test --policy fixtures/policies/strict.yaml
# 期待: exit code 1, blocked_input

# Diff
code-to-gate diff fixtures/demo-shop-ts --base main --head feature-branch --out .qh/diff-test
# 期待: exit code 0 or 2 (base not found), diff-analysis.json 生成

# Import
code-to-gate import eslint fixtures/demo-ci-imports/eslint.json --out .qh/import-test
code-to-gate import semgrep fixtures/demo-ci-imports/semgrep.json --out .qh/import-test
code-to-gate import tsc fixtures/demo-ci-imports/tsc.json --out .qh/import-test
# 期待: exit code 0, normalized findings 生成

# Readiness
code-to-gate readiness fixtures/demo-shop-ts --policy fixtures/policies/strict.yaml --out .qh/readiness-test
# 期待: exit code 1, blocked_input

# Export
code-to-gate export gatefield --from .qh/readiness-test --out .qh/gatefield-test.json
code-to-gate export state-gate --from .qh/readiness-test --out .qh/state-gate-test.json
code-to-gate export manual-bb --from .qh/readiness-test --out .qh/manual-bb-test.json
code-to-gate export workflow-evidence --from .qh/readiness-test --out .qh/workflow-test.json
code-to-gate export sarif --from .qh/readiness-test --out .qh/sarif-test.sarif
# 期待: すべて exit code 0

# Plugin
code-to-gate plugin list
code-to-gate plugin doctor
# 期待: exit code 0

# Schema
code-to-gate schema validate .qh/readiness-test/release-readiness.json
# 期待: exit code 0

# Fixture
code-to-gate fixture run demo-shop-ts
# 期待: exit code 1, blocked_input
```

#### 3.1.5 GitHub Actions Acceptance

| 基準 | 受入条件 |
|---|---|
| Workflow 動作 | GitHub Actions workflow が実行可能 |
| Exit code | Workflow 内で exit code が正しく処理される |
| Artifact upload | `.qh/` artifact が GitHub Actions artifact に upload |
| SARIF upload | SARIF file が code scanning に upload 可能 |

**GitHub Actions Workflow Test**:

```yaml
# .github/workflows/ctg-test.yaml
name: code-to-gate Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      
      - name: Install code-to-gate
        run: npm install -g @code-to-gate/cli
      
      - name: Run scan
        run: code-to-gate scan . --out .qh
      
      - name: Run analyze
        run: code-to-gate analyze . --emit all --out .qh --policy .github/policy.yaml
      
      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: ctg-artifacts
          path: .qh/
      
      - name: Export SARIF
        run: code-to-gate export sarif --from .qh --out .qh/results.sarif
      
      - name: Upload SARIF
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: .qh/results.sarif
```

期待結果:
- Workflow 成功 (exit code 0 or 1 で pass)
- Artifact upload 成功
- SARIF upload 成功

#### 3.1.6 PR Comment Acceptance

| 基準 | 受入条件 |
|---|---|
| Comment 生成 | PR comment Markdown 生成可能 |
| Comment 投稿 | PR に comment 投稿可能 (GitHub App or PAT) |
| Comment 更新 | Re-run で既存 comment 更新可能 |
| Format | GitHub Markdown format 正常 |

**PR Comment Test Command**:

```bash
# PR comment 生成 (dry-run)
code-to-gate export pr-comment --from .qh --out .qh/pr-comment.md --dry-run

# PR comment 投稿
code-to-gate export pr-comment --from .qh --repo owner/repo --pr-number 123 --token $GITHUB_TOKEN
```

期待結果:
- PR comment Markdown 生成
- 投稿成功
- Format 正常

#### 3.1.7 Checks Acceptance

| 基準 | 受入条件 |
|---|---|
| Check run 生成 | GitHub Checks API で check run 生成可能 |
| Annotation | Finding per-file annotation 正常 |
| Summary | Overall summary 正常 |
| Conclusion | conclusion が status に対応 |

**Checks Test Command**:

```bash
# Check run 生成 (dry-run)
code-to-gate export checks --from .qh --out .qh/checks-payload.json --dry-run

# Check run 投稿
code-to-gate export checks --from .qh --repo owner/repo --sha abc123 --token $GITHUB_TOKEN
```

期待結果:
- Check run payload 生成
- 投稿成功
- Annotations 正常

#### 3.1.8 LLM Acceptance

| 基準 | 受入条件 |
|---|---|
| Remote LLM 動作 | OpenAI / Anthropic provider 動作 |
| Structured output | LLM output schema validation pass |
| Fallback 動作 | LLM 失敗時に deterministic fallback 動作 |
| Exit code | `--require-llm` で LLM 失敗時 exit code 4 |
| Unsupported claims | unsupported_claims が primary artifact に混入しない |

**LLM Test Commands**:

```bash
# Remote LLM 動作確認
code-to-gate analyze fixtures/demo-shop-ts --emit all --out .qh/llm-test --llm-mode remote --require-llm
# 期待: exit code 1 (blocked_input), LLM artifact 生成

# LLM 失敗 fallback 確認 (timeout 模擬)
code-to-gate analyze fixtures/demo-shop-ts --emit all --out .qh/llm-fallback --llm-mode remote --llm-timeout 1
# 期待: deterministic artifact 生成, LLM partial or failed

# require-llm 失敗確認
code-to-gate analyze fixtures/demo-shop-ts --emit all --out .qh/llm-fail --llm-mode none --require-llm
# 期待: exit code 4
```

#### 3.1.9 Redaction Acceptance

| 基準 | 受入条件 |
|---|---|
| Pattern redaction | api_key, token, password pattern が redacted |
| .env redaction | `.env` body が LLM payload に含まれない |
| Custom redaction | Configured patterns が redacted |
| Audit record | redaction enabled flag が audit に記録 |

**Redaction Test Command**:

```bash
# Redaction 確認 (debug trace)
code-to-gate analyze fixtures/demo-shop-ts --emit all --out .qh/redaction-test --debug-llm-trace

# .qh/llm-trace/request.json を確認
# api_key, token, password 値が <REDACTED> に置換されている
```

期待結果:
- LLM request payload に secret 値が含まれない
- Audit に `redaction.enabled=true` 記録

#### 3.1.10 Plugin Acceptance

| 基準 | 受入条件 |
|---|---|
| Plugin doctor | `code-to-gate plugin doctor` 動作 |
| Plugin list | `code-to-gate plugin list` 動作 |
| Plugin validate | `code-to-gate plugin validate` 動作 |
| Core plugins | `@code-to-gate/lang-ts`, `@code-to-gate/rules-core` 読み込み |
| Private plugin | `file:../private-plugin` 読み込み可能 |

**Plugin Test Commands**:

```bash
# Plugin doctor
code-to-gate plugin doctor
# 期待: exit code 0, plugin health status 出力

# Plugin list
code-to-gate plugin list
# 期待: exit code 0, loaded plugins list

# Plugin validate
code-to-gate plugin validate fixtures/plugins/test-plugin
# 期待: exit code 0 or 6 (manifest invalid)

# Private plugin 読み込み
code-to-gate analyze fixtures/demo-shop-ts --plugin file:fixtures/plugins/test-plugin --out .qh/plugin-test
# 期待: plugin 読み込み成功, findings 生成
```

#### 3.1.11 Performance Acceptance

| 基準 | 条件 | 目標 | 測定方法 |
|---|---|---:|---|
| Small repo scan | 100-500 files, TS/JS | <= 30s | `time code-to-gate scan` |
| Small repo analyze | 100-500 files, LLM excluded | <= 60s | `time code-to-gate analyze --llm-mode none` |
| Schema validation | Generated artifacts | <= 5s | `time code-to-gate schema validate` |

**Performance Test Commands**:

```bash
# Small repo scan timing
time code-to-gate scan fixtures/demo-shop-ts --out .qh/perf-scan
# 期待: <= 30s

# Small repo analyze timing (no LLM)
time code-to-gate analyze fixtures/demo-shop-ts --emit all --out .qh/perf-analyze --llm-mode none
# 期待: <= 60s

# Schema validation timing
time code-to-gate schema validate .qh/perf-analyze/findings.json
# 期待: <= 5s
```

注: LLM remote latency は別計測とする。

#### 3.1.12 FP Acceptance

| 基準 | 受入条件 | 測定方法 |
|---|---|
| FP rate | <= 15% | Human review-based evaluation |

**FP Evaluation Method**:

```
1. 3+ real repo で analyze 実行
2. 生成 findings を human review
3. 各 finding を TP (True Positive) / FP (False Positive) / Uncertain に分類
4. FP rate = FP_count / (TP_count + FP_count + Uncertain_count)
5. FP rate <= 15% で pass
```

**FP Evaluation Template**:

```yaml
# fp-evaluation.yaml
evaluation_id: fp-eval-phase1-001
repo: express-example
evaluator: tech-lead
date: 2026-05-01

findings:
  - finding_id: F001
    rule_id: CLIENT_TRUSTED_PRICE
    classification: TP
    comment: "Correctly detected client price usage without validation"
  
  - finding_id: F002
    rule_id: WEAK_AUTH_GUARD
    classification: FP
    comment: "Public route, auth not required"
  
  - finding_id: F003
    rule_id: TRY_CATCH_SWALLOW
    classification: TP
    comment: "Error silently swallowed"

summary:
  total: 3
  tp: 2
  fp: 1
  uncertain: 0
  fp_rate: 33.3%  # Phase 1 目標: <= 15%
```

FP rate > 15% の場合:
- Suppression 推奨リスト生成
- Rule 調整検討
- Phase 1 で conditional Go 可能 (<= 20% で warning)

#### 3.1.13 FN Acceptance

| 基準 | 受入条件 | 測定方法 |
|---|---|
| Detection rate | >= 80% | Seeded smells evaluation |

**FN Evaluation Method**:

```
1. Seeded smells を synthetic repo に埋め込み
2. analyze 実行
3. 各 seeded smell の検出を確認
4. Detection rate = Detected_count / Seeded_count
5. Detection rate >= 80% で pass
```

**Seeded Smells List** (demo-shop-ts + demo-auth-js):

| seeded_id | rule_id | fixture | 期待検出 |
|---|---|---|:---:|
| S001 | CLIENT_TRUSTED_PRICE | demo-shop-ts | Yes |
| S002 | WEAK_AUTH_GUARD | demo-shop-ts | Yes |
| S003 | MISSING_SERVER_VALIDATION | demo-shop-ts | Yes |
| S004 | UNTESTED_CRITICAL_PATH | demo-shop-ts | Yes |
| S005 | WEAK_AUTH_GUARD | demo-auth-js | Yes |
| S006 | TRY_CATCH_SWALLOW | demo-auth-js | Yes |
| S007 | ENV_DIRECT_ACCESS | demo-auth-js | Yes |
| S008 | RAW_SQL | demo-shop-ts | Yes |
| S009 | UNSAFE_DELETE | demo-shop-ts | Yes |
| S010 | HIGH_FANOUT_CHANGE | demo-shop-ts (diff) | Yes |

Detection rate = 10/10 = 100% (目標 >= 80%)

#### 3.1.14 Documentation Acceptance

| 基準 | 受入条件 |
|---|---|
| README | Scope, non-goals, quickstart, license, origin policy |
| Quickstart | 5 step quickstart guide |
| CLI reference | All commands documented |
| Examples | Basic scan, PR analysis, CI integration examples |

**Documentation Check List**:

| doc | path | 内容 |
|---|---|---|
| README | `README.md` | Product overview, scope, non-goals, quickstart |
| Quickstart | `docs/quickstart.md` | Installation → scan → analyze → readiness flow |
| CLI reference | `docs/cli-reference.md` | All CLI commands, options, exit codes |
| Config guide | `docs/config-guide.md` | Config file structure, options |
| Policy guide | `docs/policy-guide.md` | Policy file structure, options |
| Examples | `examples/` | Example repos, workflows, policies |

#### 3.1.15 Release Readiness Acceptance

| 基準 | status | exit code | 受入条件 |
|---|---|---:|---|
| passed | passed | 0 | No blocking findings |
| passed_with_risk | passed_with_risk | 0 | Warnings only |
| needs_review | needs_review | 1 | Review required findings |
| blocked_input | blocked_input | 1 | Blocking findings |
| failed | failed | 10 | Internal error |

**Status Mapping Test**:

```bash
# passed
code-to-gate analyze fixtures/demo-pass --policy fixtures/policies/relaxed.yaml
# 期待: status=passed, exit code=0

# needs_review
code-to-gate analyze fixtures/demo-auth-js --policy fixtures/policies/relaxed.yaml
# 期待: status=needs_review, exit code=1

# blocked_input
code-to-gate analyze fixtures/demo-shop-ts --policy fixtures/policies/strict.yaml
# 期待: status=blocked_input, exit code=1
```

---

### 3.2 β Acceptance (Phase 2)

Phase 2 OSS β の受入基準。Phase 1 基準 + 以下追加基準。

#### 3.2.1 Real Repo Acceptance

| 基準 | 受入条件 |
|---|---|
| Real repo 数 | 5+ public repo + monorepo 動作 |
| Repo size | 各 repo 500-2000 files |
| Monorepo | workspace / package boundary 動作 |

**Real Repo 動作確認リスト**:

| repo | type | files | 期待結果 |
|---|---|---:|---|
| `express-production-app` | Backend | 500-800 | analyze 動作 |
| `nextjs-dashboard` | Frontend | 800-1500 | analyze 動作 |
| `monorepo-example` | Monorepo | 1000-2000 | package boundary 動作 |
| `nestjs-api` | Backend (NestJS) | 600-1000 | analyze 動作 |
| `vue-admin-panel` | Frontend (Vue) | 400-600 | analyze 動作 |

#### 3.2.2 Plugin SDK Acceptance

| 基準 | 受入条件 |
|---|---|
| Custom plugin 作成 | 新規 rule plugin 作成可能 |
| Plugin manifest | manifest schema validation |
| Plugin execution | custom plugin 実行動作 |
| Plugin contract test | plugin output schema validation |

**Plugin SDK Test**:

```bash
# Custom plugin 作成確認
# 1. plugin template から新規 plugin 作成
# 2. manifest.yaml 作成
# 3. plugin 実装
# 4. plugin validate
code-to-gate plugin validate my-custom-plugin

# Plugin 実行確認
code-to-gate analyze fixtures/demo-shop-ts --plugin my-custom-plugin --out .qh/custom-plugin-test
# 期待: custom plugin findings 生成
```

#### 3.2.3 Contract Tests Acceptance

| 基準 | 受入条件 |
|---|---|
| Adapter schema CI | Downstream 4 adapter schema CI validation |
| Schema contract | Adapter schema breaking change detection |

**Contract Test Commands**:

```bash
# Gatefield adapter contract test
code-to-gate export gatefield --from fixtures/artifacts/sample --out test-gatefield.json
code-to-gate schema validate test-gatefield.json --schema schemas/integrations/gatefield.schema.json

# State Gate adapter contract test
code-to-gate export state-gate --from fixtures/artifacts/sample --out test-state-gate.json
code-to-gate schema validate test-state-gate.json --schema schemas/integrations/state-gate.schema.json

# Manual-bb adapter contract test
code-to-gate export manual-bb --from fixtures/artifacts/sample --out test-manual-bb.json
code-to-gate schema validate test-manual-bb.json --schema schemas/integrations/manual-bb.schema.json

# Workflow evidence contract test
code-to-gate export workflow-evidence --from fixtures/artifacts/sample --out test-workflow.json
code-to-gate schema validate test-workflow.json --schema schemas/integrations/workflow-evidence.schema.json
```

期待結果:
- すべて exit code 0
- CI で自動実行

#### 3.2.4 Suppression Acceptance

| 基準 | 受入条件 |
|---|---|
| Suppression 動作 | suppression file で finding 除外 |
| Expiry warning | expiry 接近 / 超過 warning |
| Suppression audit | suppression 使用履歴記録 |

**Suppression Test Commands**:

```bash
# Suppression file 作成
# .ctg/suppressions.yaml:
# suppressions:
#   - rule_id: CLIENT_TRUSTED_PRICE
#     path: src/api/legacy/*.ts
#     reason: Legacy code
#     expiry: 2026-06-30

# Suppression 動作確認
code-to-gate analyze fixtures/demo-shop-ts --policy fixtures/policies/with-suppressions.yaml --out .qh/suppression-test
# 期待: suppressed finding 除外, audit に suppression 記録

# Expiry warning 確認
# expiry 超過 suppression は無効, warning 出力
```

#### 3.2.5 Historical Acceptance

| 基準 | 受入条件 |
|---|---|
| Comparison 動作 | previous artifact vs current artifact 比較 |
| New findings | new findings 検出 |
| Resolved findings | resolved findings 検出 |
| Unchanged findings | unchanged findings 表示 |

**Historical Comparison Test**:

```bash
# Previous run artifact 保存
code-to-gate analyze fixtures/demo-shop-ts --out .qh/previous --policy fixtures/policies/strict.yaml

# Current run (変更後)
code-to-gate analyze fixtures/demo-shop-ts --out .qh/current --policy fixtures/policies/strict.yaml --baseline .qh/previous/release-readiness.json

# Historical comparison 出力
# .qh/current/comparison.json:
# {
#   "new_findings": [...],
#   "resolved_findings": [...],
#   "unchanged_findings": [...]
# }
```

#### 3.2.6 Local LLM Acceptance

| 基準 | 受入条件 |
|---|---|
| ollama 動作 | ollama provider 動作 |
| llama.cpp 動作 | llama.cpp provider 動作 |
| Local-only mode | `--llm-mode local-only` 動作 |

**Local LLM Test Commands**:

```bash
# ollama provider test
code-to-gate analyze fixtures/demo-shop-ts --llm-provider ollama --llm-model llama3 --out .qh/ollama-test
# 期待: LLM artifact 生成 (localhost only)

# llama.cpp provider test
code-to-gate analyze fixtures/demo-shop-ts --llm-provider llama.cpp --llm-model ./models/qwen.gguf --out .qh/llamacpp-test
# 期待: LLM artifact 生成

# Local-only mode test
code-to-gate analyze fixtures/demo-shop-ts --llm-mode local-only --llm-provider ollama --out .qh/local-only-test
# 期待: localhost only, no remote API call
```

#### 3.2.7 Performance Acceptance

| 基準 | 条件 | 目標 |
|---|---|---:|
| Medium repo scan | 500-2000 files | <= 45s |
| Medium repo analyze | LLM excluded | <= 120s |
| Incremental cache | changed files only | <= 50% of full scan |

**Performance Test Commands**:

```bash
# Medium repo scan timing
time code-to-gate scan fixtures/demo-medium --out .qh/perf-medium
# 期待: <= 45s

# Medium repo analyze timing (no LLM)
time code-to-gate analyze fixtures/demo-medium --emit all --out .qh/perf-medium-analyze --llm-mode none
# 期待: <= 120s

# Incremental cache timing
# 1回目: full scan
time code-to-gate scan fixtures/demo-medium --out .qh/cache-test --cache-enabled

# 2回目: diff scan
time code-to-gate diff fixtures/demo-medium --base previous --head current --out .qh/cache-diff --cache-enabled
# 期待: 1回目の 50% 以下
```

#### 3.2.8 FP Acceptance

| 基準 | 受入条件 |
|---|---|
| FP rate | <= 10% |

FP rate <= 10% で pass。Phase 1 の 15% から改善必須。

#### 3.2.9 FN Acceptance

| 基準 | 受入条件 |
|---|---|
| Detection rate | >= 90% |

Detection rate >= 90% で pass。Phase 1 の 80% から改善必須。

#### 3.2.10 Web Viewer MVP Acceptance

| 基準 | 受入条件 |
|---|---|
| Basic viewer | artifact viewer 動作 |
| Graph viewer | dependency graph 表示 |
| Finding explorer | finding list 表示 |

**Web Viewer MVP Test**:

```bash
# Web viewer 起動
code-to-gate viewer --from .qh --port 3000

# ブラウザで http://localhost:3000 確認
# - repo-graph 表示
# - findings list 表示
# - dependency graph 表示
```

---

### 3.3 v1.0 Acceptance (Phase 3)

Phase 3 v1.0 Product の受入基準。Phase 2 基準 + 以下追加基準。

#### 3.3.1 Real Repo Acceptance

| 基準 | 受入条件 |
|---|---|
| Real repo 数 | 10+ public repo 動作 |
| Large repo | 5000+ files repo 動作 |
| Mixed repo | TS/JS + Python mixed repo 動作 |

**Real Repo 動作確認リスト**:

| repo | type | files | 期待結果 |
|---|---|---:|---|
| `large-enterprise-app` | Full stack | 5000+ | analyze 動作 |
| `python-data-service` | Python backend | 800-1200 | Python adapter 動作 |
| `mixed-ts-python` | Mixed | 1000-2000 | Mixed 動作 |
| `monorepo-fullstack` | Monorepo | 3000+ | Package boundary 動作 |
| ... | | | |

#### 3.3.2 Python Adapter Acceptance

| 基準 | 受入条件 |
|---|---|
| Python import extraction | `import`, `from ... import` 抽出 |
| Python function extraction | `def`, `async def`, class method 抽出 |
| Python test extraction | pytest/unittest test file 抽出 |
| Python entrypoint | `__main__`, `app.py` 検出 |

**Python Adapter Test**:

```bash
# Python fixture test
code-to-gate analyze fixtures/demo-batch-py --out .qh/python-test
# 期待: Python repo-graph 生成, findings 生成

# Python findings test
# 期待 finding: UNSAFE_DELETE, ENV_DIRECT_ACCESS
```

#### 3.3.3 Stable Schema Acceptance

| 基準 | 受入条件 |
|---|---|
| No breaking change | 6 months 間 schema breaking change なし |
| Schema version | `ctg/v1` stable |
| Backward compatibility | v1alpha1 artifact 読み込み可能 |

**Schema Stability Check**:

```
過去 6 months の schema changelog 確認:
- Field deletion: なし
- Type change: なし
- Required field addition: なし
- Enum value meaning change: なし

Forward compatibility:
- v1alpha1 artifact → v1 schema validation: pass
- v1 artifact → v1alpha1 parser: warning あり
```

#### 3.3.4 Plugin Ecosystem Acceptance

| 基準 | 受入条件 |
|---|---|
| Public plugins | 3+ public plugins 存在 |
| Plugin registry | plugin registry/list 存在 |
| Plugin docs | plugin 作成 guide 存在 |

**Plugin Ecosystem Check**:

```bash
# Public plugins 確認
# npm search @code-to-gate/plugin
# 期待: 3+ public plugins

# Plugin registry 確認
# GitHub: code-to-gate/plugins リポジトリ
# 期待: plugin list, examples

# Plugin docs 確認
code-to-gate docs plugin-guide
# 期待: plugin 作成 guide 出力
```

#### 3.3.5 FP Acceptance

| 基準 | 受入条件 |
|---|---|
| FP rate | <= 5% |

FP rate <= 5% で pass。Phase 2 の 10% から改善必須。

#### 3.3.6 FN Acceptance

| 基準 | 受入条件 |
|---|---|
| Detection rate | >= 95% |

Detection rate >= 95% で pass。Phase 2 の 90% から改善必須。

#### 3.3.7 Web Viewer Acceptance

| 基準 | 受入条件 |
|---|---|
| Full viewer | Complete artifact viewer 動作 |
| Interactive graph | Interactive dependency graph |
| Finding details | Finding detail view |
| Export | Export from viewer |

**Web Viewer Full Test**:

```bash
# Web viewer 起動
code-to-gate viewer --from .qh --port 3000 --full

# ブラウザで確認:
# - repo-graph viewer (interactive)
# - findings explorer (filter, sort)
# - risk register view
# - test seeds view
# - release readiness view
# - export button (SARIF, downstream)
```

#### 3.3.8 Adoption Acceptance

| 基準 | 受入条件 |
|---|---|
| GitHub stars | 100+ GitHub stars |
| Real project usage | 10+ real project usage evidence |
| Community feedback | GitHub issues/discussions 活動 |

**Adoption Metrics Check**:

```bash
# GitHub stars 確認
# 期待: 100+

# Real project usage 確認
# GitHub search: code-to-gate in filename
# 期待: 10+ project references

# Community activity 確認
# GitHub issues/discussions
# 期待: 活動あり (issues, discussions, PRs)
```

---

## 4. Go/No-Go Criteria

### 4.1 Go Criteria (Phase 1 α)

Phase 1 α Release の GO 条件。

| 基準 | 必須 | 条件 |
|---|:---:|---|
| All acceptance tests pass | Yes | 3.1 の全基準 pass |
| Real repo 動作 | Yes | 3+ public repo 動作 |
| FP rate <= 15% | Yes | Human review-based evaluation |
| Documentation complete | Yes | README + quickstart + CLI reference |
| Performance targets | Yes | Small repo <= 30s scan |
| Schema validation | Yes | All artifacts schema validation pass |
| GitHub Actions 動作 | Yes | Workflow 動作確認 |

**Go 判定**:
- すべて必須基準 pass → GO
- 任意基準 miss → GO (次 phase で改善)

### 4.2 Conditional Go Criteria

Conditional GO 条件 (minor issues with documented fixes)。

| 基準 | Conditional 条件 | Action |
|---|---|---|
| FP rate | 15-20% | Suppression 推奨リスト生成, Phase 2 改善 |
| Performance | Target + 10% | Phase 2 optimization |
| Documentation | Minor gaps | Phase 2 completion |
| GitHub Actions | Minor issues | Phase 2 fix |
| Real repo | 2 repos only | Phase 2 +1 repo |

**Conditional Go 判定**:
- 1-2 基準 conditional → Conditional GO (warning)
- 3+ 基準 conditional → No-Go

### 4.3 No-Go Criteria

Phase 1 α Release の No-Go 条件。

| 基準 | No-Go 条件 |
|---|---|
| FP rate | > 20% |
| Critical functionality | Broken |
| Security issue | Unaddressed security issue |
| Performance | > 2x target (> 60s for small repo) |
| Schema validation | Core artifact schema fail |
| Real repo | 0 repos 動作 |
| Documentation | README missing |

**No-Go 判定**:
- いずれか 1 基準 No-Go → No-Go (blocker)

---

### 4.4 Go Criteria (Phase 2 β)

Phase 2 β Release の GO 条件 (Phase 1 基準 + 以下)。

| 基準 | 必須 | 条件 |
|---|:---:|---|
| Phase 1 GO 条件 | Yes | すべて継続 pass |
| Plugin SDK | Yes | Custom plugin 作成・実行可能 |
| Contract tests CI | Yes | Adapter schema CI validation |
| FP rate <= 10% | Yes | Phase 1 の 15% 改善 |
| Detection rate >= 90% | Yes | Phase 1 の 80% 改善 |
| Performance | Yes | Medium repo <= 45s scan |
| Web viewer MVP | Yes | Basic viewer 動作 |

### 4.5 Go Criteria (Phase 3 v1.0)

Phase 3 v1.0 Release の GO 条件 (Phase 2 基準 + 以下)。

| 基準 | 必須 | 条件 |
|---|:---:|---|
| Phase 2 GO 条件 | Yes | すべて継続 pass |
| Python adapter | Yes | Python repo 動作 |
| Stable schema | Yes | 6 months breaking change なし |
| FP rate <= 5% | Yes | Phase 2 の 10% 改善 |
| Detection rate >= 95% | Yes | Phase 2 の 90% 改善 |
| Plugin ecosystem | Yes | 3+ public plugins |
| Web viewer | Yes | Full viewer 動作 |
| Adoption | Yes | 100+ GitHub stars |

---

## 5. Acceptance Commands

### 5.1 Phase 1 α Acceptance Commands

実行可能な受入コマンドセット。

```bash
#!/bin/bash
# acceptance-phase1.sh

echo "=== Phase 1 α Acceptance Test ==="

# 5.1.1 Fixture Tests
echo ">>> Fixture Tests"
code-to-gate fixture run demo-shop-ts --out .qh/acceptance/demo-shop-ts
EXPECT_EXIT=1 EXPECT_STATUS=blocked_input

code-to-gate fixture run demo-auth-js --out .qh/acceptance/demo-auth-js
EXPECT_EXIT=1 EXPECT_STATUS=needs_review

code-to-gate fixture run demo-ci-imports --out .qh/acceptance/demo-ci-imports
EXPECT_EXIT=0

# 5.1.2 Real Repo Tests
echo ">>> Real Repo Tests"
code-to-gate analyze ./repos/express-example --emit all --out .qh/acceptance/express
EXPECT_EXIT=0_or_1

code-to-gate analyze ./repos/react-admin --emit all --out .qh/acceptance/react
EXPECT_EXIT=0_or_1

code-to-gate analyze ./repos/ts-utils-lib --emit all --out .qh/acceptance/ts-utils
EXPECT_EXIT=0

# 5.1.3 Schema Validation Tests
echo ">>> Schema Validation Tests"
for artifact in repo-graph.json findings.json risk-register.yaml test-seeds.json release-readiness.json audit.json; do
  code-to-gate schema validate .qh/acceptance/demo-shop-ts/$artifact
  EXPECT_EXIT=0
done

for adapter in gatefield-static-result.json state-gate-evidence.json manual-bb-seed.json workflow-evidence.json; do
  code-to-gate schema validate .qh/acceptance/demo-shop-ts/$adapter
  EXPECT_EXIT=0
done

# 5.1.4 CLI Command Tests
echo ">>> CLI Command Tests"
code-to-gate scan fixtures/demo-shop-ts --out .qh/cli-test
EXPECT_EXIT=0

code-to-gate plugin doctor
EXPECT_EXIT=0

code-to-gate plugin list
EXPECT_EXIT=0

# 5.1.5 Performance Tests
echo ">>> Performance Tests"
START=$(date +%s)
code-to-gate scan fixtures/demo-shop-ts --out .qh/perf
END=$(date +%s)
DURATION=$((END - START))
echo "Scan duration: $DURATION seconds"
EXPECT_DURATION<=30

START=$(date +%s)
code-to-gate analyze fixtures/demo-shop-ts --emit all --out .qh/perf-analyze --llm-mode none
END=$(date +%s)
DURATION=$((END - START))
echo "Analyze duration (no LLM): $DURATION seconds"
EXPECT_DURATION<=60

# 5.1.6 LLM Tests
echo ">>> LLM Tests"
code-to-gate analyze fixtures/demo-shop-ts --emit all --out .qh/llm-test --require-llm
EXPECT_EXIT=1 EXPECT_LLM_ARTIFACTS

code-to-gate analyze fixtures/demo-shop-ts --emit all --out .qh/llm-fail --llm-mode none --require-llm
EXPECT_EXIT=4

# 5.1.7 Export Tests
echo ">>> Export Tests"
code-to-gate export gatefield --from .qh/acceptance/demo-shop-ts --out .qh/export/gatefield.json
EXPECT_EXIT=0

code-to-gate export sarif --from .qh/acceptance/demo-shop-ts --out .qh/export/results.sarif
EXPECT_EXIT=0

echo "=== Phase 1 α Acceptance Test Complete ==="
```

### 5.2 Phase 2 β Acceptance Commands

```bash
#!/bin/bash
# acceptance-phase2.sh

echo "=== Phase 2 β Acceptance Test ==="

# Phase 1 tests (re-run)
./acceptance-phase1.sh

# 5.2.1 Medium Repo Tests
echo ">>> Medium Repo Tests"
time code-to-gate scan fixtures/demo-medium --out .qh/acceptance/medium
EXPECT_DURATION<=45

time code-to-gate analyze fixtures/demo-medium --emit all --out .qh/acceptance/medium-analyze --llm-mode none
EXPECT_DURATION<=120

# 5.2.2 Monorepo Tests
echo ">>> Monorepo Tests"
code-to-gate analyze fixtures/demo-monorepo --emit all --out .qh/acceptance/monorepo
EXPECT_PACKAGE_BOUNDARY

# 5.2.3 Plugin SDK Tests
echo ">>> Plugin SDK Tests"
code-to-gate plugin validate fixtures/plugins/custom-rule
EXPECT_EXIT=0

code-to-gate analyze fixtures/demo-shop-ts --plugin fixtures/plugins/custom-rule --out .qh/plugin-custom
EXPECT_CUSTOM_FINDINGS

# 5.2.4 Contract Tests
echo ">>> Contract Tests"
code-to-gate export gatefield --from .qh/acceptance/demo-shop-ts --out test-gatefield.json
code-to-gate schema validate test-gatefield.json --schema schemas/integrations/gatefield.schema.json
EXPECT_EXIT=0

# Similar for other adapters...

# 5.2.5 Suppression Tests
echo ">>> Suppression Tests"
code-to-gate analyze fixtures/demo-shop-ts --policy fixtures/policies/with-suppressions.yaml --out .qh/suppression
EXPECT_SUPPRESSED_FINDING_COUNT=EXPECTED-1

# 5.2.6 Historical Tests
echo ">>> Historical Tests"
code-to-gate analyze fixtures/demo-shop-ts --out .qh/historical-previous
# Make changes...
code-to-gate analyze fixtures/demo-shop-ts --out .qh/historical-current --baseline .qh/historical-previous/release-readiness.json
EXPECT_COMPARISON_ARTIFACT

# 5.2.7 Local LLM Tests
echo ">>> Local LLM Tests"
code-to-gate analyze fixtures/demo-shop-ts --llm-provider ollama --llm-model llama3 --out .qh/ollama
EXPECT_LLM_ARTIFACTS

# 5.2.8 Web Viewer Tests
echo ">>> Web Viewer Tests"
code-to-gate viewer --from .qh/acceptance/demo-shop-ts --port 3000 &
sleep 5
curl http://localhost:3000/api/repo-graph
EXPECT_JSON_RESPONSE

echo "=== Phase 2 β Acceptance Test Complete ==="
```

### 5.3 Phase 3 v1.0 Acceptance Commands

```bash
#!/bin/bash
# acceptance-phase3.sh

echo "=== Phase 3 v1.0 Acceptance Test ==="

# Phase 2 tests (re-run)
./acceptance-phase2.sh

# 5.3.1 Large Repo Tests
echo ">>> Large Repo Tests"
time code-to-gate scan fixtures/demo-large --out .qh/acceptance/large
EXPECT_DURATION<=120

# 5.3.2 Python Tests
echo ">>> Python Tests"
code-to-gate analyze fixtures/demo-batch-py --emit all --out .qh/acceptance/python
EXPECT_PYTHON_GRAPH EXPECT_PYTHON_FINDINGS

# 5.3.3 Mixed Tests
echo ">>> Mixed Tests"
code-to-gate analyze fixtures/demo-mixed-ts-py --emit all --out .qh/acceptance/mixed
EXPECT_BOTH_LANGUAGES

# 5.3.4 Web Viewer Full Tests
echo ">>> Web Viewer Full Tests"
code-to-gate viewer --from .qh/acceptance/demo-shop-ts --port 3000 --full &
sleep 5
curl http://localhost:3000/api/repo-graph
curl http://localhost:3000/api/findings
curl http://localhost:3000/api/risk-register
EXPECT_ALL_ENDPOINTS

# 5.3.5 Schema Stability Tests
echo ">>> Schema Stability Tests"
# Check changelog for past 6 months
git log --oneline --since="6 months ago" schemas/
EXPECT_NO_BREAKING_CHANGE_COMMIT

# 5.3.6 Plugin Ecosystem Tests
echo ">>> Plugin Ecosystem Tests"
npm search @code-to-gate/plugin
EXPECT_PUBLIC_PLUGINS>=3

# 5.3.7 Adoption Tests
echo ">>> Adoption Tests"
curl https://api.github.com/repos/code-to-gate/code-to-gate | jq '.stargazers_count'
EXPECT_STARS>=100

echo "=== Phase 3 v1.0 Acceptance Test Complete ==="
```

---

## 6. Acceptance Evidence

### 6.1 Artifact Evidence

受入時に収集必須の artifact evidence。

| artifact | path | 用途 |
|---|---|---|
| repo-graph.json | `.qh/repo-graph.json` | Schema validation evidence |
| findings.json | `.qh/findings.json` | FP/FN evaluation evidence |
| risk-register.yaml | `.qh/risk-register.yaml` | Risk generation evidence |
| test-seeds.json | `.qh/test-seeds.json` | Seed generation evidence |
| release-readiness.json | `.qh/release-readiness.json` | Readiness evaluation evidence |
| audit.json | `.qh/audit.json` | Audit metadata evidence |
| gatefield-static-result.json | `.qh/gatefield-static-result.json` | Adapter schema evidence |
| state-gate-evidence.json | `.qh/state-gate-evidence.json` | Adapter schema evidence |
| manual-bb-seed.json | `.qh/manual-bb-seed.json` | Adapter schema evidence |
| workflow-evidence.json | `.qh/workflow-evidence.json` | Adapter schema evidence |
| results.sarif | `.qh/results.sarif` | SARIF schema evidence |

### 6.2 Exit Code Evidence

各コマンドの exit code を記録。

```yaml
# exit-code-evidence.yaml
run_id: acceptance-phase1-001
date: 2026-05-01

commands:
  - command: "code-to-gate fixture run demo-shop-ts"
    exit_code: 1
    expected: 1
    result: pass
  
  - command: "code-to-gate schema validate .qh/findings.json"
    exit_code: 0
    expected: 0
    result: pass
  
  - command: "code-to-gate analyze demo-shop-ts --require-llm --llm-mode none"
    exit_code: 4
    expected: 4
    result: pass
```

### 6.3 Schema Validation Evidence

Schema validation 結果を記録。

```yaml
# schema-validation-evidence.yaml
run_id: acceptance-phase1-001
date: 2026-05-01

validations:
  - artifact: repo-graph.json
    schema: schemas/repo-graph.schema.json
    result: pass
    errors: []
  
  - artifact: findings.json
    schema: schemas/findings.schema.json
    result: pass
    errors: []
  
  - artifact: gatefield-static-result.json
    schema: schemas/integrations/gatefield.schema.json
    result: pass
    errors: []
```

### 6.4 Timing Evidence

性能測定結果を記録。

```yaml
# timing-evidence.yaml
run_id: acceptance-phase1-001
date: 2026-05-01

measurements:
  - operation: scan-small-repo
    repo: demo-shop-ts (150 files)
    duration_seconds: 18
    target_seconds: 30
    result: pass
  
  - operation: analyze-small-repo-no-llm
    repo: demo-shop-ts (150 files)
    duration_seconds: 45
    target_seconds: 60
    result: pass
  
  - operation: schema-validation
    artifact_count: 11
    duration_seconds: 3
    target_seconds: 5
    result: pass
```

### 6.5 FP/FN Evaluation Evidence

FP/FN 評価結果を記録。

```yaml
# fp-fn-evidence.yaml
evaluation_id: fp-fn-phase1-001
date: 2026-05-01
evaluator: tech-lead

fp_evaluation:
  repo: express-example
  findings_count: 15
  tp_count: 12
  fp_count: 2
  uncertain_count: 1
  fp_rate: 13.3%
  target: <= 15%
  result: pass

fn_evaluation:
  fixture: demo-shop-ts + demo-auth-js
  seeded_smells_count: 10
  detected_count: 9
  detection_rate: 90%
  target: >= 80%
  result: pass
  
  missed_smells:
    - seeded_id: S010
      rule_id: HIGH_FANOUT_CHANGE
      reason: "Diff mode required"
```

### 6.6 Documentation Evidence

Documentation review 結果を記録。

```yaml
# documentation-evidence.yaml
review_id: doc-phase1-001
date: 2026-05-01
reviewer: pm

documents:
  - path: README.md
    required_sections:
      - Scope: present
      - Non-goals: present
      - Quickstart: present
      - License: present
      - Origin Policy: present
    result: pass
  
  - path: docs/quickstart.md
    required_sections:
      - Installation: present
      - First scan: present
      - Analyze: present
      - Readiness: present
    result: pass
  
  - path: docs/cli-reference.md
    commands_documented: all
    result: pass
```

### 6.7 Evidence Package Structure

受入証跡パッケージ構成。

```
.qh/acceptance-evidence/
  ├─ artifacts/
  │   ├─ demo-shop-ts/
  │   │   ├─ repo-graph.json
  │   │   ├─ findings.json
  │   │   ├─ ... (all artifacts)
  │   ├─ demo-auth-js/
  │   ├─ express-example/
  │   └─ ...
  ├─ exit-code-evidence.yaml
  ├─ schema-validation-evidence.yaml
  ├─ timing-evidence.yaml
  ├─ fp-fn-evidence.yaml
  ├─ documentation-evidence.yaml
  └─ acceptance-summary.yaml
```

---

## 7. Risks

### 7.1 Acceptance Risks

受入をブロックする可能性のある risk。

| id | priority | risk | impact | mitigation |
|---|---:|---|---|---|
| A-RISK-01 | P1 | AST parser library breaking change | Parser failure, text fallback only | Library abstraction + fallback |
| A-RISK-02 | P1 | FP rate > target | No-Go 判定 | Rule tuning + suppression |
| A-RISK-03 | P1 | Performance > target | No-Go 判定 | Optimization + parallel |
| A-RISK-04 | P2 | LLM provider API change | LLM failure | Provider abstraction + fallback |
| A-RISK-05 | P2 | GitHub API change | PR comment/Checks failure | API versioning + fallback |
| A-RISK-06 | P2 | Real repo access issue | Real repo test skip | Fixture-based test + public repo |
| A-RISK-07 | P3 | Schema breaking change | Schema validation fail | Schema versioning |
| A-RISK-08 | P3 | Plugin SDK complexity | Plugin feature delay | Phase 2 conditional Go |
| A-RISK-09 | P3 | Adoption low | v1.0 No-Go | Marketing + community |

### 7.2 Risk Monitoring

各 risk の monitoring 方法。

| risk | monitoring trigger | action |
|---|---|---|
| A-RISK-01 | Parser failure rate > 5% | Fallback review + library update |
| A-RISK-02 | FP rate > 15% (Phase 1) | Rule tuning session |
| A-RISK-03 | Performance > 2x target | Performance optimization sprint |
| A-RISK-04 | LLM provider deprecation | Provider migration plan |
| A-RISK-05 | GitHub API error rate > 10% | API version update |

---

## 8. Open Questions

### 8.1 GO Blockers

現時点でプロダクトレベル受入の blocker なし。

Phase 1 α:
- Blocker: なし
- Conditional: FP rate 15-20% 可能性あり (suppression で管理)

Phase 2 β:
- Blocker: なし (Phase 1 GO 後)
- Conditional: Plugin SDK 実装 delay 可能性あり

Phase 3 v1.0:
- Blocker: なし (Phase 2 GO 後)
- Conditional: Adoption metrics delay 可能性あり

### 8.2 Follow-up Questions (Phase 1)

| id | question | 影響 | 解決 timing |
|---|---|---|---|
| Q-P1-01 | AST parser ライブラリ選択 (TypeScript compiler vs Babel vs tree-sitter) | Parser 動作 | Phase 1 prep |
| Q-P1-02 | GitHub App vs PAT for PR comment | PR comment 投稿 | Phase 1 prep |
| Q-P1-03 | FP evaluation 人手 vs automated | FP rate 精度 | Phase 1 |
| Q-P1-04 | Real repo 公開 vs private | Real repo test scope | Phase 1 prep |

### 8.3 Follow-up Questions (Phase 2)

| id | question | 影響 | 解決 timing |
|---|---|---|---|
| Q-P2-01 | Plugin sandbox 実装方式 (Docker vs WASM vs OS sandbox) | Plugin security | Phase 2 prep |
| Q-P2-02 | Web viewer 技術選択 (React vs Vue vs static HTML) | Viewer 動作 | Phase 2 prep |
| Q-P2-03 | Contract test CI integration 方法 | CI 動作 | Phase 2 prep |

### 8.4 Follow-up Questions (Phase 3)

| id | question | 影響 | 解決 timing |
|---|---|---|---|
| Q-P3-01 | Python adapter ライブラリ選択 (tree-sitter vs Python AST) | Python 動作 | Phase 3 prep |
| Q-P3-02 | Large repo optimization 方法 | Performance | Phase 3 prep |
| Q-P3-03 | Adoption marketing 方法 | Adoption metrics | Phase 3 |

---

## 9. Next Actions

### 9.1 Immediate Actions

| id | action | owner | timing | priority |
|---|---|---|---|---:|
| NA-A01 | `acceptance-phase1.sh` 作成 | QA | Immediate | P1 |
| NA-A02 | FP evaluation template 作成 | QA | Immediate | P1 |
| NA-A03 | Real repo evaluation list 作成 | QA | Immediate | P1 |
| NA-A04 | GitHub Actions test workflow 作成 | Dev | Immediate | P1 |
| NA-A05 | AST parser ライブラリ評価 | Dev | Phase 1 prep | P1 |

### 9.2 Phase 1 Prep Actions

| id | action | owner | timing | priority |
|---|---|---|---|---:|
| NA-P1-01 | AST parser 実装 (TS/JS) | Dev | Phase 1 prep | P1 |
| NA-P1-02 | GitHub App/PAT 決定 | Dev | Phase 1 prep | P1 |
| NA-P1-03 | PR comment action 実装 | Dev | Phase 1 prep | P1 |
| NA-P1-04 | Checks action 実装 | Dev | Phase 1 prep | P1 |
| NA-P1-05 | Demo-suppressions-ts fixture 作成 | QA | Phase 1 prep | P2 |
| NA-P1-06 | Demo-github-actions-ts fixture 作成 | QA | Phase 1 prep | P2 |

### 9.3 Phase 2 Prep Actions

| id | action | owner | timing | priority |
|---|---|---|---|---:|
| NA-P2-01 | Plugin SDK design | Dev | Phase 2 prep | P1 |
| NA-P2-02 | Plugin sandbox 決定 | Dev | Phase 2 prep | P2 |
| NA-P2-03 | Web viewer technology 決定 | Dev | Phase 2 prep | P2 |
| NA-P2-04 | Contract test CI setup | QA | Phase 2 prep | P1 |

### 9.4 Phase 3 Prep Actions

| id | action | owner | timing | priority |
|---|---|---|---|---:|
| NA-P3-01 | Python adapter design | Dev | Phase 3 prep | P1 |
| NA-P3-02 | Large repo optimization plan | Dev | Phase 3 prep | P2 |
| NA-P3-03 | Adoption marketing plan | PM | Phase 3 prep | P2 |

---

## 10. Acceptance Summary Template

受入完了時の summary template。

```yaml
# acceptance-summary.yaml
product: code-to-gate
phase: Phase 1 α
version: v0.2.0
date: 2026-05-XX
status: GO / Conditional GO / No-Go

criteria_results:
  real_repo_acceptance: pass
  fixture_acceptance: pass
  schema_acceptance: pass
  cli_acceptance: pass
  github_actions_acceptance: pass
  pr_comment_acceptance: pass
  checks_acceptance: pass
  llm_acceptance: pass
  redaction_acceptance: pass
  plugin_acceptance: pass
  performance_acceptance: pass
  fp_acceptance:
    rate: 12.5%
    target: <= 15%
    result: pass
  fn_acceptance:
    rate: 85%
    target: >= 80%
    result: pass
  documentation_acceptance: pass
  release_readiness_acceptance: pass

go_criteria:
  all_acceptance_tests_pass: true
  fp_rate_target: true
  documentation_complete: true
  performance_targets: true

conditional_criteria: []

no_go_criteria: []

blockers: []

evidence_package: .qh/acceptance-evidence/

decision: GO
decision_date: 2026-05-XX
decision_by: tech-lead
notes: "Phase 1 α ready for release. FP rate 12.5% within target. Performance meets requirements."
```

---

## 11. Reference Documents

本書の参照文書。

| 文書 | path | 用途 |
|---|---|---|
| v0.1 Acceptance | `docs/acceptance-v0.1.md` | v0.1 MVP 受入基準 |
| Product Requirements | `docs/product-requirements-v1.md` | プロダクトレベル要件 |
| Product Specification | `docs/product-spec-v1.md` | プロダクトレベル仕様 |
| Artifact Contracts | `docs/artifact-contracts.md` | Artifact 型定義 |
| Error Model | `docs/error-model.md` | Exit code 定義 |
| LLM Trust Model | `docs/llm-trust-model.md` | LLM 信頼モデル |
| Plugin Security Contract | `docs/plugin-security-contract.md` | Plugin security |
| Fixture Spec | `docs/fixture-spec-v0.1.md` | Fixture 仕様 |
| Core Schemas | `schemas/*.schema.json` | Core artifact schema |
| Adapter Schemas | `schemas/integrations/*.schema.json` | Adapter schema |

---

## 12. Appendix

### 12.1 Acceptance Checklist (Phase 1)

Phase 1 α 受入 checklist。

```
Phase 1 α Acceptance Checklist

[ ] 3.1.1 Real Repo Acceptance
    [ ] 3+ public repos
    [ ] 100-500 files each
    [ ] scan/analyze/readiness works
    [ ] exit code correct

[ ] 3.1.2 Fixture Acceptance
    [ ] demo-shop-ts: blocked_input
    [ ] demo-auth-js: needs_review
    [ ] demo-ci-imports: import success
    [ ] demo-suppressions-ts: suppression works
    [ ] demo-github-actions-ts: workflow works

[ ] 3.1.3 Schema Acceptance
    [ ] Core artifacts schema validation
    [ ] Adapter artifacts schema validation
    [ ] SARIF schema validation

[ ] 3.1.4 CLI Acceptance
    [ ] scan works
    [ ] analyze works
    [ ] diff works
    [ ] import works
    [ ] readiness works
    [ ] export works
    [ ] plugin works
    [ ] schema works
    [ ] fixture works

[ ] 3.1.5 GitHub Actions Acceptance
    [ ] workflow runs
    [ ] exit code handled
    [ ] artifact uploaded
    [ ] SARIF uploaded

[ ] 3.1.6 PR Comment Acceptance
    [ ] comment generated
    [ ] comment posted
    [ ] comment updated

[ ] 3.1.7 Checks Acceptance
    [ ] check run created
    [ ] annotations correct
    [ ] conclusion correct

[ ] 3.1.8 LLM Acceptance
    [ ] remote LLM works
    [ ] fallback works
    [ ] require-llm exit code 4
    [ ] unsupported_claims isolated

[ ] 3.1.9 Redaction Acceptance
    [ ] patterns redacted
    [ ] .env body not sent
    [ ] audit recorded

[ ] 3.1.10 Plugin Acceptance
    [ ] doctor works
    [ ] list works
    [ ] validate works
    [ ] core plugins loaded

[ ] 3.1.11 Performance Acceptance
    [ ] small scan <= 30s
    [ ] small analyze <= 60s (no LLM)
    [ ] schema validation <= 5s

[ ] 3.1.12 FP Acceptance
    [ ] FP rate <= 15%

[ ] 3.1.13 FN Acceptance
    [ ] Detection rate >= 80%

[ ] 3.1.14 Documentation Acceptance
    [ ] README complete
    [ ] Quickstart complete
    [ ] CLI reference complete
    [ ] Examples available

[ ] 3.1.15 Release Readiness Acceptance
    [ ] passed: exit 0
    [ ] needs_review: exit 1
    [ ] blocked_input: exit 1

[ ] 4.1 Go Criteria
    [ ] All acceptance tests pass
    [ ] FP rate <= 15%
    [ ] Documentation complete
    [ ] Performance meets targets

[ ] Evidence Package
    [ ] Artifacts collected
    [ ] Exit codes recorded
    [ ] Schema validation recorded
    [ ] Timing recorded
    [ ] FP/FN evaluation recorded
    [ ] Documentation review recorded
```

### 12.2 Exit Code Reference

| code | name | condition |
|---:|---|---|
| 0 | OK | Success / passed / passed_with_risk |
| 1 | READINESS_NOT_CLEAR | needs_review / blocked_input |
| 2 | USAGE_ERROR | CLI argument error / base not found |
| 3 | SCAN_FAILED | Parser fatal failure |
| 4 | LLM_FAILED | LLM required and failed |
| 5 | POLICY_FAILED | Policy invalid |
| 6 | PLUGIN_FAILED | Plugin failure |
| 7 | SCHEMA_FAILED | Schema validation failure |
| 8 | IMPORT_FAILED | External import failure |
| 9 | INTEGRATION_EXPORT_FAILED | Export failure |
| 10 | INTERNAL_ERROR | Unknown internal error |

### 12.3 Status Reference

| status | exit code | condition |
|---|---:|---|
| passed | 0 | No blocking findings, all thresholds pass |
| passed_with_risk | 0 | Warnings present, but passable |
| needs_review | 1 | Review required findings |
| blocked_input | 1 | Blocking findings present |
| failed | 10 | Internal error, unable to complete |