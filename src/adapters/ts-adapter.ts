import { Project, SourceFile, SyntaxKind, Node } from "ts-morph";
import path from "node:path";
import { sha256, toPosix } from "../core/path-utils.js";
import type { EvidenceRef, SymbolNode, GraphRelation } from "../types/graph.js";

export type { EvidenceRef, SymbolNode, GraphRelation };

export interface ParseResult {
  symbols: SymbolNode[];
  relations: GraphRelation[];
  diagnostics: Array<{
    id: string;
    severity: "info" | "warning" | "error";
    code: string;
    message: string;
    evidence?: EvidenceRef[];
  }>;
  parserStatus: "parsed" | "text_fallback" | "skipped" | "failed";
  parserAdapter: string;
}

function getSymbolKind(
  node: Node,
  name: string,
  filePath: string
): SymbolNode["kind"] {
  // Check if it's a test file
  if (
    filePath.includes("/tests/") ||
    filePath.includes(".test.") ||
    filePath.includes(".spec.")
  ) {
    return "test";
  }

  // Check if name suggests a route
  if (
    name.toLowerCase().includes("route") ||
    name.toLowerCase().includes("handler") ||
    name.toLowerCase().includes("controller")
  ) {
    return "route";
  }

  // Determine by node kind
  if (Node.isFunctionDeclaration(node) || Node.isArrowFunction(node)) {
    return "function";
  }

  if (Node.isClassDeclaration(node)) {
    return "class";
  }

  if (Node.isMethodDeclaration(node)) {
    return "method";
  }

  if (Node.isInterfaceDeclaration(node)) {
    return "interface";
  }

  if (Node.isTypeAliasDeclaration(node)) {
    return "type";
  }

  if (Node.isVariableDeclaration(node)) {
    // Check if variable is a function
    const initializer = node.getInitializer();
    if (initializer && Node.isArrowFunction(initializer)) {
      return "function";
    }
    return "variable";
  }

  return "unknown";
}

function createEvidence(
  id: string,
  filePath: string,
  startLine: number,
  endLine: number,
  nodeId?: string,
  symbolId?: string
): EvidenceRef {
  const excerptHash = sha256(`${filePath}:${startLine}-${endLine}`);
  return {
    id,
    path: filePath,
    startLine,
    endLine,
    kind: "ast",
    excerptHash,
    nodeId,
    symbolId,
  };
}

