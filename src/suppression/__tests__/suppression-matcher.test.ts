/**
 * Tests for suppression-matcher.ts
 */

import { describe, it, expect } from "vitest";
import {
  isExpired,
  isApproachingExpiry,
  matchSuppression,
  isSuppressed,
  filterSuppressedFindings,
  buildSuppressionAuditRecords,
  DEFAULT_EXPIRY_WARNING_DAYS,
} from "../suppression-matcher.js";
import { Suppression, SuppressionFile } from "../suppression-loader.js";
import { Finding, EvidenceRef } from "../../types/artifacts.js";

// Helper to create a Finding
function createFinding(
  id: string,
  ruleId: string,
  path: string,
  options?: { category?: Finding["category"]; severity?: Finding["severity"] }
): Finding {
  const evidence: EvidenceRef = {
    id: `${id}-evidence`,
    path,
    kind: "ast",
  };
  return {
    id,
    ruleId,
    category: options?.category ?? "security",
    severity: options?.severity ?? "high",
    confidence: 0.9,
    title: `Test finding for ${ruleId}`,
    summary: "Test summary",
    evidence: [evidence],
  };
}

// Helper to create a Suppression
function createSuppression(
  ruleId: string,
  path: string,
  options?: { expiry?: string; reason?: string; author?: string }
): Suppression {
  return {
    rule_id: ruleId,
    path,
    reason: options?.reason ?? "Test suppression",
    expiry: options?.expiry,
    author: options?.author,
  };
}

