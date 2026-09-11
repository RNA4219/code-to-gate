# code-to-gate CHANGELOG

All notable changes to code-to-gate are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

## [1.6.1] - 2026-09-11 - 判定・CLIの不具合修正

- manual-bbで検出したbaseline参照、抑制YAML・不正期限、policy数値検証、readiness ID・warn_only、emit検証・SARIF、共通help、Viewerのversion表示を修正した。filter_low=falseの評価漏れも対照テストで修正した（[Task Seed 20260911-05](docs/tasks/20260911-05-manual-bb-fixes.md)）。
- v1のpartial_warning_thresholdを予約設定として仕様化し、入力完全性・allow_partialによる判定、warn_onlyの境界、rename表現を明記した。READMEのimportからexportまでの手順を同期した（[Readiness入力仕様](docs/specs/readiness-input-contract.md)）。
- policyの既知項目を解析済みYAMLから読み取り、書式による判定不一致とWindowsパスの切り詰めを修正する。同梱policyのID・件数上限を正式なキーへ整合する（[Task Seed 20260911-04](docs/tasks/20260911-04-policy-yaml-sections.md)）。
- partial policyを1行・複数行YAMLで同じように読み取り、不正な型をpolicyエラーとして拒否する（[Task Seed 20260911-03](docs/tasks/20260911-03-partial-yaml.md)）。
- 補助文書のpolicy例を理由付きの個別調整へ更新し、設定確認とGitHub/npmの配布状態を同期した（[Task Seed 20260911-02](docs/tasks/20260911-02-readiness-diff-followups.md)）。
- readinessは入力findingsを既存schemaで検証し、形式不備を成功扱いせずexit 7で拒否する（[Task Seed 20260911-02](docs/tasks/20260911-02-readiness-diff-followups.md)）。
- diffのファイル情報・指摘根拠・影響範囲を指定headの固定commitから生成し、checkoutや未コミット編集による結果の変動を解消する（[Task Seed 20260911-02](docs/tasks/20260911-02-readiness-diff-followups.md)）。
- 削除だけのdiffをpartialとして誤ブロックする問題を修正し、残存importerと実際の未処理ソースの判定を維持する（[Task Seed 20260911-02](docs/tasks/20260911-02-readiness-diff-followups.md)）。
- 入力不完全時の条件ID・summary・推奨操作を揃え、指摘0件でもブロック理由と再解析手順を表示する（[Task Seed 20260911-02](docs/tasks/20260911-02-readiness-diff-followups.md)）。
- 人間向けREADMEに用途別の案内、初回解析から結果を読む手順、利用上の限界を追加し、Quickstartの配布経路とCI例を同期した（[Task Seed 20260911-01](docs/tasks/20260911-01-human-readme.md)）。
- 文書のみの差分や指摘0件の正常な差分を`partial`として誤ブロックする問題を修正し、解析の完全性を読み取り・走査の結果に基づいて扱う（[Task Seed 20260911-01](docs/tasks/20260911-01-human-readme.md)）。

## [1.6.0] - 2026-09-10 - 安定版品質証跡リリース

### 追加

- 公開 `ctg/v1` artifact APIとの互換性を保ったまま、順序付き任意
  `severity_overrides` policyを追加した。selectorの検証、元severityと適用後severity、
  理由の証跡を持ち、analyze/readiness/baselineとpolicy評価で同じ結果を使う。
- `precision-review`のprivate運用JSONとローカルHTML画面を追加した。根拠コード、検索・分類、
  日本語コメント、JSON保存・再開に対応し、AI reviewerと人手 reviewerを区別する。
  AI案や未判定を人手精度の合格根拠として扱わない。
- run ID生成を独立実行ごとに衝突しにくくし、継承artifact IDとagent requestの再利用を維持した。
  graph cache hitではsource identityを変えず実行metadataを更新する。
- 決定的なBirdseye index/capsule生成とdrift check、roadmap台帳の完了・参照検査、
  maintenance testをCIのPR coverageとRelease analyzeへ接続した。
- `diff --policy`のseverity調整を追加し、raw/effective findings、件数、audit、終了判定を
  同じpolicy評価へ統一した。

### 改善・修正

