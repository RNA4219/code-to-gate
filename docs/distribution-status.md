---
intent_id: DOC-DISTRIBUTION-STATUS-001
owner: code-to-gate-team
status: active
last_reviewed_at: 2026-09-10
next_review_due: 2026-10-10
---

# Distribution Status

This document is the source of truth for package version, GitHub release, and
npm publication status.

## Current State

| Channel | Current State | Notes |
|---------|---------------|-------|
| `package.json` | `1.6.0` | GitHub release version; npm remains unpublished |
| GitHub Release | `v1.6.0` | Release/tag prepared at [v1.6.0](https://github.com/RNA4219/code-to-gate/releases/tag/v1.6.0); final publication confirmation pending |
| npm registry | Not published | `npm view @quality-harness/code-to-gate` returned `E404` on 2026-09-10 |
| Recommended install | Pinned GitHub install | Use `npm install -g github:RNA4219/code-to-gate#v1.6.0` until npm publication is separately verified |
| Local npm auth | Not authenticated | `npm whoami` returned `E401` on 2026-09-10; this does not establish broader publish permissions |
| CLI Docker image | Not distributed | Docker support currently covers plugin sandbox execution, not a public CLI image |
| Prebuilt binaries | Not distributed | Windows/macOS/Linux standalone binaries are future scope |

## Install Commands

```bash
# Current recommended path, pinned to the release tag
npm install -g github:RNA4219/code-to-gate#v1.6.0

# Future npm path after publication
npm install -g @quality-harness/code-to-gate
```

## Release Alignment

| Item | v1.6.0 Status |
|------|---------------------------------------|
| Git tag | `v1.6.0` target: https://github.com/RNA4219/code-to-gate/releases/tag/v1.6.0 |
| GitHub release | Prepared; final publication confirmation pending |
| npm package | Not published; E404 observed on 2026-09-10 |
| Integrated revision | `a793d2f`; PR #20 reported 15 successful CI checks |
| Verification record | [AC-20260910-14](acceptance/AC-20260910-14-ci-integration.md) |

## 1.6.0 Release Status

`1.6.0` is prepared for the GitHub release/tag above, from integrated revision
`a793d2f`. The final GitHub publication check remains with the release owner.
npm publication remains separate and unverified; no npm, binary, or Docker CLI
distribution is claimed here.

## Release Notes Alignment

`CHANGELOG.md` is the source for the `v1.6.0` release notes. GitHub/source
installation is pinned to `v1.6.0`; npm remains unavailable until a maintainer
publishes the package and records independent publication evidence.

## Publication Evidence Policy

No npm publication has been performed for `1.6.0`. On 2026-09-10, `npm view
@quality-harness/code-to-gate` returned `E404` and `npm whoami` returned `E401`.
These results do not establish broader publish permissions. If npm publication
is performed, the release evidence bundle must include:

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

## npm Publication Status

The package name `@quality-harness/code-to-gate` is not currently visible on
the public npm registry. The local authentication check returned `E401` on
2026-09-10; npm remains `Not published` until a successful publish and view
check are recorded:

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
