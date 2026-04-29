import { describe, expect, it } from "vitest";
import { normalizeUser } from "../src/user";

describe("normalizeUser", () => {
  it("normalizes email casing", () => {
    expect(normalizeUser({ id: "synthetic-user", email: "USER@EXAMPLE.TEST" })).toEqual({
      id: "synthetic-user",
      email: "user@example.test"
    });
  });
});

