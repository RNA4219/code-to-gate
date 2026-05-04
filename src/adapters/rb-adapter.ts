import { readFileSync } from "node:fs";
import path from "node:path";
import { sha256, toPosix } from "../core/path-utils.js";
import { createAstEvidence } from "../core/evidence-utils.js";
import { getBaseSymbolKind } from "./symbol-kind-utils.js";
import type { EvidenceRef, GraphRelation, SymbolNode, ParseResult } from "../types/graph.js";

export type { EvidenceRef, GraphRelation, SymbolNode, ParseResult };

function isTestPath(filePath: string): boolean {
  return (
    filePath.includes("/test/") ||
    filePath.includes("/tests/") ||
    filePath.includes("/spec/") ||
    filePath.endsWith("_test.rb") ||
    filePath.endsWith("_spec.rb")
  );
}

function getSymbolKind(name: string, relPath: string, isMethod: boolean): SymbolNode["kind"] {
  if (isTestPath(relPath) || name.startsWith("test_") || name.endsWith("_spec")) {
    return "test";
  }

  const baseKind = getBaseSymbolKind(relPath, name);
  if (baseKind) return baseKind;

  return isMethod ? "method" : "function";
}

function findRubyBlockEnd(lines: string[], startIndex: number): number {
  let depth = 0;
  const blockStart = /^\s*(class|module|def|if|unless|case|begin|while|until|for)\b/;
  const inlineEnd = /\bend\b/;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].replace(/#.*/, "");
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (blockStart.test(trimmed)) {
      depth++;
    }

    if (inlineEnd.test(trimmed)) {
      depth--;
      if (depth <= 0) {
        return i + 1;
      }
    }
  }

  return lines.length;
}

function currentNamespace(stack: Array<{ name: string; depth: number }>): string | undefined {
  return stack.length > 0 ? stack.map((item) => item.name).join("::") : undefined;
}

