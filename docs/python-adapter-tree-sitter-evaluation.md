# Python Adapter Tree-sitter Evaluation

**作成日**: 2026-05-03
**更新日**: 2026-05-03
**対象**: Phase 5 - Python tree-sitter 実装完了

---

## 1. 実装完了状態

**状態**: ✅ 完了 (Phase 5)

詳細: [docs/phase-5-tree-sitter-implementation.md](phase-5-tree-sitter-implementation.md)

### 1.1 tree-sitter WASM Adapter

| Module | Purpose | Lines |
|--------|---------|-------|
| py-tree-sitter-adapter.ts | tree-sitter WASM adapter | ~500 |
| tree-sitter-wasm-resolver.ts | WASM path resolver | ~90 |

### 1.2 Capabilities (実装完了)

| Feature | Regex-based | tree-sitter | 状態 |
|---------|-------------|-------------|:---:|
| import X | ✅ Basic | ✅ Accurate | ✓ |
| from X import Y | ✅ Basic | ✅ Accurate | ✓ |
| from X import Y as Z | ✅ Basic | ✅ Accurate | ✓ |
| def name() | ✅ | ✅ | ✓ |
| async def name() | ✅ | ✅ | ✓ |
| class Name | ✅ | ✅ | ✓ |
| class Name(Base) | ✅ | ✅ | ✓ |
| methods | ✅ | ✅ | ✓ |
| decorators | ✅ | ✅ | ✓ |
| syntax error recovery | ⚠️ Limited | ✅ Strong | ✓ |
| partial parse | ❌ No | ✅ Yes | ✓ |
| nested structures | ⚠️ Basic | ✅ Accurate | ✓ |

---

## 2. tree-sitter Options

### 2.1 tree-sitter Node Bindings

```bash
npm install tree-sitter tree-sitter-python
```

**Requirements**:
- Native binary compilation (node-gyp)
- Platform-specific binaries
- Build tools (Python, C compiler)

**Pros**:
| 項目 | 評価 |
|------|------|
| Accuracy | ★★★★★ |
| Error recovery | ★★★★★ |
| Incremental parsing | ★★★★★ |
| Multi-language | ★★★★★ |

**Cons**:
| 項目 | 詳細 |
|------|------|
| Native dependency | Requires build tools |
| Platform complexity | Windows/Linux/macOS differences |
| Package size | ~5MB binaries |
| Maintenance | tree-sitter version updates |

### 2.2 tree-sitter WASM

```bash
npm install web-tree-sitter
```

**Pros**:
- No native compilation
- Platform independent
- Browser/Node compatible

**Cons**:
- WASM initialization overhead
- Slower than native
- Larger bundle size

### 2.3 Python AST Module (via subprocess)

```bash
python -c "import ast; print(ast.dump(open('file.py').read()))"
```

**Pros**:
- Python built-in
- 100% accurate
- No external dependency

**Cons**:
- Requires Python runtime
- Subprocess overhead
- Not Node-native

---

## 3. 実装結果

### 3.1 技術解決

| 問題 | 解決方法 |
|------|----------|
| `Parser.Language` undefined | `module.Parser` / `module.Language` 分離取得 |
| `childForFieldName()` null | `node.children` 直接イテレート |
| WASM loading in Node.js | npm package + `tree-sitter-wasm-resolver.ts` |

### 3.2 実装コード

```typescript
// src/adapters/py-tree-sitter-adapter.ts
const module = await import("web-tree-sitter");
ParserClass = module.Parser;
LanguageClass = module.Language;

await ParserClass.init();
parserInstance = new ParserClass();
const wasmUrl = resolveWasmPath("python");
pythonLanguage = await LanguageClass.load(wasmUrl);
parserInstance.setLanguage(pythonLanguage);
```

### 3.3 WASM Package

```json
{
  "devDependencies": {
    "web-tree-sitter": "^0.22.6",
    "tree-sitter-python": "^0.25.0"
  }
}
```

---

## 4. 統合状況

### 4.1 完了項目

| 項目 | 状態 |
|---|:---:|
| tree-sitter WASM adapter | ✓ |
| テスト (13 tests) | ✓ |
| Regex fallback維持 | ✓ |

### 4.2 未完了項目（負債）

| 項目 | 状態 |
|---|:---:|
| repo-graph-builder統合 | 未 |
| CLI --tree-sitter接続 | 未 |

---

## 5. Test Coverage

### 5.1 tree-sitter Tests

| Test | Coverage |
|------|----------|
| initPythonParser | WASM初期化 |
| import statements | import/from |
| function definitions | def/async |
| class definitions | inheritance |
| syntax errors | error recovery |
| regex fallback | 代替動作 |

---

## 6. Conclusion

**Python Adapter Status**: ✅ tree-sitter WASM 完了

**Phase 5 Action**: 
- ✓ tree-sitter WASM実装完了 (13 tests)
- ✓ Regex fallback維持
- 未 repo-graph-builder統合

---

## 7. tree-sitter Implementation Quality

| Aspect | Rating | Notes |
|--------|--------|-------|
| Import detection | ★★★★★ | AST accurate |
| Function detection | ★★★★★ | def + async def + params |
| Class detection | ★★★★★ | inheritance + methods |
| Method detection | ★★★★★ | Within class body |
| Error handling | ★★★★★ | tree-sitter error recovery |
| Nested structures | ★★★★★ | Full depth support |
| WASM fallback | ★★★★★ | Regex when WASM unavailable |

**Overall**: ★★★★★ (5/5) - Full AST accuracy