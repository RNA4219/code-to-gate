import { readFileSync } from "node:fs";
import path from "node:path";
import { sha256, toPosix } from "../core/path-utils.js";
import type { EvidenceRef, GraphRelation, SymbolNode } from "../types/graph.js";

export type RegexLanguage = "go" | "rs" | "java" | "php";

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

function createEvidence(
  id: string,
  filePath: string,
  startLine: number,
  endLine: number,
  nodeId?: string,
  symbolId?: string
): EvidenceRef {
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

function isTestPath(relPath: string, language: RegexLanguage): boolean {
  if (relPath.includes("/test/") || relPath.includes("/tests/") || relPath.includes("__tests__/")) return true;
  if (language === "go") return relPath.endsWith("_test.go");
  if (language === "rs") return relPath.includes("/tests/") || relPath.endsWith("_test.rs");
  if (language === "java") return relPath.endsWith("Test.java") || relPath.endsWith("Tests.java");
  if (language === "php") return relPath.endsWith("Test.php");
  return false;
}

function symbolKind(name: string, relPath: string, language: RegexLanguage, fallback: SymbolNode["kind"]): SymbolNode["kind"] {
  if (isTestPath(relPath, language) || name.startsWith("test") || name.startsWith("Test")) {
    return "test";
  }

  const lowered = name.toLowerCase();
  if (lowered.includes("handler") || lowered.includes("controller") || lowered.includes("route") || lowered.includes("endpoint")) {
    return "route";
  }

  return fallback;
}

function findBraceBlockEnd(lines: string[], startIndex: number): number {
  let depth = 0;
  let seenBrace = false;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;
    if (opens > 0) seenBrace = true;
    depth += opens - closes;

    if (seenBrace && depth <= 0) return i + 1;
  }

  return startIndex + 1;
}

function stripLineComment(line: string, language: RegexLanguage): string {
  if (language === "php") {
    return line.replace(/\/\/.*$/, "").replace(/#.*$/, "");
  }
  return line.replace(/\/\/.*$/, "");
}

function importTargets(line: string, language: RegexLanguage): string[] {
  const targets: string[] = [];
  let match: RegExpMatchArray | null;

  if (language === "go") {
    match = line.match(/^\s*import\s+"([^"]+)"/);
    if (match) targets.push(match[1]);
    match = line.match(/^\s*"([^"]+)"/);
    if (match) targets.push(match[1]);
  } else if (language === "rs") {
    match = line.match(/^\s*use\s+([^;]+);/);
    if (match) targets.push(match[1].trim());
    match = line.match(/^\s*mod\s+([a-zA-Z_][a-zA-Z0-9_]*);/);
    if (match) targets.push(match[1]);
  } else if (language === "java") {
    match = line.match(/^\s*import\s+([^;]+);/);
    if (match) targets.push(match[1].trim());
  } else if (language === "php") {
    match = line.match(/^\s*(?:require|require_once|include|include_once)\s+["']([^"']+)["']/);
    if (match) targets.push(match[1]);
    match = line.match(/^\s*use\s+([^;]+);/);
    if (match) targets.push(match[1].trim());
  }

  return targets;
}

