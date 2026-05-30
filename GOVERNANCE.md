# Project Governance

This document defines the governance model, decision-making processes, and policies for the code-to-gate project.

## Core Principles

### Human Final Judgment

code-to-gate is designed to **augment human decision-making, not replace it**. All automated findings and recommendations are subject to human review and approval.

- **Automated analysis** provides consistent, scalable detection
- **Human judgment** provides context, nuance, and final decisions
- **Evidence-based** decisions are documented and traceable

### OSS vs. Private Boundary

| Aspect | OSS (Public) | Private (Enterprise) |
|--------|-------------|---------------------|
| Core rules | Included | Included |
| Custom rules | Community contributions | Proprietary extensions |
| Support | Community | SLA-backed |
| LLM features | User-provided keys | Managed service |
| Evidence retention | Local only | Cloud backup option |

## Project Roles

### Maintainer

- **Current**: R_N_A
- **Responsibilities**:
  - Final approval on releases
  - Security vulnerability response
  - Roadmap decisions
  - PR merge authority

### Contributors

- Anyone who submits accepted PRs
- **Rights**:
  - Credit in CHANGELOG
  - Input on roadmap discussions
  - Recognition in release notes

### Security Reviewers

- Designated individuals for security-sensitive changes
- Required approval for:
  - Plugin sandbox modifications
  - Authentication changes
  - Cryptographic implementations

## Decision Making

### Consensus-Based

Most decisions are made through consensus:

1. **Discussion**: Open discussion in GitHub Issues/Discussions
2. **Proposal**: Maintainer or contributor proposes solution
3. **Review**: Community provides feedback
4. **Decision**: Maintainer makes final decision with documented rationale

### Escalation

When consensus cannot be reached:

1. Document all perspectives
2. Maintainer makes final decision
3. Decision rationale documented in PR/Issue

## Release Approval Process

### Pre-Release Checklist

1. All CI checks pass
2. Coverage threshold met (45% lines, 50% functions)
3. Security scan clean
4. Schema validation passed
5. CHANGELOG.md updated
6. Documentation synced

### Approval Record

Each release requires a Release Approval Record (`docs/releases/RA-YYYYMMDD-XX.md`):

```markdown
# Release Approval Record: RA-YYYYMMDD-XX

## Release Information
- Version: X.Y.Z
- Git Tag: vX.Y.Z
- Release Date: YYYY-MM-DD

## Approval Summary
- Approver: [Name]
- Approval Date: YYYY-MM-DD
- Approval Type: technical | security | risk_acceptance

## Evidence Links
- PR URL: [Link]
- QA Results: [Link]
- Security Gate: [Link]

## Approval Checklist
- [x] All CI checks passed
- [x] Coverage threshold met
- [x] Security scan clean
- [x] Schema validation passed
- [x] CHANGELOG.md updated
```

### Approval Types

| Type | Description | Required For |
|------|-------------|--------------|
| technical | Code quality and functionality | All releases |
| security | Security review approval | Security-sensitive changes |
| risk_acceptance | Accepted known limitations | Documented exceptions |

## Evidence Retention Policy

### Release Artifacts

- **Retention period**: 90 days minimum
- **Storage**: GitHub Releases, npm registry
- **Contents**: Source tarball, npm package, SARIF reports

### Quality Evidence

- **Test results**: CI logs (GitHub Actions)
- **Coverage reports**: Uploaded to artifacts
- **Security scans**: Dependency audit results

### Deletion Policy

Evidence may be deleted after 90 days if:
- No active security investigations
- No pending compliance requirements
- Storage constraints require cleanup

## Schema Versioning Governance

### Stability Commitment

The current schema version (`ctg/v1`) is a stable contract:

1. **Backward compatibility**: Old outputs remain valid
2. **Version bumps**: Only for breaking changes
3. **Migration support**: Tools and guides for upgrades

### Breaking Change Process

1. **Announcement**: 30-day notice in CHANGELOG
2. **Migration guide**: Published in `docs/schema-migration-*.md`
3. **Overlap period**: Support both versions for 90 days
4. **Deprecation**: Clear timeline in release notes

## Security Governance

### Vulnerability Response

See `SECURITY.md` for detailed security policy.

### Security Review Requirements

Changes affecting security require:

1. Code review by maintainer
2. Security-focused test cases
3. Documentation of security implications
4. Update to security documentation if applicable

## Community Guidelines

### Code of Conduct

- Be respectful and inclusive
- Focus on technical merit
- Accept constructive criticism
- Prioritize project health over individual preferences

### Contribution Process

See `CONTRIBUTING.md` for detailed contribution guidelines.

## Policy Updates

This governance document may be updated through:

1. Maintainer proposal
2. Community feedback period (7 days)
3. Maintainer approval
4. CHANGELOG entry

---

Last updated: 2026-05-31
Version: 1.3.0