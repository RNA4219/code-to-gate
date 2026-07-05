---
intent_id: DOC-PLUGIN-GUIDE-001
owner: code-to-gate-team
status: active
last_reviewed_at: 2026-07-04
next_review_due: 2026-10-04
---

# Plugin Guide

This is the public entry point for plugin documentation.

| document | responsibility |
|---|---|
| `docs/plugin-guide.md` | User-facing overview, supported plugin types, and reading order |
| `docs/plugin-development.md` | Manifest fields, runtime contract, SDK behavior, failure handling |
| `docs/plugin-examples.md` | Copyable public/private plugin examples and expected stdout JSON |
| `docs/plugin-security-contract.md` | Security boundary, sandbox policy, provenance, and signing scope |
| `docs/plugin-sandbox.md` | Docker sandbox execution details and local troubleshooting |

Supported plugin kinds:

- `rule-plugin`
- `language-plugin`
- `importer-plugin`
- `reporter-plugin`
- `exporter-plugin`

Start with `docs/plugin-development.md` when building a plugin. Use `docs/plugin-examples.md` for the smallest runnable manifest and output payload.
