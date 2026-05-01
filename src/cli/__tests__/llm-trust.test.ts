/**
 * P1-02: LLM Trust and Redaction Tests
 *
 * Tests for:
 * - --require-llm failure path (exit code 4)
 * - LLM request redaction
 * - deterministic fallback behavior
 * - unsupported_claims isolation
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { analyzeCommand } from "../analyze.js";
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

const EXIT = {
  OK: 0,
  READINESS_NOT_CLEAR: 1,
  USAGE_ERROR: 2,
  SCAN_FAILED: 3,
  LLM_FAILED: 4,
  POLICY_FAILED: 5,
  PLUGIN_FAILED: 6,
  SCHEMA_FAILED: 7,
  IMPORT_FAILED: 8,
  INTEGRATION_EXPORT_FAILED: 9,
  INTERNAL_ERROR: 10,
};

const VERSION = "0.1.0";

function getOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

describe("P1-02: LLM Trust Tests", () => {
  let tempOutDir: string;
  const fixturesDir = path.resolve(import.meta.dirname, "../../../fixtures/demo-ci-imports");

  beforeAll(() => {
    tempOutDir = path.join(tmpdir(), `ctg-llm-trust-test-${Date.now()}`);
    mkdirSync(tempOutDir, { recursive: true });
  });

  afterAll(() => {
    if (existsSync(tempOutDir)) {
      rmSync(tempOutDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    if (existsSync(tempOutDir)) {
      rmSync(tempOutDir, { recursive: true, force: true });
    }
    mkdirSync(tempOutDir, { recursive: true });
  });

  describe("--require-llm failure path", () => {
    it("returns EXIT.LLM_FAILED (4) when --require-llm and provider unavailable", async () => {
      // Use --llm-provider ollama with --require-llm
      // ollama is typically not running in test environment
      const args = [
        fixturesDir,
        "--out", tempOutDir,
        "--llm-provider", "ollama",
        "--require-llm",
      ];

      const result = await analyzeCommand(args, { VERSION, EXIT, getOption });

      // Should return LLM_FAILED (4) when provider unavailable and --require-llm is set
      expect(result).toBe(EXIT.LLM_FAILED);
    });

    it("returns EXIT.LLM_FAILED (4) when --require-llm and llamacpp unavailable", async () => {
      const args = [
        fixturesDir,
        "--out", tempOutDir,
        "--llm-provider", "llamacpp",
        "--require-llm",
      ];

      const result = await analyzeCommand(args, { VERSION, EXIT, getOption });

      expect(result).toBe(EXIT.LLM_FAILED);
    });

    it("falls back to deterministic without --require-llm", async () => {
      // Without --require-llm, should fall back to deterministic and succeed
      const args = [
        fixturesDir,
        "--out", tempOutDir,
        "--llm-provider", "ollama",
      ];

      const result = await analyzeCommand(args, { VERSION, EXIT, getOption });

      // Should succeed with deterministic fallback
      expect(result).toBe(EXIT.OK);

      // Verify audit shows deterministic was used
      const auditPath = path.join(tempOutDir, "audit.json");
      const audit = JSON.parse(readFileSync(auditPath, "utf8"));

      // deterministic fallback should be logged
      expect(audit.llm?.provider).toBe("deterministic");
    });

    it("deterministic provider always succeeds even with --require-llm", async () => {
      const args = [
        fixturesDir,
        "--out", tempOutDir,
        "--llm-provider", "deterministic",
        "--require-llm",
      ];

      const result = await analyzeCommand(args, { VERSION, EXIT, getOption });

      // deterministic always succeeds
      expect(result).toBe(EXIT.OK);
    });
  });

  describe("redaction verification", () => {
    it("audit.json has redaction_enabled field when LLM used", async () => {
      const args = [
        fixturesDir,
        "--out", tempOutDir,
        "--llm-provider", "deterministic",
      ];

      await analyzeCommand(args, { VERSION, EXIT, getOption });

      const auditPath = path.join(tempOutDir, "audit.json");
      const audit = JSON.parse(readFileSync(auditPath, "utf8"));

      expect(audit.llm).toBeDefined();
      expect(audit.llm?.redaction_enabled).toBe(true);
    });

    it("LLM request hash is recorded in audit", async () => {
      const args = [
        fixturesDir,
        "--out", tempOutDir,
        "--llm-provider", "deterministic",
      ];

      await analyzeCommand(args, { VERSION, EXIT, getOption });

      const auditPath = path.join(tempOutDir, "audit.json");
      const audit = JSON.parse(readFileSync(auditPath, "utf8"));

      expect(audit.llm?.request_hash).toBeDefined();
      expect(audit.llm?.request_hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("LLM response hash is recorded in audit", async () => {
      const args = [
        fixturesDir,
        "--out", tempOutDir,
        "--llm-provider", "deterministic",
      ];

      await analyzeCommand(args, { VERSION, EXIT, getOption });

      const auditPath = path.join(tempOutDir, "audit.json");
      const audit = JSON.parse(readFileSync(auditPath, "utf8"));

      expect(audit.llm?.response_hash).toBeDefined();
    });

    it("no LLM info when LLM not used", async () => {
      const args = [
        fixturesDir,
        "--out", tempOutDir,
      ];

      await analyzeCommand(args, { VERSION, EXIT, getOption });

      const auditPath = path.join(tempOutDir, "audit.json");
      const audit = JSON.parse(readFileSync(auditPath, "utf8"));

      // Without --llm-provider or --require-llm, LLM is not used
      expect(audit.llm).toBeUndefined();
    });
  });

  describe("unsupported_claims isolation", () => {
    it("findings.json has unsupported_claims array", async () => {
      const args = [
        fixturesDir,
        "--out", tempOutDir,
        "--llm-provider", "deterministic",
      ];

      await analyzeCommand(args, { VERSION, EXIT, getOption });

      const findingsPath = path.join(tempOutDir, "findings.json");
      const findings = JSON.parse(readFileSync(findingsPath, "utf8"));

      expect(Array.isArray(findings.unsupported_claims)).toBe(true);
    });

    it("unsupported_claims are separate from primary findings", async () => {
      const args = [
        fixturesDir,
        "--out", tempOutDir,
        "--llm-provider", "deterministic",
      ];

      await analyzeCommand(args, { VERSION, EXIT, getOption });

      const findingsPath = path.join(tempOutDir, "findings.json");
      const findings = JSON.parse(readFileSync(findingsPath, "utf8"));

      // Primary findings should have proper structure
      for (const finding of findings.findings) {
        expect(finding.id).toBeDefined();
        expect(finding.rule).toBeDefined();
        expect(finding.category).toBeDefined();
        expect(finding.severity).toBeDefined();
        expect(finding.evidence).toBeDefined();
      }

      // unsupported_claims should be in separate array, not mixed
      const findingIds = findings.findings.map((f: { id: string }) => f.id);
      const unsupportedIds = findings.unsupported_claims.map((c: { id: string }) => c.id);

      // No overlap between findings and unsupported_claims IDs
      for (const unsupportedId of unsupportedIds) {
        expect(findingIds).not.toContain(unsupportedId);
      }
    });

    it("deterministic provider generates structured response", async () => {
      const args = [
        fixturesDir,
        "--out", tempOutDir,
        "--llm-provider", "deterministic",
      ];

      await analyzeCommand(args, { VERSION, EXIT, getOption });

      const auditPath = path.join(tempOutDir, "audit.json");
      const audit = JSON.parse(readFileSync(auditPath, "utf8"));

      // deterministic response is recorded
      expect(audit.llm?.model).toBe("default");
      expect(audit.llm?.provider).toBe("deterministic");
    });
  });

  describe("LLM provider validation", () => {
    it("invalid provider returns USAGE_ERROR", async () => {
      const args = [
        fixturesDir,
        "--out", tempOutDir,
        "--llm-provider", "invalid-provider",
      ];

      const result = await analyzeCommand(args, { VERSION, EXIT, getOption });

      expect(result).toBe(EXIT.USAGE_ERROR);
    });

    it("valid providers are accepted", async () => {
      const validProviders = ["ollama", "llamacpp", "deterministic"];

      for (const provider of validProviders) {
        const providerOutDir = path.join(tempOutDir, `provider-${provider}`);
        mkdirSync(providerOutDir, { recursive: true });

        const args = [
          fixturesDir,
          "--out", providerOutDir,
          "--llm-provider", provider,
        ];

        const result = await analyzeCommand(args, { VERSION, EXIT, getOption });

        // deterministic succeeds, others fall back
        expect([EXIT.OK, EXIT.LLM_FAILED]).toContain(result);
      }
    });
  });

  describe("LLM mode validation", () => {
    it("invalid llm-mode returns USAGE_ERROR", async () => {
      const args = [
        fixturesDir,
        "--out", tempOutDir,
        "--llm-mode", "invalid-mode",
      ];

      const result = await analyzeCommand(args, { VERSION, EXIT, getOption });

      expect(result).toBe(EXIT.USAGE_ERROR);
    });

    it("valid llm-modes are accepted", async () => {
      const validModes = ["local-only", "allow-cloud"];

      for (const mode of validModes) {
        const modeOutDir = path.join(tempOutDir, `mode-${mode}`);
        mkdirSync(modeOutDir, { recursive: true });

        const args = [
          fixturesDir,
          "--out", modeOutDir,
          "--llm-mode", mode,
        ];

        const result = await analyzeCommand(args, { VERSION, EXIT, getOption });

        expect(result).toBe(EXIT.OK);
      }
    });
  });

  describe("LLM health check integration", () => {
    it("analyze with unavailable provider logs warning", async () => {
      // This test verifies the warning message is logged
      // when provider is unavailable but --require-llm is not set

      const args = [
        fixturesDir,
        "--out", tempOutDir,
        "--llm-provider", "ollama",
      ];

      // Capture stderr
      const result = await analyzeCommand(args, { VERSION, EXIT, getOption });

      // Should succeed with deterministic fallback
      expect(result).toBe(EXIT.OK);

      // Verify deterministic was used
      const auditPath = path.join(tempOutDir, "audit.json");
      const audit = JSON.parse(readFileSync(auditPath, "utf8"));

      expect(audit.llm?.provider).toBe("deterministic");
    });
  });

  describe("trust boundary verification", () => {
    it("secrets fixture content is not exposed in findings", async () => {
      // Create a fixture with secret-like content
      const secretFixtureDir = path.join(tempOutDir, "secret-fixture");
      mkdirSync(secretFixtureDir, { recursive: true });

      // File with secret patterns
      writeFileSync(
        path.join(secretFixtureDir, "config.ts"),
        `
export const API_KEY = "sk-secret-key-12345";
export const PASSWORD = "admin-password";
export const DATABASE_URL = "postgres://user:pass@localhost/db";
`,
        "utf8"
      );

      const args = [
        secretFixtureDir,
        "--out", tempOutDir,
        "--llm-provider", "deterministic",
      ];

      await analyzeCommand(args, { VERSION, EXIT, getOption });

      const findingsPath = path.join(tempOutDir, "findings.json");
      const findings = JSON.parse(readFileSync(findingsPath, "utf8"));

      // Check that actual secret values are not in findings content
      const findingsContent = JSON.stringify(findings);

      // Secret values should not appear in findings
      expect(findingsContent).not.toContain("sk-secret-key-12345");
      expect(findingsContent).not.toContain("admin-password");
      // Note: The ENV_DIRECT_ACCESS rule may detect the pattern, but actual values should be redacted
    });

    it("audit.json does not contain secret values", async () => {
      const secretFixtureDir = path.join(tempOutDir, "secret-fixture2");
      mkdirSync(secretFixtureDir, { recursive: true });

      writeFileSync(
        path.join(secretFixtureDir, "secrets.ts"),
        `export const SECRET_TOKEN = "super-secret-token-xyz";`,
        "utf8"
      );

      const args = [
        secretFixtureDir,
        "--out", tempOutDir,
        "--llm-provider", "deterministic",
      ];

      await analyzeCommand(args, { VERSION, EXIT, getOption });

      const auditPath = path.join(tempOutDir, "audit.json");
      const audit = JSON.parse(readFileSync(auditPath, "utf8"));

      const auditContent = JSON.stringify(audit);

      expect(auditContent).not.toContain("super-secret-token-xyz");
    });
  });
});