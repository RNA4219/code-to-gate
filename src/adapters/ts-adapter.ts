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

// Syntax error codes for detection
const SYNTAX_ERROR_CODES = [1003, 1005, 1009, 1109, 1110, 1128, 1134, 1131, 1135, 1136, 1137, 1138, 1139, 1140];

// Type inference extraction (Phase 4)
import type { FunctionDeclaration, MethodDeclaration, ClassDeclaration } from "ts-morph";

function extractTypeInformation(func: FunctionDeclaration): SymbolNode["typeInfo"] {
  try {
    const returnType = func.getReturnType();
    const parameters = func.getParameters();

    return {
      returnType: returnType?.getText() || undefined,
      parameterTypes: parameters.map(p => ({
        name: p.getName(),
        type: p.getType().getText(),
      })),
    };
  } catch {
    return undefined;
  }
}

function extractMethodTypeInformation(method: MethodDeclaration): SymbolNode["typeInfo"] {
  try {
    const returnType = method.getReturnType();
    const parameters = method.getParameters();

    return {
      returnType: returnType?.getText() || undefined,
      parameterTypes: parameters.map(p => ({
        name: p.getName(),
        type: p.getType().getText(),
      })),
    };
  } catch {
    return undefined;
  }
}

function extractClassImplements(cls: ClassDeclaration): string[] {
  try {
    const implementsExpr = cls.getImplements();
    return implementsExpr.map(i => i.getText());
  } catch {
    return [];
  }
}

function getSymbolKind(node: Node, name: string, filePath: string): SymbolNode["kind"] {
  if (filePath.includes("/tests/") || filePath.includes(".test.") || filePath.includes(".spec.")) {
    return "test";
  }

  if (name.toLowerCase().includes("route") || name.toLowerCase().includes("handler") || name.toLowerCase().includes("controller")) {
    return "route";
  }

  if (Node.isFunctionDeclaration(node) || Node.isArrowFunction(node)) return "function";
  if (Node.isClassDeclaration(node)) return "class";
  if (Node.isMethodDeclaration(node)) return "method";
  if (Node.isInterfaceDeclaration(node)) return "interface";
  if (Node.isTypeAliasDeclaration(node)) return "type";
  if (Node.isVariableDeclaration(node)) {
    const initializer = node.getInitializer();
    if (initializer && Node.isArrowFunction(initializer)) return "function";
    return "variable";
  }

  return "unknown";
}

function createEvidence(id: string, filePath: string, startLine: number, endLine: number, nodeId?: string, symbolId?: string): EvidenceRef {
  return {
    id,
    path: filePath,
    startLine,
    endLine,
    kind: "ast",
    excerptHash: sha256(`${filePath}:${startLine}-${endLine}`),
    nodeId,
    symbolId,
  };
}

function extractImports(sourceFile: SourceFile, fileId: string, relPath: string): GraphRelation[] {
  const relations: GraphRelation[] = [];
  const importDeclarations = sourceFile.getImportDeclarations();

  for (let i = 0; i < importDeclarations.length; i++) {
    const importDecl = importDeclarations[i];
    const moduleSpecifier = importDecl.getModuleSpecifierValue();
    const startLine = importDecl.getStartLineNumber();
    const endLine = importDecl.getEndLineNumber();

    relations.push({
      id: `relation:${relPath}:import:${i + 1}`,
      from: fileId,
      to: moduleSpecifier,
      kind: "imports",
      confidence: 1.0,
      evidence: [createEvidence(`ev-import-${sha256(`${relPath}:${i + 1}`).slice(0, 8)}`, relPath, startLine, endLine)],
    });

    for (const namedImport of importDecl.getNamedImports()) {
      const importName = namedImport.getName();
      relations.push({
        id: `relation:${relPath}:import-symbol:${importName}:${i + 1}`,
        from: fileId,
        to: `symbol:${moduleSpecifier}:${importName}`,
        kind: "references",
        confidence: 0.9,
        evidence: [createEvidence(`ev-import-symbol-${sha256(`${relPath}:${importName}`).slice(0, 8)}`, relPath, namedImport.getStartLineNumber(), namedImport.getEndLineNumber())],
      });
    }

    const defaultImport = importDecl.getDefaultImport();
    if (defaultImport) {
      relations.push({
        id: `relation:${relPath}:import-default:${i + 1}`,
        from: fileId,
        to: `symbol:${moduleSpecifier}:default`,
        kind: "references",
        confidence: 0.9,
        evidence: [createEvidence(`ev-import-default-${sha256(`${relPath}:${i + 1}`).slice(0, 8)}`, relPath, defaultImport.getStartLineNumber(), defaultImport.getEndLineNumber())],
      });
    }
  }

  return relations;
}

