# SPEC-04: Coverage 80% Achievement

**Version**: v1.0
**Created**: 2026-05-04
**Status**: draft
**Priority**: P1
**Estimated Time**: 45 minutes

---

## 1. Purpose

Ensure test coverage meets 80% threshold for lines, branches, and functions to maintain code quality standards.

---

## 2. Scope

### Included
- Coverage measurement and reporting
- Low-coverage module identification
- Critical path test addition
- CI coverage threshold enforcement

### Excluded
- 100% coverage target (not required)
- Performance test coverage
- Integration test coverage expansion

---

## 3. Current State

**Status**: Coverage threshold exists but not fully enforced

**CI Configuration** (`.github/workflows/code-to-gate-pr.yml`):
```yaml
- name: Check coverage threshold (80%)
  run: |
    coverage=$(cat coverage/coverage-summary.json | jq '.total.lines.percentage' | cut -d'.' -f1)
    if [ "$coverage" -lt 80 ]; then
      echo "::error::Coverage $coverage% is below threshold 80%"
      exit 1
    fi
```

**Current Coverage Areas** (estimated):
| Module | Current | Target |
|---|:---:|:---:|
| `src/rules/*.ts` | ~85% | 80% ✓ |
| `src/adapters/*.ts` | ~75% | 80% (needs work) |
| `src/cli/*.ts` | ~70% | 80% (needs work) |
| `src/reporters/*.ts` | ~80% | 80% ✓ |

---

## 4. Proposed Implementation

### Step 1: Measure Current Coverage

```bash
npm run test:coverage
```

Review `coverage/coverage-summary.json` for module breakdown.

### Step 2: Identify Low-Coverage Modules

```bash
# Find files with < 80% coverage
cat coverage/coverage-summary.json | jq '.[] | select(.lines.percentage < 80)'
```

### Step 3: Add Tests for Critical Uncovered Paths

Priority modules:
1. `src/adapters/*.ts` - Language parsing core
2. `src/cli/*.ts` - User interface
3. `src/config/*.ts` - Policy handling

### Step 4: Update Coverage Configuration

Ensure `vitest.coverage.config.ts` has:
```typescript
coverage: {
  reporter: ['text', 'json', 'json-summary', 'html'],
  lines: 80,
  branches: 80,
  functions: 80,
  statements: 80,
}
```

---

## 5. Technical Design

### Files to Modify

| File | Changes |
|---|---|
| `vitest.coverage.config.ts` | Verify threshold settings |
| `src/adapters/__tests__/*.ts` | Add missing test cases |
| `src/cli/__tests__/*.ts` | Add missing test cases |

### Test Addition Pattern

```typescript
// Example: Missing adapter error handling test
describe("adapter error handling", () => {
  it("should handle parse failure gracefully", () => {
    const result = adapter.parse("invalid code");
    expect(result.completeness).toBe("partial");
    expect(result.diagnostic).toBeDefined();
  });
});
```

---

## 6. Dependencies

| Dependency | Type | Status |
|---|---|:---:|
| Vitest coverage | Existing | Active |
| Coverage reporter | Existing | Active |
| CI workflow | Existing | Active |

---

## 7. Acceptance Criteria

| Criterion | Measurable | Verification |
|---|---|---|
| Lines coverage >= 80% | `coverage.total.lines.percentage >= 80` | Automated |
| Branches coverage >= 80% | `coverage.total.branches.percentage >= 80` | Automated |
| Functions coverage >= 80% | `coverage.total.functions.percentage >= 80` | Automated |
| CI coverage job passes | GitHub Actions green | Automated |

---

## 8. Test Plan

### Coverage Measurement
```bash
npm run test:coverage
cat coverage/coverage-summary.json
```

### Threshold Verification
```bash
# Extract coverage percentages
jq '.total.lines.percentage' coverage/coverage-summary.json
jq '.total.branches.percentage' coverage/coverage-summary.json
jq '.total.functions.percentage' coverage/coverage-summary.json
```

### CI Verification
- Push changes to PR
- Verify coverage job passes in GitHub Actions

---

## 9. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|:---:|:---:|---|
| Coverage regression | Medium | Medium | CI enforcement |
| Test quality issues | Low | Medium | Review test assertions |
| Time estimate overrun | Medium | Low | Prioritize critical paths |

---

## 10. References

| Reference | Path |
|---|---|
| Coverage config | `vitest.coverage.config.ts` |
| CI workflow | `.github/workflows/code-to-gate-pr.yml` |
| Coverage output | `coverage/coverage-summary.json` |
| Further improvements spec | `docs/further-improvements-spec.md` |