---
task_id: 20260608-03
intent_id: INT-ASSURANCE-SMELL-DETECTOR-001
owner: code-to-gate-team
status: done
last_reviewed_at: 2026-06-08
next_review_due: 2026-06-22
---

# Task Seed: Wave 1 Task 03 - Finding Factory

## 背景

Assurance ruleが既存`Finding`形状へ安全にcandidateを出力するため、安定ID、必須tag、Evidence正規化、unsupported claim生成を一箇所へ集約する。

## ゴール

- 行番号に依存しない安定finding IDを生成する
- Evidenceを正規化、重複排除、決定的ソートする
- `assurance-smell`、rule固有tag、`review-required`を必ず付与する
- titleとsummaryをreview-required candidate表現へ正規化する
- 入力不足をschema-compatibleなunsupported claimとして表現する

## 修正対象

1. `src/application/assurance/finding-factory.ts`
2. `src/application/assurance/__tests__/finding-factory.test.ts`
3. `src/application/index.ts`
4. `eslint.config.js`

## TDD / 検証

```powershell
npx vitest run src/application/assurance/__tests__/finding-factory.test.ts --reporter=dot
npm run lint -- --max-warnings 0
npm run typecheck
npm run test:architecture
npm test
```

## 完了条件

- [x] 同じsemantic identityから同じfinding IDを生成する
- [x] line変更とEvidence入力順変更でfinding IDが変化しない
- [x] Evidenceが正規化、重複排除、決定的ソートされる
- [x] text/external Evidenceのschema要件を保証する
- [x] Evidenceなしcandidateを拒否する
- [x] confidence範囲外を拒否する
- [x] unsupported claim IDが安定する
- [x] `partial_input`を現行schema互換の`missing_evidence`へ正規化する

## 参照

- `docs/assurance-smell-detector-spec.md` Section 3, 4.2, 9
- `docs/implementation-plan-assurance-smell-detector.md`
- `docs/tasks/20260608-02-type-definitions.md`
