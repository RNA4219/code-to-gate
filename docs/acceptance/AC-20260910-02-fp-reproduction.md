---
intent_id: AC-FP-REPRODUCTION-20260910-02
owner: code-to-gate-team
status: active
last_reviewed_at: 2026-09-10
next_review_due: 2026-10-10
---

# Acceptance: False-positive reproduction check

## Scope

この記録は、過去の false-positive 報告4件が現行 source と現在 build 済み
`dist` で再現するかを、該当ファイル単位で機械評価した結果である。
非再現は人間による TP/FP 判定、全体 detector の解消、公開版への収録判定を意味しない。

実行日時: 2026-09-10 JST（Vitest start 03:09:51）
基準 commit: `53897b9`
branch: `agent/security-and-evidence-fixes`

## Method

Thin `RuleContext` を既存 rule tests の形に合わせ、各現行 source file を1ファイルの
source graph として、対応する source rule と `dist/rules/*.js` rule に入力した。

実行コマンド:

```powershell
npx vitest run --config C:/Users/ryo-n/Codex_dev/code-to-gate-work-20260910/vitest.precision.config.ts --reporter=verbose
```

検証専用ファイル:

- `C:\Users\ryo-n\Codex_dev\code-to-gate-work-20260910\precision-repro.test.ts`
- `C:\Users\ryo-n\Codex_dev\code-to-gate-work-20260910\vitest.precision.config.ts`

## Results

| ID | Rule | Current concrete lines | Source findings | Built dist findings | Result |
|---|---|---:|---:|---:|---|
| FP-DM-002 | `DEBT_MARKER` | `src/evaluation/fp-evaluator.ts:87,88,206` | 0 | 0 | 現行非再現（過去原因未特定） |
| FP-DM-003 | `DEBT_MARKER` | `src/plugin/docker-sandbox.ts:319` | 0 | 0 | 現行非再現（過去原因未特定） |
| FP-RS-002 | `RAW_SQL` | `src/plugin/plugin-context.ts:10,186,504` | 0 | 0 | 現行非再現（過去原因未特定） |
| FP-MIS-001 | `MISSING_INPUT_SANITIZATION` | `src/cli/llm-health.ts:39,42,57,59,62,65,71,85,86,94,97,98,100,103,106-116,128,147-149,151,154-160` | 0 | 0 | 現行非再現（過去原因未特定） |

The run completed with 1 test file and 1 test passed. Both source and built rule
paths returned zero findings for the complete target files and for the listed
reported locations.

## SHA-256 Evidence

Target source hashes:

| File | SHA-256 |
|---|---|
| `src/evaluation/fp-evaluator.ts` | `d4a3640343804a300906ca5e0b88f310e4ccc462fe116b773fd7338bea793e76` |
| `src/plugin/docker-sandbox.ts` | `a4328c3dd7e6b76425809b953070345d1a40d2e886ebe214ff2fb1ff78e3b293` |
| `src/plugin/plugin-context.ts` | `701b2c609e89aeea9b4313f4bec50add1e295d0b58fce3e624f2f07b7420aa3c` |
| `src/cli/llm-health.ts` | `c5b29d3ca197ff75f0ee0122739f898fa5fefae3e0abddd7b15765d12e4903a6` |

Rule source and build hashes:

| Rule | Source rule | Built dist rule |
|---|---|---|
| `DEBT_MARKER` | `src/rules/debt-marker.ts` — `f894997cf4f7050a46931d91c3e8f543d251b16853ab7c6bfd65b86e47536ff1` | `dist/rules/debt-marker.js` — `c6e51e460594e504d65844b569f3feff148cb41f24318f2de55c52d65e8058a8` |
| `RAW_SQL` | `src/rules/raw-sql.ts` — `91cd4dae2b6fd4f8cba89506c707c0acd0eddcfa8e9ec5d235318e3407b66cb1` | `dist/rules/raw-sql.js` — `6eece9f7a2de72bd7147767f0651169069b1ebfc0284c3b7fb24bc48e16fe2c6` |
| `MISSING_INPUT_SANITIZATION` | `src/rules/missing-input-sanitization.ts` — `de4afb18714fe2404e8d019a746e1b21c284c1d9be0289eee77eae457488ec04` | `dist/rules/missing-input-sanitization.js` — `ec31ee3cf47219d8da6131b8a2955a8cf2b61c96081a6db109b9594019ac5792` |

## Boundary and Remaining Work

- `src/evaluation/fp-evaluator.ts` は検証時点で他者の未コミット編集状態だった。今回の対象4 rule の評価結果に影響する変更は確認していないが、hash と時点を固定して記録した。
- 現行非再現の4件は、過去報告の原因不明として backlog に残す。
- human TP/FP/Uncertain adjudication、regression fixture の追加、全体 scan の精度判定は別作業である。
- source rule、dist、CLI、build、full test は変更・再生成していない。
