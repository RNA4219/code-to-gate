---
intent_id: INT-SELF-ANALYSIS-002
owner: code-to-gate
status: draft
last_reviewed_at: 2026-05-17
next_review_due: 2026-06-17
---

# Self-Analysis Contract Boundary Specification

## 1. 目的

self-analysis の責務を `suppression classification`、`artifact generation`、`CLI orchestration` に分離し、`analyze` と `readiness` が同じ分類契約を共有しながらも互いの内部実装へ依存しない構造にする。

## 2. 未確定だった点

1. suppression class の正本が複数 loader に分散していた。
2. `Raw Findings` が CLI ごとに別の意味で扱われていた。
3. suppressed finding と suppression entry の対応付けが path を無視していた。
4. `self-analysis-debt.json` の生成責務が `readiness` に寄っていた。

## 3. 契約

### 3.1 分類契約

- suppression entry の正本型は `SuppressionEntry` とする。
- finding と suppression の対応付けは `ruleId + glob path + expiry` で判定する。
- class 未指定は `temporary-debt` として扱う。
- 分類集計は専用 module が担い、CLI と reporter はその結果のみを消費する。

### 3.2 finding view 契約

| view | 定義 | 主用途 |
|---|---|---|
| Raw | rule engine が返した全 finding | debt 観測、検出量の比較 |
| Effective | suppression 適用後に gate へ残る finding | risk register、gate 判定 |
| Accepted Exception | suppression により除外された finding | 例外監査、返済判断 |

- `analysis-report.md` は raw と effective の両方を表示する。
- `findings.json` は既存互換のため effective view を維持する。
- `self-analysis-debt.json` は raw / effective / accepted exception の差分を持つ補助 artifact とする。

### 3.3 artifact 契約

- `self-analysis-debt.json` の schema は `self-analysis-debt@v1` とする。
- 生成可能な CLI は `analyze` と `readiness` の両方とする。
- `readiness` は release 判定 artifact、`self-analysis-debt.json` は debt 観測 artifact とし、片方の内部処理へ依存しない。

### 3.4 疎結合境界

| module | 責務 | 依存してよいもの |
|---|---|---|
| `config/policy-*` | suppression parse / match | glob matcher、型定義 |
| `self-analysis/*` | raw/effective/accepted の分類集計 | `SuppressionEntry`, `Finding` |
| `reporters/*` | artifact / markdown への整形 | 集計済み view |
| `cli/*` | 入出力、artifact の組み立て | 上記 module の公開 API |

禁止事項:

- reporter 内で suppression matching を再実装しない。
- CLI ごとに独自の suppression class 判定を持たない。
- `readiness` のみを経由しないと debt artifact が作れない構造にしない。

## 4. 実装方針

1. `self-analysis` 集計 module を追加する。
2. `analyze` は raw findings を保持したまま effective findings を出力へ分ける。
3. `readiness` と debt reporter は共通集計 module を使う。
4. `self-analysis-debt@v1` schema を追加する。
5. 既存 CLI 出力との互換性を保ち、追加 artifact は additive に扱う。

## 5. 検証

- 同一 finding が異なる path class の suppression に混在しても、正しい class に集計される。
- `analysis-report.md` の raw count は suppression 前件数と一致する。
- `analyze` 単体でも `self-analysis-debt.json` が生成される。
- `readiness` と `self-analysis-debt.json` の class breakdown が一致する。

## 6. 完了条件

1. suppression classification の正本が一箇所になる。
2. raw / effective / accepted exception の語義が artifact 間で揃う。
3. CLI と reporter の責務が分かれ、追加の表現変更が分類ロジックへ波及しない。
