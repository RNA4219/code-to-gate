---
intent_id: DOC-DISTRIBUTION-STATUS-001
owner: code-to-gate-team
status: active
last_reviewed_at: 2026-09-11
next_review_due: 2026-10-10
---

# Distribution Status

This document is the source of truth for package version, GitHub release, and
npm publication status.

## Current State

| Channel | Current State | Notes |
|---------|---------------|-------|
| `package.json` | `1.6.1` | Source version and GitHub Release are published; npm remains unpublished |
| GitHub Release | `v1.6.1` | Latest public release, published `2026-09-11T11:20:56Z` at [v1.6.1](https://github.com/RNA4219/code-to-gate/releases/tag/v1.6.1); release id `386981658`; draft/prerelease false |
| npm registry | Not published | `npm view @quality-harness/code-to-gate` returned `E404` on 2026-09-11 |
| Recommended install | Public GitHub tgz | Use the `v1.6.1` release asset below |
| Local npm auth | Not authenticated | `npm whoami` returned `E401` on 2026-09-10; this does not establish broader publish permissions |
| CLI Docker image | Not distributed | Docker support currently covers plugin sandbox execution, not a public CLI image |
| Prebuilt binaries | Not distributed | Windows/macOS/Linux standalone binaries are future scope |

## Install Commands

```bash
# Current recommended path: public release artifact
npm install -g https://github.com/RNA4219/code-to-gate/releases/download/v1.6.1/quality-harness-code-to-gate-1.6.1.tgz

# Future npm path after publication
npm install -g @quality-harness/code-to-gate
```

## Historical 1.6.0 Release Alignment

| Item | v1.6.0 Status |
|------|---------------------------------------|
| Git tag | `v1.6.0`, fixed to `0260825379a6698c5dab4ec5303dfecc8536a014` |
| GitHub release | Published 2026-09-10 09:15:03Z; draft=false, prerelease=false |
| npm package | Not published; E404 observed on 2026-09-10 |
| Integrated revision | `a793d2f`; PR #20 reported 15 successful CI checks |
| Verification record | Integration: [AC-20260910-14](acceptance/AC-20260910-14-ci-integration.md); publication: [AC-20260910-15](acceptance/AC-20260910-15-release-1.6.0.md) |

### Public release assets

The release contains `quality-harness-code-to-gate-1.6.0.tgz`,
`release-manifest.json`, `release-summary.json`, and `SHA256SUMS.txt`.
All four downloaded asset hashes matched the local copies. The manifest's two
recorded entries, the tgz and `release-summary.json`, matched their asset size
and SHA-256 values. The tgz is 593104 bytes with SHA-256
`371ce4789ee26893c5d0232ca98fe7253a7fa5b805ef1d8e0a14f0c8c3adb91a`.
An isolated install and CLI 1.6.0, SDK, scan, and schema checks succeeded.
The tag commit's [Release CI](https://github.com/RNA4219/code-to-gate/actions/runs/34458148628)
and [Security CI](https://github.com/RNA4219/code-to-gate/actions/runs/34458148608)
both succeeded. CI ZIP files are not public distribution assets.

## 1.6.1 Release Status

`1.6.1` is the latest public GitHub release from integrated commit
`968b319252ad7e37294e9219af6c6b00129fae00` (PR #27). It was published at
`2026-09-11T11:20:56Z` and is not a draft or prerelease. The tag object is
`06ba7dd3cbc52d82800d82637c7e67abb2df3ada`.

### Public release assets

The release contains `quality-harness-code-to-gate-1.6.1.tgz`,
`release-manifest.json`, `release-summary.json`, and `SHA256SUMS.txt`.
All four downloaded asset hashes matched their local copies. The manifest's
two entries (the tgz and `release-summary.json`) matched their SHA-256,
SHA-512, and size values; all three `SHA256SUMS.txt` entries matched. The tgz
is 603612 bytes with SHA-256
`2cd7c929f51f82309caa529d702867ea948c20d4bcbd4f2172df421416573b17`.
`npm run release:validate` exited 0 with dependency audit 0, readiness
`passed` (11 findings, critical/high 0, failed conditions 0), and strict schema
validation successful. The public tgz installed in isolation; CLI `1.6.1`,
the public rule SDK import (5 exports), scan (15 files, 120 symbols, 193
relations), and generated repo-graph schema validation all passed. Evidence is
recorded in
`C:\Users\ryo-n\Codex_dev\code-to-gate-release-1.6.1-20260911\publication-check.json`
and
`C:\Users\ryo-n\Codex_dev\code-to-gate-release-1.6.1-20260911\public-package-check.json`.
npm remains unpublished.

## Historical 1.6.0 Release Status

`1.6.0` was the public GitHub release from integrated revision `a793d2f`.
Its publication and verification details remain in the historical records and
are not rewritten by the `1.6.1` publication.

## Release Notes Alignment

`CHANGELOG.md` is the source for the `v1.6.1` release notes. The public GitHub
release asset is the supported install path; npm remains unavailable until a
maintainer publishes the package and records independent publication evidence.

## Publication Evidence Policy

No npm publication has been performed for `1.6.1`. On 2026-09-11, `npm view
@quality-harness/code-to-gate` returned `E404`.
These results do not establish broader publish permissions. If npm publication
is performed, the release evidence bundle must include:

- `npm whoami`
- `npm publish --access public`
- `npm view @quality-harness/code-to-gate version dist-tags --json`

Until those commands are captured, npm remains `Not published`.

## Non-npm Distribution Scope

Current public distribution is the GitHub release asset, then npm after
publication. There is no supported `docker run code-to-gate/cli` image and no
standalone prebuilt binary in the current release surface.

- Docker image support: limited to the plugin sandbox runner described in `docs/plugin-sandbox.md`.
- Prebuilt binary support: future scope; require packaging, signing, checksum,
  and platform smoke-test evidence before being documented as an install path.

## npm Publication Status

The package name `@quality-harness/code-to-gate` is not currently visible on
the public npm registry. The npm view check returned `E404` on 2026-09-11; npm
remains `Not published` until a successful publish and view check are recorded:

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
