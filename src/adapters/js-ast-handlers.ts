/**
 * JavaScript AST Node Handlers
 * Handlers for different AST node types during parsing
 */

import { sha256 } from "../core/path-utils.js";
import type { EvidenceRef, SymbolNode, GraphRelation } from "../types/graph.js";
import { createEvidence, getNodeLoc, getIdName, getSymbolKind } from "./js-adapter-utils.js";

/**
 * Handler context passed to all AST handlers
 */
export interface HandlerContext {
  relPath: string;
  fileId: string;
  source: string;
  exportedNames: Set<string>;
  symbolMap: Map<string, SymbolNode>;
  symbols: SymbolNode[];
  relations: GraphRelation[];
  symbolIndex: number;
  relationIndex: number;
}

/**
 * Increment relation index and return new value
 */
export function nextRelationIndex(ctx: HandlerContext): number {
  ctx.relationIndex++;
  return ctx.relationIndex;
}

/**
 * Increment symbol index and return new value
 */
export function nextSymbolIndex(ctx: HandlerContext): number {
  ctx.symbolIndex++;
  return ctx.symbolIndex;
}

/**
 * Handle ImportDeclaration AST node
 */
export function handleImportDeclaration(node: any, ctx: HandlerContext): void {
  const relationIdx = nextRelationIndex(ctx);
  const sourceModule = node.source?.value as string;
  if (!sourceModule) return;

  const { startLine, endLine } = getNodeLoc(node, ctx.source);

  ctx.relations.push({
    id: `relation:${ctx.relPath}:import:${relationIdx}`,
    from: ctx.fileId,
    to: sourceModule,
    kind: "imports",
    confidence: 1.0,
    evidence: [
      createEvidence(
        `ev-import-${sha256(`${ctx.relPath}:${relationIdx}`).slice(0, 8)}`,
        ctx.relPath,
        startLine,
        endLine
      ),
    ],
  });

  for (const specifier of node.specifiers || []) {
    if (specifier.type === "ImportSpecifier") {
      const importName = specifier.imported?.name ?? specifier.local?.name;
      if (importName) {
        ctx.relations.push({
          id: `relation:${ctx.relPath}:import-symbol:${importName}:${relationIdx}`,
          from: ctx.fileId,
          to: `symbol:${sourceModule}:${importName}`,
          kind: "references",
          confidence: 0.9,
          evidence: [
            createEvidence(
              `ev-import-symbol-${sha256(`${ctx.relPath}:${importName}`).slice(0, 8)}`,
              ctx.relPath,
              getNodeLoc(specifier, ctx.source).startLine,
              getNodeLoc(specifier, ctx.source).endLine
            ),
          ],
        });
      }
    } else if (specifier.type === "ImportDefaultSpecifier") {
      ctx.relations.push({
        id: `relation:${ctx.relPath}:import-default:${relationIdx}`,
        from: ctx.fileId,
        to: `symbol:${sourceModule}:default`,
        kind: "references",
        confidence: 0.9,
        evidence: [
          createEvidence(
            `ev-import-default-${sha256(`${ctx.relPath}:${relationIdx}`).slice(0, 8)}`,
            ctx.relPath,
            getNodeLoc(specifier, ctx.source).startLine,
            getNodeLoc(specifier, ctx.source).endLine
          ),
        ],
      });
    } else if (specifier.type === "ImportNamespaceSpecifier") {
      ctx.relations.push({
        id: `relation:${ctx.relPath}:import-namespace:${relationIdx}`,
        from: ctx.fileId,
        to: `symbol:${sourceModule}:*`,
        kind: "references",
        confidence: 0.9,
        evidence: [
          createEvidence(
            `ev-import-namespace-${sha256(`${ctx.relPath}:${relationIdx}`).slice(0, 8)}`,
            ctx.relPath,
            getNodeLoc(specifier, ctx.source).startLine,
            getNodeLoc(specifier, ctx.source).endLine
          ),
        ],
      });
    }
  }
}

