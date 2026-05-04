# code-to-gate Further Improvements Specification

**Version**: v2.0
**Created**: 2026-05-04
**Status**: draft

---

## 1. Unused Variables Warning Fix

### 1.1 Purpose

Fix 18+ ESLint warnings for unused variables in test files.

### 1.2 Scope

| File | Warnings | Fix Strategy |
|------|----------|--------------|
| `src/__tests__/acceptance/*.test.ts` | ~12 | Prefix with `_` or remove |
| `src/__tests__/cli-all.test.ts` | 2 | Remove unused imports |
| `src/__tests__/contract/sarif.test.ts` | 4 | Remove unused imports/vars |

### 1.3 Implementation Steps

1. Run `npm run lint` to list all warnings
2. For unused imports: remove them
3. For unused assigned vars: prefix with `_` (e.g., `_result`)
4. For unused caught errors: prefix with `_` (e.g., `catch (_e)`)
5. Re-run lint to verify zero warnings

### 1.4 Acceptance Criteria

- [ ] `npm run lint` returns 0 warnings
- [ ] All tests still pass

---

## 2. Tree-sitter WASM Compatibility Fix

### 2.1 Purpose

Fix tree-sitter WASM initialization failures for Go/Rust/Ruby adapters.

### 2.2 Current Error

```
Go tree-sitter WASM init failed: Incompatible language version 0. Compatibility range 13 through 15.
Rust tree-sitter WASM init failed: Incompatible language version 0. Compatibility range 13 through 15.
Ruby tree-sitter WASM init failed: Incompatible language version 0. Compatibility range 13 through 15.
```

### 2.3 Root Cause

- tree-sitter WASM bundle version mismatch
- Current: language version 0 (too old)
- Required: compatibility range 13-15

### 2.4 Fix Options

| Option | Approach | Risk |
|--------|----------|------|
| A | Upgrade `web-tree-sitter` package | Low |
| B | Update tree-sitter language WASM files | Medium |
| C | Disable tree-sitter for these languages (regex fallback only) | Low |

### 2.5 Recommended: Option A

```bash
npm install web-tree-sitter@latest
# Or rebuild WASM from source
```

### 2.6 Implementation Steps

1. Check current `web-tree-sitter` version in package.json
2. Upgrade to latest compatible version
3. Update optionalDependencies if needed
4. Test with `npm run test:smoke`
5. Verify no WASM init errors

**Note**: As of 2026-05-04, tree-sitter-go/rust/ruby WASM files in npm packages have compatibility version 0, while web-tree-sitter 0.26.x expects version 13-15. This is a known upstream issue. Regex fallback works correctly. Resolution options:
- Wait for upstream package updates
- Build WASM locally with tree-sitter CLI (requires tree-sitter CLI ~0.22.x)
- Accept regex fallback for these languages

### 2.7 Acceptance Criteria

- [ ] No tree-sitter WASM init errors in smoke tests
- [ ] Go/Rust/Ruby adapters work with tree-sitter (not regex fallback)

---

## 3. New Detection Rules

### 3.1 Purpose

Add new detection rules for common security/quality patterns.

### 3.2 New Rules

| Rule ID | Category | Detection |
|---------|----------|-----------|
| `HARDCODED_SECRET` | security | Hardcoded API keys, passwords, tokens in code |
| `MISSING_RATE_LIMIT` | security | API endpoints without rate limiting |
| `UNSAFE_REDIRECT` | security | Open redirect vulnerabilities |

### 3.3 HARDCODED_SECRET Rule

**Pattern**: Detect hardcoded secrets in code

```typescript
// Patterns to detect:
const API_KEY = "sk-abc123";  // ❌
const password = "admin123";   // ❌
const token = "eyJhbG...";     // ❌

// Safe patterns:
const API_KEY = process.env.API_KEY;  // ✓
```

