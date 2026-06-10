import type { EvidenceRef } from "../../types/artifacts.js";
import type { AssuranceFindingRuleId } from "../../types/assurance-findings.js";
import { ruleIdToTag } from "../../types/assurance-findings.js";
import type { HashService } from "../../types/contracts.js";
import type { AssuranceGraph } from "./assurance-graph.js";

export function createDiffEvidence(
  path: string,
  startLine: number,
  endLine: number,
  snippet: string,
  hashService: HashService
): EvidenceRef {
  return {
    id: `evidence-${hashService.fingerprint(path + startLine + endLine + snippet)}`,
    path,
    startLine,
    endLine,
    kind: "diff",
    excerptHash: hashService.sha256(snippet),
  };
}

export function createDiffFindingId(
  ruleId: AssuranceFindingRuleId,
  filePath: string,
  location: string,
  hashService: HashService
): string {
  const identity = `${ruleId}:${filePath}:${location}`;
  return `assurance-${ruleIdToTag(ruleId)}-${hashService.fingerprint(identity)}`;
}

export function isExcludedRole(filePath: string, graph: AssuranceGraph): boolean {
  const fileNode = graph.nodes.find(
    (node) => node.kind === "file" && node.data.path === filePath
  );
  const role = fileNode?.data?.role as string | undefined;
  if (role === "test" || role === "fixture" || role === "generated") {
    return true;
  }

  return (
    filePath.includes("__tests__") ||
    filePath.includes(".test.") ||
    filePath.includes(".spec.") ||
    filePath.includes("__mocks__") ||
    filePath.includes("fixtures/") ||
    filePath.includes("generated/")
  );
}
