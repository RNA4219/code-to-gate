import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { importCommand } from "../import.js";
import { consumeImportArtifacts } from "../import-consumer.js";
import { EXIT, getOption, VERSION } from "../exit-codes.js";

function semgrepReport(errors: Array<{ message: string }> = []) {
  return {
    version: "1.164.0",
    results: [{
      check_id: "security.test",
      path: "src/security.ts",
      start: { line: 1, col: 1 },
      end: { line: 1, col: 2 },
      extra: { message: "finding", severity: "ERROR" },
    }],
    errors,
  };
}

function sha256Text(value: string): string {
  return "sha256:" + createHash("sha256").update(value, "utf8").digest("hex");
}

describe("import artifact consumer", () => {
  let root: string;
  let caseDir: string;
  let outDir: string;
  const repoRoot = process.cwd();

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), "ctg-import-consumer-"));
  });

  beforeEach(() => {
    caseDir = path.join(root, "case");
    rmSync(caseDir, { recursive: true, force: true });
    mkdirSync(caseDir, { recursive: true });
    outDir = path.join(caseDir, "out");
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  async function createImport(errors: Array<{ message: string }> = []): Promise<void> {
    const inputFile = path.join(caseDir, "semgrep.json");
    writeFileSync(inputFile, JSON.stringify(semgrepReport(errors)), "utf8");
    const result = await importCommand(
      ["semgrep", inputFile, "--out", outDir],
      { VERSION, EXIT, getOption }
    );
    expect(result).toBe(errors.length > 0 ? EXIT.PARTIAL_SUCCESS : EXIT.OK);
  }

  function findingsPath(): string {
    return path.join(outDir, "imports", "semgrep-findings.json");
  }

  function manifestPath(): string {
    return path.join(outDir, "imports", "semgrep-import-manifest.json");
  }

  it("accepts a fully bound current import", async () => {
    await createImport();

    const consumed = await consumeImportArtifacts(path.join(outDir, "imports"), repoRoot);

    expect(consumed.completeness).toBe("complete");
    expect(consumed.loadedTools).toEqual(["semgrep"]);
    expect(consumed.findings).toHaveLength(1);
    expect(consumed.incompleteReasons).toEqual([]);
  });

  it("accepts a legacy artifact only as partial", async () => {
    await createImport();
    unlinkSync(manifestPath());

    const consumed = await consumeImportArtifacts(path.join(outDir, "imports"), repoRoot);

    expect(consumed.findings).toHaveLength(1);
    expect(consumed.completeness).toBe("partial");
    expect(consumed.incompleteReasons).toEqual(["LEGACY_IMPORT_MANIFEST_MISSING:semgrep"]);
  });

  it("accepts a verified partial manifest and propagates diagnostics", async () => {
    await createImport([{ message: "scanner failed one target" }]);

    const consumed = await consumeImportArtifacts(path.join(outDir, "imports"), repoRoot);

    expect(consumed.findings).toHaveLength(1);
    expect(consumed.completeness).toBe("partial");
    expect(consumed.incompleteReasons).toEqual(
      expect.arrayContaining(["IMPORT_PARTIAL:semgrep", "IMPORT_DIAGNOSTIC:semgrep:SEMGREP_ERROR"])
    );
  });

  it("rejects normalized finding hash tampering", async () => {
    await createImport();
    writeFileSync(findingsPath(), readFileSync(findingsPath(), "utf8") + " ", "utf8");

    await expect(
      consumeImportArtifacts(path.join(outDir, "imports"), repoRoot)
    ).rejects.toThrow(/hash mismatch/);
  });

  it("rejects tool identity tampering", async () => {
    await createImport();
    const manifest = JSON.parse(readFileSync(manifestPath(), "utf8"));
    manifest.source.tool = "eslint";
    writeFileSync(manifestPath(), JSON.stringify(manifest, null, 2) + "\n", "utf8");

    await expect(
      consumeImportArtifacts(path.join(outDir, "imports"), repoRoot)
    ).rejects.toThrow(/tool mismatch/);
  });

  it("rejects a stale but structurally valid repository revision", async () => {
    await createImport();
    const findingsText = readFileSync(findingsPath(), "utf8");
    const findings = JSON.parse(findingsText);
    const stale = "0".repeat(40);
    findings.repo.revision = stale;
    const rewrittenFindings = JSON.stringify(findings, null, 2) + "\n";
    writeFileSync(findingsPath(), rewrittenFindings, "utf8");

    const manifest = JSON.parse(readFileSync(manifestPath(), "utf8"));
    manifest.repo.revision = stale;
    manifest.source.repository_revision = stale;
    manifest.normalized.sha256 = sha256Text(rewrittenFindings);
    manifest.normalized.size_bytes = Buffer.byteLength(rewrittenFindings, "utf8");
    writeFileSync(manifestPath(), JSON.stringify(manifest, null, 2) + "\n", "utf8");

    await expect(
      consumeImportArtifacts(path.join(outDir, "imports"), repoRoot)
    ).rejects.toThrow(/current HEAD/);
  });

  it("rejects duplicate IDs against native findings", async () => {
    await createImport();
    const imported = JSON.parse(readFileSync(findingsPath(), "utf8"));
    const existingId = imported.findings[0].id;

    await expect(
      consumeImportArtifacts(path.join(outDir, "imports"), repoRoot, [existingId])
    ).rejects.toThrow(/duplicate finding id/);
  });

  it("returns complete when the imports directory is absent", async () => {
    const missing = path.join(outDir, "imports");
    expect(existsSync(missing)).toBe(false);

    await expect(consumeImportArtifacts(missing, repoRoot)).resolves.toEqual({
      findings: [],
      completeness: "complete",
      incompleteReasons: [],
      loadedTools: [],
    });
  });
});
