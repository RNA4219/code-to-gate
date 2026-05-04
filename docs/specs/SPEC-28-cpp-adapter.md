# SPEC-28: C/C++ tree-sitter Adapter

**Version**: v1.0
**Created**: 2026-05-04
**Status**: draft
**Priority**: P3
**Estimated Time**: 2 weeks

---

## 1. Purpose

Add C/C++ language support via tree-sitter for include, function, struct, and class extraction.

---

## 2. Scope

### Included
- C tree-sitter WASM loading
- C++ tree-sitter WASM loading
- Include extraction (#include)
- Function extraction
- Struct/class extraction
- Header/source file handling

### Excluded
- Preprocessor macro analysis
- Template specialization
- CMake/Makefile integration

---

## 3. Current State

**Status**: No C/C++ support

**Current Languages**: TS/JS/Python/Ruby/Go/Rust/Java (planned)

**Need**: C/C++ still widely used, especially in embedded/systems.

---

## 4. Proposed Implementation

### Tree-sitter WASM

```typescript
// src/adapters/cpp-tree-sitter-adapter.ts
import Parser from "web-tree-sitter";

let CLanguage: Parser.Language | null = null;
let CppLanguage: Parser.Language | null = null;

async function initCppTreeSitter(): Promise<{ c: boolean; cpp: boolean }> {
  const results = { c: false, cpp: false };

  try {
    // Load C WASM
    const cWasmPath = require.resolve("tree-sitter-c/tree-sitter-c.wasm");
    const cWasmBuffer = fs.readFileSync(cWasmPath);
    CLanguage = await Parser.Language.load(cWasmBuffer);
    results.c = true;
  } catch (error) {
    console.warn("C tree-sitter WASM load failed:", error.message);
  }

  try {
    // Load C++ WASM
    const cppWasmPath = require.resolve("tree-sitter-cpp/tree-sitter-cpp.wasm");
    const cppWasmBuffer = fs.readFileSync(cppWasmPath);
    CppLanguage = await Parser.Language.load(cppWasmBuffer);
    results.cpp = true;
  } catch (error) {
    console.warn("C++ tree-sitter WASM load failed:", error.message);
  }

  return results;
}
```

### C/C++ Adapter

```typescript
// src/adapters/cpp-tree-sitter-adapter.ts
export class CppTreeSitterAdapter implements LanguageAdapter {
  readonly language = "cpp";
  readonly type = "tree-sitter";

  async parse(content: string, filePath: string): Promise<AdapterResult> {
    // Detect C vs C++
    const isCpp = filePath.endsWith(".cpp") || filePath.endsWith(".cc") || 
                  filePath.endsWith(".cxx") || filePath.endsWith(".hpp");

    const language = isCpp ? CppLanguage : CLanguage;
    if (!language) {
      return this.regexFallback(content, filePath);
    }

    const parser = new Parser();
    parser.setLanguage(language);
    const tree = parser.parse(content);

    const symbols: SymbolNode[] = [];
    const relations: GraphRelation[] = [];

    // Extract includes
    this.extractIncludes(tree.rootNode, content, filePath, symbols, relations);

    // Extract functions
    this.extractFunctions(tree.rootNode, content, filePath, symbols, relations);

    // Extract structs/classes
    if (isCpp) {
      this.extractCppClasses(tree.rootNode, content, filePath, symbols, relations);
    } else {
      this.extractCStructs(tree.rootNode, content, filePath, symbols, relations);
    }

    return {
      symbols,
      relations,
      completeness: "full",
    };
  }

  private extractIncludes(
    node: Parser.SyntaxNode,
    content: string,
    filePath: string,
    symbols: SymbolNode[],
    relations: GraphRelation[]
  ): void {
    const includeNodes = this.findNodesByType(node, "preproc_include");

    for (const includeNode of includeNodes) {
      const includeText = includeNode.text;
      // #include <stdio.h> or #include "header.h"
      const match = includeText.match(/#include\s*[<"]([^>"]+)[>"]/);
      if (match) {
        const includePath = match[1];
        symbols.push({
          id: `include:${filePath}:${includePath}`,
          kind: "import",
          name: includePath,
          file: filePath,
          location: { startLine: includeNode.startPosition.row + 1, endLine: includeNode.endPosition.row + 1 },
        });
      }
    }
  }

  private extractFunctions(
    node: Parser.SyntaxNode,
    content: string,
    filePath: string,
    symbols: SymbolNode[],
    relations: GraphRelation[]
  ): void {
    const functionNodes = this.findNodesByType(node, "function_definition");

    for (const funcNode of functionNodes) {
      const declaratorNode = funcNode.childForFieldName("declarator");
      if (!declaratorNode) continue;

      // Extract function name from declarator
      const nameNode = this.findIdentifierNode(declaratorNode);
      if (!nameNode) continue;

      const funcName = nameNode.text;

      symbols.push({
        id: `function:${filePath}:${funcName}`,
        kind: "function",
        name: funcName,
        file: filePath,
        location: { startLine: funcNode.startPosition.row + 1, endLine: funcNode.endPosition.row + 1 },
      });
    }
  }

  private extractCStructs(
    node: Parser.SyntaxNode,
    content: string,
    filePath: string,
    symbols: SymbolNode[],
    relations: GraphRelation[]
  ): void {
    const structNodes = this.findNodesByType(node, "struct_specifier");

    for (const structNode of structNodes) {
      const nameNode = structNode.childForFieldName("name");
      if (!nameNode) continue;

      const structName = nameNode.text;

      symbols.push({
        id: `struct:${filePath}:${structName}`,
        kind: "struct",
        name: structName,
        file: filePath,
        location: { startLine: structNode.startPosition.row + 1, endLine: structNode.endPosition.row + 1 },
      });
    }
  }

  private extractCppClasses(
    node: Parser.SyntaxNode,
    content: string,
    filePath: string,
    symbols: SymbolNode[],
    relations: GraphRelation[]
  ): void {
    const classNodes = this.findNodesByType(node, "class_specifier");
    const structNodes = this.findNodesByType(node, "struct_specifier");

    for (const classNode of [...classNodes, ...structNodes]) {
      const nameNode = classNode.childForFieldName("name");
      if (!nameNode) continue;

      const className = nameNode.text;
      const kind = classNode.type === "class_specifier" ? "class" : "struct";

      symbols.push({
        id: `${kind}:${filePath}:${className}`,
        kind,
        name: className,
        file: filePath,
        location: { startLine: classNode.startPosition.row + 1, endLine: classNode.endPosition.row + 1 },
      });
    }
  }

  private findNodesByType(node: Parser.SyntaxNode, type: string): Parser.SyntaxNode[] {
    const results: Parser.SyntaxNode[] = [];
    for (const child of node.children) {
      if (child.type === type) {
        results.push(child);
      }
      results.push(...this.findNodesByType(child, type));
    }
    return results;
  }

  private findIdentifierNode(node: Parser.SyntaxNode): Parser.SyntaxNode | null {
    for (const child of node.children) {
      if (child.type === "identifier") {
        return child;
      }
      const found = this.findIdentifierNode(child);
      if (found) return found;
    }
    return null;
  }

  private regexFallback(content: string, filePath: string): AdapterResult {
    const symbols: SymbolNode[] = [];
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Include
      const includeMatch = line.match(/#include\s*[<"]([^>"]+)[>"]/);
      if (includeMatch) {
        symbols.push({
          id: `include:${filePath}:${includeMatch[1]}`,
          kind: "import",
          name: includeMatch[1],
          file: filePath,
          location: { startLine: i + 1, endLine: i + 1 },
        });
      }

      // Function (simple pattern)
      const funcMatch = line.match(/(?:void|int|char|float|double|auto|class)\s+(\w+)\s*\(/);
      if (funcMatch) {
        symbols.push({
          id: `function:${filePath}:${funcMatch[1]}`,
          kind: "function",
          name: funcMatch[1],
          file: filePath,
          location: { startLine: i + 1, endLine: i + 1 },
        });
      }

      // Struct/class
      const structMatch = line.match(/(?:struct|class)\s+(\w+)/);
      if (structMatch) {
        symbols.push({
          id: `struct:${filePath}:${structMatch[1]}`,
          kind: line.includes("class") ? "class" : "struct",
          name: structMatch[1],
          file: filePath,
          location: { startLine: i + 1, endLine: i + 1 },
        });
      }
    }

    return {
      symbols,
      relations: [],
      completeness: "partial",
      diagnostic: "C/C++ tree-sitter unavailable, using regex fallback",
    };
  }
}
```

---

## 5. Technical Design

### Files to Create/Modify

| File | Action | Purpose |
|---|---|---|
| `src/adapters/cpp-tree-sitter-adapter.ts` | Create | Adapter implementation |
| `src/adapters/index.ts` | Modify | Register adapter |
| `src/__tests__/cpp-tree-sitter-adapter.test.ts` | Create | Tests |
| `fixtures/demo-c/` | Create | C test fixtures |
| `fixtures/demo-cpp/` | Create | C++ test fixtures |
| `package.json` | Modify | Add tree-sitter-c, tree-sitter-cpp |

---

## 6. Dependencies

| Dependency | Type | Status |
|---|---|:---:|
| tree-sitter-c | npm | New |
| tree-sitter-cpp | npm | New |
| web-tree-sitter | Existing | Active |
| WASM resolver | Existing | Active |

---

## 7. Acceptance Criteria

| Criterion | Measurable | Verification |
|---|---|---|
| Include extraction works | C/C++ includes extracted | Automated |
| Function extraction works | Functions extracted | Automated |
| Struct/class extraction works | Structs and classes extracted | Automated |
| C vs C++ detection | Correct language used | Automated |
| Regex fallback works | Fallback when WASM unavailable | Automated |

---

## 8. Test Plan

### C/C++ Adapter Tests
```typescript
describe("cpp-tree-sitter-adapter", () => {
  it("should extract C includes", async () => {
    const cCode = `
      #include <stdio.h>
      #include "myheader.h"
    `;
    const result = await adapter.parse(cCode, "test.c");
    expect(result.symbols.some(s => s.name === "stdio.h")).toBe(true);
    expect(result.symbols.some(s => s.name === "myheader.h")).toBe(true);
  });

  it("should extract C functions", async () => {
    const cCode = `
      int main(int argc, char** argv) {
      }
      void helper(void) {
      }
    `;
    const result = await adapter.parse(cCode, "test.c");
    expect(result.symbols.filter(s => s.kind === "function").length).toBe(2);
  });

  it("should extract C++ classes", async () => {
    const cppCode = `
      class MyClass {
      public:
        void method();
      };
    `;
    const result = await adapter.parse(cppCode, "test.cpp");
    expect(result.symbols.some(s => s.kind === "class" && s.name === "MyClass")).toBe(true);
  });

  it("should extract C structs", async () => {
    const cCode = `
      struct Point {
        int x;
        int y;
      };
    `;
    const result = await adapter.parse(cCode, "test.c");
    expect(result.symbols.some(s => s.kind === "struct" && s.name === "Point")).toBe(true);
  });
});
```

---

## 9. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|:---:|:---:|---|
| WASM compatibility issues | High | Medium | Regex fallback |
| Header file handling | Medium | Low | Separate header processing |
| Complex C++ features | Medium | Low | Focus on core patterns |

---

## 10. References

| Reference | Path |
|---|---|
| Python tree-sitter | `src/adapters/py-tree-sitter-adapter.ts` |
| WASM resolver | `src/adapters/tree-sitter-wasm-resolver.ts` |
| tree-sitter-c | https://github.com/tree-sitter/tree-sitter-c |
| tree-sitter-cpp | https://github.com/tree-sitter/tree-sitter-cpp |