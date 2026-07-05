---
intent_id: DOC-FIVE-TOOL-VALIDATION-CHAIN-001
owner: code-to-gate-team
status: active
last_reviewed_at: 2026-07-04
next_review_due: 2026-08-04
---

# Five Tool Validation Chain

This document records the local RanD -> code-to-gate -> HATE -> manual-bb -> QEG chain used for CI evidence integration.

## Chain Status

| Step | Status | Command | Artifact / output |
|---|---|---|---|
| RanD | ran | `uv run pytest` in `RanD/research-runtime` | 97 passed |
| code-to-gate | ran | `node ./dist/cli.js analyze . --policy .github/ctg-policy.yaml --emit all --out .qh-five-tool --llm-provider deterministic --format json` | `.qh-five-tool/findings.json`, `.qh-five-tool/risk-register.yaml`, `.qh-five-tool/test-seeds.json`, `.qh-five-tool/audit.json` |
| code-to-gate readiness | ran | `node ./dist/cli.js readiness . --policy .github/ctg-policy.yaml --from .qh-five-tool --out .qh-five-tool` | `.qh-five-tool/release-readiness.json`, status `blocked_input` |
| HATE | ran | `uv run pytest tests/test_acceptance_pipeline.py` in `harness-auto-test-evidence` | 2 passed |
| manual-bb | ran | `uv run bb-harness run forward-test --input .\goldens\order-cancel.input.md` | Forward-test prompt generated |
| QEG | ran | `npm run validate -- fixtures/positive-release-go` in `quality-evidence-graph` | fixture verdict `go`, validation PASS |
| QEG input export | ran | `node ./dist/cli.js export qeg-code-to-gate --from .qh-five-tool --out .qh-five-tool/qeg-code-to-gate.json` | `.qh-five-tool/qeg-code-to-gate.json` |

## Evidence Map

| Evidence class | Source | Path |
|---|---|---|
| Requirements / research health | RanD | external repo test output |
| Static analysis | code-to-gate | `.qh-five-tool/` |
| Auto-test evidence health | HATE | external repo test output |
| Manual BB bridge | manual-bb | forward-test command output |
| Final graph owner | QEG | `quality-evidence-graph` fixture validation |
| CI QEG input | code-to-gate export | `.qh/qeg-code-to-gate.json` in PR/release workflows |

## CI Contract

CI now generates `qeg-code-to-gate.json` as evidence-only input:

```bash
node ./dist/cli.js export qeg-code-to-gate --from .qh --out .qh/qeg-code-to-gate.json
node ./dist/cli.js schema validate .qh/qeg-code-to-gate.json
```

Responsibilities:

- code-to-gate owns static evidence, readiness status, schema compliance, and artifact hashes.
- QEG owns final gate verdict, waiver handling, approval, record, and retention.
- `qeg-code-to-gate.json` must not contain a final release decision.

## Current Verdict

`needs_review`: the five-tool chain ran, and QEG input export is CI-integrated. The local code-to-gate self-analysis currently reports `blocked_input`, so QEG receives that status as evidence rather than a final release approval.
