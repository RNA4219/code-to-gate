---
intent_id: INT-SELF-ANALYSIS-001
owner: code-to-gate
status: active
last_reviewed_at: 2026-09-10
next_review_due: 2026-10-10
---

# Rule Precision Backlog

この文書は、code-to-gate の rule precision 改善候補を追跡する。
False positive と判断された detection を suppression ではなく、detector 改善として記録する。

## 1. 目的

Suppression は正当な除外を管理するが、rule の detection precision 問題は別途追跡が必要。
この backlog は将来の rule engine improvement の input となる。

## 2. Backlog Items

### 2.1 HARDCODED_SECRET False Positives (一部解消)

| ID | Location | Detection | Root Cause | Improvement Suggestion |
|---|---|---|---|---|
| FP-HS-001 | src/plugin/plugin-schemas.ts | JSON schema property `secrets: {}` | Line contains "secret" keyword (SECRET_VAR_NAMES) | `isSchemaPropertyDefinition` で除外済み |
| FP-HS-002 | src/plugin/plugin-runner.ts | Schema examples | Same as FP-HS-001 | `isSchemaPropertyDefinition` で除外済み |
| FP-HS-003 | src/rules/hardcoded-secret.ts | Self-reference | Rule contains detection patterns | self-reference suppression を継続 |

**Current Status**: FP-HS-001/002 は HEAD `53897b9` で schema property を detector 側から除外済み。FP-HS-003 は元設計どおり suppression を継続する。

**Improvement Priority**: 一部完了（実装根拠: `src/rules/hardcoded-secret.ts`、公開版への収録時点は未確認）

**Historical Suggestion (implemented for schema properties):**
```typescript
// In hardcoded-secret.ts, line 95
// Current: SECRET_VAR_NAMES.some(v => line.toLowerCase().includes(v))
// Proposed: Check if line is a property definition, not a variable assignment
const isPropertyDef = /^\s*["']?\w+["']?\s*:\s*\{/.test(line);
if (isPropertyDef) continue; // Skip JSON schema property definitions
```

### 2.2 DEBT_MARKER False Positives (一部解消)

| ID | Location | Detection | Root Cause | Improvement Suggestion |
|---|---|---|---|---|
| FP-DM-001 | src/cli/schema-validate.ts:1 | Comment `// Ajv ESM/CJS interop workaround` | Comment contains "workaround" keyword | `isAcceptedCompatibilityNote` で除外済み |
| FP-DM-002 | src/evaluation/fp-evaluator.ts | JSDoc `@expiry` field description | 現行 marker set に `expiry` は含まれない | 現行非再現（過去原因未特定） |
| FP-DM-003 | src/plugin/docker-sandbox.ts | Comment about temp Dockerfile | 現行の `temporary Dockerfile` は marker 条件に合致しない | 現行非再現（過去原因未特定） |

**Current Status**: FP-DM-001 の互換性説明除外は HEAD `53897b9` で実装済み。FP-DM-002/003 は現行 source/dist の直接評価で非再現だったが、過去原因は未特定であり、全体 detector 解消とは扱わない。

**Improvement Priority**: 一部完了（実装根拠: `src/rules/debt-marker.ts`、公開版への収録時点は未確認）

**Historical Suggestion (compatibility notes):**
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

**Current Status**: CLI health check の logging は現行 source/dist の直接評価で非再現だった。過去原因は未特定であり、人間精度判定や全体 detector 解消とは扱わない。

**Improvement Priority**: P3（FP-MIS-001 は現行非再現、過去原因未特定）

### 2.4 RAW_SQL False Positives (一部解消)

| ID | Location | Detection | Root Cause | Improvement Suggestion |
|---|---|---|---|---|
| FP-RS-001 | src/plugin/__tests__/plugin-security-contract.test.ts | Rule name "RAW_SQL" in string literal | SQL keyword/query construction を伴わない | `sqlKeywords` と unsafe pattern の条件に入らず除外済み |
| FP-RS-002 | src/plugin/plugin-context.ts | Schema type reference | SQL query construction を伴わない | 現行非再現（過去原因未特定） |

**Current Status**: FP-RS-001 の rule 名文字列は HEAD `53897b9` の SQL keyword/query 条件に入らない。FP-RS-002 は現行 source/dist の直接評価で非再現だったが、過去原因は未特定であり、全体 detector 解消とは扱わない。

**Improvement Priority**: 一部完了（実装根拠: `src/rules/raw-sql.ts`、公開版への収録時点は未確認）

### 2.5 MISSING_INPUT_SANITIZATION (残件)

FP-MIS-001 は現行非再現（過去原因未特定）として記録する。今回の直接評価だけでは
accepted-design の確定、人間精度判定、detector 改修完了とは判定しない。

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
| FP-HS-001/002 | implemented at HEAD `53897b9` | Unreleased | schema property exclusion。FP-HS-003 は suppression 継続 |
| FP-DM-001 | implemented at HEAD `53897b9` | Unreleased | compatibility note exclusion |
| FP-DM-002/003 | current non-reproduction | AC-20260910-02 | source/dist とも 0 findings、過去原因未特定 |
| FP-MIS-001 | current non-reproduction | AC-20260910-02 | source/dist とも 0 findings、過去原因未特定 |
| FP-RS-001 | implemented at HEAD `53897b9` | Unreleased | rule 名文字列だけでは SQL 条件に入らない |
| FP-RS-002 | current non-reproduction | AC-20260910-02 | source/dist とも 0 findings、過去原因未特定 |

## 6. Next Review

2026-10-10 に backlog を再評価:
- False positive 数の推移確認
- Rule improvement 実装状況確認
- Suppression 削減可能性評価
- MISSING_INPUT_SANITIZATION の detector 改修要否を再確認
