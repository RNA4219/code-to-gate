# OSS Launch Checklist

Pre-launch checklist for code-to-gate public release.

## Phase 1: Package Readiness (Complete ✅)

| Item | Status | Evidence | Owner |
|------|--------|----------|-------|
| npm package.json valid | ✅ | `npm pack --dry-run` passed | Build |
| TypeScript compilation | ✅ | `tsc` clean | Build |
| ESLint (0 errors) | ✅ | 0 errors, warnings acceptable | Quality |
| Smoke tests passing | ✅ | 54 tests pass | Quality |
| Schema validation | ✅ | ajv schemas valid | Quality |
| LICENSE file | ✅ | MIT license | Legal |
| README.md exists | ✅ | Basic README | Docs |
| CHANGELOG.md exists | ✅ | v1.0-v1.3 entries | Docs |

## Phase 2: Documentation Polish (In Progress)

| Item | Status | Target | Owner |
|------|--------|--------|-------|
| README value proposition | ⚠️ Needs enhancement | Clear 1-line pitch | Docs |
| Quickstart tested | ⚠️ Needs validation | Fresh Node 20 test | Docs |
| Example repos linked | ⚠️ Partial | fixtures/demo-* linked | Docs |
| Installation guide | ✅ | npm install documented | Docs |
| CLI reference | ✅ | docs/cli-reference.md | Docs |
| Integration examples | ✅ | docs/integrations.md | Docs |
| Plugin guide | ✅ | docs/plugin-development.md | Docs |
| DD documentation | ✅ | docs/dd-readiness.md, docs/architecture-for-dd.md | DD |

### README Enhancement Requirements

**Current State**: Basic README with installation and basic usage.

**Target State**: Investor-ready, user-friendly README:

```markdown
# code-to-gate

**Local-first quality gate for release-readiness**

Turn repository signals into evidence-backed findings. No code leaves your machine.

[Quickstart](docs/quickstart.md) | [CLI Reference](docs/cli-reference.md) | [Why code-to-gate?](docs/product-narrative.md)

## 5-Minute Path

npm install -g @quality-harness/code-to-gate
code-to-gate analyze ./src --out .qh

→ See findings.json, release-readiness.json, results.sarif

## What It Does

- Detects quality risks (payment logic, auth guards, validation gaps)
- Generates SARIF for GitHub Code Scanning
- Produces release-readiness evidence for compliance

## Why Local-First?

Your code never leaves your machine. No cloud required. No API keys. No data sharing.

[Full documentation →](docs/)
```

## Phase 3: Distribution Setup

| Item | Status | Action | Owner |
|------|--------|--------|-------|
| npm registry publish | ⚠️ Pending | `npm publish --access public` | Release |
| GitHub Release v1.3.0 | ⚠️ Pending | Create release with notes | Release |
| GitHub topics/tags | ⚠️ Pending | Add: code-analysis, quality-gate, static-analysis | Release |
| GitHub description | ⚠️ Pending | "Local-first quality gate CLI" | Release |

### npm Publish Checklist

```bash
# Pre-publish validation
npm run release:dd  # Already passed

# Publish sequence
npm login           # Authenticate with npm
npm publish --access public

# Verify
npm view @quality-harness/code-to-gate
```

### GitHub Release Checklist

- [ ] Create tag: `git tag v1.3.0`
- [ ] Push tag: `git push origin v1.3.0`
- [ ] Create GitHub Release with:
  - Title: `v1.3.0 - Initial Public Release`
  - Notes: Key features, installation, changelog summary
  - Assets: None (npm is distribution)

## Phase 4: Launch Announcement

### Platform Checklist

| Platform | Status | Content Ready | Target Timing |
|----------|--------|---------------|---------------|
| Twitter/X | ⚠️ Pending | Draft announcement | Day 1 |
| LinkedIn | ⚠️ Pending | Professional announcement | Day 1 |
| Dev.to | ⚠️ Pending | Technical blog post | Day 2-3 |
| Hacker News | ⚠️ Pending | "Show HN" post | Day 2-3 |
| Reddit r/devops | ⚠️ Pending | Community post | Day 3-5 |
| Product Hunt | ⚠️ Optional | Future consideration | Week 2 |

### Announcement Template

**Twitter/X (280 chars)**:
```
🚀 code-to-gate: Local-first quality gate CLI

- Detect quality risks before release
- Generate SARIF for GitHub Code Scanning
- No code leaves your machine

npm install -g @quality-harness/code-to-gate

github.com/quality-harness/code-to-gate
```

