import { describe, expect, it } from "vitest";

import { createUniqueRunId } from "../run-id.js";

describe("createUniqueRunId", () => {
  it("combines a UTC millisecond timestamp with an injected nonce", () => {
    expect(createUniqueRunId("ctg", {
      timestamp: "2026-09-10T12:34:56.789Z",
      nonce: "00112233-4455-6677-8899-aabbccddeeff",
    })).toBe("ctg-20260910123456789-00112233445566778899aabbccddeeff");
  });

  it("creates different IDs for the same timestamp", () => {
    const options = { timestamp: "2026-09-10T12:34:56.789Z" };
    expect(createUniqueRunId("ctg", options)).not.toBe(createUniqueRunId("ctg", options));
  });

  it("rejects invalid timestamps and non-alphanumeric injected nonces", () => {
    expect(() => createUniqueRunId("ctg", { timestamp: "invalid" })).toThrow(/timestamp/);
    expect(() => createUniqueRunId("ctg", { nonce: "nonce with spaces" })).toThrow(/nonce/);
  });
});
