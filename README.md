# code-to-gate

**Local-first quality gate for release readiness.**

`code-to-gate` scans a repository locally and turns code signals into reviewable
artifacts: findings, risks, test seeds, SARIF, and release-readiness evidence.
It is not a replacement for a linter or SAST engine; it is the evidence and gate
layer around repository structure and imported/static signals.

[![Package](https://img.shields.io/badge/package-1.5.0-blue)](CHANGELOG.md)
[![GitHub release](https://img.shields.io/badge/GitHub%20release-v1.4.2-yellow)](https://github.com/RNA4219/code-to-gate/releases)
[![npm](https://img.shields.io/badge/npm-not%20published-lightgrey)](https://www.npmjs.com/package/@quality-harness/code-to-gate)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-20%2B-green)](https://nodejs.org/)

Language: English | [日本語](README_JA.md)

## Current Distribution Status

| Channel | Status |
|---------|--------|
| `package.json` | `1.5.0` |
| GitHub Release | `v1.4.2` latest published release |
| npm registry | Not published yet |

See [Distribution Status](docs/distribution-status.md) for the release/publication matrix.

## Install

```bash
# Recommended until npm publication is complete
npm install -g github:RNA4219/code-to-gate

# From source
npm install
npm run build
npm link
```

The npm package name is reserved in docs as `@quality-harness/code-to-gate`, but
registry publication has not been completed yet.

## Quick Start

```bash
code-to-gate scan ./my-repo --out .qh
code-to-gate analyze ./my-repo --emit all --out .qh
code-to-gate readiness ./my-repo --policy policy.yaml --from .qh --out .qh
code-to-gate export sarif --from .qh --out results.sarif
```

For database migration analysis:

```bash
code-to-gate analyze ./my-repo --database-analysis --emit all --out .qh
code-to-gate diff ./my-repo --base origin/main --head HEAD --database-analysis --out .qh
```

## Outputs

| Artifact | Purpose |
|----------|---------|
| `repo-graph.json` | Repository files, symbols, dependencies, and entrypoints |
| `database-assets.json` | Optional DB assets and DDL operations from `--database-analysis` |
| `findings.json` | Evidence-backed findings |
| `risk-register.yaml` | Risks that need review |
| `test-seeds.json` | Suggested test ideas |
| `release-readiness.json` | Policy gate result |
| `analysis-report.md` | Human-readable summary |
| `results.sarif` | GitHub Code Scanning format |

## Capabilities

| Area | Status |
|------|--------|
| TypeScript / JavaScript | Primary AST support |
| Python / Ruby / Go / Rust | Tree-sitter with `--tree-sitter`, regex fallback otherwise |
| Java / PHP / C# / C++ | Baseline heuristic support |
| Core rules | 17 core rules |
| Database analysis | Optional SQL / migration checks via `--database-analysis` |
| Schema version | `ctg/v1`; `ctg/v1alpha1` is accepted for backward compatibility |

## Policy Example

```yaml
version: ctg/v1
blocking:
  severity:
    critical: true
    high: true
  category:
    auth: true
    payment: true
    data: true
  rules:
    DB_DROP_TABLE: true
readiness:
  criticalFindingStatus: blocked_input
```

## Documentation

| Document | Purpose |
|----------|---------|
| [Quickstart](docs/quickstart.md) | First run and CI setup |
| [Distribution Status](docs/distribution-status.md) | Package, GitHub release, and npm publication state |
| [CLI Reference](docs/cli-reference.md) | Commands, flags, output formats |
| [Policy Guide](docs/policy-guide.md) | Gate policy configuration |
| [Integrations](docs/integrations.md) | GitHub Actions and downstream exports |
| [Plugin Development](docs/plugin-development.md) | Custom rule SDK |
| [Changelog](CHANGELOG.md) | Release history |

## Development

```bash
npm install
npm run build
npm run test:smoke
npm test
```

## License

MIT. See [LICENSE](LICENSE).
