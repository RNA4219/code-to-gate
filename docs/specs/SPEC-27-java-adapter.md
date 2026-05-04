# SPEC-27: Java tree-sitter Adapter

**Version**: v1.0
**Created**: 2026-05-04
**Status**: draft
**Priority**: P3
**Estimated Time**: 2 weeks

---

## 1. Purpose

Add Java language support via tree-sitter for import, class, method, and test extraction.

---

## 2. Scope

### Included
- Java tree-sitter WASM loading
- Import extraction (import statements)
- Class extraction (class, interface, enum)
- Method extraction (public/private/static)
- Annotation parsing (@Override, @Test, etc.)
- Spring framework detection

### Excluded
- Full Java AST analysis
- Java-specific rules (future)
- Maven/Gradle dependency extraction

---

## 3. Current State

**Status**: No Java support

**Current Languages**: TS/JS/Python/Ruby/Go/Rust

**Need**: Java is widely used in enterprise.

---

## 4. Proposed Implementation

### Tree-sitter WASM

```typescript
// src/adapters/java-tree-sitter-adapter.ts
import Parser from "web-tree-sitter";

let JavaLanguage: Parser.Language | null = null;

async function initJavaTreeSitter(): Promise<boolean> {
  try {
    // Load Java WASM
    const wasmPath = require.resolve("tree-sitter-java/tree-sitter-java.wasm");
    const wasmBuffer = fs.readFileSync(wasmPath);
    JavaLanguage = await Parser.Language.load(wasmBuffer);
    return true;
  } catch (error) {
    console.warn("Java tree-sitter WASM load failed:", error.message);
    return false;
  }
}
```

### Java Adapter

```typescript
// src/adapters/java-tree-sitter-adapter.ts
export class JavaTreeSitterAdapter implements LanguageAdapter {
  readonly language = "java";
  readonly type = "tree-sitter";

  async parse(content: string, filePath: string): Promise<AdapterResult> {
    if (!JavaLanguage) {
      // Fallback to regex
      return this.regexFallback(content, filePath);
    }

    const parser = new Parser();
    parser.setLanguage(JavaLanguage);
    const tree = parser.parse(content);

    const symbols: SymbolNode[] = [];
    const relations: GraphRelation[] = [];

    // Extract imports
    this.extractImports(tree.rootNode, content, filePath, symbols, relations);

    // Extract classes
    this.extractClasses(tree.rootNode, content, filePath, symbols, relations);

    // Extract methods
    this.extractMethods(tree.rootNode, content, filePath, symbols, relations);

    return {
      symbols,
      relations,
      completeness: "full",
    };
  }

  private extractImports(
    node: Parser.SyntaxNode,
    content: string,
    filePath: string,
    symbols: SymbolNode[],
    relations: GraphRelation[]
  ): void {
    const importNodes = this.findNodesByType(node, "import_declaration");

    for (const importNode of importNodes) {
      const importText = importNode.text;
      // import com.example.Class;
      const match = importText.match(/import\s+(?:static\s+)?(.+?);/);
      if (match) {
        const importPath = match[1];
        symbols.push({
          id: `import:${filePath}:${importPath}`,
          kind: "import",
          name: importPath.split(".").pop() || importPath,
          file: filePath,
          location: { startLine: importNode.startPosition.row + 1, endLine: importNode.endPosition.row + 1 },
        });
      }
    }
  }

  private extractClasses(
    node: Parser.SyntaxNode,
    content: string,
    filePath: string,
    symbols: SymbolNode[],
    relations: GraphRelation[]
  ): void {
    const classNodes = this.findNodesByType(node, "class_declaration");
    const interfaceNodes = this.findNodesByType(node, "interface_declaration");
    const enumNodes = this.findNodesByType(node, "enum_declaration");

    for (const classNode of [...classNodes, ...interfaceNodes, ...enumNodes]) {
      const nameNode = classNode.childForFieldName("name");
      if (!nameNode) continue;

      const className = nameNode.text;
      const kind = classNode.type === "interface_declaration" ? "interface" :
                   classNode.type === "enum_declaration" ? "enum" : "class";

      // Extract annotations
      const annotations = this.extractAnnotations(classNode);

      symbols.push({
        id: `class:${filePath}:${className}`,
        kind,
        name: className,
        file: filePath,
        location: { startLine: classNode.startPosition.row + 1, endLine: classNode.endPosition.row + 1 },
        annotations,
      });
    }
  }

  private extractMethods(
    node: Parser.SyntaxNode,
    content: string,
    filePath: string,
    symbols: SymbolNode[],
    relations: GraphRelation[]
  ): void {
    const methodNodes = this.findNodesByType(node, "method_declaration");

    for (const methodNode of methodNodes) {
      const nameNode = methodNode.childForFieldName("name");
      if (!nameNode) continue;

      const methodName = nameNode.text;

      // Extract annotations
      const annotations = this.extractAnnotations(methodNode);
      const isTest = annotations.includes("Test");

      symbols.push({
        id: `method:${filePath}:${methodName}`,
        kind: isTest ? "test" : "method",
        name: methodName,
        file: filePath,
        location: { startLine: methodNode.startPosition.row + 1, endLine: methodNode.endPosition.row + 1 },
        annotations,
      });
    }
  }

  private extractAnnotations(node: Parser.SyntaxNode): string[] {
    const annotations: string[] = [];
    const annotationNodes = this.findNodesByType(node, "annotation");

    for (const annotNode of annotationNodes) {
      const text = annotNode.text;
      const match = text.match(/@(\w+)/);
      if (match) {
        annotations.push(match[1]);
      }
    }

    return annotations;
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

  private regexFallback(content: string, filePath: string): AdapterResult {
    // Basic regex fallback for Java
    const symbols: SymbolNode[] = [];
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Import
      const importMatch = line.match(/import\s+(?:static\s+)?(.+?);/);
      if (importMatch) {
        symbols.push({
          id: `import:${filePath}:${importMatch[1]}`,
          kind: "import",
          name: importMatch[1].split(".").pop() || importMatch[1],
          file: filePath,
          location: { startLine: i + 1, endLine: i + 1 },
        });
      }

      // Class
      const classMatch = line.match(/(?:public|private|protected)?\s*(?:class|interface|enum)\s+(\w+)/);
      if (classMatch) {
        symbols.push({
          id: `class:${filePath}:${classMatch[1]}`,
          kind: classMatch[0].includes("interface") ? "interface" :
                classMatch[0].includes("enum") ? "enum" : "class",
          name: classMatch[1],
          file: filePath,
          location: { startLine: i + 1, endLine: i + 1 },
        });
      }
    }

    return {
      symbols,
      relations: [],
      completeness: "partial",
      diagnostic: "Java tree-sitter unavailable, using regex fallback",
    };
  }
}
```