/**
 * Handle ExportNamedDeclaration AST node
 */
export function handleExportNamedDeclaration(node: any, ctx: HandlerContext): void {
  const relationIdx = nextRelationIndex(ctx);
  const { startLine, endLine } = getNodeLoc(node, ctx.source);

  if (node.specifiers) {
    for (const spec of node.specifiers) {
      if (spec.type === "ExportSpecifier") {
        const exportName = spec.exported?.name ?? spec.local?.name;
        if (exportName) {
          ctx.exportedNames.add(exportName);
          ctx.relations.push({
            id: `relation:${ctx.relPath}:export-spec:${exportName}`,
            from: ctx.fileId,
            to: `symbol:${ctx.relPath}:${exportName}`,
            kind: "exports",
            confidence: 1.0,
            evidence: [
              createEvidence(
                `ev-export-spec-${sha256(`${ctx.relPath}:${exportName}`).slice(0, 8)}`,
                ctx.relPath,
                getNodeLoc(spec, ctx.source).startLine,
                getNodeLoc(spec, ctx.source).endLine
              ),
            ],
          });
        }
      }
    }
  }

  if (node.source) {
    const sourceModule = node.source.value as string;
    ctx.relations.push({
      id: `relation:${ctx.relPath}:export-reexport:${relationIdx}`,
      from: ctx.fileId,
      to: sourceModule,
      kind: "exports",
      confidence: 1.0,
      evidence: [
        createEvidence(
          `ev-export-${sha256(`${ctx.relPath}:${relationIdx}`).slice(0, 8)}`,
          ctx.relPath,
          startLine,
          endLine
        ),
      ],
    });
  }

  if (node.declaration) {
    handleExportDeclaration(node.declaration, startLine, endLine, ctx);
  }
}

/**
 * Handle export declaration within ExportNamedDeclaration
 */
export function handleExportDeclaration(
  decl: any,
  startLine: number,
  endLine: number,
  ctx: HandlerContext
): void {
  if (decl.type === "FunctionDeclaration") {
    const name = getIdName(decl.id);
    if (name) {
      ctx.exportedNames.add(name);
      ctx.relations.push({
        id: `relation:${ctx.relPath}:export-local:${name}`,
        from: ctx.fileId,
        to: `symbol:${ctx.relPath}:${name}`,
        kind: "exports",
        confidence: 1.0,
        evidence: [
          createEvidence(
            `ev-export-local-${sha256(`${ctx.relPath}:${name}`).slice(0, 8)}`,
            ctx.relPath,
            startLine,
            endLine
          ),
        ],
      });
    }
  } else if (decl.type === "ClassDeclaration") {
    const name = getIdName(decl.id);
    if (name) {
      ctx.exportedNames.add(name);
      ctx.relations.push({
        id: `relation:${ctx.relPath}:export-local:${name}`,
        from: ctx.fileId,
        to: `symbol:${ctx.relPath}:${name}`,
        kind: "exports",
        confidence: 1.0,
        evidence: [
          createEvidence(
            `ev-export-local-${sha256(`${ctx.relPath}:${name}`).slice(0, 8)}`,
            ctx.relPath,
            startLine,
            endLine
          ),
        ],
      });
    }
  } else if (decl.type === "VariableDeclaration") {
    for (const varDecl of decl.declarations || []) {
      const name = getIdName(varDecl.id);
      if (name) {
        ctx.exportedNames.add(name);
        ctx.relations.push({
          id: `relation:${ctx.relPath}:export-local:${name}`,
          from: ctx.fileId,
          to: `symbol:${ctx.relPath}:${name}`,
          kind: "exports",
          confidence: 1.0,
          evidence: [
            createEvidence(
              `ev-export-local-${sha256(`${ctx.relPath}:${name}`).slice(0, 8)}`,
              ctx.relPath,
              startLine,
              endLine
            ),
          ],
        });
      }
    }
  }
}

