# Phase 4+ Roadmap

**作成日**: 2026-05-03
**更新日**: 2026-05-03
**位置づけ**: Phase 5 tree-sitter完了後の状態反映

---

## 1. Phase 4+5 完了状態

| 項目 | Priority | 状態 | 証跡 |
|---|:---:|:---:|---|
| Dataflow-lite | P1 | ✓ 完了 | `src/core/dataflow-lite.ts`, 14 tests |
| Type inference tracking | P1 | ✓ 完了 | `src/adapters/ts-adapter.ts` typeInfo, 8 tests |
| Python tree-sitter | P1 | ✓ 完了 | `py-tree-sitter-adapter.ts`, 13 tests |
| Ruby tree-sitter | P2 | ✓ 完了 | `rb-tree-sitter-adapter.ts`, 14 tests |
| Go tree-sitter | P2 | ✓ 完了 | `go-tree-sitter-adapter.ts`, 14 tests |
| Rust tree-sitter | P2 | ✓ 完了 | `rs-tree-sitter-adapter.ts`, 19 tests |

---

## 2. Call Graph Extraction (完了)

**状態**: ✅ 完了 (Phase 3以前)

全adapterで `kind: "calls"` relation実装済み。

| Adapter | 状態 | 証跡 |
|---|:---:|---|
| TypeScript | ✓ | `ts-adapter.ts` lines 153-164, 208-218 |
| JavaScript | ✓ | `js-ast-handlers.ts` line 453 |
| Python | ✓ | `py-parser-functions.ts` line 140 |
| Ruby | ✓ | `rb-adapter.ts` line 291 |

---

## 3. Dataflow-lite (完了)

**状態**: ✅ 完了 (Phase 4)

### 3.1 実装機能

| Function | Purpose |
|---|---|
| extractAssignDataflow | 変数代入追跡 |
| extractParamDataflow | 関数引数フロー |
| extractReturnDataflow | 戻り値フロー |
| trackCallToReturn | Call→Return追跡 |
| trackDataflowChain | Source→Sinkチェーン追跡 |
| isClientTrustedSource | Client-side判定 |
| flowsToPayment | Payment flow判定 |
| buildDataflowGraph | 完全DataflowGraph構築 |

### 3.2 用途

- CLIENT_TRUSTED_PRICE 検出精度向上
- Raw SQL 検出精度向上
- Blast radius 推定精度向上

---

## 4. Type Inference Tracking (完了)

**状態**: ✅ 完了 (Phase 4)

### 4.1 実装機能

| Function | Purpose |
|---|---|
| extractTypeInformation | Function returnType + parameterTypes |
| extractMethodTypeInformation | Method returnType + parameterTypes |
| extractClassImplements | Class implements interface追跡 |

### 4.2 SymbolNode typeInfo

```typescript
interface SymbolNode {
  // ...existing fields...
  typeInfo?: {
    returnType?: string;
    parameterTypes?: Array<{ name: string; type: string }>;
    inferredType?: string;
    implements?: string[];
  };
}
```

---

## 5. Python/Ruby/Go/Rust tree-sitter (完了)

**状態**: ✅ 完了 (Phase 5)

詳細: [docs/phase-5-tree-sitter-implementation.md](phase-5-tree-sitter-implementation.md)

### 5.1 実装概要

| Adapter | Tests | WASM | Notes |
|---|:---:|:---:|---|
| Python | 13 | ✓ | import/function/class/async |
| Ruby | 14 | ✓ | require/method/class/module |
| Go | 14 | ✓ | import/function/struct/interface |
| Rust | 19 | ✓ | use/function/struct/enum/trait/async |

### 5.2 技術解決

- ESM import: `module.Parser` / `module.Language` 分離取得
- AST traversal: `node.children` 直接イテレート
- WASM loading: npm package + fallback

---

## 6. Phase 6+ 将来項目

| 項目 | 状態 | 実装アプローチ |
|---|---|---|
| repo-graph-builder統合 | ✓完了 | tree-sitter adapter自動選択 |
| CLI --tree-sitter接続 | ✓完了 | 言語判定ロジック |
| Dataflow-full | Phase 6 | 完全dataflow解析（lite版拡張） |
| Java/C/C++ adapter | Phase 6+ | tree-sitter WASM |

---

## 7. Gate Criteria

Phase 4+5完了判定: ✅ PASS

| 項目 | Gate条件 | 状態 |
|---|---|:---:|
| Dataflow-lite | module + tests | ✓ pass |
| Type inference | ts-morph API + tests | ✓ pass |
| Python tree-sitter | 10+ tests | ✓ 13 tests |
| Ruby tree-sitter | 10+ tests | ✓ 14 tests |
| Go tree-sitter | 10+ tests | ✓ 14 tests |
| Rust tree-sitter | 15+ tests | ✓ 19 tests |

---

## 8. Conclusion

**Phase 4+5完了**: 

- Dataflow-lite: ✓ 完了 (14 tests)
- Type inference: ✓ 完了 (8 tests)
- Python/Ruby/Go/Rust tree-sitter: ✓ 完了 (60 tests)

**Gate status**: go, Phase 5 tree-sitter complete