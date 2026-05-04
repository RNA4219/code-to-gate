# SPEC-17: Auto-suppression Suggestion

**Version**: v1.0
**Created**: 2026-05-04
**Status**: draft
**Priority**: P2
**Estimated Time**: 3 days

---

## 1. Purpose

Automatically suggest suppressions for likely false positive findings to reduce manual FP management overhead.

---

## 2. Scope

### Included
- FP confidence detection heuristics
- Suppression suggestion generation
- Batch suppression workflow
- Suppression file auto-update

### Excluded
- Automatic suppression (require human approval)
- ML-based FP detection (future)
- Suppression learning from user feedback

---

## 3. Current State

**Status**: Manual suppression only

**Current Process**: User manually edits `.ctg/suppressions.yaml`

**Need**: Large codebases have many potential FPs; manual management is tedious.

---

## 4. Proposed Implementation

### FP Confidence Heuristics

```typescript
// src/suppression/fp-detector.ts
interface FpIndicator {
  type: "high_entropy_pattern" | "test_fixture" | "generated_file" | "config_file" | "known_library";
  confidence: number;
  reason: string;
}

function detectFpIndicators(finding: Finding, context: RuleContext): FpIndicator[] {
  const indicators: FpIndicator[] = [];

  // 1. Test file detection
  if (finding.evidence[0]?.path?.includes("__tests__") ||
      finding.evidence[0]?.path?.includes(".test.") ||
      finding.evidence[0]?.path?.includes("_test.")) {
    indicators.push({
      type: "test_fixture",
      confidence: 0.90,
      reason: "Finding in test file - likely intentional for testing",
    });
  }

  // 2. Generated file detection
  if (finding.evidence[0]?.path?.includes(".generated.") ||
      finding.evidence[0]?.path?.includes("generated/") ||
      finding.evidence[0]?.path?.includes("dist/")) {
    indicators.push({
      type: "generated_file",
      confidence: 0.95,
      reason: "Finding in generated file - not editable",
    });
  }

  // 3. Config file detection
  if (finding.evidence[0]?.path?.endsWith(".config.ts") ||
      finding.evidence[0]?.path?.endsWith(".config.js")) {
    indicators.push({
      type: "config_file",
      confidence: 0.80,
      reason: "Finding in config file - may be intentional configuration",
    });
  }

  // 4. Known library patterns
  if (finding.evidence[0]?.excerptHash?.includes("node_modules")) {
    indicators.push({
      type: "known_library",
      confidence: 0.95,
      reason: "Finding in library code - not project code",
    });
  }

  return indicators;
}
```

### Suppression Suggestion Generator

```typescript
// src/suppression/suggestion-generator.ts
interface SuppressionSuggestion {
  ruleId: string;
  path: string;
  reason: string;
  fpConfidence: number;
  suggestedExpiry?: string;
}

function generateSuppressionSuggestions(
  findings: FindingsArtifact,
  context: RuleContext
): SuppressionSuggestion[] {
  const suggestions: SuppressionSuggestion[] = [];

  for (const finding of findings.findings) {
    const fpIndicators = detectFpIndicators(finding, context);

    // High confidence FP -> suggest suppression
    const highConfidenceFp = fpIndicators.find(i => i.confidence >= 0.85);

    if (highConfidenceFp) {
      suggestions.push({
        ruleId: finding.ruleId,
        path: finding.evidence[0]?.path || "",
        reason: `[AUTO-SUGGEST] ${highConfidenceFp.reason}`,
        fpConfidence: highConfidenceFp.confidence,
        suggestedExpiry: getDefaultExpiry(),
      });
    }
  }

  return suggestions;
}
```

### CLI Command

```bash
# Generate suppression suggestions
code-to-gate suggest-suppressions --from .qh --out .ctg/suggestions.yaml

# Apply suggestions (interactive)
code-to-gate apply-suppressions --from .ctg/suggestions.yaml --approve-all

# Or with manual review
code-to-gate apply-suppressions --from .ctg/suggestions.yaml --interactive
```

---

## 5. Technical Design

### Files to Create/Modify

| File | Action | Purpose |
|---|---|---|
| `src/suppression/fp-detector.ts` | Create | FP heuristics |
| `src/suppression/suggestion-generator.ts` | Create | Suggestion logic |
| `src/cli/suggest-suppressions.ts` | Create | CLI command |
| `src/cli/apply-suppressions.ts` | Create | CLI command |
| `docs/auto-suppression-guide.md` | Create | Documentation |

---

## 6. Dependencies

| Dependency | Type | Status |
|---|---|:---:|
| Suppression file | Existing | Active |
| Findings artifact | Existing | Active |
| File path patterns | Existing | Known |

---

## 7. Acceptance Criteria

| Criterion | Measurable | Verification |
|---|---|---|
| Test files detected as FP | High confidence for test findings | Automated |
| Generated files detected | High confidence for generated | Automated |
| Suggestions generated correctly | YAML output valid | Automated |
| Human approval required | No auto-suppression without approval | Manual |

---

## 8. Test Plan

### Unit Tests
```typescript
describe("fp-detector", () => {
  it("should detect test file as FP", () => {
    const finding = { evidence: [{ path: "src/__tests__/test.test.ts" }] };
    const indicators = detectFpIndicators(finding, context);
    expect(indicators[0].type).toBe("test_fixture");
    expect(indicators[0].confidence).toBeGreaterThanOrEqual(0.90);
  });

  it("should detect generated file as FP", () => {
    const finding = { evidence: [{ path: "dist/generated.js" }] };
    const indicators = detectFpIndicators(finding, context);
    expect(indicators[0].type).toBe("generated_file");
  });
});
```

---

## 9. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|:---:|:---:|---|
| Suppressing real issues | Medium | High | Human approval required |
| Heuristic accuracy | Medium | Medium | Conservative thresholds |
| User trust | Medium | Medium | Clear FP confidence display |

---

## 10. References

| Reference | Path |
|---|---|
| Suppression file | `src/suppression/*.ts` |
| Findings artifact | `src/types/artifacts.ts` |
| Current suppressions | `.ctg/suppressions.yaml` |