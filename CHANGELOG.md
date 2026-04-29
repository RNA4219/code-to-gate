# code-to-gate CHANGELOG

All notable changes to code-to-gate are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.2.0-alpha.1] - 2026-04-30

### Added

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
  - `payment`: Financial and checkout-related risks
  - `auth`: Authentication and authorization issues
  - `validation`: Input validation gaps
  - `testing`: Test coverage and quality issues
  - `maintainability`: Code maintainability concerns
  - `release-risk`: General release quality risks

- **Built-in Rules**: Deterministic analysis rules
  - `CLIENT_TRUSTED_PRICE`: Detects client-supplied pricing in checkout flows
  - `WEAK_AUTH_GUARD`: Identifies authorization guard weaknesses
  - `MISSING_SERVER_VALIDATION`: Flags unvalidated request body usage
  - `UNTESTED_CRITICAL_PATH`: Detects missing test coverage on entrypoints
  - `TRY_CATCH_SWALLOW`: Identifies swallowed error handling

- **LLM Provider Support**: Multiple LLM backends for analysis enhancement
  - OpenAI (`gpt-4`, `gpt-3.5-turbo`)
  - Anthropic (`claude-sonnet-4-6`, `claude-haiku-4-5`)
  - Alibaba Cloud (`qwen-max`, `qwen-plus`)
  - OpenRouter (multi-provider access)
  - ollama (local inference)
  - llama.cpp (local GGUF models)

- **Policy System**: YAML-based release policy configuration
  - Severity thresholds (`critical`, `high`, `medium`, `low`)
  - Category thresholds (`auth`, `payment`, `validation`)
  - LLM configuration (`min_confidence`, `require_binding`)
  - Suppression rules with expiration dates

- **Downstream Integration**: Export payloads for ecosystem tools
  - `gatefield-static-result.json`: For agent-gatefield
  - `state-gate-evidence.json`: For agent-state-gate
  - `manual-bb-seed.json`: For manual-bb-test-harness
  - `workflow-evidence.json`: For workflow-cookbook

- **Output Formats**: Multiple human and machine-readable formats
  - JSON (schema-validated)
  - YAML (risk-register, invariants)
  - Markdown (analysis report)
  - SARIF (GitHub Code Scanning)
  - Mermaid (dependency diagrams)

- **Evidence Binding**: All findings backed by traceable evidence
  - File path and line numbers
  - Content hash for verification
  - External tool reference support

- **Schema Validation**: AJV-based schema validation
  - All artifacts have versioned schemas (`ctg/v1alpha1`)
  - Shared definitions for common types
  - Integration schemas for downstream payloads

- **Fixture System**: Test fixtures for validation
  - `demo-ci-imports`: CI import demonstration fixture
  - `demo-shop-ts`: E-commerce checkout fixture

### Changed

- Version updated from 0.1.0 to 0.2.0-alpha.1
- Added npm scripts: `real-repo-test`, `fp-eval` for testing

### Fixed

- Schema validation now correctly handles `$ref` resolution
- Import command properly converts Semgrep severity levels
- Export command validates required artifacts before generation

### Documentation

- Complete CLI reference: `docs/cli-reference.md`
- Quickstart guide: `docs/quickstart.md`
- Troubleshooting guide: `docs/troubleshooting.md`
- CHANGELOG: `CHANGELOG.md`

### Security

- Redaction warnings for secrets-like strings
- Evidence-only mode for LLM claims
- `unsupported_claims` isolation for unverified LLM content
- Local-only mode via ollama/llama.cpp (no external API calls)

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

## Future Releases

### [0.2.0] (Planned)

- Python adapter support
- Plugin system for custom rules
- PR comment generation
- GitHub Checks integration
- Web dashboard for analysis visualization
- Incremental analysis for CI optimization

### [0.3.0] (Planned)

- Multi-language support (Go, Rust, Java)
- Advanced blast radius calculation
- Coverage-guided test seed generation
- Historical trend analysis
- Team-specific policy profiles

---

## Version Naming Convention

- `alpha`: Early development, core features in progress
- `beta`: Feature-complete, undergoing testing
- `rc`: Release candidate, final validation
- `stable`: Production-ready release

Example: `0.2.0-alpha.1` indicates first alpha release of 0.2.0 milestone.