- MarkdownとHTML Viewerに元severity、適用severity、調整理由を表示し、public profileでは
  privateな追加詳細を公開しない。表示用scriptへの本文露出も修正した。
- policy入力の引用・数値・`release-risk`解釈を厳密化し、不正policyはfail closedとした。
  precision-reviewの入力・出力保護、import artifactのrepo binding、既存出力の上書き防止を強化した。
- PATH入力の誤検知を修正し、Birdseyeのsource/testリンクが指定root外へ出ないことを確認する。
  コード取得ではUTF-8 bytes上限を明示検査し、成功結果でも上限超過本文を表示しない。
- js-yamlを4.3.2、Vitest/coverage-v8を4.1.11へ更新し、root `fast-uri`を3.1.7、
  demo fixtureの`qs`を6.16.0へ更新した。

### セキュリティ・証跡（PR #17以降）

- v1.5.1から継続するSemgrep/Gitleaksの固定metadata、CycloneDX SBOM、golden regressionを
  release gateとして検証し、scanner provenanceとhigh/critical npm auditの確認を維持する。
- evidence bundleの抽出先外path、Windows traversal、正規化後衝突を拒否し、Docker commandを
  argvで実行する。timeout時はplugin process treeを終了する。
- rule precision、LARGE_MODULE/count threshold、QEG 0.2 wire contract、security scope付き
  SARIF export、生成済みhash-backed artifact参照を修正した。Python cacheとrepo内生成物は
  bounded discoveryから除外する。

### 検証

- PR #20の最終CI 15 checksは成功した。現main `a793d2f`のRelease Readiness run
  `34429572590`とSecurity run `34429572444`も成功した。
- 全体テストは3,814 passed + 4 skipped。UTF-8上限修正のsource対象は6 testsで成功し、
  最終coverageは1,860 passed + 4 skipped、Statements 88.82%、Branches 80.67%、
  Functions 94.69%、Lines 89.80%だった。
- 配布package smoke、schema・dependency検証、Birdseye生成/check、実ブラウザのprecision-review
  操作を確認した。統合記録は[AC-20260910-12](docs/acceptance/AC-20260910-12-follow-up.md)、
  CI統合の詳細は[AC-20260910-14](docs/acceptance/AC-20260910-14-ci-integration.md)に記録する。

### 公開範囲

