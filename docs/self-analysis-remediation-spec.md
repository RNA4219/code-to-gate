---
intent_id: INT-SELF-ANALYSIS-001
owner: code-to-gate
status: draft
last_reviewed_at: 2026-05-17
next_review_due: 2026-06-17
---

# Self-Analysis Remediation Specification

## 1. 目的

self-analysis を「finding を消す仕組み」から「finding を分類し、返済判断へ変換する仕組み」へ更新する。

## 2. 現状

- `224` findings のうち、current suppression 適用後は `224` 件すべてが suppressed 扱いになる。
- `readiness` は `passed` だが、suppression 無しなら `blocked_input`。
- suppression 81 entries のうち 71 entries が broad pattern を含む。
- `SUPPRESSION_DEBT` が 84 findings を返し、台帳肥大化そのものを signal として観測している。

## 3. 設計方針

### 3.1 3層モデル

| 層 | 内容 | 例 |
|---|---|---|
| Raw | rule engine が検出した全 finding | 224 findings |
| Classified | self-reference / fixture / accepted design / temporary debt に分類済み | rule 実装自己反応 |
| Effective | gate 判定に使う finding | 未返済の unsafe delete など |

### 3.2 suppression の区分

```yaml
- rule_id: TRY_CATCH_SWALLOW
  path: src/adapters/**
  class: accepted-design
  reason: Language adapters intentionally degrade to fallback parsing
  expiry: 2027-04-30
  author: code-to-gate-team
```

追加 class:

- `self-reference`
- `fixture-intentional`
- `generated-artifact`
- `accepted-design`
- `temporary-debt`

後方互換:

- `class` 未指定の既存 entry は `temporary-debt` とみなす。

### 3.3 新しい report 出力

`analysis-report.md` に以下を追加する。

1. Raw Findings Summary
2. Effective Findings Summary
3. Accepted Exceptions Summary
4. Broad Suppression Review
5. Self-Analysis Debt Burn-down

machine-readable には、既存 artifact を壊さず次のいずれかを追加する。

- `findings.json.meta.selfAnalysis`
- または `self-analysis-debt.json`

初期実装では後者を推奨する。

### 3.4 readiness の扱い

`release-readiness.json` に以下を追加する。

```json
{
  "selfAnalysis": {
    "rawCritical": 31,
    "rawHigh": 102,
    "suppressedCritical": 31,
    "suppressedHigh": 102,
    "broadSuppressions": 71,
    "temporaryDebtCount": 0
  }
}
```

互換性のため、既存 `status` は維持する。ただし、`passed` 時も `recommendedActions` に broad suppression review を追加できるようにする。

### 3.5 責務境界

責務境界と artifact 間の契約は [self-analysis-contract-boundary-spec.md](self-analysis-contract-boundary-spec.md) を正本とする。

- classification は共有 module に集約する。
- reporter は分類結果を描画するのみとする。
- `analyze` と `readiness` は同じ分類契約を使うが、片方の内部実装へ依存しない。

## 4. 実装分割

### Phase A: 観測層の分離

- suppression parser に `class` を追加
- self-analysis debt summary builder を追加
- raw/effective/suppressed count を artifacts へ反映
- broad suppression detector を追加

### Phase B: 台帳整理

- `.ctg/suppressions.yaml` を class 付きへ migration
- `src/**` broad suppression を module 単位へ縮小
- fixture / rule implementation / generated artifact を別 class に整理

### Phase C: 実装負債の返済

- `UNSAFE_DELETE`: safety guard または detector narrowing
- `TRY_CATCH_SWALLOW`: logging / explicit fallback contract
- `RAW_SQL`: example pattern か実害かを判定
- `LARGE_MODULE`: accepted-design と split candidate を分離

### Phase D: precision backlog

- `HARDCODED_SECRET`
- `DEBT_MARKER`
- rule implementation 上の `MISSING_INPUT_SANITIZATION`

これらは detector test を追加し、suppression 依存を減らす。

## 5. 変更対象

| area | files |
|---|---|
| config | `src/config/policy-types.ts`, `policy-yaml-parser.ts`, `policy-loader.ts` |
| suppression | `src/suppression/*` または新規 self-analysis builder |
| reporting | `src/reporters/*`, `src/cli/readiness.ts` |
| docs | `.ctg/suppressions.yaml`, self-analysis docs |
| tests | policy loader/evaluator、reporter、readiness、self-analysis integration |

## 6. リスク

| リスク | 緩和 |
|---|---|
| schema 拡張で downstream が壊れる | additive field のみ、既存 schema を更新 |
| broad suppression 縮小で一時的に gate が赤くなる | raw/effective 分離を先に入れる |
| class 運用が形骸化する | lint / validator で class 必須化へ段階移行 |
| false positive 返済と code fix が混線する | precision backlog を別 artifact / issue に分離 |

## 7. 検証

- suppression class migration test
- broad suppression detector test
- readiness selfAnalysis summary test
- current `.ctg/suppressions.yaml` migration fixture test
- self-analysis integration test:
  - raw findings > 0
  - effective findings < raw findings
  - accepted exceptions > 0
  - broad suppression review > 0

## 8. 完了条件

1. self-analysis の raw / classified / effective が一目で分かる。
2. `passed` が raw debt を隠さない。
3. broad suppression の存在が reviewer に明示される。
4. P1 実装負債候補が suppression だけでなく backlog として追跡される。
