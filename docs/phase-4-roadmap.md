# Phase 4+ Roadmap

**作成日**: 2026-05-03
**更新日**: 2026-05-03
**位置づけ**: v1.2.0 Phase 4 完了後の状態反映

---

## 1. Phase 4 完了状態

| 項目 | Priority | 状態 | 証跡 |
|---|:---:|:---:|---|
| Dataflow-lite | P1 | ✓ 完了 | `src/core/dataflow-lite.ts`, 14 tests |
| Type inference tracking | P1 | ✓ 完了 | `src/adapters/ts-adapter.ts` typeInfo, 8 tests |
| Python tree-sitter | P1 | Phase 5 deferred | web-tree-sitter API complexity |
| Ruby/Go/Rust tree-sitter | P2 | Phase 5 deferred | regex fallback維持 |

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

## 5. Python tree-sitter (Phase 5 deferred)

**理由**: web-tree-sitter API complexity

- Parser.init() API不一致
- WASM loading complexity
- 現状regex adapter十分機能

**Phase 5再評価条件**:
- regex adapter精度問題発生
- OSS利用者からの要望
- tree-sitter API安定化

---

## 6. Phase 5+ 将来項目

| 項目 | 状態 | 実装アプローチ |
|---|---|---|
| Python tree-sitter | Phase 5 | web-tree-sitter WASM binding |
| Ruby/Go/Rust tree-sitter | Phase 5 | regex fallback維持、必要時導入 |
| Dataflow-full | Phase 5+ | 完全dataflow解析（lite版拡張） |

---

## 7. Gate Criteria

Phase 4完了判定: ✅ PASS

| 項目 | Gate条件 | 状態 |
|---|---|:---:|
| Dataflow-lite | module + tests | ✓ pass |
| Type inference | ts-morph API + tests | ✓ pass |
| Test coverage | 20+ tests | ✓ 22 tests |

---

## 8. Conclusion

**v1.2.0完了**: Phase 4実装完了

- Dataflow-lite: ✓ 完了 (14 tests)
- Type inference: ✓ 完了 (8 tests)
- Python tree-sitter: Phase 5 deferred

**Gate status**: go, v1.2.0 release ready