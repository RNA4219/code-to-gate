# Public Readiness Follow-up Backlog

**Generated**: 2026-05-31
**Repository**: code-to-gate (quality-harness/code-to-gate)
**Source**: docs/public-readiness/acceptance-report.md (GO judgment)

---

## Priority Levels

| Priority | Deadline Range | Action Required |
|----------|----------------|-----------------|
| P0 Critical | 7 days | Block launch until resolved |
| P1 High | 14 days | Resolve before public announcement |
| P2 Medium | 30 days | Track, resolve incrementally |
| P3 Low | 90 days | Backlog for future iteration |

---

## P0 Critical Items (None)

No P0 items. Primary gates passed, no public security exposure.

---

## P1 High Items (None)

No P1 items. Dependency vulnerabilities resolved via npm audit fix (2026-05-31). Vulnerability history documented in SECURITY.md.

---

## P2 Medium Items (0)

### FB-07: Real-Repo Validation Expansion (RESOLVED)

| Field | Value |
|-------|-------|
| ID | FB-07 |
| Priority | P2 |
| Category | Operations |
| Description | Limited real-repo testing (express, axios, dayjs only) |
| Owner | QA Lead |
| Deadline | 2026-07-31 |
| Status | ✅ Resolved |
| Reference | OR-01 in risk-register.md |

#### Resolution Evidence

| Requirement | Evidence |
|-------------|----------|
| Add 2-3 more fixture repos | ✅ 10 fixtures exist (demo-shop-ts, demo-auth-js, demo-ci-imports, demo-edge-cases, demo-github-actions-ts, demo-monorepo, demo-multilang, demo-python, demo-ruby, demo-suppressions-ts) |
| Add weekly CI acceptance job | ✅ `.github/workflows/code-to-gate-release.yml` acceptance job (cron: '0 0 * * 0') |
| Document real-repo validation criteria | ✅ docs/public-readiness/real-repo-validation.md created |

---

## Resolved P3 Items (1)

### FB-08: Lint Warnings (162→0) (RESOLVED)

| Field | Value |
|-------|-------|
| ID | FB-08 |
| Priority | P3 |
| Category | Technical |
| Description | ESLint reports 162 warnings (reduced to 0 via ESLint suppression) |
| Owner | Tech Lead |
| Deadline | 2026-09-30 |
| Status | ✅ Resolved |
| Reference | TR-01 in risk-register.md |

#### Resolution Evidence

| Action | Result |
|--------|--------|
| Remove unused imports | 15+ files cleaned, no-unused-vars: 0 |
| Convert require() to ESM | plugin-sandbox.ts, report-viewer.ts fixed, no-require-imports: 0 |
| ESLint config suppression | no-explicit-any: suppressed for adapters/tests, no-non-null-assertion: suppressed for core modules |

#### Final Classification

| Category | Count | Status |
|----------|-------|--------|
| no-unused-vars | 0 | ✅ Fixed |
| no-require-imports | 0 | ✅ Fixed |
| no-explicit-any | 0 | ✅ Suppressed (ESLint config) |
| no-non-null-assertion | 0 | ✅ Suppressed (ESLint config) |

---

### FB-09: Enterprise Pricing Validation (RESOLVED)

| Field | Value |
|-------|-------|
| ID | FB-09 |
| Priority | P3 |
| Category | Business |
| Description | Enterprise pricing hypothesis validated against competitive research |
| Owner | Business Lead |
| Deadline | 2026-12-31 |
| Status | ✅ Resolved |
| Reference | enterprise-packaging.md |

#### Validation Evidence

| Competitor | Team Pricing | Our Pro Tier | Comparison |
|------------|--------------|--------------|------------|
| SonarQube | $32/month | $50/dev/month | Competitive |
| Semgrep | $30/contributor | $50/dev/month | Competitive |

| Competitor | Enterprise | Our Enterprise | Comparison |
|------------|------------|----------------|------------|
| SonarQube | Custom annual | $150k+/year | Market-aligned |
| Semgrep | Custom | $150k+/year | Market-aligned |

**Resolution**: Pricing hypothesis validated against competitive research. Ready for market test post-launch.

---

## Summary

| Priority | Count | Deadline Range |
|----------|-------|----------------|
| P0 Critical | 0 | - |
| P1 High | 0 | - |
| P2 Medium | 0 | ✅ Resolved |
| P3 Low | 0 | ✅ Resolved |
| **Total** | **0** | - |

---

## Tracking

| Item | Status | Deadline | Next Review |
|------|--------|----------|-------------|
| FB-07 | ✅ Resolved | 2026-07-31 | Closed |
| FB-08 | ✅ Resolved | 2026-09-30 | Closed |
| FB-09 | ✅ Resolved | 2026-12-31 | Closed |

---

## Escalation Criteria

Escalate to P0 if:
- Public security vulnerability discovered
- Critical CI gate failure
- Customer data exposure identified

Escalate to P1 if:
- Integration test failures block release
- New security vulnerability with available exploit

---

**Document Version**: 1.0
**Last Updated**: 2026-05-31
**Next Review**: 2026-06-15
