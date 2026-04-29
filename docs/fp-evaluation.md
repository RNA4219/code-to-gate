# FP Evaluation System for code-to-gate

This document describes the False Positive (FP) and False Negative (FN) evaluation system for code-to-gate, based on the product acceptance requirements defined in `docs/product-acceptance-v1.md`.

## Overview

The FP/FN evaluation system measures the accuracy of code-to-gate's analysis results:

- **False Positive (FP) Rate**: Measures how many reported findings are incorrect
- **False Negative (FN) Rate**: Measures how many actual issues are missed (detection rate)

### Target Rates by Phase

| Phase | FP Rate Target | Detection Rate Target |
|-------|----------------|----------------------|
| Phase 1 (Alpha) | <= 15% | >= 80% |
| Phase 2 (Beta) | <= 10% | >= 90% |
| Phase 3 (v1.0) | <= 5% | >= 95% |

---

## FP Evaluation

### Process

1. **Generate findings** on target repository
2. **Human review** each finding (TP/FP/Uncertain)
3. **Calculate FP rate** = FP_count / (TP + FP + Uncertain)
4. **Generate suppression recommendations** for FP findings

### Classification Definitions

| Classification | Definition |
|---------------|------------|
| **TP (True Positive)** | Finding correctly identifies a real issue |
| **FP (False Positive)** | Finding incorrectly reports an issue that doesn't exist or isn't relevant |
| **Uncertain** | Finding needs further investigation before classification |

### Using fp-review.sh

```bash
# Interactive review
./scripts/fp-review.sh fixtures/demo-shop-ts --interactive --evaluator tech-lead

# Generate template for manual review
./scripts/fp-review.sh fixtures/demo-shop-ts --phase phase1

# Skip analysis (use existing findings)
./scripts/fp-review.sh fixtures/demo-shop-ts --skip-analyze
```

### FP Evaluation Template (YAML)

```yaml
# fp-evaluation.yaml
evaluation_id: fp-eval-phase1-001
repo: express-example
evaluator: tech-lead
date: 2026-05-01

findings:
  - finding_id: F001
    rule_id: CLIENT_TRUSTED_PRICE
    classification: TP
    comment: "Correctly detected client price usage without validation"
  
  - finding_id: F002
    rule_id: WEAK_AUTH_GUARD
    classification: FP
    comment: "Public route, auth not required"
  
  - finding_id: F003
    rule_id: TRY_CATCH_SWALLOW
    classification: TP
    comment: "Error silently swallowed"

summary:
  total: 3
  tp: 2
  fp: 1
  uncertain: 0
  fp_rate: 33.3%  # Phase 1 target: <= 15%
```

### FP Evaluation Result (JSON)

```json
{
  "evaluation_id": "fp-eval-phase1-001",
  "repo": "express-example",
  "evaluator": "tech-lead",
  "date": "2026-05-01",
  "phase": "phase1",
  "findings": [
    {
      "finding_id": "F001",
      "rule_id": "CLIENT_TRUSTED_PRICE",
      "classification": "TP",
      "severity": "critical",
      "category": "payment"
    }
  ],
  "summary": {
    "total": 15,
    "tp": 12,
    "fp": 2,
    "uncertain": 1,
    "fp_rate": 13.3,
    "target": 15,
    "pass": true
  },
  "suppression_recommendations": [
    {
      "rule_id": "WEAK_AUTH_GUARD",
      "path_pattern": "src/routes/public/**",
      "reason": "Public routes don't require authentication",
      "expiry": "2026-08-01",
      "finding_ids": ["F002"]
    }
  ]
}
```

---

## FN Evaluation

### Process

1. **Seed known smells** in synthetic repository
2. **Run analysis** on seeded repo
3. **Check detection** for each seeded smell
4. **Calculate detection rate** = Detected_count / Seeded_count

### Seeded Smells Configuration

```yaml
# seeded-smells.yaml
seeded_smells:
  - seeded_id: S001
    rule_id: CLIENT_TRUSTED_PRICE
    fixture: demo-shop-ts
    path: src/api/order/create.ts
    line: 15
    description: "Client price trusted without validation"
    severity: critical
    category: payment
    expected_detection: true
  
  - seeded_id: S002
    rule_id: WEAK_AUTH_GUARD
    fixture: demo-shop-ts
    path: src/auth/guard.ts
    line: 6
    description: "Authorization guard only checks token presence"
    severity: high
    category: auth
    expected_detection: true
```

### Default Seeded Smells

| seeded_id | rule_id | fixture | Expected |
|-----------|---------|---------|----------|
| S001 | CLIENT_TRUSTED_PRICE | demo-shop-ts | Yes |
| S002 | WEAK_AUTH_GUARD | demo-shop-ts | Yes |
| S003 | MISSING_SERVER_VALIDATION | demo-shop-ts | Yes |
| S004 | UNTESTED_CRITICAL_PATH | demo-shop-ts | Yes |
| S005 | WEAK_AUTH_GUARD | demo-auth-js | Yes |
| S006 | TRY_CATCH_SWALLOW | demo-auth-js | Yes |
| S007 | ENV_DIRECT_ACCESS | demo-auth-js | Yes |
| S008 | RAW_SQL | demo-shop-ts | Yes |
| S009 | UNSAFE_DELETE | demo-shop-ts | Yes |
| S010 | HIGH_FANOUT_CHANGE | demo-shop-ts (diff) | Yes |

### FN Evaluation Result

