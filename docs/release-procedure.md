# code-to-gate Release Procedure

This document describes the standard procedure for releasing code-to-gate.

---

## Overview

code-to-gate follows a phased release approach with validation gates at each stage. The release process ensures quality through automated checks and manual verification.

## Release Types

| Type | Purpose | Validation Level | Target Audience |
|------|---------|------------------|-----------------|
| Alpha | Early testing | Threshold-based (80% tests) | Internal team, early adopters |
| Beta | Feature-complete testing | Threshold-based (90% tests) | Broader testing group |
| RC | Final validation | Strict (all tests pass) | Pre-production validation |
| Stable | Production | Strict (all tests pass) | All users |

---

## Prerequisites

Before starting a release, ensure:

1. **Repository state is clean**
   - No uncommitted changes
   - All features intended for release are merged
   - Main branch is up-to-date

2. **Dependencies are current**
   - `npm ci` runs successfully
   - No outdated critical dependencies

3. **Previous release is documented**
   - CHANGELOG.md reflects previous release
   - README.md status is accurate

---

## Release Procedure

### Step 1: Pre-Release Preparation

#### 1.1 Verify Current State

```bash
# Check current branch
git branch

# Check current version
cat package.json | jq '.version'

# Check for uncommitted changes
git status

# Check recent commits
git log --oneline -10
```

#### 1.2 Run Pre-Release Validation

```bash
# Run build
npm run build

# Run tests
npm test

# Run coverage
npm run test:coverage
```

For alpha releases, 80% test pass rate is acceptable. For beta, 90%. For stable, all tests must pass.

#### 1.3 Verify CLI Functionality

```bash
# Test basic commands
node dist/cli.js scan fixtures/demo-shop-ts --out .qh-test-release
node dist/cli.js analyze fixtures/demo-shop-ts --emit all --out .qh-test-release --llm-mode none
node dist/cli.js readiness fixtures/demo-shop-ts --out .qh-test-release --llm-mode none

# Verify artifacts
ls -la .qh-test-release

# Validate schemas
node dist/cli.js schema validate schemas/*.schema.json

# Cleanup
rm -rf .qh-test-release
```

### Step 2: Version Update

#### 2.1 Determine Version Number

Follow semantic versioning:

- **Major (X.0.0)**: Breaking changes, major features
- **Minor (0.Y.0)**: New features, no breaking changes
- **Patch (0.0.Z)**: Bug fixes, minor improvements

For pre-release versions:

- **Alpha**: `X.Y.Z-alpha.N` - Early development, unstable
- **Beta**: `X.Y.Z-beta.N` - Feature-complete, testing phase
- **RC**: `X.Y.Z-rc.N` - Release candidate, final validation

#### 2.2 Update package.json

```bash
# Option 1: Using npm version (without git tag)
npm version X.Y.Z-alpha.N --no-git-tag-version

# Option 2: Manual edit
# Edit package.json manually and update version field
```

Verify the version is correct:

```bash
cat package.json | jq '.version'
```

### Step 3: CHANGELOG Update

#### 3.1 Add Release Entry

Edit CHANGELOG.md to add a new section:

```markdown
## [X.Y.Z-alpha.N] - YYYY-MM-DD

### Added
- Feature description
- Another feature

### Changed
- Change description

### Fixed
- Fix description

### Security
- Security improvement (if any)

### Documentation
- Documentation update (if any)
```

#### 3.2 Review CHANGELOG

Ensure:

- All notable changes are documented
- Changes are categorized correctly
- Dates are in YYYY-MM-DD format
- No duplicate entries

### Step 4: README Update

#### 4.1 Update Current Status

Update the status table in README.md:

```markdown
| 段階 | 状態 | 説明 |
|---|---|---|
| vX.Y 要件定義 | GO | ... |
| vX.Y 仕様書 | GO | ... |
| vX.Y 実装 | in progress / complete | ... |
```

#### 4.2 Update Known Gaps

If this is an alpha/beta release, update the Known Gaps section with current limitations.

### Step 5: Final Validation

#### 5.1 Run Release Validation Script

```bash
./scripts/release-validate.sh --version X.Y.Z-alpha.N
```

Review the output summary file `.qh-release-validation.yaml`.

#### 5.2 Address Any Failures

If validation fails:

1. Review failure details
2. Fix issues or document justification for threshold-based passes
3. Re-run validation

### Step 6: Commit and Tag

#### 6.1 Create Release Branch

```bash
git checkout -b release/vX.Y.Z-alpha.N
```

Or work directly on main for minor releases:

```bash
git checkout main
```

#### 6.2 Commit Release Changes

```bash
git add package.json package-lock.json CHANGELOG.md README.md
git commit -m "chore: release vX.Y.Z-alpha.N

- Update version to X.Y.Z-alpha.N
- Update CHANGELOG for release
- Update README status

Co-Authored-By: Release Automation <noreply@code-to-gate>"
```

#### 6.3 Create Git Tag

