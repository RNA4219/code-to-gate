/**
 * Python entrypoint parser
 * Parse entrypoint patterns like __main__ and framework initialization
 */

import { GraphRelation } from "./py-parser-types.js";
import { sha256, createEvidence } from "./py-parser-helpers.js";

/**
 * Check for entrypoint patterns
 */
export function parseEntrypoints(
  lines: string[],
  relPath: string,
  fileId: string,
  relations: GraphRelation[]
): void {
  let relationIndex = 0;

  // Pattern for: if __name__ == "__main__":
  const mainPattern = /^if\s+__name__\s*==\s*["']__main__["']\s*:/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNum = i + 1;

    if (mainPattern.test(line)) {
      relationIndex++;
      relations.push({
        id: `relation:${relPath}:entrypoint:${relationIndex}`,
        from: fileId,
        to: `entrypoint:__main__`,
        kind: "configures",
        confidence: 1.0,
        evidence: [
          createEvidence(
            `ev-entrypoint-${sha256(`${relPath}:${lineNum}`).slice(0, 8)}`,
            relPath,
            lineNum,
            lineNum
          ),
        ],
      });
    }

    // FastAPI/Flask app initialization
    const appPatterns = [
      /app\s*=\s*FastAPI\s*\(/,
      /app\s*=\s*Flask\s*\(/,
      /router\s*=\s*APIRouter\s*\(/,
      /app\.run\s*\(/,
      /uvicorn\.run\s*\(/,
    ];

    for (const pattern of appPatterns) {
      if (pattern.test(line)) {
        relationIndex++;
        relations.push({
          id: `relation:${relPath}:framework:${relationIndex}`,
          from: fileId,
          to: `framework:${pattern.source}`,
          kind: "configures",
          confidence: 0.9,
          evidence: [
            createEvidence(
              `ev-framework-${sha256(`${relPath}:${lineNum}`).slice(0, 8)}`,
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