# code-to-gate CI Improvement Specification

**Version**: v1.0
**Created**: 2026-05-04
**Status**: draft

---

## 1. CI lint/type/coverage Gate Enhancement

### 1.1 Purpose

Add automated lint, TypeScript strict check, and coverage threshold to PR workflow for quality gate strengthening.

### 1.2 Scope

| Item | In | Out |
|------|----|----|
| ESLint check | Yes | - |
| TypeScript strict mode | Yes | - |
| Coverage threshold (80%) | Yes | - |
| pre-commit hooks | No | Spec 2 |
| adapter contracts | No | Spec 3 |

### 1.3 Current State

| Check | Command | CI Status |
|-------|---------|-----------|
| ESLint | `npm run lint` | Not in CI |
| TypeScript | `tsc --noEmit` | Not in CI |
| Coverage | `npm run test:coverage` | Not in PR CI |

### 1.4 Target State

```yaml
# .github/workflows/code-to-gate-pr.yml (additions)
jobs:
  lint-typecheck:
    runs-on: ubuntu-latest
    steps:
      - run: npm run lint
      - run: npx tsc --noEmit

  coverage:
    runs-on: ubuntu-latest
    steps:
      - run: npm run test:coverage -- --coverage-threshold=80
```

### 1.5 Implementation Steps

1. Add `lint-typecheck` job to PR workflow
2. Add `coverage` job with threshold enforcement
3. Update `status-check` job to depend on new jobs
4. Test with intentional lint/type errors to verify blocking

### 1.6 Acceptance Criteria

- [ ] PR with lint error fails CI
- [ ] PR with TypeScript error fails CI
- [ ] PR with coverage < 80% fails CI
- [ ] All jobs complete within 10 minutes total

---

## 2. pre-commit Hooks Integration

### 2.1 Purpose

Add pre-commit hooks for local quality checks before commit/push.

### 2.2 Scope

| Hook | Stage | Tools |
|------|-------|-------|
| ESLint | pre-commit | eslint --fix |
| TypeScript | pre-commit | tsc --noEmit |
| Tests | pre-push | npm run test:smoke |
| File checks | pre-commit | trailing-whitespace, end-of-file-fixer, check-yaml, check-json |

### 2.3 Configuration

```yaml
# .pre-commit-config.yaml
repos:
  - repo: local
    hooks:
      - id: eslint
        name: eslint
        entry: npm run lint
        language: system
        pass_filenames: false

      - id: typescript
        name: typescript
        entry: npx tsc --noEmit
        language: system
        pass_filenames: false

      - id: test-smoke
        name: test-smoke
        entry: npm run test:smoke
        language: system
        stages: [pre-push]
        pass_filenames: false

  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v5.0.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-json
      - id: check-added-large-files
```

### 2.4 Implementation Steps

1. Create `.pre-commit-config.yaml`
2. Add installation instructions to README
3. Test with intentional errors

### 2.5 Acceptance Criteria

- [ ] `pre-commit install` succeeds
- [ ] Lint error blocks commit
- [ ] TypeScript error blocks commit
- [ ] Smoke test blocks push (if failed)

---

## 3. Adapter Contract Strengthening

### 3.1 Purpose

Strengthen downstream adapter schemas with version pinning and breaking change detection.

### 3.2 Scope

| Adapter | Schema File | Downstream |
|---------|-------------|------------|
| gatefield | `schemas/integrations/gatefield-static-result.schema.json` | agent-gatefield |
| state-gate | `schemas/integrations/state-gate-evidence.schema.json` | agent-state-gate |
| manual-bb | `schemas/integrations/manual-bb-seed.schema.json` | manual-bb-test-harness |
| workflow | `schemas/integrations/workflow-evidence.schema.json` | workflow-cookbook |

### 3.3 Changes

1. Add `schemaVersion` field with semver pattern
2. Add `breakingChangeLog` array for tracking incompatibilities
3. Add CI step to validate exported artifacts against schemas
4. Add CI step to compare schema versions with downstream repos (optional: fetch latest schema from downstream)

### 3.4 Schema Version Pattern

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://raw.githubusercontent.com/quality-harness/code-to-gate/main/schemas/integrations/gatefield-static-result.schema.json",
  "title": "GatefieldStaticResult",
  "properties": {
    "schemaVersion": {
      "type": "string",
      "pattern": "^ctg\\.gatefield/v[0-9]+(alpha|beta)?[0-9]*$"
    },
    "breakingChangeLog": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "version": { "type": "string" },
          "change": { "type": "string" },
          "impact": { "enum": ["added", "removed", "changed", "deprecated"] }
        }
      }
    }
  }
}
```

### 3.5 Implementation Steps

1. Update 4 integration schemas with version fields
2. Update export commands to include `schemaVersion`
3. Add schema comparison CI step (warning-only initially)
4. Document versioning policy in docs/integrations.md

### 3.6 Acceptance Criteria

- [ ] All exported artifacts include `schemaVersion`
- [ ] Schema validation passes for all exports
- [ ] Breaking change detection CI step runs (warning mode)

---

## Implementation Order

| Spec | Priority | Estimated Time |
|------|----------|----------------|
| 1. CI lint/type/coverage | High | 30 min |
| 2. pre-commit | Medium | 15 min |
| 3. Adapter contracts | Medium | 45 min |

---

## References

- Current PR workflow: `.github/workflows/code-to-gate-pr.yml`
- Integration docs: `docs/integrations.md`
- Existing schemas: `schemas/integrations/*.schema.json`