import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { buildGraph, clearGraphCache } from "../../core/repo-graph-builder.js";
import { nodeClockService } from "../../adapters/node-clock-service.js";

let root: string | undefined;

afterEach(() => {
  vi.useRealTimers();
  clearGraphCache();
  if (root) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

describe("independent run identity", () => {
  it("distinguishes repeated analysis in the same instant while keeping source identity stable", () => {
    root = mkdtempSync(path.join(tmpdir(), "ctg-run-identity-"));
    writeFileSync(path.join(root, "index.ts"), "export const value = 1;\n");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-10T12:34:56.789Z"));

    const first = buildGraph(root, "test-version");
    const second = buildGraph(root, "test-version");

    expect(first.run_id).not.toBe(second.run_id);
    expect(first.generated_at).toBe(second.generated_at);
    expect(first.files.length).toBeGreaterThan(0);
    expect(first.files).toEqual(second.files);
    expect(first.repo).toEqual(second.repo);
  });

  it("distinguishes clock-service runs without relying on a clock tick", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-10T12:34:56.789Z"));
    const ids = new Set(Array.from({ length: 100 }, () => nodeClockService.runId()));
    expect(ids.size).toBe(100);
  });
});
