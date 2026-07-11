import { describe, expect, it } from "vitest";
import {
  mapCategoryToSignalKind,
  mapSeverityToSarifLevel,
  mapToTestIntents,
  SUPPORTED_TARGETS,
} from "../export-types.js";

describe("export type mappings", () => {
  it("maps all severity and category branches", () => {
    expect(mapSeverityToSarifLevel("critical")).toBe("error");
    expect(mapSeverityToSarifLevel("high")).toBe("error");
    expect(mapSeverityToSarifLevel("medium")).toBe("warning");
    expect(mapSeverityToSarifLevel("low")).toBe("note");
    expect(mapCategoryToSignalKind("security")).toBe("sast");
    expect(mapCategoryToSignalKind("auth")).toBe("sast");
    expect(mapCategoryToSignalKind("data")).toBe("sast");
    expect(mapCategoryToSignalKind("testing")).toBe("test_gap");
    expect(mapCategoryToSignalKind("maintainability")).toBe("quality");
    expect(mapCategoryToSignalKind("compatibility")).toBe("quality");
    expect(mapCategoryToSignalKind("other")).toBe("release_risk");
    expect(SUPPORTED_TARGETS).toContain("evidence-dag");
  });

  it("maps security, payment, validation, testing, and default intents", () => {
    expect(mapToTestIntents("RULE", "security")).toEqual(["negative", "abuse"]);
    expect(mapToTestIntents("RULE", "auth")).toEqual(["negative", "abuse"]);
    expect(mapToTestIntents("RULE", "payment")).toEqual([
      "boundary", "negative", "abuse",
    ]);
    expect(mapToTestIntents("RULE", "validation")).toEqual([
      "boundary", "negative",
    ]);
    expect(mapToTestIntents("RULE", "testing")).toEqual(["smoke", "regression"]);
    expect(mapToTestIntents("RULE", "other")).toEqual(["regression", "smoke"]);
  });
});
