import { beforeEach, describe, expect, it, vi } from "vitest";

const { execFileMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

import {
  buildDockerImage,
  checkDockerImageExists,
  checkDockerVersion,
  execDockerCommand,
  getContainerLogs,
  getDockerSystemMemory,
  listRunningPluginContainers,
  pullDockerImage,
  stopAndRemoveContainer,
} from "../docker-exec-utils.js";

type ExecCallback = (
  error: (Error & { killed?: boolean; code?: number | string }) | null,
  stdout: string,
  stderr: string
) => void;

function complete(
  error: Parameters<ExecCallback>[0],
  stdout = "",
  stderr = ""
): void {
  execFileMock.mockImplementationOnce(
    (_file: string, _args: string[], _options: object, callback: ExecCallback) => {
      callback(error, stdout, stderr);
    }
  );
}

describe("docker exec utilities", () => {
  beforeEach(() => {
    execFileMock.mockReset();
  });

  it("passes executable and atomic argv without a shell", async () => {
    complete(null, "ok", "");

    await expect(
      execDockerCommand(["docker", "image", "inspect", "image; echo unsafe"], 1234)
    ).resolves.toEqual({ stdout: "ok", stderr: "", exitCode: 0 });

    expect(execFileMock).toHaveBeenCalledWith(
      "docker",
      ["image", "inspect", "image; echo unsafe"],
      expect.objectContaining({ timeout: 1234, windowsHide: true }),
      expect.any(Function)
    );
  });

  it("rejects an empty command", async () => {
    await expect(execDockerCommand([], 100)).rejects.toThrow(
      "Docker command must include an executable"
    );
  });

  it("maps timeout and numeric/non-numeric process errors", async () => {
    complete(Object.assign(new Error("timeout"), { killed: true }), "", "late");
    await expect(execDockerCommand(["docker"], 1)).resolves.toEqual({
      stdout: "",
      stderr: "late\nProcess killed due to timeout",
      exitCode: 137,
    });

    complete(Object.assign(new Error("exit"), { code: 23 }), "", "bad");
    await expect(execDockerCommand(["docker"], 1)).resolves.toMatchObject({
      stderr: "bad",
      exitCode: 23,
    });

    complete(Object.assign(new Error("spawn"), { code: "ENOENT" }));
    await expect(execDockerCommand(["docker"], 1)).resolves.toMatchObject({
      exitCode: 1,
    });
  });

  it("covers Docker probe and image helper outcomes", async () => {
    complete(null, "Docker version 1\n");
    await expect(checkDockerVersion()).resolves.toEqual({
      available: true,
      version: "Docker version 1",
    });

    complete(Object.assign(new Error("missing"), { code: 1 }));
    await expect(checkDockerVersion()).resolves.toEqual({ available: false });

    complete(null);
    await expect(checkDockerImageExists("safe image")).resolves.toBe(true);
    complete(Object.assign(new Error("missing"), { code: 1 }));
    await expect(checkDockerImageExists("missing")).resolves.toBe(false);

    complete(null, String(2 * 1024 * 1024 * 1024));
    await expect(getDockerSystemMemory()).resolves.toBe(2048);
    complete(null, "not-a-number");
    await expect(getDockerSystemMemory()).resolves.toBeUndefined();
  });

  it("covers container and build helpers", async () => {
    complete(null);
    await expect(pullDockerImage("image name")).resolves.toBe(true);

    complete(null, "one\n\ntwo\n");
    await expect(listRunningPluginContainers("ctg; unsafe")).resolves.toEqual([
      "one",
      "two",
    ]);

    complete(null, "container logs");
    await expect(getContainerLogs("container id")).resolves.toBe("container logs");

    complete(null);
    complete(null);
    await expect(stopAndRemoveContainer("container id")).resolves.toBe(true);

    complete(Object.assign(new Error("missing"), { code: 1 }), "", "No such container");
    complete(Object.assign(new Error("missing"), { code: 1 }), "", "No such container");
    await expect(stopAndRemoveContainer("missing")).resolves.toBe(false);

    complete(null);
    await expect(buildDockerImage("image name", "path with spaces")).resolves.toBe(true);
  });
});
