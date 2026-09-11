# code-to-gate

**Local-first quality gate for release readiness.**

`code-to-gate` scans a repository locally and turns code signals into reviewable
artifacts: findings, risks, test seeds, SARIF, and release-readiness evidence.
It is not a replacement for a linter or SAST engine; it is the evidence and gate
layer around repository structure and imported/static signals.

Findings are **review-required candidates**, not confirmed vulnerabilities or
automatic release decisions. `critical` and `high` are gate severity labels used
to prioritize human review; the final release decision remains with the human
or downstream approval gate.

[![Package](https://img.shields.io/badge/package-1.6.0-blue)](CHANGELOG.md)
[![GitHub release](https://img.shields.io/badge/GitHub%20release-v1.6.0-yellow)](https://github.com/RNA4219/code-to-gate/releases/tag/v1.6.0)
[![npm](https://img.shields.io/badge/npm-not%20published-lightgrey)](https://www.npmjs.com/package/@quality-harness/code-to-gate)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-20%2B-green)](https://nodejs.org/)

Language: English | [日本語](README_JA.md)

## When to use code-to-gate

| Situation | Start with | What to review or produce |
|-----------|------------|---------------------------|
| Before a PR | [`analyze`](docs/cli-reference.md#analyze) or [`diff`](docs/cli-reference.md#diff) | Review points and changed-scope evidence |
| QA planning | [`analyze`](docs/cli-reference.md#analyze) | Candidate tests in `test-seeds.json` |
| Before a release | [`analyze`](docs/cli-reference.md#analyze), then `readiness` | Policy evaluation in `release-readiness.json` |
| CI result aggregation | [`import`](docs/cli-reference.md#import), then [`export`](docs/cli-reference.md#export) SARIF | Existing tool results and `results.sarif`; external tools are not run by these commands |

## Current Distribution Status

| Channel | Status |
|---------|--------|
| `package.json` | `1.6.0` GitHub release version |
| GitHub Release | `v1.6.0` latest public release (2026-09-10) |
| npm registry | Not published yet |

See [Distribution Status](docs/distribution-status.md) for the release/publication matrix.
`1.6.0` is publicly available from the [GitHub release](https://github.com/RNA4219/code-to-gate/releases/tag/v1.6.0).
The npm package remains unpublished.

## Install

```bash
# Recommended public release artifact
npm install -g https://github.com/RNA4219/code-to-gate/releases/download/v1.6.0/quality-harness-code-to-gate-1.6.0.tgz

# From source
npm install
npm run build
npm link
```

The npm package name is reserved in docs as `@quality-harness/code-to-gate`, but
registry publication has not been completed yet.

## First run

Replace `./my-repo` with the repository path you want to inspect, then run this
one command:

```bash
code-to-gate analyze ./my-repo --emit all --out .qh
```

Then open `.qh/analysis-report.md` in your current working directory. Use
`.qh/findings.json` to inspect each finding's path, line, and evidence, and use
`.qh/test-seeds.json` to consider concrete tests. `analyze` includes the scan,
so a separate `scan` is not required for this first run. It produces analysis
artifacts; `readiness` is a separate command and creates the release-readiness
result. LLM or account setup is optional for this first run.

## Before a release

Save the [Policy Example](#policy-example) as `policy.yaml`, then adapt it to
your project before using it:

```bash
code-to-gate analyze ./my-repo --policy ./policy.yaml --emit all --out .qh
code-to-gate readiness ./my-repo --policy ./policy.yaml --from .qh --out .qh
```

Open `.qh/release-readiness.json` and review its `status`, `summary`, and
`recommendedActions`.

## Additional commands

These commands are optional; you do not need to run them all or run them in
order.

```bash
# Optional graph-only scan
code-to-gate scan ./my-repo --out .qh
code-to-gate ownership --from .qh --out .qh
code-to-gate spec-drift ./my-repo --out .qh
code-to-gate test-plan --from .qh --out .qh
code-to-gate pr-review --from .qh --out .qh
code-to-gate export sarif --from .qh --out results.sarif
code-to-gate export evidence-dag --from .qh --out .qh/evidence-dag.json
code-to-gate viewer --from .qh --out public/index.html --hosted
```

`import` consumes results that another tool has already produced; it does not
execute that tool. Use the imported artifacts as input to the relevant export.

## Limits and expectations

Findings are review-required candidates and can include false positives. A
successful `analyze` run, or a run with no findings, does not mean the code is
bug-free or that a release is approved. `test-seeds.json` contains suggestions
for tests; it does not run those tests. The product is primarily a CLI and file
artifact workflow, rather than a GUI-centered tool.

For common errors, see [Troubleshooting](docs/troubleshooting.md). For policy
syntax and evaluation, see the [Policy Guide](docs/policy-guide.md).

For database migration analysis (preview surface):

```bash
code-to-gate analyze ./my-repo --database-analysis --emit all --out .qh
code-to-gate diff ./my-repo --base origin/main --head HEAD --database-analysis --out .qh
```

Database artifacts are useful for review, but database analysis is still a
preview/experimental surface and should not be treated as part of the stable
`ctg/v1` public contract until explicitly promoted.

## Outputs

| Artifact | Purpose |
|----------|---------|
| `repo-graph.json` | Repository files, symbols, dependencies, and entrypoints |
| `database-assets.json` | Optional DB assets and DDL operations from `--database-analysis` |
| `findings.json` | Evidence-backed findings |
| `risk-register.yaml` | Risks that need review |
| `test-seeds.json` | Suggested test ideas |
| `release-readiness.json` | Policy gate result |
| `evidence-dag.json` | Cross-artifact evidence graph |
| `spec-drift.json` | Docs, schema, CLI, and test drift checks |
| `hosted-static-report.json` | Static hosting manifest for a single-file HTML report |
| `schema-migration.json` | Schema migration report and validation result |
| `ownership-risk.json` | CODEOWNERS reviewer candidates and module ownership risk |
| `plugin-marketplace.json` | Validated plugin registry for marketplace/distribution review |
| `pr-review.json` | PR review sections for block reasons, accepted risk, tests, spec drift, and evidence links |
| `pr-review.md` | Markdown PR comment body generated from `pr-review.json` |
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
| Schema version | `ctg/v1` |

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
```

## Documentation

| Document | Purpose |
|----------|---------|
| [Quickstart](docs/quickstart.md) | First run and CI setup |
| [Distribution Status](docs/distribution-status.md) | Package, GitHub release, and npm publication state |
| [CLI Reference](docs/cli-reference.md) | Commands, flags, output formats |
| [Security Gate](docs/security-gate.md) | Pinned scanners, SBOM, audit, and CI evidence |
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

`npm test` also runs the Node maintenance checks in `scripts/__tests__` after
the Vitest suites.

## License

MIT. See [LICENSE](LICENSE).