function extractExports(sourceFile: SourceFile, fileId: string, relPath: string): GraphRelation[] {
  const relations: GraphRelation[] = [];
  const exportDeclarations = sourceFile.getExportDeclarations();

  for (let i = 0; i < exportDeclarations.length; i++) {
    const exportDecl = exportDeclarations[i];
    const moduleSpecifier = exportDecl.getModuleSpecifierValue();
    if (moduleSpecifier) {
      relations.push({
        id: `relation:${relPath}:export-reexport:${i + 1}`,
        from: fileId,
        to: moduleSpecifier,
        kind: "exports",
        confidence: 1.0,
        evidence: [createEvidence(`ev-export-${sha256(`${relPath}:${i + 1}`).slice(0, 8)}`, relPath, exportDecl.getStartLineNumber(), exportDecl.getEndLineNumber())],
      });
    }
  }

  return relations;
}

function extractFunctions(sourceFile: SourceFile, fileId: string, relPath: string): { symbols: SymbolNode[]; relations: GraphRelation[] } {
  const symbols: SymbolNode[] = [];
  const relations: GraphRelation[] = [];

  for (const func of sourceFile.getFunctions()) {
    const name = func.getName();
    if (!name) continue;

    const startLine = func.getStartLineNumber();
    const endLine = func.getEndLineNumber();
    const symbolId = `symbol:${relPath}:${name}`;

    // Extract type information (Phase 4)
    const typeInfo = extractTypeInformation(func);

    symbols.push({
      id: symbolId,
      fileId,
      name,
      kind: getSymbolKind(func, name, relPath),
      exported: func.isExported(),
      async: func.isAsync(),
      location: { startLine, endLine },
      evidence: [createEvidence(`ev-symbol-${sha256(`${relPath}:${name}`).slice(0, 8)}`, relPath, startLine, endLine, undefined, symbolId)],
      typeInfo,
    });

    const callExpressions = func.getDescendantsOfKind(SyntaxKind.CallExpression);
    for (let j = 0; j < callExpressions.length; j++) {
      const callExpr = callExpressions[j];
      relations.push({
        id: `relation:${relPath}:call:${name}:${j + 1}`,
        from: symbolId,
        to: `symbol:${callExpr.getExpression().getText()}`,
        kind: "calls",
        confidence: 0.7,
        evidence: [createEvidence(`ev-call-${sha256(`${relPath}:${name}:${j + 1}`).slice(0, 8)}`, relPath, callExpr.getStartLineNumber(), callExpr.getEndLineNumber())],
      });
    }
  }

  return { symbols, relations };
}

