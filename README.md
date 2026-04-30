# code-to-gate

[![npm version](https://badge.fury.io/js/@quality-harness%2Fcode-to-gate.svg)](https://badge.fury.io/js/@quality-harness%2Fcode-to-gate)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A local-first quality harness that turns repository signals into evidence-backed quality risks, test seeds, and release-readiness gate inputs.

## v1.0.0 Release

**Stable Schema Freeze** - All schemas are now v1 with backward compatibility.

### Features

| Category | Features |
|----------|----------|
| **Languages** | TypeScript, JavaScript, Python |
| **Analysis** | 9 deterministic rules, AST parsing, evidence-backed findings |
| **Performance** | Incremental cache, parallel processing, streaming for large repos |
| **LLM** | Local-only (ollama, llama.cpp), redaction, unsupported_claims isolation |
| **CI/CD** | GitHub Actions, PR comments, Checks annotations, SARIF export |
| **Plugins** | Plugin SDK, Docker sandbox, custom rules support |
| **History** | Baseline comparison, regression detection |
| **Reports** | JSON, YAML, Markdown, HTML, SARIF v2.1.0, Evidence bundles |

## Installation

```bash
# Install globally
npm install -g @quality-harness/code-to-gate

# Or install locally
npm install --save-dev @quality-harness/code-to-gate
```

### Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js | 20+ |
| Git | 2.x (for `diff` command) |

## Quick Start

```bash
# Scan repository structure
code-to-gate scan ./my-repo --out .qh

# Run full quality analysis
code-to-gate analyze ./my-repo --emit all --out .qh

# Check release readiness with policy
code-to-gate readiness ./my-repo --policy policy.yaml --out .qh

# Export SARIF for GitHub Code Scanning
code-to-gate export sarif --from .qh --out results.sarif
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `scan` | Generate NormalizedRepoGraph from repository |
| `analyze` | Full quality assessment with findings, risks, test seeds |
| `diff` | Git reference comparison with blast radius |
| `import` | Import external tool results (ESLint, Semgrep, tsc, coverage) |
| `readiness` | Release readiness evaluation with policy |
| `export` | Export to downstream formats (SARIF, gatefield, etc.) |
| `historical` | Compare current run with baseline |
| `viewer` | Launch HTML artifact viewer |
| `llm-health` | Check local LLM provider health |
| `evidence` | Create release evidence bundle |
| `schema validate` | Validate artifacts against schemas |

## Performance Options

```bash
# Enable incremental cache
code-to-gate scan ./repo --cache enabled

# Parallel processing (4 workers)
code-to-gate scan ./repo --parallel 4

# Verbose progress output
code-to-gate scan ./repo --verbose
```

## Built-in Rules

| Rule ID | Category | Description |
|---------|----------|-------------|
| CLIENT_TRUSTED_PRICE | payment | Client-supplied pricing without validation |
| WEAK_AUTH_GUARD | auth | Authorization guard weaknesses |
| MISSING_SERVER_VALIDATION | validation | Unvalidated request body |
| UNTESTED_CRITICAL_PATH | testing | Missing test coverage on entrypoints |
| TRY_CATCH_SWALLOW | maintainability | Swallowed error handling |
| RAW_SQL | security | Raw SQL query construction |
| ENV_DIRECT_ACCESS | security | Direct environment variable access |
| UNSAFE_DELETE | maintainability | Unsafe delete operations |
| LARGE_MODULE | maintainability | Oversized modules |

## Artifact Generation

All artifacts with stable v1 schema:

| Artifact | Purpose |
|----------|---------|
| `repo-graph.json` | Normalized repository structure |
| `findings.json` | Quality findings with evidence |
| `risk-register.yaml` | Risk assessment |
| `invariants.yaml` | Business/security invariants |
| `test-seeds.json` | Test design recommendations |
| `release-readiness.json` | Release status |
| `audit.json` | Run metadata |
| `analysis-report.md` | Human-readable summary |
| `results.sarif` | SARIF v2.1.0 for GitHub |

## Downstream Integration

Export payloads for ecosystem tools:

- `gatefield-static-result.json` - agent-gatefield
- `state-gate-evidence.json` - agent-state-gate
- `manual-bb-seed.json` - manual-bb-test-harness
- `workflow-evidence.json` - workflow-cookbook

## GitHub Actions Integration

```yaml
# .github/workflows/code-to-gate-pr.yml
name: code-to-gate PR Analysis

on: [pull_request]

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm install -g @quality-harness/code-to-gate
      - run: code-to-gate scan . --out .qh
      - run: code-to-gate analyze . --emit all --out .qh
      - run: code-to-gate export sarif --from .qh --out results.sarif
      - uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: results.sarif
```

## Plugin Development

Create custom analysis rules:

```bash
# Plugin structure
my-plugin/
  manifest.json     # Plugin metadata
  index.js          # Rule implementation
```

See [docs/plugin-development.md](docs/plugin-development.md) for details.

## Local LLM Setup

```bash
# Check ollama health
code-to-gate llm-health --provider ollama

# Analyze with local LLM
code-to-gate analyze ./repo --llm-provider ollama --llm-model llama3
```

See [docs/local-llm-setup.md](docs/local-llm-setup.md) for setup instructions.

## Documentation

| Document | Purpose |
|----------|---------|
| [CLAUDE.md](CLAUDE.md) | Project context for Claude Code |
| [.claude/skills.md](.claude/skills.md) | Claude Code skills/commands |
| [CHANGELOG.md](CHANGELOG.md) | Version history |

## Repository Layout

| Path | Content |
|------|---------|
| `src/cli/` | CLI commands |
| `src/adapters/` | TS/JS/Python parsers |
| `src/rules/` | Detection rules |
| `src/cache/` | Incremental cache |
| `src/parallel/` | Parallel processing |
| `src/plugin/` | Plugin SDK, sandbox |
| `src/llm/` | Local LLM providers |
| `src/historical/` | Baseline comparison |
| `src/viewer/` | HTML viewer |
| `src/evidence/` | Evidence bundles |
| `schemas/` | JSON Schemas (v1) |
| `fixtures/` | Test fixtures |

## Test Coverage

~3000+ tests across all modules:

| Module | Tests |
|--------|-------|
| Core adapters | 150+ |
| Rules | 200+ |
| CLI commands | 300+ |
| Cache/Parallel | 50+ |
| Plugin SDK | 50+ |
| LLM providers | 70+ |
| Historical | 60+ |
| Viewer | 80+ |
| Evidence bundle | 50+ |
| Acceptance | 150+ |

## Build and Test

```bash
npm install
npm run build
npm test

# Smoke tests
npm run test:smoke

# Coverage
npm run test:coverage
```

## Scope

- Repository graph / dependency extraction
- TS/JS/Python scan and AST parsing
- Evidence-backed findings
- Code-derived risk register
- Invariant and test seed artifacts
- Release readiness evaluation
- External tool import (ESLint, Semgrep, tsc)
- Downstream gate/QA seed export
- Local-first audit and reproducibility

## Non-goals

- AI agent artifact gate engine (agent-gatefield)
- Agent approval/freshness queues (agent-state-gate)
- Manual black-box test final design (manual-bb-test-harness)
- Workflow governance (workflow-cookbook)
- Company-specific business rules in OSS core
- Proprietary source code in fixtures
- Final production release approval

## Fixtures

| Fixture | Purpose |
|---------|---------|
| `demo-shop-ts` | Checkout/payment risks, client trusted price |
| `demo-auth-js` | Auth guards, try/catch swallow |
| `demo-ci-imports` | External tool import examples |
| `demo-suppressions-ts` | Suppression behavior |
| `demo-github-actions-ts` | GitHub Actions workflow |
| `demo-python` | Python adapter examples |
| `demo-monorepo` | Monorepo package boundary |

All fixtures are synthetic. No proprietary code included.

## License

MIT License. See [LICENSE](LICENSE).

## Origin Policy

This project is an original implementation. No proprietary source code, company-specific rules, or internal analysis results are included.