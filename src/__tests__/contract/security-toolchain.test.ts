import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { load } from "js-yaml";

const ROOT = path.resolve(import.meta.dirname, "../../..");

function read(relativePath: string): string {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("security toolchain contract", () => {
  it("pins external scanners to exact versions and SHA-256 digests", () => {
    const lock = JSON.parse(read("security/toolchain-lock.json")) as {
      schema: string;
      tools: {
        semgrep: { version: string; image: string; digest: string };
        gitleaks: { version: string; archive: { url: string; sha256: string } };
        npm: { version: string; sbomFormat: string };
      };
    };

    expect(lock.schema).toBe("ctg/security-toolchain-lock/v1");
    expect(lock.tools.semgrep.version).toBe("1.164.0");
    expect(lock.tools.semgrep.image).toBe(`semgrep/semgrep@${lock.tools.semgrep.digest}`);
    expect(lock.tools.semgrep.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(lock.tools.gitleaks.version).toBe("8.30.1");
    expect(lock.tools.gitleaks.archive.url).toContain("/releases/download/v8.30.1/");
    expect(lock.tools.gitleaks.archive.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(lock.tools.npm).toMatchObject({ version: "10.9.8", sbomFormat: "cyclonedx" });
  });

  it("keeps the security workflow least-privileged and action refs immutable", () => {
    const source = read(".github/workflows/security-gate.yml");
    const workflow = load(source) as {
      permissions: Record<string, string>;
      jobs: Record<string, unknown>;
    };

    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(workflow.jobs).toHaveProperty("security-gate");
    expect(source).not.toMatch(/uses:\s+[^\s]+@v\d+/);
    expect(source).toContain("--network none");
    expect(source).toContain("--read-only");
    expect(source).toContain("--cap-drop ALL");
    expect(source).toContain("npm ci --ignore-scripts");
  });

  it("uses only local Semgrep rules and keeps synthetic secrets out of source", () => {
    const semgrep = load(read(".semgrep/security.yml")) as {
      rules: Array<{ id: string; severity: string }>;
    };
    const goldenScript = read("scripts/security-golden.mjs");

    expect(semgrep.rules.map((rule) => rule.id)).toContain("ctg.javascript.no-eval");
    expect(semgrep.rules.every((rule) => rule.severity === "ERROR")).toBe(true);
    expect(goldenScript).not.toMatch(/ghp_[A-Za-z0-9]{36}/);
  });

  it("limits historical secret suppressions to exact fingerprints", () => {
    const fingerprints = read(".gitleaksignore").trim().split(/\r?\n/);

    expect(fingerprints).toHaveLength(3);
    expect(new Set(fingerprints).size).toBe(fingerprints.length);
    for (const fingerprint of fingerprints) {
      expect(fingerprint).toMatch(/^[0-9a-f]{40}:[^:\r\n]+:[a-z0-9-]+:\d+$/);
    }
  });
});
