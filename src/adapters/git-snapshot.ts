/**
 * Read-only Git snapshot access for diff analysis.
 *
 * The worktree, index, and checkout are never touched.  A requested ref is
 * resolved once to a commit and all subsequent reads come from that tree.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import {
  DEFAULT_DIRECTORY_WALK_LIMITS,
  DEFAULT_IGNORED_DIRS,
  resolveDirectoryWalkLimits,
  type DirectoryWalkLimits,
} from "../core/file-utils.js";

const BATCH_TARGET_BYTES = 16 * 1024 * 1024;
const MAX_COMMAND_BUFFER = 128 * 1024 * 1024;

export interface GitSnapshotScan {
  visitedFiles: number;
  acceptedFiles: number;
  acceptedBytes: number;
  skippedFiles: number;
}

export interface GitSnapshotResult {
  revision?: string;
  paths: string[];
  contents: Map<string, string>;
  partial: boolean;
  reasons: string[];
  scan: GitSnapshotScan;
}

export interface GitSnapshotOptions {
  limits?: Partial<DirectoryWalkLimits>;
  ignoredDirs?: Set<string>;
}

interface TreeEntry {
  path: string;
  oid: string;
  mode: string;
  objectType: "blob" | "commit";
}

interface SizedEntry extends TreeEntry {
  size: number;
}

interface SnapshotState {
  reasons: string[];
  scan: GitSnapshotScan;
  startedAt: number;
  deadlineMs: number;
}

function addReason(state: SnapshotState, reason: string): void {
  if (state.reasons.length < 100 && !state.reasons.includes(reason)) state.reasons.push(reason);
}

function remainingMs(state: SnapshotState): number {
  return state.deadlineMs - (Date.now() - state.startedAt);
}

function hasTime(state: SnapshotState): boolean {
  if (remainingMs(state) > 0) return true;
  addReason(state, "SCAN_DEADLINE_EXCEEDED");
  return false;
}

function bufferOf(value: Buffer | string | undefined): Buffer {
  if (value === undefined) return Buffer.alloc(0);
  return Buffer.isBuffer(value) ? value : Buffer.from(value);
}

function commandBuffer(limit: number, perItemBytes: number): number {
  const estimated = Math.max(1024 * 1024, limit * perItemBytes + 65536);
  return Math.min(MAX_COMMAND_BUFFER, estimated);
}

function runGit(repoRoot: string, args: string[], input?: string | Buffer, maxBuffer = MAX_COMMAND_BUFFER, timeout = 30_000) {
  return spawnSync("git", args, {
    cwd: repoRoot,
    input,
    shell: false,
    windowsHide: true,
    timeout: Math.max(1, timeout),
    maxBuffer,
  });
}

function failedSnapshot(reasons: string[], scan?: Partial<GitSnapshotScan>): GitSnapshotResult {
  return {
    paths: [],
    contents: new Map(),
    partial: true,
    reasons,
    scan: {
      visitedFiles: scan?.visitedFiles ?? 0,
      acceptedFiles: scan?.acceptedFiles ?? 0,
      acceptedBytes: scan?.acceptedBytes ?? 0,
      skippedFiles: scan?.skippedFiles ?? 0,
    },
  };
}

function safeRef(ref: string): boolean {
  return ref.length > 0 && !ref.includes("\0") && !ref.startsWith("-");
}

function normalizeGitPath(value: string): string | undefined {
  if (value.includes("\\")) return undefined;
  const normalized = value.replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || path.posix.isAbsolute(normalized)) return undefined;
  const parts = normalized.split("/");
  if (parts.some(part => part === "" || part === "." || part === "..")) return undefined;
  return normalized;
}

function ignoredPath(relativePath: string, ignored: Set<string>): boolean {
  return relativePath.split("/").some(segment =>
    ignored.has(segment) || segment.startsWith(".qh") || segment.startsWith(".test-temp")
  );
}

function parseTree(output: Buffer, state: SnapshotState): TreeEntry[] {
  const entries: TreeEntry[] = [];
  for (const record of output.toString("utf8").split("\0")) {
    if (!record) continue;
    const separator = record.indexOf("\t");
    if (separator < 0) continue;
    const header = record.slice(0, separator).match(/^(\d+) (blob|commit) ([0-9a-f]+)$/);
    if (!header) continue;
    const rawPath = record.slice(separator + 1);
    const relativePath = normalizeGitPath(rawPath);
    if (relativePath) {
      entries.push({
        path: relativePath,
        oid: header[3],
        mode: header[1],
        objectType: header[2] as "blob" | "commit",
      });
    } else {
      addReason(state, `UNSAFE_TREE_PATH:${rawPath}`);
      state.scan.skippedFiles += 1;
    }
  }
  return entries;
}

function parseBatchCheck(output: Buffer, entries: TreeEntry[], state: SnapshotState): SizedEntry[] {
  const lines = output.toString("utf8").split("\n");
  const sized: SizedEntry[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    const line = lines[index] ?? "";
    const match = line.match(/^([0-9a-f]+) blob (\d+)$/);
    if (!match || match[1] !== entries[index].oid) {
      state.scan.skippedFiles += 1;
      addReason(state, `BLOB_METADATA_FAILED:${entries[index].path}`);
      continue;
    }
    sized.push({ ...entries[index], size: Number(match[2]) });
  }
  return sized;
}

function selectEntries(
  entries: TreeEntry[],
  limits: DirectoryWalkLimits,
  ignored: Set<string>,
  state: SnapshotState
): TreeEntry[] {
  const selected: TreeEntry[] = [];
  for (const entry of entries) {
    if (ignoredPath(entry.path, ignored)) continue;
    if (entry.objectType !== "blob" || entry.mode === "120000") {
      state.scan.skippedFiles += 1;
      addReason(state, `UNSUPPORTED_TREE_ENTRY:${entry.path}`);
      continue;
    }
    const depth = entry.path.split("/").length - 1;
    if (depth > limits.maxDepth) {
      state.scan.skippedFiles += 1;
      addReason(state, `MAX_DEPTH_EXCEEDED:${entry.path}`);
      continue;
    }
    if (selected.length >= limits.maxFiles) {
      state.scan.skippedFiles += 1;
      addReason(state, "MAX_FILES_EXCEEDED");
      break;
    }
    state.scan.visitedFiles += 1;
    selected.push(entry);
  }
  return selected;
}

function sizeEntries(
  entries: TreeEntry[],
  repoRoot: string,
  state: SnapshotState
): SizedEntry[] {
  if (entries.length === 0) return [];
  if (!hasTime(state)) {
    state.scan.skippedFiles += entries.length;
    return [];
  }
  const input = entries.map(entry => entry.oid).join("\n") + "\n";
  const result = runGit(repoRoot, ["cat-file", "--batch-check"], input, commandBuffer(entries.length, 100), Math.max(1, remainingMs(state)));
  if (result.error || result.status !== 0) {
    if (!hasTime(state)) addReason(state, "BLOB_METADATA_TIMEOUT");
    else addReason(state, result.error?.message || "BLOB_METADATA_FAILED");
    state.scan.skippedFiles += entries.length;
    return [];
  }
  if (!hasTime(state)) {
    state.scan.skippedFiles += entries.length;
    return [];
  }
  return parseBatchCheck(bufferOf(result.stdout), entries, state);
}

function acceptedEntries(
  entries: SizedEntry[],
  limits: DirectoryWalkLimits,
  state: SnapshotState
): SizedEntry[] {
  const accepted: SizedEntry[] = [];
  for (const entry of entries) {
    if (entry.size > limits.maxFileSizeBytes) {
      state.scan.skippedFiles += 1;
      addReason(state, `MAX_FILE_SIZE_EXCEEDED:${entry.path}`);
      continue;
    }
    if (state.scan.acceptedBytes + entry.size > limits.maxTotalBytes) {
      state.scan.skippedFiles += 1;
      addReason(state, "MAX_TOTAL_BYTES_EXCEEDED");
      break;
    }
    state.scan.acceptedBytes += entry.size;
    accepted.push(entry);
  }
  return accepted;
}

function readBatch(
  repoRoot: string,
  entries: SizedEntry[],
  state: SnapshotState
): Map<string, string> {
  const contents = new Map<string, string>();
  if (!hasTime(state)) {
    state.scan.skippedFiles += entries.length;
    return contents;
  }
  const input = entries.map(entry => entry.oid).join("\n") + "\n";
  const expectedBytes = entries.reduce((sum, entry) => sum + entry.size, 0);
  const result = runGit(repoRoot, ["cat-file", "--batch"], input, Math.min(MAX_COMMAND_BUFFER, expectedBytes + entries.length * 128 + 65536), Math.max(1, remainingMs(state)));
  if (result.error || result.status !== 0) {
    if (!hasTime(state)) addReason(state, "BLOB_READ_TIMEOUT");
    else addReason(state, result.error?.message || "BLOB_READ_FAILED");
    state.scan.skippedFiles += entries.length;
    return contents;
  }
  const output = bufferOf(result.stdout);
  let offset = 0;
  for (const entry of entries) {
    const headerEnd = output.indexOf(0x0a, offset);
    if (headerEnd < 0) {
      addReason(state, `BLOB_READ_FAILED:${entry.path}`);
      state.scan.skippedFiles += 1;
      continue;
    }
    const header = output.subarray(offset, headerEnd).toString("ascii").match(/^([0-9a-f]+) blob (\d+)$/);
    const bodyStart = headerEnd + 1;
    const bodySize = header ? Number(header[2]) : -1;
    if (!header || header[1] !== entry.oid || bodySize !== entry.size || bodyStart + bodySize > output.length) {
      addReason(state, `BLOB_READ_FAILED:${entry.path}`);
      state.scan.skippedFiles += 1;
      continue;
    }
    contents.set(entry.path, output.subarray(bodyStart, bodyStart + bodySize).toString("utf8"));
    offset = bodyStart + bodySize;
    if (output[offset] === 0x0a) offset += 1;
  }
  return contents;
}

function readBatches(repoRoot: string, entries: SizedEntry[], state: SnapshotState): Map<string, string> {
  const contents = new Map<string, string>();
  let batch: SizedEntry[] = [];
  let bytes = 0;
  const flush = () => {
    if (batch.length === 0) return;
    if (!hasTime(state)) {
      state.scan.skippedFiles += batch.length;
      batch = [];
      bytes = 0;
      return;
    }
    for (const [filePath, content] of readBatch(repoRoot, batch, state)) contents.set(filePath, content);
    batch = [];
    bytes = 0;
  };
  for (const entry of entries) {
    if (!hasTime(state)) {
      state.scan.skippedFiles += entries.length - entries.indexOf(entry);
      break;
    }
    if (batch.length > 0 && bytes + entry.size > BATCH_TARGET_BYTES) flush();
    batch.push(entry);
    bytes += entry.size;
  }
  flush();
  state.scan.acceptedFiles = contents.size;
  return contents;
}

/**
 * Load the tracked files at a fixed Git commit.
 *
 * The returned paths and contents describe the same immutable tree.  A
 * non-empty reason always makes the result partial so callers cannot silently
 * treat a bounded or failed scan as complete.
 */
