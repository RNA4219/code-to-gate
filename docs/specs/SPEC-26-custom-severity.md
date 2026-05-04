# SPEC-26: Custom Severity Tuning

**Version**: v1.0
**Created**: 2026-05-04
**Status**: draft
**Priority**: P3
**Estimated Time**: 2 days

---

## 1. Purpose

Allow users to customize finding severity based on project context and risk tolerance.

---

## 2. Scope

### Included
- Severity override in policy file
- Project-specific severity mapping
- Rule-specific severity tuning
- Context-based severity adjustment

### Excluded
- ML-based severity prediction
- Automatic severity learning
- Severity history tracking

---

## 3. Current State

**Status**: Hardcoded severity in rules

**Current Implementation**: Each rule has `defaultSeverity` hardcoded

**Need**: Different projects have different risk tolerance.

---

## 4. Proposed Implementation

### Policy Severity Override

```yaml
# policy.yaml
apiVersion: ctg/v1
kind: policy
name: custom-severity
severityOverrides:
  # Lower severity for test files
  CLIENT_TRUSTED_PRICE:
    testFiles: medium      # Downgrade in tests
    paymentFiles: critical  # Keep critical in payment code

  # Project-specific overrides
  MISSING_SERVER_VALIDATION:
    default: high          # Override from medium
    internalApi: low       # Internal APIs less critical

  # Context-based overrides
  HARDCODED_SECRET:
    production: critical
    development: medium
    test: low

  # Category overrides
  category:
    maintainability: low   # All maintainability = low
    testing: medium        # All testing = medium
```

### Severity Resolver

```typescript
// src/config/severity-resolver.ts
interface SeverityOverride {
  ruleId: string;
  contexts: Record<string, Severity>;
  default?: Severity;
}

function resolveSeverity(
  finding: Finding,
  overrides: SeverityOverride[],
  context: EvaluationContext
): Severity {
  // 1. Check rule-specific overrides
  const ruleOverride = overrides.find(o => o.ruleId === finding.ruleId);
  if (ruleOverride) {
    // Check context matches
    for (const [ctxPattern, severity] of Object.entries(ruleOverride.contexts)) {
      if (matchesContext(finding, ctxPattern, context)) {
        return severity;
      }
    }
    // Use override default if specified
    if (ruleOverride.default) {
      return ruleOverride.default;
    }
  }

  // 2. Check category overrides
  const categoryOverride = overrides.find(o => o.ruleId === "category");
  if (categoryOverride?.contexts[finding.category]) {
    return categoryOverride.contexts[finding.category];
  }

  // 3. Default to rule's default severity
  return finding.severity;
}

function matchesContext(
  finding: Finding,
  pattern: string,
  context: EvaluationContext
): boolean {
  const path = finding.evidence[0]?.path || "";

  switch (pattern) {
    case "testFiles":
      return path.includes("__tests__") || path.includes(".test.");
    case "paymentFiles":
      return path.includes("payment") || path.includes("checkout");
    case "production":
      return context.env === "production";
    case "development":
      return context.env === "development";
    default:
      return path.includes(pattern);
  }
}
```

### CLI Usage

```bash
# Use custom severity policy
code-to-gate analyze . --policy policy.yaml --out .qh

# View severity overrides
code-to-gate policy show --policy policy.yaml
```

---

## 5. Technical Design

### Files to Create/Modify

| File | Action | Purpose |
|---|---|---|
| `src/config/severity-resolver.ts` | Create | Severity logic |
| `src/config/policy-loader.ts` | Modify | Load overrides |
| `src/config/policy-evaluator.ts` | Modify | Apply overrides |
| `docs/severity-tuning.md` | Create | Documentation |

---

## 6. Dependencies

| Dependency | Type | Status |
|---|---|:---:|
| Policy file | Existing | Active |
| Finding structure | Existing | Active |
| Context evaluation | New | Needed |

---

## 7. Acceptance Criteria

| Criterion | Measurable | Verification |
|---|---|---|
| Severity override applied | Finding severity modified | Automated |
| Context matching works | Test files get lower severity | Automated |
| Policy validation | Invalid override rejected | Automated |
| Default fallback | No override uses rule default | Automated |

---

## 8. Test Plan

### Severity Override Tests
```typescript
describe("severity-resolver", () => {
  it("should override severity for test files", () => {
    const finding = { ruleId: "CLIENT_TRUSTED_PRICE", evidence: [{ path: "__tests__/test.ts" }] };
    const overrides = [{ ruleId: "CLIENT_TRUSTED_PRICE", contexts: { testFiles: "medium" } }];
    const resolved = resolveSeverity(finding, overrides, context);
    expect(resolved).toBe("medium");
  });

  it("should apply category override", () => {
    const finding = { category: "maintainability" };
    const overrides = [{ ruleId: "category", contexts: { maintainability: "low" } }];
    const resolved = resolveSeverity(finding, overrides, context);
    expect(resolved).toBe("low");
  });
});
```

---

## 9. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|:---:|:---:|---|
| Override conflicts | Medium | Medium | Priority order |
| Context detection errors | Low | Low | Clear pattern syntax |
| Policy complexity | Low | Low | Examples in docs |

---

## 10. References

| Reference | Path |
|---|---|
| Policy loader | `src/config/policy-loader.ts` |
| Policy evaluator | `src/config/policy-evaluator.ts` |
| Finding structure | `src/types/artifacts.ts` |