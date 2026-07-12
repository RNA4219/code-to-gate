import { describe, expect, it } from "vitest";
import { canonicalDigest, canonicalize } from "../canonical.js";
import { AGENT_ACTIONS, getAgentAction, validateActionInput } from "../registry.js";

describe("agent protocol contracts", () => {
  it("canonicalizes object keys deterministically and omits undefined fields", () => {
    expect(canonicalize({ b: 2, a: 1, omitted: undefined })).toBe('{"a":1,"b":2}');
    expect(canonicalDigest({ a: 1 })).toHaveLength(64);
  });

  it("publishes the finite action registry", () => {
    expect(AGENT_ACTIONS.map((action) => action.id)).toEqual(["scan", "analyze", "readiness", "query", "doctor", "release-pack"]);
    expect(getAgentAction("doctor")?.idempotent).toBe(true);
  });

  it("rejects unknown action input fields", () => {
    const action = getAgentAction("doctor");
    expect(action).toBeDefined();
    if (!action) throw new Error("doctor action missing");
    expect(() => validateActionInput(action, { unknown: true })).toThrow("unknown input field");
  });

  it("accepts typed doctor input", () => {
    const action = getAgentAction("doctor");
    if (!action) throw new Error("doctor action missing");
    expect(validateActionInput(action, { out: ".qh" })).toEqual({ out: ".qh" });
  });
});