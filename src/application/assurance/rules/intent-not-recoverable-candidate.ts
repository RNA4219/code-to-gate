import type { AssuranceGraph } from "../assurance-graph.js";
import { getNodeById, type AssuranceEvidenceInput } from "../detection-rules.js";
import type { EntrypointIntentResult } from "./intent-not-recoverable-analysis.js";

export function buildIntentNotRecoverableTitle(result: EntrypointIntentResult): string {
  return `Review required: Changed critical entrypoint "${result.entrypointName}" (${result.entrypointId}) has no intent traceability`;
}

export function buildIntentNotRecoverableSummary(result: EntrypointIntentResult): string {
  const lines: string[] = [];

  lines.push(`Changed critical entrypoint "${result.entrypointName}" (${result.entrypointId}) lacks intent traceability.`);
  lines.push("No link found to intent, requirement, invariant, or test.");

  if (result.traceDetails.length > 0) {
    lines.push(`Existing references: ${result.traceDetails.join("; ")}.`);
  } else {
    lines.push("No intent/requirement/invariant/test references found.");
  }

  lines.push("Consider documenting intent, linking to requirement, or adding tests.");
  lines.push("Source artifact: repo-graph.json");

  return lines.join(" ");
}

export function buildIntentNotRecoverableCandidateEvidence(
  result: EntrypointIntentResult,
  graph: AssuranceGraph
): AssuranceEvidenceInput[] {
  const evidenceInputs: AssuranceEvidenceInput[] = [];
  const entrypointNode = getNodeById(graph, result.entrypointId);

  if (entrypointNode && entrypointNode.sourceArtifact) {
    evidenceInputs.push({
      path: entrypointNode.sourceArtifact,
      kind: "external",
      externalRef: {
        tool: "code-to-gate",
        ruleId: `entrypoint:${result.entrypointId}`,
      },
    });
  }

  evidenceInputs.push({
    path: "repo-graph.json",
    kind: "external",
    externalRef: {
      tool: "code-to-gate",
      ruleId: "intent-not-recoverable",
    },
  });

  return evidenceInputs;
}
