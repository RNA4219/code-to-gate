# Enterprise Packaging

This document defines the boundary between OSS core and Enterprise offerings.

## Product Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ENTERPRISE PACKAGE                           │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │  Enterprise Dashboard (Web UI)                                │ │
│  │  - Executive reporting                                        │ │
│  │  - Team management                                            │ │
│  │  - Audit trail viewer                                         │ │
│  └───────────────────────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │  Enterprise Features                                          │ │
│  │  - SSO/SAML authentication                                    │ │
│  │  - Role-based policies                                        │ │
│  │  - Audit compliance export                                    │ │
│  │  - Custom rule marketplace                                    │ │
│  │  - SLA support                                                │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                              │                                      │
│                              │ REST API / WebSocket                  │
│                              ▼                                      │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                        OSS CORE                                │ │
│  │  (MIT License - Free Forever)                                  │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │ │
│  │  │   CLI       │  │   Rules     │  │   Reporters │           │ │
│  │  │   Engine    │  │   (9 built) │  │   (SARIF)   │           │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘           │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │ │
│  │  │   Plugin    │  │   Policy    │  │   Cache     │           │ │
│  │  │   SDK       │  │   Engine    │  │   System    │           │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘           │ │
│  └───────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

## OSS Core Features (MIT - Free Forever)

| Feature | Included | Details |
|---------|----------|---------|
| CLI analysis | ✅ | `code-to-gate analyze` |
| 17 core rules + optional DB analysis | ✅ | CLIENT_TRUSTED_PRICE, WEAK_AUTH_GUARD, DB rules behind `--database-analysis` |
| SARIF output | ✅ | GitHub Code Scanning compatible |
| JSON findings | ✅ | findings.json, audit.json |
| Policy engine | ✅ | YAML policy files |
| Plugin SDK | ✅ | Docker sandbox supported for custom rules |
| Incremental cache | ✅ | Faster re-analysis |
| LLM integration | ✅ | Local Ollama/LLaMA support |
| Docker deployment | ✅ | `docker run` CLI |
| CI/CD integration | ✅ | GitHub Actions, GitLab CI |
| Schema stability | ✅ | ctg/v1 commitment |

### OSS Commitment

**Promise**: Core analysis engine remains MIT-licensed, free, and local-first forever.

**Why**: Developer trust requires guaranteed data privacy. Commercial features add value without removing OSS utility.

## Enterprise Features (Commercial - TBD)

### Tier 1: Pro Team ($50/dev/month projected)

| Feature | Included | OSS Equivalent |
|---------|----------|---------------|
| Web dashboard | ✅ | CLI only |
| Team management | ✅ | Single policy |
| Priority support | ✅ | GitHub issues |
| Rule marketplace | ✅ | Manual plugin install |
| Policy templates | ✅ | Manual YAML |

### Tier 2: Enterprise ($150k+/year projected)

| Feature | Included | Compliance Need |
|---------|----------|-----------------|
| SSO/SAML | ✅ | CI pipeline auth |
| RBAC policies | ✅ | Multi-team governance |
| Audit export | ✅ | SOC2/ISO27001 |
| Custom SLA | ✅ | Production guarantee |
| On-premise install | ✅ | Data sovereignty |
| Dedicated support | ✅ | 24/7 response |

### Enterprise Gaps Analysis

| Gap | OSS Limitation | Enterprise Solution |
|-----|----------------|---------------------|
| **Executive visibility** | CLI output only | Web dashboard with metrics |
| **Team governance** | Single policy file | Multi-team policy engine |
| **Auth integration** | No auth (local) | SSO/SAML for CI pipelines |
| **Audit compliance** | Basic JSON logs | SOC2-compliant audit trail |
| **Support SLA** | Community | 24/7 dedicated |

## Boundary Principles

### Principle 1: OSS Never Degraded

- New features added to OSS core without removing existing functionality
- Enterprise builds on OSS, never replaces it
- Schema compatibility maintained across tiers

### Principle 2: Enterprise = Convenience + Compliance

- Enterprise features focus on:
  - Team convenience (dashboard, management)
  - Compliance requirements (SSO, audit export)
- Analysis quality identical across tiers

### Principle 3: Plugin Ecosystem Open

| Plugin Type | OSS | Enterprise |
|-------------|-----|------------|
| Custom rules | ✅ Free | ✅ Free |
| Community rules | ✅ Free | ✅ Free |
| Marketplace rules | ⚠️ Manual install | ✅ Integrated |
| Enterprise-only rules | ❌ | ✅ Premium |

### Principle 4: Data Privacy Guaranteed

| Tier | Data Handling |
|------|---------------|
| OSS | Never leaves machine |
| Pro | Optional cloud sync (opt-in) |
| Enterprise | Customer-controlled (on-premise option) |

## Pricing Model (Validated Hypothesis)

### Competitive Pricing Research (2026-05-31)

