import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { viewerCommand } from "../viewer.js";

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
  ASSURANCE_FAILED: 11,
};

const VERSION = "0.1.0";

function getOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function sha256(content: Buffer | string): string {
  return createHash("sha256").update(content).digest("hex");
}

function writeFindingsArtifact(dir: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, "findings.json"),
    JSON.stringify({
      version: "ctg/v1",
      generated_at: "2026-07-05T00:00:00Z",
      run_id: "hosted-viewer-run",
      repo: { root: "." },
      tool: { name: "code-to-gate", version: VERSION, plugin_versions: [] },
      artifact: "findings",
      schema: "findings@v1",
      completeness: "complete",
      findings: [],
      unsupported_claims: [],
    }, null, 2) + "\n",
    "utf8"
  );
}

describe("viewer CLI", () => {
  let tempRoot: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), "ctg-viewer-cli-"));
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    if (existsSync(tempRoot)) {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("generates hosted static report manifest next to the HTML output", async () => {
    const artifactDir = path.join(tempRoot, "artifacts");
    const outDir = path.join(tempRoot, "public");
    const htmlPath = path.join(outDir, "index.html");
    const manifestPath = path.join(outDir, "hosted-static-report.json");
    writeFindingsArtifact(artifactDir);

    const exitCode = await viewerCommand([
      "--from",
      artifactDir,
      "--out",
      htmlPath,
      "--hosted",
      "--hosted-target",
      "github-pages",
      "--public-url",
      "https://example.github.io/repo/",
      "--redaction-profile",
      "regulated",
    ], { VERSION, EXIT, getOption });

    expect(exitCode).toBe(EXIT.OK);
    expect(existsSync(htmlPath)).toBe(true);
    expect(existsSync(manifestPath)).toBe(true);

    const html = readFileSync(htmlPath, "utf8");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

    expect(manifest).toMatchObject({
      artifact: "hosted-static-report",
      schema: "hosted-static-report@v1",
      run_id: "hosted-viewer-run",
      target: "github-pages",
      publicUrl: "https://example.github.io/repo/",
      redactionProfile: { name: "regulated" },
      html: {
        path: path.relative(process.cwd(), htmlPath),
        hashSha256: sha256(html),
        singleFile: true,
        externalAssets: [],
      },
      security: {
        selfContained: true,
        externalNetworkRequired: false,
        inlineAssets: true,
      },
      generated_by: "ctg-viewer-hosted-v1",
    });
    expect(manifest.redactionSummary.warnings).toContain("regulated profile requires signer");
    expect(html).toContain("Redaction");
    expect(html).toContain("regulated profile requires signer");
    expect(manifest.html.sizeBytes).toBe(Buffer.byteLength(html, "utf8"));
    expect(manifest.sourceArtifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "findings",
          file: path.relative(process.cwd(), path.join(artifactDir, "findings.json")),
          schema: "findings@v1",
          hashSha256: sha256(readFileSync(path.join(artifactDir, "findings.json"))),
        }),
      ])
    );
  });

  it("rejects an unknown hosted target", async () => {
    const artifactDir = path.join(tempRoot, "artifacts");
    const htmlPath = path.join(tempRoot, "public", "index.html");
    writeFindingsArtifact(artifactDir);

    const exitCode = await viewerCommand([
      "--from",
      artifactDir,
      "--out",
      htmlPath,
      "--hosted",
      "--hosted-target",
      "ftp",
    ], { VERSION, EXIT, getOption });

    expect(exitCode).toBe(EXIT.USAGE_ERROR);
    expect(existsSync(htmlPath)).toBe(false);
  });
});
