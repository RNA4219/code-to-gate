import { describe, expect, it } from "vitest";
import type { Finding } from "../../types/artifacts.js";
import {
  classifySuppressedFindings,
  countSuppressedByClass,
} from "../suppression-summary.js";

function createFinding(id: string, path: string): Finding {
  return {
    id,
    ruleId: "LARGE_MODULE",
    category: "maintainability",
    severity: "medium",
    confidence: 0.9,
    title: "Large module",
    summary: "Large module",
    evidence: [{ id: `${id}-evidence`, path, kind: "text" }],
  };
}

describe("suppression-summary", () => {
  it("classifies by matching rule and glob path", () => {
    const findings = [
      createFinding("src-finding", "src/core/large.ts"),
      createFinding("fixture-finding", "fixtures/demo/large.ts"),
    ];
    const suppressions = [
      {
        ruleId: "LARGE_MODULE",
        path: "src/**",
        reason: "accepted source design",
        class: "accepted-design" as const,
      },
      {
        ruleId: "LARGE_MODULE",
        path: "fixtures/**",
        reason: "fixture shape",
        class: "fixture-intentional" as const,
      },
    ];

    const classified = classifySuppressedFindings(suppressions, findings);
    expect(classified.map((item) => item.class)).toEqual([
      "accepted-design",
      "fixture-intentional",
    ]);
  });

  it("counts mixed classes without collapsing by rule id", () => {
    const findings = [
      createFinding("src-finding", "src/core/large.ts"),
      createFinding("fixture-finding", "fixtures/demo/large.ts"),
    ];
    const suppressions = [
      {
        ruleId: "LARGE_MODULE",
        path: "src/**",
        reason: "accepted source design",
        class: "accepted-design" as const,
      },
      {
        ruleId: "LARGE_MODULE",
        path: "fixtures/**",
        reason: "fixture shape",
        class: "fixture-intentional" as const,
      },
    ];

    expect(countSuppressedByClass(suppressions, findings)).toMatchObject({
      "accepted-design": 1,
      "fixture-intentional": 1,
    });
  });
});