function extractClasses(sourceFile: SourceFile, fileId: string, relPath: string): { symbols: SymbolNode[]; relations: GraphRelation[] } {
  const symbols: SymbolNode[] = [];
  const relations: GraphRelation[] = [];

  for (const cls of sourceFile.getClasses()) {
    const name = cls.getName();
    if (!name) continue;

    const startLine = cls.getStartLineNumber();
    const endLine = cls.getEndLineNumber();
    const isExported = cls.isExported();
    const classSymbolId = `symbol:${relPath}:${name}`;

    // Extract implements (Phase 4)
    const implementsList = extractClassImplements(cls);

    symbols.push({
      id: classSymbolId,
      fileId,
      name,
      kind: "class",
      exported: isExported,
      location: { startLine, endLine },
      evidence: [createEvidence(`ev-symbol-${sha256(`${relPath}:${name}`).slice(0, 8)}`, relPath, startLine, endLine, undefined, classSymbolId)],
      typeInfo: implementsList.length > 0 ? { implements: implementsList } : undefined,
    });

    for (const method of cls.getMethods()) {
      const methodName = method.getName();
      const methodSymbolId = `symbol:${relPath}:${name}.${methodName}`;

      // Extract method type information (Phase 4)
      const methodTypeInfo = extractMethodTypeInformation(method);

      symbols.push({
        id: methodSymbolId,
        fileId,
        name: methodName,
        kind: "method",
        exported: isExported,
        async: method.isAsync(),
        location: { startLine: method.getStartLineNumber(), endLine: method.getEndLineNumber() },
        evidence: [createEvidence(`ev-symbol-${sha256(`${relPath}:${name}.${methodName}`).slice(0, 8)}`, relPath, method.getStartLineNumber(), method.getEndLineNumber(), undefined, methodSymbolId)],
        typeInfo: methodTypeInfo,
      });

      const methodCalls = method.getDescendantsOfKind(SyntaxKind.CallExpression);
      for (let k = 0; k < methodCalls.length; k++) {
        const callExpr = methodCalls[k];
        relations.push({
          id: `relation:${relPath}:call:${name}.${methodName}:${k + 1}`,
          from: methodSymbolId,
          to: `symbol:${callExpr.getExpression().getText()}`,
          kind: "calls",
          confidence: 0.7,
          evidence: [createEvidence(`ev-call-${sha256(`${relPath}:${name}.${methodName}:${k + 1}`).slice(0, 8)}`, relPath, callExpr.getStartLineNumber(), callExpr.getEndLineNumber())],
        });
      }
    }
  }

  return { symbols, relations };
}

function extractInterfaces(sourceFile: SourceFile, fileId: string, relPath: string): SymbolNode[] {
  const symbols: SymbolNode[] = [];

  for (const iface of sourceFile.getInterfaces()) {
    const name = iface.getName();
    const symbolId = `symbol:${relPath}:${name}`;

    symbols.push({
      id: symbolId,
      fileId,
      name,
      kind: "interface",
      exported: iface.isExported(),
      location: { startLine: iface.getStartLineNumber(), endLine: iface.getEndLineNumber() },
      evidence: [createEvidence(`ev-symbol-${sha256(`${relPath}:${name}`).slice(0, 8)}`, relPath, iface.getStartLineNumber(), iface.getEndLineNumber(), undefined, symbolId)],
    });
  }

  return symbols;
}

function extractTypeAliases(sourceFile: SourceFile, fileId: string, relPath: string): SymbolNode[] {
  const symbols: SymbolNode[] = [];

  for (const typeAlias of sourceFile.getTypeAliases()) {
    const name = typeAlias.getName();
    const symbolId = `symbol:${relPath}:${name}`;

    symbols.push({
      id: symbolId,
      fileId,
      name,
      kind: "type",
      exported: typeAlias.isExported(),
      location: { startLine: typeAlias.getStartLineNumber(), endLine: typeAlias.getEndLineNumber() },
      evidence: [createEvidence(`ev-symbol-${sha256(`${relPath}:${name}`).slice(0, 8)}`, relPath, typeAlias.getStartLineNumber(), typeAlias.getEndLineNumber(), undefined, symbolId)],
    });
  }

  return symbols;
}

function extractVariables(sourceFile: SourceFile, fileId: string, relPath: string, existingSymbolIds: Set<string>): SymbolNode[] {
  const symbols: SymbolNode[] = [];

  for (const varDecl of sourceFile.getVariableDeclarations()) {
    const name = varDecl.getName();
    const symbolId = `symbol:${relPath}:${name}`;

    if (existingSymbolIds.has(symbolId)) continue;

    const parent = varDecl.getParent();
    let isExported = false;
    if (parent && Node.isVariableDeclarationList(parent)) {
      const grandParent = parent.getParent();
      if (grandParent && Node.isVariableStatement(grandParent)) {
        isExported = grandParent.isExported();
      }
    }

    const initializer = varDecl.getInitializer();
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

    symbols.push({
      id: symbolId,
      fileId,
      name,
      kind: getSymbolKind(varDecl, name, relPath),
      exported: isExported,
      async: isAsync,
      location: { startLine: varDecl.getStartLineNumber(), endLine: varDecl.getEndLineNumber() },
      evidence: [createEvidence(`ev-symbol-${sha256(`${relPath}:${name}`).slice(0, 8)}`, relPath, varDecl.getStartLineNumber(), varDecl.getEndLineNumber(), undefined, symbolId)],
    });
  }

  return symbols;
}

