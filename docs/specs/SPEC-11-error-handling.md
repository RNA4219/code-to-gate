# SPEC-11: INCONSISTENT_ERROR_HANDLING Rule

**Version**: v1.0
**Created**: 2026-05-04
**Status**: draft
**Priority**: P2
**Estimated Time**: 2 hours

---

## 1. Purpose

Detect inconsistent error handling patterns across the codebase to improve reliability and maintainability.

---

## 2. Scope

### Included
- Mixed try/catch and Promise.catch patterns
- Inconsistent error logging
- Some functions throwing, others returning errors
- Missing error handling in async functions

### Excluded
- Error type consistency
- Custom error class detection
- Error message standardization

---

## 3. Current State

**Status**: Not implemented

**Similar Rule**: TRY_CATCH_SWALLOW (catches empty catch blocks)

**Need**: Inconsistent error handling causes:
- Unpredictable failure modes
- Debugging difficulty
- API confusion

---

## 4. Proposed Implementation

### Detection Patterns

```typescript
// Pattern 1: Mixed error handling styles in same file
// ❌ Inconsistent
async function fetchUser(id: string) {
  try {
    const user = await api.get(`/users/${id}`);
    return user;
  } catch (e) {
    return null; // Returns null on error
  }
}

async function fetchProduct(id: string) {
  const product = await api.get(`/products/${id}`);
  return product; // Throws on error (no catch)
}

// Pattern 2: Inconsistent error logging
// ❌ Mixed
try { ... } catch (e) { console.log(e); }  // log
try { ... } catch (e) { logger.error(e); } // logger
try { ... } catch (e) { }                  // silent (different rule)
```

### Rule Implementation

```typescript
export const INCONSISTENT_ERROR_HANDLING_RULE: RulePlugin = {
  id: "INCONSISTENT_ERROR_HANDLING",
  name: "Inconsistent Error Handling",
  description: "Detects inconsistent error handling patterns within files or related functions.",
  category: "reliability",
  defaultSeverity: "medium",
  defaultConfidence: 0.75,

  evaluate(context: RuleContext): Finding[] {
    const findings: Finding[] = [];

    for (const file of context.graph.files) {
      if (file.role !== "source") continue;

      const content = context.getFileContent(file.path);
      if (!content) continue;

      // Analyze error handling patterns in file
      const patterns = analyzeErrorHandlingPatterns(content);

      // Check for inconsistency
      if (patterns.length > 1) {
        const uniqueStyles = new Set(patterns.map(p => p.style));
        if (uniqueStyles.size > 1) {
          findings.push(createInconsistencyFinding(file, patterns));
        }
      }
    }

    return findings;
  },
};

interface ErrorHandlingPattern {
  style: "throw" | "return" | "log" | "silent" | "callback";
  line: number;
  context: string;
}

function analyzeErrorHandlingPatterns(content: string): ErrorHandlingPattern[] {
  const patterns: ErrorHandlingPattern[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect catch patterns
    if (line.includes("catch")) {
      const nextLines = lines.slice(i, i + 3).join("\n");

      if (nextLines.includes("throw")) {
        patterns.push({ style: "throw", line: i + 1, context: nextLines });
      } else if (nextLines.includes("return") && nextLines.includes("null|undefined|error")) {
        patterns.push({ style: "return", line: i + 1, context: nextLines });
      } else if (nextLines.includes("console|logger")) {
        patterns.push({ style: "log", line: i + 1, context: nextLines });
      } else if (nextLines.match(/\}\s*(?:catch|finally)?/)) {
        patterns.push({ style: "silent", line: i + 1, context: nextLines });
      }
    }
  }

  return patterns;
}
```

---

## 5. Technical Design

### Files to Create/Modify

| File | Action | Purpose |
|---|---|---|
| `src/rules/inconsistent-error-handling.ts` | Create | Rule implementation |
| `src/rules/index.ts` | Modify | Register rule |
| `src/rules/__tests__/inconsistent-error-handling.test.ts` | Create | Tests |
| `fixtures/demo-error-handling.ts` | Create | Test fixture |

---

## 6. Dependencies

| Dependency | Type | Status |
|---|---|:---:|
| TRY_CATCH_SWALLOW | Existing | Active |
| Pattern analysis | New | Needed |

---

## 7. Acceptance Criteria

| Criterion | Measurable | Verification |
|---|---|---|
| Detects mixed throw/return styles | Flags file with both patterns | Automated |
| Detects inconsistent logging | Flags mixed console/logger | Automated |
| Severity reflects inconsistency degree | More styles = higher severity | Automated |
| No false positives on intentional mix | Legitimate patterns allowed | Manual |

---

## 8. Test Plan

### Test Fixture: fixtures/demo-error-handling.ts

```typescript
// SMELL: INCONSISTENT_ERROR_HANDLING
async function fetchUser() {
  try { return await api.get("/user"); }
  catch (e) { return null; } // Style: return
}

async function fetchProduct() {
  try { return await api.get("/product"); }
  catch (e) { throw e; } // Style: throw - INCONSISTENT
}
// END SMELL
```

---

## 9. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|:---:|:---:|---|
| False positives on intentional mix | High | Medium | Allow configurable threshold |
| Pattern detection accuracy | Medium | Medium | Multi-line context analysis |
| Performance overhead | Low | Low | Limit pattern search depth |

---

## 10. References

| Reference | Path |
|---|---|
| TRY_CATCH_SWALLOW rule | `src/rules/try-catch-swallow.ts` |
| Rule interface | `src/rules/index.ts` |