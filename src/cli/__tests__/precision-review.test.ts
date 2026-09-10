import { describe, expect, it } from "vitest";
import { existsSync, linkSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { EXIT } from "../exit-codes.js";
import { precisionReviewCommand } from "../precision-review.js";
import { createPrecisionWorkbenchFixture, readFixtureReview } from "../../evaluation/__tests__/precision-review-fixture.js";

describe("precision-review CLI", () => {
  it("renders a bound review with evidence code when repo is explicit", async () => {
    const fixture = createPrecisionWorkbenchFixture(); const output = path.join(fixture.root, "review.html");
    try {
      expect(await precisionReviewCommand(["--from", fixture.findingsPath, "--review", fixture.reviewPath, "--out", output, "--repo", fixture.repoPath], { EXIT })).toBe(EXIT.OK);
      const html = readFileSync(output, "utf8");
      expect(html).toContain("精度レビュー"); expect(html).toContain("長い関数"); expect(html).toContain("2: "); expect(html).toContain("Uncertain"); expect(html).toContain("\\u003cb\\u003e");
      const sourceBefore = readFileSync(fixture.findingsPath); const nestedOutput = path.join(fixture.root, "newdir", "findings.json");
      expect(await precisionReviewCommand(["--from", fixture.findingsPath, "--review", fixture.reviewPath, "--out", nestedOutput], { EXIT })).toBe(EXIT.OK);
      expect(readFileSync(fixture.findingsPath)).toEqual(sourceBefore);
    } finally { fixture.cleanup(); }
  });

  it("rejects binding failures, malformed args, and output aliases even with force", async () => {
    const fixture = createPrecisionWorkbenchFixture();
    try {
      const tampered = path.join(fixture.root, "tampered.json"); const review = readFixtureReview(fixture); review.findings[0].fingerprint = "0".repeat(16); writeFileSync(tampered, JSON.stringify(review));
      const run = (args: string[]) => precisionReviewCommand(args, { EXIT });
      expect(await run(["--from", fixture.findingsPath, "--review", tampered, "--out", path.join(fixture.root, "out.html")])).not.toBe(EXIT.OK);
      expect(await run(["--from", fixture.findingsPath, "--review", fixture.reviewPath, "--out", path.join(fixture.root, "out.html"), "--unknown"])).not.toBe(EXIT.OK);
      expect(await run(["--from", fixture.findingsPath, "--review", fixture.reviewPath, "--out", fixture.findingsPath, "--force"])).not.toBe(EXIT.OK);
      const hardlink = path.join(fixture.root, "findings-hardlink.json"); linkSync(fixture.findingsPath, hardlink);
      expect(await run(["--from", fixture.findingsPath, "--review", fixture.reviewPath, "--out", hardlink, "--force"])).not.toBe(EXIT.OK);
      expect(await run(["--from", fixture.findingsPath])).not.toBe(EXIT.OK);
    } finally { fixture.cleanup(); }
  });

  it("protects an existing output unless force is supplied", async () => {
    const fixture = createPrecisionWorkbenchFixture(); const output = path.join(fixture.root, "nested", "review.html");
    try {
      mkdirSync(path.dirname(output), { recursive: true });
      writeFileSync(output, "sentinel", "utf8");
      expect(await precisionReviewCommand(["--from", fixture.findingsPath, "--review", fixture.reviewPath, "--out", output], { EXIT })).not.toBe(EXIT.OK);
      expect(readFileSync(output, "utf8")).toBe("sentinel");
      expect(await precisionReviewCommand(["--from", fixture.findingsPath, "--review", fixture.reviewPath, "--out", output, "--force"], { EXIT })).toBe(EXIT.OK);
      expect(existsSync(output)).toBe(true);
    } finally { fixture.cleanup(); }
  });
});
