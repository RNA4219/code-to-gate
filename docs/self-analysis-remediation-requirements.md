---
intent_id: INT-SELF-ANALYSIS-001
owner: code-to-gate
status: draft
last_reviewed_at: 2026-05-17
next_review_due: 2026-06-17
---

# Self-Analysis Remediation Requirements

## 1. 目的 / 背景

`code-to-gate` 自身の self-analysis では 224 findings を検出したが、81 件の suppression により release readiness は `passed` となった。  
自己解析を継続的な品質ゲートとして使うには、**raw detection、正当な除外、返済対象負債、release gate** を分離し、抑制で実態を覆い隠さない構造へ改める必要がある。

## 2. スコープ

### In Scope

- self-analysis 向け suppression の分類再設計
- raw findings / effective findings / accepted exceptions の分離
- suppression なし baseline の生成と比較
- broad suppression の縮小
- self-analysis debt report の生成
- `UNSAFE_DELETE` / `TRY_CATCH_SWALLOW` / `RAW_SQL` / `LARGE_MODULE` の返済候補整理
- rule precision backlog への false positive 振り分け

### Out of Scope

- すべての finding の即時修正
- 既存 public fixture の振る舞い変更
- 全 rule engine の全面再設計
- tree-sitter 互換性問題の同時解消

## 3. ユースケース

1. 開発者が self-analysis を実行したとき、raw finding 数と accepted exception 数を別々に確認できる。
2. maintainer が broad suppression をレビューし、返済対象と正当な例外を分けられる。
3. release reviewer が `passed` だけでなく、self-analysis debt の残量と推移を見て判断できる。

## 4. 機能要件

| ID | 要件 | 内容 |
|---|---|---|
| SAR-001 | Suppression classification | suppression に `self-reference` / `fixture-intentional` / `generated-artifact` / `accepted-design` / `temporary-debt` の区分を持たせる |
| SAR-002 | Dual baseline | self-analysis で `raw findings` と `effective findings` を同時出力する |
| SAR-003 | Debt report | rule 別・path 別・分類別の debt summary を artifact または report section として出す |
| SAR-004 | Broad suppression guard | `src/**` や `fixtures/**` などの広域 suppression を検出し、review 対象として扱う |
| SAR-005 | Gate transparency | readiness に raw critical/high と suppressed critical/high の要約を含める |
| SAR-006 | Candidate triage | `UNSAFE_DELETE` / `TRY_CATCH_SWALLOW` / `RAW_SQL` / `LARGE_MODULE` を code fix / design accepted / false positive のいずれかへ分類できる |
| SAR-007 | Rule precision backlog | false positive と判断したものを suppression ではなく detector 改善候補として追跡できる |
| SAR-008 | Historical comparison | self-analysis debt の増減を historical comparison で追跡できる |

## 5. 非機能要件

| ID | 要件 | 内容 |
|---|---|---|
| NFR-001 | 再現性 | 同一 commit / policy / suppression set で同一 summary が得られる |
| NFR-002 | 説明可能性 | すべての accepted exception は理由と分類を持つ |
| NFR-003 | 後方互換 | 既存 suppression file は migration なしでも読める |
| NFR-004 | 安全性 | suppression によって raw finding 情報が失われない |
| NFR-005 | 実行性 | self-analysis の追加 report は既存 `scan` / `analyze` / `readiness` フローに統合できる |

## 6. 受入の目安

1. `analyze . --emit all` で raw / effective / accepted exception の3区分が確認できる。
2. `readiness` が `passed` でも raw critical/high と suppression 内訳を出す。
3. broad suppression が存在する場合、report または diagnostic に review-required として現れる。
4. `.ctg/suppressions.yaml` の broad entry を縮小しても、正当な self-reference / fixture findings は分類付きで扱える。
5. `docs/self-analysis-debt-inventory-2026-05-17.md` に挙げた P0 / P1 課題へ追跡可能な実装タスクが立つ。
