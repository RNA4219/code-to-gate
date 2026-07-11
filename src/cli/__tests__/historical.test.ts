import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { historicalCommand } from "../historical.js";
import { EXIT, VERSION, getOption } from "../exit-codes.js";
import {
  createMockFinding,
  createMockFindingsArtifact,
  createMockReleaseReadinessArtifact,
  createMockRisk,
  createMockRiskRegisterArtifact,
} from "../../test-utils/index.js";

const TEST_DIR = path.join(process.cwd(), ".test-temp", "historical-cli");

function writeRun(
  dir: string,
  runId: string,
  generatedAt: string,
  severity?: "low" | "medium" | "high" | "critical"
): void {
  mkdirSync(dir, { recursive: true });
  const finding = severity
    ? createMockFinding(severity, "security", {
      id: "finding-" + runId,
      ruleId: "RULE",
    })
    : undefined;
  writeFileSync(path.join(dir, "findings.json"), JSON.stringify(
    createMockFindingsArtifact({
      run_id: runId,
      generated_at: generatedAt,
      repo: { root: "/repo", revision: runId, branch: "main" },
      findings: finding ? [finding] : [],
    })
  ));
  writeFileSync(path.join(dir, "risk-register.json"), JSON.stringify(
    createMockRiskRegisterArtifact({
      run_id: runId,
      generated_at: generatedAt,
      risks: severity ? [createMockRisk({ id: "risk-" + runId })] : [],
    })
  ));
  writeFileSync(path.join(dir, "release-readiness.json"), JSON.stringify(
    createMockReleaseReadinessArtifact({
      run_id: runId,
      generated_at: generatedAt,
      status: severity === "critical" ? "blocked" : "passed",
    })
  ));
}

describe("historical CLI", () => {
  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("covers usage, missing paths, files, and missing findings", async () => {
    await expect(historicalCommand([], { VERSION, EXIT, getOption }))
      .resolves.toBe(EXIT.USAGE_ERROR);
    await expect(historicalCommand([
      "--current", "missing", "--previous", "missing",
    ], { VERSION, EXIT, getOption })).resolves.toBe(EXIT.USAGE_ERROR);

    const file = path.join(TEST_DIR, "file");
    writeFileSync(file, "not a directory");
    await expect(historicalCommand([
      "--current", file, "--previous", TEST_DIR,
    ], { VERSION, EXIT, getOption })).resolves.toBe(EXIT.USAGE_ERROR);

    const current = path.join(TEST_DIR, "current");
    mkdirSync(current);
    await expect(historicalCommand([
      "--current", current, "--previous", "missing",
    ], { VERSION, EXIT, getOption })).resolves.toBe(EXIT.USAGE_ERROR);
    await expect(historicalCommand([
      "--current", current, "--previous", file,
    ], { VERSION, EXIT, getOption })).resolves.toBe(EXIT.USAGE_ERROR);

    const previous = path.join(TEST_DIR, "previous");
    mkdirSync(previous);
    await expect(historicalCommand([
      "--current", current, "--previous", previous,
    ], { VERSION, EXIT, getOption })).resolves.toBe(EXIT.USAGE_ERROR);
    writeRun(current, "current", "2026-02-01T00:00:00.000Z");
    await expect(historicalCommand([
      "--current", current, "--previous", previous,
    ], { VERSION, EXIT, getOption })).resolves.toBe(EXIT.USAGE_ERROR);
  });

  it("writes comparison and trend history with optional evidence", async () => {
    const previous = path.join(TEST_DIR, "previous");
    const current = path.join(TEST_DIR, "current");
    const history = path.join(TEST_DIR, "history");
    const oldRun = path.join(history, "old-run");
    const futureRun = path.join(history, "future-run");
    writeRun(previous, "previous", "2026-01-01T00:00:00.000Z", "medium");
    writeRun(current, "current", "2026-03-01T00:00:00.000Z", "high");
    writeRun(oldRun, "old", "2025-12-01T00:00:00.000Z", "low");
    writeRun(futureRun, "future", "2027-01-01T00:00:00.000Z", "critical");
    writeFileSync(path.join(oldRun, "spec-drift.json"), JSON.stringify({
      status: "failed",
    }));
    const readiness = createMockReleaseReadinessArtifact({
      run_id: "old",
      generated_at: "2025-12-01T00:00:00.000Z",
    });
    Object.assign(readiness, {
      baseline: { expiresAt: "2025-01-01T00:00:00.000Z" },
    });
    writeFileSync(
      path.join(oldRun, "release-readiness.json"),
      JSON.stringify(readiness)
    );
    const out = path.join(TEST_DIR, "nested", "comparison.json");

    const result = await historicalCommand([
      "--current", current,
      "--previous", previous,
      "--history", history,
      "--out", out,
    ], { VERSION, EXIT, getOption });
    expect([EXIT.OK, EXIT.READINESS_NOT_CLEAR]).toContain(result);
    const report = JSON.parse(readFileSync(out, "utf8"));
    expect(report.currentRun.run_id).toBe("current");
    expect(report.riskTrends.historyPoints.some(
      (point: { run_id: string }) => point.run_id === "old"
    )).toBe(true);
    expect(report.riskTrends.historyPoints.some(
      (point: { run_id: string }) => point.run_id === "future"
    )).toBe(false);
  });

  it("uses default output and blocks a new critical regression", async () => {
    const previous = path.join(TEST_DIR, "baseline");
    const current = path.join(TEST_DIR, "critical");
    writeRun(previous, "baseline", "2026-01-01T00:00:00.000Z", "medium");
    writeRun(current, "critical", "2026-02-01T00:00:00.000Z", "critical");

    await expect(historicalCommand([
      "--current", current,
      "--previous", previous,
      "--history", path.join(TEST_DIR, "missing-history"),
    ], { VERSION, EXIT, getOption })).resolves.toBe(EXIT.READINESS_NOT_CLEAR);
    expect(readFileSync(
      path.join(current, "historical-comparison.json"),
      "utf8"
    )).toContain('"artifact": "historical-comparison"');
  });
});
