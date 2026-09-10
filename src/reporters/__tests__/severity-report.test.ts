import { describe, expect, it } from "vitest";

import { generateAnalysisReport } from "../markdown-reporter.js";
import { generateFindingCard } from "../../viewer/finding-viewer.js";
import { generateReportHtml } from "../../viewer/report-viewer.js";
import { createRedactionProfile } from "../../redaction/redaction-profile.js";
import { createMockFinding, createMockFindingsArtifact, createMockRiskRegisterArtifact } from "../../test-utils/index.js";

function adjustedFinding() {
  return createMockFinding("low", "security", {
    id: "finding-adjusted",
    originalSeverity: "high",
    severityResolution: {
      policyId: "policy|<main>",
      originalSeverity: "high",
      severity: "low",
      reason: "reason | [literal](https://example.test)\r<script>alert(1)</script> & *_",
      matchedSelectors: { ruleId: "RULE-A", path: "src/a.ts", category: "security" },
    },
  });
}

describe("severity reporting", () => {
  it("adds a safe Markdown adjustment table without changing the existing severity cell", () => {
    const findings = createMockFindingsArtifact({ findings: [adjustedFinding()] });
    const report = generateAnalysisReport(findings, createMockRiskRegisterArtifact(), ".");

    expect(report).toContain("## Severity Adjustments");
    expect(report).toContain("| Finding ID | Original | Effective | Policy | Reason | Matched Selectors |");
    expect(report).toContain("| finding-adjusted | high | low | policy\\|&lt;main&gt; |");
    expect(report).toContain("ruleId=RULE-A, path=src/a.ts, category=security");
    expect(report).toContain("\\[literal\\](https://example.test)");
    expect(report).toContain("&amp; \\*\\_");
    expect(report).not.toContain("<script>");
  });

  it("keeps an explicit same-severity policy result visible in the table", () => {
    const finding = createMockFinding("high", "security", {
      id: "finding-same-grade",
      originalSeverity: "high",
      severityResolution: {
        policyId: "policy-same",
        originalSeverity: "high",
        severity: "high",
        reason: "explicit same grade",
        matchedSelectors: { ruleId: "RULE-SAME" },
      },
    });
    const report = generateAnalysisReport(
      createMockFindingsArtifact({ findings: [finding] }),
      createMockRiskRegisterArtifact(),
      "."
    );

    expect(report).toContain("| finding-same-grade | high | high | policy-same | explicit same grade | ruleId=RULE-SAME |");
  });

  it("shows private details and keeps the selector order stable in HTML", () => {
    const html = generateFindingCard(adjustedFinding(), 0, {
      redactionProfile: createRedactionProfile("private"),
    });

    expect(html).toContain("<dt>重要度</dt><dd>high → low</dd>");
    expect(html).toContain("<dt>ポリシー</dt><dd>policy|&lt;main&gt;</dd>");
    expect(html).toContain("<dt>理由</dt><dd style=\"white-space:pre-wrap;\">reason | [literal](https://example.test)");
    expect(html).toContain("<dt>一致セレクタ</dt><dd>ruleId=RULE-A, path=src/a.ts, category=security</dd>");
    expect(html).not.toContain("<script>");
  });

  it("shows only severity values under the public profile", () => {
    const html = generateFindingCard(adjustedFinding(), 0, {
      redactionProfile: createRedactionProfile("public"),
    });

    expect(html).toContain("<dt>重要度</dt><dd>high → low</dd>");
    expect(html).not.toContain("ポリシー");
    expect(html).not.toContain("理由");
    expect(html).not.toContain("一致セレクタ");
  });

  it("does not add a detail block for an unadjusted finding", () => {
    const html = generateFindingCard(createMockFinding("high", "security"), 0);
    expect(html).not.toContain("finding-severity-resolution");
  });

  it("propagates the report viewer redaction profile to findings", () => {
    const artifact = createMockFindingsArtifact({ findings: [adjustedFinding()] });
    const publicHtml = generateReportHtml(
      { findings: artifact },
      { redactionProfile: createRedactionProfile("public") }
    );
    const privateHtml = generateReportHtml(
      { findings: artifact },
      { redactionProfile: createRedactionProfile("private") }
    );

    expect(publicHtml).toContain("<dt>重要度</dt><dd>high → low</dd>");
    expect(publicHtml).not.toContain("ポリシー");
    expect(privateHtml).toContain("<dt>ポリシー</dt><dd>policy|&lt;main&gt;</dd>");
  });
});
