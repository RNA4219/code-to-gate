---
intent_id: DOC-CONFIG-GUIDE-001
owner: code-to-gate-team
status: active
last_reviewed_at: 2026-07-04
next_review_due: 2026-10-04
---

# Configuration Guide

This guide defines the supported configuration surfaces for code-to-gate.

## Files

| file | purpose | status |
|---|---|---|
| `ctg.config.yaml` | Repository-local scanner, output, plugin, and LLM defaults | Supported where wired by command-specific loaders |
| `.ctg/policy.yaml` | Release/readiness gate thresholds | Supported |
| `.github/ctg-policy.yaml` | CI policy used by repository workflows | Supported |
| `.ctg/suppressions.yaml` | Human-reviewed false-positive or accepted-design suppressions | Supported |

## Minimal Policy

```yaml
version: ctg/v1
policy_id: local-release
blocking:
  severity:
    critical: true
    high: true
    medium: false
    low: false
suppression:
  file: .ctg/suppressions.yaml
  expiry_warning_days: 30
exit:
  fail_on_critical: true
  fail_on_high: true
  warn_only: false
```

Run:

```bash
code-to-gate analyze . --policy .ctg/policy.yaml --emit all --out .qh
code-to-gate readiness . --policy .ctg/policy.yaml --from .qh --out .qh
```

## Suppression Entries

```yaml
version: ctg/v1
suppressions:
  - rule_id: CLIENT_TRUSTED_PRICE
    path: "src/api/order/legacy-*.ts"
    reason: "Accepted legacy behavior until order service migration."
    expiry: "2026-12-31"
    author: "tech-lead"
```

Rules:

- `reason` must explain the accepted risk or false-positive basis.
- `expiry` is required for release evidence even when the parser treats it as recommended.
- Broad path patterns should be reviewed in the suppression debt summary before release.

## LLM Configuration

LLM usage is optional. Deterministic mode remains the default release-safe baseline.

```yaml
llm:
  enabled: false
  mode: local-only
  provider: deterministic
```

Use `--debug-llm-trace` only for local debugging. Trace artifacts may contain redacted prompt and response bodies and must not be attached to public issues without review.

## Reference Lint

Documentation references to package names, policy paths, and schema paths are checked by:

```bash
npm run docs:lint-refs
```
