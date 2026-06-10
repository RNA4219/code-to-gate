---
task_id: 20260608-06
intent_id: INT-ASSURANCE-SMELL-DETECTOR-001
owner: code-to-gate-team
status: done
last_reviewed_at: 2026-06-09
next_review_due: 2026-06-23
---

# Task Seed: Wave 2 Task 06 - Risk and Invariant Rules

## ゴール

test linkageを持たない対象riskと、source finding/test/symbolへtraceできないinvariantをreview-required candidateとして検出する。

## 実装境界

- `RISK_WITHOUT_TEST`はlow riskを既定で除外する
- `INVARIANT_UNMAPPED`は明示的なhuman confirmation対象を除外する
- 必須artifact不足時はcandidateを生成せずunsupported claimを返す
- application層でI/Oを行わない

## 検証

```powershell
npx vitest run src/application/assurance/__tests__/risk-without-test.test.ts src/application/assurance/__tests__/invariant-unmapped.test.ts --reporter=dot
npm run lint -- --max-warnings 0
npm run typecheck
```

## 完了条件

- [x] risk/test linkage gapを検出する
- [x] invariant mapping gapを検出する
- [x] insufficient inputをunsupported claimとして記録する
