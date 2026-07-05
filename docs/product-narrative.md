# Product Narrative

> **Local-first quality evidence layer that turns code signals into release-readiness review input.**

Findings are review-required candidates. They are not confirmed vulnerabilities,
not SAST replacement output, and not automatic release approvals.

---

## Problem

Software teams face a growing challenge: **how do you collect useful code-quality
and security-relevant evidence at scale without slowing down delivery?**

### The Stakes Are High

| Pressure | Impact | Evidence |
|----------|--------|----------|
| Security breaches | $4.45M average cost | IBM 2023 report (industry consensus) |
| Technical debt | Silently slows velocity | Accepted industry problem |
| Compliance requirements | Audit trails required | SEC rules, EU DORA in effect |
| Developer burnout | Manual gates increase workload | Industry-recognized problem |

### Current Solutions Fall Short

| Solution | Gap | Why It Matters |
|----------|-----|----------------|
| Manual code review | Slow, inconsistent, doesn't scale | Bottleneck at scale |
| Traditional SAST tools | High false positives, complex setup | Developer friction |
| Cloud-based scanners | Code leaves your infrastructure | Privacy/compliance risk |
| Point solutions | Fragmented toolchain, no unified view | Operational overhead |

---

## Why Now

### Regulatory Pressure Is Increasing

| Regulation | Impact | Status |
|------------|--------|--------|
| SEC Cybersecurity Rules | Public companies must disclose incidents | ✅ In effect (Dec 2023) |
| EU DORA | Financial entities need ICT risk management | ✅ In effect (Jan 2025) |
| HIPAA Security Rule | Healthcare requires audit controls | ✅ Long-standing |
| FedRAMP | Government contractors need evidence | ✅ Active |

### Privacy Concerns Are Growing

- **GDPR/CCPA**: Data processing agreements required for cloud tools
- **Enterprise policies**: Many orgs block code upload to external services
- **Security audits**: Code exposure is a documented risk vector

### Evidence Gap Is Real

| Tool | Scans Code? | Generates Evidence? |
|------|-------------|---------------------|
| SonarQube | ✅ | ⚠️ JSON only, no compliance artifacts |
| Snyk | ✅ | ⚠️ Limited audit trail |
| Semgrep | ✅ | ⚠️ SARIF but no release-readiness |
| CodeQL | ✅ | ❌ Security findings only |

**Gap**: Tools detect issues but often do not produce release-readiness evidence
that is easy for QA, reviewers, and human release gates to use.

### Evidence Layer Position

code-to-gate is designed to complement existing scanners and tests, not replace
them:

```
SAST / linter / tests / coverage
          |
          v
  code-to-gate evidence layer
  - review-required candidates
  - impact hypotheses
  - artifact links
  - release-readiness input
          |
          v
Human reviewer / QA gate / downstream approval system
```

Security findings are security-relevant code patterns that need review. They are
not confirmed vulnerabilities.

---

## Product

### What We Built

**code-to-gate** is a CLI tool that:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Source Code   │────▶│   code-to-gate  │────▶│  Quality Gate   │
│   Repository    │     │   Analysis      │     │   Decision      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │  Evidence       │
                        │  Artifacts      │
                        │  (SARIF/JSON)   │
                        └─────────────────┘
```

### Core Features

| Feature | Description | Status |
|---------|-------------|--------|
| Repository scanning | Parse files, extract symbols, build graphs | ✅ Implemented |
| Quality analysis | 17 core rules plus optional database review candidates | ✅ Implemented |
| Release readiness | Policy-based gate input for human/downstream decisions | ✅ Implemented |
| Evidence generation | SARIF, JSON, HTML, gatefield formats | ✅ Implemented |
| Plugin SDK | Docker sandbox supported for custom rules | ✅ Implemented |
| Incremental cache | Fast re-analysis | ✅ Implemented |
| LLM integration | Optional local/remote providers | ✅ Implemented |

### How It Works

```bash
# 1. Scan repository
code-to-gate scan ./src --out .qh

# 2. Analyze for risks
code-to-gate analyze ./src --emit all --out .qh

# 3. Check release readiness
code-to-gate readiness ./src --policy policy.yaml --from .qh --out .qh

