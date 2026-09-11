# code-to-gate

**Local-first quality gate for release readiness.**

`code-to-gate` scans repositories locally and produces findings, risks, test
seeds, SARIF, and release-readiness evidence.

**[日本語](README_JA.md)** | **English**

## When to use code-to-gate

| Situation | Start with | What to review or produce |
|-----------|------------|---------------------------|
| Before a PR | [`analyze`](docs/cli-reference.md#analyze) or [`diff`](docs/cli-reference.md#diff) | Review points and changed-scope evidence |
| QA planning | [`analyze`](docs/cli-reference.md#analyze) | Candidate tests in `test-seeds.json` |
| Before a release | [`analyze`](docs/cli-reference.md#analyze), then `readiness` | Policy evaluation in `release-readiness.json` |
| CI result aggregation | [`import`](docs/cli-reference.md#import), `analyze --from-imports`, then [`export`](docs/cli-reference.md#export) SARIF | Existing tool results and `results.sarif`; use the same output directory for import and analyze |

## Distribution Status

| Channel | Status |
|---------|--------|
| `package.json` | `1.6.1` source version; GitHub publication pending |
| GitHub Release | `v1.6.0` latest public release (2026-09-10) |
| npm registry | Not published yet |

See [Distribution Status](docs/distribution-status.md) for the release/publication matrix.
`1.6.0` is publicly available from the [GitHub release](https://github.com/RNA4219/code-to-gate/releases/tag/v1.6.0).
The npm package remains unpublished.

## Install

```bash
# Recommended public release artifact
npm install -g https://github.com/RNA4219/code-to-gate/releases/download/v1.6.0/quality-harness-code-to-gate-1.6.0.tgz

```

From source:

```bash
npm install
npm run build
npm link
```

The npm package name is `@quality-harness/code-to-gate`, but registry
publication has not been completed yet.

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
```

`import` consumes results that another tool has already produced; it does not
execute that tool. Import and analyze must use the same output directory so that
analyze can read and validate the import manifest:

```bash
code-to-gate import sarif ./external-results.sarif --repo-root ./my-repo --out .qh
code-to-gate analyze ./my-repo --from-imports --emit all --out .qh
code-to-gate export sarif --from .qh --out results.sarif
```

## Limits and expectations

Findings are review-required candidates and can include false positives. A
successful `analyze` run, or a run with no findings, does not mean the code is
bug-free or that a release is approved. `test-seeds.json` contains suggestions
for tests; it does not run those tests. The product is primarily a CLI and file
artifact workflow, rather than a GUI-centered tool.

For common errors, see [Troubleshooting](docs/troubleshooting.md). For policy
syntax and evaluation, see the [Policy Guide](docs/policy-guide.md).

Database migration analysis:

```bash
code-to-gate analyze ./my-repo --database-analysis --emit all --out .qh
```

## Outputs

| File | Contents |
|------|----------|
| `repo-graph.json` | Repository structure |
| `database-assets.json` | Optional DB assets from `--database-analysis` |
| `findings.json` | Evidence-backed findings |
| `risk-register.yaml` | Reviewable risks |
| `test-seeds.json` | Suggested tests |
| `release-readiness.json` | Policy result |
| `evidence-dag.json` | Cross-artifact evidence graph |
| `spec-drift.json` | Docs, schema, CLI, and test drift checks |
| `ownership-risk.json` | CODEOWNERS reviewer candidates and module ownership risk |
| `plugin-marketplace.json` | Validated plugin registry for marketplace/distribution review |
| `pr-review.json` | PR review sections for block reasons, accepted risk, tests, spec drift, and evidence links |
| `pr-review.md` | Markdown PR comment body generated from `pr-review.json` |
| `analysis-report.md` | Human-readable summary |
| `results.sarif` | GitHub Code Scanning format |

## Policy Example

```yaml
version: ctg/v1
blocking:
  severity:
    critical: true
    high: true
  category:
    payment: true
    data: true
```

Policy files use `ctg/v1`.

## Documentation

| Document | Contents |
|----------|----------|
| [docs/quickstart.md](docs/quickstart.md) | First-run guide |
| [docs/distribution-status.md](docs/distribution-status.md) | Package, GitHub release, and npm publication state |
| [docs/cli-reference.md](docs/cli-reference.md) | CLI details |
| [docs/security-gate.md](docs/security-gate.md) | Pinned scanners, SBOM, audit, and CI evidence |
| [docs/policy-guide.md](docs/policy-guide.md) | Gate policy configuration |
| [docs/integrations.md](docs/integrations.md) | Tool integrations |
| [docs/plugin-development.md](docs/plugin-development.md) | Plugin development |
| [CHANGELOG.md](CHANGELOG.md) | Version history |

## Development

```bash
npm install
npm run build
npm test
```

`npm test` also runs the Node maintenance checks in `scripts/__tests__` after
the Vitest suites.

MIT License. See [LICENSE](LICENSE).