```json
{
  "evaluation_id": "fn-eval-phase1-001",
  "date": "2026-05-01",
  "phase": "phase1",
  "fixtures": ["demo-shop-ts", "demo-auth-js"],
  "detections": [
    {
      "seeded_id": "S001",
      "rule_id": "CLIENT_TRUSTED_PRICE",
      "detected": true,
      "finding_id": "finding-client-trusted-price",
      "confidence": 0.9
    },
    {
      "seeded_id": "S010",
      "rule_id": "HIGH_FANOUT_CHANGE",
      "detected": false,
      "missed_reason": "Diff mode required for fanout analysis"
    }
  ],
  "summary": {
    "seeded_count": 10,
    "detected_count": 9,
    "missed_count": 1,
    "detection_rate": 90,
    "target": 80,
    "pass": true
  },
  "missed_smells": [
    {
      "seeded_id": "S010",
      "rule_id": "HIGH_FANOUT_CHANGE",
      "reason": "Diff mode required"
    }
  ]
}
```

---

## Combined Evaluation

### Acceptance Evidence

```yaml
# fp-fn-evidence.yaml
evaluation_id: fp-fn-phase1-001
date: 2026-05-01
evaluator: tech-lead

fp_evaluation:
  repo: express-example
  findings_count: 15
  tp_count: 12
  fp_count: 2
  uncertain_count: 1
  fp_rate: 13.3%
  target: <= 15%
  result: pass

fn_evaluation:
  fixtures: demo-shop-ts, demo-auth-js
  seeded_smells_count: 10
  detected_count: 9
  detection_rate: 90%
  target: >= 80%
  result: pass

combined_result: pass
summary: "FP rate 13.3% and detection rate 90% both pass for phase1"
```

---

## Go/No-Go Criteria

### Go Criteria

| Condition | Required |
|-----------|----------|
| FP rate <= target | Yes |
| Detection rate >= target | Yes |
| All acceptance tests pass | Yes |

### Conditional Go (Phase 1 only)

| Condition | Range | Action |
|-----------|-------|--------|
| FP rate | 15-20% | Generate suppression recommendations, improve in Phase 2 |
| Detection rate | 75-80% | Review missed smells, improve in Phase 2 |

### No-Go Criteria

| Condition | Threshold |
|-----------|-----------|
| FP rate | > target + 5% (e.g., > 20% for Phase 1) |
| Detection rate | < target - 10% (e.g., < 70% for Phase 1) |
| Critical functionality broken | Any |
| Security issue unaddressed | Any |

---

## Suppression Recommendations

When FP findings are identified, the system generates suppression recommendations:

```yaml
# suppressions.yaml
suppressions:
  - rule_id: WEAK_AUTH_GUARD
    path: src/routes/public/*.ts
    reason: "Public routes don't require authentication - human verified"
    expiry: 2026-08-01
    verified_by: tech-lead
    evaluation_id: fp-eval-phase1-001
```

### Suppression Integration

Suppression recommendations can be integrated into `.ctg/suppressions.yaml`:

```bash
# After FP evaluation, copy recommendations to suppressions file
cp .qh/fp-review/suppression-recommendations.yaml .ctg/suppressions.yaml
```

---

## API Usage

### FP Evaluation

```typescript
import {
  calculateFPRate,
  createFPEvaluationResult,
  generateFPEvaluationTemplate,
} from "@code-to-gate/evaluation";

// Generate template for human review
const template = generateFPEvaluationTemplate(findingsArtifact, repo, "phase1");

// Calculate FP rate from reviews
const fpRate = calculateFPRate([
  { finding_id: "F001", classification: "TP" },
  { finding_id: "F002", classification: "FP" },
]);

// Create full evaluation result
const result = createFPEvaluationResult(findingsArtifact, input);
```

### FN Evaluation

```typescript
import {
  DEFAULT_SEEDED_SMELLS,
  createFNEvaluationResult,
  checkDetection,
} from "@code-to-gate/evaluation";

// Check single detection
const detection = checkDetection(seededSmell, findings);

// Create full FN evaluation
const result = createFNEvaluationResult(
  DEFAULT_SEEDED_SMELLS,
  findingsArtifacts,
  "phase1"
);
```

### Combined Evaluation

```typescript
import {
  createCombinedEvaluation,
  generateAcceptanceEvidenceYAML,
  evaluateReleaseReadiness,
} from "@code-to-gate/evaluation";

// Combined result
const combined = createCombinedEvaluation(fpResult, fnResult);

// Evidence YAML for acceptance
const evidenceYAML = generateAcceptanceEvidenceYAML(combined);

// Release readiness check
const readiness = evaluateReleaseReadiness(13.3, 90, "phase1");
// { go: true, conditional_go: false, no_go: false, blockers: [], warnings: [] }
```

---

## Scripts and Tools

| Tool | Purpose |
|------|---------|
| `scripts/fp-review.sh` | Human FP review workflow |
| `src/evaluation/fp-evaluator.ts` | FP calculation logic |
| `src/evaluation/fn-evaluator.ts` | FN detection logic |
| `src/evaluation/index.ts` | Combined evaluation |

---

## Testing

Run evaluation tests:

```bash
# Test FP evaluator
npm test -- src/evaluation/__tests__/fp-evaluator.test.ts

# Test FN evaluator
npm test -- src/evaluation/__tests__/fn-evaluator.test.ts
```

---

## References

- `docs/product-acceptance-v1.md` - Product acceptance criteria
- `schemas/findings.schema.json` - Findings artifact schema
- `docs/error-model.md` - Exit code definitions