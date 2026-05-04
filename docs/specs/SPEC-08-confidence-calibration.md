# SPEC-08: LLM Confidence Calibration

**Version**: v1.0
**Created**: 2026-05-04
**Status**: draft
**Priority**: P2
**Estimated Time**: 2 days

---

## 1. Purpose

Improve LLM confidence score accuracy through validation set comparison and calibration.

---

## 2. Scope

### Included
- Validation dataset creation
- Confidence score calibration logic
- Historical accuracy tracking
- Confidence threshold tuning

### Excluded
- LLM model training
- New LLM features
- Provider-specific optimization

---

## 3. Current State

**Status**: Static confidence values (e.g., 0.85, 0.80)

**Current Implementation**: Confidence set statically in rule definitions.

**Problem**: Confidence values don't reflect actual accuracy for different codebases.

---

## 4. Proposed Implementation

### Validation Dataset Structure

```typescript
// validation/validation-dataset.json
interface ValidationCase {
  id: string;
  codeSnippet: string;
  expectedFindings: Finding[];
  expectedNoFindings: string[]; // Rule IDs that should NOT trigger
  difficulty: "easy" | "medium" | "hard";
  category: string;
}
```

### Calibration Process

```typescript
// src/llm/confidence-calibrator.ts
interface CalibrationResult {
  ruleId: string;
  originalConfidence: number;
  calibratedConfidence: number;
  accuracyRate: number;
  sampleSize: number;
}

function calibrateConfidence(
  ruleId: string,
  validationCases: ValidationCase[],
  llmOutputs: LlmOutput[]
): CalibrationResult {
  // 1. Calculate actual accuracy
  const correct = llmOutputs.filter(o => matchesExpected(o, validationCases));
  const accuracyRate = correct.length / llmOutputs.length;

  // 2. Adjust confidence
  const originalConfidence = getRuleConfidence(ruleId);
  const calibratedConfidence = adjustConfidence(
    originalConfidence,
    accuracyRate,
    llmOutputs.length
  );

  return {
    ruleId,
    originalConfidence,
    calibratedConfidence,
    accuracyRate,
    sampleSize: llmOutputs.length,
  };
}

function adjustConfidence(
  original: number,
  accuracy: number,
  sampleSize: number
): number {
  // Weight by sample size (more samples = more reliable calibration)
  const weight = Math.min(1, sampleSize / 100);

  // Blend original and observed accuracy
  return original * (1 - weight) + accuracy * weight;
}
```

### Calibration Data Storage

```
calibration/
├── validation-dataset.json   # Ground truth cases
├── calibration-results.json  # Per-rule calibration data
├── accuracy-history.json     # Historical tracking
└── README.md
```

---

## 5. Technical Design

### Files to Create/Modify

| File | Action | Purpose |
|---|---|---|
| `src/llm/confidence-calibrator.ts` | Create | Calibration logic |
| `calibration/validation-dataset.json` | Create | Ground truth |
| `calibration/calibration-results.json` | Create | Calibration data |
| `src/rules/index.ts` | Modify | Use calibrated confidence |
| `src/cli/calibrate.ts` | Create | Calibration CLI command |

---

## 6. Dependencies

| Dependency | Type | Status |
|---|---|:---:|
| Validation dataset | New | Needed |
| Historical outputs | New | Needed |
| Rule interface | Existing | Active |

---

## 7. Acceptance Criteria

| Criterion | Measurable | Verification |
|---|---|---|
| Calibration runs successfully | CLI command completes | Automated |
| Confidence reflects accuracy | Calibrated ≈ observed accuracy | Automated |
| Sample size tracked | Count recorded | Automated |
| Historical data persisted | JSON updated | Automated |

---

## 8. Test Plan

### Calibration Test
```typescript
describe("confidence-calibrator", () => {
  it("should calibrate confidence based on accuracy", () => {
    const result = calibrateConfidence(
      "CLIENT_TRUSTED_PRICE",
      mockValidationCases,
      mockLlmOutputs
    );
    expect(result.calibratedConfidence).toBeCloseTo(result.accuracyRate, 0.1);
  });

  it("should weight by sample size", () => {
    const smallSample = calibrateConfidence(..., 10 samples);
    const largeSample = calibrateConfidence(..., 100 samples);
    // Large sample should have more weight
    expect(Math.abs(largeSample.calibrated - largeSample.accuracy))
      .toBeLessThan(Math.abs(smallSample.calibrated - smallSample.accuracy));
  });
});
```

---

## 9. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|:---:|:---:|---|
| Validation dataset bias | Medium | Medium | Diverse samples |
| Sample size too small | Medium | Low | Minimum threshold |
| Calibration drift | Low | Low | Periodic recalibration |

---

## 10. References

| Reference | Path |
|---|---|
| Rule confidence | `src/rules/*.ts` |
| LLM outputs | `src/llm/types.ts` |
| Finding structure | `src/types/artifacts.ts` |