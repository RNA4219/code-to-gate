---
intent_id: DOC-POLICY-GUIDE-001
owner: code-to-gate-team
status: active
last_reviewed_at: 2026-06-17
next_review_due: 2026-07-17
---

# Policy Guide

`code-to-gate` policies are YAML files that decide how findings affect release
readiness. Policies are evaluated by `analyze` and `readiness`; they do not send
code or findings to any external service.

## Minimal Policy

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
readiness:
  criticalFindingStatus: blocked_input
```

`ctg/v1alpha1` is accepted for backward compatibility, but new policy examples
should use `ctg/v1`.

## Blocking Controls

| Key | Meaning |
|-----|---------|
| `blocking.severity.<level>` | Blocks when an effective finding has the selected severity. |
| `blocking.category.<category>` | Blocks when an effective finding belongs to the selected category. |
| `blocking.rules.<RULE_ID>` | Blocks on specific rules such as `DB_DROP_TABLE`. |

Supported severities are `critical`, `high`, `medium`, `low`, and `info`.
Common categories include `auth`, `payment`, `data`, `security`,
`validation`, `testing`, and `maintainability`.

## Policy DSL

Use `dsl.rules` when a release rule depends on context rather than a plain
severity/category threshold. Initial DSL conditions support severity, category,
rule ID, baseline ratchet state, and manual evidence.

```yaml
version: ctg/v1
policy_id: dsl-release

dsl:
  rules:
    - id: critical-always-block
      when:
        severity: critical
      action: block
      reason: Critical findings always block release.
    - id: new-security-block
      when:
        baseline: new_or_worsened
        category: security
      action: block
      reason: New or worsened security findings must be fixed.
    - id: manual-evidence-hold
      when:
        manual_evidence: present
      action: hold
      reason: Manual BB evidence exists; hold for human review.
```

Actions:

| Action | Readiness effect |
|--------|------------------|
| `block` | Adds a DSL failed condition and forces `blocked_input`. |
| `hold` | Adds a DSL failed condition and forces at least `needs_review`. |
| `allow` | Suppresses later DSL `block`/`hold` matches for the same finding. |

`baseline: new_or_worsened` matches findings evaluated by the baseline ratchet
gate. `manual_evidence` is populated by `readiness --manual-evidence <file>`
and accepts `manual-bb.json` or `manual-bb-seed.json`.

## Readiness Status

`readiness.criticalFindingStatus` controls the readiness status used when
critical findings remain:

| Value | Meaning |
|-------|---------|
| `blocked_input` | Treat critical findings as a release blocker. |
| `needs_review` | Require human review before release approval. |

## Database Analysis Rules

When `--database-analysis` is enabled, database migration findings can also be
gated by rule ID or category:

```yaml
version: ctg/v1
blocking:
  category:
    data: true
  rules:
    DB_DROP_TABLE: true
    DB_DROP_COLUMN: true
    DB_RISKY_TYPE_CHANGE: true
readiness:
  criticalFindingStatus: blocked_input
```

## Run With A Policy

```bash
code-to-gate analyze ./my-repo --policy ./policy.yaml --emit all --out .qh
code-to-gate readiness ./my-repo --policy ./policy.yaml --from .qh --out .qh
code-to-gate readiness ./my-repo --policy ./policy.yaml --from .qh --out .qh \
  --baseline .qh/baseline-findings.json --manual-evidence .qh/manual-bb.json
```

## Related Docs

- [CLI Reference](cli-reference.md)
- [Quickstart](quickstart.md)
- [Distribution Status](distribution-status.md)
