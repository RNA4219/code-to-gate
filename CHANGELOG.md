# code-to-gate CHANGELOG

All notable changes to code-to-gate are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-04-30 - Schema v1 Stable Freeze

### Added

- **Stable Schema v1 Freeze**: All schemas updated to stable v1 version
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