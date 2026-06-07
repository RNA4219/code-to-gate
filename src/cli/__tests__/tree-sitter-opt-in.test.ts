import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { scanCommand } from "../scan.js";

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

function getOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

describe("scan CLI Tree-sitter opt-in", () => {
  const fixtureDir = path.resolve(import.meta.dirname, "../../../fixtures/demo-multilang");
  const tempDir = path.join(tmpdir(), `ctg-tree-sitter-opt-in-${Date.now()}`);

  beforeAll(() => mkdirSync(tempDir, { recursive: true }));

  afterAll(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("does not initialize Tree-sitter without --tree-sitter", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const result = await scanCommand([fixtureDir, "--out", path.join(tempDir, "default"), "--verbose"], {
      VERSION: "test",
      EXIT,
      getOption,
    });

    expect(result).toBe(EXIT.OK);
    expect(log.mock.calls.flat().join("\n")).not.toContain('"phase":"tree-sitter-init"');
    log.mockRestore();
  });

  it("initializes Tree-sitter with --tree-sitter", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const result = await scanCommand(
      [fixtureDir, "--out", path.join(tempDir, "explicit"), "--verbose", "--tree-sitter"],
      { VERSION: "test", EXIT, getOption },
    );

    expect(result).toBe(EXIT.OK);
    expect(log.mock.calls.flat().join("\n")).toContain('"phase":"tree-sitter-init"');
    log.mockRestore();
  });
});
