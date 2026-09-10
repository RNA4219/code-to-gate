# Public Readiness Follow-up Backlog

**Generated**: 2026-09-10
**Repository**: code-to-gate (RNA4219/code-to-gate)
**Source**: docs/public-readiness/acceptance-report.md, docs/distribution-status.md, docs/real-repo-validation-evidence-20260704.md

---

## Priority Levels

| Priority | Deadline Range | Action Required |
|----------|----------------|-----------------|
| P0 Critical | 7 days | Block launch until resolved |
| P1 High | 14 days | Resolve before public announcement |
| P2 Medium | 30 days | Track, resolve incrementally |
| P3 Low | 90 days | Backlog for future iteration |

---

## P0 Critical Items (None assigned)

No P0 item is assigned from the available evidence. Public claims remain
bounded by the P1 distribution and real-repo precision follow-ups below.

---

## P1 High Items (2)

### FB-07: Real-Repo Precision Adjudication (OPEN)

| Field | Value |
|-------|-------|
| ID | FB-07 |
| Priority | P1 |
| Category | Operations |
| Description | Real-repo execution passed, but finding precision has no human adjudication |
| Owner | QA Lead |
| Deadline | Human adjudication pending |
| Status | ⚠️ Execution complete; precision review pending |
| Reference | `docs/real-repo-validation-evidence-20260704.md`; [`AC-20260910-02-precision-review`](../acceptance/AC-20260910-02-precision-review.md) |

#### Current Evidence

The 2026-07-04 run passed scan, analyze, readiness, and schema validation for
4/4 repositories. It produced 1,721 findings. No human TP/FP/Accepted-design
review was completed, so all findings are recorded as Uncertain and real-repo
precision is not claimed.

---

### FB-10: Distribution and Public Claim Alignment (OPEN)

| Field | Value |
|-------|-------|
| ID | FB-10 |
| Priority | P1 |
| Category | Release / Documentation |
| Description | npm publication and public wording must remain aligned with the shipped surface |
| Owner | Release Maintainer |
| Deadline | Before npm publication or public stable claim |
| Status | Open |
| Reference | `docs/distribution-status.md` |

#### Current Evidence

`package.json` is the local `1.6.0` candidate and the latest GitHub release is
`v1.5.1`; npm remains unpublished according to the repository distribution
record. A separate 2026-09-10 precision run recorded 1,449 findings, including
current non-reproduction records for FP-DM-002, FP-DM-003, FP-RS-002, and
FP-MIS-001. Human precision adjudication remains incomplete. GitHub/source
installation is the current supported distribution path. Public docs must
continue to describe review-required candidates and the QA evidence role until
publication and release evidence are complete.

---

## P2 Medium Items (0)

## Resolved P3 Items (2)

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
| P1 High | 2 | Human adjudication / npm publication alignment |
| P2 Medium | 0 | - |
| P3 Low | 2 | ✅ Resolved |
| **Total** | **4** | - |

---

## Tracking

| Item | Status | Deadline | Next Review |
|------|--------|----------|-------------|
| FB-07 | ⚠️ Precision review pending | Human adjudication pending | 2026-10-10 |
| FB-10 | Open | Before npm publication or public stable claim | 2026-10-10 |
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

**Document Version**: 1.1
**Last Updated**: 2026-09-10
**Next Review**: 2026-10-10
