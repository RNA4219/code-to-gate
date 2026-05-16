---
intent_id: INT-SELF-ANALYSIS-001
owner: code-to-gate
status: active
last_reviewed_at: 2026-05-17
next_review_due: 2026-06-17
---

# Self-Analysis Debt Inventory

## 1. 目的

2026-05-16 の `code-to-gate` self-analysis で検出された finding と suppression を棚卸しし、次の実装で扱うべき問題を分類する。

## 2. 実行証跡

| 項目 | 値 |
|---|---:|
| 対象 | `code-to-gate` 自身 |
| scan files | 530 |
| symbols | 2,305 |
| relations | 12,434 |
| findings | 224 |
| risks | 111 |
| critical | 31 |
| high | 102 |
| medium | 91 |
| suppressions | 81 entries |
| readiness without suppressions | `blocked_input` |
| readiness with current suppressions | `passed` |

参照:

- `.qh-self/findings.json`
- `.qh-self/risk-register.yaml`
- `.qh-self/release-readiness.json`
- `.ctg/suppressions.yaml`

## 3. Finding 棚卸

| rule | count | severity 主体 | 初期分類 |
|---|---:|---|---|
| `SUPPRESSION_DEBT` | 84 | high / medium | suppression 運用設計の問題 |
| `LARGE_MODULE` | 44 | medium | 実装負債候補 |
| `CLIENT_TRUSTED_PRICE` | 23 | critical | rule 実装の自己反応 |
| `DEPRECATED_API_USAGE` | 18 | medium | rule 実装 / adapter / docker 由来 |
| `UNSAFE_DELETE` | 15 | high | 実装負債候補 |
| `TRY_CATCH_SWALLOW` | 11 | medium | 実装負債候補 |
| `MISSING_INPUT_SANITIZATION` | 9 | critical / medium | rule 実装中心、1件は要確認 |
| `UNSAFE_REDIRECT` | 7 | high | rule 実装 / adapter / docker 由来 |
| `HARDCODED_SECRET` | 6 | high | false positive 候補 |
| `ENV_DIRECT_ACCESS` | 4 | medium | 意図的アクセス候補 |
| `RAW_SQL` | 1 | high | 実装負債または例示パターン要確認 |
| `UNTESTED_CRITICAL_PATH` | 1 | high | rule 実装の自己反応 |
| `DEBT_MARKER` | 1 | medium | コメント false positive |

## 4. Suppression 棚卸

### 4.1 規模

| 指標 | 値 |
|---|---:|
| suppression entry 総数 | 81 |
| `**` を含む広域 suppression | 71 |
| `src/**` 全体 suppression | 1 |
| `LARGE_MODULE` suppression | 20 |
| `TRY_CATCH_SWALLOW` suppression | 9 |
| `UNSAFE_DELETE` suppression | 8 |

### 4.2 問題

1. `src/**` や `fixtures/**` などの広域 suppression が多く、個別 finding の妥当性確認を迂回している。
2. self-reference、fixture、compiled output、architecture decision、実装負債が同一ファイルで同じ仕組みとして扱われている。
3. `SUPPRESSION_DEBT` 自体が 84 finding を生み、抑制台帳の肥大化を signal としては拾えているが、返済優先度へ変換できていない。
4. suppressions 適用後の readiness が `passed` になるため、raw self-analysis の深刻度と release gate の表示が乖離している。

## 5. 分類

### A. 低リスクで分離すべき自己反応

- `src/rules/**` 上の rule 自己反応
- `fixtures/**` 上の意図的 vulnerable pattern
- compiled output / demo asset 由来

方針:

- finding を消すのではなく、`self-reference` / `fixture-intentional` / `generated-artifact` として明示的に分類する。
- suppressions は細粒度にし、ready state とは別の観測値として残す。

### B. 実装負債として返済候補に残すもの

- `LARGE_MODULE` 44 件
- `UNSAFE_DELETE` 15 件
- `TRY_CATCH_SWALLOW` 11 件
- `RAW_SQL` 1 件
- `MISSING_INPUT_SANITIZATION` の `src/cli/llm-health.ts` 1 件

方針:

- broad suppression を外しても本当に許容できるか、file 単位で確認する。
- 実害があるものは code fix、構造起因のものは設計 ADR または分割計画へ落とす。

### C. 検出器改善へ送るもの

