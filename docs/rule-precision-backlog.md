---
intent_id: INT-SELF-ANALYSIS-001
owner: code-to-gate
status: active
last_reviewed_at: 2026-05-17
next_review_due: 2026-06-17
---

# Rule Precision Backlog

この文書は、code-to-gate の rule precision 改善候補を追跡する。
False positive と判断された detection を suppression ではなく、detector 改善として記録する。

## 1. 目的

Suppression は正当な除外を管理するが、rule の detection precision 問題は別途追跡が必要。
この backlog は将来の rule engine improvement の input となる。

## 2. Backlog Items

### 2.1 HARDCODED_SECRET False Positives

| ID | Location | Detection | Root Cause | Improvement Suggestion |
|---|---|---|---|---|
| FP-HS-001 | src/plugin/plugin-schemas.ts | JSON schema property `secrets: {}` | Line contains "secret" keyword (SECRET_VAR_NAMES) | Exclude JSON/YAML schema property definitions |
| FP-HS-002 | src/plugin/plugin-runner.ts | Schema examples | Same as FP-HS-001 | Same as FP-HS-001 |
| FP-HS-003 | src/rules/hardcoded-secret.ts | Self-reference | Rule contains detection patterns | self-reference suppression is correct |

**Current Status**: Suppressed as `self-reference` for rule files, but schema files need precision fix.

**Improvement Priority**: P2 (affects plugin schema development UX)

**Suggested Fix**:
```typescript
// In hardcoded-secret.ts, line 95
// Current: SECRET_VAR_NAMES.some(v => line.toLowerCase().includes(v))
// Proposed: Check if line is a property definition, not a variable assignment
const isPropertyDef = /^\s*["']?\w+["']?\s*:\s*\{/.test(line);
if (isPropertyDef) continue; // Skip JSON schema property definitions
```

### 2.2 DEBT_MARKER False Positives

| ID | Location | Detection | Root Cause | Improvement Suggestion |
|---|---|---|---|---|
| FP-DM-001 | src/cli/schema-validate.ts:1 | Comment `// Ajv ESM/CJS interop workaround` | Comment contains "workaround" keyword | Exclude single-line comments from detection |
| FP-DM-002 | src/evaluation/fp-evaluator.ts | JSDoc `@expiry` field description | Comment contains "expiry" keyword | Same as FP-DM-001 |
| FP-DM-003 | src/plugin/docker-sandbox.ts | Comment about temp Dockerfile | Comment contains "temporary" keyword | Same as FP-DM-001 |

**Current Status**: Suppressed as `accepted-design` for these specific locations.

**Improvement Priority**: P2 (noise in codebase documentation)

**Suggested Fix**:
```typescript
// In debt-marker.ts detection
// Proposed: Skip comments that explain legitimate compatibility solutions
const isCompatibilityComment = /interop|compatibility| workaround/i.test(line) && line.trim().startsWith("//");
if (isCompatibilityComment) continue; // Skip compatibility explanation comments
```

### 2.3 MISSING_INPUT_SANITIZATION False Positives

| ID | Location | Detection | Root Cause | Improvement Suggestion |
|---|---|---|---|---|
| FP-MIS-001 | src/cli/llm-health.ts | Log output for provider status | CLI health check logs to console | CLI logging is intentional, not input sanitization issue |
| FP-MIS-002 | src/rules/*.ts | Self-reference | Rule implementation patterns | self-reference suppression is correct |

**Current Status**: Suppressed as `accepted-design` for CLI health check.

**Improvement Priority**: P3 (low noise, single location)

### 2.4 RAW_SQL False Positives

| ID | Location | Detection | Root Cause | Improvement Suggestion |
|---|---|---|---|---|
| FP-RS-001 | src/plugin/__tests__/plugin-security-contract.test.ts | Rule name "RAW_SQL" in string literal | Line contains "RAW_SQL" string | Exclude rule names in test assertions |
| FP-RS-002 | src/plugin/plugin-context.ts | Schema type reference | Unknown - need investigation | Check if this is still a false positive |

**Current Status**: Suppressed as `self-reference`.

**Improvement Priority**: P3 (test file false positives)

## 3. Suppression vs Precision Backlog

| Category | Handling | Rationale |
|---|---|---|
| self-reference | Suppression | Rule implementation intentionally contains detection patterns |
| fixture-intentional | Suppression | Test fixtures intentionally contain vulnerable patterns |
| generated-artifact | Suppression | Compiled output is not source code |
| accepted-design | Suppression | Architecture decision, intentional pattern |
| false-positive | **Precision Backlog** | Rule should not detect this; needs detector improvement |

Suppression 追加だけで済ませず detector 修正へ回す基準:

- 同じ rule で同種の false positive が 2 件以上出た。
- self-reference や fixture-intentional ではなく、通常の production source で誤検出した。
- accepted-design として説明するには根拠が弱く、rule が文脈を読めば除外できる。
- broad path suppression が必要になるほど検出範囲が広い。
- 日本語コメント、schema property、generated/report artifact など、入力分類の改善で再発を止められる。
- suppressions の reason が「一時対応」「temporary」「TODO」など generic reason になっている。

上記に該当する場合は、suppression record に加えてこの backlog の `Backlog Items` へ FP ID、location、root cause、regression fixture 方針を追加する。

## 4. Fixture Separation Policy

Rule ごとの fixture は、次の 2 種類を分けて管理する。

| Fixture class | Purpose | Required contents | Success criterion |
|---|---|---|---|
| precision fixture | false positive / true positive の境界評価 | 各 rule につき positive、negative、accepted-design を最低 1 件ずつ | fixture 上の TP/FP/Uncertain を人間が記録できる |
| regression fixture | 過去に壊れた検出・誤検出の固定 | issue/backlog ID、期待 finding 数、期待非検出ケース | CI の rule test で期待件数が固定される |

運用ルール:

- precision fixture の結果は `docs/assurance-precision-evaluation.md` または rule-specific evaluation record に記録し、real repo precision と混同しない。
- regression fixture は unit/integration test で自動化し、過去の修正を壊したときに失敗させる。
- 1 つの fixture を両用途に使う場合でも、テスト名と記録上は `precision` / `regression` のどちらの証跡か明示する。
- 新規 rule 追加時は、検出 positive だけでなく「誤検出してはいけない accepted-design」を先に 1 件以上登録する。

## 5. Implementation Tracking

| Item | Status | Target Version | Notes |
|---|---|---|---|
| FP-HS-001 | backlog | v1.4+ | JSON schema property exclusion |
| FP-DM-001 | backlog | v1.4+ | Comment context detection |
| FP-MIS-001 | suppressed | N/A | Single location, acceptable noise |
| FP-RS-001 | suppressed | N/A | Test file, self-reference pattern |

## 6. Next Review

2026-06-17 に backlog を再評価:
- False positive 数の推移確認
- Rule improvement 実装状況確認
- Suppression 削減可能性評価
