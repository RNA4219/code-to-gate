import { describe, expect, it } from "vitest";

import {
  createRedactionProfile,
  createRedactionSummary,
  parseRedactionProfileOption,
  redactDetailValue,
} from "../../redaction/redaction-profile.js";

describe("redaction profile", () => {
  it("keeps public output to path/hash/count and redacts detail values", () => {
    const profile = createRedactionProfile("public");
    const summary = createRedactionSummary(profile);

    expect(profile).toMatchObject({
      name: "public",
      allowsPath: true,
      allowsHash: true,
      allowsCount: true,
      allowsExcerpt: false,
      allowsDetail: false,
    });
    expect(summary.visibleFields).toEqual(["path", "hash", "count"]);
    expect(summary.redactedFields).toEqual(["excerpt", "detail"]);
    expect(redactDetailValue("secret detail", profile)).toBe("[redacted]");
  });

  it("allows private excerpt and detail fields", () => {
    const profile = parseRedactionProfileOption("private");
    const summary = createRedactionSummary(profile);

    expect(summary.visibleFields).toContain("excerpt");
    expect(summary.visibleFields).toContain("detail");
    expect(summary.warnings).toEqual([]);
    expect(redactDetailValue("private detail", profile)).toBe("private detail");
  });

  it("requires regulated signer, retention, and approval binding", () => {
    const profile = createRedactionProfile("regulated");
    const summary = createRedactionSummary(profile);

    expect(summary.warnings).toEqual([
      "regulated profile requires signer",
      "regulated profile requires retention",
      "regulated profile requires approval binding",
    ]);
  });

  it("rejects unknown profile names", () => {
    expect(() => parseRedactionProfileOption("external")).toThrow("invalid --redaction-profile");
  });
});