/**
 * Handle ExportDefaultDeclaration AST node
 */
export function handleExportDefaultDeclaration(node: any, ctx: HandlerContext): void {
  ctx.exportedNames.add("default");
  const { startLine, endLine } = getNodeLoc(node, ctx.source);
  ctx.relations.push({
    id: `relation:${ctx.relPath}:export-default`,
    from: ctx.fileId,
    to: `symbol:${ctx.relPath}:default`,
    kind: "exports",
    confidence: 1.0,
    evidence: [
      createEvidence(
        `ev-export-default-${sha256(`${ctx.relPath}`).slice(0, 8)}`,
        ctx.relPath,
        startLine,
        endLine
      ),
    ],
  });
}

/**
 * Handle FunctionDeclaration AST node
 */
export function handleFunctionDeclaration(node: any, ctx: HandlerContext): void {
  const name = getIdName(node.id);
  if (!name) return;

  const symbolIdx = nextSymbolIndex(ctx);
  const { startLine, endLine } = getNodeLoc(node, ctx.source);
  const isExported = ctx.exportedNames.has(name);
  const isAsync = node.async ?? false;
  const symbolId = `symbol:${ctx.relPath}:${name}`;
  const symbolKind = getSymbolKind(name, ctx.relPath, "FunctionDeclaration");

  if (!ctx.symbolMap.has(name)) {
    const symbol: SymbolNode = {
      id: symbolId,
      fileId: ctx.fileId,
      name,
      kind: symbolKind,
      exported: isExported,
      async: isAsync,
      evidence: [
        createEvidence(
          `ev-symbol-${sha256(`${ctx.relPath}:${name}`).slice(0, 8)}`,
          ctx.relPath,
          startLine,
          endLine,
          `node-${symbolIdx}`,
          symbolId
        ),
      ],
    };
    ctx.symbols.push(symbol);
    ctx.symbolMap.set(name, symbol);
  }
}

/**
 * Handle ClassDeclaration AST node
 */
export function handleClassDeclaration(node: any, ctx: HandlerContext): void {
  const name = getIdName(node.id);
  if (!name) return;

  const symbolIdx = nextSymbolIndex(ctx);
  const { startLine, endLine } = getNodeLoc(node, ctx.source);
  const isExported = ctx.exportedNames.has(name);
  const classSymbolId = `symbol:${ctx.relPath}:${name}`;

  const classSymbol: SymbolNode = {
    id: classSymbolId,
    fileId: ctx.fileId,
    name,
    kind: "class",
    exported: isExported,
    evidence: [
      createEvidence(
        `ev-symbol-${sha256(`${ctx.relPath}:${name}`).slice(0, 8)}`,
        ctx.relPath,
        startLine,
        endLine,
        `node-${symbolIdx}`,
        classSymbolId
      ),
    ],
  };
  ctx.symbols.push(classSymbol);
  ctx.symbolMap.set(name, classSymbol);

  // Process class methods
  if (node.body && node.body.type === "ClassBody") {
    let methodIndex = 0;
    for (const method of node.body.body || []) {
      if (method.type === "MethodDefinition") {
        methodIndex++;
        const methodName = getIdName(method.key) ?? String(method.key?.value ?? "unknown");
        const { startLine: methodStartLine, endLine: methodEndLine } = getNodeLoc(method, ctx.source);
        const methodIsAsync = method.value?.async ?? false;
        const methodSymbolId = `symbol:${ctx.relPath}:${name}.${methodName}`;

        const methodSymbol: SymbolNode = {
          id: methodSymbolId,
          fileId: ctx.fileId,
          name: methodName,
          kind: "method",
          exported: isExported,
          async: methodIsAsync,
          evidence: [
            createEvidence(
              `ev-symbol-${sha256(`${ctx.relPath}:${name}.${methodName}`).slice(0, 8)}`,
              ctx.relPath,
              methodStartLine,
              methodEndLine,
              `node-${symbolIdx}-method-${methodIndex}`,
              methodSymbolId
            ),
          ],
        };
        ctx.symbols.push(methodSymbol);
      }
    }
  }
}

