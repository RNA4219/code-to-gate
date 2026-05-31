# Business Evidence

This document tracks verifiable business metrics and evidence for external stakeholders.

## Evidence Classification System

| Status | Definition | Use Case |
|--------|------------|----------|
| **Verified** | Measured, documented, auditable | Primary public readiness claims |
| **Hypothesis** | Reasonable projection, not yet measured | Roadmap assumptions |
| **Unverified** | Needs measurement before publication | Future work items |

---

## Current Adoption Status (Pre-Launch)

### Verified Evidence

| Metric | Value | Source | Date |
|--------|-------|--------|------|
| Repository exists | ✅ GitHub.com/quality-harness/code-to-gate | Public repo | 2026-05 |
| Tests passing | 54 smoke tests | CI workflow | 2026-05-30 |
| Lint clean | 0 errors, 0 warnings | ESLint | 2026-05-31 |
| TypeScript clean | 0 errors | tsc --noEmit | 2026-05-30 |
| npm pack valid | 343 files | npm pack --dry-run | 2026-05-30 |
| Documentation complete | 12 docs | File count | 2026-05-30 |

### Hypothesis Evidence

| Metric | Projection | Basis | Validation Plan |
|--------|------------|-------|-----------------|
| Initial GitHub stars | 50-100 in first month | OSS launch promotion | Track via GitHub API |
| npm weekly downloads | 10-50 after launch | README visibility | Track via npm registry API |
| First external user | Within 2 weeks | DevOps community outreach | GitHub issues/PRs from external |

### Unverified (Needs Measurement)

| Metric | Target | Current Status | Next Step |
|--------|--------|---------------|-----------|
| External pilot users | 3 orgs | None identified | Outreach program |
| Enterprise interest | 2 inquiries | None | Enterprise landing page |
| Plugin ecosystem | 5 external plugins | 9 built-in only | Plugin SDK promotion |

---

## Launch Preparation Checklist

### Pre-Launch Requirements

- [ ] README polished with clear value proposition
- [ ] Quickstart guide tested with fresh Node 20 environment
- [ ] Example repositories linked (demo-shop-ts, demo-ci-imports)
- [ ] GitHub Release v1.4.0 created
- [ ] npm publish executed
- [ ] Social announcement prepared (Twitter, LinkedIn, Dev.to)
- [ ] Hacker News submission ready

### Launch Day Metrics

| Action | Target | Measurement |
|--------|--------|-------------|
| npm publish | v1.4.0 live | npm registry check |
| GitHub release | v1.4.0 tag | GitHub releases page |
| Announcement posts | 3 platforms | Post URLs documented |
| Star count baseline | 0 → Track daily | GitHub API |

### Post-Launch KPIs (First 30 Days)

| Week | Metric | Target | Tracking Method |
|------|--------|--------|-----------------|
| Week 1 | Stars | +20 | GitHub API daily |
| Week 1 | npm downloads | +10 | npm registry weekly |
| Week 1 | External issues | 1+ | GitHub issues filter |
| Week 2 | Stars | +40 cumulative | GitHub API |
| Week 2 | npm downloads | +30 cumulative | npm registry |
| Week 2 | External PR/issue | 2+ | GitHub PRs/issues |
| Week 3 | Stars | +60 cumulative | GitHub API |
| Week 3 | npm downloads | +50 cumulative | npm registry |
| Week 4 | Stars | 100+ | GitHub API |
| Week 4 | npm downloads | 100+ | npm registry |
| Week 4 | Plugin interest | 1 inquiry | GitHub discussions |

---

## Enterprise Path Evidence

### Current Enterprise Readiness

| Capability | Status | Evidence |
|------------|--------|----------|
| Docker deployment | ✅ Supported | docs/integrations.md |
| CI/CD integration | ✅ GitHub Actions | .github/workflows/*.yml |
| SARIF output | ✅ Code scanning | src/reporters/sarif.ts |
| Policy engine | ✅ YAML policies | src/config/policy-loader.ts |
| Plugin sandbox | ✅ Docker isolation | src/plugin/sandbox.ts |
| LLM integration | ✅ Local-first | src/llm/ providers |
| Evidence artifacts | ✅ JSON/SARIF | schemas/*.schema.json |

### Enterprise Gaps (Hypothesis)

| Gap | Enterprise Need | OSS Status | Enterprise Path |
|-----|-----------------|------------|-----------------|
| SSO/SAML auth | CI pipeline auth | Not needed (local) | Enterprise CI platform |
| Audit logging | Compliance trails | Basic JSON logs | Enterprise audit module |
| Role-based policies | Team permissions | Single policy | Multi-team policy engine |
| Dashboard UI | Executive reporting | CLI only | Web dashboard (future) |
| SLA support | Production guarantee | None | Enterprise support tier |

---

## Competitive Position Evidence

### Verified Differentiators

| Feature | code-to-gate | SonarQube | CodeClimate | Semgrep |
|---------|--------------|-----------|-------------|---------|
| Local-first | ✅ No data leaves machine | ❌ Cloud default | ❌ Cloud only | ⚠️ Optional |
| Quality gate focus | ✅ Release-readiness | ✅ Quality gates | ✅ Quality | ⚠️ Security focus |
| Evidence artifacts | ✅ JSON/SARIF/audit | ⚠️ JSON only | ⚠️ JSON | ✅ SARIF |
| Plugin extensibility | ✅ Docker sandbox | ⚠️ Limited | ❌ No plugins | ✅ Rules |
| OSS core | ✅ MIT license | ❌ Commercial | ❌ Commercial | ✅ LGPL |
| Price | Free (OSS) | $150k+/year | $100+/mo | Free + Enterprise |

### Hypothesis: Market Position

**Claim**: code-to-gate fills "local-first quality gate" gap between OSS tools (limited features) and commercial platforms (cloud-required, expensive).

**Evidence Type**: Hypothesis

**Validation**: User interviews, competitive feature comparison, adoption from teams citing "data privacy" as concern.

---

## Business Model Evidence

### Current Model (OSS)

| Aspect | Status | Evidence |
|--------|--------|----------|
| License | MIT | LICENSE file |
| Pricing | Free | npm package free |
| Support | Community | GitHub issues |
| Distribution | npm, GitHub | package.json |

### Hypothesis: Enterprise Model

| Tier | Price (Projected) | Features | Target |
|------|-------------------|----------|--------|
| OSS | Free | Core analysis, SARIF, policies | Individual devs, small teams |
| Pro | $50/dev/month | Dashboard, team policies, priority support | 10-50 dev teams |
| Enterprise | $150k+/year | SSO, audit compliance, SLA, custom rules | 100+ dev orgs |

**Status**: Hypothesis - needs market validation before pricing finalized.

---

## Validation Roadmap

| Phase | Duration | Goal | Evidence |
|-------|----------|------|----------|
| Launch | Week 1 | Publish to npm, announce | Downloads, stars |
| Adoption | Weeks 2-4 | External users engage | Issues, PRs, discussions |
| Validation | Month 2 | 5+ external users, feedback | User interviews, NPS |
| Enterprise | Month 3+ | 2+ enterprise inquiries | Sales conversations |

---

## Evidence Retention Policy

All evidence tracked in this document follows the 90-day retention policy defined in GOVERNANCE.md. Evidence artifacts (logs, metrics, user feedback) are retained for audit purposes.

**Last Updated**: 2026-05-30
**Next Review**: 2026-06-30 (post-launch KPI update)