| Tool | Team Pricing | Enterprise Pricing |
|------|--------------|--------------------|
| SonarQube | $32/month (up to 100k LOC) | Custom annual pricing |
| Semgrep | $30/month/contributor | Custom pricing |
| CodeClimate | ~$100+/month | Custom |

**Validation**: Our Pro tier ($50/dev/month) is competitive with Semgrep ($30/contributor) and SonarQube ($32/month). Enterprise ($150k+/year) aligns with SonarQube Enterprise tier.

### OSS Tier

| Aspect | Value |
|--------|-------|
| Price | Free (MIT) |
| Support | GitHub issues |
| SLA | None |
| Updates | npm registry |

### Pro Tier (Projected)

| Aspect | Value |
|--------|-------|
| Price | $50/dev/month |
| Min team | 5 devs |
| Support | Priority email |
| SLA | 48h response |

### Enterprise Tier (Projected)

| Aspect | Value |
|--------|-------|
| Price | $150k+/year |
| Min org | 100 devs |
| Support | Dedicated team |
| SLA | Custom |

**Note**: Pricing is hypothesis until market validation. Enterprise inquiries will inform actual pricing.

## Enterprise Sales Path

### Lead Qualification Criteria

| Criteria | Threshold | Why |
|----------|-----------|-----|
| Developer count | 50+ | ROI threshold |
| Compliance need | SOC2/ISO27001 | Enterprise feature match |
| Data sovereignty | On-premise required | Enterprise tier fit |
| CI/CD maturity | GitHub Actions/GitLab | Integration ready |

### Sales Process (Future)

1. **Discovery**: OSS adoption → GitHub issue inquiry
2. **Qualification**: Dev count, compliance needs
3. **Demo**: Enterprise dashboard walkthrough
4. **Trial**: 30-day Pro trial
5. **Contract**: Annual Enterprise agreement

### Enterprise Proof Path

For enterprise prospects, provide:

- Architecture document: docs/architecture-for-public-readiness.md
- Security policy: SECURITY.md
- Compliance mapping: docs/public-readiness.md
- Sandbox design: Docker sandbox supported for plugins

## Competitive Positioning

### vs. SonarQube

| Aspect | code-to-gate OSS | SonarQube |
|--------|------------------|-----------|
| Price | Free | $150k+/year |
| Data privacy | Local-first | Cloud default |
| License | MIT | Commercial |
| Enterprise gap | Dashboard, SSO | Full feature set |

**Positioning**: "SonarQube quality at OSS price, with guaranteed local-first"

### vs. Semgrep

| Aspect | code-to-gate | Semgrep |
|--------|--------------|---------|
| Focus | Quality gates | Security rules |
| Local-first | Default | Optional |
| Enterprise | Planned | Available |

**Positioning**: "Quality gate focus (not just security), release-readiness output"

### vs. CodeClimate

| Aspect | code-to-gate | CodeClimate |
|--------|--------------|-------------|
| Price | Free OSS | $100+/mo |
| Local-first | Yes | No (cloud only) |

**Positioning**: "CodeClimate features without cloud dependency"

## Enterprise Roadmap

### Phase 1: Validation (Current)

- [ ] OSS launch
- [ ] Track enterprise inquiries
- [ ] Identify feature requests from prospects

### Phase 2: Pro MVP (Months 3-6)

- [ ] Web dashboard prototype
- [ ] Team management features
- [ ] Priority support workflow

### Phase 3: Enterprise (Months 6-12)

- [ ] SSO/SAML integration
- [ ] Audit compliance export
- [ ] Custom SLA support

### Phase 4: Marketplace (Months 12+)

- [ ] Rule marketplace
- [ ] Community plugin ecosystem
- [ ] Enterprise rule pack

---

## Summary Table

| Feature | OSS (Free) | Pro ($50/dev/mo) | Enterprise ($150k+/yr) |
|---------|------------|------------------|-------------------------|
| CLI analysis | ✅ | ✅ | ✅ |
| 17 core rules + optional DB analysis | ✅ | ✅ | ✅ |
| SARIF output | ✅ | ✅ | ✅ |
| Policy engine | ✅ | ✅ | ✅ |
| Plugin SDK | ✅ | ✅ | ✅ |
| Local-first | ✅ | ✅ (opt-in sync) | ✅ (on-premise) |
| Web dashboard | ❌ | ✅ | ✅ |
| Team management | ❌ | ✅ | ✅ |
| SSO/SAML | ❌ | ❌ | ✅ |
| Audit compliance | ❌ | ❌ | ✅ |
| SLA support | ❌ | Priority | 24/7 |
| Marketplace | ❌ | Manual | Integrated |

---

**Document Status**: Hypothesis validated against competitive pricing - ready for market test
**Last Updated**: 2026-05-31
**Validation Evidence**: Competitive research confirms pricing is within market range
**Next Validation**: Post-launch enterprise inquiry tracking