/**
 * Handle VariableDeclaration AST node
 */
export function handleVariableDeclaration(node: any, ctx: HandlerContext): void {
  for (const decl of node.declarations || []) {
    const name = getIdName(decl.id);
    if (!name) continue;

    const symbolIdx = nextSymbolIndex(ctx);
    const { startLine, endLine } = getNodeLoc(decl, ctx.source);
    const isExported = ctx.exportedNames.has(name);

    let isAsync = false;
    if (decl.init) {
      if (decl.init.type === "ArrowFunctionExpression") {
        isAsync = decl.init.async ?? false;
      } else if (decl.init.type === "FunctionExpression") {
        isAsync = decl.init.async ?? false;
      }
    }

    const symbolId = `symbol:${ctx.relPath}:${name}`;

    if (!ctx.symbolMap.has(name)) {
      const symbol: SymbolNode = {
        id: symbolId,
        fileId: ctx.fileId,
        name,
        kind: getSymbolKind(name, ctx.relPath, "VariableDeclarator"),
        exported: isExported,
        async: isAsync,
        evidence: [
          createEvidence(
            `ev-symbol-${sha256(`${ctx.relPath}:${name}`).slice(0, 8)}`,
            ctx.relPath,
            startLine,
            endLine,
            `node-${symbolIdx}`,
            symbolId
          ),
        ],
      };
      ctx.symbols.push(symbol);
      ctx.symbolMap.set(name, symbol);
    }
  }
}

/**
 * Handle CallExpression AST node
 */
export function handleCallExpression(node: any, ctx: HandlerContext): void {
  const relationIdx = nextRelationIndex(ctx);
  const { startLine, endLine } = getNodeLoc(node, ctx.source);

  let callName: string | undefined;
  if (node.callee.type === "Identifier") {
    callName = node.callee.name;
  } else if (node.callee.type === "MemberExpression") {
    const obj = node.callee.object;
    const prop = node.callee.property;
    if (obj.type === "Identifier" && prop.type === "Identifier") {
      callName = `${obj.name}.${prop.name}`;
    }
  }

  if (callName) {
    ctx.relations.push({
      id: `relation:${ctx.relPath}:call:${relationIdx}`,
      from: ctx.fileId,
      to: `symbol:${callName}`,
      kind: "calls",
      confidence: 0.6,
      evidence: [
        createEvidence(
          `ev-call-${sha256(`${ctx.relPath}:${relationIdx}`).slice(0, 8)}`,
          ctx.relPath,
          startLine,
          endLine
        ),
      ],
    });
  }
}

/**
 * Walk through AST nodes and dispatch handlers
 */
export function walkNode(node: any, ctx: HandlerContext): void {
  if (!node || typeof node !== "object") return;

  switch (node.type) {
    case "ImportDeclaration":
      handleImportDeclaration(node, ctx);
      break;
    case "ExportNamedDeclaration":
      handleExportNamedDeclaration(node, ctx);
      break;
    case "ExportDefaultDeclaration":
      handleExportDefaultDeclaration(node, ctx);
      break;
    case "FunctionDeclaration":
      handleFunctionDeclaration(node, ctx);
      break;
    case "ClassDeclaration":
      handleClassDeclaration(node, ctx);
      break;
    case "VariableDeclaration":
      handleVariableDeclaration(node, ctx);
      break;
    case "CallExpression":
      handleCallExpression(node, ctx);
      break;
  }

  // Recursively walk child nodes
  for (const key of Object.keys(node)) {
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === "object" && item.type) {
          walkNode(item, ctx);
        }
      }
    } else if (child && typeof child === "object" && child.type) {
      walkNode(child, ctx);
    }
  }
}