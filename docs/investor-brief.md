# Investor Brief

## Executive Summary

**code-to-gate** is a local-first static analysis platform that helps organizations ship secure, high-quality code faster while maintaining compliance audit trails.

### Investment Thesis

| Claim | Classification | Basis |
|-------|---------------|-------|
| **Regulatory pressure drives demand** | ✅ Verified | SEC cybersecurity rules, EU DORA in effect |
| **Enterprise customers reject cloud-based tools** | ⚠️ Hypothesis | Industry trend, not yet measured in our pipeline |
| **Existing tools don't generate audit artifacts** | ✅ Verified | Competitive analysis of SonarQube, Snyk, Semgrep |
| **Plugin architecture enables ecosystem growth** | ⚠️ Hypothesis | SDK exists, ecosystem not yet measured |

---

## Market Opportunity

### Problem We Solve

**The Compliance Burden**

Modern organizations face three converging pressures:

1. **Security Requirements**: Must detect vulnerabilities before deployment
2. **Quality Standards**: Need consistent code quality across teams
3. **Audit Evidence**: Regulators and auditors demand proof of controls

Current solutions address one or two of these, but not all three in a unified tool.

### Market Size

| Segment | 2023 Size | CAGR | 2028 Projected | Classification |
|---------|-----------|------|----------------|---------------|
| DevOps Tools | $15.8B | 20% | $39.4B | ⚠️ Hypothesis (industry analyst consensus) |
| Application Security | $7.5B | 18% | $17.1B | ⚠️ Hypothesis (industry analyst consensus) |
| Compliance Software | $4.2B | 15% | $8.4B | ⚠️ Hypothesis (industry analyst consensus) |

**Serviceable Market**: Organizations requiring both security scanning AND compliance evidence

| Claim | Classification | Basis |
|-------|---------------|-------|
| $3-5B serviceable market | ⚠️ Hypothesis | Estimated intersection, not validated |

### Target Customers

| Segment | Pain Point | Willingness to Pay | Classification |
|---------|------------|-------------------|---------------|
| Enterprise DevOps | Slow, inconsistent quality gates | High (6-7 figures) | ⚠️ Hypothesis |
| Financial Services | Regulatory compliance evidence | High (audit cost reduction) | ⚠️ Hypothesis |
| Healthcare | HIPAA security requirements | Medium-High | ⚠️ Hypothesis |
| Government Contractors | FedRAMP, CMMC evidence | High | ⚠️ Hypothesis |
| SaaS Companies | Customer security questionnaires | Medium | ⚠️ Hypothesis |

---

## Product Overview

### What We Built

A static analysis tool that:

| Feature | Status | Classification |
|---------|--------|---------------|
| **Scans code locally** | ✅ Implemented | Verified (architecture review) |
| **Detects issues** | ✅ 14 built-in rules | Verified (src/rules/) |
| **Enforces gates** | ✅ Policy engine | Verified (src/config/) |
| **Generates evidence** | ✅ SARIF, JSON, HTML | Verified (src/reporters/) |

### Key Differentiators

| Feature | code-to-gate | Competitors | Classification |
|---------|--------------|-------------|---------------|
| **Local-first** | ✅ Code never leaves machine | ❌ Cloud upload required | Verified (architecture) |
| **Evidence generation** | ✅ Built-in audit artifacts | ❌ Separate tools needed | Verified (src/reporters/) |
| **Plugin system** | ✅ Custom rules via SDK | ⚠️ Limited or vendor lock-in | Verified (src/plugin/) |
| **Setup time** | ✅ npm install | ❌ Complex configuration | Verified (quickstart test) |
| **Data privacy** | ✅ GDPR/CCPA friendly | ⚠️ Requires DPAs | Verified (no external transmission) |

### Technical Maturity

