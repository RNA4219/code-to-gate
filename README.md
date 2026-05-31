# code-to-gate

**Local-first quality gate for release-readiness.**

Turn repository signals into evidence-backed findings. No code leaves your machine.

**What it is**: code-to-gate is not a linter or static analyzer itself. It takes output from existing tools (Semgrep, ESLint, SonarQube, tsc) and repository structure, then generates artifacts for quality decisions: findings with evidence, risk registers, test design seeds, and release-readiness gate inputs.

**Who uses it**: QA engineers, engineering managers, and developers use it to assess release readiness, review risks, and extract test perspectives before deployment.

[![Version](https://img.shields.io/badge/version-1.4.0-blue)](CHANGELOG.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![CI](https://github.com/RNA4219/code-to-gate/actions/workflows/code-to-gate-pr.yml/badge.svg)](https://github.com/RNA4219/code-to-gate/actions/workflows/code-to-gate-pr.yml)
[![Node](https://img.shields.io/badge/Node-20%2B-green)](https://img.shields.io/badge/Node-20%2B-green)

Language: English | [日本語](README_JA.md)

---

## 5-Minute Path

**Installation** (choose one):

```bash
# From GitHub (primary method while npm publication is pending)
npm install -g github:RNA4219/code-to-gate

# From npm registry (after publication)
npm install -g @quality-harness/code-to-gate
```

**Package identity**: `@quality-harness/code-to-gate` (npm scope)

**Run**:

```bash
code-to-gate analyze ./src --out .qh
```

**Generated artifacts**:

```text
.qh/
  repo-graph.json       # Repository structure (files, symbols, dependencies)
  findings.json         # Quality issues with evidence
  risk-register.yaml    # Risk items requiring review
  test-seeds.json       # Test design recommendations
  release-readiness.json # Release gate status
  analysis-report.md    # Human-readable summary
  results.sarif         # GitHub Code Scanning format
```

→ See quality risks, compliance evidence, SARIF for GitHub Code Scanning.

---

## Language Support

| Language | Support Level | Notes |
|----------|---------------|-------|
| TypeScript / JavaScript | **Primary** | Full AST analysis, main target |
| Python / Ruby / Go / Rust | **Structured** | tree-sitter WASM based analysis |
| Java / PHP / C# / C++ | **Baseline** | Regex/heuristic fallback |

All languages can be scanned; depth of analysis varies by adapter.

---

## What It Does

| Feature | Description |
|---------|-------------|
| **Detect Risks** | 17 built-in rules for payment, auth, validation, security patterns |
| **Quality Gates** | Policy-based release decisions (block on severity, category) |
| **Evidence Generation** | SARIF, JSON, HTML artifacts for audits |
| **CI Integration** | GitHub Actions workflow ready |
| **Local-First** | No code upload, no cloud dependency |

### Built-in Rules

| Rule | Category | Detection |
|------|----------|-----------|
| `CLIENT_TRUSTED_PRICE` | payment | Client-side price calculation |
| `WEAK_AUTH_GUARD` | auth | Weak authorization guards |
| `MISSING_SERVER_VALIDATION` | validation | Missing request validation |
| `RAW_SQL` | security | SQL string construction |
| `HARDCODED_SECRET` | security | Hardcoded credentials |
| `UNSAFE_REDIRECT` | security | Unsafe redirect patterns |
| `TRY_CATCH_SWALLOW` | maintainability | Empty/silent catch blocks |
| ... | | See [CLI Reference](docs/cli-reference.md) for full list |

---

## Why Local-First?

| Aspect | code-to-gate | Cloud-Based Tools |
|--------|--------------|-------------------|
| Code location | Your machine only | Vendor servers |
| Network required | No (except optional LLM) | Yes |
| GDPR/CCPA risk | None | Potential exposure |
| Setup time | npm install | Account + API keys |

**Your code stays on your machine.** No data processing agreements needed.

---

## Documentation

### Getting Started

| Guide | Description |
|-------|-------------|
| [Quickstart](docs/quickstart.md) | First analysis in 5 minutes |
| [CLI Reference](docs/cli-reference.md) | All commands and options |
| [Integration Guide](docs/integrations.md) | GitHub Actions, GitLab CI |
| [Policy Guide](docs/policy-system.md) | YAML policy configuration |

### Understanding the Product

| Guide | Description |
|-------|-------------|
| [Product Narrative](docs/product-narrative.md) | Problem, solution, differentiation |
| [Architecture](docs/architecture-for-public-readiness.md) | System design, data flow |
| [Enterprise Packaging](docs/public-readiness/enterprise-packaging.md) | OSS vs Enterprise features |

### For Contributors

| Guide | Description |
|-------|-------------|
| [CONTRIBUTING.md](CONTRIBUTING.md) | Development workflow, PR checklist |
| [Plugin Development](docs/plugin-development.md) | Custom rule SDK |
| [GOVERNANCE.md](GOVERNANCE.md) | Decision-making, evidence retention |

---

## Related Projects

code-to-gate is part of a quality assurance ecosystem:

| Project | Role | Connection |
|---------|------|------------|
| **manual-bb-test-harness** | Manual black-box test design | Receives risk/invariant seeds from code-to-gate |
| **code-to-gate** | Repository quality gate | Generates findings, test seeds, readiness artifacts |
| **RanD** | Requirements definition | Upstream requirements input for Kano mode analysis |
| **workflow-cookbook** | Workflow knowledge base | Evidence integration, CI/CD procedures |
| **agent-gatefield** | AI artifact gating | Receives static results from code-to-gate exports |

---

## Overview

| Feature | Description |
|---------|-------------|
| **Repository Scanning** | Parse source files, extract symbols, build dependency graphs |
| **Quality Analysis** | Detect 17 built-in vulnerability patterns |
| **Release Readiness** | Generate gate inputs based on policy thresholds |
| **Evidence Generation** | Export SARIF, gatefield, state-gate, workflow-evidence formats |
| **Plugin System** | Docker sandbox supported for custom rules via plugin SDK |
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
| `src/rules/` | Detection rules (17 built-in) |
| `src/cache/` | Incremental cache system |
| `src/parallel/` | Worker-based parallel processing |
| `src/plugin/` | Plugin SDK with Docker sandbox support |
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
