# SPEC-01: ESLint Warnings Fix

**Version**: v1.0
**Created**: 2026-05-04
**Status**: draft
**Priority**: P1
**Estimated Time**: 15 minutes

---

## 1. Purpose

Fix all ESLint warnings for unused variables in test files to achieve zero lint warnings and improve code quality.

---

## 2. Scope

### Included
- Unused imports removal
- Unused variable prefixing with `_`
- Unused caught error prefixing
- All test files with ESLint warnings

### Excluded
- Non-test files (already clean)
- TypeScript strict mode issues (separate concern)

---

## 3. Current State

**Status**: 18+ ESLint warnings present

**Warning Distribution**:
| File | Warnings | Type |
|---|---|---|
| `src/__tests__/acceptance/*.test.ts` | ~12 | unused variables |
| `src/__tests__/cli-all.test.ts` | 2 | unused imports |
| `src/__tests__/contract/sarif.test.ts` | 4 | unused imports/vars |

**Current Behavior**: `npm run lint` returns warnings, CI passes but with noise.

---

## 4. Proposed Implementation

### Step 1: Run lint to identify all warnings
```bash
npm run lint 2>&1 | grep "@typescript-eslint/no-unused-"
```

### Step 2: Fix each warning type

**Unused imports**: Remove them
```typescript
// Before
import { unused, used } from "module";

// After
import { used } from "module";
```

**Unused assigned variables**: Prefix with `_`
```typescript
// Before
const result = doSomething();

// After
const _result = doSomething();
```

**Unused caught errors**: Prefix with `_`
```typescript
// Before
catch (e) { ... }

// After
catch (_e) { ... }
```

### Step 3: Verify zero warnings
```bash
npm run lint
# Expected: 0 warnings
```

---

## 5. Technical Design

### Files to Modify
| File | Changes | Lines |
|---|---|:---:|
| `src/__tests__/acceptance/*.test.ts` | Remove unused imports, prefix vars | ~12 |
| `src/__tests__/cli-all.test.ts` | Remove unused imports | ~2 |
| `src/__tests__/contract/sarif.test.ts` | Remove unused imports/vars | ~4 |

### No New Files Required

---

## 6. Dependencies

| Dependency | Type | Status |
|---|---|:---:|
| ESLint config | Existing | Active |
| TypeScript ESLint plugin | Existing | Active |

**No external dependencies required**.

---

## 7. Acceptance Criteria

| Criterion | Measurable | Verification |
|---|---|---|
| Zero ESLint warnings | `npm run lint` returns 0 warnings | Automated |
| All tests pass | `npm test` passes | Automated |
| No functionality change | Test results identical | Automated |

---

## 8. Test Plan

### Pre-Implementation
```bash
npm run lint > before.txt 2>&1
npm test > test-before.txt 2>&1
```

### Post-Implementation
```bash
npm run lint > after.txt 2>&1
npm test > test-after.txt 2>&1
```

### Verification
- Compare before/after lint output (warnings should be 0)
- Compare test results (should be identical)

---

## 9. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|:---:|:---:|---|
| Removing actually-used import | Low | High | Run tests after each fix |
| Breaking test assertions | Low | Medium | Compare test output |
| Missing some warnings | Low | Low | Run lint multiple times |

---

## 10. References

| Reference | Path |
|---|---|
| ESLint config | `.eslintrc.cjs` |
| Test files | `src/__tests__/` |
| Further improvements spec | `docs/further-improvements-spec.md` |