---

## 5. Technical Design

### Files to Create/Modify

| File | Action | Purpose |
|---|---|---|
| `src/adapters/java-tree-sitter-adapter.ts` | Create | Adapter implementation |
| `src/adapters/index.ts` | Modify | Register adapter |
| `src/__tests__/java-tree-sitter-adapter.test.ts` | Create | Tests |
| `fixtures/demo-java/` | Create | Test fixtures |
| `package.json` | Modify | Add tree-sitter-java dependency |

---

## 6. Dependencies

| Dependency | Type | Status |
|---|---|:---:|
| tree-sitter-java | npm | New |
| web-tree-sitter | Existing | Active |
| WASM resolver | Existing | Active |

---

## 7. Acceptance Criteria

| Criterion | Measurable | Verification |
|---|---|---|
| Import extraction works | Java imports extracted | Automated |
| Class extraction works | Classes, interfaces, enums extracted | Automated |
| Method extraction works | Methods with annotations extracted | Automated |
| Test detection works | @Test annotated methods identified | Automated |
| Regex fallback works | Fallback when WASM unavailable | Automated |

---

## 8. Test Plan

### Java Adapter Tests
```typescript
describe("java-tree-sitter-adapter", () => {
  it("should extract imports", async () => {
    const javaCode = `
      import java.util.List;
      import static org.junit.Assert.*;
    `;
    const result = await adapter.parse(javaCode, "Test.java");
    expect(result.symbols.some(s => s.name === "List")).toBe(true);
  });

  it("should extract classes", async () => {
    const javaCode = `
      public class UserService {
      }
      interface UserRepository {
      }
    `;
    const result = await adapter.parse(javaCode, "Test.java");
    expect(result.symbols.filter(s => s.kind === "class").length).toBe(1);
    expect(result.symbols.filter(s => s.kind === "interface").length).toBe(1);
  });

  it("should detect @Test methods", async () => {
    const javaCode = `
      @Test
      public void testMethod() {
      }
    `;
    const result = await adapter.parse(javaCode, "Test.java");
    expect(result.symbols.some(s => s.kind === "test")).toBe(true);
  });
});
```

---

## 9. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|:---:|:---:|---|
| WASM compatibility issues | High | Medium | Regex fallback |
| Spring framework complexity | Medium | Low | Annotation detection |
| Inner classes handling | Low | Low | Nested extraction |

---

## 10. References

| Reference | Path |
|---|---|
| Python tree-sitter | `src/adapters/py-tree-sitter-adapter.ts` |
| WASM resolver | `src/adapters/tree-sitter-wasm-resolver.ts` |
| tree-sitter-java | https://github.com/tree-sitter/tree-sitter-java |