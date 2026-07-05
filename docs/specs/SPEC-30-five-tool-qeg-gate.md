---
intent_id: SPEC-30-FIVE-TOOL-QEG-GATE
owner: code-to-gate-team
status: active
last_reviewed_at: 2026-07-05
next_review_due: 2026-08-05
---

# SPEC-30: Five-tool QEG Gate Integration

## Purpose

This spec upgrades the five-tool chain from advisory evidence export to an
auditable gate handoff:

RanD -> code-to-gate -> HATE -> manual-bb -> QEG.

`code-to-gate` remains a producer of static evidence. It does not own the final
release verdict. QEG remains the final gate owner. The integration is complete
only when code-to-gate can generate a QEG fixture and CI can run QEG
`validate` and `gate` when the QEG runtime is available.

## Current Gaps

1. QEG currently receives `qeg-code-to-gate.json`, but PR CI does not directly
   run the external QEG gate against a generated fixture.
2. HATE is represented by command/help checks or external ad-hoc evidence, not
   a code-to-gate-generated HATE-compatible evidence bundle.
3. manual-bb evidence is generic; QEOS-039/040 dedicated manual cases are not
   generated as a durable artifact.
4. Raw findings can remain while readiness passes through baseline or
   suppression debt. This must be explicit in machine-readable evidence so QEG
   and reviewers do not confuse "passed" with "zero findings".

## Requirements

### SPEC-30-R1: QEG Fixture Export

`code-to-gate export qeg-gate-input --from <artifact-dir> --out <dir>` MUST
write `<dir>/gate-input.json`.

The generated fixture MUST include:

- `qeg-code-to-gate.json` as a source input artifact.
- `findings.json` and `release-readiness.json` hashes.
- producer check metadata with `readinessStatus`.
- source refs for code-to-gate policy, readiness, and exported evidence.
- an evidence package with non-empty `sourceRefs`, retention, control roles,
  and matching approval policy hashes.

The generated fixture MUST NOT claim a final gate decision. It is an input to
QEG.

### SPEC-30-R2: HATE Evidence Bundle Export

`code-to-gate export hate-qeg-bundle --from <artifact-dir> --out <file>` MUST
write a HATE-compatible QEG bundle-shaped optional evidence artifact.

The bundle MUST:

- use QEG bundle fields: `metadata`, `nodes`, `edges`, `completeness`.
- identify `producer` through artifact refs as `hate`.
- represent auto-test evidence availability and gaps without claiming a final
  release verdict.
- include source refs to CI/test commands or missing-input notes.

When no JUnit/LCOV input is present, the bundle is still valid but records the
auto-test evidence gap as explicit source-backed evidence.

### SPEC-30-R3: QEOS-039/040 Manual BB Artifact

`code-to-gate export manual-bb --scope qeos-039-040 --from <artifact-dir>
--out <file>` MUST generate QEOS-specific manual black-box seeds for:

- QEOS-039 baseline debt owner/expiry/approval/prevention surfaces.
- QEOS-040 hosted portal cross-run search across SLO, release pack,
  manual-bb, PR review, and baseline debt.
- QEOS-040 redaction profile manifest comparison.

The artifact MUST preserve the existing `ctg.manual-bb/v1` shape.

### SPEC-30-R4: Raw Finding Debt Visibility

`qeg-code-to-gate.json` and generated QEG fixture metadata MUST make raw
finding debt visible when readiness is `passed` with remaining findings.

The evidence MUST distinguish:

- policy gate verdict (`readiness_status`);
- raw finding counts;
- baseline debt / suppression debt visibility;
- missing or degraded HATE/manual-bb inputs.

### SPEC-30-R5: CI Contract

PR CI MUST:

1. export `manual-bb.json` for QEOS-039/040;
2. export `hate-qeg-bundle.json`;
3. export `qeg-gate/gate-input.json`;
4. run external QEG `validate` and `gate` when the sibling
   `../quality-evidence-graph/dist/cli.js` runtime is present;
5. otherwise mark the QEG runtime step as degraded, not silently successful.

CI MUST keep uploading these artifacts even when readiness blocks.

## Acceptance

| ID | Proof |
| --- | --- |
| AC-30-01 | `node ./dist/cli.js export hate-qeg-bundle --from .qh --out .qh/hate-qeg-bundle.json` exits 0 |
| AC-30-02 | `node ./dist/cli.js export manual-bb --scope qeos-039-040 --from .qh --out .qh/manual-bb.json` exits 0 and contains QEOS-039/040 cases |
| AC-30-03 | `node ./dist/cli.js export qeg-gate-input --from .qh --out .qh/qeg-gate` exits 0 and writes `gate-input.json` |
| AC-30-04 | QEG `validate` accepts generated `.qh/qeg-gate` when QEG runtime is available |
| AC-30-05 | QEG `gate` returns a QEG verdict for generated `.qh/qeg-gate` when QEG runtime is available |
| AC-30-06 | PR CI summary reports QEG runtime `ran` or `degraded` explicitly |

## Non-goals

- Reimplement QEG gate policy inside code-to-gate.
- Reimplement HATE adapters inside code-to-gate.
- Treat generated manual-bb seeds as executed manual test evidence.
- Hide raw findings solely because readiness is `passed`.
