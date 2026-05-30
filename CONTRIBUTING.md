# Contributing to code-to-gate

Thank you for your interest in contributing to code-to-gate! This document outlines the development process, coding standards, and submission guidelines.

## Development Setup

### Prerequisites

- Node.js 20 or later
- npm 10 or later
- Git 2.x
- TypeScript 5.x (installed via npm)

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/quality-harness/code-to-gate.git
cd code-to-gate

# Install dependencies
npm install

# Build the project
npm run build

# Run smoke tests to verify setup
npm run test:smoke
```

### Development Workflow

```bash
# Build after changes
npm run build

# Run linting
npm run lint

# Fix lint issues
npm run lint:fix

# Run type check
npm run typecheck

# Run smoke tests (quick validation)
npm run test:smoke

# Run full tests
npm test
```

## Project Structure

```
code-to-gate/
├── src/
│   ├── cli/           # CLI commands and entry point
│   ├── adapters/      # Language parsers (TS, JS, Python, etc.)
│   ├── rules/         # Detection rules
│   ├── core/          # Utilities and shared functions
│   ├── reporters/     # Output formatters (SARIF, markdown, etc.)
│   ├── config/        # Policy loading and evaluation
│   ├── cache/         # Incremental cache system
│   ├── parallel/      # Worker-based parallel processing
│   ├── plugin/        # Plugin SDK and Docker sandbox
│   ├── llm/           # LLM integration
│   ├── evidence/      # Release evidence generation
│   ├── viewer/        # HTML report viewer
│   └── historical/    # Baseline comparison
├── schemas/           # JSON schemas for artifacts
├── fixtures/          # Test fixtures and demo repositories
├── docs/              # Documentation
└── scripts/           # Build and release scripts
```

## Test Classification

| Test Type | Command | Location | Duration | Purpose |
|-----------|---------|----------|----------|---------|
| Smoke | `npm run test:smoke` | `src/__tests__/smoke/` | ~15s | CLI basic functionality |
| Unit | `npm test` | `src/**/__tests__/` | ~5min | Module-level testing |
| Integration | `npm test` | `tests/integration/` | ~5min | Cross-module testing |
| Coverage | `npm run test:coverage` | All | ~5min | Coverage measurement |
| Performance | `npm run test:performance` | `src/__tests__/performance/` | ~10min | Performance thresholds |
| Real-repo | `npm run test:real-repo` | `src/__tests__/real-repos/` | ~10min | OSS repo acceptance |

### Test Boundaries

- **Smoke**: Quick validation that CLI commands work (scan, analyze, readiness, export, viewer, schema)
- **Unit**: Per-module functionality tests with fixtures
- **Integration**: Cross-module workflows (e.g., scan → analyze → export)
- **Real-repo**: Actual OSS repositories (express, axios, dayjs) for product acceptance
- **Performance**: Execution time thresholds for large repos

## PR Requirements

Before submitting a pull request, ensure:

### Required Checks

1. **Lint passes**: `npm run lint` with 0 errors (warnings acceptable)
2. **TypeCheck passes**: `npm run typecheck` clean
3. **Smoke tests pass**: `npm run test:smoke` 54 tests passing
4. **Build succeeds**: `npm run build` produces valid dist/

### Recommended Checks

5. **Unit tests pass**: `npm test` (or explain skipped tests)
6. **Coverage maintained**: New code should have tests
7. **Docs updated**: If changing CLI behavior, update docs/

### PR Checklist Template

```markdown
## Description
[Describe your changes]

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update
- [ ] Refactoring

## Checklist
- [ ] Lint passes (0 errors)
- [ ] TypeCheck passes
- [ ] Smoke tests pass
- [ ] Build succeeds
- [ ] Tests added/updated for changes
- [ ] Documentation updated (if applicable)
- [ ] CHANGELOG.md updated (if applicable)
```

## Commit Message Format

Use conventional commit format:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Code style (formatting) |
| `refactor` | Code refactoring |
| `perf` | Performance improvement |
| `test` | Adding/updating tests |
| `chore` | Build, CI, or tooling |
| `revert` | Reverting a previous commit |

### Examples

```
feat(rules): add UNSAFE_REDIRECT rule

- Detects open redirect vulnerabilities
- Supports Express, Flask, Rails patterns
- Default severity: high

Closes #123
```

```
fix(adapters): handle empty files in Python parser

Empty Python files were causing parser errors.
Now returns empty findings array gracefully.
```

## Code Style

### TypeScript

- Strict mode enabled (`strict: true` in tsconfig.json)
- ES2022 target, ESM modules
- Avoid `any` types where possible; use `unknown` for truly unknown values
- Prefer interfaces over type aliases for object shapes
- Use `import type` for type-only imports

### ESLint Rules

- `@typescript-eslint/no-explicit-any`: Warn (acceptable in adapters)
- `@typescript-eslint/no-non-null-assertion`: Warn (acceptable in tests)
- `@typescript-eslint/no-unused-vars`: Error (cleanup unused imports)

### File Organization

- One primary export per file
- Test files: `*.test.ts` in `__tests__/` directory
- Avoid circular dependencies

## Schema Compatibility Rules

### ctg/v1 Stability

The current schema version (`ctg/v1`) is a stable contract. Changes must follow:

| Change Type | Allowed | Migration Required |
|-------------|---------|-------------------|
| Add optional field | Yes | No |
| Add enum value | Yes | No |
| Remove required field | No | Yes - new version |
| Change field type | No | Yes - new version |
| Remove enum value | No | Yes - new version |

### Schema Versioning Process

1. Breaking changes require schema version bump (e.g., `ctg/v2`)
2. Migration guide must be provided in `docs/schema-migration-*.md`
3. Support both versions during transition period
4. Announce deprecation timeline in CHANGELOG

## Adding New Rules

### Rule Structure

```typescript
import type { RulePlugin, RuleContext, Finding } from "./index.js";
import { createEvidence, generateFindingId } from "./index.js";

export const MY_RULE: RulePlugin = {
  id: "MY_RULE",
  name: "Rule Name",
  description: "What this rule detects",
  category: "security" | "payment" | "auth" | "validation" | "testing" | "maintainability",
  defaultSeverity: "critical" | "high" | "medium" | "low",
  defaultConfidence: 0.80, // 0.0 to 1.0

  evaluate(context: RuleContext): Finding[] {
    // Rule implementation
  },
};
```

### Steps to Add a Rule

1. Create `src/rules/my-rule.ts`
2. Implement `RulePlugin` interface
3. Add to `src/rules/index.ts` registry
4. Create tests in `src/rules/__tests__/my-rule.test.ts`
5. Add fixture cases in `fixtures/` if needed
6. Update documentation

## Release Process

Releases follow the checklist in `scripts/release-checklist.md`:

1. Run validation: `npm run release:validate`
2. Update version in `package.json`
3. Update `CHANGELOG.md`
4. Create release branch
5. Run final validation
6. Create git tag
7. GitHub release with artifacts

### Version Naming

| Type | Format | Example |
|------|--------|---------|
| Alpha | `X.Y.Z-alpha.N` | `1.4.0-alpha.1` |
| Beta | `X.Y.Z-beta.N` | `1.4.0-beta.1` |
| RC | `X.Y.Z-rc.N` | `1.4.0-rc.1` |
| Stable | `X.Y.Z` | `1.4.0` |

## Questions or Issues?

- GitHub Issues: Bug reports, feature requests
- GitHub Discussions: Questions, ideas
- Documentation: `docs/` directory

---

Thank you for contributing to code-to-gate!