# 4. Export for CI/CD
code-to-gate export sarif --from .qh --out results.sarif
```

### Local-First Architecture

> **Your code stays on your machine.**

| Aspect | code-to-gate | Cloud Tools |
|--------|--------------|-------------|
| Code location | Your machine only | Vendor servers |
| Network required | ❌ No (except optional LLM) | ✅ Yes |
| Data processing agreement | ❌ Not needed | ✅ Required |
| GDPR/CCPA risk | ❌ None | ⚠️ Potential exposure |

---

## Differentiation

### Competitive Comparison

| Feature | code-to-gate | SonarQube | Snyk | Semgrep |
|---------|--------------|-----------|------|---------|
| **Local-first** | ✅ Default | ⚠️ Optional | ❌ Cloud required | ⚠️ Optional |
| **Evidence generation** | ✅ Built-in | ⚠️ Limited | ⚠️ Limited | ⚠️ SARIF only |
| **Release-readiness** | ✅ Built-in | ❌ Separate workflow | ❌ Security focus | ❌ Security focus |
| **Plugin SDK** | ✅ Docker sandbox supported | ⚠️ Limited | ❌ Vendor only | ✅ Open rules |
| **Setup time** | ✅ npm install | ⚠️ Complex | ✅ npm install | ✅ npm install |
| **Price (OSS)** | ✅ Free (MIT) | ❌ Commercial | ⚠️ Limited free | ✅ Free (LGPL) |
| **Price (Enterprise)** | TBD | $150k+/year | $100+/dev/mo | $150+/dev/mo |

### Operating Modes

| Mode | Purpose | Output |
|------|---------|--------|
| Standalone mode | Local CLI/CI evidence generation for a repository | findings, risk register, SARIF, release-readiness input |
| QA chain mode | Upstream sensor for HATE, manual-bb-test-harness, QEG, or downstream approval gates | structured evidence and review seeds |

In both modes, final release authority remains outside code-to-gate.

### Key Differentiators

1. **Evidence Native**: Audit artifacts generated by default, not as add-on
2. **Release-Readiness Focus**: Beyond detection -> review evidence and gate input
3. **Local-First Guarantee**: Architecture enforces privacy, not optional setting
4. **Plugin Sandbox**: Docker sandbox supported for safer custom rule execution

### Why We Win

| Scenario | code-to-gate Advantage |
|----------|------------------------|
| Compliance audit | Built-in evidence artifacts, no extra tooling |
| Privacy requirement | No code upload, instant compliance |
| Custom detection | Plugin SDK with sandboxed execution |
| Budget constraint | OSS core free, enterprise optional |

---

## Proof

### Technical Evidence

| Metric | Status | Evidence |
|--------|--------|----------|
| Version stability | package `1.5.0`; GitHub release `v1.4.2`; npm pending | package.json, release records, npm status |
| Test coverage | 80% threshold | npm run test:coverage |
| CI passing | ✅ Green | .github/workflows/ badges |
| Smoke tests | 54 passing | npm run test:smoke |
| Lint clean | 0 errors | npm run lint |
| TypeScript strict | 0 errors | npm run typecheck |

### Architecture Evidence

| Claim | Evidence File |
|-------|---------------|
| Local-first design | docs/architecture-for-public-readiness.md (Data Privacy section) |
| Plugin sandbox | docs/architecture-for-public-readiness.md (Security Architecture section) |
| Schema stability | schemas/*.schema.json (ctg/v1 versioning) |
| Policy engine | src/config/policy-loader.ts, policy-evaluator.ts |

### Governance Evidence

| Document | Purpose |
|----------|---------|
| SECURITY.md | Vulnerability reporting, data handling policy |
| GOVERNANCE.md | Decision-making, evidence retention, schema stability |
| CONTRIBUTING.md | Development workflow, PR requirements |
| docs/public-readiness.md | Public readiness summary for stakeholders |

### Engineering Acceptance vs Adoption Metrics

Engineering acceptance is based on reproducible quality evidence: tests,
schemas, CLI behavior, artifact validity, precision records, and release
procedure evidence. These are product quality gates.

Adoption metrics such as GitHub stars, downloads, marketplace interest, and
community activity are market traction indicators. They inform launch planning
and support investment, but they are not evidence that the analyzer is correct
or release-ready.

| Category | Examples | Used As |
|---|---|---|
| Engineering acceptance | tests passing, schema validation, fixture and real repo evidence, package audit | Product quality gate |
| Marketing / adoption | GitHub stars, downloads, issue activity, pilot interest | Launch and growth signal |

### Competitive Validation

| Claim | Validation Method |
|-------|-------------------|
| "Competitors don't generate evidence" | Feature comparison of SonarQube, Snyk, Semgrep, CodeQL documentation |
| "Local-first is unique" | Architecture comparison of cloud-based vs local-first tools |
| "Docker sandbox is supported" | Plugin system comparison (Docker-supported execution vs native-only execution) |

---

## Roadmap

### Current State (Q2 2026)

| Item | Status |
|------|--------|
| Core analysis engine | ✅ Complete |
| 17 core rules + database analysis | ✅ Complete |
| SARIF output | ✅ Complete |
| Plugin SDK | ✅ Complete |
| 6 language support | ⚠️ Partial (TS/JS full, others tree-sitter) |
| Documentation | ✅ Complete |

### Near-Term (Q3 2026)

| Item | Status | Priority |
|------|--------|----------|
| OSS public launch | ⚠️ Pending | P0 |
| npm publish | ⚠️ Pending - npm registry publication not yet completed | P0 |
| GitHub release v1.5.0 | ⚠️ Pending - latest published release is v1.4.2 | P0 |
| Community outreach | ⚠️ Planned | P1 |
| Enterprise pilot outreach | ⚠️ Planned | P1 |

### Mid-Term (Q4 2026)

| Item | Status | Priority |
|------|--------|----------|
| LLM-assisted rule writing | ⚠️ Planned | P2 |
| Performance optimization | ⚠️ Planned | P2 |
| Enhanced IDE integration | ⚠️ Planned | P2 |
| Enterprise features design | ⚠️ Planned | P1 |

### Long-Term (2027+)

| Item | Status | Classification |
|------|--------|---------------|
| Enterprise dashboard | ⚠️ Hypothesis | Depends on enterprise traction |
| SSO/SAML integration | ⚠️ Hypothesis | Enterprise tier feature |
| Compliance packs (SOC2, PCI-DSS) | ⚠️ Hypothesis | Enterprise tier feature |
| Cloud offering (optional) | ⚠️ Hypothesis | Customer choice, not default |

---

## Call to Action

### For Developers

```bash
npm install -g github:RNA4219/code-to-gate
code-to-gate analyze ./src --out .qh
```

→ See findings, release-readiness, SARIF in 5 minutes.

### For Security Teams

- Built-in rules cover payment logic, auth guards, validation gap candidates
- SARIF output integrates with GitHub Code Scanning
- No code exposure = compliance by design

### For Enterprise Decision-Makers

- See docs/architecture-for-public-readiness.md for technical deep-dive
- See docs/enterprise-packaging.md for OSS/Enterprise boundary
- See docs/business-evidence.md for adoption metrics framework

---

Last Updated: 2026-07-04
