# Product Narrative

## The Problem

Software teams face a growing challenge: **how do you ensure code quality and security at scale without slowing down delivery?**

### The Stakes Are High

- **Security breaches** cost companies an average of $4.45M per incident (IBM, 2023)
- **Technical debt** accumulates silently, slowing development velocity
- **Compliance requirements** demand audit trails and evidence
- **Developer burnout** increases when quality gates are manual and inconsistent

### Current Solutions Fall Short

| Solution | Gap |
|----------|-----|
| Manual code review | Slow, inconsistent, doesn't scale |
| Traditional SAST tools | High false positives, complex setup |
| Cloud-based scanners | Code leaves your infrastructure |
| Point solutions | Fragmented toolchain, no unified view |

## Our Solution

**code-to-gate** is a local-first static analysis tool that enforces quality gates and generates compliance evidence—without sending your code to the cloud.

### Core Philosophy

> **Your code stays on your machine.**

We believe security tools should enhance your workflow, not compromise it. code-to-gate runs entirely locally, analyzing your codebase without transmitting it to external services.

### How It Works

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

1. **Scan**: Analyze your codebase for quality, security, and compliance issues
2. **Detect**: Built-in rules catch common vulnerabilities and anti-patterns
3. **Gate**: Block deployments that don't meet your standards
4. **Evidence**: Generate audit-ready artifacts for compliance

### Key Differentiators

| Feature | code-to-gate | Traditional SAST |
|---------|--------------|------------------|
| Data privacy | Local-first, no cloud | Cloud-based |
| Setup time | npm install | Complex configuration |
| False positives | Contextual rules | Often excessive |
| Extensibility | Plugin SDK | Vendor lock-in |
| Evidence | Built-in audit trail | Additional tools needed |

## Use Cases

### 1. Pre-Merge Quality Gate

```
PR Opened ──▶ code-to-gate scan ──▶ Findings? ──▶ Block merge
                                      │
                                      ▼
                               No critical issues ──▶ Allow merge
```

### 2. Security Compliance

Generate SARIF reports for security audits:

```bash
code-to-gate scan ./src --format sarif --output security-report.sarif
```

### 3. Evidence Generation

Create audit evidence for releases:

```bash
code-to-gate readiness ./src --baseline .qh/baseline.json
```

## Market Opportunity

### Total Addressable Market

- **DevOps Tools Market**: $15.8B (2023), growing 20% CAGR
- **Application Security Market**: $7.5B (2023), growing 18% CAGR
- **Compliance Software Market**: $4.2B (2023), growing 15% CAGR

### Target Customer Segments

1. **Enterprise DevOps Teams**: Need quality gates without sacrificing velocity
2. **Security Teams**: Require pre-deployment scanning with evidence
3. **Compliance Officers**: Need audit trails for SOC 2, ISO 27001
4. **SMBs**: Want enterprise-grade security without enterprise cost

### Competitive Landscape

| Competitor | Strengths | Weaknesses |
|------------|-----------|------------|
| SonarQube | Feature-rich, established | Complex setup, cloud-dependent |
| Snyk | Developer-friendly | Requires code upload |
| CodeQL | Deep analysis | GitHub lock-in |
| Semgrep | Fast, customizable | Limited evidence generation |

**code-to-gate differentiates** through local-first privacy, built-in evidence generation, and plugin extensibility.

## Product Roadmap

### Q2 2026 (Current)

- ✅ Core analysis engine
- ✅ 6 language support (TS, JS, Python, Go, Java, C#)
- ✅ SARIF output format
- ✅ Plugin SDK

### Q3 2026

- 🔲 LLM-assisted rule writing
- 🔲 Performance optimization for large repos
- 🔲 Enhanced IDE integration

### Q4 2026

- 🔲 Enterprise features (SSO, audit logging)
- 🔲 Compliance frameworks (SOC 2, PCI-DSS)
- 🔲 Cloud offering (optional, customer choice)

## Technical Architecture

See `docs/architecture-for-dd.md` for detailed technical overview.

### Design Principles

1. **Local-First**: All analysis runs on your machine
2. **Plugin Architecture**: Extensible via sandboxed plugins
3. **Evidence Native**: Every scan produces audit-ready artifacts
4. **Standards-Based**: JSON Schema, SARIF, OpenAPI compatible

## Team

### Current Maintainer

**R_N_A** - Project Lead
- Architecture and core development
- Security and compliance focus
- Open source community management

### Contribution Model

Open source with community contributions:
- GitHub Issues for bug reports and features
- Pull requests welcome
- Code review by maintainer

---

Last Updated: 2026-05-31