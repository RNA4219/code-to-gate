# Release Approval Records Index

This directory contains Release Approval Records (RA) documenting release decisions and approvals.

## Approval Mapping

| Record ID | Release Version | Date | Approval Type | Approver |
|-----------|-----------------|------|---------------|----------|
| RA-20260531-01 | 1.4.0 | 2026-05-31 | technical | R_N_A |

## Record Structure

Each RA record follows this template:

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
- Coverage Report: [Link]

## Approval Checklist
- [ ] All CI checks passed
- [ ] Coverage threshold met (45% lines, 50% functions)
- [ ] Security scan clean
- [ ] Schema validation passed
- [ ] CHANGELOG.md updated
- [ ] Documentation synced

## Acceptance Record Reference
- AC-*.md: [Link]

## Notes
[Any additional context or decisions]
```

## Naming Convention

- Format: `RA-YYYYMMDD-XX.md`
- YYYYMMDD: Approval date
- XX: Sequential number for that date (01, 02, etc.)

---

Last updated: 2026-05-31
