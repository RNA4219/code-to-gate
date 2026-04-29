# code-to-gate LLM Trust Model

**バージョン**: v1alpha1  
**作成日**: 2026-04-29  
**適用範囲**: LLM 生成 artifact、risk narrative、invariant seed、test seed、report

---

## 1. 基本方針

LLM は code-to-gate の必須コンポーネントだが、単独の最終判定者ではない。

LLM の役割:

- evidence に基づく要約
- risk narrative
- invariant candidate の説明
- recommended actions
- test seed の補強
- reviewer / PR comment 用の文章化

LLM に任せないもの:

- source code の存在確認
- AST / dependency extraction
- finding の primary evidence
- policy threshold
- release readiness status の最終決定
- suppression の有効性判断

---

## 2. LLM Input Contract

LLM に渡す input は次だけを含める。

- repo metadata
- normalized findings
- evidence excerpt または evidence summary
- dependency / blast radius summary
- policy summary
- previous artifact summary

禁止:

- private secret
- raw `.env`
- credential-like string
- configured redaction pattern に一致する文字列
- allowlist されていない大容量 file body

---

## 3. Structured Output

LLM output は structured schema で受ける。

```ts
export interface LlmSectionResult<T> {
  section: "summary" | "risk_narrative" | "invariants" | "test_seeds" | "recommendations";
  status: "ok" | "partial" | "failed";
  model: string;
  prompt_version: string;
  confidence: number;
  data?: T;
  errors?: CtgLlmError[];
  unsupported_claims: UnsupportedClaim[];
}

export interface UnsupportedClaim {
  id: string;
  claim: string;
  reason: "missing_evidence" | "unknown_symbol" | "policy_conflict" | "schema_invalid";
  sourceSection: string;
}
```

---

## 4. Evidence Binding

LLM 生成物の採用条件:

- risk narrative は `RiskSeed.sourceFindingIds` を参照する。
- invariant は `EvidenceRef` を少なくとも 1 件持つ。
- test seed は `sourceRiskIds` または `sourceFindingIds` を持つ。
- recommended action は対象 risk または finding と紐づく。

採用不可:

- evidence に存在しないファイル、行、symbol を参照する。
- source finding が存在しない。
- confidence が policy の `llm.min_confidence` 未満。
- schema validation に失敗する。

採用不可の出力は削除せず、`unsupported_claims` に隔離する。

---

## 5. Confidence 規則

| confidence | 扱い |
|---:|---|
| `>= 0.80` | 通常採用 |
| `0.60 - 0.79` | 採用。ただし `needs_review_hint` を付与 |
| `0.40 - 0.59` | artifact には入れるが downstream では review required |
| `< 0.40` | primary artifact には採用せず `unsupported_claims` へ |

policy はこの閾値を上書きできる。

---

## 6. LLM 失敗時挙動

| 状態 | 挙動 | status |
|---|---|---|
| LLM 接続不可 | deterministic artifact を生成し、LLM artifact は failed | `needs_review` または exit code `4` |
| timeout | retry 後に failed section として記録 | `needs_review` |
| schema invalid | repair prompt を 1 回実行 | 成功なら継続、失敗なら `needs_review` |
| low confidence 多数 | low confidence section を隔離 | `needs_review` |
| unsupported claims 発生 | `unsupported_claims` に隔離 | policy 閾値超過で `needs_review` |

`analyze --require-llm` の場合、LLM が完全失敗したら exit code `4` とする。

`scan` は LLM を呼ばない。

---

## 7. Redaction

LLM 送信前に redaction を行う。

必須 redaction:

- API key pattern
- token pattern
- password assignment
- `.env` file body
- private key block
- configured company string

redaction 結果は audit に記録する。

```ts
export interface RedactionAudit {
  enabled: boolean;
  rules: string[];
  redacted_count: number;
  payload_hash_before: string;
  payload_hash_after: string;
}
```

---

## 8. Local-only Mode

`--llm-mode local-only` では外部 API を呼ばない。

許可:

- ollama
- llama.cpp
- configured localhost endpoint

禁止:

- public cloud LLM provider
- OpenRouter などの remote router

local-only mode で local model が起動していない場合、exit code `4`。

---

## 9. Audit

LLM 利用時は `.qh/audit.json` に次を残す。

- provider
- model
- prompt_version
- prompt_template_hash
- request_hash
- response_hash
- redaction_enabled
- unsupported_claim_count
- low_confidence_count
- retry_count

raw prompt / raw response は既定では保存しない。`--debug-llm-trace` 指定時のみ `.qh/llm-trace.json` に保存し、public artifact には含めない。
