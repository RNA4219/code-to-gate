# code-to-gate v0.1 仕様書検収レポート

> **注意**: この文書は v0.1 仕様書検収 GO を記録しています。プロダクトレベル(v1.0)の仕様書は `docs/product-spec-v1.md` を参照してください。プロダクトレベル仕様書 GO は別途判定されます。

**作成日**: 2026-04-30  
**検収入口**: `agent-tools-hub`  
**検収方式**: `manual-bb-test-harness`  
**判定対象**: v0.1 仕様書セット  
**判定**: `go`

---

## 1. 根拠付き観点

| id | 観点 | 結果 | 根拠 |
|---|---|---|---|
| SPEC-01 | 仕様書セットの入口が明確 | pass | `README.md` と `docs/requirements.md` が正本 docs を列挙している |
| SPEC-02 | 製品境界が明確 | pass | `docs/requirements.md` に scope / non-goals / 既存 repo との棲み分けがある |
| SPEC-03 | artifact 契約が実装可能 | pass | `docs/artifact-contracts.md` と `schemas/*.schema.json` が対応している |
| SPEC-04 | CLI 失敗モデルが検収可能 | pass | `docs/error-model.md` に exit code と command 別成功条件がある |
| SPEC-05 | LLM trust model が安全側 | pass | `docs/llm-trust-model.md` に evidence binding / unsupported claims / failure behavior がある |
| SPEC-06 | downstream 責務境界が明確 | pass | `docs/integrations.md` と `schemas/integrations/*.schema.json` がある |
| SPEC-07 | plugin 境界が明確 | pass | `docs/plugin-security-contract.md` が OSS core / private plugin / LLM output の境界を定義している |
| SPEC-08 | executable acceptance に落ちている | pass | `docs/acceptance-v0.1.md` に必須コマンド、期待 artifact、exit code、Done 判定がある |
| SPEC-09 | fixture 仕様が実装可能 | pass | `docs/fixture-spec-v0.1.md` に 3 fixture の構成、smell、期待 finding / risk / seed がある |
| SPEC-10 | 未決 marker が残っていない | pass | 正本仕様書で `TODO` / `TBD` / `FIXME` / `要確認` / `未定` は検出なし |

---

## 2. リスク

| id | priority | 内容 | 判定 |
|---|---|---|---|
| RISK-SPEC-01 | P2 | 仕様書と JSON Schema の将来乖離 | 次工程で schema/docs 同期チェックを CI 化する。GO blocker ではない |
| RISK-SPEC-02 | P2 | LLM provider 実接続時の failure path 未検証 | 仕様上は exit code `4` と unsupported claims 隔離が定義済み。GO blocker ではない |
| RISK-SPEC-03 | P2 | private plugin runtime guard は実装途上 | security contract は仕様化済み。実装 follow-up として扱う |

---

## 3. 優先度

P0 / P1 の仕様書 blocker はなし。残る P2 は実装・CI・provider contract test の強化項目であり、仕様書 GO を止めない。

---

## 4. 手動テストケース

| tc_id | 手順 | 期待 | 結果 |
|---|---|---|---|
| TC-SPEC-001 | `README.md` から正本 docs を辿る | 仕様書セットが一意に分かる | pass |
| TC-SPEC-002 | `requirements.md` の scope / non-goals / P0 を確認 | 製品境界と v0.1 完成条件が明確 | pass |
| TC-SPEC-003 | artifact contracts と schemas を照合 | core artifact の schema 実体が揃う | pass |
| TC-SPEC-004 | integrations と adapter schemas を照合 | downstream 4 種の payload 契約が揃う | pass |
| TC-SPEC-005 | acceptance command と fixture spec を照合 | 検収入力と期待結果が対応する | pass |
| TC-SPEC-006 | 正本 docs の未決 marker を検索 | 未解決 marker がない | pass |
| TC-SPEC-007 | `schemas/` 配下 JSON を parse | 12 本すべて parse 成功 | pass |

---

## 5. 工数

- prep: 0.2h
- execution: 0.5h
- evidence: 0.2h
- retry buffer: 0.1h
- total: 1.0h

---

## 6. Gate 判定

`go`

理由:

- 仕様書の入口、正本分割、scope、non-goals、P0 acceptance が揃っている。
- core artifact と downstream adapter の schema 実体が揃っている。
- LLM、plugin、external import、partial failure、exit code が仕様化されている。
- fixture 仕様と executable acceptance が対応している。
- 未決 marker、欠落 docs、欠落 schema は検出されなかった。

---

## 7. Go/No-Go Brief

`code-to-gate` v0.1 仕様書セットは GO。実装者は `README.md` から正本 docs に辿れ、P0 の完成条件、生成 artifact、downstream 連携、LLM 安全境界、plugin 境界、fixture、acceptance command を確認できる。

残余リスクは中。次工程では schema/docs 同期チェック、LLM failure contract test、plugin runtime guard、adapter payload contract test を CI に載せる。

