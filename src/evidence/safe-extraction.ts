import path from "node:path";

export const UNSAFE_ZIP_ENTRY_CODE = "UNSAFE_ZIP_ENTRY";

export class UnsafeZipEntryError extends Error {
  readonly code = UNSAFE_ZIP_ENTRY_CODE;
  readonly entryName: string;

  constructor(entryName: string, reason: string) {
    super(`${UNSAFE_ZIP_ENTRY_CODE}: ${reason}: ${JSON.stringify(entryName)}`);
    this.name = "UnsafeZipEntryError";
    this.entryName = entryName;
  }
}

export interface PreparedZipEntry {
  name: string;
  data: Buffer;
  outputPath: string;
}

function reject(entryName: string, reason: string): never {
  throw new UnsafeZipEntryError(entryName, reason);
}

export function prepareSafeZipEntries(
  entries: Map<string, Buffer>,
  extractDir: string
): PreparedZipEntry[] {
  const root = path.resolve(extractDir);
  const destinations = new Set<string>();
  const prepared: PreparedZipEntry[] = [];

  for (const [entryName, data] of entries) {
    if (!entryName || entryName.includes("\0")) {
      reject(entryName, "entry name is empty or contains NUL");
    }

    const portableName = entryName.replace(/\\/g, "/");
    if (
      portableName.startsWith("/") ||
      portableName.startsWith("//") ||
      /^[A-Za-z]:/.test(portableName)
    ) {
      reject(entryName, "absolute paths are not allowed");
    }

    const segments = portableName.split("/");
    if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
      reject(entryName, "relative or empty path segments are not allowed");
    }

    const normalizedName = path.posix.normalize(portableName);
    const outputPath = path.resolve(root, ...normalizedName.split("/"));
    const relative = path.relative(root, outputPath);
    if (
      !relative ||
      relative === ".." ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      reject(entryName, "entry resolves outside the extraction directory");
    }

    const destinationKey = process.platform === "win32" ? outputPath.toLowerCase() : outputPath;
    if (destinations.has(destinationKey)) {
      reject(entryName, "multiple entries resolve to the same destination");
    }
    destinations.add(destinationKey);
    prepared.push({ name: normalizedName, data, outputPath });
  }

  return prepared;
}
