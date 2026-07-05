# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.3.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security vulnerability in code-to-gate, please report it responsibly.

### How to Report

1. **GitHub Security Advisory** (preferred):
   - Go to [Security Advisories](https://github.com/quality-harness/code-to-gate/security/advisories)
   - Click "Report a vulnerability"
   - Provide detailed description, steps to reproduce, and impact assessment

2. **Email** (alternative):
   - Send to: security@quality-harness.dev (if available)
   - Include: vulnerability description, proof of concept, suggested fix

### What to Include

- Vulnerability type (e.g., injection, XSS, path traversal)
- Affected component and version
- Steps to reproduce
- Proof of concept (if safe to share)
- Potential impact
- Suggested remediation (if available)

### Response Timeline

| Severity | Initial Response | Fix Target |
|----------|------------------|------------|
| Critical | 3 business days | Best effort within 14 days |
| High | 5 business days | Best effort within 30 days |
| Medium | 10 business days | Next planned maintenance window |
| Low | 15 business days | Backlog triage |

We will:
- Confirm receipt of your report within the initial response window
- Investigate and validate the vulnerability
- Develop and test a fix
- Release the fix and publicly acknowledge your contribution (if desired)

## Security Scope

### In Scope

- code-to-gate CLI tool and its dependencies
- Plugin sandbox escape vulnerabilities
- Path traversal in repository scanning
- Command injection in CLI arguments
- Memory corruption in tree-sitter parsers
- Denial of service via malicious input files

### Out of Scope

- Vulnerabilities in dependencies (report to respective projects)
- Social engineering attacks
- Physical attacks
- Attacks requiring privileged access to target systems
- Vulnerabilities in demo fixtures (intentional for testing)

## Data Handling and Privacy

### Local-First Design

code-to-gate is designed to run **locally-first**. By default:

- **No code is sent to external services**
- **No repository data is transmitted off your machine**
- All analysis happens on your local filesystem

### LLM Integration (Optional)

When users enable LLM features:

- **Local LLM mode**: Uses locally-running models (e.g., Ollama, llama.cpp)
  - No data leaves the local machine
  - User controls the model and infrastructure

- **External LLM mode**: Requires explicit configuration
  - Only enabled when user provides API keys
  - Users can control what data is sent via `--llm-mode` flags
  - `--llm-mode local-only` enforces local-only operation

### Data Retention

- Output artifacts (`findings.json`, `repo-graph.json`, etc.) are stored locally
- No cloud storage or remote logging
- Users control retention via filesystem management

## Safe Harbor

We support safe harbor for security researchers who:

- Act in good faith to identify vulnerabilities
- Avoid privacy violations, data destruction, or service disruption
- Provide reasonable time for remediation before public disclosure
- Do not access or modify data without explicit permission

We will not pursue legal action against researchers who follow these guidelines.

## Security Best Practices for Users

### CLI Usage

- Run with minimal permissions needed
- Avoid scanning repositories with untrusted content in production environments
- Use `--llm-mode local-only` if you have sensitive code and want LLM features
- Review findings before acting on recommendations

### Plugin Development

- Plugins run in sandboxed environments (Docker containers)
- Do not grant plugins access to sensitive files outside target repositories
- Validate plugin manifests before installation

## Security Features

### Built-in Protections

- **Plugin sandboxing**: Docker container isolation for custom rules
- **Input validation**: Schema validation for all CLI inputs
- **Path sanitization**: Prevents directory traversal attacks
- **Rate limiting awareness**: Rules detect missing rate limits in target code

### Security-focused Rules

code-to-gate includes rules that detect security issues in target repositories:

| Rule ID | Detects |
|---------|---------|
| `RAW_SQL` | SQL injection risks |
| `HARDCODED_SECRET` | Hardcoded credentials |
| `MISSING_RATE_LIMIT` | Missing rate limiting |
| `UNSAFE_REDIRECT` | Open redirect vulnerabilities |
| `WEAK_AUTH_GUARD` | Authorization bypass risks |

## Contact

- Security issues: GitHub Security Advisories (preferred)
- General questions: GitHub Issues
- Project maintainer: R_N_A

---

## Dependency Governance

### Vulnerability History

| Date | Package | Severity | GHSA ID | Resolution |
|------|---------|----------|---------|------------|
| 2026-05-31 | fast-uri | High | GHSA-q3j6-qgpj-74h6, GHSA-v39h-62p7-jpjc | Resolved via npm audit fix |
| 2026-05-31 | brace-expansion | Moderate | GHSA-jxxr-4gwj-5jf2 | Resolved via npm audit fix |

### Audit Policy

- Audit frequency: Weekly (CI) + Pre-release
- Blocking threshold: High/Critical = 0 required
- Moderate: Evaluate and fix if exploitable

### License Policy

| License | Status |
|---------|--------|
| MIT | ✅ Allowed |
| Apache-2.0 | ✅ Allowed |
| BSD-3-Clause | ✅ Allowed |
| BSD-2-Clause | ✅ Allowed |
| ISC | ✅ Allowed |
| GPL-* | ❌ Prohibited |
| LGPL-* | ❌ Prohibited |
| AGPL-* | ❌ Prohibited |
| Proprietary | ❌ Prohibited |
| Unknown | ⚠️ Review required |

---

Last updated: 2026-05-31
Version: 1.3.0
