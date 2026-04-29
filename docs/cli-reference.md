# code-to-gate CLI Reference

This document provides a complete reference for all `code-to-gate` CLI commands, options, exit codes, and output formats.

## Table of Contents

1. [Global Options](#global-options)
2. [Commands](#commands)
   - [scan](#scan)
   - [analyze](#analyze)
   - [diff](#diff)
   - [import](#import)
   - [readiness](#readiness)
   - [export](#export)
   - [schema](#schema)
   - [fixture](#fixture)
3. [Exit Codes](#exit-codes)
4. [Output Formats](#output-formats)
5. [Policy YAML Reference](#policy-yaml-reference)

---

## Global Options

These options apply to all commands:

| Option | Description |
|--------|-------------|
| `--help`, `-h` | Show help message and available commands |
| `--version` | Show version information |

---

## Commands

### scan

Scan a repository and generate a normalized repo graph artifact.

**Usage:**
```bash
code-to-gate scan <repo-path> --out <output-dir>
```

**Arguments:**
| Argument | Required | Description |
|----------|----------|-------------|
| `<repo-path>` | Yes | Path to the repository root directory |

**Options:**
| Option | Default | Description |
|--------|---------|-------------|
| `--out <dir>` | `.qh` | Output directory for generated artifacts |
| `--lang <langs>` | `ts,js` | Target languages (comma-separated: `ts,js,tsx,jsx`) |
| `--ignore <patterns>` | `node_modules,dist,.git` | Exclusion patterns (comma-separated) |
| `--verbose` | false | Enable verbose logging |

**Output:**
- `.qh/repo-graph.json` - Normalized repository structure with files, modules, symbols, relations, tests, configs, and entrypoints

**Example:**
```bash
# Basic scan
code-to-gate scan ./my-repo --out .qh

# Scan TypeScript files only
code-to-gate scan ./my-repo --out .qh --lang ts,tsx

# Exclude additional directories
code-to-gate scan ./my-repo --out .qh --ignore node_modules,dist,coverage,.env
```

**Exit Codes:**
| Code | Name | Description |
|------|------|-------------|
| 0 | OK | Scan completed successfully |
| 2 | USAGE_ERROR | Invalid path or arguments |
| 3 | SCAN_FAILED | Parser encountered fatal error |

---

### analyze

Run full analysis: scan + evaluate + report generation. This is the primary command for quality assessment.

**Usage:**
```bash
code-to-gate analyze <repo-path> --out <output-dir>
```

**Arguments:**
| Argument | Required | Description |
|----------|----------|-------------|
| `<repo-path>` | Yes | Path to the repository root directory |

**Options:**
| Option | Default | Description |
|--------|---------|-------------|
| `--out <dir>` | `.qh` | Output directory for generated artifacts |
| `--emit <formats>` | `all` | Output formats: `all`, `md`, `json`, `yaml`, `mermaid`, `sarif` |
| `--policy <path>` | none | Path to policy YAML file for release readiness evaluation |
| `--require-llm` | false | Require LLM processing to succeed (exit 4 if failed) |
| `--llm-provider <provider>` | none | LLM provider: `openai`, `anthropic`, `alibaba`, `openrouter`, `ollama`, `llama.cpp` |
| `--llm-model <model>` | provider default | Model name for the selected provider |
| `--llm-model-path <path>` | none | Model file path for `llama.cpp` provider |
| `--lang <langs>` | `ts,js` | Target languages |
| `--ignore <patterns>` | `node_modules,dist,.git` | Exclusion patterns |

**Output Artifacts:**
| Artifact | Description |
|----------|-------------|
| `repo-graph.json` | Normalized repository structure |
| `findings.json` | Quality findings with evidence |
| `risk-register.yaml` | Risk register with severity and recommended actions |
| `invariants.yaml` | Invariant candidates derived from findings |
| `test-seeds.json` | Test design seeds for QA |
| `release-readiness.json` | Release readiness assessment |
| `audit.json` | Run metadata for reproducibility |
| `analysis-report.md` | Human-readable summary report |
| `results.sarif` | SARIF format for GitHub Code Scanning |

**Example:**
```bash
# Basic analysis (deterministic only)
code-to-gate analyze ./my-repo --emit all --out .qh

# With OpenAI LLM
code-to-gate analyze ./my-repo --emit all --out .qh \
  --llm-provider openai --llm-model gpt-4

# With local ollama
code-to-gate analyze ./my-repo --emit all --out .qh \
  --llm-provider ollama --llm-model llama3

# With llama.cpp local model
code-to-gate analyze ./my-repo --emit all --out .qh \
  --llm-provider llama.cpp --llm-model-path ./models/qwen3.gguf

# With policy and LLM required
code-to-gate analyze ./my-repo --emit all --out .qh \
  --policy ./policies/strict.yaml --require-llm
```

**Exit Codes:**
| Code | Name | Description |
|------|------|-------------|
| 0 | OK / PASSED | Analysis passed or passed with risk |
| 1 | NEEDS_REVIEW | Review required due to findings |
| 2 | USAGE_ERROR | Invalid arguments |
| 4 | LLM_FAILED | LLM processing failed (--require-llm mode) |
| 10 | INTERNAL_ERROR | Unexpected internal error |

---

### diff

Analyze differences between two Git references and estimate blast radius.

**Usage:**
```bash
code-to-gate diff <repo-path> --base <ref> --head <ref> --out <output-dir>
```

**Arguments:**
| Argument | Required | Description |
|----------|----------|-------------|
| `<repo-path>` | Yes | Path to the repository root directory |

**Options:**
| Option | Default | Description |
|--------|---------|-------------|
| `--base <ref>` | `main` | Base branch or commit reference |
| `--head <ref>` | `HEAD` | Head branch or commit reference |
| `--out <dir>` | `.qh` | Output directory for generated artifacts |

**Output:**
| Artifact | Description |
|----------|-------------|
| `diff.json` | Changed files, affected entrypoints, and blast radius analysis |

**Example:**
```bash
# Compare branches
code-to-gate diff ./my-repo --base main --head feature-x --out .qh

# Compare commits
code-to-gate diff ./my-repo --base abc123 --head def456 --out .qh
```

**Exit Codes:**
| Code | Name | Description |
|------|------|-------------|
| 0 | OK | Diff analysis completed |
| 2 | USAGE_ERROR | Invalid arguments or repository path |

---

### import

Import results from external analysis tools and convert to normalized findings.

**Usage:**
```bash
code-to-gate import <tool> <file> --out <output-dir>
```

**Arguments:**
| Argument | Required | Description |
|----------|----------|-------------|
| `<tool>` | Yes | Tool name: `semgrep`, `eslint`, `tsc`, `coverage` |
| `<file>` | Yes | Path to the tool output file |

**Options:**
| Option | Default | Description |
|--------|---------|-------------|
| `--out <dir>` | `.qh/imports` | Output directory for imported findings |

**Supported Tools:**
| Tool | Input Format | Notes |
|------|-------------|-------|
| `semgrep` | JSON (`--json` output) | Security and code pattern findings |
| `eslint` | JSON formatter output | Code quality and style findings |
| `tsc` | TypeScript diagnostics JSON | Type errors and warnings |
| `coverage` | Istanbul/nyc coverage-summary.json | Coverage metrics and gaps |

**Output:**
- `.qh/imports/<tool>-findings.json` - Normalized findings from the external tool

**Example:**
```bash
# Import Semgrep results
code-to-gate import semgrep ./semgrep-results.json --out .qh/imports

# Import ESLint results
code-to-gate import eslint ./eslint-output.json --out .qh/imports

# Import TypeScript compiler diagnostics
code-to-gate import tsc ./tsc-errors.json --out .qh/imports

# Import coverage summary
code-to-gate import coverage ./coverage-summary.json --out .qh/imports
```

**Exit Codes:**
| Code | Name | Description |
|------|------|-------------|
| 0 | OK | Import completed successfully |
| 2 | USAGE_ERROR | Invalid arguments or tool name |
| 8 | IMPORT_FAILED | Failed to parse or process input file |

---

### readiness

Evaluate release readiness using findings and a policy file.

**Usage:**
```bash
code-to-gate readiness <repo-path> --policy <file> --out <output-dir>
```

**Arguments:**
| Argument | Required | Description |
|----------|----------|-------------|
| `<repo-path>` | Yes | Path to the repository root directory |

**Options:**
| Option | Default | Description |
|--------|---------|-------------|
| `--policy <path>` | none | Path to policy YAML file |
| `--out <dir>` | `.qh` | Output directory |

**Output:**
| Artifact | Description |
|----------|-------------|
| `release-readiness.json` | Release status, counts, failed conditions, and recommended actions |

**Status Values:**
| Status | Description |
|--------|-------------|
| `passed` | No findings detected |
| `passed_with_risk` | Low/medium findings present but not blocking |
| `needs_review` | High severity findings require human review |
| `blocked_input` | Critical findings block release |

**Example:**
```bash
# Evaluate with policy
code-to-gate readiness ./my-repo --policy ./policies/strict.yaml --out .qh

# Evaluate with default policy
code-to-gate readiness ./my-repo --out .qh
```

**Exit Codes:**
| Code | Name | Description |
|------|------|-------------|
| 0 | OK | Passed or passed with risk |
| 1 | NEEDS_REVIEW | Review required |
| 2 | USAGE_ERROR | Invalid arguments |

---

### export

Generate integration payloads for downstream systems.

**Usage:**
```bash
code-to-gate export <target> --from <dir> --out <file>
```

**Arguments:**
| Argument | Required | Description |
|----------|----------|-------------|
| `<target>` | Yes | Export target: `gatefield`, `state-gate`, `manual-bb`, `workflow-evidence` |

**Options:**
| Option | Default | Description |
|--------|---------|-------------|
| `--from <dir>` | `.qh` | Source directory containing code-to-gate artifacts |
| `--out <file>` | Required | Output file path |

**Export Targets:**
| Target | Consumer | Purpose |
|--------|----------|---------|
| `gatefield` | agent-gatefield | Static analysis signals for pass/hold/block decisions |
| `state-gate` | agent-state-gate | Evidence summary for agent workflow verdicts |
| `manual-bb` | manual-bb-test-harness | Risk and invariant seeds for black-box test design |
| `workflow-evidence` | workflow-cookbook | Evidence references for CI workflow integration |

**Example:**
```bash
# Export for agent-gatefield
code-to-gate export gatefield --from .qh --out .qh/gatefield-static-result.json

# Export for agent-state-gate
code-to-gate export state-gate --from .qh --out .qh/state-gate-evidence.json

# Export for manual-bb-test-harness
code-to-gate export manual-bb --from .qh --out .qh/manual-bb-seed.json

# Export for workflow-cookbook
code-to-gate export workflow-evidence --from .qh --out .qh/workflow-evidence.json
```

**Exit Codes:**
| Code | Name | Description |
|------|------|-------------|
| 0 | OK | Export completed successfully |
| 2 | USAGE_ERROR | Invalid arguments or unknown target |
| 9 | INTEGRATION_EXPORT_FAILED | Missing required artifacts or export failure |

---

### schema

Validate artifacts against their schemas.

**Usage:**
```bash
code-to-gate schema validate <artifact-or-schema>
```

**Arguments:**
| Argument | Required | Description |
|----------|----------|-------------|
| `<artifact-or-schema>` | Yes | Path to artifact JSON or schema JSON file |

**Behavior:**
- If file ends with `.schema.json`: validates schema document structure
- Otherwise: identifies artifact type and validates against appropriate schema

**Example:**
```bash
# Validate artifact
code-to-gate schema validate .qh/findings.json
code-to-gate schema validate .qh/release-readiness.json

# Validate schema definition
code-to-gate schema validate schemas/findings.schema.json
```

**Exit Codes:**
| Code | Name | Description |
|------|------|-------------|
| 0 | OK | Validation passed |
| 7 | SCHEMA_FAILED | Schema validation errors found |

---

### fixture

Manage fixture repositories for testing and demonstration.

**Usage:**
```bash
code-to-gate fixture <action> [options]
```

**Actions:**
| Action | Description |
|--------|-------------|
| `list` | List available fixtures |
| `validate <name>` | Validate a fixture repository |
| `seed <name>` | Generate seed artifacts for a fixture |

**Options:**
| Option | Default | Description |
|--------|---------|-------------|
| `--fixtures-dir <dir>` | `fixtures` | Directory containing fixtures |

**Example:**
```bash
# List fixtures
code-to-gate fixture list

# Validate fixture
code-to-gate fixture validate demo-shop-ts

# Generate seed artifacts
code-to-gate fixture seed demo-ci-imports --fixtures-dir fixtures
```

**Exit Codes:**
| Code | Name | Description |
|------|------|-------------|
| 0 | OK | Operation completed |
| 2 | USAGE_ERROR | Invalid arguments |
| 3 | FIXTURE_FAILED | Fixture operation failed |

---

## Exit Codes

| Code | Name | Description |
|------|------|-------------|
| 0 | OK | Operation completed successfully |
| 1 | READINESS_NOT_CLEAR | Release readiness requires review or is blocked |
| 2 | USAGE_ERROR | Invalid CLI arguments, paths, or mode |
| 3 | SCAN_FAILED | Repository scan or parser fatal failure |
| 4 | LLM_FAILED | LLM processing failed (--require-llm mode) |
| 5 | POLICY_FAILED | Policy YAML validation failed |
| 7 | SCHEMA_FAILED | Artifact schema validation failed |
| 8 | IMPORT_FAILED | External tool import failed |
| 9 | INTEGRATION_EXPORT_FAILED | Downstream export failed |
| 10 | INTERNAL_ERROR | Unexpected internal error |

---

## Output Formats

### JSON

Standard JSON format with schema versioning. All JSON artifacts include:

```json
{
  "version": "ctg/v1alpha1",
  "generated_at": "2026-04-30T12:00:00Z",
  "run_id": "ctg-20260430120000",
  "repo": { "root": "." },
  "tool": { "name": "code-to-gate", "version": "0.2.0-alpha.1" },
  "artifact": "<artifact-name>",
  "schema": "<artifact>@v1"
}
```

### YAML

Human-readable format for risk-register and invariants:

```yaml
version: ctg/v1alpha1
generated_at: 2026-04-30T12:00:00Z
artifact: risk-register
risks:
  - id: risk-client-supplied-price
    title: Client supplied price may cause financial loss
    severity: critical
    recommendedActions:
      - Recalculate totals from server-side prices
```

### Markdown

Human-readable summary report with sections:

- Executive Summary
- Findings Overview
- Risk Assessment
- Recommended Actions
- Test Seeds
- Release Readiness

### SARIF

Standard SARIF format for GitHub Code Scanning integration:

```json
{
  "$schema": "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Sarif-2.1.0.json",
  "version": "2.1.0",
  "runs": [{
    "tool": { "name": "code-to-gate" },
    "results": [...]
  }]
}
```

### Mermaid

Diagram format for dependency visualization:

```mermaid
graph TD
    A[src/index.ts] --> B[src/api/order.ts]
    A --> C[src/auth/guard.ts]
```

---

## Policy YAML Reference

Policy files define thresholds for release readiness evaluation.

```yaml
apiVersion: ctg/v1alpha1
kind: release-policy
id: strict
version: 0.1.0

thresholds:
  severity:
    critical: 0      # 1+ critical = blocked_input
    high: 3          # 4+ high = blocked_input
    medium: 10       # 11+ medium = needs_review
  category:
    auth: 0          # 1+ auth finding = blocked_input
    payment: 0       # 1+ payment finding = blocked_input

allow_partial: false  # Partial artifacts = needs_review

llm:
  min_confidence: 0.6     # Minimum LLM confidence
  require_binding: true   # Evidence binding required

suppression_rules:
  - id: suppress-test-gap
    ruleId: UNTESTED_CRITICAL_PATH
    reason: "Test coverage tracked separately"
    expires: 2026-06-01
```

### Threshold Configuration

| Threshold | Effect |
|-----------|--------|
| `severity.critical: 0` | Any critical finding blocks release |
| `severity.high: 3` | 4+ high findings block release |
| `severity.medium: 10` | 11+ medium findings require review |
| `category.auth: 0` | Any auth-related finding blocks release |

### LLM Configuration

| Option | Description |
|--------|-------------|
| `min_confidence` | Minimum confidence threshold for LLM-generated content |
| `require_binding` | Require all LLM claims to have evidence binding |