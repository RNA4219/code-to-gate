import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { loadPolicyFile } from "../policy-loader.js";

describe("bundled policy", () => {
  it("loads the repository policy with the supported snake_case contract", () => {
    const source = readFileSync(".ctg/policy.yaml", "utf8");
    expect(source).toContain("expiry_warning_days: 30");
    expect(source).toContain("max_suppressions_per_rule: 10");
    expect(source).not.toContain("expiryWarningDays");
    expect(source).not.toContain("maxSuppressionsPerRule");
    const result = loadPolicyFile(".ctg/policy.yaml", process.cwd());

    expect(result.errors).toEqual([]);
    expect(result.policy.policyId).toBe("code-to-gate-quality-policy");
    expect(result.policy.blocking.countThreshold).toEqual({
      criticalMax: 0,
      highMax: 10,
      mediumMax: 50,
      lowMax: 100,
    });
    expect(result.policy.blocking.rules).toEqual({
      HARDCODED_SECRET: true,
      RAW_SQL: true,
      UNSAFE_REDIRECT: true,
    });
    expect(result.policy.confidence).toEqual({
      minConfidence: 0.6,
      lowConfidenceThreshold: 0.4,
      filterLow: true,
    });
    expect(result.policy.suppression).toEqual({
      file: ".ctg/suppressions.yaml",
      expiryWarningDays: 30,
      maxSuppressionsPerRule: 10,
    });
    expect(result.policy.partial).toEqual({
      allowPartial: false,
      partialWarningThreshold: 0.2,
    });
    expect(result.policy.llm?.requireLlm).toBe(false);
    expect(result.policy.exit).toEqual({
      failOnCritical: true,
      failOnHigh: true,
      warnOnly: false,
    });
    expect(result.policy.blocking.rules).not.toHaveProperty("criticalMax");
    expect(result.policy.blocking.rules).not.toHaveProperty("highMax");
    expect(result.policy.blocking.rules).not.toHaveProperty("mediumMax");
    expect(result.policy.blocking.rules).not.toHaveProperty("lowMax");
  });
});
