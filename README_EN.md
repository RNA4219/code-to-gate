# code-to-gate

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**[日本語](README_JA.md)** | **English**

`code-to-gate` is a CLI that scans a repository and produces release-review inputs.

It helps answer a few practical questions:

- Where does the code show signs of quality risk?
- What tests would be useful to add?
- Does the current result pass a release-readiness policy?
- Can the result be exported to GitHub Code Scanning or another quality gate?

## Install

```bash
npm install -g github:RNA4219/code-to-gate
```

If you already cloned this repository:

```bash
npm install
npm run build
npm link
```

## Requirements

| Requirement | Version |
|-------------|---------|
| Node.js | 20 or later |
| Git | 2.x |

## Basic Usage

```bash
# Scan repository structure
code-to-gate scan ./my-repo --out .qh

# Generate findings, risks, test ideas, and reports
code-to-gate analyze ./my-repo --emit all --out .qh

# Check release readiness with a policy file
code-to-gate readiness ./my-repo --policy policy.yaml --out .qh

# Export SARIF
code-to-gate export sarif --from .qh --out results.sarif
```

## Main Commands

| Command | Purpose |
|---------|---------|
| `scan` | Read repository structure |
| `analyze` | Generate findings, risks, test ideas, and reports |
| `readiness` | Evaluate release readiness with a policy |
| `export` | Export artifacts, including SARIF |
| `diff` | Inspect impact from a Git diff |
| `import` | Import ESLint, Semgrep, TypeScript, coverage, and similar outputs |
| `historical` | Compare against a previous run |
| `viewer` | Start an HTML viewer |
| `llm-health` | Check a local LLM provider |
| `evidence` | Build release-review evidence |
| `schema validate` | Validate output files against schemas |

## Outputs

Files are usually written to the directory passed with `--out`, for example `.qh`.

| File | Contents |
|------|----------|
| `repo-graph.json` | Repository structure, files, dependencies, and entrypoints |
| `findings.json` | Static findings with supporting evidence |
| `risk-register.yaml` | Items worth reviewing as risks |
| `invariants.yaml` | Candidate conditions the system should preserve |
| `test-seeds.json` | Suggested tests to add |
| `release-readiness.json` | Policy evaluation result |
| `audit.json` | Run metadata |
| `analysis-report.md` | Human-readable summary |
| `results.sarif` | SARIF for code scanning tools |

## Built-in Rules

| Rule ID | Detects |
|---------|---------|
| `CLIENT_TRUSTED_PRICE` | Client-supplied prices that may be trusted too much |
| `WEAK_AUTH_GUARD` | Weak authorization checks |
| `MISSING_SERVER_VALIDATION` | Request bodies used without enough validation |
| `UNTESTED_CRITICAL_PATH` | Important entrypoints with weak test signals |
| `TRY_CATCH_SWALLOW` | Caught errors that may be ignored |
| `RAW_SQL` | Risky SQL string construction |
| `ENV_DIRECT_ACCESS` | Direct environment variable reads |
| `UNSAFE_DELETE` | Delete operations with weak safety checks |
| `LARGE_MODULE` | Oversized modules |

## Policy Example

```yaml
version: ctg/v1alpha1
name: strict
blocking:
  severities:
    - critical
  categories:
    - payment
  rules:
    - CLIENT_TRUSTED_PRICE
readiness:
  criticalFindingStatus: blocked_input
```

In this example, matching critical payment findings or `CLIENT_TRUSTED_PRICE` findings keep the release-readiness result from passing.

## GitHub Actions Example

```yaml
name: code-to-gate PR Analysis

on: [pull_request]

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm install -g github:RNA4219/code-to-gate
      - run: code-to-gate scan . --out .qh
      - run: code-to-gate analyze . --emit all --out .qh
      - run: code-to-gate export sarif --from .qh --out results.sarif
      - uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: results.sarif
```

## More Documentation

| Document | Contents |
|----------|----------|
| [docs/quickstart.md](docs/quickstart.md) | First-run guide |
| [docs/cli-reference.md](docs/cli-reference.md) | CLI details |
| [docs/integrations.md](docs/integrations.md) | Tool integrations |
| [docs/plugin-development.md](docs/plugin-development.md) | Plugin development |
| [docs/local-llm-setup.md](docs/local-llm-setup.md) | Local LLM setup |
| [CHANGELOG.md](CHANGELOG.md) | Version history |

## Development

```bash
npm install
npm run build
npm test
```

## License

MIT License. See [LICENSE](LICENSE).
