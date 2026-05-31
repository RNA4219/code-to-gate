# Adoption Metrics Tracking

This document defines the metrics framework for tracking code-to-gate adoption.

## Metric Categories

### 1. GitHub Metrics

| Metric | API Endpoint | Frequency | Baseline |
|--------|--------------|-----------|----------|
| Stars count | `GET /repos/{owner}/{repo}` | Daily | 0 (pre-launch) |
| Forks count | `GET /repos/{owner}/{repo}` | Daily | 0 (pre-launch) |
| Watchers count | `GET /repos/{owner}/{repo}` | Daily | 0 (pre-launch) |
| Open issues | `GET /repos/{owner}/{repo}/issues` | Daily | 0 |
| Closed issues | `GET /repos/{owner}/{repo}/issues?state=closed` | Weekly | 0 |
| Pull requests | `GET /repos/{owner}/{repo}/pulls` | Daily | 0 |
| Contributors | `GET /repos/{owner}/{repo}/contributors` | Monthly | 1 (maintainer) |
| Release downloads | `GET /repos/{owner}/{repo}/releases` | Weekly | 0 |

**Collection Method**: GitHub REST API v3, authenticated request for higher rate limits.

### 2. npm Metrics

| Metric | API Endpoint | Frequency | Baseline |
|--------|--------------|-----------|----------|
| Weekly downloads | `https://api.npmjs.org/downloads/point/last-week/@quality-harness/code-to-gate` | Weekly | 0 |
| Monthly downloads | `https://api.npmjs.org/downloads/point/last-month/...` | Monthly | 0 |
| Version downloads | `https://api.npmjs.org/downloads/range/...` | Monthly | 0 |
| Dependencies count | `https://api.npmjs.org/package/@quality-harness/code-to-gate` | Monthly | 0 |

**Collection Method**: npm registry API (public, no auth required).

### 3. Usage Metrics (Opt-In)

| Metric | Collection | Opt-In | Baseline |
|--------|-------------|--------|----------|
| CLI invocations | Local telemetry (opt-in) | `--telemetry` flag | 0 |
| Rule hit rates | `.qh/audit.json` aggregation | Default (local only) | 0 |
| File counts analyzed | `.qh/repo-graph.json` | Default | 0 |
| Cache hit rates | `.qh/cache.json` | `--cache` enabled | 0 |

**Privacy Note**: All usage metrics remain local by default. No external transmission without explicit `--telemetry` flag (future feature).

### 4. Plugin Ecosystem Metrics

| Metric | Source | Frequency | Baseline |
|--------|--------|-----------|----------|
| Built-in rules | `src/rules/*.ts` | Static | 17 |
| External plugins | npm search `code-to-gate-plugin-*` | Monthly | 0 |
| Plugin downloads | npm registry | Monthly | 0 |
| Plugin issues | GitHub (linked repos) | Monthly | 0 |

### 5. Community Metrics

| Metric | Source | Frequency | Baseline |
|--------|--------|-----------|----------|
| Twitter/X followers | @handle (future) | Weekly | 0 |
| LinkedIn followers | Company page (future) | Weekly | 0 |
| Discord/Slack members | Community server (future) | Weekly | 0 |
| Blog subscribers | Newsletter (future) | Monthly | 0 |
| Hacker News karma | Submission history | Ad-hoc | 0 |

---

## Target Metrics

### Launch Targets (30 Days)

| Metric | Target | Success Threshold | Priority |
|--------|--------|-------------------|----------|
| GitHub stars | 100 | 50+ minimum | High |
| npm weekly downloads | 100 | 20+ minimum | High |
| External contributors | 1 | Any external PR | Medium |
| External issues | 5 | Quality feedback | Medium |
| Plugin interest | 1 | Inquiry or attempt | Low |

### 90-Day Targets

| Metric | Target | Success Threshold | Priority |
|--------|--------|-------------------|----------|
| GitHub stars | 500 | 200+ minimum | High |
| npm weekly downloads | 500 | 100+ minimum | High |
| External contributors | 5 | Active contributors | Medium |
| Plugin ecosystem | 3 | External plugins published | Medium |
| Enterprise inquiries | 2 | Qualified leads | High |

### 1-Year Targets (Hypothesis)

| Metric | Target | Basis | Status |
|--------|--------|-------|--------|
| GitHub stars | 2,000 | OSS growth curve | Hypothesis |
| npm weekly downloads | 2,000 | Adoption curve | Hypothesis |
| External contributors | 20 | Community maturity | Hypothesis |
| Plugin ecosystem | 10 | Developer adoption | Hypothesis |
| Enterprise customers | 5 | Pipeline conversion | Hypothesis |
| Revenue | TBD | Enterprise pricing TBD | Hypothesis |

---

## Tracking Infrastructure

### Automated Collection (Future)

```bash
# GitHub metrics (daily cron)
gh api repos/quality-harness/code-to-gate --jq '{stars: .stargazers_count, forks: .forks_count}'

# npm downloads (weekly cron)
curl -s https://api.npmjs.org/downloads/point/last-week/@quality-harness/code-to-gate
```

### Dashboard (Future)

- **OSS metrics**: Public dashboard at `code-to-gate.dev/stats`
- **Enterprise metrics**: Private dashboard for sales pipeline

### Evidence Retention

Metrics data retained per GOVERNANCE.md 90-day policy. Aggregated reports retained for public readiness review audit trail.

---

## Metric Interpretation Guidelines

### Star-to-Download Ratio

| Ratio | Interpretation |
|-------|----------------|
| < 0.1 | High awareness, low adoption (marketing success, product gap) |
| 0.1-1.0 | Normal OSS adoption curve |
| > 1.0 | Low awareness, high adoption (utility tool, word-of-mouth) |

### Contributor Health

| Ratio | Health Status |
|-------|---------------|
| > 80% maintainer commits | Solo project (risk) |
| 50-80% maintainer | Growing community (healthy) |
| < 50% maintainer | Mature community (strong) |

### Issue Velocity

| Metric | Target | Risk Threshold |
|--------|--------|----------------|
| Issue closure time | < 7 days | > 14 days |
| PR merge time | < 3 days | > 7 days |
| Open issue ratio | < 20% | > 50% |

---

## Reporting Cadence

| Report | Frequency | Audience | Format |
|--------|-----------|----------|--------|
| Daily metrics snapshot | Daily | Internal | JSON log |
| Weekly summary | Weekly | Maintainers | Markdown |
| Monthly public readiness report | Monthly | External stakeholders | PDF |
| Quarterly roadmap | Quarterly | Public | GitHub discussion |

---

**Last Updated**: 2026-05-30
**Next Review**: 2026-06-30 (post-launch metrics)