# AST Parser Library Evaluation

**作成日**: 2026-05-03
**対象**: code-to-gate Phase 1 prep (SN-04)
**現在状態**: TypeScript/JavaScript AST parsing実装済み

---

## 1. 現在実装状況

| Language | Library | Version | Status | Notes |
|----------|---------|---------|--------|-------|
| TypeScript | ts-morph | 25.0.1 | ✅ 完了 | TypeScript compiler API wrapper |
| JavaScript | acorn | 8.14.1 | ✅ 完了 | ECMA AST parser |
| Python | regex-based | - | ✅ 完了 | py-adapter.ts分割実装、tree-sitter Phase 4+ |
| Ruby | regex-based | - | ✅ 完了 | Phase 4+でtree-sitter検討 |
| Go | regex-based | - | ⚠️ Text fallback | Phase 4+予定 |
| Rust | regex-based | - | ⚠️ Text fallback | Phase 4+予定 |
| Java | regex-based | - | ⚠️ Text fallback | Phase 4+予定 |
| PHP | regex-based | - | ⚠️ Text fallback | Phase 4+予定 |

---

## 2. Library Evaluation

### 2.1 TypeScript: ts-morph

**選択理由**: TypeScript compiler APIの高品質wrapper

#### Pros

| 項目 | 評価 |
|------|------|
| TypeScript完全対応 | ★★★★★ TypeScript構文100%対応 |
| 型情報アクセス | ★★★★★ 型チェック、型推論可能 |
| 構文エラー検出 | ★★★★★ diagnostic取得 |
| Symbol抽出精度 | ★★★★★ import/export/function/class/interface/type抽出 |
| Call graph生成 | ★★★★★ CallExpression追跡 |
| Line evidence | ★★★★★ getStartLineNumber/getEndLineNumber |
| 依存関係 | ★★★☆☆ TypeScript依存（OSSで許容） |
| 性能 | ★★★☆☆ compiler API overheadあり |

#### Cons

| 項目 | 詳細 |
|------|------|
| 依存サイズ | TypeScript + ts-morph ≈ 30MB |
| 初期化コスト | Project初期化に時間 |
| メモリ使用 | 大規模repoでmemory消費 |
| JS-only対応 | JavaScriptファイルもTSとして解析（許容） |

#### 実装評価

```typescript
// ts-adapter.ts 実装品質
✅ import/export抽出: 完備（named/default/re-export）
✅ function抽出: 完備（async/exported/name）
✅ class抽出: 完備（methods/extends/exported）
✅ interface/type抽出: 完備
✅ variable抽出: 完備（arrow function判定）
✅ call expression追跡: 完備（getDescendantsOfKind）
✅ syntax error検出: 完備（SYNTAX_ERROR_CODES）
✅ evidence生成: 完備（line range/hash）
```

### 2.2 JavaScript: Acorn

**選択理由**: 軽量・高速・ECMAScript完全対応

#### Pros

| 項目 | 評価 |
|------|------|
| ECMAScript対応 | ★★★★★ latest対応 |
| モジュール対応 | ★★★★★ ESM/CJS両対応 |
| 軽量 | ★★★★★ ~1MB |
| 高速 | ★★★★★ 正規表現ベースparserより高速 |
| 依存関係 | ★★★★★ zero-dependency |
| locations | ★★★★★ line/column取得 |

#### Cons

| 項目 | 詳細 |
|------|------|
| 型情報なし | TypeScript型解析不可（JS-only） |
| 構文エラー | 限定的（syntax error recovery弱） |
| TS構文 | TypeScript独自構文不可（decorator等） |

#### 実装評価

```typescript
// js-adapter.ts 実装品質
✅ import/export抽出: 完備（ESM/CJS）
✅ function抽出: 完備（arrow/function declaration）
✅ class抽出: 完備（methods）
✅ variable抽出: 完備
✅ call expression追跡: walkNodeでAST walk
⚠️ syntax error recovery: parse失敗時text fallback
```

### 2.3 Alternatives Considered

#### Babel (@babel/parser)

| 項目 | 評価 |
|------|------|
| TypeScript対応 | ★★★★☆ @babel/parser + TypeScript plugin |
| プラグイン性 | ★★★★★ 拡張性高い |
| 構文エラー | ★★★★★ error recovery強 |
| 依存関係 | ★★☆☆☆ @babel/core + plugins で重い |

**判定**: ts-morphが既に実装済み、移行メリットなし

#### tree-sitter

| 項目 | 評価 |
|------|------|
| 多言語対応 | ★★★★★ 40+ languages bindings |
| エラー回復 | ★★★★★ 構文エラーでもpartial parse |
| 高速 | ★★★★★ incremental parsing |
| Native binding | ★★☆☆☆ WASM/binary compile必要 |
| Node.js binding | ★★★☆☆ node-tree-sitter存在 |

**判定**: Python/Ruby/Go/Rustで採用（Phase 3）

---

## 3. Performance Comparison

### 3.1 Benchmark Setup

