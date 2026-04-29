# code-to-gate

code-to-gate is a local-first quality harness that turns repository signals into evidence-backed quality risks, test seeds, and release-readiness gate inputs.

> A local-first code analysis harness that turns repository signals into evidence-backed quality risks, test seeds, and release-readiness gate inputs.

## Installation

### npm (Recommended)

```bash
# Install globally
npm install -g @quality-harness/code-to-gate

# Or install locally in your project
npm install --save-dev @quality-harness/code-to-gate
```

### From Source

```bash
git clone https://github.com/quality-harness/code-to-gate.git
cd code-to-gate
npm install
npm run build
```

### Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | 20+ | Required for npm installation |
| Git | 2.x | Required for `diff` command |

## Quick Start

```bash
# Scan your repository
code-to-gate scan ./my-repo --out .qh

# Run full analysis
code-to-gate analyze ./my-repo --emit all --out .qh

# Check release readiness
code-to-gate readiness ./my-repo --out .qh
```

See the [Quickstart Guide](docs/quickstart.md) for a complete walkthrough.

## Phase 1 Achievements (v0.2.0-alpha.1)

### Core Commands

| Command | Description |
|---------|-------------|
| `scan` | Repository structure analysis generating NormalizedRepoGraph |
| `analyze` | Full quality assessment with findings, risks, invariants, test seeds |
| `diff` | Git reference comparison with blast radius estimation |
| `import` | External tool result importer (Semgrep, ESLint, tsc, coverage) |
| `readiness` | Release readiness evaluation with policy support |
| `export` | Downstream integration payloads (gatefield, state-gate, manual-bb, workflow-evidence) |
| `schema validate` | Artifact and schema validation |
| `fixture` | Fixture management for testing |

### Artifact Generation

All 9 core artifacts with schema validation:

| Artifact | Purpose |
|----------|---------|
| `repo-graph.json` | Repository structure |
| `findings.json` | Quality issues with evidence |
| `risk-register.yaml` | Risk assessment |
| `invariants.yaml` | Business/security invariants |
| `test-seeds.json` | Test design recommendations |
| `release-readiness.json` | Release status |
| `audit.json` | Run metadata |
| `analysis-report.md` | Human-readable summary |
| `results.sarif` | SARIF format for GitHub Code Scanning |

### Built-in Rules

- **CLIENT_TRUSTED_PRICE**: Detects client-supplied pricing in checkout flows
- **WEAK_AUTH_GUARD**: Identifies authorization guard weaknesses
- **MISSING_SERVER_VALIDATION**: Flags unvalidated request body usage
- **UNTESTED_CRITICAL_PATH**: Detects missing test coverage on entrypoints
- **TRY_CATCH_SWALLOW**: Identifies swallowed error handling
- **RAW_SQL**: Detects raw SQL query construction
- **ENV_DIRECT_ACCESS**: Flags direct environment variable access
- **UNSAFE_DELETE**: Identifies unsafe delete operations
- **LARGE_MODULE**: Detects oversized modules

### LLM Provider Support

- OpenAI (`gpt-4`, `gpt-3.5-turbo`)
- Anthropic (`claude-sonnet-4-6`, `claude-haiku-4-5`)
- Alibaba Cloud (`qwen-max`, `qwen-plus`)
- OpenRouter (multi-provider access)
- ollama (local inference)
- llama.cpp (local GGUF models)

### Downstream Integration

Export payloads for ecosystem tools:
- `gatefield-static-result.json`: For agent-gatefield
- `state-gate-evidence.json`: For agent-state-gate
- `manual-bb-seed.json`: For manual-bb-test-harness
- `workflow-evidence.json`: For workflow-cookbook

## Current Status

This repo has two phases: **v0.1 MVP** and **product-level v1.0 design**.

| Phase | Status | Description |
|---|---|---|
| v0.1 requirements | GO | Local Release Readiness MVP accepted |
| v0.1 specification | GO | Executable acceptance / schema / fixtures accepted |
| v0.1 implementation | in progress | TypeScript, CLI split, rules, adapters, tests in progress |
| product-level specs | drafted | v1.0 equivalent requirements / spec / acceptance / roadmap added |
| product-level implementation | not ready | Build / test / real repo application / CI operation not yet stable |

Current state is **product-level alpha implementation in progress**.

## Scope

- repo graph / dependency graph
- TS/JS scan and adapter extraction
- normalized findings
- code-derived risk register
- invariant and test seed artifacts
- release readiness artifact
- static analysis result import
- downstream gate / QA seed export
- local-first audit and reproducibility

`test seed` is not a finished manual test case, but design input for `manual-bb-test-harness` and other downstream systems.

## Non-goals

- AI agent artifact gate engine
- agent approval / freshness / human queue
- manual black-box test final design
- workflow / Task Seed governance
- company-specific business rules in OSS core
- proprietary source code or analysis output in public fixtures
- final production release approval

## Documentation Map

### Start Here

| Document | Purpose |
|---|---|
| [docs/product-gap-analysis.md](docs/product-gap-analysis.md) | Gap between current state and product-level |
| [docs/product-roadmap.md](docs/product-roadmap.md) | Roadmap to alpha / beta / v1.0 |
| [docs/spec-acceptance-review.md](docs/spec-acceptance-review.md) | v0.1 specification review results |
| [docs/acceptance-review-manual-bb.md](docs/acceptance-review-manual-bb.md) | v0.1 requirements review results |
| [docs/quickstart.md](docs/quickstart.md) | 5-minute quickstart guide |

