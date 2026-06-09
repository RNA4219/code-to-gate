---
task_id: 20260608-04
intent_id: INT-ASSURANCE-SMELL-DETECTOR-001
owner: code-to-gate-team
status: done
last_reviewed_at: 2026-06-09
next_review_due: 2026-06-22
---

# Task Seed: Wave 1 Task 04 - AssuranceGraph and Input Normalization

## 背景

Assurance Detectorは生成済みartifact bundleを読み込み、read-only graphへ正規化して横断検査を実行する。このgraphはruntime内部型であり、新規公開schemaにはしない。

## ゴール

- 読み取り専用AssuranceGraph型定義（nodes, edges, coverage）
- CLI/adapter層から渡されたtyped artifact bundleの正規化
- Node正規化: requirement, intent, finding, risk, invariant, test-seed, evidence, file, symbol, entrypoint, readiness-condition
- Edge正規化: declares, derived-from, supported-by, tested-by, maps-to, affects, changed-by
- Coverage tracking: loaded artifacts, missing artifacts, partial input flags
- 空bundleとvalid bundleの安全な検査

## 修正対象

1. `src/application/assurance/assurance-graph.ts`
   - AssuranceGraph interface
   - AssuranceNode/AssuranceEdge types
   - AssuranceCoverage interface
   - buildAssuranceGraph(bundle): AssuranceGraph
2. `src/application/assurance/__tests__/assurance-graph.test.ts`
   - Empty bundle handling
   - Valid bundle normalization
   - Missing artifact handling
   - Edge relationship tests

## TDD / 検証

```powershell
npx vitest run src/application/assurance/__tests__/assurance-graph.test.ts --reporter=dot
npm run typecheck
npm run test:architecture
```

## 完了条件

- [x] AssuranceGraph型定義（nodes, edges, coverage）
- [x] Node正規化（finding, risk, invariant, test-seed, readiness-condition）
- [x] Edge正規化（sourceFindingIds, sourceRiskIds, evidence refs）
- [x] Coverage tracking（loaded, missing, partial flags）
- [x] 空bundle時はcoverage.missingに記録、graphは空nodes/edges
- [x] valid bundle時はnodes/edges正規化成功
- [x] typecheck成功
- [x] architecture boundary compliance
- [x] application層からNode API直接importを除去

## 検収観点

- application層からNode APIを直接importしない
- graph生成はread-only、元artifactを変更しない
- deterministicな正規化（same input = same graph structure）
- partial input時はunsupported_claims生成条件を満たす情報をcoverageに記録

## 繰延べ

- JSON/YAML artifactの読込・parse・schema validationはCLI composition rootの責務としてTask 20260608-10で実装する
- requirement/intent node正規化はintake契約と同時にTask 20260608-07で実装する

## 参照

- `docs/assurance-smell-detector-spec.md` Section 7
- `docs/implementation-plan-assurance-smell-detector.md`
- `src/types/artifacts.ts` Finding, RiskSeed, TestSeed, Invariant, ReleaseReadinessArtifact
