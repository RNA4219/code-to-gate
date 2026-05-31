# Public Readiness Summary

This document provides a single-page overview for external stakeholders and public reviewers.

## Product Overview

**code-to-gate** is a static analysis tool that scans codebases for quality, security, and compliance issues before deployment. It enforces quality gates and generates evidence artifacts for audit trails.

### Key Value Propositions

1. **Quality Gate Enforcement**: Block deployments that don't meet quality standards
2. **Security Scanning**: Detect vulnerabilities, hardcoded secrets, unsafe patterns
3. **Compliance Evidence**: Generate audit-ready artifacts (SARIF, JSON, HTML reports)
4. **Plugin Extensibility**: Custom rules with Docker sandbox support
5. **Local-First**: No code leaves your machine by default

### Target Markets

- DevOps teams implementing CI/CD quality gates
- Security teams requiring pre-deployment scanning
- Compliance teams needing audit evidence
- Enterprise organizations with security requirements

## Technical Maturity

| Metric | Status | Evidence |
|--------|--------|----------|
| Version | 1.4.0 | Stable release |
| Test Coverage | 80% threshold | CI enforced |
| CI/CD | GitHub Actions | Passing |
| Lint | 0 errors | ESLint strict |
| Type Safety | TypeScript strict | No `any` in core |
| Documentation | Comprehensive | docs/, README |

### Quality Evidence

- **Smoke Tests**: 54 tests, ~15s runtime, CLI validation
- **Unit Tests**: Module-level coverage
- **Integration Tests**: Cross-module workflows
- **Real-Repo Tests**: OSS repository acceptance (express, axios, dayjs)
- **Performance Tests**: Threshold enforcement for large repos

### Security Posture

- **Local-First Design**: No external data transmission by default
- **Plugin Sandboxing**: Docker sandbox supported
- **Input Validation**: Schema validation on all inputs
- **Path Sanitization**: Directory traversal prevention
- **Security Rules**: Built-in detection for common vulnerabilities

| Rule ID | Detects | Severity |
|---------|---------|----------|
| RAW_SQL | SQL injection risks | High |
| HARDCODED_SECRET | Hardcoded credentials | Critical |
| MISSING_RATE_LIMIT | Missing rate limiting | Medium |
| UNSAFE_REDIRECT | Open redirect vulnerabilities | High |
| WEAK_AUTH_GUARD | Authorization bypass risks | High |

## Schema Stability

### ctg/v1 Contract

The output schema (`ctg/v1`) is a stable contract:

- **Backward Compatibility**: Old outputs remain valid
- **Version Governance**: Breaking changes require new major version
- **Migration Support**: Tools and guides for schema upgrades

### Supported Output Formats

- JSON (findings.json, repo-graph.json)
- SARIF (for GitHub Code Scanning)
- HTML (interactive viewer)
- Markdown (human-readable reports)

## Known Limitations

| Limitation | Mitigation | Roadmap |
|------------|------------|---------|
| Large repo performance | Incremental cache | Q3 2026 |
| Language coverage | 6 languages supported | Expanding |
| Custom rule complexity | Plugin SDK | Improved DSL |

## Evidence Artifacts

Each release produces:

1. **npm package**: `@quality-harness/code-to-gate`
   - Status: pending publication to the npm registry.
2. **SARIF reports**: Security analysis results
3. **Coverage reports**: Test coverage metrics
4. **Audit trail**: Release approval records

## Governance Summary

| Aspect | Status |
|--------|--------|
| Release Process | Documented, approval required |
| Security Policy | Published (SECURITY.md) |
| Contribution Guide | Published (CONTRIBUTING.md) |
| Project Governance | Published (GOVERNANCE.md) |
| Dependency Governance | Policy defined |

## Contact

- **GitHub**: https://github.com/RNA4219/code-to-gate
- **Maintainer**: R_N_A
- **Security**: See SECURITY.md for reporting

---

Document Version: 1.0
Last Updated: 2026-05-31