### v0.1 MVP Docs

| Document | Purpose |
|---|---|
| [docs/requirements.md](docs/requirements.md) | v0.1 MVP requirements |
| [docs/artifact-contracts.md](docs/artifact-contracts.md) | Core artifact contracts |
| [docs/error-model.md](docs/error-model.md) | CLI exit code / failure model |
| [docs/llm-trust-model.md](docs/llm-trust-model.md) | LLM usage scope and trust boundary |
| [docs/integrations.md](docs/integrations.md) | Downstream adapter contract |
| [docs/plugin-security-contract.md](docs/plugin-security-contract.md) | Plugin / private rulepack security boundary |
| [docs/acceptance-v0.1.md](docs/acceptance-v0.1.md) | v0.1 executable acceptance |
| [docs/fixture-spec-v0.1.md](docs/fixture-spec-v0.1.md) | Synthetic fixture specification |

### Product-Level v1 Docs

| Document | Purpose |
|---|---|
| [docs/product-requirements-v1.md](docs/product-requirements-v1.md) | Product-level requirements |
| [docs/product-spec-v1.md](docs/product-spec-v1.md) | Product-level specification |
| [docs/product-acceptance-v1.md](docs/product-acceptance-v1.md) | Alpha / beta / v1.0 acceptance |
| [docs/product-gap-analysis.md](docs/product-gap-analysis.md) | Gap from v0.1 to product-level |
| [docs/product-roadmap.md](docs/product-roadmap.md) | Phase plan and exit criteria |

## Repository Layout

| Path | Content |
|------|---------|
| `src/cli/` | CLI command implementations |
| `src/adapters/` | TS/JS parser adapters |
| `src/rules/` | Deterministic rule modules |
| `src/config/` | Config / policy loading and evaluation |
| `src/reporters/` | JSON / YAML / Markdown reporters |
| `src/suppression/` | Suppression loading / matching / validation |
| `src/github/` | GitHub Actions / PR comment / Checks integration scaffold |
| `src/types/` | Shared artifact and graph types |
| `schemas/` | Core JSON Schemas |
| `schemas/integrations/` | Downstream adapter schemas |
| `fixtures/` | Synthetic repos and policy fixtures |
| `tests/` | Integration tests |
| `orchestration/` | Workflow/task planning docs |
| `.github/` | GitHub workflow/action scaffolds |

## Build And Test

```bash
npm install
npm run build
npm test
```

Current implementation is in stabilization. Recent builds/tests have known failures; type errors and test expectations need alignment first.

## CLI Smoke

After build, use `dist/cli.js`:

```bash
node ./dist/cli.js schema validate schemas/normalized-repo-graph.schema.json
node ./dist/cli.js scan fixtures/demo-shop-ts --out .qh
node ./dist/cli.js analyze fixtures/demo-shop-ts --emit all --out .qh --require-llm
node ./dist/cli.js diff fixtures/demo-shop-ts --base main --head HEAD --out .qh
node ./dist/cli.js import semgrep fixtures/demo-ci-imports/semgrep.json --out .qh/imports
node ./dist/cli.js readiness fixtures/demo-shop-ts --policy fixtures/policies/strict.yaml --out .qh
```

`demo-shop-ts` includes critical findings, so `analyze` and `readiness` returning exit code `1` / `blocked_input` is expected.

## Downstream Exports

```bash
node ./dist/cli.js export gatefield --from .qh --out .qh/gatefield-static-result.json
node ./dist/cli.js export state-gate --from .qh --out .qh/state-gate-evidence.json
node ./dist/cli.js export manual-bb --from .qh --out .qh/manual-bb-seed.json
node ./dist/cli.js export workflow-evidence --from .qh --out .qh/workflow-evidence.json
```

## Fixtures

| Fixture | Purpose |
|---------|---------|
| `fixtures/demo-shop-ts` | checkout / payment risk, client trusted price, weak validation |
| `fixtures/demo-auth-js` | missing admin guard, try/catch swallow |
| `fixtures/demo-ci-imports` | ESLint / Semgrep / TypeScript diagnostics / coverage import |
| `fixtures/demo-suppressions-ts` | suppression behavior |
| `fixtures/edge-cases` | parser edge cases |
| `fixtures/policies` | standard / strict policy |

All public fixtures must be synthetic. Do not include private code, private scan results, or company-specific rules.

## Known Gaps

Priority fixes needed:

- `npm run build` TypeScript errors
- `npm test` failing tests
- AST adapter call relation / syntax error handling
- scan symbol `location` and unknown-file handling
- audit policy metadata
- reporter / suppression boundary behavior
- GitHub Checks / PR comment type alignment
- generated directories and fixture dependency cleanup

For major remaining product-level gaps, see [docs/product-gap-analysis.md](docs/product-gap-analysis.md).

## Generated Files

These are generated outputs/dependencies, typically not committed:

- `.qh/`
- `.qh*/`
- `.test-temp/`
- `dist/`
- `coverage/`
- `node_modules/`
- `fixtures/*/node_modules/`

## Origin Policy

This project is an original implementation. It does not include proprietary source code, company-specific rules, or internal analysis results. Example fixtures must be synthetic.

## License

MIT License. See [LICENSE](LICENSE).