describe("suppression-matcher", () => {
  describe("isExpired", () => {
    it("returns false when expiry is undefined", () => {
      expect(isExpired(undefined)).toBe(false);
    });

    it("returns false for future expiry date", () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);
      const dateStr = futureDate.toISOString().split("T")[0];
      expect(isExpired(dateStr)).toBe(false);
    });

    it("returns true for past expiry date", () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      const dateStr = pastDate.toISOString().split("T")[0];
      expect(isExpired(dateStr)).toBe(true);
    });

    it("returns true for today (boundary case - expiry date at midnight)", () => {
      const today = new Date();
      const dateStr = today.toISOString().split("T")[0];
      // When expiry is just a date string, it's parsed as midnight of that day
      // Current time (with hours/minutes) is greater than midnight, so it's expired
      expect(isExpired(dateStr)).toBe(true);
    });

    it("returns false for tomorrow (not expired)", () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateStr = tomorrow.toISOString().split("T")[0];
      expect(isExpired(dateStr)).toBe(false);
    });

    it("accepts custom current date parameter", () => {
      const expiryDate = "2026-06-30";
      const currentDate = new Date("2026-07-01");
      expect(isExpired(expiryDate, currentDate)).toBe(true);

      const beforeDate = new Date("2026-06-29");
      expect(isExpired(expiryDate, beforeDate)).toBe(false);
    });
  });

  describe("isApproachingExpiry", () => {
    it("returns false when expiry is undefined", () => {
      expect(isApproachingExpiry(undefined)).toEqual({ expiring: false });
    });

    it("returns false for date far in the future", () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 100);
      const dateStr = futureDate.toISOString().split("T")[0];
      expect(isApproachingExpiry(dateStr)).toEqual({ expiring: false });
    });

    it("returns true for date within warning window", () => {
      const nearDate = new Date();
      nearDate.setDate(nearDate.getDate() + 15); // 15 days from now
      const dateStr = nearDate.toISOString().split("T")[0];
      const result = isApproachingExpiry(dateStr, 30);
      expect(result.expiring).toBe(true);
      expect(result.daysRemaining).toBeGreaterThanOrEqual(14);
      expect(result.daysRemaining).toBeLessThanOrEqual(16);
    });

    it("returns false for already expired date", () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      const dateStr = pastDate.toISOString().split("T")[0];
      expect(isApproachingExpiry(dateStr)).toEqual({ expiring: false });
    });

    it("respects custom warning days parameter", () => {
      const nearDate = new Date();
      nearDate.setDate(nearDate.getDate() + 5);
      const dateStr = nearDate.toISOString().split("T")[0];

      // Should be expiring with 10-day window
      expect(isApproachingExpiry(dateStr, 10).expiring).toBe(true);

      // Should not be expiring with 3-day window
      expect(isApproachingExpiry(dateStr, 3).expiring).toBe(false);
    });

    it("accepts custom current date parameter", () => {
      const expiryDate = "2026-06-30";
      const currentDate = new Date("2026-06-20");

      // 10 days until expiry, should be expiring with 30-day window
      const result = isApproachingExpiry(expiryDate, 30, currentDate);
      expect(result.expiring).toBe(true);
      expect(result.daysRemaining).toBe(10);
    });
  });

  describe("matchSuppression", () => {
    describe("glob pattern matching", () => {
      it("matches exact path", () => {
        const suppression = createSuppression("RULE_001", "src/api/auth.ts");
        const finding = createFinding("f1", "RULE_001", "src/api/auth.ts");

        const result = matchSuppression(finding, [suppression]);
        expect(result.status).toBe("active");
        expect(result.suppression).toBe(suppression);
      });

      it("does not match different exact path", () => {
        const suppression = createSuppression("RULE_001", "src/api/auth.ts");
        const finding = createFinding("f1", "RULE_001", "src/api/user.ts");

        const result = matchSuppression(finding, [suppression]);
        expect(result.status).toBe("not_matched");
      });

      it("matches single wildcard (*)", () => {
        const suppression = createSuppression("RULE_001", "src/api/*.ts");
        const finding = createFinding("f1", "RULE_001", "src/api/auth.ts");

        const result = matchSuppression(finding, [suppression]);
        expect(result.status).toBe("active");
      });

      it("does not match single wildcard across directories", () => {
        const suppression = createSuppression("RULE_001", "src/api/*.ts");
        const finding = createFinding("f1", "RULE_001", "src/api/v1/auth.ts");

        const result = matchSuppression(finding, [suppression]);
        expect(result.status).toBe("not_matched");
      });

      it("matches recursive wildcard (**)", () => {
        const suppression = createSuppression("RULE_001", "src/**/*.ts");
        const finding1 = createFinding("f1", "RULE_001", "src/auth.ts");
        const finding2 = createFinding("f2", "RULE_001", "src/api/auth.ts");
        const finding3 = createFinding("f3", "RULE_001", "src/api/v1/auth.ts");

        expect(matchSuppression(finding1, [suppression]).status).toBe("active");
        expect(matchSuppression(finding2, [suppression]).status).toBe("active");
        expect(matchSuppression(finding3, [suppression]).status).toBe("active");
      });

      it("matches prefix recursive wildcard pattern", () => {
        const suppression = createSuppression("RULE_001", "**/test_*.ts");
        const finding1 = createFinding("f1", "RULE_001", "test_auth.ts");
        const finding2 = createFinding("f2", "RULE_001", "src/test_auth.ts");
        const finding3 = createFinding("f3", "RULE_001", "src/api/test_user.ts");

        expect(matchSuppression(finding1, [suppression]).status).toBe("active");
        expect(matchSuppression(finding2, [suppression]).status).toBe("active");
        expect(matchSuppression(finding3, [suppression]).status).toBe("active");
      });

      it("matches combined wildcards", () => {
        const suppression = createSuppression("RULE_001", "src/**/legacy-*.ts");
        const finding1 = createFinding("f1", "RULE_001", "src/legacy-auth.ts");
        const finding2 = createFinding("f2", "RULE_001", "src/api/legacy-auth.ts");

        expect(matchSuppression(finding1, [suppression]).status).toBe("active");
        expect(matchSuppression(finding2, [suppression]).status).toBe("active");
      });

      it("normalizes Windows-style paths to POSIX", () => {
        const suppression = createSuppression("RULE_001", "src/api/*.ts");
        const finding = createFinding("f1", "RULE_001", "src\\api\\auth.ts");

        const result = matchSuppression(finding, [suppression]);
        expect(result.status).toBe("active");
      });
    });

    describe("rule_id matching", () => {
      it("matches when rule_id matches", () => {
        const suppression = createSuppression("CLIENT_TRUSTED_PRICE", "src/*.ts");
        const finding = createFinding("f1", "CLIENT_TRUSTED_PRICE", "src/api.ts");

        const result = matchSuppression(finding, [suppression]);
        expect(result.status).toBe("active");
      });

      it("does not match when rule_id differs", () => {
        const suppression = createSuppression("RULE_A", "src/*.ts");
        const finding = createFinding("f1", "RULE_B", "src/api.ts");

        const result = matchSuppression(finding, [suppression]);
        expect(result.status).toBe("not_matched");
      });

      it("requires both rule_id and path to match", () => {
        const suppression = createSuppression("RULE_A", "src/api/*.ts");
        const finding1 = createFinding("f1", "RULE_A", "src/api/auth.ts");
        const finding2 = createFinding("f2", "RULE_A", "src/core/auth.ts");
        const finding3 = createFinding("f3", "RULE_B", "src/api/auth.ts");

        expect(matchSuppression(finding1, [suppression]).status).toBe("active");
        expect(matchSuppression(finding2, [suppression]).status).toBe("not_matched");
        expect(matchSuppression(finding3, [suppression]).status).toBe("not_matched");
      });
    });

    describe("expiry status handling", () => {
      it("returns active for suppression without expiry", () => {
        const suppression = createSuppression("RULE_001", "src/*.ts");
        const finding = createFinding("f1", "RULE_001", "src/api.ts");

        const result = matchSuppression(finding, [suppression]);
        expect(result.status).toBe("active");
      });

      it("returns active for suppression with future expiry", () => {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 60);
        const suppression = createSuppression("RULE_001", "src/*.ts", {
          expiry: futureDate.toISOString().split("T")[0],
        });
        const finding = createFinding("f1", "RULE_001", "src/api.ts");

        const result = matchSuppression(finding, [suppression]);
        expect(result.status).toBe("active");
      });

      it("returns expired for suppression with past expiry", () => {
        const pastDate = new Date();
        pastDate.setDate(pastDate.getDate() - 1);
        const suppression = createSuppression("RULE_001", "src/*.ts", {
          expiry: pastDate.toISOString().split("T")[0],
        });
        const finding = createFinding("f1", "RULE_001", "src/api.ts");

        const result = matchSuppression(finding, [suppression]);
        expect(result.status).toBe("expired");
        expect(result.suppression).toBe(suppression);
      });

      it("returns expiring for suppression nearing expiry", () => {
        const nearDate = new Date();
        nearDate.setDate(nearDate.getDate() + 10);
        const suppression = createSuppression("RULE_001", "src/*.ts", {
          expiry: nearDate.toISOString().split("T")[0],
        });
        const finding = createFinding("f1", "RULE_001", "src/api.ts");

        const result = matchSuppression(finding, [suppression], 30);
        expect(result.status).toBe("expiring");
        expect(result.expiryWarningDays).toBeGreaterThanOrEqual(9);
        expect(result.expiryWarningDays).toBeLessThanOrEqual(11);
      });

      it("respects custom warning days for expiring status", () => {
        const nearDate = new Date();
        nearDate.setDate(nearDate.getDate() + 20);
        const suppression = createSuppression("RULE_001", "src/*.ts", {
          expiry: nearDate.toISOString().split("T")[0],
        });
        const finding = createFinding("f1", "RULE_001", "src/api.ts");

        // With 30-day window, should be expiring
        expect(matchSuppression(finding, [suppression], 30).status).toBe("expiring");

        // With 10-day window, should be active (not expiring yet)
        expect(matchSuppression(finding, [suppression], 10).status).toBe("active");
      });
    });

    describe("finding without evidence path", () => {
      it("returns not_matched for finding without evidence", () => {
        const suppression = createSuppression("RULE_001", "src/*.ts");
        const finding: Finding = {
          id: "f1",
          ruleId: "RULE_001",
          category: "security",
          severity: "high",
          confidence: 0.9,
          title: "Test",
          summary: "Test",
          evidence: [], // No evidence
        };

        const result = matchSuppression(finding, [suppression]);
        expect(result.status).toBe("not_matched");
      });

      it("uses first evidence path for matching", () => {
        const suppression = createSuppression("RULE_001", "src/api/*.ts");
        const finding: Finding = {
          id: "f1",
          ruleId: "RULE_001",
          category: "security",
          severity: "high",
          confidence: 0.9,
          title: "Test",
          summary: "Test",
          evidence: [
            { id: "e1", path: "src/api/auth.ts", kind: "ast" },
            { id: "e2", path: "src/core/user.ts", kind: "ast" },
          ],
        };

        const result = matchSuppression(finding, [suppression]);
        expect(result.status).toBe("active");
        expect(result.matchedPath).toBe("src/api/auth.ts");
      });
    });

    describe("multiple suppressions", () => {
      it("finds first matching suppression", () => {
        const suppressions = [
          createSuppression("RULE_001", "src/api/*.ts"),
          createSuppression("RULE_001", "src/**/*.ts"), // Broader match
        ];
        const finding = createFinding("f1", "RULE_001", "src/api/auth.ts");

        const result = matchSuppression(finding, suppressions);
        expect(result.status).toBe("active");
        expect(result.suppression).toBe(suppressions[0]);
      });

      it("continues searching after non-matching rule_id", () => {
        const suppressions = [
          createSuppression("RULE_A", "src/api/*.ts"),
          createSuppression("RULE_001", "src/api/*.ts"),
        ];
        const finding = createFinding("f1", "RULE_001", "src/api/auth.ts");

        const result = matchSuppression(finding, suppressions);
        expect(result.status).toBe("active");
        expect(result.suppression?.rule_id).toBe("RULE_001");
      });

      it("returns not_matched when no suppression matches", () => {
        const suppressions = [
          createSuppression("RULE_A", "src/api/*.ts"),
          createSuppression("RULE_B", "src/core/*.ts"),
        ];
        const finding = createFinding("f1", "RULE_001", "src/api/auth.ts");

        const result = matchSuppression(finding, suppressions);
        expect(result.status).toBe("not_matched");
      });
    });
  });

  describe("isSuppressed", () => {
    it("returns true for actively suppressed finding", () => {
      const suppression = createSuppression("RULE_001", "src/*.ts");
      const finding = createFinding("f1", "RULE_001", "src/api.ts");

      expect(isSuppressed(finding, [suppression])).toBe(true);
    });

    it("returns false for expired suppression", () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      const suppression = createSuppression("RULE_001", "src/*.ts", {
        expiry: pastDate.toISOString().split("T")[0],
      });
      const finding = createFinding("f1", "RULE_001", "src/api.ts");

      expect(isSuppressed(finding, [suppression])).toBe(false);
    });

    it("returns false for expiring suppression (isSuppressed only checks active status)", () => {
      // Note: isSuppressed returns true only for "active" status
      // "expiring" status means the finding IS suppressed but with a warning
      // Use filterSuppressedFindings to properly handle expiring suppressions
      const nearDate = new Date();
      nearDate.setDate(nearDate.getDate() + 10);
      const suppression = createSuppression("RULE_001", "src/*.ts", {
        expiry: nearDate.toISOString().split("T")[0],
      });
      const finding = createFinding("f1", "RULE_001", "src/api.ts");

      expect(isSuppressed(finding, [suppression])).toBe(false);
      // But filterSuppressedFindings treats it as suppressed
      const result = filterSuppressedFindings([finding], {
        version: "ctg/v1",
        suppressions: [suppression],
      }, 30);
      expect(result.suppressedFindings).toHaveLength(1);
    });

    it("returns false for non-matching suppression", () => {
      const suppression = createSuppression("RULE_A", "src/*.ts");
      const finding = createFinding("f1", "RULE_B", "src/api.ts");

      expect(isSuppressed(finding, [suppression])).toBe(false);
    });
  });

  describe("filterSuppressedFindings", () => {
    it("returns all findings when no suppressions", () => {
      const findings = [
        createFinding("f1", "RULE_001", "src/a.ts"),
        createFinding("f2", "RULE_002", "src/b.ts"),
      ];

      const result = filterSuppressedFindings(findings, undefined);
      expect(result.activeFindings).toHaveLength(2);
      expect(result.suppressedFindings).toHaveLength(0);
      expect(result.expiredSuppressions).toHaveLength(0);
      expect(result.expiringWarnings).toHaveLength(0);
    });

    it("returns all findings when empty suppressions", () => {
      const findings = [
        createFinding("f1", "RULE_001", "src/a.ts"),
      ];
      const suppressionFile: SuppressionFile = {
        version: "ctg/v1",
        suppressions: [],
      };

      const result = filterSuppressedFindings(findings, suppressionFile);
      expect(result.activeFindings).toHaveLength(1);
      expect(result.suppressedFindings).toHaveLength(0);
    });

    it("separates active findings from suppressed findings", () => {
      const suppressions = [
        createSuppression("RULE_001", "src/suppressed/*.ts"),
      ];
      const suppressionFile: SuppressionFile = {
        version: "ctg/v1",
        suppressions,
      };
      const findings = [
        createFinding("f1", "RULE_001", "src/suppressed/a.ts"),
        createFinding("f2", "RULE_002", "src/active/b.ts"),
      ];

      const result = filterSuppressedFindings(findings, suppressionFile);
      expect(result.activeFindings).toHaveLength(1);
      expect(result.activeFindings[0].id).toBe("f2");
      expect(result.suppressedFindings).toHaveLength(1);
      expect(result.suppressedFindings[0].id).toBe("f1");
    });

    it("tracks expired suppressions separately", () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      const suppressions = [
        createSuppression("RULE_001", "src/*.ts", {
          expiry: pastDate.toISOString().split("T")[0],
        }),
      ];
      const suppressionFile: SuppressionFile = {
        version: "ctg/v1",
        suppressions,
      };
      const findings = [createFinding("f1", "RULE_001", "src/a.ts")];

      const result = filterSuppressedFindings(findings, suppressionFile);
      expect(result.activeFindings).toHaveLength(1); // Expired still shows as active
      expect(result.suppressedFindings).toHaveLength(0);
      expect(result.expiredSuppressions).toHaveLength(1);
      expect(result.expiredSuppressions[0].status).toBe("expired");
    });

    it("tracks expiring warnings separately", () => {
      const nearDate = new Date();
      nearDate.setDate(nearDate.getDate() + 10);
      const suppressions = [
        createSuppression("RULE_001", "src/*.ts", {
          expiry: nearDate.toISOString().split("T")[0],
        }),
      ];
      const suppressionFile: SuppressionFile = {
        version: "ctg/v1",
        suppressions,
      };
      const findings = [createFinding("f1", "RULE_001", "src/a.ts")];

      const result = filterSuppressedFindings(findings, suppressionFile, 30);
      expect(result.suppressedFindings).toHaveLength(1); // Still suppressed
      expect(result.expiringWarnings).toHaveLength(1);
      expect(result.expiringWarnings[0].status).toBe("expiring");
    });

    it("handles mixed suppression states", () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      const nearDate = new Date();
      nearDate.setDate(nearDate.getDate() + 10);
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 100);

      const suppressions = [
        createSuppression("RULE_ACTIVE", "src/active/*.ts", {
          expiry: futureDate.toISOString().split("T")[0],
        }),
        createSuppression("RULE_EXPIRING", "src/expiring/*.ts", {
          expiry: nearDate.toISOString().split("T")[0],
        }),
        createSuppression("RULE_EXPIRED", "src/expired/*.ts", {
          expiry: pastDate.toISOString().split("T")[0],
        }),
      ];
      const suppressionFile: SuppressionFile = {
        version: "ctg/v1",
        suppressions,
      };
      const findings = [
        createFinding("f1", "RULE_ACTIVE", "src/active/a.ts"),
        createFinding("f2", "RULE_EXPIRING", "src/expiring/b.ts"),
        createFinding("f3", "RULE_EXPIRED", "src/expired/c.ts"),
        createFinding("f4", "RULE_UNMATCHED", "src/other/d.ts"),
      ];

      const result = filterSuppressedFindings(findings, suppressionFile, 30);
      expect(result.suppressedFindings).toHaveLength(2); // Active + Expiring
      expect(result.activeFindings).toHaveLength(2); // Expired + Unmatched
      expect(result.expiredSuppressions).toHaveLength(1);
      expect(result.expiringWarnings).toHaveLength(1);
    });
  });

  describe("buildSuppressionAuditRecords", () => {
    it("builds records for suppressed findings", () => {
      const suppressions = [
        createSuppression("RULE_001", "src/*.ts", {
          reason: "Legacy code",
          author: "tech-lead",
          expiry: "2026-06-30",
        }),
      ];
      const findings = [createFinding("f1", "RULE_001", "src/api.ts")];

      const records = buildSuppressionAuditRecords(findings, suppressions);
      expect(records).toHaveLength(1);
      expect(records[0]).toEqual({
        finding_id: "f1",
        rule_id: "RULE_001",
        path: "src/api.ts",
        suppression_reason: "Legacy code",
        suppression_author: "tech-lead",
        suppression_expiry: "2026-06-30",
      });
    });

    it("returns empty array for no suppressed findings", () => {
      const suppressions = [createSuppression("RULE_A", "src/*.ts")];
      const findings = [createFinding("f1", "RULE_B", "src/api.ts")];

      const records = buildSuppressionAuditRecords(findings, suppressions);
      expect(records).toHaveLength(0);
    });

    it("handles multiple findings", () => {
      const suppressions = [
        createSuppression("RULE_001", "src/*.ts"),
        createSuppression("RULE_002", "lib/*.ts"),
      ];
      const findings = [
        createFinding("f1", "RULE_001", "src/a.ts"),
        createFinding("f2", "RULE_002", "lib/b.ts"),
        createFinding("f3", "RULE_003", "other/c.ts"),
      ];

      const records = buildSuppressionAuditRecords(findings, suppressions);
      expect(records).toHaveLength(2);
      expect(records.map((r) => r.finding_id)).toEqual(["f1", "f2"]);
    });
  });

  describe("DEFAULT_EXPIRY_WARNING_DAYS", () => {
    it("is set to 30 days", () => {
      expect(DEFAULT_EXPIRY_WARNING_DAYS).toBe(30);
    });
  });
});