```bash
git tag -a vX.Y.Z-alpha.N -m "Release vX.Y.Z-alpha.N

Summary: Brief release summary

Changes:
- Key change 1
- Key change 2

See CHANGELOG.md for complete details."
```

### Step 7: GitHub Release

#### 7.1 Push to Remote

```bash
git push origin main --tags
# Or push release branch
git push origin release/vX.Y.Z-alpha.N --tags
```

#### 7.2 Create GitHub Release

Using GitHub CLI:

```bash
gh release create vX.Y.Z-alpha.N \
  --title "vX.Y.Z-alpha.N" \
  --notes "$(cat <<'EOF'
## Summary

Brief description of this release.

## Changes

### Added
- Feature 1
- Feature 2

### Changed
- Change 1

### Fixed
- Fix 1

See [CHANGELOG.md](CHANGELOG.md) for complete details.

## Known Issues

- Issue 1
- Issue 2

## Installation

```bash
npm install code-to-gate@X.Y.Z-alpha.N
```

## Validation Results

This release passed release validation checks. See attached artifacts for details.
EOF
)" \
  --prerelease
```

Or via GitHub web interface:

1. Go to Releases page
2. Click "Draft a new release"
3. Select the tag
4. Fill in release title and notes
5. Mark as pre-release (for alpha/beta/rc)
6. Publish

#### 7.3 Attach Artifacts

Attach validation artifacts to the release:

```bash
gh release upload vX.Y.Z-alpha.N \
  .qh-release-validation.yaml \
  --clobber
```

### Step 8: Post-Release Verification

#### 8.1 Verify Release

Check GitHub release page:

- Release is visible
- Tag is correct
- Release notes are accurate
- Artifacts are attached

#### 8.2 Verify CI Workflows

Check GitHub Actions:

- Build workflow triggered and passed
- Release workflow triggered (if configured)
- SARIF uploaded (if configured)

#### 8.3 Test Released Version

```bash
# Download and verify
gh release download vX.Y.Z-alpha.N

# If npm package exists
npm install code-to-gate@X.Y.Z-alpha.N
```

---

## Automation

### Validation Script

The release validation script automates pre-release checks:

```bash
./scripts/release-validate.sh
```

Options:

| Option | Description |
|--------|-------------|
| `--strict` | Require all tests to pass |
| `--skip-tests` | Skip test execution |
| `--version X.Y.Z` | Validate specific version |
| `--dry-run` | Run checks without changes |
| `--help` | Show usage |

### GitHub Workflow

The `.github/workflows/code-to-gate-release.yml` workflow provides automated release readiness evaluation:

- Runs on push to main branch
- Can be triggered manually with inputs
- Generates release evidence artifacts
- Uploads SARIF to code scanning
- Blocks release if not ready

---

## Rollback Procedure

### If Issues Found Before GitHub Release

```bash
# Delete local tag
git tag -d vX.Y.Z-alpha.N

# Revert commit
git revert HEAD

# Fix issues and retry
```

### If Issues Found After GitHub Release

```bash
# Delete GitHub release
gh release delete vX.Y.Z-alpha.N --yes

# Delete remote tag
git push --delete origin vX.Y.Z-alpha.N

# Delete local tag
git tag -d vX.Y.Z-alpha.N

# Revert or create hotfix
git revert <release-commit-sha>
# Or create hotfix branch
git checkout -b hotfix/vX.Y.Z-alpha.N-1 main
```

### Document Rollback

Update CHANGELOG.md to note the withdrawn release:

```markdown
## [X.Y.Z-alpha.N] - YYYY-MM-DD -- WITHDRAWN

Release withdrawn due to [issue description].
```

---

## Release Timeline

### Alpha Release Cycle

- Development: 1-2 weeks
- Testing: 3-5 days
- Release: After validation passes

### Beta Release Cycle

- Alpha feedback integration: 1-2 weeks
- Stabilization: 3-7 days
- Release: After 90% tests pass

### Stable Release Cycle

- Beta testing: 1-2 weeks
- Final validation: 3-5 days
- Release: After all tests pass

---

## Release Communication

### Internal Announcement

Share release information:

- Version number
- Key changes
- Known issues
- Testing requirements

### Issue Management

- Close resolved issues
- Update open issues with new information
- Tag issues with release version

### Documentation Updates

- Update roadmap if needed
- Update acceptance criteria status
- Archive release artifacts

---

## Appendix: Version History

| Version | Date | Type | Notes |
|---------|------|------|-------|
| 0.2.0-alpha.1 | 2026-04-30 | Alpha | Core commands, artifact generation |
| 0.1.0 | 2026-04-15 | Alpha | Initial structure |

---

## Appendix: Validation Checklist Quick Reference

```
[X] Build successful
[X] Tests passing (threshold met)
[X] CLI commands work
[X] Artifacts generated
[X] Schema validation passes
[X] Version updated
[X] CHANGELOG updated
[X] README updated
```

All checks must pass for stable release. Threshold-based passes acceptable for alpha/beta.