export function readGitSnapshot(
  repoRoot: string,
  headRef: string,
  options: GitSnapshotOptions = {}
): GitSnapshotResult {
  const limits = resolveDirectoryWalkLimits(options.limits);
  const ignored = options.ignoredDirs ?? DEFAULT_IGNORED_DIRS;
  const state: SnapshotState = {
    reasons: [],
    scan: { visitedFiles: 0, acceptedFiles: 0, acceptedBytes: 0, skippedFiles: 0 },
    startedAt: Date.now(),
    deadlineMs: limits.deadlineMs,
  };
  if (limits.deadlineMs <= 0) return failedSnapshot(["SCAN_DEADLINE_EXCEEDED"], state.scan);
  if (!safeRef(headRef)) return failedSnapshot(["HEAD_REF_INVALID"]);
  if (!hasTime(state)) return failedSnapshot(state.reasons, state.scan);

  const revisionResult = runGit(
    repoRoot,
    ["rev-parse", "--verify", "--end-of-options", `${headRef}^{commit}`],
    undefined,
    1024 * 1024,
    remainingMs(state)
  );
  const revision = bufferOf(revisionResult.stdout).toString("utf8").trim();
  if (revisionResult.error || revisionResult.status !== 0 || !/^[0-9a-f]{40,64}$/.test(revision)) {
    return failedSnapshot([revisionResult.error?.message || "HEAD_REF_INVALID"], state.scan);
  }
  if (!hasTime(state)) {
    return { revision, paths: [], contents: new Map(), partial: true, reasons: state.reasons, scan: state.scan };
  }

  const treeResult = runGit(
    repoRoot,
    ["ls-tree", "-r", "-z", "--full-tree", "--end-of-options", revision],
    undefined,
    commandBuffer(limits.maxFiles, 2048),
    Math.max(1, remainingMs(state))
  );
  if (treeResult.error || treeResult.status !== 0) {
    if (!hasTime(state)) addReason(state, "TREE_SCAN_TIMEOUT");
    else addReason(state, treeResult.error?.message || "TREE_SCAN_FAILED");
    return { revision, paths: [], contents: new Map(), partial: true, reasons: state.reasons, scan: state.scan };
  }

  if (!hasTime(state)) {
    return { revision, paths: [], contents: new Map(), partial: true, reasons: state.reasons, scan: state.scan };
  }
  const entries = selectEntries(parseTree(bufferOf(treeResult.stdout), state), limits, ignored, state);
  const sized = sizeEntries(entries, repoRoot, state);
  const accepted = acceptedEntries(sized, limits, state);
  const contents = readBatches(repoRoot, accepted, state);
  return {
    revision,
    paths: [...contents.keys()],
    contents,
    partial: state.reasons.length > 0,
    reasons: state.reasons,
    scan: state.scan,
  };
}

export { DEFAULT_DIRECTORY_WALK_LIMITS };