**LinkedIn (Professional)**:
```
Introducing code-to-gate, a local-first quality gate CLI for DevOps teams.

Key differentiator: No code leaves your machine. Perfect for teams with data privacy requirements.

Features:
- Evidence-backed findings
- SARIF output for GitHub Code Scanning  
- Plugin extensibility with Docker sandbox

Open source (MIT). Available on npm.

🔗 github.com/quality-harness/code-to-gate
```

**Dev.to (Technical)**:
```
Title: Building a Local-First Quality Gate: Why Your Code Should Stay on Your Machine

Outline:
1. Problem: Cloud-based tools send code to third parties
2. Solution: Local-first architecture
3. How code-to-gate works
4. Quick demo (analyze → findings → SARIF)
5. Plugin architecture
6. Getting started
```

**Hacker News "Show HN"**:
```
Show HN: code-to-gate – Local-first quality gate CLI (MIT)

I built a CLI tool that analyzes repositories for quality risks without sending code to any external service.

What it does:
- Detects security/quality patterns (auth guards, payment logic, validation)
- Generates SARIF for GitHub Code Scanning
- Produces release-readiness evidence

Why local-first: Many teams can't send code to cloud tools due to compliance. This runs entirely on your machine.

github.com/quality-harness/code-to-gate
npm: @quality-harness/code-to-gate
```

## Phase 5: Example Repositories

| Repo | Status | Purpose | Location |
|------|--------|---------|----------|
| demo-shop-ts | ✅ | E-commerce patterns | fixtures/demo-shop-ts |
| demo-ci-imports | ✅ | CI integration demo | fixtures/demo-ci-imports |
| External example | ⚠️ Future | Real-world usage | TBD (community contribution) |

### Example Usage Guide

Link to examples in README:

```markdown
## Examples

- [E-commerce shop](fixtures/demo-shop-ts) - Payment logic, auth patterns
- [CI integration](fixtures/demo-ci-imports) - GitHub Actions workflow
```

## Phase 6: Community Setup

| Item | Status | Target | Owner |
|------|--------|--------|-------|
| GitHub Discussions | ⚠️ Enable | Q&A, announcements | Community |
| Issue templates | ⚠️ Create | Bug report, feature request | Community |
| PR template | ⚠️ Create | Checklist | Community |
| Discord/Slack | ⚠️ Optional | Future community hub | Community |
| CONTRIBUTING.md | ✅ | Created | Docs |
| GOVERNANCE.md | ✅ | Created | Docs |
| SECURITY.md | ✅ | Created | Docs |

### GitHub Discussions Categories

- 📢 Announcements (maintainer-only posts)
- 💡 Ideas & Feature Requests
- 🙏 Q&A
- 🏆 Showcase (user projects)

## Phase 7: Launch Day Sequence

### Hour-by-Hour Plan

| Time | Action | Duration |
|------|--------|----------|
| 09:00 | npm publish | 5 min |
| 09:05 | Verify npm package visible | 5 min |
| 09:10 | GitHub Release v1.3.0 | 10 min |
| 09:20 | Twitter/X announcement | 5 min |
| 09:25 | LinkedIn announcement | 10 min |
| 09:35 | Enable GitHub Discussions | 5 min |
| 10:00 | Dev.to submission | 30 min |
| 14:00 | Hacker News "Show HN" | 10 min |
| 16:00 | Reddit r/devops | 15 min |
| 17:00 | Monitor initial responses | Ongoing |

### Launch Day Metrics Baseline

| Metric | Baseline (T=0) | Check Interval |
|--------|----------------|----------------|
| GitHub stars | 0 | Every 4 hours |
| npm downloads | 0 | Every 24 hours |
| Twitter likes | 0 | Every 2 hours |
| LinkedIn reactions | 0 | Every 4 hours |

## Post-Launch Monitoring

### Week 1

- [ ] Daily star count tracking
- [ ] Monitor GitHub issues for first external feedback
- [ ] Respond to all comments/questions within 24 hours
- [ ] Update README based on common questions

### Week 2-4

- [ ] Weekly metric summary
- [ ] Identify top feedback themes
- [ ] Plan v1.3.1 fixes based on feedback
- [ ] Track first external PR/issue

## Success Criteria

| Milestone | Criteria | Timeline |
|-----------|----------|----------|
| Launch success | npm package live, 3 announcements posted | Day 1 |
| Initial traction | 50+ GitHub stars, 20+ npm downloads | Week 1 |
| Community engagement | 5+ external issues/PRs | Month 1 |
| Sustainability | 100+ stars, 100+ weekly downloads, 1+ external contributor | Month 1 |

---

**Document Status**: Ready for execution
**Last Updated**: 2026-05-30
**Execution Start**: TBD (requires npm auth)