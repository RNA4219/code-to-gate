---
task_id: 20260608-05
intent_id: INT-ASSURANCE-SMELL-DETECTOR-001
owner: code-to-gate-team
status: done
last_reviewed_at: 2026-06-09
next_review_due: 2026-06-23
---

# Task Seed: Wave 2 Task 05 - Evidence Missing

## ゴール

artifact内の空evidence path、不正line range、repo graphに存在しないpath、dangling referenceを、根拠付きreview-required candidateとして検出する。

## 実装境界

- `findings.json`と`repo-graph.json`を必須入力とする
- external evidenceはrepo path検証の対象外とする
- 入力不足時はcandidateを生成せずunsupported claimを返す
- application層でI/Oを行わない

## 検証

```powershell
npx vitest run src/application/assurance/__tests__/evidence-missing.test.ts --reporter=dot
npm run lint -- --max-warnings 0
npm run typecheck
```

## 完了条件

- [x] evidence gapを既存Finding schema互換で表現する
- [x] evidenceのないclaimを生成しない
- [x] insufficient inputをunsupported claimとして記録する
