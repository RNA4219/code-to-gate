---
task_id: 20260608-07
intent_id: INT-ASSURANCE-SMELL-DETECTOR-001
owner: code-to-gate-team
status: done
last_reviewed_at: 2026-06-09
next_review_due: 2026-06-23
---

# Task Seed: Wave 2 Task 07 - Intake and Intent Rules

## 背景

ID付きrequirement・intentとartifact/diff signalのtraceability gapを、推測を避けたreview-required candidateとして表現する。

## ゴール

- application内部のtyped intake契約を追加する
- requirement・intent nodeとscope edgeをAssuranceGraphへ正規化する
- `REQUIREMENT_LINK_MISSING`をscope確定時のみ評価する
- `INTENT_NOT_RECOVERABLE`をchanged critical entrypoint限定で評価する
- 入力不足時はcandidateを生成せずunsupported claimへ記録する

## 実装境界

- scopeは実在するnode IDまたはrepo graph上のfile pathへ完全一致した場合のみ接続する
- 自由文一致だけではtraceability linkとみなさない
- intent ruleはdiff inputと、intake/invariant/testのいずれかを両方必須とする
- diff loaderとchanged-by edge生成はTask 20260608-12まで繰り延べる

## 検証

```powershell
npx vitest run src/application/assurance/__tests__/intent-not-recoverable.test.ts src/application/assurance/__tests__/requirement-link-missing.test.ts --reporter=dot
npm run lint -- --max-warnings 0
npm run typecheck
npm run test:smoke
npm run test:architecture
```

## 完了条件

- [x] requirement/intentをtyped intakeから正規化できる
- [x] scope不明時にrequirement candidateを生成しない
- [x] diffなしでintent candidateを生成しない
- [x] traceability入力なしでintent candidateを生成しない
- [x] candidateは根拠、必須tag、review-required表現を持つ
- [x] application層にNode APIまたはI/Oを追加しない
