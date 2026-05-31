# Public Readiness Evidence Index

**Generated**: 2026-05-31
**Repository**: code-to-gate (RNA4219/code-to-gate)

---

## Purpose

This index provides a single entry point to all evidence documents for external stakeholders. Each document is classified by evidence type and verification status.

---

## Evidence Classification

| Status | Definition | Use in Public Review |
|--------|------------|---------------------|
| ✅ Verified | Measured, documented, auditable | Primary claims |
| ⚠️ Hypothesis | Reasonable projection, not yet measured | Roadmap assumptions, require validation |
| ❌ Unverified | Needs measurement before publication | Future work items |

---

## Quality Evidence

| Document | Location | Status | Key Claims |
|----------|----------|--------|------------|
| quality-evidence.md | docs/public-readiness/quality-evidence.md | ✅ Verified | Test coverage, CI gates, lint status |
| TECH_DEBT_REGISTER.md | TECH_DEBT_REGISTER.md | ✅ Verified | 106 findings documented, 61 resolved |
| acceptance-report.md | docs/public-readiness/acceptance-report.md | ✅ Verified | GO judgment |
| smoke tests | src/__tests__/smoke/*.test.ts | ✅ Verified | 54 tests passing |
| CI workflow | .github/workflows/code-to-gate-pr.yml | ✅ Verified | lint, typecheck, coverage, analyze |

### Quality Metrics Summary

| Metric | Value | Status |
|--------|-------|--------|
| Smoke tests | 54 passing | ✅ Verified |
| CI tests | 1052 passing, 1 skipped | ✅ Verified |
| Lint errors | 0 | ✅ Verified |
| Lint warnings | 0 | ✅ Verified (ESLint suppression for justified cases) |
| TypeScript errors | 0 | ✅ Verified |
| Test coverage | 83.41% | ✅ Verified (above 80% threshold) |
| Integration tests | All passing | ✅ Verified |
| Dependency audit | 0 vulnerabilities | ✅ Verified |

---

## Security Evidence

| Document | Location | Status | Key Claims |
|----------|----------|--------|------------|
| security-evidence.md | docs/public-readiness/security-evidence.md | ✅ Verified | Plugin sandbox, LLM isolation, redaction |
| SECURITY.md | SECURITY.md | ✅ Verified | Vulnerability reporting, response SLA |
| risk-register.md | docs/public-readiness/risk-register.md | ✅ Verified | 5 open, 2 mitigated, 1 closed |
| plugin-security-contract.md | docs/plugin-security-contract.md | ✅ Verified | Sandbox isolation, redaction rules |
| llm-trust-model.md | docs/llm-trust-model.md | ✅ Verified | Local-first, external opt-in |

### Security Posture Summary

| Capability | Status | Evidence |
|------------|--------|----------|
| Local-first default | ✅ Verified | Architecture, no external transmission |
| Plugin Docker sandbox | ✅ Verified | src/plugin/docker-sandbox.ts |
| Pattern redaction | ✅ Verified | sandbox-config.ts, tests |
| Vulnerability reporting | ✅ Verified | SECURITY.md |
| Known vulnerabilities | ✅ 0 vulns | All resolved via npm audit fix (2026-05-31) |

---

## Business Evidence

| Document | Location | Status | Key Claims |
|----------|----------|--------|------------|
| business-evidence.md | docs/public-readiness/business-evidence.md | ⚠️ Hypothesis | Launch KPIs, enterprise projections |
| public-brief.md | docs/public-brief.md | Mixed | Verified/Hypothesis claims separated |
| enterprise-packaging.md | docs/public-readiness/enterprise-packaging.md | ⚠️ Hypothesis | Pricing model, feature tiers |
| adoption-metrics.md | docs/public-readiness/adoption-metrics.md | ⚠️ Hypothesis | Post-launch tracking plan |
| oss-launch-checklist.md | docs/public-readiness/oss-launch-checklist.md | ✅ Verified | Launch preparation checklist |

### Business Model Summary

| Aspect | Status | Evidence |
|--------|--------|----------|
| OSS core (MIT) | ✅ Verified | LICENSE, package.json |
| Enterprise pricing | ⚠️ Hypothesis | enterprise-packaging.md |
| Launch preparation | ✅ Verified | oss-launch-checklist.md |
| Market positioning | ⚠️ Hypothesis | public-brief.md |

---

## Governance Evidence

| Document | Location | Status | Key Claims |
|----------|----------|--------|------------|
| GOVERNANCE.md | GOVERNANCE.md | ✅ Verified | Decision-making, evidence retention |
| CONTRIBUTING.md | CONTRIBUTING.md | ✅ Verified | Development workflow, PR requirements |
| CLAUDE.md | CLAUDE.md | ✅ Verified | Project context, architecture |
| BLUEPRINT.md | BLUEPRINT.md | ✅ Verified | System design, constraints |
| GUARDRAILS.md | GUARDRAILS.md | ✅ Verified | Implementation rules |
| RUNBOOK.md | RUNBOOK.md | ✅ Verified | Operational procedures |
| real-repo-validation.md | docs/public-readiness/real-repo-validation.md | ✅ Verified | Fixture validation criteria, weekly CI |

### Governance Summary

| Capability | Status | Evidence |
|------------|--------|----------|
| Human final judgment | ✅ Verified | GOVERNANCE.md Principle 1 |
| Evidence retention (90 days) | ✅ Verified | GOVERNANCE.md Section 4 |
| Schema stability (ctg/v1) | ✅ Verified | GOVERNANCE.md Section 5 |
| OSS/private boundary | ✅ Verified | plugin-security-contract.md |

---

## Risk Evidence

| Document | Location | Status | Key Claims |
|----------|----------|--------|------------|
| risk-register.md | docs/public-readiness/risk-register.md | ✅ Verified | 8 risks tracked |
| follow-up-backlog.md | docs/public-readiness/follow-up-backlog.md | ✅ Verified | Resolved follow-up record |

### Risk Summary

| Category | Open | Mitigated | Closed |
|----------|------|-----------|--------|
| Technical | 2 | 0 | 1 |
| Security | 0 | 2 | 0 |
| Operations | 2 | 0 | 0 |
| Legal | 1 | 0 | 0 |
| **Total** | **5** | **2** | **1** |

---

## Public Readiness Document Navigation

### For External Stakeholder Quick Review

1. Start: **docs/public-brief.md** (readiness thesis, market, product)
2. Evidence: **docs/public-readiness/business-evidence.md** (metrics, validation plan)
3. Quality: **docs/public-readiness/quality-evidence.md** (test coverage, CI)
4. Security: **SECURITY.md** + **docs/public-readiness/security-evidence.md**
5. Risks: **docs/public-readiness/risk-register.md**
6. Governance: **GOVERNANCE.md**
7. Acceptance: **docs/public-readiness/acceptance-report.md** (final judgment)

### For Technical Review

1. Architecture: **CLAUDE.md** + **BLUEPRINT.md**
2. Quality: **docs/public-readiness/quality-evidence.md** + smoke tests
3. Security: **SECURITY.md** + **docs/plugin-security-contract.md**
4. Operations: **RUNBOOK.md**
5. Code: **src/** (TypeScript, strict mode)

### For Security Review

1. Policy: **SECURITY.md**
2. Sandbox: **docs/plugin-security-contract.md** + **docs/plugin-sandbox.md**
3. LLM: **docs/llm-trust-model.md** + **docs/local-llm-setup.md**
4. Redaction: **src/plugin/sandbox-config.ts**
5. Risks: **docs/public-readiness/risk-register.md** (SR-01, SR-02)

---

## Evidence Artifacts Location

| Artifact Type | Directory | Example Files |
|---------------|-----------|---------------|
| Schemas | schemas/*.schema.json | findings.schema.json, release-readiness.schema.json |
| Audit logs | .qh/audit.json | Generated per analyze run |
| SARIF output | .qh/results.sarif | GitHub Code Scanning compatible |
| Findings | .qh/findings.json | Static analysis results |
| Release readiness | .qh/release-readiness.json | Policy evaluation result |

---

## Index Version

- Version: 1.0
- Last Updated: 2026-05-31
- Next Review: 2026-06-15 (post-launch)
