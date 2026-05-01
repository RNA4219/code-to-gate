# code-to-gate Quickstart Guide

Get started with code-to-gate in 5 minutes. This guide covers installation, first run, understanding results, and CI integration.

## Table of Contents

1. [Installation](#installation)
2. [First Run](#first-run)
3. [Understanding Results](#understanding-results)
4. [Next Steps](#next-steps)
5. [GitHub Actions Integration](#github-actions-integration)

---

## Installation

### npm (Recommended)

```bash
# Install globally
npm install -g @quality-harness/code-to-gate

# Or install locally in your project
npm install --save-dev @quality-harness/code-to-gate
```

### Binary Release

Download the latest binary from GitHub Releases:

```bash
# Linux
curl -L https://github.com/quality-harness/code-to-gate/releases/latest/download/code-to-gate-linux -o code-to-gate
chmod +x code-to-gate

# macOS
curl -L https://github.com/quality-harness/code-to-gate/releases/latest/download/code-to-gate-macos -o code-to-gate
chmod +x code-to-gate

# Windows (PowerShell)
Invoke-WebRequest -Uri https://github.com/quality-harness/code-to-gate/releases/latest/download/code-to-gate-windows.exe -OutFile code-to-gate.exe
```

### Docker

```bash
# Pull the image
docker pull qualityharness/code-to-gate:latest

# Run analysis
docker run --rm -v $(pwd)/my-repo:/repo qualityharness/code-to-gate analyze /repo --out /repo/.qh
```

### Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | 20+ | Required for npm installation |
| Git | 2.x | Required for `diff` command |

---

## First Run

### Step 1: Scan Your Repository

The `scan` command creates a normalized representation of your repository structure:

```bash
code-to-gate scan ./my-repo --out .qh
```

Output:
```
{"tool":"code-to-gate","command":"scan","artifact":".qh/repo-graph.json"}
```

Generated artifact: `.qh/repo-graph.json` containing:
- Files with language, role, hash, size
- Symbols (functions, classes, exports)
- Relations (imports, dependencies)
- Tests and configs
- Entrypoints (API routes, handlers)

### Step 2: Analyze Your Repository

The `analyze` command runs full quality assessment:

```bash
code-to-gate analyze ./my-repo --emit all --out .qh
```

Output:
```
{"tool":"code-to-gate","command":"analyze","exit_code":0,"status":"passed_with_risk","summary":"3 findings require review"}
```

Generated artifacts in `.qh/`:

| Artifact | Purpose |
|----------|---------|
| `repo-graph.json` | Repository structure |
| `findings.json` | Quality issues with evidence |
| `risk-register.yaml` | Risk assessment |
| `invariants.yaml` | Business/security invariants |
| `test-seeds.json` | Test design recommendations |
| `release-readiness.json` | Release status |
| `audit.json` | Run metadata |
| `analysis-report.md` | Human-readable summary |

### Step 3: Check Release Readiness

```bash
code-to-gate readiness ./my-repo --out .qh
```

The readiness status determines release eligibility:

| Status | Meaning | Action |
|--------|---------|--------|
| `passed` | No issues | Proceed with release |
| `passed_with_risk` | Low-risk issues | Review recommended |
| `needs_review` | High severity issues | Human review required |
| `blocked_input` | Critical issues | Fix before release |

---

## Understanding Results

### Release Readiness JSON

```json
{
  "version": "ctg/v1alpha1",
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

### Risk Register YAML

```yaml
risks:
  - id: risk-client-supplied-price
    title: Client supplied price may cause financial loss or fraudulent orders
    severity: critical
    likelihood: medium
    impact:
      - financial_loss
      - fraud
      - revenue_integrity
    recommendedActions:
      - Recalculate totals from server-side catalog prices
      - Reject requests where client totals do not match
```

### Test Seeds JSON

Test design recommendations derived from findings:

```json
{
  "seeds": [
    {
      "id": "seed-price-negative",
      "title": "Reject client-modified checkout totals",
      "intent": "negative",
      "suggestedLevel": "integration",
      "notes": "Test price tampering scenarios"
    },
    {
      "id": "seed-auth-deny-path",
      "title": "Reject non-admin users on admin endpoints",
      "intent": "negative",
      "suggestedLevel": "integration"
    }
  ]
}
```

---

## Next Steps

### Use a Policy File

Create a policy YAML to customize thresholds:

```yaml
# policies/strict.yaml
apiVersion: ctg/v1alpha1
kind: release-policy
id: strict

thresholds:
  severity:
    critical: 0    # Block on any critical
    high: 0        # Block on any high
  category:
    auth: 0        # Block on any auth finding
    payment: 0     # Block on any payment finding
```

Apply the policy:

```bash
code-to-gate analyze ./my-repo --policy ./policies/strict.yaml --out .qh
```

### Import External Tool Results

Combine findings from multiple sources:

```bash
# Import Semgrep security findings
code-to-gate import semgrep ./semgrep-output.json --out .qh/imports

# Import ESLint results
code-to-gate import eslint ./eslint-output.json --out .qh/imports

# Import coverage data
code-to-gate import coverage ./coverage-summary.json --out .qh/imports
```

### Analyze PR Changes

Focus on changed files:

```bash
code-to-gate diff ./my-repo --base main --head feature-branch --out .qh
```

This generates blast radius analysis showing affected entrypoints.

### Export for Downstream Systems

Generate payloads for integration:

```bash
# For agent-gatefield (AI artifact gating)
code-to-gate export gatefield --from .qh --out .qh/gatefield-static-result.json

# For manual-bb-test-harness (black-box test design)
code-to-gate export manual-bb --from .qh --out .qh/manual-bb-seed.json
```

---

## GitHub Actions Integration

Add code-to-gate to your CI pipeline:

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
        run: npm install -g @quality-harness/code-to-gate

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

## Need Help?

- Full CLI reference: [docs/cli-reference.md](cli-reference.md)
- Troubleshooting: [docs/troubleshooting.md](troubleshooting.md)
- Project blueprint: [BLUEPRINT.md](../BLUEPRINT.md)
- Runbook: [RUNBOOK.md](../RUNBOOK.md)