```bash
# Test fixture: demo-shop-ts (100 files)
node ./dist/cli.js scan fixtures/demo-shop-ts --out .qh-bench
```

### 3.2 Results (estimated)

| Parser | 100 files | 500 files | 1000 files | Memory |
|--------|-----------|-----------|------------|--------|
| ts-morph | ~2s | ~10s | ~20s | ~200MB |
| acorn | ~0.5s | ~2s | ~5s | ~50MB |
| regex fallback | ~0.1s | ~0.5s | ~1s | ~10MB |

**判定**: ts-morph overhead許容範囲（100 files < 30s acceptance）

---

## 4. Recommendation

### 4.1 TypeScript/JavaScript

| 現状 | 推奨 | 理由 |
|------|------|------|
| ts-morph | **維持** | 高品質実装済み、移行コスト無意味 |
| acorn | **維持** | 軽量高速、JS-onlyで十分 |

**移行判定**: ❌ 不要

### 4.2 Python/Ruby/Go/Rust

| 現状 | 推奨 | Phase |
|------|------|-------|
| regex fallback | **tree-sitter導入** | Phase 3 |
| - | **tree-sitter-python** | Phase 3 |
| - | **tree-sitter-ruby** | Phase 3 |
| - | **tree-sitter-go** | Phase 3 |
| - | **tree-sitter-rust** | Phase 3 |

**判定**: Phase 3でtree-sitter導入

---

## 5. Implementation Plan

### 5.1 Immediate (完了)

- ✅ ts-morph実装完了
- ✅ acorn実装完了
- ✅ adapter test suite存在

### 5.2 Phase 3 完了 (2026-05-02)

| 項目 | 状態 | 証跡 |
|---|:---:|---|
| Python adapter (regex) | ✓ 完了 | `src/adapters/py-adapter.ts` 分割実装 |
| py-parser-imports.ts | ✓ 完了 | import extraction |
| py-parser-classes.ts | ✓ 完了 | class/method extraction |
| py-parser-functions.ts | ✓ 完了 | function extraction |
| py-parser-entrypoints.ts | ✓ 完了 | __main__ + Flask/FastAPI detection |
| Ruby adapter (regex) | ✓ 完了 | `src/adapters/rb-adapter.ts` |

### 5.3 Phase 4+ 将来対応

1. **Python tree-sitter導入** (Phase 4+)
   ```bash
   npm install web-tree-sitter
   ```
   - 詳細: `docs/python-adapter-tree-sitter-evaluation.md`
   - 現状: regex-basedでOSS利用十分
   
2. **Ruby/Go/Rust tree-sitter** (Phase 4+)
   - 現状: regex fallbackで基本的なimport/function/class抽出可能
   - 将来: tree-sitter導入で精度向上

### 5.3 Optional

- **Babel評価**: TypeScript decorator等独自構文必要時
- **SWC評価**: Rust-based超高速parser（native binding必要）

---

## 6. Conclusion

**SN-04完了判定**: ✅ DONE (Phase 3完了)

- TypeScript/JavaScript AST parser実装済み（ts-morph/acorn）
- Python/Ruby regex adapter実装済み（Phase 3完了）
- Go/Rust/Java/PHP regex fallback許容（Phase 4+で改善検討）
- 移行コスト判定: 現状維持が最適解

**Phase 3 Gate status**: go, tree-sitter導入はPhase 4+将来対応

---

## Appendix A: Call Graph Extraction Status

**実装状態**: ✅ 完了 (全adapter)

| Adapter | Call Graph | 実装箇所 |
|---------|:---:|---|
| ts-adapter.ts | ✓ | `getDescendantsOfKind(SyntaxKind.CallExpression)` lines 153-164, 208-218 |
| js-ast-handlers.ts | ✓ | CallExpression walker line 453 |
| py-parser-functions.ts | ✓ | regex-based call detection line 140 |
| rb-adapter.ts | ✓ | regex-based call detection line 291 |

**GraphRelation kind**: `"calls"` (confidence: 0.7)

---

## Appendix B: Phase 4+ Future Items

| 項目 | 状態 | 実装アプローチ |
|---|---|---|
| Python tree-sitter | Phase 4+ | web-tree-sitter WASM binding |
| Ruby/Go/Rust tree-sitter | Phase 4+ | regex fallback維持、必要時導入 |
| Dataflow-lite | Phase 4+ | 新module `src/core/dataflow-lite.ts` |
| Type inference | Phase 4+ | ts-morph `getType()` API活用 |

---

## Appendix C: Adapter Test Coverage

| Adapter | Tests | Coverage |
|---------|-------|----------|
| ts-adapter.test.ts | 15+ | import/export/function/class |
| js-adapter.test.ts | 12+ | ESM/CJS/function/class |
| py-adapter.test.ts | 8+ | import/function/class |
| rb-adapter.test.ts | 6+ | import/function/class |
| regex-language-adapter.test.ts | 10+ | generic fallback |

**Test Status**: ✅ 全adapter test存在