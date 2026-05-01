# code-to-gate Technical Debt Checklist

**Generated**: 2026-05-02
**Source**: `code-to-gate analyze . --out .qh-self`
**Total Findings**: 98 | **Critical**: 18 | **High**: 20 | **Medium**: 60

---

## Dashboard

```
Severity Distribution:
┌─────────────┬────────┬──────────────────────────────────────────────────────┐
│ Critical    │ 18     │ ████████████████ FP候補 (CLIENT_TRUSTED_PRICE)      │
│ High        │ 20     │ ████████████████████ UNSAFE_DELETE, RAW_SQL, LARGE   │
│ Medium      │ 60     │ ████████████████████████████████████████████████████ │
│ Low         │ 0      │                                                      │
└─────────────┴────────┴──────────────────────────────────────────────────────┘
```

---

## P0: Critical (False Positive 対応)

### CLIENT_TRUSTED_PRICE (18件) - FP候補

ルール実装コード自体が「client-trusted price」パターンを記述しているため自己検出。

- [ ] `suppressions.yaml` に CLIENT_TRUSTED_PRICE 自己除外追加
- [ ] または analyze 実行時 `--suppress-self` オプション実装

**Affected Files**:
- `src/cli.js`
- `src/rules/client-trusted-price.ts`
- `src/rules/env-direct-access.ts`
- `src/rules/raw-sql.ts`
- `src/rules/unsafe-delete.ts`
- `src/rules/weak-auth-guard.ts`

---

## P1: High (即座対応)

### LARGE_MODULE-062: py-adapter.ts (1295行)

- [ ] `src/adapters/py-adapter.ts` を3-4モジュールに分割
  - parser-core.ts (AST parsing)
  - python-syntax.ts (Python specific patterns)
  - import-resolver.ts (import/export handling)
  - adapter-main.ts (public interface)

### RAW_SQL-041: plugin-context.ts

- [ ] `src/plugin/plugin-context.ts` の SQL 文字列構築確認
- [ ] パラメータ化または ORM 使用への変更検討

### UNSAFE_DELETE (14件)

- [ ] `src/cache/cache-manager.ts` - rmSync recursive force 確認
- [ ] `src/cache/file-cache.ts` - 副作用範囲確認
- [ ] `src/cache/findings-cache.ts` - 副作用範囲確認
- [ ] `src/cli/plugin-sandbox.ts` - sandbox cleanup 安全性
- [ ] `src/parallel/file-processor.ts` - temp 削除確認
- [ ] `src/plugin/docker-sandbox.ts` - container cleanup 確認
- [ ] `src/plugin/plugin-context.ts` - context 削除確認
- [ ] `src/plugin/plugin-runner.ts` - runner cleanup 確認
- [ ] `src/reporters/json-reporter.ts` - 出力削除確認
- [ ] `src/rules/raw-sql.ts` - テスト用削除確認
- [ ] `src/rules/unsafe-delete.ts` - テスト用削除確認

### UNTESTED_CRITICAL_PATH (4件)

- [ ] `src/cli.js` - main entrypoint テスト追加
- [ ] `src/evaluation/fn-evaluator.ts` - evaluator テスト追加
- [ ] `src/rules/index.ts` - registry テスト追加
- [ ] `src/rules/untested-critical-path.ts` - rule self-test

---

## P2: Medium (順次対応)

### LARGE_MODULE (37件) - 500行 threshold 超過

**Top Priority (>800行)**:
- [ ] `src/cli.js` (840行) - CLI commands 分離
- [ ] `src/parallel/file-processor.ts` (921行) - worker 分離
- [ ] `src/historical/comparison.ts` (857行) - comparison logic 分離
- [ ] `src/evidence/bundle-builder.ts` (866行) - builder 分離
- [ ] `src/plugin/docker-sandbox.ts` (790行) - docker 操作分離

**Medium Priority (600-800行)**:
- [ ] `src/adapters/js-adapter.ts` (589行)
- [ ] `src/cache/cache-manager.ts` (658行)
- [ ] `src/cli/export.ts` (520行)
- [ ] `src/cli/import.ts` (536行)
- [ ] `src/evaluation/fn-evaluator.ts` (538行)
- [ ] `src/historical/baseline.ts` (大)
- [ ] `src/plugin/plugin-context.ts` (501行)
- [ ] `src/plugin/plugin-loader.ts` (510行)
- [ ] `src/plugin/plugin-runner.ts` (617行)
- [ ] `src/plugin/plugin-schema.ts` (749行)
- [ ] `src/reporters/html-reporter.ts` (773行)
- [ ] `src/viewer/finding-viewer.ts` (601行)
- [ ] `src/viewer/graph-viewer.ts` (603行)
- [ ] `src/viewer/report-viewer.ts` (679行)
- [ ] `src/viewer/styles.ts` (800行)

### TRY_CATCH_SWALLOW (19件)

- [ ] `src/core/config-utils.ts` - エラー log 追加
- [ ] `src/historical/baseline.ts` (7件) - エラー log 追加
- [ ] `src/historical/comparison.ts` (4件) - エラー log 追加
- [ ] `src/llm/providers/llamacpp-provider.ts` - エラー log 追加
- [ ] `src/plugin/plugin-context.ts` - エラー log 追加
- [ ] `src/reporters/json-reporter.ts` - エラー log 追加
- [ ] `src/rules/try-catch-swallow.ts` (4件) - テスト用、確認のみ

### ENV_DIRECT_ACCESS (4件)

- [ ] `src/github/api-client.ts` - GITHUB_TOKEN 検証追加
- [ ] `src/github/api-client.ts` - GITHUB_APP_ID 検証追加
- [ ] `src/github/api-client.ts` - GITHUB_APP_KEY 検証追加
- [ ] `src/github/api-client.ts` - GITHUB_APP_INSTALLATION_ID 検証追加

---

## Summary Table

| Category | Total | P0 | P1 | P2 | Notes |
|----------|-------|----|----|-----|-------|
| CLIENT_TRUSTED_PRICE | 18 | 18 | - | - | FP候補、suppression必要 |
| UNSAFE_DELETE | 14 | - | 14 | - | 安全性確認必要 |
| LARGE_MODULE | 38 | - | 1 | 37 | py-adapter.ts最優先 |
| TRY_CATCH_SWALLOW | 19 | - | - | 19 | log追加順次 |
| UNTESTED_CRITICAL_PATH | 4 | - | 4 | - | テスト追加 |
| RAW_SQL | 1 | - | 1 | - | 内容確認 |
| ENV_DIRECT_ACCESS | 4 | - | - | 4 | 検証追加 |

---

## Progress Tracking

| Date | Action | Status |
|------|--------|--------|
| 2026-05-02 | 初回解析、CHECKLIST作成 | Done |
| | CLIENT_TRUSTED_PRICE suppression | Pending |
| | py-adapter.ts分割 | Pending |
| | UNSAFE_DELETE確認 | Pending |

---

## Evidence Location

- `.qh-self/findings.json`
- `.qh-self/risk-register.yaml`
- `.qh-self/analysis-report.md`
- `.qh-self/release-readiness.json`
- `.qh-self/audit.json`