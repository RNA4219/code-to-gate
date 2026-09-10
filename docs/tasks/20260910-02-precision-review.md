---
task_id: 20260910-02
status: done
last_reviewed_at: 2026-09-10
---

# 2026-09-10 Precision Review

## 目的

実 repo の findings を、入力 bytes・run・repo commit・evidence に束ねた private JSON として人手判定できるようにする。

## Scope

- `src/evaluation/fp-evaluator.ts`: ID 照合、分類検証、strict full 評価、空比較の安全化
- `src/evaluation/precision-review.ts`: `precision-review@v1` の create/update/validate/summarize
- `scripts/precision-review.mjs`: local-only JSON command line
- `scripts/fp-review.ps1`, `scripts/fp-review.sh`: thin wrapper
- 専用 unit/node tests と本ドキュメント

公開 `ctg/v1` schema、CLI 本体、外部 repo/network、実 repo の review 結果生成は対象外。

## 検収

- finding ID 順変更、duplicate/unknown/missing、rule/fingerprint/evidence/hash/run/commit mismatch を検証する
- 初期値は全件 `Uncertain`。human の確定分類だけを reportable とし、AI-only は precision claim 不可
- `AcceptedDesign` を FP rate から分離し、zero denominator は null、rule 別集計を出す
- 日本語 comment が保存され、既存 output の不用意な上書きを拒否する
- wrappers の主要引数を維持し、analyze の失敗を隠さない

## 検証コマンド

```text
npm run build
npx vitest run src/evaluation/__tests__/fp-evaluator.test.ts src/evaluation/__tests__/precision-review.test.ts --maxWorkers=1
node --test scripts/__tests__/precision-review.test.mjs
bash -n scripts/fp-review.sh
```

## 統合状況

専用Node wrapper検証、入力改変時の出力不変検証、対象Vitest、及び最終full testは完了した。
最終結果の導線は `docs/acceptance/AC-20260910-06-maintenance.md` とし、
実 repo の人手精度判定は未実施のまま別証跡で管理する。
