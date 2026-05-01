/**
 * Python import parser
 * Parse import statements and create import relations
 */

import { GraphRelation } from "./py-parser-types.js";
import { sha256, createEvidence } from "./py-parser-helpers.js";

/**
 * Parse import statements
 */
export function parseImports(
  content: string,
  lines: string[],
  relPath: string,
  fileId: string,
  relations: GraphRelation[]
): void {
  let relationIndex = 0;

  // Pattern for: import X, import X as Y, import X.Y
  const basicImportPattern =
    /^import\s+([a-zA-Z_][a-zA-Z0-9_.]*(?:\s+as\s+[a-zA-Z_][a-zA-Z0-9_]*)?(?:\s*,\s*[a-zA-Z_][a-zA-Z0-9_.]*(?:\s+as\s+[a-zA-Z_][a-zA-Z0-9_]*)?)*)/;

  // Pattern for: from X import Y, from X import Y as Z, from X import Y, Z
  const fromImportPattern =
    /^from\s+([a-zA-Z_][a-zA-Z0-9_.]*(?:\.\.[a-zA-Z_][a-zA-Z0-9_.]*)*)\s+import\s+(.+)/;

  // Pattern for relative imports: from .X import Y, from .. import X
  const relativeImportPattern =
    /^from\s+(\.{1,2}[a-zA-Z_][a-zA-Z0-9_.]*)\s+import\s+(.+)/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNum = i + 1;

    // Skip comments
    if (line.startsWith("#") || line === "") continue;

    // Check for basic import: import X
    const basicMatch = line.match(basicImportPattern);
    if (basicMatch) {
      relationIndex++;
      const imports = basicMatch[1].split(",").map((s) => s.trim());

      for (const imp of imports) {
        const parts = imp.split(/\s+as\s+/);
        const moduleName = parts[0];
        const alias = parts.length > 1 ? parts[1] : undefined;

        relations.push({
          id: `relation:${relPath}:import:${relationIndex}`,
          from: fileId,
          to: moduleName,
          kind: "imports",
          confidence: 1.0,
          evidence: [
            createEvidence(
              `ev-import-${sha256(`${relPath}:${relationIndex}`).slice(0, 8)}`,
              relPath,
              lineNum,
              lineNum
            ),
          ],
        });

        if (alias) {
          relations.push({
            id: `relation:${relPath}:import-alias:${relationIndex}`,
            from: fileId,
            to: `symbol:${moduleName}:${alias}`,
            kind: "references",
            confidence: 0.9,
            evidence: [
              createEvidence(
                `ev-import-alias-${sha256(`${relPath}:${alias}`).slice(0, 8)}`,
                relPath,
                lineNum,
                lineNum
              ),
            ],
          });
        }
      }
    }

    // Check for from import: from X import Y
    const fromMatch = line.match(fromImportPattern);
    if (fromMatch && !line.match(relativeImportPattern)) {
      relationIndex++;
      const moduleName = fromMatch[1];
      const importSpec = fromMatch[2];

      // Parse import specifications
      // Handle: Y, Y as Z, Y, Z as W
      const symbols = importSpec
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s && !s.startsWith("*"));

      relations.push({
        id: `relation:${relPath}:from-import:${relationIndex}`,
        from: fileId,
        to: moduleName,
        kind: "imports",
        confidence: 1.0,
        evidence: [
          createEvidence(
            `ev-import-${sha256(`${relPath}:${relationIndex}`).slice(0, 8)}`,
            relPath,
            lineNum,
            lineNum
          ),
        ],
      });

      for (const sym of symbols) {
        const parts = sym.split(/\s+as\s+/);
        const symbolName = parts[0];
        const alias = parts.length > 1 ? parts[1] : undefined;

        relations.push({
          id: `relation:${relPath}:import-symbol:${symbolName}:${relationIndex}`,
          from: fileId,
          to: `symbol:${moduleName}:${symbolName}`,
          kind: "references",
          confidence: 0.9,
          evidence: [
            createEvidence(
              `ev-import-symbol-${sha256(`${relPath}:${symbolName}`).slice(0, 8)}`,
              relPath,
              lineNum,
              lineNum
            ),
          ],
        });

        if (alias) {
          relations.push({
            id: `relation:${relPath}:import-alias:${alias}:${relationIndex}`,
            from: fileId,
            to: `symbol:${moduleName}:${symbolName}`,
            kind: "references",
            confidence: 0.9,
            evidence: [
              createEvidence(
                `ev-import-alias-${sha256(`${relPath}:${alias}`).slice(0, 8)}`,
                relPath,
                lineNum,
                lineNum
              ),
            ],
          });
        }
      }
    }

    // Check for relative imports: from .X import Y, from ..X import Y
    const relativeMatch = line.match(relativeImportPattern);
    if (relativeMatch) {
      relationIndex++;
      const moduleName = relativeMatch[1];
      const importSpec = relativeMatch[2];

      relations.push({
        id: `relation:${relPath}:relative-import:${relationIndex}`,
        from: fileId,
        to: moduleName,
        kind: "imports",
        confidence: 0.8,
        evidence: [
          createEvidence(
            `ev-import-${sha256(`${relPath}:${relationIndex}`).slice(0, 8)}`,
            relPath,
            lineNum,
            lineNum
          ),
        ],
      });

      const symbols = importSpec
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s && !s.startsWith("*"));

      for (const sym of symbols) {
        relations.push({
          id: `relation:${relPath}:import-symbol:${sym}:${relationIndex}`,
          from: fileId,
          to: `symbol:${moduleName}:${sym}`,
          kind: "references",
          confidence: 0.85,
          evidence: [
            createEvidence(
              `ev-import-symbol-${sha256(`${relPath}:${sym}`).slice(0, 8)}`,
              relPath,
              lineNum,
              lineNum
            ),
          ],
        });
      }
    }
  }
}