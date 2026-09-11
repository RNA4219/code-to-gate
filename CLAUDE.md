# CLAUDE.md - code-to-gate Project Context

## Project Overview

code-to-gate is a local-first quality harness CLI tool that analyzes repositories for quality risks, generates evidence-backed findings, and produces release-readiness gate inputs.

**Type**: TypeScript CLI tool (ESM)
**Node**: 20+
**Framework**: Vitest for testing, ts-morph for AST parsing
**Package**: `@quality-harness/code-to-gate`
**Current package version**: `1.6.0` (GitHub release version)
**GitHub release**: `v1.6.0` ([tag](https://github.com/RNA4219/code-to-gate/releases/tag/v1.6.0)), latest public release on 2026-09-10; tag commit `0260825379a6698c5dab4ec5303dfecc8536a014`
**npm registry**: not published; `npm view` returned E404 and `npm whoami` returned E401 on 2026-09-10. These checks do not establish broader publish permissions.

## Key Commands

```bash
# Build
npm run build        # TypeScript compilation

# Test
npm test             # Full test suite (~3000 tests)
npm run test:smoke   # Quick smoke tests (54 tests)
npm run test:tree-sitter
npm run test:architecture
npm run test:package

# CLI Usage
npm run ctg -- <command>  # Run CLI via npm
node ./dist/cli.js <command>  # Run directly

# Release validation
npm run release:validate
npm run release:public

# Precision review / Birdseye maintenance
node scripts/precision-review.mjs <create|update|summarize> ...
node scripts/birdseye.mjs <generate|check> [--root path]
```

## Architecture

### Core Modules

| Module | Purpose |
|--------|---------|
| `src/cli/` | CLI commands (scan, analyze, readiness, etc.) |
| `src/adapters/` | Language parsers and tree-sitter adapters |
| `src/rules/` | Detection rules, including database migration rules |
| `src/cache/` | Incremental cache system |
| `src/parallel/` | Worker-based parallel processing |
| `src/plugin/` | Plugin SDK with Docker sandbox |
| `src/config/` | Policy loading and evaluation |
| `src/historical/` | Baseline comparison |
| `src/core/database-analyzer.ts` | Optional SQL/database migration analysis |

### Security Boundaries

- `evidence extract` preflights every ZIP entry and rejects paths outside the
  requested output directory with `UNSAFE_ZIP_ENTRY`.
- Docker commands must use shell-free argument arrays.
- `plugin-sandbox run` requires explicit `--sandbox docker|none`; direct host
  execution is never selected implicitly.
- Timed-out plugin process trees must be stopped before a retry starts.

### Data Flow

```
Repository -> scan -> repo-graph.json -> analyze -> findings.json -> readiness -> release-readiness.json
                                                |
                                                v
                                      export -> SARIF, gatefield, etc.
```

## Schema Versioning

Diff completeness follows scan/read completeness, not finding count or the intentional diff scope. Clean documentation/code changes may have zero findings; actual incomplete input must remain partial under strict policy.

**Current version**: `ctg/v1`

All artifacts use stable schemas in `schemas/`:
- `findings.schema.json` - Quality findings
- `normalized-repo-graph.schema.json` - Repository structure
- `release-readiness.schema.json` - Release gate status
- `database-assets.schema.json` - Optional database analysis output

## Policy System

Policies are YAML files. See `docs/policy-guide.md` for the public guide.

Common fields:

- `blocking.severity` - Block on severity level
- `blocking.category` - Block on category (payment, auth, etc.)
- `blocking.rules` - Block on specific rule IDs
- `readiness.criticalFindingStatus` - Status for critical findings (blocked_input/needs_review)

### Policy Evaluation

Located in `src/config/policy-loader.ts` and `src/config/policy-evaluator.ts`.

`analysis-report.md` is the implemented human review profile. It presents
review-required candidates with evidence, confidence, impact hypotheses, and
confirmation commands; structured artifacts remain the machine and QA-chain
contract.

Optional per-rule severity is tracked by [SPEC-26](docs/specs/SPEC-26-custom-severity.md)
and [Task Seed 20260910-05](docs/tasks/20260910-05-severity-tuning.md)
with local cross-surface acceptance recorded in
[`AC-20260910-06-maintenance`](docs/acceptance/AC-20260910-06-maintenance.md).
Precision evidence is recorded in
[`AC-20260910-02-precision-review`](docs/acceptance/AC-20260910-02-precision-review.md);
it does not establish human precision. Birdseye maintenance is tracked in
[`20260910-04-birdseye`](docs/tasks/20260910-04-birdseye.md) and remains subject
to final repository generation and check.

追加5件（CI接続、実行ID、diff policy、精度レビュー画面、severity理由表示）は
[`AC-20260910-14`](docs/acceptance/AC-20260910-14-ci-integration.md)に統合検証結果を記録する。
`diff --policy`の対応項目は[Severity tuning](docs/severity-tuning.md)、
`precision-review --from ... --review ... --out review.html`の操作は
[精度レビュー運用](docs/precision-review.md)を参照する。

## Built-in Rules

Current public docs describe 17 core rules plus optional database analysis rules.
The high-level rule families are:

| Rule | Category | Detection |
|------|----------|-----------|
| CLIENT_TRUSTED_PRICE | payment | Client-side price calculation |
| WEAK_AUTH_GUARD | auth | Weak authorization guards |
| MISSING_SERVER_VALIDATION | validation | Missing request validation |
| UNTESTED_CRITICAL_PATH | testing | Missing tests on entrypoints |
| TRY_CATCH_SWALLOW | maintainability | Empty/silent catch blocks |
| RAW_SQL | security | SQL string construction |
| ENV_DIRECT_ACCESS | security | Direct env var access |
| UNSAFE_DELETE | maintainability | Unsafe delete operations |
| LARGE_MODULE | maintainability | Module size thresholds |
| DB_* | data | Optional database migration findings when `--database-analysis` is enabled |

## Testing Conventions

### Test Structure

- `src/**/__tests__/*.test.ts` - Unit tests
- `tests/integration/*.test.ts` - Integration tests
- `src/__tests__/smoke/*.test.ts` - Smoke tests

### Common Patterns

```typescript
// Use temp directories for output
const tempOutDir = path.join(import.meta.dirname, "../../../.test-temp", testName);
rmSync(tempOutDir, { recursive: true, force: true });
mkdirSync(tempOutDir, { recursive: true });

// Use fixtures for test data
const fixturesDir = path.resolve(import.meta.dirname, "../fixtures/demo-shop-ts");
```

## Exit Codes

Defined in `src/cli/exit-codes.ts`:

| Code | Constant | Meaning |
|------|----------|---------|
| 0 | OK | Success |
| 1 | READINESS_NOT_CLEAR | Findings or policy require review |
| 2 | USAGE_ERROR | Invalid arguments |
| 3 | SCAN_FAILED | Scan error |
| 4 | LLM_FAILED | Required LLM processing failed |
| 5 | POLICY_FAILED | Policy configuration error |
| 7 | SCHEMA_FAILED | Artifact schema validation failed |
| 10 | INTERNAL_ERROR | Unexpected internal error |

## Common Tasks

### Adding a New Rule

1. Create `src/rules/my-rule.ts`
2. Implement `RuleEvaluator` interface
3. Add to `src/rules/index.ts` registry
4. Create tests in `src/rules/__tests__/my-rule.test.ts`
5. Update fixtures if needed

### Database Analysis

Use `--database-analysis` with `scan`, `analyze`, or `diff` to emit
`database-assets.json` and database-related findings. The analyzer is local only
and does not connect to a real database or print credentials.

### Fixing Policy Issues

Policy parsing and evaluation are in:
- `src/config/policy-loader.ts` - YAML parsing, validation
- `src/config/policy-evaluator.ts` - Finding evaluation, status determination

### Performance Optimization

Large repos (5000+ files) use:
- Streaming batch processing
- Worker threads (--parallel option)
- Incremental cache (--cache enabled)
- Lazy symbol extraction

## Generated Artifacts Location

Run IDs are opaque execution identifiers. See [run identity](docs/run-identity.md)
for independent execution IDs, inherited artifact IDs, and agent request reuse.

Do not commit:
- `.qh/` - Default output directory
- `.test-temp/` - Test output
- `dist/` - Compiled code
- `node_modules/` - Dependencies

## Debugging

```bash
# Verbose output
node ./dist/cli.js analyze . --verbose

# Check specific file parsing
node ./dist/cli.js scan . --verbose --out .qh-debug

# Analyze database migrations
node ./dist/cli.js analyze . --database-analysis --emit all --out .qh-db

# View generated artifacts
cat .qh/findings.json | jq '.findings[0]'
```

## Integration Points

### GitHub Actions

```yaml
- run: code-to-gate analyze . --emit all --out .qh
- run: code-to-gate readiness . --policy policy.yaml --from .qh --out .qh
- uses: github/codeql-action/upload-sarif@v4
  with:
    sarif_file: .qh/results.sarif
```

### Local LLM

```bash
code-to-gate llm-health --provider ollama
code-to-gate analyze . --llm-provider ollama --llm-model llama3
```