| Metric | Status | Classification |
|--------|--------|---------------|
| Version | 1.3.0 stable | ✅ Verified |
| Test Coverage | 45%+ | ✅ Verified (npm run test:coverage) |
| CI/CD | GitHub Actions, passing | ✅ Verified (.github/workflows/) |
| Languages Supported | 6 (TS, JS, Python, Go, Java, C#) | ⚠️ Partial verified (TS/JS fully, others via tree-sitter) |
| Documentation | Comprehensive | ✅ Verified (docs/ directory) |

---

## Business Model

### Open Core + Enterprise

| Tier | Price | Features | Classification |
|------|-------|----------|---------------|
| **OSS** | Free (MIT) | Core analysis, 14 rules, SARIF output | ✅ Verified |
| **Enterprise** | TBD | SSO, audit logging, support SLA | ⚠️ Hypothesis |
| **Cloud** (optional) | TBD | Managed service, team collaboration | ⚠️ Hypothesis |

### Revenue Drivers

| Revenue Stream | Classification | Basis |
|----------------|---------------|-------|
| Enterprise Licenses | ⚠️ Hypothesis | Industry model, not yet in pipeline |
| Support Contracts | ⚠️ Hypothesis | Industry model, not yet offered |
| Professional Services | ⚠️ Hypothesis | Industry model, no current offering |
| Compliance Packs | ⚠️ Hypothesis | Planned, not yet built |

### Unit Economics (Projected)

| Metric | Projection | Classification | Notes |
|--------|------------|---------------|-------|
| ACV (Enterprise) | $50K - $200K | ⚠️ Hypothesis | Based on SonarQube/Snyk pricing, not validated |
| CAC | $15K - $30K | ⚠️ Hypothesis | Estimated, not measured |
| LTV | $150K - $600K | ⚠️ Hypothesis | 3-year assumption, not validated |
| LTV:CAC | 10:1 | ⚠️ Hypothesis | Target, not proven |

---

## Traction & Milestones

### Current State (May 2026)

| Milestone | Status | Classification |
|-----------|--------|---------------|
| Version 1.3.0 stable release | ✅ | Verified (package.json, git tags) |
| Core analysis engine complete | ✅ | Verified (src/core/) |
| Plugin SDK available | ✅ | Verified (src/plugin/) |
| 6 language support | ⚠️ Partial | TS/JS verified, others via tree-sitter |
| SARIF output for GitHub integration | ✅ | Verified (src/reporters/sarif.ts) |
| Documentation and governance in place | ✅ | Verified (docs/, CLAUDE.md, GOVERNANCE.md) |

### Key Metrics

| Metric | Status | Target (Q4 2026) | Classification |
|--------|--------|------------------|---------------|
| GitHub Stars | Pre-launch | 1,000+ | ❌ Unverified (launch pending) |
| npm downloads | Pre-launch | 10K+/month | ❌ Unverified (launch pending) |
| Enterprise customers | Pre-launch | 5 pilot customers | ❌ Unverified (no pipeline) |
| Plugin ecosystem | SDK available | 10 community plugins | ❌ Unverified (no external plugins) |

---

## Competitive Landscape

### Direct Competitors

| Company | Strengths | Weaknesses | Our Advantage | Classification |
|---------|-----------|------------|---------------|---------------|
| **SonarSource** (SonarQube) | Market leader, feature-rich | Complex setup, cloud-dependent | Simplicity, local-first | Verified competitive comparison |
| **Snyk** | Developer-friendly, good integrations | Requires code upload, expensive | Privacy, lower TCO | Verified competitive comparison |
| **Semgrep** | Fast, customizable rules | Limited evidence generation | Built-in compliance artifacts | Verified competitive comparison |
| **GitHub CodeQL** | Deep analysis, free for OSS | GitHub lock-in, complex queries | Platform-agnostic, plugins | Verified competitive comparison |

### Competitive Moats

| Moat | Classification | Basis |
|------|---------------|-------|
| **Evidence Native** | ✅ Verified | Implemented, not replicated by competitors |
| **Local-First Architecture** | ⚠️ Hypothesis | Hard to replicate, but possible |
| **Plugin Ecosystem** | ⚠️ Hypothesis | SDK exists, network effects not yet proven |
| **Compliance Focus** | ✅ Verified | Differentiated positioning |

---

## Use of Funds

### Projected Use (if applicable)

| Category | Allocation | Classification |
|----------|------------|---------------|
| Engineering | 50% | ⚠️ Hypothesis (planned, not funded) |
| Go-to-Market | 25% | ⚠️ Hypothesis (planned, not funded) |
| Operations | 15% | ⚠️ Hypothesis (planned, not funded) |
| R&D | 10% | ⚠️ Hypothesis (planned, not funded) |

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation | Classification |
|------|------------|--------|------------|---------------|
| Slow enterprise adoption | Medium | High | Pilot programs, reference customers | ⚠️ Hypothesis |
| Competition from incumbents | High | Medium | Differentiation on privacy, evidence | ✅ Verified risk (market dynamics) |
| Open source cannibalization | Medium | Medium | Enterprise features beyond OSS | ⚠️ Hypothesis |
| Talent acquisition | Medium | Medium | Remote-first, competitive equity | ⚠️ Hypothesis |

---

## Team

### Leadership

**R_N_A** - Founder/Project Lead
- Technical architecture and vision
- Security and compliance expertise
- Open source community building

| Role | Classification |
|------|---------------|
| Founder | ✅ Verified |
| Technical expertise | ✅ Verified (architecture, commits) |
| Security focus | ✅ Verified (SECURITY.md, rule categories) |

### Hiring Priorities

| Priority | Classification |
|----------|---------------|
| Engineering | ⚠️ Hypothesis (planned, not funded) |
| Developer Relations | ⚠️ Hypothesis (planned, not funded) |
| Enterprise Sales | ⚠️ Hypothesis (planned, not funded) |

---

## Call to Action

code-to-gate addresses a growing market need for privacy-preserving security tools that also satisfy compliance requirements. We're building the platform that lets organizations:

1. **Ship faster** with automated quality gates
2. **Stay secure** with built-in vulnerability detection
3. **Prove compliance** with evidence generation

**Next Steps**: Schedule a technical deep-dive or request a pilot evaluation.

---

## Classification Legend

| Symbol | Meaning |
|--------|---------|
| ✅ Verified | Measured, documented, auditable claim |
| ⚠️ Hypothesis | Reasonable projection based on industry data, not yet measured |
| ❌ Unverified | Needs measurement before investment decision |

---

Contact: [Maintainer: R_N_A]
GitHub: https://github.com/quality-harness/code-to-gate

Last Updated: 2026-05-31