function detectSymbols(line: string, language: RegexLanguage): Array<{ name: string; kind: SymbolNode["kind"] }> {
  const symbols: Array<{ name: string; kind: SymbolNode["kind"] }> = [];
  let match: RegExpMatchArray | null;

  if (language === "go") {
    match = line.match(/^\s*func\s+(?:\([^)]*\)\s*)?([A-Z_a-z][A-Z_a-z0-9]*)\s*\(/);
    if (match) symbols.push({ name: match[1], kind: "function" });
    match = line.match(/^\s*type\s+([A-Z_a-z][A-Z_a-z0-9]*)\s+(?:struct|interface)\b/);
    if (match) symbols.push({ name: match[1], kind: "type" });
  } else if (language === "rs") {
    match = line.match(/^\s*(?:pub\s+)?fn\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
    if (match) symbols.push({ name: match[1], kind: "function" });
    match = line.match(/^\s*(?:pub\s+)?(?:struct|enum|trait)\s+([A-Z][A-Za-z0-9_]*)/);
    if (match) symbols.push({ name: match[1], kind: "type" });
    match = line.match(/^\s*impl(?:\s+[A-Za-z0-9_:<>]+)?\s+for\s+([A-Z][A-Za-z0-9_]*)/);
    if (match) symbols.push({ name: match[1], kind: "class" });
  } else if (language === "java") {
    match = line.match(/^\s*(?:public|private|protected)?\s*(?:abstract\s+|final\s+)?(?:class|interface|enum)\s+([A-Z][A-Za-z0-9_]*)/);
    if (match) symbols.push({ name: match[1], kind: "class" });
    match = line.match(/^\s*(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?[A-Za-z0-9_<>\[\], ?]+\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\([^;]*\)\s*\{/);
    if (match && !["if", "for", "while", "switch", "catch"].includes(match[1])) symbols.push({ name: match[1], kind: "method" });
  } else if (language === "php") {
    match = line.match(/^\s*(?:final\s+|abstract\s+)?(?:class|interface|trait)\s+([A-Za-z_][A-Za-z0-9_]*)/);
    if (match) symbols.push({ name: match[1], kind: "class" });
    match = line.match(/^\s*(?:public|private|protected)?\s*(?:static\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
    if (match) symbols.push({ name: match[1], kind: "function" });
  }

  return symbols;
}

function routeTarget(line: string, language: RegexLanguage): string | undefined {
  if (language === "go") {
    const match = line.match(/\b(?:HandleFunc|Handle)\s*\(\s*"([^"]+)"/);
    if (match) return `route:${match[1]}`;
  } else if (language === "java") {
    const match = line.match(/@(GetMapping|PostMapping|PutMapping|PatchMapping|DeleteMapping|RequestMapping)\s*(?:\(\s*["']([^"']+)["'])?/);
    if (match) return `route:${match[1]} ${match[2] ?? ""}`.trim();
  } else if (language === "php") {
    const match = line.match(/Route::(get|post|put|patch|delete)\s*\(\s*["']([^"']+)["']/);
    if (match) return `route:${match[1].toUpperCase()} ${match[2]}`;
  } else if (language === "rs") {
    const match = line.match(/#\[(get|post|put|patch|delete)\s*\(\s*"([^"]+)"/);
    if (match) return `route:${match[1].toUpperCase()} ${match[2]}`;
  }
  return undefined;
}

export function parseRegexLanguageFile(
  filePath: string,
  repoRoot: string,
  fileId: string,
  language: RegexLanguage
): ParseResult {
  const symbols: SymbolNode[] = [];
  const relations: GraphRelation[] = [];
  const diagnostics: ParseResult["diagnostics"] = [];
  const relPath = toPosix(path.relative(repoRoot, filePath));

  try {
    const source = readFileSync(filePath, "utf8");
    const lines = source.split(/\r?\n/);
    const exportedSymbols = new Set<string>();
    let symbolIndex = 0;
    let relationIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      const trimmed = stripLineComment(lines[i], language).trim();
      if (!trimmed) continue;

      for (const target of importTargets(trimmed, language)) {
        relationIndex++;
        relations.push({
          id: `relation:${relPath}:import:${relationIndex}`,
          from: fileId,
          to: target,
          kind: "imports",
          confidence: 0.95,
          evidence: [
            createEvidence(`ev-import-${sha256(`${relPath}:${relationIndex}`).slice(0, 8)}`, relPath, lineNum, lineNum),
          ],
        });
      }

      for (const detected of detectSymbols(trimmed, language)) {
        symbolIndex++;
        const symbolId = `symbol:${relPath}:${detected.name}`;
        const endLine = findBraceBlockEnd(lines, i);
        const kind = symbolKind(detected.name, relPath, language, detected.kind);

        symbols.push({
          id: symbolId,
          fileId,
          name: detected.name,
          kind,
          exported: true,
          location: { startLine: lineNum, endLine },
          evidence: [
            createEvidence(
              `ev-symbol-${sha256(`${relPath}:${detected.name}`).slice(0, 8)}`,
              relPath,
              lineNum,
              endLine,
              `node-${symbolIndex}`,
              symbolId
            ),
          ],
        });
        exportedSymbols.add(detected.name);
      }

      const route = routeTarget(trimmed, language);
      if (route) {
        relationIndex++;
        relations.push({
          id: `relation:${relPath}:route:${relationIndex}`,
          from: fileId,
          to: route,
          kind: "configures",
          confidence: 0.8,
          evidence: [
            createEvidence(`ev-route-${sha256(`${relPath}:${lineNum}`).slice(0, 8)}`, relPath, lineNum, lineNum),
          ],
        });
      }
    }

    let exportIndex = 0;
    for (const name of exportedSymbols) {
      const symbol = symbols.find((item) => item.name === name);
      if (!symbol) continue;
      exportIndex++;
      relations.push({
        id: `relation:${relPath}:export:${exportIndex}`,
        from: fileId,
        to: symbol.id,
        kind: "exports",
        confidence: 0.9,
        evidence: [
          createEvidence(
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
      parserAdapter: `${language}-regex-v0`,
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
      parserAdapter: `${language}-regex-v0`,
    };
  }
}
