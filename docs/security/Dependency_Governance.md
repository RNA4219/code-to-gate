# Dependency Governance

Dependency management policy for code-to-gate project.

## Overview

This document defines the governance for external dependencies, including audit requirements, update policies, and risk assessment.

## Audit Requirements

### Regular Audits

- **Frequency**: Weekly automated scans via CI
- **Tool**: `npm audit` integrated in GitHub Actions
- **Severity threshold**: Critical and High vulnerabilities require immediate action

### Audit Process

1. Run `npm audit` before each release
2. Review vulnerability report
3. For Critical/High: patch or document risk acceptance
4. Record decision in `docs/releases/RA-*.md`

## Update Policy

### Dependency Updates

| Type | Frequency | Approval |
|------|-----------|----------|
| Security patches | Immediate | Single maintainer |
| Minor versions | Monthly | PR review |
| Major versions | As needed | RFC + maintainer approval |

### Update Process

1. Check for updates: `npm outdated`
2. Review changelog for breaking changes
3. Update in dedicated PR with test verification
4. Document significant changes in CHANGELOG.md

## Risk Assessment

### New Dependency Addition

Before adding a new dependency:

1. **Necessity check**: Is this dependency truly needed?
2. **Alternatives evaluation**: Are lighter alternatives available?
3. **Security review**: Check npm audit, GitHub issues for vulnerabilities
4. **License compatibility**: Verify license is MIT or compatible
5. **Maintenance status**: Active maintenance, recent commits

### High-Risk Dependencies

Dependencies with known vulnerabilities must:

- Be patched immediately (Critical/High)
- Have risk acceptance documented (if patch unavailable)
- Be monitored for upstream fixes

## Dependency Categories

| Category | Examples | Policy |
|----------|----------|--------|
| Core runtime | ts-morph, acorn, glob | Strict versioning, patch quickly |
| Dev dependencies | vitest, eslint, typescript | Update with test verification |
| Optional | tree-sitter-* | User opt-in, lower priority |

## CI Integration

GitHub Actions workflow includes:

```yaml
- name: Audit dependencies
  run: npm audit --audit-level=high
```

Vulnerabilities found:
- Critical: Block CI
- High: Block CI  
- Moderate: Warn, allow continue
- Low: Warn, allow continue

## Emergency Response

For newly disclosed vulnerabilities:

1. Assess impact on code-to-gate
2. Check if vulnerable code path is used
3. Patch or mitigate within SLA:
   - Critical: 48 hours
   - High: 72 hours
4. Document in Security_Review_Checklist.md

## Records

All dependency decisions recorded in:
- CHANGELOG.md (updates)
- docs/releases/RA-*.md (risk acceptance)
- GitHub Dependabot alerts

---

Last updated: 2026-05-31
Version: 1.3.0