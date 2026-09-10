import { randomUUID } from "node:crypto";

export interface UniqueRunIdOptions {
  /** Timestamp used for the UTC-readable portion of the identifier. */
  timestamp?: Date | string;
  /** Injectable nonce for deterministic tests; production uses randomUUID. */
  nonce?: string;
}

function timestampPart(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) throw new Error("run ID timestamp must be a valid date");
  return date.toISOString().replace(/[-:.TZ]/g, "").slice(0, 17);
}

/** Generate an opaque, collision-resistant ID for an independent artifact run. */
export function createUniqueRunId(prefix = "ctg", options: UniqueRunIdOptions = {}): string {
  const timestamp = timestampPart(options.timestamp ?? new Date());
  const nonce = (options.nonce ?? randomUUID()).replaceAll("-", "");
  if (!/^[A-Za-z0-9]+$/.test(nonce)) throw new Error("run ID nonce must be alphanumeric");
  return `${prefix}-${timestamp}-${nonce}`;
}
