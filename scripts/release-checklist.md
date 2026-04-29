# code-to-gate Release Checklist

This checklist ensures all release readiness criteria are met before publishing a release.

---

## Pre-Release Checks

### Code Quality

- [ ] **Build successful**: `npm run build` completes without errors
- [ ] **Tests passing**: `npm test` achieves acceptable pass rate
  - Alpha releases: >= 80% pass rate acceptable
  - Beta releases: >= 90% pass rate acceptable
  - Stable releases: All tests must pass
- [ ] **No TypeScript errors**: Build output is clean
- [ ] **Coverage threshold met**: `npm run test:coverage` meets vitest.config.ts thresholds

### CLI Validation

- [ ] **scan command works**: `node dist/cli.js scan fixtures/demo-shop-ts --out .qh`
- [ ] **analyze command works**: `node dist/cli.js analyze fixtures/demo-shop-ts --emit all --out .qh --llm-mode none`
- [ ] **readiness command works**: `node dist/cli.js readiness fixtures/demo-shop-ts --out .qh --llm-mode none`
- [ ] **schema validate works**: `node dist/cli.js schema validate schemas/*.schema.json`
- [ ] **export commands work**: All export formats (gatefield, state-gate, manual-bb, workflow-evidence)

### Artifacts Validation

- [ ] **repo-graph.json generated**: Normalized repository structure
- [ ] **findings.json generated**: Quality findings with evidence binding
- [ ] **risk-register.yaml generated**: Risk assessment
- [ ] **invariants.yaml generated**: Business/security invariants
- [ ] **test-seeds.json generated**: QA test design recommendations
- [ ] **release-readiness.json generated**: Release status
- [ ] **audit.json generated**: Run metadata

### Schema Validation

- [ ] **All artifacts validate**: `node dist/cli.js schema validate` passes for each artifact
- [ ] **Core schemas valid**: All schemas in `schemas/` directory are valid JSON Schema
- [ ] **Integration schemas valid**: All schemas in `schemas/integrations/` directory are valid

---

## Version and Documentation

### Version

- [ ] **Version updated in package.json**: Follow semver convention
  - `major.minor.patch-alpha.N` for alpha releases
  - `major.minor.patch-beta.N` for beta releases
  - `major.minor.patch-rc.N` for release candidates
  - `major.minor.patch` for stable releases
- [ ] **Version not already released**: Check git tags and npm registry

### CHANGELOG

- [ ] **CHANGELOG.md updated**: Entry for new version exists
- [ ] **CHANGELOG follows Keep a Changelog**: Format is consistent
- [ ] **All notable changes listed**: Added, Changed, Fixed, Security, Documentation sections
- [ ] **Release date included**: Date format YYYY-MM-DD

### README

- [ ] **Current Status section accurate**: Reflects actual project state
- [ ] **Known Gaps section updated**: Lists current known issues
- [ ] **Documentation Map current**: Links to all documents
- [ ] **CLI examples updated**: Commands match current CLI behavior

---

## Release Steps

### 1. Run Validation Script

```bash
./scripts/release-validate.sh
```

For strict validation (all tests must pass):

```bash
./scripts/release-validate.sh --strict
```

### 2. Create Release Branch

```bash
git checkout -b release/vX.Y.Z
```

### 3. Update Version

```bash
# Update package.json version
npm version X.Y.Z-alpha.N --no-git-tag-version
# or for stable release
npm version X.Y.Z --no-git-tag-version
```

### 4. Update CHANGELOG

Add release entry to CHANGELOG.md:

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- New features

### Changed
- Changes to existing features

### Fixed
- Bug fixes

### Security
- Security improvements

### Documentation
- Documentation updates
```

### 5. Run Validation Again

```bash
./scripts/release-validate.sh --version X.Y.Z-alpha.N
```

### 6. Commit Release Changes

```bash
git add package.json package-lock.json CHANGELOG.md README.md
git commit -m "Release vX.Y.Z-alpha.N"
```

### 7. Create Git Tag

```bash
git tag -a vX.Y.Z-alpha.N -m "Release vX.Y.Z-alpha.N"
```

---

## GitHub Release Steps

### 1. Push to Main Branch

```bash
git push origin main --tags
```

### 2. Create GitHub Release

Via GitHub UI or gh CLI:

```bash
gh release create vX.Y.Z-alpha.N \
  --title "vX.Y.Z-alpha.N" \
  --notes-file .qh-release-validation.yaml \
  --draft
```

### 3. Generate Release Notes

Include the following sections:

- **Summary**: Brief description of release
- **Changes**: List from CHANGELOG.md
- **Breaking Changes**: Any breaking changes (if applicable)
- **Migration Guide**: Steps for users to upgrade (if applicable)
- **Known Issues**: Current limitations

### 4. Attach Release Artifacts

Upload the following artifacts:

- [ ] release-readiness.json
- [ ] findings.json
- [ ] audit.json
- [ ] results.sarif (if available)

### 5. Publish Release

- [ ] Review release notes
- [ ] Verify artifacts attached
- [ ] Mark as pre-release (for alpha/beta/rc)
- [ ] Publish release

---

## Post-Release Verification

### Verify GitHub Release

- [ ] Release visible in GitHub releases page
- [ ] Release tag created correctly
- [ ] Artifacts downloadable
- [ ] Release notes accurate

### Verify CI Workflow

- [ ] GitHub Actions workflow triggered
- [ ] Build workflow passed
- [ ] Release workflow passed (if configured)
- [ ] SARIF uploaded to code scanning (if configured)

### Verify Artifacts

- [ ] Download and test artifacts from release
- [ ] Schema validation passes on downloaded artifacts
- [ ] CLI works with released artifacts

### Communication

- [ ] Announce release in team channel (if applicable)
- [ ] Update project status documentation
- [ ] Close resolved issues in GitHub
- [ ] Update roadmap if needed

---

## Rollback Procedure (If Issues Found)

### Quick Rollback

```bash
# Delete GitHub release
gh release delete vX.Y.Z-alpha.N

# Delete git tag
git push --delete origin vX.Y.Z-alpha.N
git tag -d vX.Y.Z-alpha.N

# Revert release commit
git revert <commit-sha>
```

### Full Rollback

1. Delete GitHub release
2. Delete git tag (local and remote)
3. Revert version changes in package.json
4. Revert CHANGELOG changes
5. Create hotfix if needed

---

## Release Naming Convention

| Type | Format | Example | Stability |
|------|--------|---------|-----------|
| Alpha | `X.Y.Z-alpha.N` | `0.2.0-alpha.1` | Early development |
| Beta | `X.Y.Z-beta.N` | `0.2.0-beta.1` | Feature-complete |
| RC | `X.Y.Z-rc.N` | `0.2.0-rc.1` | Final validation |
| Stable | `X.Y.Z` | `0.2.0` | Production-ready |

---

## Validation Script Quick Reference

```bash
# Standard validation
./scripts/release-validate.sh

# Strict validation (all tests must pass)
./scripts/release-validate.sh --strict

# Skip tests (use when tests already verified)
./scripts/release-validate.sh --skip-tests

# Validate specific version
./scripts/release-validate.sh --version 0.2.0-alpha.2

# Show help
./scripts/release-validate.sh --help
```

---

## Checklist Status Legend

- `[ ]` Not completed
- `[x]` Completed
- `[!]` Failed/needs attention
- `[-]` Skipped (with justification)