function extractExportedDeclarations(sourceFile: SourceFile, fileId: string, relPath: string): GraphRelation[] {
  const relations: GraphRelation[] = [];
  const exportedDeclarations = sourceFile.getExportedDeclarations();

  for (const [name, declarations] of exportedDeclarations) {
    for (const decl of declarations) {
      if (Node.isFunctionDeclaration(decl) || Node.isClassDeclaration(decl) || Node.isInterfaceDeclaration(decl) || Node.isTypeAliasDeclaration(decl) || Node.isVariableDeclaration(decl)) {
        relations.push({
          id: `relation:${relPath}:export-local:${name}`,
          from: fileId,
          to: `symbol:${relPath}:${name}`,
          kind: "exports",
          confidence: 1.0,
          evidence: [createEvidence(`ev-export-local-${sha256(`${relPath}:${name}`).slice(0, 8)}`, relPath, decl.getStartLineNumber(), decl.getEndLineNumber())],
        });
      }
    }
  }

  return relations;
}

export function parseTypeScriptFile(filePath: string, repoRoot: string, fileId: string): ParseResult {
  const symbols: SymbolNode[] = [];
  const relations: GraphRelation[] = [];
  const diagnostics: ParseResult["diagnostics"] = [];
  const relPath = toPosix(path.relative(repoRoot, filePath));

  try {
    const project = new Project({
      skipFileDependencyResolution: true,
      skipAddingFilesFromTsConfig: true,
    });

    const sourceFile = project.addSourceFileAtPath(filePath);
    const syntaxErrors = sourceFile.getPreEmitDiagnostics().filter(d => SYNTAX_ERROR_CODES.includes(d.getCode()));

    if (syntaxErrors.length > 0) {
      for (const diag of syntaxErrors) {
        const line = diag.getLineNumber() || 1;
        diagnostics.push({
          id: `diag:${relPath}:syntax-error:${line}`,
          severity: "error",
          code: "PARSER_FAILED",
          message: `Syntax error: ${diag.getMessageText().toString()}`,
          evidence: [createEvidence(`ev-syntax-error-${sha256(`${relPath}:${line}`).slice(0, 8)}`, relPath, line, line)],
        });
      }
      return { symbols, relations, diagnostics, parserStatus: "failed", parserAdapter: "ts-morph-v0" };
    }

    // Extract all symbols and relations
    relations.push(...extractImports(sourceFile, fileId, relPath));
    relations.push(...extractExports(sourceFile, fileId, relPath));

    const functionsResult = extractFunctions(sourceFile, fileId, relPath);
    symbols.push(...functionsResult.symbols);
    relations.push(...functionsResult.relations);

    const classesResult = extractClasses(sourceFile, fileId, relPath);
    symbols.push(...classesResult.symbols);
    relations.push(...classesResult.relations);

    symbols.push(...extractInterfaces(sourceFile, fileId, relPath));
    symbols.push(...extractTypeAliases(sourceFile, fileId, relPath));

    const existingSymbolIds = new Set(symbols.map(s => s.id));
    symbols.push(...extractVariables(sourceFile, fileId, relPath, existingSymbolIds));

    relations.push(...extractExportedDeclarations(sourceFile, fileId, relPath));

    return { symbols, relations, diagnostics, parserStatus: "parsed", parserAdapter: "ts-morph-v0" };
  } catch (error) {
    diagnostics.push({
      id: `diag:${relPath}:parse-error`,
      severity: "error",
      code: "PARSER_FAILED",
      message: error instanceof Error ? error.message : String(error),
      evidence: [{ id: `ev-parse-error-${sha256(relPath).slice(0, 8)}`, path: relPath, kind: "ast" }],
    });
    return { symbols, relations, diagnostics, parserStatus: "failed", parserAdapter: "ts-morph-v0" };
  }
}