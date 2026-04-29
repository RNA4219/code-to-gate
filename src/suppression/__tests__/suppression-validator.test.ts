/**
 * Tests for suppression-validator.ts
 */

import { describe, it, expect } from "vitest";
import {
  validateSuppressionFile,
  validateSuppression,
  checkMaxSuppressionsPerRule,
  ValidationResult,
  SuppressionValidationError,
} from "../suppression-validator.js";
import { Suppression, SuppressionFile } from "../suppression-loader.js";

// Helper to create a valid suppression
function createValidSuppression(overrides?: Partial<Suppression>): Suppression {
  return {
    rule_id: "RULE_001",
    path: "src/**/*.ts",
    reason: "Valid suppression reason",
    ...overrides,
  };
}

// Helper to create a valid suppression file
function createValidSuppressionFile(
  suppressions?: Suppression[]
): SuppressionFile {
  return {
    version: "ctg/v1alpha1",
    suppressions: suppressions ?? [createValidSuppression()],
  };
}

describe("suppression-validator", () => {
  describe("validateSuppressionFile", () => {
    describe("version validation", () => {
      it("accepts valid version ctg/v1alpha1", () => {
        const file = createValidSuppressionFile();
        file.version = "ctg/v1alpha1";

        const result = validateSuppressionFile(file);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it("accepts valid version ctg/v1alpha2", () => {
        const file = createValidSuppressionFile();
        file.version = "ctg/v1alpha2";

        const result = validateSuppressionFile(file);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it("accepts valid version ctg/v1", () => {
        const file = createValidSuppressionFile();
        file.version = "ctg/v1";

        const result = validateSuppressionFile(file);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it("rejects invalid version", () => {
        const file = createValidSuppressionFile();
        file.version = "invalid-version";

        const result = validateSuppressionFile(file);
        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            type: "version",
            message: expect.stringContaining("Invalid version"),
          })
        );
      });

      it("rejects missing version", () => {
        const file = createValidSuppressionFile();
        file.version = undefined as unknown as string;

        const result = validateSuppressionFile(file);
        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            type: "version",
            message: "Missing version field",
          })
        );
      });
    });

    describe("suppressions array validation", () => {
      it("accepts valid suppressions array", () => {
        const file = createValidSuppressionFile([
          createValidSuppression(),
          createValidSuppression({ rule_id: "RULE_002" }),
        ]);

        const result = validateSuppressionFile(file);
        expect(result.valid).toBe(true);
      });

      it("rejects non-array suppressions", () => {
        const file = {
          version: "ctg/v1alpha1",
          suppressions: "not-an-array",
        } as unknown as SuppressionFile;

        const result = validateSuppressionFile(file);
        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            type: "suppression",
            message: "suppressions must be an array",
          })
        );
      });

      it("accepts empty suppressions array", () => {
        const file = createValidSuppressionFile([]);

        const result = validateSuppressionFile(file);
        expect(result.valid).toBe(true);
      });
    });

    describe("individual suppression validation", () => {
      it("accumulates errors from multiple suppressions", () => {
        const file = createValidSuppressionFile([
          { path: "src/*.ts", reason: "missing rule_id" } as unknown as Suppression,
          { rule_id: "RULE_002", reason: "missing path" } as unknown as Suppression,
          { rule_id: "RULE_003", path: "src/*.ts" } as unknown as Suppression, // missing reason
        ]);

        const result = validateSuppressionFile(file);
        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(3);
      });

      it("continues validation after first error", () => {
        const file = createValidSuppressionFile([
          { path: "src/*.ts" } as unknown as Suppression, // missing rule_id and reason
          createValidSuppression({ rule_id: "RULE_002" }),
        ]);

        const result = validateSuppressionFile(file);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });
    });

    describe("warnings", () => {
      it("collects warnings separately from errors", () => {
        const file = createValidSuppressionFile([
          createValidSuppression({
            expiry: getPastDate(),
          }),
        ]);

        const result = validateSuppressionFile(file);
        expect(result.valid).toBe(true); // Warnings don't make it invalid
        expect(result.warnings.length).toBeGreaterThan(0);
      });
    });
  });

  describe("validateSuppression", () => {
    describe("required field validation", () => {
      it("accepts valid suppression with all required fields", () => {
        const suppression = createValidSuppression();

        const result = validateSuppression(suppression, 0);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it("rejects suppression without rule_id", () => {
        const suppression = createValidSuppression();
        suppression.rule_id = undefined as unknown as string;

        const result = validateSuppression(suppression, 0);
        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            type: "field",
            field: "rule_id",
            message: "Missing required field: rule_id",
            index: 0,
          })
        );
      });

      it("rejects suppression without path", () => {
        const suppression = createValidSuppression();
        suppression.path = undefined as unknown as string;

        const result = validateSuppression(suppression, 0);
        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            type: "field",
            field: "path",
            message: "Missing required field: path",
            index: 0,
          })
        );
      });

      it("rejects suppression without reason", () => {
        const suppression = createValidSuppression();
        suppression.reason = undefined as unknown as string;

        const result = validateSuppression(suppression, 0);
        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            type: "field",
            field: "reason",
            message: "Missing required field: reason",
            index: 0,
          })
        );
      });

      it("rejects suppression with empty rule_id", () => {
        const suppression = createValidSuppression({ rule_id: "" });

        const result = validateSuppression(suppression, 0);
        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            type: "field",
            field: "rule_id",
          })
        );
      });

      it("rejects suppression with empty path", () => {
        const suppression = createValidSuppression({ path: "" });

        const result = validateSuppression(suppression, 0);
        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            type: "field",
            field: "path",
          })
        );
      });

      it("rejects suppression with empty reason", () => {
        const suppression = createValidSuppression({ reason: "" });

        const result = validateSuppression(suppression, 0);
        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            type: "field",
            field: "reason",
          })
        );
      });

      it("reports multiple missing required fields", () => {
        const suppression = {} as Suppression;

        const result = validateSuppression(suppression, 0);
        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(3);
        expect(result.errors.map((e) => e.field)).toEqual(
          expect.arrayContaining(["rule_id", "path", "reason"])
        );
      });
    });

    describe("date format validation", () => {
      it("accepts valid YYYY-MM-DD format", () => {
        const suppression = createValidSuppression({
          expiry: "2026-06-30",
        });

        const result = validateSuppression(suppression, 0);
        expect(result.valid).toBe(true);
      });

      it("accepts valid ISO 8601 format with time", () => {
        const suppression = createValidSuppression({
          expiry: "2026-06-30T14:30:00Z",
        });

        const result = validateSuppression(suppression, 0);
        expect(result.valid).toBe(true);
      });

      it("accepts valid ISO 8601 format with timezone offset", () => {
        const suppression = createValidSuppression({
          expiry: "2026-06-30T14:30:00+09:00",
        });

        const result = validateSuppression(suppression, 0);
        expect(result.valid).toBe(true);
      });

      it("rejects invalid date format (DD/MM/YYYY)", () => {
        const suppression = createValidSuppression({
          expiry: "30/06/2026",
        });

        const result = validateSuppression(suppression, 0);
        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            type: "field",
            field: "expiry",
            message: expect.stringContaining("Invalid date format"),
          })
        );
      });

      it("rejects invalid date format (MM-DD-YYYY)", () => {
        const suppression = createValidSuppression({
          expiry: "06-30-2026",
        });

        const result = validateSuppression(suppression, 0);
        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            type: "field",
            field: "expiry",
          })
        );
      });

      it("rejects invalid date value (invalid month)", () => {
        const suppression = createValidSuppression({
          expiry: "2026-13-30",
        });

        const result = validateSuppression(suppression, 0);
        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            type: "field",
            field: "expiry",
          })
        );
      });

      it("rejects invalid date value (invalid day)", () => {
        const suppression = createValidSuppression({
          expiry: "2026-02-32",
        });

        const result = validateSuppression(suppression, 0);
        expect(result.valid).toBe(false);
      });

      it("warns for expired date", () => {
        const suppression = createValidSuppression({
          expiry: getPastDate(),
        });

        const result = validateSuppression(suppression, 0);
        expect(result.valid).toBe(true); // Expired is still valid, just a warning
        expect(result.warnings).toContainEqual(
          expect.objectContaining({
            type: "field",
            field: "expiry",
            message: "Expiry date has already passed",
          })
        );
      });
    });

    describe("glob pattern syntax validation", () => {
      it("accepts simple glob patterns", () => {
        const patterns = ["src/*.ts", "lib/**/*.js", "**/test_*.py", "config/*.json"];

        for (const pattern of patterns) {
          const suppression = createValidSuppression({ path: pattern });
          const result = validateSuppression(suppression, 0);
          expect(result.valid).toBe(true);
        }
      });

      it("warns for multiple ** in pattern", () => {
        const suppression = createValidSuppression({
          path: "**/src/**/test/**",
        });

        const result = validateSuppression(suppression, 0);
        expect(result.valid).toBe(true);
        expect(result.warnings).toContainEqual(
          expect.objectContaining({
            type: "field",
            field: "path",
            message: expect.stringContaining("Multiple **"),
          })
        );
      });

      it("warns for unbalanced braces", () => {
        const patterns = [
          "src/{a,b.ts", // Missing closing brace
          "src/a,b}.ts",  // Missing opening brace
          "src/{{a,b}.ts", // Unbalanced nested
        ];

        for (const pattern of patterns) {
          const suppression = createValidSuppression({ path: pattern });
          const result = validateSuppression(suppression, 0);
          expect(result.warnings).toContainEqual(
            expect.objectContaining({
              type: "field",
              field: "path",
              message: "Unbalanced braces in path pattern",
            })
          );
        }
      });

      it("accepts balanced braces", () => {
        const suppression = createValidSuppression({
          path: "src/{a,b,c}.ts",
        });

        const result = validateSuppression(suppression, 0);
        expect(result.valid).toBe(true);
        expect(
          result.warnings.find((w) =>
            w.message.includes("Unbalanced braces")
          )
        ).toBeUndefined();
      });

      it("warns for pattern starting and ending with **", () => {
        const suppression = createValidSuppression({
          path: "**/*.ts/**",
        });

        const result = validateSuppression(suppression, 0);
        expect(result.warnings).toContainEqual(
          expect.objectContaining({
            type: "field",
            field: "path",
            message: expect.stringContaining("may be slow"),
          })
        );
      });
    });

    describe("index in errors", () => {
      it("includes suppression index in error messages", () => {
        const suppression = createValidSuppression();
        suppression.rule_id = undefined as unknown as string;

        const result = validateSuppression(suppression, 5);
        expect(result.errors[0].index).toBe(5);
      });
    });
  });

  describe("checkMaxSuppressionsPerRule", () => {
    it("returns empty array when no rules exceed limit", () => {
      const file = createValidSuppressionFile([
        createValidSuppression({ rule_id: "RULE_A" }),
        createValidSuppression({ rule_id: "RULE_B" }),
        createValidSuppression({ rule_id: "RULE_C" }),
      ]);

      const exceeded = checkMaxSuppressionsPerRule(file, 2);
      expect(exceeded).toHaveLength(0);
    });

    it("returns rules that exceed limit", () => {
      const file = createValidSuppressionFile([
        createValidSuppression({ rule_id: "RULE_A" }),
        createValidSuppression({ rule_id: "RULE_A" }),
        createValidSuppression({ rule_id: "RULE_A" }),
        createValidSuppression({ rule_id: "RULE_B" }),
      ]);

      const exceeded = checkMaxSuppressionsPerRule(file, 2);
      expect(exceeded).toHaveLength(1);
      expect(exceeded[0]).toEqual({ rule_id: "RULE_A", count: 3 });
    });

    it("returns multiple rules that exceed limit", () => {
      const file = createValidSuppressionFile([
        createValidSuppression({ rule_id: "RULE_A" }),
        createValidSuppression({ rule_id: "RULE_A" }),
        createValidSuppression({ rule_id: "RULE_A" }),
        createValidSuppression({ rule_id: "RULE_B" }),
        createValidSuppression({ rule_id: "RULE_B" }),
        createValidSuppression({ rule_id: "RULE_B" }),
      ]);

      const exceeded = checkMaxSuppressionsPerRule(file, 2);
      expect(exceeded).toHaveLength(2);
      expect(exceeded.map((e) => e.rule_id)).toEqual(
        expect.arrayContaining(["RULE_A", "RULE_B"])
      );
    });

    it("handles empty suppressions array", () => {
      const file = createValidSuppressionFile([]);

      const exceeded = checkMaxSuppressionsPerRule(file, 5);
      expect(exceeded).toHaveLength(0);
    });

    it("handles max limit of 0", () => {
      const file = createValidSuppressionFile([
        createValidSuppression({ rule_id: "RULE_A" }),
      ]);

      const exceeded = checkMaxSuppressionsPerRule(file, 0);
      expect(exceeded).toHaveLength(1);
      expect(exceeded[0].count).toBe(1);
    });

    it("handles max limit of 1", () => {
      const file = createValidSuppressionFile([
        createValidSuppression({ rule_id: "RULE_A" }),
        createValidSuppression({ rule_id: "RULE_A" }),
      ]);

      const exceeded = checkMaxSuppressionsPerRule(file, 1);
      expect(exceeded).toHaveLength(1);
      expect(exceeded[0]).toEqual({ rule_id: "RULE_A", count: 2 });
    });
  });
});

// Helper function to get a past date
function getPastDate(): string {
  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - 1);
  return pastDate.toISOString().split("T")[0];
}