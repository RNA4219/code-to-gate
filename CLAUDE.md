# CLAUDE.md - code-to-gate Project Context

## Project Overview

code-to-gate is a local-first quality harness CLI tool that analyzes repositories for quality risks, generates evidence-backed findings, and produces release-readiness gate inputs.

**Type**: TypeScript CLI tool (ESM)
**Node**: 20+
**Framework**: Vitest for testing, ts-morph for AST parsing
**Package**: `@quality-harness/code-to-gate`
**Current package version**: `1.5.0`
**Latest GitHub release**: `v1.4.2` until the v1.5.0 release is published
**npm registry**: not published until npm authentication is completed

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

### Data Flow

```
Repository -> scan -> repo-graph.json -> analyze -> findings.json -> readiness -> release-readiness.json
                                                |
                                                v
                                      export -> SARIF, gatefield, etc.
```

## Schema Versioning

**Current version**: `ctg/v1`

All artifacts use stable schemas in `schemas/`:
- `findings.schema.json` - Quality findings
- `normalized-repo-graph.schema.json` - Repository structure
- `release-readiness.schema.json` - Release gate status
- `database-assets.schema.json` - Optional database analysis output

## Policy System

Policies are YAML files. See `docs/policy-guide.md` for the public guide.

Common fields:

- `blocking.severities` - Block on severity level
- `blocking.categories` - Block on category (payment, auth, etc.)
- `blocking.rules` - Block on specific rule IDs
- `readiness.criticalFindingStatus` - Status for critical findings (blocked_input/needs_review)

### Policy Evaluation

Located in `src/config/policy-loader.ts` and `src/config/policy-evaluator.ts`.

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
| 1 | USAGE_ERROR | Invalid arguments |
| 2 | POLICY_FAILED | Policy violation |
| 3 | SCAN_FAILED | Scan error |
| 4 | ANALYZE_FAILED | Analysis error |
| 5 | FINDINGS_THRESHOLD | Findings exceed threshold |

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
