# SPEC-03: New Detection Rules

**Version**: v1.0
**Created**: 2026-05-04
**Status**: draft
**Priority**: P1
**Estimated Time**: 60 minutes

---

## 1. Purpose

Add new detection rules for common security/quality patterns to expand code-to-gate's detection coverage.

---

## 2. Scope

### Included
- HARDCODED_SECRET rule (already implemented - verify)
- MISSING_RATE_LIMIT rule (already implemented - verify)
- UNSAFE_REDIRECT rule (new)

### Excluded
- Additional rules in SPEC-09 to SPEC-13
- Rule performance optimization
- Custom rule plugins

---

## 3. Current State

**Status**: HARDCODED_SECRET and MISSING_RATE_LIMIT implemented

**Implemented Rules** (from `src/rules/index.ts`):
```typescript
export { HARDCODED_SECRET_RULE } from "./hardcoded-secret.js";
export { MISSING_RATE_LIMIT_RULE } from "./missing-rate-limit.js";
```

**Missing**: UNSAFE_REDIRECT rule

---

## 4. Proposed Implementation

### UNSAFE_REDIRECT Rule

**Detection Target**: Open redirect vulnerabilities

**Vulnerable Patterns**:
```typescript
// ❌ Unsafe - direct redirect from user input
app.get("/redirect", (req, res) => {
  res.redirect(req.query.url);
});

// ❌ Unsafe - redirect from unvalidated input
function handleRedirect(req, res) {
  const target = req.body.destination;
  res.redirect(target);
}

// ✓ Safe - whitelist validation
const ALLOWED_REDIRECTS = ["/home", "/dashboard", "/login"];
app.get("/redirect", (req, res) => {
  if (ALLOWED_REDIRECTS.includes(req.query.url)) {
    res.redirect(req.query.url);
  } else {
    res.redirect("/error");
  }
});
```

### Implementation File

Create `src/rules/unsafe-redirect.ts`:

```typescript
/**
 * UNSAFE_REDIRECT Rule
 *
 * Detects open redirect vulnerabilities where user-supplied URLs
 * are used directly for redirect without validation.
 */

import type { RulePlugin, RuleContext, Finding, EvidenceRef } from "./index.js";
import { createEvidence, generateFindingId } from "./index.js";

export const UNSAFE_REDIRECT_RULE: RulePlugin = {
  id: "UNSAFE_REDIRECT",
  name: "Unsafe Redirect",
  description:
    "Detects open redirect vulnerabilities where user-supplied URLs are used for redirect without validation.",
  category: "security",
  defaultSeverity: "high",
  defaultConfidence: 0.80,

  evaluate(context: RuleContext): Finding[] {
    const findings: Finding[] = [];

    for (const file of context.graph.files) {
      if (file.role !== "source") continue;
      if (!["ts", "tsx", "js", "jsx"].includes(file.language)) continue;

      const content = context.getFileContent(file.path);
      if (!content) continue;

      const lines = content.split("\n");

      // Patterns: res.redirect(req.query.url), res.redirect(req.body.dest)
      const redirectPatterns = [
        /\.redirect\s*\(\s*(?:req|request|ctx|context)\s*\.\s*(?:query|body|params)/g,
        /\.redirect\s*\(\s*(?:req|request|ctx|context)\s*\.\s*(?:query|body|params)\s*\.\s*\w+/g,
      ];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;

        for (const pattern of redirectPatterns) {
          pattern.lastIndex = 0;
          const match = pattern.exec(line);

          if (match) {
            // Check for validation nearby
            const prevLines = lines.slice(Math.max(0, i - 5), i).join("\n").toLowerCase();
            const hasValidation =
              prevLines.includes("whitelist") ||
              prevLines.includes("allowed") ||
              prevLines.includes("validate") ||
              prevLines.includes("includes") ||
              prevLines.includes("safe");

            if (!hasValidation) {
              const startLine = Math.max(1, lineNum - 2);
              const endLine = Math.min(lines.length, lineNum + 2);
              const excerpt = lines.slice(startLine - 1, endLine).join("\n");

              const evidence: EvidenceRef = createEvidence(
                file.path,
                startLine,
                endLine,
                "text",
                excerpt
              );

              findings.push({
                id: generateFindingId("UNSAFE_REDIRECT", file.path, lineNum),
                ruleId: "UNSAFE_REDIRECT",
                category: "security",
                severity: "high",
                confidence: 0.80,
                title: "Open redirect vulnerability",
                summary:
                  "User-supplied URL used in redirect without validation. Attackers can redirect users to malicious sites.",
                evidence: [evidence],
                tags: ["security", "open-redirect", "owasp-top10"],
                upstream: { tool: "native" },
              });
            }
          }
        }
      }
    }

    return findings;
  },
};
```

---

## 5. Technical Design

### Files to Create/Modify

| File | Action | Purpose |
|---|---|---|
| `src/rules/unsafe-redirect.ts` | Create | Rule implementation |
| `src/rules/index.ts` | Modify | Register new rule |
| `src/rules/__tests__/unsafe-redirect.test.ts` | Create | Rule tests |
| `fixtures/demo-redirect.ts` | Create | Test fixture |

### Registration in index.ts

```typescript
// Add to imports
export { UNSAFE_REDIRECT_RULE } from "./unsafe-redirect.js";

// Add to ALL_RULES array
import { UNSAFE_REDIRECT_RULE } from "./unsafe-redirect.js";

export const ALL_RULES: RulePlugin[] = [
  // ...existing rules
  UNSAFE_REDIRECT_RULE,
];
```

---

## 6. Dependencies

| Dependency | Type | Status |
|---|---|:---:|
| Rule interface | Existing | Active |
| Evidence utilities | Existing | Active |
| Test framework | Existing | Active |

---

## 7. Acceptance Criteria

| Criterion | Measurable | Verification |
|---|---|---|
| UNSAFE_REDIRECT detects violations | Detects in test fixture | Automated |
| Rule registered in ALL_RULES | Listed in index.ts | Automated |
| Tests pass | `npm test unsafe-redirect.test.ts` passes | Automated |
| HARDCODED_SECRET verified | Existing tests pass | Automated |
| MISSING_RATE_LIMIT verified | Existing tests pass | Automated |

---

## 8. Test Plan

### Test Fixture: fixtures/demo-redirect.ts

```typescript
// SMELL: UNSAFE_REDIRECT - Lines 5-7
app.get("/redirect", (req, res) => {
  res.redirect(req.query.url); // VULNERABLE
});
// END SMELL

// Safe pattern - should NOT trigger
const ALLOWED = ["/home", "/login"];
app.get("/safe-redirect", (req, res) => {
  if (ALLOWED.includes(req.query.url)) {
    res.redirect(req.query.url);
  }
});
```

### Test Cases

1. Unsafe redirect from req.query - should detect
2. Unsafe redirect from req.body - should detect
3. Safe redirect with whitelist - should NOT detect
4. Safe redirect with validation - should NOT detect

---

## 9. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|:---:|:---:|---|
| False positives on safe patterns | Medium | Medium | Check for validation context |
| Missing redirect frameworks | Low | Low | Add framework-specific patterns |
| Test fixture complexity | Low | Low | Use simple examples |

---

## 10. References

| Reference | Path |
|---|---|
| Rule interface | `src/rules/index.ts` |
| Existing rule example | `src/rules/client-trusted-price.ts` |
| HARDCODED_SECRET | `src/rules/hardcoded-secret.ts` |
| MISSING_RATE_LIMIT | `src/rules/missing-rate-limit.ts` |
| Further improvements spec | `docs/further-improvements-spec.md` |