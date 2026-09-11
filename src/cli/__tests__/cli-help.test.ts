import { afterEach, describe, expect, it, vi } from "vitest";

interface CliRunResult {
  code: number | string | undefined;
  stdout: string;
  stderr: string;
}

async function runSourceCli(args: string[]): Promise<CliRunResult> {
  const originalArgv = process.argv;
  const originalExitCode = process.exitCode;
  const stdout: string[] = [];
  const stderr: string[] = [];
  const log = vi.spyOn(console, "log").mockImplementation((...values) => {
    stdout.push(values.join(" "));
  });
  const error = vi.spyOn(console, "error").mockImplementation((...values) => {
    stderr.push(values.join(" "));
  });

  try {
    process.argv = ["node", "code-to-gate", ...args];
    process.exitCode = undefined;
    vi.resetModules();
    await import("../../cli.js?cli-help-regression");
    await new Promise<void>((resolve) => setImmediate(resolve));
    return { code: process.exitCode, stdout: stdout.join("\n"), stderr: stderr.join("\n") };
  } finally {
    process.argv = originalArgv;
    process.exitCode = originalExitCode;
    log.mockRestore();
    error.mockRestore();
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("public CLI global help", () => {
  it.each(["scan", "export", "doctor"])(
    "returns success for %s --help before required-argument validation",
    async (command) => {
      const result = await runSourceCli([command, "--help"]);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("code-to-gate 1.6.0");
      expect(result.stdout).toContain(`code-to-gate ${command}`);
      expect(result.stderr).toBe("");
    }
  );

  it("does not treat --help used as an option value as a help request", async () => {
    const result = await runSourceCli(["scan", "--out", "--help"]);

    expect(result.code).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("out");
  });

  it("keeps unknown command handling unchanged", async () => {
    const result = await runSourceCli(["unknown-command", "--help"]);

    expect(result.code).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("unknown command: unknown-command");
  });
});
