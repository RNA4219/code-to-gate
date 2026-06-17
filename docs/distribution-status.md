---
intent_id: DOC-DISTRIBUTION-STATUS-001
owner: code-to-gate-team
status: active
last_reviewed_at: 2026-06-17
next_review_due: 2026-07-17
---

# Distribution Status

This document is the source of truth for package version, GitHub release, and
npm publication status.

## Current State

| Channel | Current State | Notes |
|---------|---------------|-------|
| `package.json` | `1.5.0` | Local package version prepared for the SQL Database Analysis release |
| GitHub Release | `v1.4.2` | Latest published GitHub release |
| npm registry | Not published | `@quality-harness/code-to-gate` is the intended package name |
| Recommended install | GitHub install | Use `npm install -g github:RNA4219/code-to-gate` until npm publish is complete |

## Install Commands

```bash
# Current recommended path
npm install -g github:RNA4219/code-to-gate

# Future npm path after publication
npm install -g @quality-harness/code-to-gate
```

## Release Alignment

| Item | Required Before Public v1.5.0 Release |
|------|---------------------------------------|
| Git tag | Create and push `v1.5.0` |
| GitHub release | Publish `v1.5.0` release notes from `CHANGELOG.md` |
| npm package | Run `npm publish --access public` after npm authentication |
| Docs | Keep README, Quickstart, Release Approval Record, and this file aligned |

## Schema Version Guidance

- New examples should use `ctg/v1`.
- `ctg/v1alpha1` remains accepted for backward compatibility.
- Experimental artifacts may still use artifact-specific preview schemas, such as `database-assets@v1alpha1`.
