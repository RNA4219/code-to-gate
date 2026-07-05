# GitHub Actions Usage

## Reusable Workflow

External repositories can call the reusable workflow:

```yaml
name: code-to-gate

on:
  pull_request:
  workflow_dispatch:

jobs:
  code-to-gate:
    uses: RNA4219/code-to-gate/.github/workflows/code-to-gate-reusable.yml@main
    with:
      policy_file: .github/ctg-policy.yaml
      artifact_dir: .qh
    permissions:
      contents: read
      security-events: write
```

The workflow runs build, analyze, readiness, schema validation, SARIF export/upload, QEG evidence export, and artifact upload. It exposes `readiness_status` as a workflow output.

## QEG Evidence

PR, release, and reusable workflows generate the QEG input artifact:

```bash
node ./dist/cli.js export qeg-code-to-gate --from .qh --out .qh/qeg-code-to-gate.json
node ./dist/cli.js schema validate .qh/qeg-code-to-gate.json
```

`qeg-code-to-gate.json` is evidence-only. It carries findings summary,
readiness status, schema compliance, and artifact hashes for
quality-evidence-graph. It does not make a final release decision.

## E2E Evidence

Current maintained evidence:

| Surface | Evidence |
|---|---|
| PR comment | `RUNBOOK.md` PR #1 verification notes, `.github/actions/pr-comment/action.yml` |
| GitHub Checks | `RUNBOOK.md` PR #1 verification notes, `.github/actions/checks/action.yml` |
| SARIF upload | `RUNBOOK.md` PR #1 verification notes, release/PR workflow upload steps |
| QEG input | `.qh/qeg-code-to-gate.json`, `schemas/integrations/qeg-code-to-gate.schema.json` |
| Reusable workflow | `.github/workflows/code-to-gate-reusable.yml`, usage example above |

For release review, store the workflow run id and artifact bundle in `docs/acceptance-evidence-index.md` or release notes.
