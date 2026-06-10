---
task_id: 20260608-02
intent_id: INT-ASSURANCE-SMELL-DETECTOR-001
owner: code-to-gate-team
status: done
last_reviewed_at: 2026-06-08
next_review_due: 2026-06-22
---

# Task Seed: Wave 1 Task 02 - Type Definitions

## 背景

Assurance Smell Detectorの10ルールID、タグ、review-required語彙をTypeScript型として固定する。これらは検査結果を表現する値であり、最終判定(pass/fail/go/no_go)はquality-evidence-graph本体だけが行う。

## ゴール

- 10ルールIDの型定義（6 artifact-cross + 4 diff-semantic）
- Required tags（assurance-smell, review-required）定義
- Rule-specific tags（lowercase kebab-case）定義
- Category/Severity/Confidence mapping
- Architecture boundary compliance（types layerは他src layerからimport禁止）

## 修正対象

1. `src/types/assurance-findings.ts`
   - Rule IDs constant and type
   - Tags constants (required, rule-specific, auxiliary)
   - Category/Severity/Confidence mappings
   - Helper functions: `ruleIdToTag`, `assuranceFindingTags`, `getDefaultCategory`, `getDefaultSeverity`, `getDefaultConfidence`
2. `src/types/__tests__/assurance-findings.test.ts`
   - Vocabulary functionality tests
   - Architecture boundary compliance test
3. `src/__tests__/types/assurance-findings.test.ts`
   - Integration tests with existing Finding shape

## TDD / 検証

1. typecheck実行
   - `npm run typecheck`
2. architecture test実行
   - `npm run test:architecture`（dependency-boundary.test.ts）
3. vocabulary tests実行
   - `npm test src/types/__tests__/assurance-findings.test.ts`
   - `npm test src/__tests__/types/assurance-findings.test.ts`

## 完了条件

- [x] 10 rule IDsが定義されている（Section 8.1/8.2順序）
- [x] Required tagsが定義されている（assurance-smell, review-required）
- [x] Rule-specific tagsが全rule IDに対応
- [x] Auxiliary tagsが定義されている（Section 9.1）
- [x] Category/Severity/Confidence mappingsが全rule IDに対応
- [x] typecheck成功
- [x] architecture test成功（17 tests）
- [x] assurance-findings tests成功（2785 tests）

## 検収観点

- Types layerが他src layerからimportしていない（architecture boundary）
- `assuranceFindingTags()`が3つのrequired tagsを生成する
- Rule ID → lowercase kebab-case tag変換が正しい
- Confidence valuesがspec range内

## 参照

- `docs/assurance-smell-detector-spec.md` Section 8, 9
- `docs/implementation-plan-assurance-smell-detector.md`
- `docs/tasks/20260608-01-foundation-setup.md`
- `docs/architecture/layer-boundaries.md`