export function parseRubyFile(filePath: string, repoRoot: string, fileId: string): ParseResult {
  const symbols: SymbolNode[] = [];
  const relations: GraphRelation[] = [];
  const diagnostics: ParseResult["diagnostics"] = [];
  const relPath = toPosix(path.relative(repoRoot, filePath));

  try {
    const source = readFileSync(filePath, "utf8");
    const lines = source.split(/\r?\n/);
    const namespaceStack: Array<{ name: string; depth: number }> = [];
    const exportedSymbols = new Set<string>();
    let symbolIndex = 0;
    let relationIndex = 0;
    let blockDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const originalLine = lines[i];
      const line = originalLine.replace(/#.*/, "");
      const trimmed = line.trim();
      const lineNum = i + 1;

      if (!trimmed) continue;

      while (namespaceStack.length > 0 && blockDepth < namespaceStack[namespaceStack.length - 1].depth) {
        namespaceStack.pop();
      }

      const requireMatch = trimmed.match(/^require(?:_relative)?\s+["']([^"']+)["']/);
      if (requireMatch) {
        relationIndex++;
        const moduleName = requireMatch[1];
        relations.push({
          id: `relation:${relPath}:require:${relationIndex}`,
          from: fileId,
          to: moduleName,
          kind: "imports",
          confidence: 1.0,
          evidence: [
            createAstEvidence(
              `ev-require-${sha256(`${relPath}:${relationIndex}`).slice(0, 8)}`,
              relPath,
              lineNum,
              lineNum
            ),
          ],
        });
      }

      const classOrModuleMatch = trimmed.match(/^(class|module)\s+([A-Z][A-Za-z0-9_:]*)/);
      if (classOrModuleMatch) {
        symbolIndex++;
        const name = classOrModuleMatch[2];
        const symbolId = `symbol:${relPath}:${name}`;
        const endLine = findRubyBlockEnd(lines, i);
        const kind: SymbolNode["kind"] = classOrModuleMatch[1] === "module" ? "type" : "class";

        symbols.push({
          id: symbolId,
          fileId,
          name,
          kind,
          exported: true,
          location: { startLine: lineNum, endLine },
          evidence: [
            createAstEvidence(
              `ev-symbol-${sha256(`${relPath}:${name}`).slice(0, 8)}`,
              relPath,
              lineNum,
              endLine,
              `node-${symbolIndex}`,
              symbolId
            ),
          ],
        });

        exportedSymbols.add(name);
        namespaceStack.push({ name, depth: blockDepth + 1 });
      }

      const methodMatch = trimmed.match(/^def\s+(?:(self|[A-Z][A-Za-z0-9_:]*)\.)?([a-zA-Z_][a-zA-Z0-9_!?=]*)/);
      if (methodMatch) {
        symbolIndex++;
        const receiver = methodMatch[1];
        const methodName = methodMatch[2];
        const namespace = receiver === "self" ? currentNamespace(namespaceStack) : receiver ?? currentNamespace(namespaceStack);
        const isMethod = namespace !== undefined;
        const displayName = isMethod ? `${namespace}.${methodName}` : methodName;
        const symbolId = `symbol:${relPath}:${displayName}`;
        const endLine = findRubyBlockEnd(lines, i);

        symbols.push({
          id: symbolId,
          fileId,
          name: methodName,
          kind: getSymbolKind(methodName, relPath, isMethod),
          exported: true,
          location: { startLine: lineNum, endLine },
          evidence: [
            createAstEvidence(
              `ev-symbol-${sha256(`${relPath}:${displayName}`).slice(0, 8)}`,
              relPath,
              lineNum,
              endLine,
              `node-${symbolIndex}`,
              symbolId
            ),
          ],
        });

        exportedSymbols.add(methodName);
      }

      const constantMatch = trimmed.match(/^([A-Z][A-Z0-9_]*)\s*=/);
      if (constantMatch) {
        symbolIndex++;
        const name = constantMatch[1];
        const symbolId = `symbol:${relPath}:${name}`;
        symbols.push({
          id: symbolId,
          fileId,
          name,
          kind: "variable",
          exported: true,
          location: { startLine: lineNum, endLine: lineNum },
          evidence: [
            createAstEvidence(
              `ev-symbol-${sha256(`${relPath}:${name}`).slice(0, 8)}`,
              relPath,
              lineNum,
              lineNum,
              `node-${symbolIndex}`,
              symbolId
            ),
          ],
        });
        exportedSymbols.add(name);
      }

      const routeMatch = trimmed.match(/^(get|post|put|patch|delete)\s+["']([^"']+)["']/);
      if (routeMatch) {
        relationIndex++;
        relations.push({
          id: `relation:${relPath}:route:${relationIndex}`,
          from: fileId,
          to: `route:${routeMatch[1].toUpperCase()} ${routeMatch[2]}`,
          kind: "configures",
          confidence: 0.9,
          evidence: [
            createAstEvidence(
              `ev-route-${sha256(`${relPath}:${lineNum}`).slice(0, 8)}`,
              relPath,
              lineNum,
              lineNum
            ),
          ],
        });
      }

      const rspecMatch = trimmed.match(/^RSpec\.describe\s+(.+)/);
      if (rspecMatch) {
        symbolIndex++;
        const name = rspecMatch[1].replace(/[^\w:]+/g, "_").replace(/^_+|_+$/g, "") || "rspec_example";
        const symbolId = `symbol:${relPath}:${name}`;
        const endLine = findRubyBlockEnd(lines, i);
        symbols.push({
          id: symbolId,
          fileId,
          name,
          kind: "test",
          exported: false,
          location: { startLine: lineNum, endLine },
          evidence: [
            createAstEvidence(
              `ev-symbol-${sha256(`${relPath}:${name}`).slice(0, 8)}`,
              relPath,
              lineNum,
              endLine,
              `node-${symbolIndex}`,
              symbolId
            ),
          ],
        });
      }

      const callPattern = /(?:^|[^\w.])([a-zA-Z_][a-zA-Z0-9_!?]*(?:\.[a-zA-Z_][a-zA-Z0-9_!?]*)?)\s*\(/g;
      let callMatch: RegExpExecArray | null;
      while ((callMatch = callPattern.exec(trimmed)) !== null) {
        const callName = callMatch[1];
        if (["if", "unless", "while", "until", "case", "def"].includes(callName)) continue;
        relationIndex++;
        relations.push({
          id: `relation:${relPath}:call:${relationIndex}`,
          from: fileId,
          to: `symbol:${callName}`,
          kind: "calls",
          confidence: 0.6,
          evidence: [
            createAstEvidence(
              `ev-call-${sha256(`${relPath}:${relationIndex}`).slice(0, 8)}`,
              relPath,
              lineNum,
              lineNum
            ),
          ],
        });
      }

      const blockStartMatches = trimmed.match(/\b(class|module|def|if|unless|case|begin|while|until|for)\b/g);
      const endMatches = trimmed.match(/\bend\b/g);
      blockDepth += blockStartMatches ? blockStartMatches.length : 0;
      blockDepth -= endMatches ? endMatches.length : 0;
      if (blockDepth < 0) blockDepth = 0;
    }

    let exportIndex = 0;
    for (const name of exportedSymbols) {
      const symbol = symbols.find((item) => item.name === name || item.id.endsWith(`:${name}`));
      if (!symbol) continue;
      exportIndex++;
      relations.push({
        id: `relation:${relPath}:export:${exportIndex}`,
        from: fileId,
        to: symbol.id,
        kind: "exports",
        confidence: 1.0,
        evidence: [
          createAstEvidence(
            `ev-export-${sha256(`${relPath}:${name}`).slice(0, 8)}`,
            relPath,
            symbol.location?.startLine ?? 1,
            symbol.location?.endLine ?? 1
          ),
        ],
      });
    }

    return {
      symbols,
      relations,
      diagnostics,
      parserStatus: "parsed",
      parserAdapter: "rb-regex-v0",
    };
  } catch (error) {
    diagnostics.push({
      id: `diag:${relPath}:parse-error`,
      severity: "error",
      code: "PARSER_FAILED",
      message: error instanceof Error ? error.message : String(error),
      evidence: [{ id: `ev-parse-error-${sha256(relPath).slice(0, 8)}`, path: relPath, kind: "ast" }],
    });

    return {
      symbols,
      relations,
      diagnostics,
      parserStatus: "failed",
      parserAdapter: "rb-regex-v0",
    };
  }
}
