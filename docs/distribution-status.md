---
intent_id: DOC-DISTRIBUTION-STATUS-001
owner: code-to-gate-team
status: active
last_reviewed_at: 2026-07-12
next_review_due: 2026-08-12
---

# Distribution Status

This document is the source of truth for package version, GitHub release, and
npm publication status.

## Current State

| Channel | Current State | Notes |
|---------|---------------|-------|
| `package.json` | `1.5.0` | Release package version |
| GitHub Release | `v1.5.0` | Published 2026-07-12 |
| npm registry | Not published | `npm view @quality-harness/code-to-gate` returned `E404` on 2026-07-12 |
| Recommended install | GitHub install | Use `npm install -g github:RNA4219/code-to-gate` until npm publish is complete |
| Local npm auth | Not authenticated | `npm whoami` returns `ENEEDAUTH`; maintainer login is required before publish |
| CLI Docker image | Not distributed | Docker support currently covers plugin sandbox execution, not a public CLI image |
| Prebuilt binaries | Not distributed | Windows/macOS/Linux standalone binaries are future scope |

## Install Commands

```bash
# Current recommended path
npm install -g github:RNA4219/code-to-gate

# Future npm path after publication
npm install -g @quality-harness/code-to-gate
```

## Release Alignment

| Item | v1.5.0 Status |
|------|---------------------------------------|
| Git tag | `v1.5.0` created and pushed |
| GitHub release | Published with notes based on `CHANGELOG.md` |
| npm package | Pending `npm login` and `npm publish --access public` |
| Package integrity | Passed before release; CI records the integrity artifact |
| Docs | README, Release Approval Record, CHANGELOG, and this file synchronized |

## Release Notes Alignment

`CHANGELOG.md` is the source for the published `v1.5.0` release notes. GitHub
and source installation now provide `v1.5.0`; npm remains unavailable until a
maintainer publishes the package after authenticating to npm.

## Publication Evidence Policy

No npm publication has been performed for `1.5.0`. If npm publication is
performed, the release evidence bundle must include:

- `npm whoami`
- `npm publish --access public`
- `npm view @quality-harness/code-to-gate version dist-tags --json`

Until those commands are captured, npm remains `Not published`.

## Non-npm Distribution Scope

Current public distribution is GitHub/source install first, then npm after
publication. There is no supported `docker run code-to-gate/cli` image and no
standalone prebuilt binary in the current release surface.

- Docker image support: limited to the plugin sandbox runner described in `docs/plugin-sandbox.md`.
- Prebuilt binary support: future scope; require packaging, signing, checksum,
  and platform smoke-test evidence before being documented as an install path.

## npm Publication Blocker

The package name `@quality-harness/code-to-gate` is not currently visible on
the public npm registry. Publication is blocked only by local npm
authentication on this machine:

```bash
npm login
npm publish --access public
npm view @quality-harness/code-to-gate version dist-tags --json
```

## Schema Version Guidance

- New examples should use `ctg/v1`.
- `ctg/v1alpha1` remains accepted for backward compatibility.
- Experimental artifacts may still use artifact-specific preview schemas, such as `database-assets@v1alpha1`.

## Preview / Experimental Artifact Labeling

Use this rule in public docs, release notes, and examples:

| Surface | Label | Stability Promise |
|---------|-------|-------------------|
| Core artifacts with `ctg/v1` | stable | Backward-compatible within v1 |
| Integration exports with `ctg.<target>/v1` | stable integration contract | Schema-compatible unless a new major version is introduced |
| Artifact-specific `v1alpha1` schemas | preview / experimental | Shape may change before promotion; do not present as stable public contract |
| Database analysis outputs | preview | Review candidate evidence only until schema review and migration guide are complete |

Preview examples must include the word `preview` or `experimental` near the
command or artifact name. Stable examples must avoid `v1alpha1` unless the
section is explicitly about legacy compatibility or migration.
