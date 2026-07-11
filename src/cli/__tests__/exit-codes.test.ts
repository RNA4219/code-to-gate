import { describe, expect, it } from "vitest";
import {
  EXIT,
  VERSION,
  isVerbose,
  parseCacheMode,
  parseParallelWorkers,
  parseSandboxModeCli,
} from "../exit-codes.js";

describe("CLI exit-code helpers", () => {
  it("exposes stable version and numeric exit codes", () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
    expect(Object.values(EXIT)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
  });

  it("parses cache, worker, verbose, and sandbox options", () => {
    expect(parseCacheMode(undefined)).toBe("enabled");
    expect(parseCacheMode("enabled")).toBe("enabled");
    expect(parseCacheMode("disabled")).toBe("disabled");
    expect(parseCacheMode("force")).toBe("force");
    expect(parseCacheMode("unknown")).toBe("enabled");

    expect(parseParallelWorkers(undefined)).toBe(4);
    expect(parseParallelWorkers("bad")).toBe(4);
    expect(parseParallelWorkers("0")).toBe(4);
    expect(parseParallelWorkers("2")).toBe(2);
    expect(parseParallelWorkers("99")).toBe(16);

    expect(isVerbose(["--verbose"])).toBe(true);
    expect(isVerbose(["-v"])).toBe(true);
    expect(isVerbose([])).toBe(false);

    expect(parseSandboxModeCli(undefined)).toBe("none");
    expect(parseSandboxModeCli("none")).toBe("none");
    expect(parseSandboxModeCli("disabled")).toBe("none");
    expect(parseSandboxModeCli("docker")).toBe("docker");
    expect(parseSandboxModeCli("invalid")).toBe("none");
  });
});
