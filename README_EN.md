# code-to-gate

**Local-first quality gate for release readiness.**

`code-to-gate` scans repositories locally and produces findings, risks, test
seeds, SARIF, and release-readiness evidence.

**[日本語](README_JA.md)** | **English**

## Distribution Status

| Channel | Status |
|---------|--------|
| `package.json` | `1.5.0` |
| GitHub Release | `v1.4.2` latest published release |
| npm registry | Not published yet |

See [Distribution Status](docs/distribution-status.md) for the release/publication matrix.

## Install

```bash
npm install -g github:RNA4219/code-to-gate
```

From source:

```bash
npm install
npm run build
npm link
```

The npm package name is `@quality-harness/code-to-gate`, but registry
publication has not been completed yet.

## Basic Usage

```bash
code-to-gate scan ./my-repo --out .qh
code-to-gate analyze ./my-repo --emit all --out .qh
code-to-gate readiness ./my-repo --policy policy.yaml --from .qh --out .qh
code-to-gate spec-drift ./my-repo --out .qh
code-to-gate export sarif --from .qh --out results.sarif
code-to-gate export evidence-dag --from .qh --out .qh/evidence-dag.json
```

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
readiness:
  criticalFindingStatus: blocked_input
```

`ctg/v1alpha1` is still accepted for backward compatibility, but new examples
should use `ctg/v1`.

## Documentation

| Document | Contents |
|----------|----------|
| [docs/quickstart.md](docs/quickstart.md) | First-run guide |
| [docs/distribution-status.md](docs/distribution-status.md) | Package, GitHub release, and npm publication state |
| [docs/cli-reference.md](docs/cli-reference.md) | CLI details |
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

MIT License. See [LICENSE](LICENSE).
