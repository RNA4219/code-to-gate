# code-to-gate Quickstart Guide

Get started with code-to-gate in 5 minutes. This guide covers installation, first run, understanding results, and CI integration.

## Table of Contents

1. [Install](#install)
2. [Scan](#scan)
3. [Analyze](#analyze)
4. [Readiness](#readiness)
5. [Export](#export)
6. [Generated Artifacts](#generated-artifacts)
7. [CI Usage](#ci-usage)
8. [Troubleshooting](#troubleshooting)

---

## Install

### Install

**From GitHub** (primary method while npm publication is pending):

```bash
npm install -g github:RNA4219/code-to-gate
```

**Future npm path** after publication:

```bash
npm install -g @quality-harness/code-to-gate
```

Distribution status is tracked in [Distribution Status](distribution-status.md).

### From Source

If you cloned this repository:

```bash
npm install
npm run build
npm link
```

### Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | 20+ | Required for npm installation |
| Git | 2.x | Required for `diff` command |

---

## Scan

The `scan` command creates a normalized representation of your repository structure:

```bash
code-to-gate scan ./my-repo --out .qh
```

Output:
```
{"tool":"code-to-gate","command":"scan","artifact":".qh/repo-graph.json"}
```

Generated: `.qh/repo-graph.json` containing:
- Files with language, role, hash, size
- Symbols (functions, classes, exports)
- Relations (imports, dependencies)
- Tests and configs
- Entrypoints (API routes, handlers)

---

## Analyze

The `analyze` command runs full quality assessment:

```bash
code-to-gate analyze ./my-repo --emit all --out .qh
```

Output:
```
{"tool":"code-to-gate","command":"analyze","exit_code":0,"status":"passed_with_risk","summary":"3 findings require review"}
```

### With Policy

```bash
code-to-gate analyze ./my-repo --policy ./policies/strict.yaml --out .qh
```

### With LLM

```bash
code-to-gate analyze ./my-repo --llm-provider ollama --llm-model llama3 --out .qh
```

---

## Readiness

Evaluate release readiness against policy:

```bash
code-to-gate readiness ./my-repo --policy policy.yaml --from .qh --out .qh
```

The readiness status determines release eligibility:

| Status | Meaning | Action |
|--------|---------|--------|
| `passed` | No issues | Proceed with release |
| `passed_with_risk` | Low-risk issues | Review recommended |
| `needs_review` | High severity issues | Human review required |
| `blocked_input` | Critical issues | Fix before release |

### Review Model

Findings are review-required candidates. They can include false positives,
especially on unfamiliar frameworks, generated code, intentional fixtures, or
patterns that require domain context. Treat each finding as an evidence-backed
review prompt:

- confirm whether the code path is reachable and relevant;
- check whether nearby validation, authorization, tests, or compensating controls
  already address the risk;
- record suppressions or accepted exceptions with a short reason and expiry when
  the finding is intentionally accepted.

---

## Export

Generate payloads for downstream systems:

```bash
# SARIF for GitHub Code Scanning
code-to-gate export sarif --from .qh --out results.sarif

# gatefield format for agent-gatefield
code-to-gate export gatefield --from .qh --out gatefield.json

# state-gate format
code-to-gate export state-gate --from .qh --out state-gate.json

# workflow-evidence format
code-to-gate export workflow-evidence --from .qh --out workflow.json
```

---

## Generated Artifacts

All artifacts are generated in the `--out` directory (default `.qh/`):

| Artifact | Purpose |
|----------|---------|
| `repo-graph.json` | Repository structure (files, symbols, dependencies) |
| `findings.json` | Quality issues with evidence |
| `risk-register.yaml` | Risk items requiring review |
| `invariants.yaml` | Business/security constraints to preserve |
| `test-seeds.json` | Test design recommendations |
| `release-readiness.json` | Release gate status |
| `audit.json` | Run metadata |
| `analysis-report.md` | Human-readable summary |
| `results.sarif` | GitHub Code Scanning format |

### Release Readiness JSON

```json
{
  "version": "ctg/v1",
  "status": "needs_review",
  "summary": "2 high finding(s) require human review.",
  "counts": {
    "findings": 5,
    "critical": 0,
    "high": 2,
    "risks": 5,
    "testSeeds": 4
  },
  "recommendedActions": [
    "Verify session claims before protected actions",
    "Recalculate totals from server-side prices"
  ]
}
```

### Findings JSON

Each finding includes evidence for traceability:

```json
{
  "id": "finding-client-trusted-price",
  "ruleId": "CLIENT_TRUSTED_PRICE",
  "category": "payment",
  "severity": "critical",
  "confidence": 0.9,
  "title": "Client supplied total is trusted during order creation",
  "summary": "The order route passes req.body.total into persistence...",
  "evidence": [
    { "id": "ev-client-total", "path": "src/api/order/create.ts", "startLine": 15 }
  ],
  "tags": ["checkout", "payment", "deterministic"]
}
```

---

## CI Usage

Add code-to-gate to your GitHub Actions pipeline:

```yaml
# .github/workflows/code-to-gate.yml
name: code-to-gate

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install code-to-gate
        run: npm install -g github:RNA4219/code-to-gate

      - name: Run Analysis
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          code-to-gate analyze ./ \
            --emit json,sarif \
            --out .qh \
            --llm-provider openai \
            --llm-model gpt-4

      - name: Upload SARIF to GitHub
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: .qh/results.sarif

      - name: Check Release Readiness
        run: |
          status=$(jq -r '.status' .qh/release-readiness.json)
          if [ "$status" = "blocked_input" ]; then
            echo "::error::Release blocked due to critical findings"
            exit 1
          fi
          if [ "$status" = "needs_review" ]; then
            echo "::warning::High severity findings require review"
          fi
```

### Key CI Features

| Feature | Integration |
|---------|-------------|
| SARIF upload | GitHub Code Scanning dashboard |
| Exit code | Block PRs on critical findings |
| PR comments | Post analysis summary (via workflow-evidence export) |
| Artifact upload | Store `.qh/` for audit trail |

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| `command not found: code-to-gate` | Ensure npm global install: `npm install -g github:RNA4219/code-to-gate` |
| `.qh/ directory not created` | Add `mkdir -p .qh` before running commands in CI |
| `tree-sitter WASM init failed` | Fallback to regex mode; works but less accurate |
| LLM connection timeout | Check `llm-health`: `code-to-gate llm-health --provider ollama` |

### Need More Help?

- Full CLI reference: [docs/cli-reference.md](cli-reference.md)
- Troubleshooting guide: [docs/troubleshooting.md](troubleshooting.md)
- Project blueprint: [BLUEPRINT.md](../BLUEPRINT.md)
- Runbook: [RUNBOOK.md](../RUNBOOK.md)