export function parseTypeScriptFile(
  filePath: string,
  repoRoot: string,
  fileId: string
): ParseResult {
  const symbols: SymbolNode[] = [];
  const relations: GraphRelation[] = [];
  const diagnostics: ParseResult["diagnostics"] = [];

  const relPath = toPosix(path.relative(repoRoot, filePath));

  try {
    const project = new Project({
      // Use actual file system, not in-memory
      skipFileDependencyResolution: true,
      skipAddingFilesFromTsConfig: true,
    });

    const sourceFile = project.addSourceFileAtPath(filePath);

    // Check for syntax errors (only actual parsing errors, not type errors)
    const preEmitDiagnostics = sourceFile.getPreEmitDiagnostics();
    // Syntax error codes: 1003, 1005, 1009, 1109, 1110, 1128, 1134, etc.
    const syntaxErrorCodes = [1003, 1005, 1009, 1109, 1110, 1128, 1134, 1131, 1135, 1136, 1137, 1138, 1139, 1140];
    const syntaxErrors = preEmitDiagnostics.filter(d => syntaxErrorCodes.includes(d.getCode()));

    if (syntaxErrors.length > 0) {
      for (const diag of syntaxErrors) {
        const message = diag.getMessageText().toString();
        const line = diag.getLineNumber() || 1;
        diagnostics.push({
          id: `diag:${relPath}:syntax-error:${line}`,
          severity: "error",
          code: "PARSER_FAILED",
          message: `Syntax error: ${message}`,
          evidence: [
            createEvidence(
              `ev-syntax-error-${sha256(`${relPath}:${line}`).slice(0, 8)}`,
              relPath,
              line,
              line
            ),
          ],
        });
      }

      return {
        symbols,
        relations,
        diagnostics,
        parserStatus: "failed",
        parserAdapter: "ts-morph-v0",
      };
    }

    // Extract imports
    const importDeclarations = sourceFile.getImportDeclarations();
    let importIndex = 0;
    for (const importDecl of importDeclarations) {
      importIndex++;
      const moduleSpecifier = importDecl.getModuleSpecifierValue();
      const startLine = importDecl.getStartLineNumber();
      const endLine = importDecl.getEndLineNumber();

      relations.push({
        id: `relation:${relPath}:import:${importIndex}`,
        from: fileId,
        to: moduleSpecifier,
        kind: "imports",
        confidence: 1.0,
        evidence: [
          createEvidence(
            `ev-import-${sha256(`${relPath}:${importIndex}`).slice(0, 8)}`,
            relPath,
            startLine,
            endLine
          ),
        ],
      });

      // Extract imported symbols
      const namedImports = importDecl.getNamedImports();
      for (const namedImport of namedImports) {
        const importName = namedImport.getName();
        const importStartLine = namedImport.getStartLineNumber();
        const importEndLine = namedImport.getEndLineNumber();

        // Note: These are references to external symbols, not local definitions
        relations.push({
          id: `relation:${relPath}:import-symbol:${importName}:${importIndex}`,
          from: fileId,
          to: `symbol:${moduleSpecifier}:${importName}`,
          kind: "references",
          confidence: 0.9,
          evidence: [
            createEvidence(
              `ev-import-symbol-${sha256(`${relPath}:${importName}`).slice(0, 8)}`,
              relPath,
              importStartLine,
              importEndLine
            ),
          ],
        });
      }

      // Default import
      const defaultImport = importDecl.getDefaultImport();
      if (defaultImport) {
        const importName = defaultImport.getText();
        relations.push({
          id: `relation:${relPath}:import-default:${importIndex}`,
          from: fileId,
          to: `symbol:${moduleSpecifier}:default`,
          kind: "references",
          confidence: 0.9,
          evidence: [
            createEvidence(
              `ev-import-default-${sha256(`${relPath}:${importIndex}`).slice(0, 8)}`,
              relPath,
              defaultImport.getStartLineNumber(),
              defaultImport.getEndLineNumber()
            ),
          ],
        });
      }
    }

    // Extract export declarations
    const exportDeclarations = sourceFile.getExportDeclarations();
    let exportIndex = 0;
    for (const exportDecl of exportDeclarations) {
      exportIndex++;
      const moduleSpecifier = exportDecl.getModuleSpecifierValue();
      if (moduleSpecifier) {
        const startLine = exportDecl.getStartLineNumber();
        const endLine = exportDecl.getEndLineNumber();

        relations.push({
          id: `relation:${relPath}:export-reexport:${exportIndex}`,
          from: fileId,
          to: moduleSpecifier,
          kind: "exports",
          confidence: 1.0,
          evidence: [
            createEvidence(
              `ev-export-${sha256(`${relPath}:${exportIndex}`).slice(0, 8)}`,
              relPath,
              startLine,
              endLine
            ),
          ],
        });
      }
    }

    // Extract function declarations
    const functions = sourceFile.getFunctions();
    for (const func of functions) {
      const name = func.getName();
      if (!name) continue;

      const startLine = func.getStartLineNumber();
      const endLine = func.getEndLineNumber();
      const isExported = func.isExported();
      const isAsync = func.isAsync();
      const symbolId = `symbol:${relPath}:${name}`;
      const symbolKind = getSymbolKind(func, name, relPath);

      symbols.push({
        id: symbolId,
        fileId,
        name,
        kind: symbolKind,
        exported: isExported,
        async: isAsync,
        location: { startLine, endLine },
        evidence: [
          createEvidence(
            `ev-symbol-${sha256(`${relPath}:${name}`).slice(0, 8)}`,
            relPath,
            startLine,
            endLine,
            undefined,
            symbolId
          ),
        ],
      });

      // Find function calls within this function
      const callExpressions = func.getDescendantsOfKind(SyntaxKind.CallExpression);
      let callIndex = 0;
      for (const callExpr of callExpressions) {
        callIndex++;
        const expression = callExpr.getExpression();
        const callName = expression.getText();
        const callLine = callExpr.getStartLineNumber();

        relations.push({
          id: `relation:${relPath}:call:${name}:${callIndex}`,
          from: symbolId,
          to: `symbol:${callName}`, // May resolve to external or local
          kind: "calls",
          confidence: 0.7,
          evidence: [
            createEvidence(
              `ev-call-${sha256(`${relPath}:${name}:${callIndex}`).slice(0, 8)}`,
              relPath,
              callLine,
              callExpr.getEndLineNumber()
            ),
          ],
        });
      }
    }

    // Extract class declarations
    const classes = sourceFile.getClasses();
    for (const cls of classes) {
      const name = cls.getName();
      if (!name) continue;

      const startLine = cls.getStartLineNumber();
      const endLine = cls.getEndLineNumber();
      const isExported = cls.isExported();
      const classSymbolId = `symbol:${relPath}:${name}`;

      symbols.push({
        id: classSymbolId,
        fileId,
        name,
        kind: "class",
        exported: isExported,
        location: { startLine, endLine },
        evidence: [
          createEvidence(
            `ev-symbol-${sha256(`${relPath}:${name}`).slice(0, 8)}`,
            relPath,
            startLine,
            endLine,
            undefined,
            classSymbolId
          ),
        ],
      });

      // Extract methods
      const methods = cls.getMethods();
      for (const method of methods) {
        const methodName = method.getName();
        const methodStartLine = method.getStartLineNumber();
        const methodEndLine = method.getEndLineNumber();
        const methodIsAsync = method.isAsync();
        const methodSymbolId = `symbol:${relPath}:${name}.${methodName}`;

        symbols.push({
          id: methodSymbolId,
          fileId,
          name: methodName,
          kind: "method",
          exported: isExported, // Methods inherit class export status
          async: methodIsAsync,
          location: { startLine: methodStartLine, endLine: methodEndLine },
          evidence: [
            createEvidence(
              `ev-symbol-${sha256(`${relPath}:${name}.${methodName}`).slice(0, 8)}`,
              relPath,
              methodStartLine,
              methodEndLine,
              undefined,
              methodSymbolId
            ),
          ],
        });

        // Find method calls within this method
        const methodCallExpressions = method.getDescendantsOfKind(SyntaxKind.CallExpression);
        let methodCallIndex = 0;
        for (const callExpr of methodCallExpressions) {
          methodCallIndex++;
          const expression = callExpr.getExpression();
          const callName = expression.getText();
          const callLine = callExpr.getStartLineNumber();

          relations.push({
            id: `relation:${relPath}:call:${name}.${methodName}:${methodCallIndex}`,
            from: methodSymbolId,
            to: `symbol:${callName}`,
            kind: "calls",
            confidence: 0.7,
            evidence: [
              createEvidence(
                `ev-call-${sha256(`${relPath}:${name}.${methodName}:${methodCallIndex}`).slice(0, 8)}`,
                relPath,
                callLine,
                callExpr.getEndLineNumber()
              ),
            ],
          });
        }
      }
    }

    // Extract interface declarations
    const interfaces = sourceFile.getInterfaces();
    for (const iface of interfaces) {
      const name = iface.getName();
      const startLine = iface.getStartLineNumber();
      const endLine = iface.getEndLineNumber();
      const isExported = iface.isExported();
      const symbolId = `symbol:${relPath}:${name}`;

      symbols.push({
        id: symbolId,
        fileId,
        name,
        kind: "interface",
        exported: isExported,
        location: { startLine, endLine },
        evidence: [
          createEvidence(
            `ev-symbol-${sha256(`${relPath}:${name}`).slice(0, 8)}`,
            relPath,
            startLine,
            endLine,
            undefined,
            symbolId
          ),
        ],
      });
    }

    // Extract type alias declarations
    const typeAliases = sourceFile.getTypeAliases();
    for (const typeAlias of typeAliases) {
      const name = typeAlias.getName();
      const startLine = typeAlias.getStartLineNumber();
      const endLine = typeAlias.getEndLineNumber();
      const isExported = typeAlias.isExported();
      const symbolId = `symbol:${relPath}:${name}`;

      symbols.push({
        id: symbolId,
        fileId,
        name,
        kind: "type",
        exported: isExported,
        location: { startLine, endLine },
        evidence: [
          createEvidence(
            `ev-symbol-${sha256(`${relPath}:${name}`).slice(0, 8)}`,
            relPath,
            startLine,
            endLine,
            undefined,
            symbolId
          ),
        ],
      });
    }

    // Extract variable declarations (including arrow functions)
    const variableDeclarations = sourceFile.getVariableDeclarations();
    for (const varDecl of variableDeclarations) {
      const name = varDecl.getName();
      const startLine = varDecl.getStartLineNumber();
      const endLine = varDecl.getEndLineNumber();

      // Check if parent is exported
      const parent = varDecl.getParent();
      let isExported = false;
      if (parent && Node.isVariableDeclarationList(parent)) {
        const grandParent = parent.getParent();
        if (grandParent && Node.isVariableStatement(grandParent)) {
          isExported = grandParent.isExported();
        }
      }

      const symbolId = `symbol:${relPath}:${name}`;
      const initializer = varDecl.getInitializer();

      // Check if it's an arrow function
      let isAsync = false;
      let symbolKind: SymbolNode["kind"] = "variable";
      if (initializer) {
        if (Node.isArrowFunction(initializer)) {
          symbolKind = "function";
          isAsync = initializer.isAsync();
        } else if (Node.isFunctionExpression(initializer)) {
          symbolKind = "function";
          isAsync = initializer.isAsync();
        }
      }

      // Skip if symbol already exists (e.g., from function extraction)
      if (!symbols.some((s) => s.id === symbolId)) {
        symbols.push({
          id: symbolId,
          fileId,
          name,
          kind: getSymbolKind(varDecl, name, relPath),
          exported: isExported,
          async: isAsync,
          location: { startLine, endLine },
          evidence: [
            createEvidence(
              `ev-symbol-${sha256(`${relPath}:${name}`).slice(0, 8)}`,
              relPath,
              startLine,
              endLine,
              undefined,
              symbolId
            ),
          ],
        });
      }
    }

    // Extract exports of local symbols
    const exportedDeclarations = sourceFile.getExportedDeclarations();
    for (const [name, declarations] of exportedDeclarations) {
      for (const decl of declarations) {
        if (
          Node.isFunctionDeclaration(decl) ||
          Node.isClassDeclaration(decl) ||
          Node.isInterfaceDeclaration(decl) ||
          Node.isTypeAliasDeclaration(decl) ||
          Node.isVariableDeclaration(decl)
        ) {
          // Already handled above, just add relation for export
          const declStartLine = decl.getStartLineNumber();
          const declEndLine = decl.getEndLineNumber();
          const symbolId = `symbol:${relPath}:${name}`;

          relations.push({
            id: `relation:${relPath}:export-local:${name}`,
            from: fileId,
            to: symbolId,
            kind: "exports",
            confidence: 1.0,
            evidence: [
              createEvidence(
                `ev-export-local-${sha256(`${relPath}:${name}`).slice(0, 8)}`,
                relPath,
                declStartLine,
                declEndLine
              ),
            ],
          });
        }
      }
    }

    return {
      symbols,
      relations,
      diagnostics,
      parserStatus: "parsed",
      parserAdapter: "ts-morph-v0",
    };
  } catch (error) {
    diagnostics.push({
      id: `diag:${relPath}:parse-error`,
      severity: "error",
      code: "PARSER_FAILED",
      message: error instanceof Error ? error.message : String(error),
      evidence: [
        {
          id: `ev-parse-error-${sha256(relPath).slice(0, 8)}`,
          path: relPath,
          kind: "ast",
        },
      ],
    });

    return {
      symbols,
      relations,
      diagnostics,
      parserStatus: "failed",
      parserAdapter: "ts-morph-v0",
    };
  }
}