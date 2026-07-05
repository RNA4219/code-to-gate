# Public Readiness Summary

This document provides a single-page overview for external stakeholders and public reviewers.

## Product Overview

**code-to-gate** is a local-first quality evidence and release-readiness input tool.
It scans codebases for quality and security-relevant code patterns, then produces
review-required findings and audit-supporting artifacts for CI, QA, and release
reviews. It is not a SAST replacement, vulnerability confirmation engine, or
automatic release approver.

### Key Value Propositions

1. **Quality Gate Input**: Surface evidence for policy-based release review
2. **Security-Relevant Pattern Review**: Flag hardcoded secrets, unsafe patterns, and risky code signals as review candidates
3. **Audit-Supporting Evidence**: Generate SARIF, JSON, and HTML artifacts for traceable review records
4. **Plugin Extensibility**: Custom rules with Docker sandbox support
5. **Local-First**: No code leaves your machine by default

### Target Markets

- DevOps teams implementing CI/CD quality evidence gates
- Security teams reviewing pre-deployment risk candidates
- Compliance teams needing audit-supporting evidence artifacts
- Organizations with local-first or privacy-sensitive review requirements

## Technical Maturity

| Metric | Status | Evidence |
|--------|--------|----------|
| Version | package `1.5.0`; GitHub release `v1.4.2`; npm pending | See `docs/distribution-status.md` |
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
- **Security-Relevant Rules**: Built-in review candidates for risky code patterns

| Rule ID | Detects | Severity |
|---------|---------|----------|
| RAW_SQL | SQL injection risk candidates | High |
| HARDCODED_SECRET | Hardcoded credential candidates | Critical |
| MISSING_RATE_LIMIT | Missing rate limiting candidates | Medium |
| UNSAFE_REDIRECT | Open redirect risk candidates | High |
| WEAK_AUTH_GUARD | Authorization bypass risk candidates | High |

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
| Public distribution | npm publication pending; GitHub release latest is v1.4.2 | v1.5.0 release alignment |
| Real-repo precision evidence | Fixture precision and real-repo precision must remain separate | Expanded public repo validation |
| Large repo performance | Incremental cache | Continued measurement |
| Language coverage | Mixed support levels across languages | Adapter-specific validation |
| Custom rule complexity | Plugin SDK | Improved DSL |

## Support Boundary

Public support currently covers:

- CLI execution from source or GitHub install on supported Node.js versions;
- stable `ctg/v1` core artifacts and documented integration exports;
- schema validation failures, reproducible crashes, and incorrect documentation;
- security-relevant pattern findings as review candidates.

Public support does not currently cover:

- treating findings as confirmed vulnerabilities or compliance attestations;
- guaranteed false-positive-free operation;
- production SLA, 24/7 incident response, or enterprise account support;
- preview / experimental artifacts as stable contracts;
- third-party CI, SAST, or downstream gate behavior outside exported artifacts.

## Evidence Artifacts

Each release produces:

1. **npm package**: `@quality-harness/code-to-gate`
   - Status: pending publication to the npm registry.
2. **SARIF reports**: Review candidate results
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

Document Version: 1.1
Last Updated: 2026-07-04
