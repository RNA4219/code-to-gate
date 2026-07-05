# Assurance Precision Evaluation

評価日: 2026-06-09

Diff semantic rulesを11 fixtureで評価した。これは管理されたfixture精度であり、実repo全体のprecisionを保証するものではない。

この文書の FP rate は fixture 上の precision 指標であり、外向き資料や release 判断で real repo precision として引用してはならない。実 repo precision を主張する場合は、対象 repo URL、commit hash、policy、artifact、human TP/FP/Uncertain 判定を別証跡として保存する。

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
