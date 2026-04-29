import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import * as acorn from "acorn";

export interface EvidenceRef {
  id: string;
  path: string;
  startLine?: number;
  endLine?: number;
  kind: "ast" | "text" | "import" | "external" | "test" | "coverage" | "diff";
  excerptHash?: string;
  nodeId?: string;
  symbolId?: string;
  externalRef?: {
    tool: string;
    ruleId?: string;
    url?: string;
  };
}

export interface SymbolNode {
  id: string;
  fileId: string;
  name: string;
  kind:
    | "function"
    | "class"
    | "method"
    | "variable"
    | "type"
    | "interface"
    | "route"
    | "test"
    | "unknown";
  exported: boolean;
  async?: boolean;
  evidence: EvidenceRef[];
}

export interface GraphRelation {
  id: string;
  from: string;
  to: string;
  kind:
    | "imports"
    | "exports"
    | "calls"
    | "references"
    | "tests"
    | "configures"
    | "depends_on";
  confidence: number;
  evidence: EvidenceRef[];
}

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

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function toPosix(value: string): string {
  return value.replace(/\\/g, "/");
}

function getLineFromPosition(source: string, position: number): number {
  const lines = source.slice(0, position).split("\n");
  return lines.length;
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

function getSymbolKind(name: string, filePath: string, nodeType: string): SymbolNode["kind"] {
  if (
    filePath.includes("/tests/") ||
    filePath.includes(".test.") ||
    filePath.includes(".spec.")
  ) {
    return "test";
  }

  if (
    name.toLowerCase().includes("route") ||
    name.toLowerCase().includes("handler") ||
    name.toLowerCase().includes("controller")
  ) {
    return "route";
  }

  switch (nodeType) {
    case "FunctionDeclaration":
    case "ArrowFunctionExpression":
      return "function";
    case "ClassDeclaration":
      return "class";
    case "MethodDefinition":
      return "method";
    case "VariableDeclarator":
      return "variable";
    default:
      return "unknown";
  }
}

function getNodeLoc(node: any, source: string): { startLine: number; endLine: number } {
  const startLine = node.loc?.start?.line ?? getLineFromPosition(source, node.start);
  const endLine = node.loc?.end?.line ?? getLineFromPosition(source, node.end);
  return { startLine, endLine };
}

function getIdName(id: any): string | null {
  if (!id) return null;
  if (id.type === "Identifier") return id.name;
  return null;
}

export function parseJavaScriptFile(
  filePath: string,
  repoRoot: string,
  fileId: string
): ParseResult {
  const symbols: SymbolNode[] = [];
  const relations: GraphRelation[] = [];
  const diagnostics: ParseResult["diagnostics"] = [];

  const relPath = toPosix(path.relative(repoRoot, filePath));

  try {
    const source = readFileSync(filePath, "utf8");

    const ast = acorn.parse(source, {
      ecmaVersion: "latest",
      sourceType: "module",
      locations: true,
    });

    const exportedNames = new Set<string>();
    const symbolMap = new Map<string, SymbolNode>();

    function walkNode(node: any): void {
      if (!node || typeof node !== "object") return;

      switch (node.type) {
        case "ImportDeclaration":
          handleImportDeclaration(node);
          break;
        case "ExportNamedDeclaration":
          handleExportNamedDeclaration(node);
          break;
        case "ExportDefaultDeclaration":
          handleExportDefaultDeclaration(node);
          break;
        case "FunctionDeclaration":
          handleFunctionDeclaration(node);
          break;
        case "ClassDeclaration":
          handleClassDeclaration(node);
          break;
        case "VariableDeclaration":
          handleVariableDeclaration(node);
          break;
        case "CallExpression":
          handleCallExpression(node);
          break;
      }

      for (const key of Object.keys(node)) {
        const child = node[key];
        if (Array.isArray(child)) {
          for (const item of child) {
            if (item && typeof item === "object" && item.type) {
              walkNode(item);
            }
          }
        } else if (child && typeof child === "object" && child.type) {
          walkNode(child);
        }
      }
    }

    let relationIndex = 0;

    function handleImportDeclaration(node: any): void {
      relationIndex++;
      const sourceModule = node.source?.value as string;
      if (!sourceModule) return;

      const { startLine, endLine } = getNodeLoc(node, source);

      relations.push({
        id: `relation:${relPath}:import:${relationIndex}`,
        from: fileId,
        to: sourceModule,
        kind: "imports",
        confidence: 1.0,
        evidence: [
          createEvidence(
            `ev-import-${sha256(`${relPath}:${relationIndex}`).slice(0, 8)}`,
            relPath,
            startLine,
            endLine
          ),
        ],
      });

      for (const specifier of node.specifiers || []) {
        if (specifier.type === "ImportSpecifier") {
          const importName = specifier.imported?.name ?? specifier.local?.name;
          if (importName) {
            relations.push({
              id: `relation:${relPath}:import-symbol:${importName}:${relationIndex}`,
              from: fileId,
              to: `symbol:${sourceModule}:${importName}`,
              kind: "references",
              confidence: 0.9,
              evidence: [
                createEvidence(
                  `ev-import-symbol-${sha256(`${relPath}:${importName}`).slice(0, 8)}`,
                  relPath,
                  getNodeLoc(specifier, source).startLine,
                  getNodeLoc(specifier, source).endLine
                ),
              ],
            });
          }
        } else if (specifier.type === "ImportDefaultSpecifier") {
          relations.push({
            id: `relation:${relPath}:import-default:${relationIndex}`,
            from: fileId,
            to: `symbol:${sourceModule}:default`,
            kind: "references",
            confidence: 0.9,
            evidence: [
              createEvidence(
                `ev-import-default-${sha256(`${relPath}:${relationIndex}`).slice(0, 8)}`,
                relPath,
                getNodeLoc(specifier, source).startLine,
                getNodeLoc(specifier, source).endLine
              ),
            ],
          });
        } else if (specifier.type === "ImportNamespaceSpecifier") {
          relations.push({
            id: `relation:${relPath}:import-namespace:${relationIndex}`,
            from: fileId,
            to: `symbol:${sourceModule}:*`,
            kind: "references",
            confidence: 0.9,
            evidence: [
              createEvidence(
                `ev-import-namespace-${sha256(`${relPath}:${relationIndex}`).slice(0, 8)}`,
                relPath,
                getNodeLoc(specifier, source).startLine,
                getNodeLoc(specifier, source).endLine
              ),
            ],
          });
        }
      }
    }

    function handleExportNamedDeclaration(node: any): void {
      relationIndex++;
      const { startLine, endLine } = getNodeLoc(node, source);

      if (node.specifiers) {
        for (const spec of node.specifiers) {
          if (spec.type === "ExportSpecifier") {
            const exportName = spec.exported?.name ?? spec.local?.name;
            if (exportName) {
              exportedNames.add(exportName);
              relations.push({
                id: `relation:${relPath}:export-spec:${exportName}`,
                from: fileId,
                to: `symbol:${relPath}:${exportName}`,
                kind: "exports",
                confidence: 1.0,
                evidence: [
                  createEvidence(
                    `ev-export-spec-${sha256(`${relPath}:${exportName}`).slice(0, 8)}`,
                    relPath,
                    getNodeLoc(spec, source).startLine,
                    getNodeLoc(spec, source).endLine
                  ),
                ],
              });
            }
          }
        }
      }

      if (node.source) {
        const sourceModule = node.source.value as string;
        relations.push({
          id: `relation:${relPath}:export-reexport:${relationIndex}`,
          from: fileId,
          to: sourceModule,
          kind: "exports",
          confidence: 1.0,
          evidence: [
            createEvidence(
              `ev-export-${sha256(`${relPath}:${relationIndex}`).slice(0, 8)}`,
              relPath,
              startLine,
              endLine
            ),
          ],
        });
      }

      if (node.declaration) {
        handleExportDeclaration(node.declaration, startLine, endLine);
      }
    }

    function handleExportDeclaration(decl: any, startLine: number, endLine: number): void {
      if (decl.type === "FunctionDeclaration") {
        const name = getIdName(decl.id);
        if (name) {
          exportedNames.add(name);
          relations.push({
            id: `relation:${relPath}:export-local:${name}`,
            from: fileId,
            to: `symbol:${relPath}:${name}`,
            kind: "exports",
            confidence: 1.0,
            evidence: [
              createEvidence(
                `ev-export-local-${sha256(`${relPath}:${name}`).slice(0, 8)}`,
                relPath,
                startLine,
                endLine
              ),
            ],
          });
        }
      } else if (decl.type === "ClassDeclaration") {
        const name = getIdName(decl.id);
        if (name) {
          exportedNames.add(name);
          relations.push({
            id: `relation:${relPath}:export-local:${name}`,
            from: fileId,
            to: `symbol:${relPath}:${name}`,
            kind: "exports",
            confidence: 1.0,
            evidence: [
              createEvidence(
                `ev-export-local-${sha256(`${relPath}:${name}`).slice(0, 8)}`,
                relPath,
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
            exportedNames.add(name);
            relations.push({
              id: `relation:${relPath}:export-local:${name}`,
              from: fileId,
              to: `symbol:${relPath}:${name}`,
              kind: "exports",
              confidence: 1.0,
              evidence: [
                createEvidence(
                  `ev-export-local-${sha256(`${relPath}:${name}`).slice(0, 8)}`,
                  relPath,
                  startLine,
                  endLine
                ),
              ],
            });
          }
        }
      }
    }

    function handleExportDefaultDeclaration(node: any): void {
      exportedNames.add("default");
      const { startLine, endLine } = getNodeLoc(node, source);
      relations.push({
        id: `relation:${relPath}:export-default`,
        from: fileId,
        to: `symbol:${relPath}:default`,
        kind: "exports",
        confidence: 1.0,
        evidence: [
          createEvidence(
            `ev-export-default-${sha256(`${relPath}`).slice(0, 8)}`,
            relPath,
            startLine,
            endLine
          ),
        ],
      });
    }

    let symbolIndex = 0;

    function handleFunctionDeclaration(node: any): void {
      const name = getIdName(node.id);
      if (!name) return;

      symbolIndex++;
      const { startLine, endLine } = getNodeLoc(node, source);
      const isExported = exportedNames.has(name);
      const isAsync = node.async ?? false;
      const symbolId = `symbol:${relPath}:${name}`;
      const symbolKind = getSymbolKind(name, relPath, "FunctionDeclaration");

      if (!symbolMap.has(name)) {
        const symbol: SymbolNode = {
          id: symbolId,
          fileId,
          name,
          kind: symbolKind,
          exported: isExported,
          async: isAsync,
          evidence: [
            createEvidence(
              `ev-symbol-${sha256(`${relPath}:${name}`).slice(0, 8)}`,
              relPath,
              startLine,
              endLine,
              `node-${symbolIndex}`,
              symbolId
            ),
          ],
        };
        symbols.push(symbol);
        symbolMap.set(name, symbol);
      }
    }

    function handleClassDeclaration(node: any): void {
      const name = getIdName(node.id);
      if (!name) return;

      symbolIndex++;
      const { startLine, endLine } = getNodeLoc(node, source);
      const isExported = exportedNames.has(name);
      const classSymbolId = `symbol:${relPath}:${name}`;

      const classSymbol: SymbolNode = {
        id: classSymbolId,
        fileId,
        name,
        kind: "class",
        exported: isExported,
        evidence: [
          createEvidence(
            `ev-symbol-${sha256(`${relPath}:${name}`).slice(0, 8)}`,
            relPath,
            startLine,
            endLine,
            `node-${symbolIndex}`,
            classSymbolId
          ),
        ],
      };
      symbols.push(classSymbol);
      symbolMap.set(name, classSymbol);

      if (node.body && node.body.type === "ClassBody") {
        let methodIndex = 0;
        for (const method of node.body.body || []) {
          if (method.type === "MethodDefinition") {
            methodIndex++;
            const methodName = getIdName(method.key) ?? String(method.key?.value ?? "unknown");
            const { startLine: methodStartLine, endLine: methodEndLine } = getNodeLoc(method, source);
            const methodIsAsync = method.value?.async ?? false;
            const methodSymbolId = `symbol:${relPath}:${name}.${methodName}`;

            const methodSymbol: SymbolNode = {
              id: methodSymbolId,
              fileId,
              name: methodName,
              kind: "method",
              exported: isExported,
              async: methodIsAsync,
              evidence: [
                createEvidence(
                  `ev-symbol-${sha256(`${relPath}:${name}.${methodName}`).slice(0, 8)}`,
                  relPath,
                  methodStartLine,
                  methodEndLine,
                  `node-${symbolIndex}-method-${methodIndex}`,
                  methodSymbolId
                ),
              ],
            };
            symbols.push(methodSymbol);
          }
        }
      }
    }

    function handleVariableDeclaration(node: any): void {
      for (const decl of node.declarations || []) {
        const name = getIdName(decl.id);
        if (!name) continue;

        symbolIndex++;
        const { startLine, endLine } = getNodeLoc(decl, source);
        const isExported = exportedNames.has(name);

        let isAsync = false;
        if (decl.init) {
          if (decl.init.type === "ArrowFunctionExpression") {
            isAsync = decl.init.async ?? false;
          } else if (decl.init.type === "FunctionExpression") {
            isAsync = decl.init.async ?? false;
          }
        }

        const symbolId = `symbol:${relPath}:${name}`;

        if (!symbolMap.has(name)) {
          const symbol: SymbolNode = {
            id: symbolId,
            fileId,
            name,
            kind: getSymbolKind(name, relPath, "VariableDeclarator"),
            exported: isExported,
            async: isAsync,
            evidence: [
              createEvidence(
                `ev-symbol-${sha256(`${relPath}:${name}`).slice(0, 8)}`,
                relPath,
                startLine,
                endLine,
                `node-${symbolIndex}`,
                symbolId
              ),
            ],
          };
          symbols.push(symbol);
          symbolMap.set(name, symbol);
        }
      }
    }

    function handleCallExpression(node: any): void {
      relationIndex++;
      const { startLine, endLine } = getNodeLoc(node, source);

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
        relations.push({
          id: `relation:${relPath}:call:${relationIndex}`,
          from: fileId,
          to: `symbol:${callName}`,
          kind: "calls",
          confidence: 0.6,
          evidence: [
            createEvidence(
              `ev-call-${sha256(`${relPath}:${relationIndex}`).slice(0, 8)}`,
              relPath,
              startLine,
              endLine
            ),
          ],
        });
      }
    }

    walkNode(ast);

    return {
      symbols,
      relations,
      diagnostics,
      parserStatus: "parsed",
      parserAdapter: "acorn-v0",
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
      parserAdapter: "acorn-v0",
    };
  }
}