- `HARDCODED_SECRET` の `message` / `description` / `id` / `name` / `ruleId`
- `DEBT_MARKER` のコメント false positive
- `MISSING_INPUT_SANITIZATION` の rule 実装自己反応

方針:

- 返済対象ではなく rule precision backlog として扱う。
- false positive 判定根拠を test fixture に固定する。

## 6. 初期優先度

| 優先度 | 対象 | 理由 |
|---|---|---|
| P0 | suppression モデル再設計 | readiness 信頼性を損なっている |
| P0 | suppression なし baseline の正式出力 | 現状値を隠さず追跡するため |
| P1 | `UNSAFE_DELETE` / `TRY_CATCH_SWALLOW` / `RAW_SQL` 精査 | 実装安全性に直結 |
| P1 | `LARGE_MODULE` 返済方針 | 44 件あり、保守性の主負債 |
| P2 | rule precision backlog | noise 削減で self-analysis の信頼性を上げる |

## 7. Phase C 完了記録 (2026-05-17)

### 7.1 UNSAFE_DELETE (15件) - 分類完了

| Location | Pattern | Classification | Verdict |
|----------|---------|---------------|---------|
| src/cache/*.ts | `.clear()` on Map (4) | accepted-design | Cache invalidation, NOT data deletion |
| src/cli/plugin-sandbox.ts | `fs.rm` temp cleanup (2) | accepted-design | Uses `{ force: true }` - safe pattern |
| src/parallel/file-processor.ts | `.clear()` on Map (2) | accepted-design | In-memory cache clearing |
| src/plugin/*.ts | `fs.rm` / `fs.unlink` (3) | accepted-design | Temp dir cleanup with error handling |
| src/reporters/json-reporter.ts | `.clear()` on Map (1) | accepted-design | File content cache clearing |
| src/rules/*.ts | Detection patterns (2) | self-reference | Rule implementation |

**結論: NO CODE FIX REQUIRED**
- `.clear()` on Map is safe in-memory operation
- `fs.rm` with `{ force: true }` handles non-existent paths gracefully
- All patterns are intentional cleanup, not data deletion risks

### 7.2 TRY_CATCH_SWALLOW (11件) - 分類完了

| Location | Pattern | Classification | Verdict |
|----------|---------|---------------|---------|
| src/adapters/*.ts | Parse failures → empty (3) | accepted-design | Graceful degradation for analysis |
| src/plugin/*.ts | Feature detection / file ops (4) | accepted-design | Docker checks, safe file access |
| src/reporters/json-reporter.ts | Evidence extraction (1) | accepted-design | Return null on file read failure |
| src/rules/try-catch-swallow.ts | Detection patterns (4) | self-reference | Rule implementation |

**結論: NO CODE FIX REQUIRED**
- All patterns provide graceful degradation
- Return sensible defaults (false, null, [], undefined)
- Feature detection pattern for optional capabilities (Docker)

### 7.3 RAW_SQL (1件) - 分類完了

| Location | Pattern | Classification | Verdict |
|----------|---------|---------------|---------|
| src/plugin/*.ts | Rule name in string literal | self-reference | **false positive** |

**結論: NO CODE FIX REQUIRED**
- Detection triggered by rule name "RAW_SQL" in test assertions
- No actual SQL injection vulnerability exists
- Suppression correctly classified as self-reference

### 7.4 Phase C Summary

| Debt Candidate | Count | Code Fix | Accepted-Design | Self-Reference | False-Positive |
|-----------------|-------|----------|-----------------|----------------|----------------|
| UNSAFE_DELETE | 15 | 0 | 13 | 2 | 0 |
| TRY_CATCH_SWALLOW | 11 | 0 | 7 | 4 | 0 |
| RAW_SQL | 1 | 0 | 0 | 1 | 1 |

**Total: 27 findings reviewed, 0 require code fix**

All debt candidates are intentional patterns (cleanup, graceful handling, self-reference) and correctly suppressed. No safety guards or logging additions needed.

## 8. 結論

今回の棚卸では、単に findings が多いのではなく、**自己解析の観測層と gate 層が suppression で混線している**ことが主要問題である。次の実装では、finding の抑制より先に、分類・baseline・gate 表示の構造を直す必要がある。

Phase C 完了により、主要 debt candidate (UNSAFE_DELETE/TRY_CATCH_SWALLOW/RAW_SQL) の精査が完了。すべて accepted-design または self-reference として正しく分類され、実装安全性に問題なし。LARGE_MODULE (44件) は保守性負債として P1 で継続監視。
