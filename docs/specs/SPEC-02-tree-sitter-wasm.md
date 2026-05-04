# SPEC-02: tree-sitter WASM Compatibility

**Version**: v1.0
**Created**: 2026-05-04
**Status**: draft
**Priority**: P2
**Estimated Time**: 30 minutes

---

## 1. Purpose

Fix tree-sitter WASM initialization failures for Go/Rust/Ruby adapters caused by language version incompatibility.

---

## 2. Scope

### Included
- Go tree-sitter adapter WASM loading
- Rust tree-sitter adapter WASM loading
- Ruby tree-sitter adapter WASM loading
- WASM version compatibility resolution

### Excluded
- Python tree-sitter (working)
- TypeScript/JavaScript adapters (using ts-morph)
- Regex fallback mechanism (keep as backup)

---

## 3. Current State

**Status**: WASM init failures for Go/Rust/Ruby

**Error Message**:
```
Go tree-sitter WASM init failed: Incompatible language version 0. 
Compatibility range 13 through 15.
```

**Root Cause**: tree-sitter WASM bundle version mismatch
- Current WASM: language version 0 (too old)
- Required: compatibility range 13-15 (web-tree-sitter 0.26.x)

**Current Behavior**: Regex fallback is used, AST parsing disabled.

---

## 4. Proposed Implementation

### Option A: Upgrade web-tree-sitter (Recommended)

```bash
npm install web-tree-sitter@latest
```

Check if latest version includes compatible WASM.

### Option B: Rebuild WASM from source

```bash
# Install tree-sitter CLI
npm install -g tree-sitter-cli

# Build WASM for each language
tree-sitter build-wasm node_modules/tree-sitter-go
tree-sitter build-wasm node_modules/tree-sitter-rust
tree-sitter build-wasm node_modules/tree-sitter-ruby
```

### Option C: Update WASM resolver to handle version check

Modify `src/adapters/tree-sitter-wasm-resolver.ts`:
- Add version compatibility check before loading
- Graceful fallback to regex if incompatible
- Log warning with upgrade instructions

---

## 5. Technical Design

### Files to Modify

| File | Changes |
|---|---|
| `package.json` | Update web-tree-sitter version if Option A |
| `src/adapters/go-tree-sitter-adapter.ts` | Add version check |
| `src/adapters/rs-tree-sitter-adapter.ts` | Add version check |
| `src/adapters/rb-tree-sitter-adapter.ts` | Add version check |
| `src/adapters/tree-sitter-wasm-resolver.ts` | Enhanced error handling |

### Implementation Pattern

```typescript
// tree-sitter-wasm-resolver.ts enhancement
async function loadWasmWithVersionCheck(
  languageName: string,
  wasmPath: string,
  minVersion: number,
  maxVersion: number
): Promise<Language | null> {
  try {
    const wasmBuffer = fs.readFileSync(wasmPath);
    const Language = await Parser.Language.load(wasmBuffer);
    
    const version = Language.version || 0;
    if (version < minVersion || version > maxVersion) {
      console.warn(
        `${languageName} tree-sitter WASM version ${version} incompatible. ` +
        `Expected range ${minVersion}-${maxVersion}. Using regex fallback.`
      );
      return null;
    }
    
    return Language;
  } catch (error) {
    console.warn(`${languageName} tree-sitter WASM load failed:`, error.message);
    return null;
  }
}
```

---

## 6. Dependencies

| Dependency | Type | Status |
|---|---|---|
| web-tree-sitter | npm package | Needs update |
| tree-sitter-go | npm package | WASM outdated |
| tree-sitter-rust | npm package | WASM outdated |
| tree-sitter-ruby | npm package | WASM outdated |

---

## 7. Acceptance Criteria

| Criterion | Measurable | Verification |
|---|---|---|
| No WASM init errors | Smoke tests show no WASM errors | Automated |
| Go adapter uses tree-sitter | `go-tree-sitter-adapter.test.ts` passes | Automated |
| Rust adapter uses tree-sitter | `rs-tree-sitter-adapter.test.ts` passes | Automated |
| Ruby adapter uses tree-sitter | `rb-tree-sitter-adapter.test.ts` passes | Automated |

---

## 8. Test Plan

### Test Command
```bash
npm run test:smoke 2>&1 | grep -i "tree-sitter WASM"
# Expected: No "init failed" messages
```

### Adapter Tests
```bash
npm test src/adapters/__tests__/go-tree-sitter-adapter.test.ts
npm test src/adapters/__tests__/rs-tree-sitter-adapter.test.ts
npm test src/adapters/__tests__/rb-tree-sitter-adapter.test.ts
```

---

## 9. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|:---:|:---:|---|
| Upstream packages not updated | High | Medium | Use Option C (version check) |
| WASM rebuild fails | Medium | Medium | Keep regex fallback |
| Breaking other adapters | Low | High | Run full test suite |

---

## 10. References

| Reference | Path |
|---|---|
| WASM resolver | `src/adapters/tree-sitter-wasm-resolver.ts` |
| Go adapter | `src/adapters/go-tree-sitter-adapter.ts` |
| Rust adapter | `src/adapters/rs-tree-sitter-adapter.ts` |
| Ruby adapter | `src/adapters/rb-tree-sitter-adapter.ts` |
| Further improvements spec | `docs/further-improvements-spec.md` |