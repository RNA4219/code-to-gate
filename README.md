# code-to-gate

[![Version](https://img.shields.io/badge/version-1.3.0-blue)](CHANGELOG.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![CI](https://github.com/quality-harness/code-to-gate/actions/workflows/code-to-gate-pr.yml/badge.svg)](https://github.com/quality-harness/code-to-gate/actions/workflows/code-to-gate-pr.yml)
[![Node](https://img.shields.io/badge/Node-20%2B-green)](https://img.shields.io/badge/Node-20%2B-green)

Language: English | [日本語](README_JA.md)

A local-first quality harness CLI tool that analyzes repositories for quality risks, generates evidence-backed findings, and produces release-readiness gate inputs.

---

## Overview

| Feature | Description |
|---------|-------------|
| **Repository Scanning** | Parse source files, extract symbols, build dependency graphs |
| **Quality Analysis** | Detect 14 built-in vulnerability patterns (payment, auth, validation, etc.) |
| **Release Readiness** | Generate gate inputs based on policy thresholds |
| **Evidence Generation** | Export SARIF, gatefield, state-gate, workflow-evidence formats |
| **Plugin System** | Docker-sandboxed custom rules via plugin SDK |
| **Incremental Cache** | Fast re-analysis with file-based cache |
| **LLM Integration** | Optional LLM-powered analysis with local/remote providers |

<!-- LLM-BOOTSTRAP v1 -->
Recommended read order:

1. `docs/birdseye/index.json` — Node graph (lightweight)
2. `docs/birdseye/caps/<path>.json` — Point reads for needed nodes

Focus procedure:

- Find node IDs for recently changed files within +/-2 hops from `index.json`
- Read only the matching `caps/*.json` files

<!-- /LLM-BOOTSTRAP -->

---

## Quick Start

```bash
# 1. Install dependencies
npm ci

# 2. Build
npm run build

# 3. Run smoke tests
npm run test:smoke

# 4. Analyze a repository
node ./dist/cli.js analyze ./fixtures/demo-shop-ts --out .qh

# 5. Check release readiness
node ./dist/cli.js readiness ./fixtures/demo-shop-ts --policy .github/ctg-policy.yaml --from .qh --out .qh
```

---

## CLI Commands

### Scan

```bash
# Scan repository, generate repo-graph.json
node ./dist/cli.js scan . --out .qh

# With incremental cache
node ./dist/cli.js scan . --out .qh --cache
```

### Analyze

```bash
# Full analysis with all artifacts
node ./dist/cli.js analyze . --emit all --out .qh

# With policy
node ./dist/cli.js analyze . --policy .github/ctg-policy.yaml --out .qh

# With LLM
node ./dist/cli.js analyze . --llm-provider ollama --llm-model llama3 --out .qh

# Diff analysis (PR mode)
node ./dist/cli.js diff . --base origin/main --head HEAD --policy .github/ctg-policy.yaml --out .qh
```

### Readiness

```bash
# Generate release-readiness.json
node ./dist/cli.js readiness . --policy .github/ctg-policy.yaml --from .qh --out .qh
```

### Export

```bash
# Export SARIF for GitHub Code Scanning
node ./dist/cli.js export sarif --from .qh --out .qh/results.sarif

# Export gatefield format
node ./dist/cli.js export gatefield --from .qh --out gatefield.json

# Export state-gate format
node ./dist/cli.js export state-gate --from .qh --out state-gate.json

# Export workflow-evidence format
node ./dist/cli.js export workflow-evidence --from .qh --out workflow.json
```

### Schema Validation

```bash
# Validate artifact JSON
node ./dist/cli.js schema validate .qh/findings.json

# Validate all schemas
node ./dist/cli.js schema validate-all .qh
```

### Viewer

```bash
# Generate HTML viewer
node ./dist/cli.js viewer --from .qh --out report.html
```

### LLM Health

```bash
# Check LLM provider status
node ./dist/cli.js llm-health --provider ollama

# Check all providers
node ./dist/cli.js llm-health --all
```

---

## Architecture

### Core Modules

| Module | Purpose |
|--------|---------|
| `src/cli/` | CLI commands (scan, analyze, readiness, export, etc.) |
| `src/adapters/` | Language parsers (TypeScript, JavaScript, Python, Go, Ruby, Rust) |
| `src/rules/` | Detection rules (14 built-in) |
| `src/cache/` | Incremental cache system |
| `src/parallel/` | Worker-based parallel processing |
| `src/plugin/` | Plugin SDK with Docker sandbox |
| `src/config/` | Policy loading and evaluation |
| `src/historical/` | Baseline comparison |
| `src/llm/` | LLM provider integration (OpenAI, Ollama, Anthropic) |
| `src/github/` | GitHub API integration |
| `src/evidence/` | Evidence bundle generation |
| `src/viewer/` | HTML report viewer |

### Data Flow

```
Repository → scan → repo-graph.json → analyze → findings.json → readiness → release-readiness.json
                                              ↓
                                    export → SARIF, gatefield, etc.
```

---

## Built-in Rules

| Rule | Category | Detection |
|------|----------|-----------|
| `CLIENT_TRUSTED_PRICE` | payment | Client-side price calculation |
| `WEAK_AUTH_GUARD` | auth | Weak authorization guards |
| `MISSING_SERVER_VALIDATION` | validation | Missing request validation |
| `UNTESTED_CRITICAL_PATH` | testing | Missing tests on entrypoints |
| `TRY_CATCH_SWALLOW` | maintainability | Empty/silent catch blocks |
| `RAW_SQL` | security | SQL string construction |
| `ENV_DIRECT_ACCESS` | security | Direct env var access |
| `UNSAFE_DELETE` | maintainability | Unsafe delete operations |
| `LARGE_MODULE` | maintainability | Module size thresholds |
| `HARDCODED_SECRET` | security | Hardcoded secrets/credentials |
| `MISSING_RATE_LIMIT` | security | Missing rate limiting |
| `UNSAFE_REDIRECT` | security | Unsafe redirect patterns |
| `MISSING_INPUT_SANITIZATION` | security | Unsanitized user input |
| `DEPRECATED_API_USAGE` | maintainability | Deprecated API usage |

---

## Policy System

Policies are YAML files that define blocking thresholds:

```yaml
version: ctg/v1
blocking:
  severity:
    critical: true
    high: true
    medium: false
  category:
    auth: true
    payment: true
    validation: true
```

### Policy Evaluation

- `blocking.severity`: Block on severity level
- `blocking.category`: Block on category (payment, auth, etc.)
- `blocking.rules`: Block on specific rule IDs
- `readiness.criticalFindingStatus`: Status for critical findings (`blocked_input` / `needs_review`)

---

## Integration Points

### GitHub Actions

```yaml
- name: Run code-to-gate analysis
  run: node ./dist/cli.js analyze . --emit all --out .qh

- name: Check readiness
  run: node ./dist/cli.js readiness . --policy .github/ctg-policy.yaml --from .qh --out .qh

- name: Upload SARIF
  uses: github/codeql-action/upload-sarif@v4
  with:
    sarif_file: .qh/results.sarif
```

### Downstream Consumers

| Format | Consumer |
|--------|----------|
| `gatefield.json` | Gatefield CI integration |
| `state-gate.json` | state-gate workflow |
| `workflow.json` | workflow-evidence tracking |
| `results.sarif` | GitHub Code Scanning |

---

## Documentation Guide

### Start Here

| File | Description |
|------|-------------|
| [`CLAUDE.md`](CLAUDE.md) | Project context for AI assistants |
| [`GUARDRAILS.md`](GUARDRAILS.md) | Implementation principles and bounds |
| [`CHECKLISTS.md`](CHECKLISTS.md) | Development/PR/Release checklists |

### CI / Governance

| File | Description |
|------|-------------|
| [`.github/ctg-policy.yaml`](.github/ctg-policy.yaml) | CI policy configuration |
| [`.ctg/suppressions.yaml`](.ctg/suppressions.yaml) | Suppression rules |
| [`governance/policy.yaml`](governance/policy.yaml) | Self-modification bounds, SLOs |

### Operations

| File | Description |
|------|-------------|
| [`docs/Release_Checklist.md`](docs/Release_Checklist.md) | Release procedure |
| [`docs/acceptance/`](docs/acceptance/) | Acceptance records |
| [`docs/ADR/`](docs/ADR/) | Architecture Decision Records |

---

## Development Commands

```bash
# Lint
npm run lint

# Fix lint issues
npm run lint:fix

# Full test suite
npm test

# Coverage (80% threshold)
npm run test:coverage

# Smoke tests (quick)
npm run test:smoke

# Performance tests
npm run test:performance

# Real repo tests
npm run test:real-repo

# Release validation
npm run release:validate
```

---

## Testing Conventions

- Unit tests: `src/**/__tests__/*.test.ts`
- Integration tests: `tests/integration/*.test.ts`
- Smoke tests: `src/__tests__/smoke/*.test.ts`
- Coverage threshold: 80% mandatory

---

## Schema Versioning

**Current version**: `ctg/v1`

All artifacts use stable schemas in `schemas/`:

| Schema | Artifact |
|--------|----------|
| `findings.schema.json` | Quality findings |
| `normalized-repo-graph.schema.json` | Repository structure |
| `release-readiness.schema.json` | Release gate status |
| `suppressions.schema.json` | Suppression rules |

---

## Exit Codes

| Code | Constant | Meaning |
|------|----------|---------|
| 0 | OK | Success |
| 1 | USAGE_ERROR | Invalid arguments |
| 2 | POLICY_FAILED | Policy violation |
| 3 | SCAN_FAILED | Scan error |
| 4 | ANALYZE_FAILED | Analysis error |
| 5 | FINDINGS_THRESHOLD | Findings exceed threshold |

---

## License

MIT. See [LICENSE](LICENSE) for details.