- [詳細なリリースノート](docs/releases/v1.6.0.md)と[公開検収・承認記録](docs/acceptance/AC-20260910-15-release-1.6.0.md)を参照。
- Task Seed: [01](docs/tasks/20260910-01-ledger-sync.md)、[02](docs/tasks/20260910-02-precision-review.md)、[03](docs/tasks/20260910-03-release-prep.md)、[04](docs/tasks/20260910-04-birdseye.md)、[05](docs/tasks/20260910-05-severity-tuning.md)。
- 追加Task Seed: [07](docs/tasks/20260910-07-ci-maintenance.md)、[08](docs/tasks/20260910-08-run-identity.md)、[09](docs/tasks/20260910-09-diff-severity.md)、[10](docs/tasks/20260910-10-precision-workbench.md)、[11](docs/tasks/20260910-11-severity-report.md)、[12](docs/tasks/20260910-12-release-1.6.0.md)。
- precision-reviewの実repo分類はAI案または未判定であり、実機の人手精度合格を主張しない。
- GitHub Release [v1.6.0](https://github.com/RNA4219/code-to-gate/releases/tag/v1.6.0)とtagは公開済み。
  npm publishの状態は[`docs/distribution-status.md`](docs/distribution-status.md)で管理する。

---

## [1.5.1] - 2026-07-22 - Security Gate Hardening Release

### Added

- Pinned Semgrep and Gitleaks security checks with reproducible toolchain metadata.
- CycloneDX SBOM generation and golden regression fixtures for the security gate.

### Security

- Run dependency installation without lifecycle scripts in the security gate.
- Verify scanner provenance and block high or critical npm audit findings.

### Changed

- Document the security gate, its update procedure, and local verification commands.
- Synchronize the runtime, package, distribution status, and release metadata at `1.5.1`.

---

## [1.5.0] - 2026-07-12 - Security and SQL Database Analysis Release

### Added

- SPEC-29 SQL/database migration analysis behind `--database-analysis`.
- Experimental `database-assets@v1alpha1` artifact with dialect and diagnostic evidence.
- Base/head database operation diffing that reports only newly introduced DB risks.
- Artifact-only Assurance Smell Detector and assurance finding vocabulary.
- Git diff access contract and four review-required diff semantic rules.
- `assurance inspect` diff analysis and QEG assurance evidence export.
- Precision evaluation suite for diff semantic findings.

### Security

- Reject evidence bundle entries that escape the extraction directory, including
  Windows-style traversal, absolute paths, and normalized destination collisions.
- Execute Docker commands with argument arrays instead of shell-concatenated
  command strings.
- Terminate timed-out plugin process trees before retrying execution.

### Changed

- Database findings now flow through risk, test seed, SARIF, and readiness inputs.
- Database artifacts redact credential-like values and preserve partial-analysis diagnostics.
- Split diff semantic rules into focused modules while preserving the public API.
- Extended QEG evidence with assurance findings without transferring release decision ownership.
- `plugin-sandbox run` now requires an explicit `--sandbox docker|none`; missing
  or invalid values return usage exit code `2`, and `none` emits a host-execution warning.
- npm package, coverage, macOS, and pinned QEG checks are enforced as release gates.

### Fixed

- Include `dist/redaction/` in the npm package so the installed CLI can start.
- Generate `coverage-summary.json` and enforce the documented 80% thresholds in Vitest.

---

## [1.4.2] - 2026-06-08 - Quality Contract and Test Performance Release

### Added

- QEG evidence export and input adapter contracts.
- Raw findings and normalized repository graph schema coverage.
- Architecture boundary tests and package smoke validation.
- Explicit Tree-sitter opt-in regression tests.

### Changed

- Tree-sitter initialization now occurs only when `--tree-sitter` is specified.
- Normal tests use a process-isolated parallel group while Tree-sitter tests run in a dedicated serial group.
- Acceptance fixtures reuse generated artifacts instead of repeating identical CLI analysis.

### Fixed

- PR analysis workflow now distinguishes evidence-producing quality exit codes from execution failures.
- Schema validation, self-analysis contracts, YAML output, and false-positive handling were aligned.

---

## [1.4.1] - 2026-05-31 - CI Fix Release

### Fixed

- **CI audit job**: Added `mkdir -p .qh` before generating `audit.json` to fix "No such file or directory" error
- **Test version assertion**: Changed hardcoded version `'1.3.0'` to dynamic `VERSION` import in `audit-writer.test.ts`

---

## [1.4.0] - 2026-05-31 - Public Readiness Release

### Added

- Static typed language baseline expansion:
  - C# and C++ file detection, test detection, and entrypoint detection
  - C# `using` / controller attribute parsing
  - C++ `#include` / class / function parsing
  - `fixtures/demo-multilang` coverage for Go / Rust / Java / PHP / C# / C++
  - Integration and unit tests for multi-language static support

### Documentation

- Updated blueprint, roadmap, language-support specs, and completion record to distinguish the new regex baseline from future tree-sitter upgrades.

---

## [1.3.0] - 2026-05-03 - Phase 5 Tree-sitter Adapters

### Added

- **Python tree-sitter WASM adapter**: `src/adapters/py-tree-sitter-adapter.ts`
  - Dynamic import pattern for web-tree-sitter module
  - Python grammar loading from CDN
  - Regex fallback when WASM unavailable
  - Import statements, function definitions, class definitions parsing
  - Method extraction from class bodies
  - Type hints extraction (returnType, parameterTypes)
  - 13 tests in `src/adapters/__tests__/py-tree-sitter-adapter.test.ts`

- **Ruby tree-sitter WASM adapter**: `src/adapters/rb-tree-sitter-adapter.ts`
  - Dynamic import pattern for web-tree-sitter module
  - Ruby grammar loading from CDN
  - Regex fallback when WASM unavailable
  - require/require_relative statements parsing
  - Method definitions, singleton methods, class/module definitions
  - Inheritance tracking (superclass)
  - 14 tests in `src/adapters/__tests__/rb-tree-sitter-adapter.test.ts`

- **Go tree-sitter WASM adapter**: `src/adapters/go-tree-sitter-adapter.ts`
  - Dynamic import pattern for web-tree-sitter module
  - Go grammar loading from CDN
  - Regex fallback when WASM unavailable
  - Import statements (single and block), function/method definitions
  - Struct and interface definitions
  - 13 tests in `src/adapters/__tests__/go-tree-sitter-adapter.test.ts`

- **Rust tree-sitter WASM adapter**: `src/adapters/rs-tree-sitter-adapter.ts`
  - Dynamic import pattern for web-tree-sitter module
  - Rust grammar loading from CDN
  - Regex fallback when WASM unavailable
  - Use statements, function definitions (pub/async)
  - Struct, enum, trait definitions
  - 14 tests in `src/adapters/__tests__/rs-tree-sitter-adapter.test.ts`

### Implementation Notes

- **Dynamic import pattern**: web-tree-sitter doesn't have proper TypeScript exports, so adapters use `any` types with dynamic imports
- **WASM availability**: In Node.js environment, WASM loading may fail (needs browser or special WASM setup); adapters gracefully fall back to regex parsing
- **Regex fallback features**: Basic import/require/use, function/class/method definitions; advanced features (class body methods, type hints, singleton methods) only available with WASM

### Test Status

- 54 new Phase 5 tests (Python 13 + Ruby 14 + Go 13 + Rust 14) ✅
- Smoke tests: 54 passed ✅
- Total tests: 2655 passed ✅

---

## [1.2.0] - 2026-05-03 - Phase 4 Implementation

### Added

- **Dataflow-lite module**: Simple data flow analysis
  - `src/core/dataflow-lite.ts`: Variable assignment tracking, function argument flow, return value flow
  - Functions: extractAssignDataflow, extractParamDataflow, extractReturnDataflow
  - Functions: trackCallToReturn, trackDataflowChain, isClientTrustedSource, flowsToPayment
  - 14 tests in `src/core/__tests__/dataflow-lite.test.ts`

- **Type inference tracking**: TypeScript type information extraction
  - `src/adapters/ts-adapter.ts`: Added typeInfo field to SymbolNode
  - Functions: extractTypeInformation, extractMethodTypeInformation, extractClassImplements
  - Tracks returnType, parameterTypes, implements interface
  - 8 tests in `src/adapters/__tests__/type-inference.test.ts`

- **SymbolNode typeInfo field**: Extended type definition in `src/types/graph.ts`
  - returnType?: string
  - parameterTypes?: Array<{ name: string; type: string }>
  - inferredType?: string
  - implements?: string[]

### Deferred

- **Python tree-sitter**: Deferred to Phase 5 due to web-tree-sitter API complexity
  - Current regex-based adapter sufficient for OSS use
  - tree-sitter WASM loading complexity exceeds benefit

### Test Status

- 22 new Phase 4 tests (14 + 8) ✅
- Smoke tests: 54 passed ✅
- Integration tests: 108 passed ✅
- Total tests: 2574 passed / 3 skipped ✅
- Schema validation: typeInfo validated ✅

### Fixed

- **Test timeout improvements**: Extended timeouts for Windows reliability
  - vitest.config.ts: testTimeout 30s → 60s
  - tests/integration/helper.ts: runCli timeout parameter with 60s default
  - tests/integration/full-flow.test.ts: concurrent retry logic + assertion relaxation
  - tests/integration/parallel-worker.test.ts: timeout 180s → 240s, retry on failure

---

## [1.1.1] - 2026-05-03 - Phase 4+ Gap Re-evaluation

### Documentation

- **Phase 4+ roadmap document**: Created `docs/phase-4-roadmap.md`
  - Dataflow-lite design: new module `src/core/dataflow-lite.ts`
  - Type inference tracking: ts-morph `getType()` API utilization
  - tree-sitter expansion: Python/Ruby/Go/Rust future implementation

- **Call graph extraction confirmed complete**: All adapters implement `kind: "calls"`
  - ts-adapter.ts: lines 153-164, 208-218
  - js-ast-handlers.ts: line 453
  - py-parser-functions.ts: line 140
  - rb-adapter.ts: line 291

- **Gap analysis updated**: `docs/product-gap-analysis.md` Section 0.4
  - Call graph extraction: changed from Phase 4+ to ✓ 完了
  - Remaining gaps: Dataflow-lite, Type inference, tree-sitter expansion

### Changed

- `docs/ast-parser-evaluation.md`: Added Appendix A (Call Graph Status) and Appendix B (Phase 4+ Items)
- `docs/completion-record.md`: Added Phase 4+ Gap Re-evaluation section

---

## [1.1.0] - 2026-05-03 - Feature Completion & Type Safety

### Added

- **test-seeds.json generation**: Automatic test design recommendations from findings
  - Maps findings to test intents (negative, abuse, boundary, regression, smoke)
  - Suggests test levels based on severity (critical → e2e, high → integration)
  - Tracks oracle gaps for low-confidence findings
  - Generated via `analyze --emit all`

- **invariants.json generation**: Business/security invariant candidates from findings
  - Derives invariants from security, auth, payment, validation findings
  - Includes evidence binding and confidence levels
  - Generated via `analyze --emit all`

- **Coverage import parser**: Parse coverage reports into findings
  - Supports JSON coverage map format
  - Detects low line/function coverage (< 50%)
  - Usage: `import coverage <coverage-file> --out <dir>`

### Changed

- **Type safety improvements**: Reduced `no-explicit-any` warnings
  - CLI command parsers now use typed interfaces
  - AST adapter boundaries use typed node references
  - Remaining `any` limited to external library integrations

### Test Status

- 2555+ tests passing (92 test files) ✅
- All artifacts schema-validated ✅

---

## [1.0.2] - 2026-05-03 - Integration Tests Stabilization

### Fixed

- **Windows EPERM race condition**: Added retry logic in integration test helper
  - `tests/integration/helper.ts`: `createTempOutDir` and `cleanupTempDir` now retry on EPERM errors
  - Resolves Windows file lock race condition during temp directory cleanup

- **Integration tests isolation**: Reduced race conditions in full-flow tests
  - `tests/integration/full-flow.test.ts`: Each describe block now uses independent subdirectory
  - Added `beforeAll` hooks to create isolated output directories per test group
  - Schema coverage tests: Added `beforeEach` for tempDir existence check

- **Parallel worker timeout**: Adjusted test parameters for reliability
  - Timeout increased from 120s to 180s for large fixture tests
  - File count reduced from 150 to 110 (still exceeds 100 threshold)

- **RUNBOOK consistency**: Updated vitest coverage status
  - Section 6.1: Changed "未解決" to "全解消確認"
  - Section 6.13: Updated integration tests status to "108 passed"

### Test Status

- 2552+ tests passing (92 test files) ✅
- Integration tests: 108 passed ✅ (previously 4 failed)
- Smoke tests: 54 passed ✅

---

## [1.0.1] - 2026-05-03 - Post-v1 Cleanup & Refactoring

### Added

- **ESLint v10 with flat config**: Modern ESLint setup with typescript-eslint
  - `eslint.config.js`: Flat config format (ESLint v9+ requirement)
  - Scripts: `npm run lint`, `npm run lint:fix`
  - Rules: recommended configs + custom overrides for TypeScript
  - Initial run: 360 issues identified (280 errors, 80 warnings)
  - After fixes: 0 errors, 324 warnings (all acceptable)

### Fixed

- **Lint error fixes**: Reduced all ESLint errors to warnings
  - Fixed unnecessary escape characters in regex patterns (6 files)
  - Fixed useless assignment warnings (variable initialization cleanup)
  - Added globals for vitest/mocha test functions (describe, it, expect, etc.)
  - Configured `prefer-const` as warning instead of error

### Fixed

- **diff command**: Now generates `diff-analysis.json` even when no changes detected between base and head refs (previously returned early without generating artifact)

- **yaml-reporter**: Changed `recommendedActions` to `recommended-actions` (hyphen format) for YAML key naming consistency

- **parallel-worker tests**: Increased timeout from 60s to 120s for large fixture tests (150+ files)

### Changed

- **Test mock consolidation**: Created centralized test utility module
  - New: `src/test-utils/mocks.ts` with reusable mock generators
  - Functions: `createMockFinding`, `createMockFindingsArtifact`, `createMockRiskRegisterArtifact`, `createMockTestSeedsArtifact`, `createMockReleaseReadinessArtifact`, `createMockRisk`, `createMockTestSeed`
  - Updated 13 test files to use shared mocks instead of duplicated local functions
  - Reduced ~200 lines of redundant mock code across test files

- **Documentation updated to v1**:
  - `CLAUDE.md`: Version reference changed from `ctg/v1alpha1` to `ctg/v1`
  - `GUARDRAILS.md`: Guardrail #5 updated to `ctg/v1`
  - `.ctg/suppressions.yaml`: Version field changed to `ctg/v1`

### Test Status

- 2552+ tests passing (92 test files) ✅
- Smoke tests: 54 passed ✅
- ESLint: 0 errors, 324 warnings

---

## [1.0.0] - 2026-04-30 - Schema v1 Stable Freeze

### Added

- **Policy-Loader Unit Tests**: 29 tests for policy-loader.ts
  - createDefaultPolicy, isValidPolicyVersion, validatePolicy
  - loadPolicyFile (YAML parsing for blocking severity/category/rules)
  - loadSuppressionFile, isSuppressed (glob patterns, expiry)

### Fixed

- **P0: Policy Handling Unification**
  - Removed duplicate `loadPolicy()` from `analyze.ts`
  - Now uses `loadPolicyFile()` from `policy-loader.ts` for consistent parsing
  - Updated `audit-writer.ts` to use `CtgPolicy` type with `policyId` field
  - Added helper functions: `isSeverityBlocked`, `isCategoryBlocked`, `isRuleBlocked`

- **P1: Scan Exclusion Pattern**
  - `.qh*` directories now excluded from scan (`.qh-test`, `.qh-auth`, etc.)
  - Added `shouldIgnoreByName()` pattern matching function

- **P1: Blocked Input Summary Improvement**
  - Summary now reflects actual blocking reasons instead of generic message
  - Shows: severity counts, category counts, rule blocks, threshold exceeded
  - Example: "Blocked: 10 critical severity findings, 9 payment category findings, 9 findings from rule CLIENT_TRUSTED_PRICE"

### Changed

- `docs/product-spec-v1.md`: `test-seeds.json` and `invariants.yaml` marked as v1.1 planned (not generated in v1.0)
- Test count: 2555+ tests passing (added policy-loader 29 tests)

### Stability Guarantees
  - Core artifacts: findings, risk-register, invariants, test-seeds, release-readiness, audit, normalized-repo-graph
  - Integration schemas: state-gate-evidence, manual-bb-seed, workflow-evidence, gatefield-static-result
  - Version constant changed from `ctg/v1alpha1` to `ctg/v1`

- **Backward Compatibility Support**: v1 schemas fully backward compatible with v1alpha1 artifacts
  - `versionV1Alpha1` definition preserved in shared-defs.schema.json
  - `artifactHeaderV1Alpha1` definition for legacy artifact validation
  - TypeScript types accept both `"ctg/v1"` and `"ctg/v1alpha1"` version strings

- **Version Constants in TypeScript**: New exported constants for schema versioning
  - `CTG_VERSION_V1`: `"ctg/v1"` stable version
  - `CTG_VERSION_V1ALPHA1`: `"ctg/v1alpha1"` legacy version
  - `SCHEMA_VERSIONS`: Object mapping artifact names to schema identifiers
  - `SCHEMA_VERSIONS_V1ALPHA1`: Legacy schema version mapping

- **Schema Versioning Documentation**: `docs/schema-versioning.md`
  - Version string format specification
  - v1 stability guarantees
  - Breaking vs additive change rules
  - Backward compatibility implementation guidelines
  - Schema registry structure
  - Deprecation policy

- **Schema Migration Guide**: `docs/schema-migration-v1alpha1-to-v1.md`
  - Step-by-step migration instructions
  - Version string change tables
  - Backward compatibility testing guidance
  - Common migration issues and solutions

- **Schema Stability Tests**: `src/__tests__/acceptance/schema-stability.test.ts`
  - Schema version verification tests
  - Backward compatibility validation tests
  - Schema structure preservation tests
  - TypeScript type verification tests
  - Documentation verification tests
  - No breaking changes verification tests

### Changed

- All schema `$defs.version.const` updated from `"ctg/v1alpha1"` to `"ctg/v1"`
- Integration schema version constants updated to v1 format
- `CTG_VERSION` constant now equals `"ctg/v1"` (stable)
- Artifact TypeScript interfaces updated to accept both version strings

### Stability Guarantees

- **No breaking changes in v1**: All v1 schemas maintain exact same field structure as v1alpha1
- **Additive-only changes allowed**: New optional fields may be added without version bump
- **Backward compatibility**: v1 parsers accept v1alpha1 artifacts
- **12-month deprecation period**: v1alpha1 support until 2027-04-30

---

## [0.2.0-v1pre] - 2026-04-30

### Added (Phase 3 v1.0 preparation)
- Python adapter: regex-based import/function/class extraction for .py files
- Stable schema v1: backward compatible schema freeze (v1alpha1 -> v1)
- Large repo optimization: streaming processing for 5000+ files repos
- Release evidence bundle: ZIP bundle for workflow-cookbook Evidence format
- Plugin sandbox Docker: isolated container execution for untrusted plugins

### Added (Phase 2 OSS β)
- **Plugin SDK**: Full plugin development support
  - Plugin manifest schema (`schemas/plugin-manifest.json`)
  - stdin/stdout JSON contract
  - Timeout handling and process isolation
  - Plugin development documentation (`docs/plugin-development.md`)
- **Local LLM**: localhost-only enforcement
  - ollama provider (port 11434)
  - llama.cpp provider (port 8080)
  - `llm-health` CLI command for provider health check
  - Local-only mode: no external API calls
- **Historical Comparison**: Baseline artifact comparison
  - `historical` CLI command
  - New/resolved/unchanged findings detection
  - Regression detection framework
- **Web Viewer MVP**: Static HTML artifact viewer
  - `viewer` CLI command
  - Report viewer, graph viewer, finding viewer
- **Performance Optimization**: Incremental cache and parallel processing
  - `--cache` option (enabled/disabled/force)
  - `--parallel` option for worker threads
  - `--verbose` option for progress details
  - File hash cache, graph cache, findings cache
- **Documentation**: Phase 2 guides
  - `docs/local-llm-setup.md`
  - `docs/historical-comparison.md`
  - `docs/web-viewer.md`
  - `docs/performance-optimization.md`

### Performance (Phase 2)
- Medium repo (500-2000 files) scan: <= 45s
- Incremental cache: 70-90% faster on unchanged files
- Parallel processing: 2-4x faster for large batches

### Test Coverage (Phase 2)
- ~2100+ tests total
- Plugin tests: 47 (loader 27, runner 20)
- LLM tests: 63 (ollama 16, llamacpp 21, CLI 26)
- Historical tests: 52 (comparison 27, regression 25)
- Viewer tests: 70 (report 46, graph 24)
- Cache/Parallel tests: 38

---

## [0.2.0-alpha.1] - 2026-04-30

### Added (Phase 1 OSS α)
- **GitHub Actions Integration**: Full CI/CD support
  - PR workflow template (`code-to-gate-pr.yml`)
  - Release workflow template (`code-to-gate-release.yml`)
  - PR comment generation (`src/github/pr-comment.ts`)
  - GitHub Checks annotations (`src/github/checks.ts`)
- **Suppression System**: Finding exclusion with expiry
  - Suppression loader, matcher, validator
  - Expiry date support
- **Config/Policy System**: YAML configuration
  - Config loader (`src/config/config-loader.ts`)
  - Policy loader (`src/config/policy-loader.ts`)
  - Policy evaluator (`src/config/policy-evaluator.ts`)
- **CLI Commands**: Extended command set
  - `diff`: Git reference comparison
  - `import`: External tool import (eslint, semgrep, tsc, coverage, test)
  - `readiness`: Release readiness evaluation
  - `export`: Downstream integration export
  - `schema validate`: Artifact validation
- **Reporters**: Multiple output formats
  - SARIF v2.1.0 reporter
  - HTML reporter
  - YAML reporter
  - Markdown reporter
- **Rules**: Quality detection rules
  - CLIENT_TRUSTED_PRICE, WEAK_AUTH_GUARD, TRY_CATCH_SWALLOW
  - MISSING_SERVER_VALIDATION, UNTESTED_CRITICAL_PATH
  - RAW_SQL, ENV_DIRECT_ACCESS, UNSAFE_DELETE, LARGE_MODULE
- **Evaluation Framework**: FP/FN evaluation
  - FP evaluator, FN evaluator
- **Fixtures**: Test fixtures
  - demo-suppressions-ts, demo-github-actions-ts
  - demo-edge-cases, demo-monorepo

### Core Features (Phase 0 v0.1 MVP)
- **Core Commands**: Complete CLI implementation with 8 primary commands
  - `scan`: Repository structure analysis generating NormalizedRepoGraph
  - `analyze`: Full quality assessment with findings, risks, invariants, test seeds
  - `diff`: Git reference comparison with blast radius estimation
  - `import`: External tool result importer (Semgrep, ESLint, tsc, coverage)
  - `readiness`: Release readiness evaluation with policy support
  - `export`: Downstream integration payloads (gatefield, state-gate, manual-bb, workflow-evidence)
  - `schema validate`: Artifact and schema validation
  - `fixture`: Fixture management for testing
- **Artifact Generation**: 9 core artifacts with schema validation
  - `repo-graph.json`: Normalized repository structure
  - `findings.json`: Quality findings with evidence binding
  - `risk-register.yaml`: Risk assessment with severity and likelihood
  - `invariants.yaml`: Business and security invariant candidates
  - `test-seeds.json`: QA test design recommendations
  - `release-readiness.json`: Release status and failed conditions
  - `audit.json`: Run metadata for reproducibility
  - `analysis-report.md`: Human-readable summary
  - `results.sarif`: SARIF format for GitHub Code Scanning
- **Finding Categories**: Quality analysis across multiple domains
  - `payment`, `auth`, `validation`, `testing`, `maintainability`, `release-risk`
- **Built-in Rules**: Deterministic analysis rules
  - CLIENT_TRUSTED_PRICE, WEAK_AUTH_GUARD, MISSING_SERVER_VALIDATION
  - UNTESTED_CRITICAL_PATH, TRY_CATCH_SWALLOW, RAW_SQL
  - ENV_DIRECT_ACCESS, UNSAFE_DELETE, LARGE_MODULE
- **LLM Provider Support**: Multiple LLM backends
  - OpenAI, Anthropic, Alibaba Cloud, OpenRouter
  - ollama, llama.cpp (local inference)
- **Policy System**: YAML-based release policy configuration
- **Downstream Integration**: Export payloads for ecosystem tools
  - gatefield, state-gate, manual-bb, workflow-evidence
- **Schema Validation**: AJV-based schema validation (ctg/v1alpha1)
- **Fixture System**: Test fixtures for validation
  - demo-shop-ts, demo-auth-js, demo-ci-imports

### Security
- Redaction warnings for secrets-like strings
- Evidence-only mode for LLM claims
- `unsupported_claims` isolation for unverified LLM content
- Local-only mode via ollama/llama.cpp (no external API calls)

### Performance (Phase 1)
- Small repo (100-500 files) scan: <= 30s
- Small repo analyze (no LLM): <= 60s
- Schema validation: <= 5s

### Test Coverage (Phase 1)
- ~2000+ tests
- Alpha acceptance: 56 tests
- Contract tests: SARIF, gatefield, state-gate, manual-bb, workflow-evidence

---

## [0.1.0] - 2026-04-15

### Added
- Initial project structure
- TypeScript/JavaScript AST adapter foundation
- Schema definitions for all artifacts
- Basic CLI structure with command parsing
- Repository walker with file classification
- Symbol and relation extraction
- Entrypoint detection
- Test fixture repositories

---

## Version Naming Convention

- `alpha`: Early development, core features in progress
- `beta`: Feature-complete, undergoing testing
- `v1pre`: Pre-release for v1.0, schema freeze preparation
- `v1.0`: Production-ready release with stable schema

[0.2.0-v1pre]: https://github.com/quality-harness/code-to-gate/compare/v0.2.0-alpha.1...v0.2.0-v1pre
[0.2.0-alpha.1]: https://github.com/quality-harness/code-to-gate/releases/tag/v0.2.0-alpha.1
[0.1.0]: https://github.com/quality-harness/code-to-gate/releases/tag/v0.1.0
