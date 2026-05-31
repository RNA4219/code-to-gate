# Public Readiness Security Evidence

本ドキュメントは、code-to-gate のセキュリティ統制証跡を記録する。外部公開・継続統制水準の技術統制継続運用に必要なセキュリティポリシー、脅威モデル、手動チェックリストを一元管理。

---

## Security Policy Reference

| Document | Path | Content |
|----------|------|---------|
| SECURITY.md | `/SECURITY.md` | Security policy, vulnerability reporting |
| Dependency Governance | `/docs/security/Dependency_Governance.md` | npm audit, license policy |
| Security Review Checklist | `/docs/security/Security_Review_Checklist.md` | Pre-release security review |

---

## Dependency Governance

### Audit Policy

- **Command**: `npm audit --audit-level=high`
- **Requirement**: high/critical vulnerabilities = 0
- **Moderate**: Evaluate and document, fix if feasible
- **Low**: Track, no immediate action required

### Last Audit Result

| Date | Result | Vulnerabilities | Action |
|------|--------|-----------------|--------|
| 2026-05-31 | ✅ Pass | 0 | No action required |

---

## Plugin Sandbox Threat Model

### Architecture

code-to-gate plugin system runs custom rules in a sandboxed environment (Docker container).

### Allowed I/O

- Read: Source files (read-only mount)
- Read: Configuration files (read-only mount)
- Write: Standard output (logged, not persisted)
- Write: Findings to designated output (controlled)

### Forbidden I/O

- Write: Host filesystem (blocked)
- Network: All outbound connections (blocked)
- Environment: Access to env vars (blocked)
- Process: Fork/exec (blocked)

### Network Policy

- **Default**: Deny all network access
- **Exception**: None (local-first design)

### Escape Handling

If sandbox escape detected:
1. Kill plugin process immediately
2. Log escape event with timestamp and plugin ID
3. Block plugin from future execution
4. Notify security team (manual step)

---

## LLM Local-First Policy

### Modes

| Mode | Description | API Key Required | Network |
|------|-------------|------------------|---------|
| local-only | Local processing only | No | None |
| hybrid | Local + optional LLM | Yes (optional) | OpenAI API only |
| external-only | Full LLM mode | Yes | OpenAI API |

### Default

- **Default mode**: local-only
- **External mode**: Opt-in only, requires OPENAI_API_KEY

### Data Handling

- local-only: No code leaves machine
- hybrid/external: Only analysis requests sent, not raw code

---

## GitHub Security Settings (Manual Checklist)

以下はGitHubリポジトリ設定の手動確認項目。CIで自動確認できないため、定期レビューで実施。

| Setting | Location | Expected | Last Verified |
|---------|----------|----------|---------------|
| Vulnerability alerts | Settings > Security | Enabled | TBD |
| Dependabot security updates | Settings > Security | Enabled | TBD |
| Secret scanning | Settings > Security | Enabled | TBD |
| Push protection | Settings > Security | Enabled | TBD |
| Branch protection (main) | Settings > Branches | Required: lint, typecheck, coverage | TBD |
| CODEOWNERS | `.github/CODEOWNERS` | Defined for sensitive paths | TBD |

---

## Manual Security Checklist

### Quarterly Review

- [ ] GitHub security settings verified (above table)
- [ ] npm audit results reviewed
- [ ] Plugin sandbox logs reviewed
- [ ] LLM external mode usage reviewed (if enabled)
- [ ] Secret scanning alerts reviewed
- [ ] Dependency updates reviewed

### Pre-Release Review

- [ ] All above quarterly items
- [ ] `npm run audit:deps` passed
- [ ] SARIF uploaded to GitHub Code Scanning
- [ ] Release evidence artifacts generated
- [ ] Security Review Checklist completed

---

## Document Version

- Version: 1.0
- Last Updated: 2026-05-31
- Next Review: 2026-06-15