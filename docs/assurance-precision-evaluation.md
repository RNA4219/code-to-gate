# Assurance Precision Evaluation

評価日: 2026-06-09

Diff semantic rulesを11 fixtureで評価した。これは管理されたfixture精度であり、実repo全体のprecisionを保証するものではない。

| Rule | Detect cases | Refutation cases |
|---|---:|---:|
| GUARD_WEAKENED | 1 | 2 |
| VALIDATION_REMOVED | 2 | 1 |
| ERROR_PATH_SUCCESS_FALLBACK | 2 | 1 |
| BUSINESS_RULE_LOCALIZED | 1 | 1 |

- Correct: 11
- False positive: 0
- FP rate: 0%
- Phase 1 target: 15%以下

既知制約: regex/text signalと命名規則に依存する。候補はreview-requiredであり、bugやrelease blockを断定しない。
