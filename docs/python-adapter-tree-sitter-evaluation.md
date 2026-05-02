# Python Adapter Tree-sitter Evaluation

**作成日**: 2026-05-03
**対象**: Phase 3 - Python adapter tree-sitter implementation

---

## 1. Current State

### 1.1 Regex-based Implementation

| Module | Purpose | Lines |
|--------|---------|-------|
| py-adapter.ts | Orchestrator | ~150 |
| py-parser-imports.ts | Import parsing | ~80 |
| py-parser-classes.ts | Class/method parsing | ~100 |
| py-parser-functions.ts | Function parsing | ~80 |
| py-parser-variables.ts | Variable parsing | ~60 |
| py-parser-entrypoints.ts | Entrypoint detection | ~80 |

**Total**: ~470 lines of regex-based parsing

### 1.2 Capabilities

| Feature | Regex-based | tree-sitter |
|---------|-------------|-------------|
| import X | ✅ Basic | ✅ Accurate |
| from X import Y | ✅ Basic | ✅ Accurate |
| from X import Y as Z | ✅ Basic | ✅ Accurate |
| def name() | ✅ | ✅ |
| async def name() | ✅ | ✅ |
| class Name | ✅ | ✅ |
| class Name(Base) | ✅ | ✅ |
| methods | ✅ | ✅ |
| decorators | ✅ | ✅ |
| syntax error recovery | ⚠️ Limited | ✅ Strong |
| partial parse | ❌ No | ✅ Yes |
| nested structures | ⚠️ Basic | ✅ Accurate |

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

## 3. Recommendation

### 3.1 Short-term (Phase 3)

**Keep regex-based parser with improvements**:
- Error recovery enhancement
- Better nested structure handling
- More comprehensive test coverage

**Reason**: 
- Native dependencies add complexity
- Regex parser works for 90% of cases
- OSS users may lack build tools

### 3.2 Long-term (Phase 4+)

**Integrate tree-sitter WASM**:
- No native compilation
- Platform independent
- Accurate parsing

**Implementation**:
```typescript
// src/adapters/py-tree-sitter-adapter.ts
import { Parser } from "web-tree-sitter";

export async function parsePythonTreeSitter(content: string): ParseResult {
  const parser = new Parser();
  await Parser.init();
  parser.setLanguage(await Parser.Language.load("python.wasm"));
  
  const tree = parser.parse(content);
  // Extract symbols/relations from tree
}
```

---

## 4. Implementation Plan

### 4.1 Phase 3 Regex Improvements

1. **Error recovery**: Better handling of syntax errors
2. **Decorator parsing**: Full decorator chain extraction
3. **Type hints**: `def func(x: int) -> str` parsing
4. **Async comprehensions**: `async for`, `async with`
5. **Match statements**: Python 3.10 pattern matching

### 4.2 tree-sitter Integration (Optional)

If tree-sitter is required:

```bash
# 1. Add dependency
npm install web-tree-sitter

# 2. Download WASM grammar
wget https://tree-sitter.github.io/tree-sitter/wasm/python.wasm

# 3. Implement adapter
# src/adapters/py-wasm-adapter.ts
```

---

## 5. Test Coverage

### 5.1 Current Tests

| Test | Coverage |
|------|----------|
| py-adapter.test.ts | Import/function/class |
| demo-python fixture | Real Python files |

### 5.2 Additional Tests Needed

- Decorator chains
- Type hints
- Async features
- Syntax error recovery
- Nested classes/functions

---

## 6. Conclusion

**Python Adapter Status**: ✅ FUNCTIONAL (regex-based)

**Phase 3 Action**: 
- Improve regex parser (error recovery, type hints)
- NOT implement tree-sitter (complexity > benefit)

**Phase 4+ Option**: tree-sitter WASM for full accuracy

---

## 7. Current Implementation Quality

| Aspect | Rating | Notes |
|--------|--------|-------|
| Import detection | ★★★★☆ | Handles most patterns |
| Function detection | ★★★★☆ | def + async def |
| Class detection | ★★★★☆ | With inheritance |
| Method detection | ★★★★☆ | Within classes |
| Entrypoint detection | ★★★★☆ | __main__ + Flask/FastAPI |
| Error handling | ★★★☆☆ | Basic syntax balance |
| Nested structures | ★★★☆☆ | Limited depth |

**Overall**: ★★★★☆ (4/5) - Good for OSS use