**Detection Logic**:
- Regex patterns for common secret formats
- Entropy check for random-looking strings
- Exclude test files, fixtures, documentation

### 3.4 MISSING_RATE_LIMIT Rule

**Pattern**: Detect API endpoints without rate limiting

```typescript
// ❌ No rate limiting
app.get("/api/data", (req, res) => { ... });

// ✓ Has rate limiting
app.get("/api/data", rateLimit({ windowMs: 60000, max: 100 }), (req, res) => { ... });
```

**Detection Logic**:
- Find route handlers (Express, FastAPI, etc.)
- Check for rate limit middleware/function calls
- Flag endpoints without rate limiting on sensitive routes

### 3.5 Implementation Steps

1. Create `src/rules/hardcoded-secret.ts`
2. Create `src/rules/missing-rate-limit.ts`
3. Create `src/rules/unsafe-redirect.ts`
4. Add to `src/rules/index.ts` registry
5. Add tests in `src/rules/__tests__/`
6. Update README with new rules

### 3.6 Acceptance Criteria

- [ ] New rules detect sample violations in fixtures
- [ ] Rule tests pass
- [ ] Rules registered in CLI

---

## 4. Coverage 80% Achievement

### 4.1 Purpose

Ensure test coverage meets 80% threshold.

### 4.2 Current State

- Coverage report exists but threshold not enforced
- CI coverage job added but needs actual threshold check

### 4.3 Implementation Steps

1. Run `npm run test:coverage` to get current coverage
2. Identify low-coverage modules
3. Add tests for critical uncovered paths
4. Update vitest coverage config if needed
5. Verify coverage >= 80%

### 4.4 Priority Modules for Coverage

| Module | Priority | Notes |
|--------|----------|-------|
| `src/rules/*.ts` | High | Core detection logic |
| `src/adapters/*.ts` | High | Language parsing |
| `src/cli/*.ts` | Medium | Command handlers |
| `src/reporters/*.ts` | Medium | Output generation |

### 4.5 Acceptance Criteria

- [ ] Coverage >= 80% for lines, branches, functions
- [ ] CI coverage job passes with threshold

---

## 5. GitHub PR Annotations

### 5.1 Purpose

Display findings as GitHub PR annotations for better DX.

### 5.2 Current State

- SARIF uploaded to Code Scanning
- PR comment created with summary
- No inline annotations on code lines

### 5.3 Implementation

Use GitHub Checks API to create annotations:

```typescript
// Annotation format
{
  path: "src/api/handler.ts",
  start_line: 42,
  end_line: 42,
  annotation_level: "warning" | "failure" | "notice",
  message: "CLIENT_TRUSTED_PRICE: Price from client used without validation",
  title: "code-to-gate: CLIENT_TRUSTED_PRICE"
}
```

### 5.4 Changes

1. Update `.github/actions/checks/action.yml`
2. Add annotation generation in `src/github/checks.ts`
3. Map findings severity to annotation_level:
   - critical/failure → failure
   - high → warning
   - medium/low → notice

### 5.5 Implementation Steps

1. Read findings.json in checks action
2. Generate annotations array
3. POST to GitHub Checks API
4. Test with PR containing violations

### 5.6 Acceptance Criteria

- [ ] PR with findings shows inline annotations
- [ ] Annotation level matches severity
- [ ] Clicking annotation links to code line

---

## Implementation Order

| Spec | Priority | Estimated Time | Dependencies |
|------|----------|----------------|--------------|
| 1. Unused vars | High | 15 min | None |
| 2. Tree-sitter | Medium | 30 min | None |
| 3. New rules | High | 60 min | None |
| 4. Coverage 80% | High | 45 min | None |
| 5. PR annotations | Medium | 30 min | 1, 3 |

---

## References

- Current lint output: 18 warnings
- Tree-sitter error: compatibility version mismatch
- Existing rules: 9 built-in
- Coverage config: vitest.coverage.config.ts