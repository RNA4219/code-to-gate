import { describe, expect, it } from "vitest";
import type { FindingsArtifact } from "../../types/artifacts.js";
import {
  createPrecisionReview,
  sha256Hex,
  summarizePrecisionReview,
  updatePrecisionReview,
  validatePrecisionReview,
} from "../precision-review.js";

const findings: FindingsArtifact = {
  version: "ctg/v1", generated_at: "2026-09-10T00:00:00Z", run_id: "run-1",
  repo: { root: "/repo", revision: "0123456789ab" },
  tool: { name: "code-to-gate", version: "1.5.1", plugin_versions: [] },
  artifact: "findings", schema: "findings@v1", completeness: "complete", unsupported_claims: [],
  findings: [
    { id: "f-1", ruleId: "R1", category: "security", severity: "high", confidence: 1, title: "一", summary: "一", evidence: [{ id: "e-1", path: "a.ts", kind: "text" }] },
    { id: "f-2", ruleId: "R2", category: "auth", severity: "low", confidence: 1, title: "二", summary: "二", evidence: [] },
  ],
};
const bytes = Buffer.from(JSON.stringify(findings));

describe("precision-review@v1", () => {
  it("binds raw bytes and initializes all findings as Uncertain", () => {
    const review = createPrecisionReview(findings, { reviewer: { kind: "ai", id: "model" }, findingsBytes: bytes, findingsPath: "findings.json", fullSha: "0123456789abcdef0123456789abcdef01234567" });
    expect(review.findings.map((item) => item.finding_id)).toEqual(["f-1", "f-2"]);
    expect(review.findings.every((item) => item.classification === "Uncertain")).toBe(true);
    expect(review.findings_source.sha256).toBe(sha256Hex(bytes));
    expect(review.precision_reportable).toBe(false);
    expect(validatePrecisionReview(findings, review).valid).toBe(false);
  });

  it("accepts reordered items but rejects duplicate, missing, and tampered bindings", () => {
    const review = createPrecisionReview(findings, { reviewer: { kind: "human", id: "reviewer" }, findingsBytes: bytes, fullSha: "0123456789abcdef0123456789abcdef01234567" });
    const reordered = { ...review, findings: [...review.findings].reverse() };
    expect(validatePrecisionReview(findings, reordered, bytes).valid).toBe(true);
    expect(validatePrecisionReview(findings, { ...review, findings: [review.findings[0], review.findings[0]] }, bytes).valid).toBe(false);
    expect(validatePrecisionReview(findings, { ...review, findings: [review.findings[0]] }, bytes).valid).toBe(false);
    expect(validatePrecisionReview(findings, { ...review, findings_source: { ...review.findings_source, sha256: "0".repeat(64) } }, bytes).valid).toBe(false);
  });

  it("keeps AI and Uncertain reviews out of precision claims and separates AcceptedDesign", () => {
    const initial = createPrecisionReview(findings, { reviewer: { kind: "ai", id: "model" }, findingsBytes: bytes, fullSha: "0123456789abcdef0123456789abcdef01234567" });
    const ai = updatePrecisionReview(findings, initial, [{ finding_id: "f-1", classification: "FP", comment: "日本語コメント" }, { finding_id: "f-2", classification: "AcceptedDesign" }], bytes);
    const aiSummary = summarizePrecisionReview(findings, ai, bytes);
    expect(aiSummary.fp_rate).toBe(100);
    expect(aiSummary.counts.acceptedDesign).toBe(1);
    expect(aiSummary.precision_reportable).toBe(false);

    const human = updatePrecisionReview(findings, { ...ai, reviewer: { kind: "human", id: "reviewer" } }, [], bytes);
    const summary = summarizePrecisionReview(findings, human, bytes);
    expect(summary.precision_reportable).toBe(true);
    expect(summary.by_rule.R1.fp_rate).toBe(100);
    expect(summary.by_rule.R2.fp_rate).toBe(null);
    const forged = summarizePrecisionReview(findings, { ...human, repo: { ...human.repo, reportable: true }, precision_reportable: true }, bytes);
    expect(forged.repo.reportable).toBe(true);
    expect(forged.precision_reportable).toBe(true);
  });

  it("does not report an empty human review", () => {
    const empty = { ...findings, findings: [] };
    const review = createPrecisionReview(empty, { reviewer: { kind: "human", id: "reviewer" }, findingsBytes: Buffer.from(JSON.stringify(empty)), fullSha: "0123456789abcdef0123456789abcdef01234567" });
    const summary = summarizePrecisionReview(empty, review, Buffer.from(JSON.stringify(empty)));
    expect(summary.humanReviewed).toBe(false);
    expect(summary.precision_reportable).toBe(false);
    expect(summary.fp_rate).toBe(null);
  });

  it("rejects invalid identity bindings and raw artifact mismatches", () => {
    const fullSha = "0123456789abcdef0123456789abcdef01234567";
    expect(() => createPrecisionReview({ ...findings, findings: [...findings.findings, findings.findings[0]] }, { reviewer: { kind: "human", id: "reviewer" }, findingsBytes: bytes, fullSha })).toThrow(/duplicate source/);
    expect(() => createPrecisionReview(findings, { reviewer: { kind: "human", id: "reviewer" }, findingsBytes: bytes, fullSha: "invalid" })).toThrow(/fullSha/);
    const emptyRevision = { ...findings, repo: { ...findings.repo, revision: "" } };
    expect(createPrecisionReview(emptyRevision, { reviewer: { kind: "human", id: "reviewer" }, findingsBytes: bytes, fullSha }).repo.reportable).toBe(false);
    const raw = Buffer.from(JSON.stringify({ ...findings, generated_at: "different" }));
    const review = createPrecisionReview(findings, { reviewer: { kind: "human", id: "reviewer" }, findingsBytes: raw, fullSha });
    expect(validatePrecisionReview(findings, review, raw).errors).toContain("findings artifact does not match raw findings bytes");
    expect(() => updatePrecisionReview(findings, review, [{ finding_id: "f-1", classification: "TP" }, { finding_id: "f-1", classification: "FP" }], raw)).toThrow(/duplicate update/);
  });
});
