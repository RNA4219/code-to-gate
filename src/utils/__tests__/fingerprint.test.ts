/**
 * Tests for Finding fingerprint generation
 */

import { describe, it, expect } from "vitest";
import {
  generateFindingFingerprint,
  addFingerprintsToFindings,
  buildFingerprintLookupMap,
} from "../fingerprint.js";
import { Finding, EvidenceRef } from "../../types/artifacts.js";

describe("Finding Fingerprint", () => {
  describe("generateFindingFingerprint", () => {
    it("should generate fingerprint from ruleId and path", () => {
      const finding: Finding = {
        id: "finding-1",
        ruleId: "CLIENT_TRUSTED_PRICE",
        category: "payment",
        severity: "high",
        confidence: 0.9,
        title: "Client trusted price",
        summary: "Price calculated on client",
        evidence: [
          {
            id: "ev-1",
            path: "src/components/checkout.ts",
            kind: "text",
            excerptHash: "abc123",
          },
        ],
      };

      const fingerprint = generateFindingFingerprint(finding);

      expect(fingerprint).toBeDefined();
      expect(fingerprint.length).toBe(16);
      expect(typeof fingerprint).toBe("string");
    });

    // === Phase C Contract Tests ===

    it("should generate 16-character lowercase hex fingerprint (Phase C contract)", () => {
      const finding: Finding = {
        id: "finding-1",
        ruleId: "RAW_SQL",
        category: "security",
        severity: "medium",
        confidence: 0.8,
        title: "Raw SQL query",
        summary: "SQL string construction",
        evidence: [
          {
            id: "ev-1",
            path: "src/db/query.ts",
            kind: "text",
            excerptHash: "def456",
          },
        ],
      };

      const fingerprint = generateFindingFingerprint(finding);

      expect(fingerprint).toMatch(/^[0-9a-f]{16}$/);
    });

    it("should NOT change when severity changes (Phase C contract)", () => {
      const findingLow: Finding = {
        id: "finding-1",
        ruleId: "RAW_SQL",
        category: "security",
        severity: "low",
        confidence: 0.8,
        title: "Raw SQL",
        summary: "SQL construction",
        evidence: [
          {
            id: "ev-1",
            path: "src/db/query.ts",
            kind: "text",
            excerptHash: "hash123",
          },
        ],
      };

      const findingHigh: Finding = {
        ...findingLow,
        severity: "high",
      };

      const fp1 = generateFindingFingerprint(findingLow);
      const fp2 = generateFindingFingerprint(findingHigh);

      expect(fp1).toBe(fp2);
    });

    it("should NOT change when confidence changes (Phase C contract)", () => {
      const finding1: Finding = {
        id: "finding-1",
        ruleId: "RAW_SQL",
        category: "security",
        severity: "medium",
        confidence: 0.5,
        title: "Raw SQL",
        summary: "SQL construction",
        evidence: [
          {
            id: "ev-1",
            path: "src/db/query.ts",
            kind: "text",
            excerptHash: "hash123",
          },
        ],
      };

      const finding2: Finding = {
        ...finding1,
        confidence: 0.9,
      };

      const fp1 = generateFindingFingerprint(finding1);
      const fp2 = generateFindingFingerprint(finding2);

      expect(fp1).toBe(fp2);
    });

    it("should NOT change when category changes (Phase C contract)", () => {
      const finding1: Finding = {
        id: "finding-1",
        ruleId: "RAW_SQL",
        category: "security",
        severity: "medium",
        confidence: 0.8,
        title: "Raw SQL",
        summary: "SQL construction",
        evidence: [
          {
            id: "ev-1",
            path: "src/db/query.ts",
            kind: "text",
            excerptHash: "hash123",
          },
        ],
      };

      const finding2: Finding = {
        ...finding1,
        category: "data",
      };

      const fp1 = generateFindingFingerprint(finding1);
      const fp2 = generateFindingFingerprint(finding2);

      expect(fp1).toBe(fp2);
    });

    it("should NOT change when title or summary changes (Phase C contract)", () => {
      const finding1: Finding = {
        id: "finding-1",
        ruleId: "RAW_SQL",
        category: "security",
        severity: "medium",
        confidence: 0.8,
        title: "Raw SQL query",
        summary: "SQL string construction",
        evidence: [
          {
            id: "ev-1",
            path: "src/db/query.ts",
            kind: "text",
            excerptHash: "hash123",
          },
        ],
      };

      const finding2: Finding = {
        ...finding1,
        title: "Different title",
        summary: "Different summary",
      };

      const fp1 = generateFindingFingerprint(finding1);
      const fp2 = generateFindingFingerprint(finding2);

      expect(fp1).toBe(fp2);
    });

    it("should NOT change when line numbers change (Phase C contract)", () => {
      const finding1: Finding = {
        id: "finding-1",
        ruleId: "RAW_SQL",
        category: "security",
        severity: "medium",
        confidence: 0.8,
        title: "Raw SQL",
        summary: "SQL construction",
        evidence: [
          {
            id: "ev-1",
            path: "src/db/query.ts",
            startLine: 10,
            endLine: 20,
            kind: "text",
            excerptHash: "hash123",
          },
        ],
      };

      const finding2: Finding = {
        ...finding1,
        evidence: [
          {
            ...finding1.evidence[0],
            startLine: 50,
            endLine: 60,
          },
        ],
      };

      const fp1 = generateFindingFingerprint(finding1);
      const fp2 = generateFindingFingerprint(finding2);

      expect(fp1).toBe(fp2);
    });

    it("should NOT change when symbol order changes (Phase C contract)", () => {
      const finding1: Finding = {
        id: "finding-1",
        ruleId: "RAW_SQL",
        category: "security",
        severity: "medium",
        confidence: 0.8,
        title: "Raw SQL",
        summary: "SQL construction",
        evidence: [
          {
            id: "ev-1",
            path: "src/db/query.ts",
            kind: "text",
            excerptHash: "hash123",
          },
        ],
        affectedSymbols: ["createQuery", "executeQuery"],
      };

      const finding2: Finding = {
        ...finding1,
        affectedSymbols: ["executeQuery", "createQuery"], // Different order
      };

      const fp1 = generateFindingFingerprint(finding1);
      const fp2 = generateFindingFingerprint(finding2);

      expect(fp1).toBe(fp2);
    });

    it("should NOT change when path is renamed if excerpt hash matches (Phase C contract)", () => {
      // This tests the path rename resistance feature
      const finding1: Finding = {
        id: "finding-1",
        ruleId: "RAW_SQL",
        category: "security",
        severity: "medium",
        confidence: 0.8,
        title: "Raw SQL",
        summary: "SQL construction",
        evidence: [
          {
            id: "ev-1",
            path: "src/db/query.ts",
            kind: "text",
            excerptHash: "same-excerpt-hash", // Same excerpt content
          },
        ],
      };

      const finding2: Finding = {
        ...finding1,
        evidence: [
          {
            id: "ev-1",
            path: "src/database/queries.ts", // Renamed path
            kind: "text",
            excerptHash: "same-excerpt-hash", // Same excerpt
          },
        ],
      };

      const fp1 = generateFindingFingerprint(finding1);
      const fp2 = generateFindingFingerprint(finding2);

      // With excerpt hash present, path is excluded from fingerprint input
      expect(fp1).toBe(fp2);
    });

    it("should change when excerpt hash changes (Phase C contract)", () => {
      const finding1: Finding = {
        id: "finding-1",
        ruleId: "RAW_SQL",
        category: "security",
        severity: "medium",
        confidence: 0.8,
        title: "Raw SQL",
        summary: "SQL construction",
        evidence: [
          {
            id: "ev-1",
            path: "src/db/query.ts",
            kind: "text",
            excerptHash: "excerpt-v1",
          },
        ],
      };

      const finding2: Finding = {
        ...finding1,
        evidence: [
          {
            id: "ev-1",
            path: "src/db/query.ts",
            kind: "text",
            excerptHash: "excerpt-v2", // Different excerpt content
          },
        ],
      };

      const fp1 = generateFindingFingerprint(finding1);
      const fp2 = generateFindingFingerprint(finding2);

      expect(fp1).not.toBe(fp2);
    });

    it("should generate different fingerprints for same rule/file with different excerpts (Phase C contract)", () => {
      const finding1: Finding = {
        id: "finding-1",
        ruleId: "RAW_SQL",
        category: "security",
        severity: "medium",
        confidence: 0.8,
        title: "Raw SQL instance 1",
        summary: "SQL construction",
        evidence: [
          {
            id: "ev-1",
            path: "src/db/query.ts",
            kind: "text",
            excerptHash: "excerpt-a",
          },
        ],
      };

      const finding2: Finding = {
        ...finding1,
        id: "finding-2",
        evidence: [
          {
            id: "ev-2",
            path: "src/db/query.ts", // Same file
            kind: "text",
            excerptHash: "excerpt-b", // Different excerpt
          },
        ],
      };

      const fp1 = generateFindingFingerprint(finding1);
      const fp2 = generateFindingFingerprint(finding2);

      expect(fp1).not.toBe(fp2);
    });

    it("should normalize path separators (Phase C contract)", () => {
      const findingWindows: Finding = {
        id: "finding-1",
        ruleId: "RAW_SQL",
        category: "security",
        severity: "medium",
        confidence: 0.8,
        title: "Raw SQL",
        summary: "SQL construction",
        evidence: [
          {
            id: "ev-1",
            path: "src\\db\\query.ts", // Windows path
            kind: "text",
          },
        ],
      };

      const findingPosix: Finding = {
        ...findingWindows,
        evidence: [
          {
            id: "ev-1",
            path: "src/db/query.ts", // POSIX path
            kind: "text",
          },
        ],
      };

      const fp1 = generateFindingFingerprint(findingWindows);
      const fp2 = generateFindingFingerprint(findingPosix);

      expect(fp1).toBe(fp2);
    });

    it("should generate consistent fingerprint for same finding", () => {
      const finding: Finding = {
        id: "finding-1",
        ruleId: "RAW_SQL",
        category: "security",
        severity: "medium",
        confidence: 0.8,
        title: "Raw SQL query",
        summary: "SQL string construction",
        evidence: [
          {
            id: "ev-1",
            path: "src/db/query.ts",
            kind: "text",
            excerptHash: "def456",
          },
        ],
        affectedSymbols: ["createQuery", "executeQuery"],
      };

      const fp1 = generateFindingFingerprint(finding);
      const fp2 = generateFindingFingerprint(finding);

      expect(fp1).toBe(fp2);
    });

    it("should generate different fingerprint for different ruleId", () => {
      const baseFinding: Finding = {
        id: "finding-1",
        ruleId: "RAW_SQL",
        category: "security",
        severity: "medium",
        confidence: 0.8,
        title: "Raw SQL query",
        summary: "SQL string construction",
        evidence: [
          {
            id: "ev-1",
            path: "src/db/query.ts",
            kind: "text",
            excerptHash: "def456",
          },
        ],
      };

      const differentRuleFinding: Finding = {
        ...baseFinding,
        ruleId: "WEAK_AUTH_GUARD",
      };

      const fp1 = generateFindingFingerprint(baseFinding);
      const fp2 = generateFindingFingerprint(differentRuleFinding);

      expect(fp1).not.toBe(fp2);
    });

    it("should generate different fingerprint for different path when no excerpt/symbol", () => {
      const finding1: Finding = {
        id: "finding-1",
        ruleId: "RAW_SQL",
        category: "security",
        severity: "medium",
        confidence: 0.8,
        title: "Raw SQL",
        summary: "SQL construction",
        evidence: [
          {
            id: "ev-1",
            path: "src/db/query.ts",
            kind: "text",
            // No excerptHash, no affectedSymbols → path used as fallback
          },
        ],
      };

      const finding2: Finding = {
        ...finding1,
        evidence: [
          {
            id: "ev-1",
            path: "src/db/other.ts",
            kind: "text",
          },
        ],
      };

      const fp1 = generateFindingFingerprint(finding1);
      const fp2 = generateFindingFingerprint(finding2);

      expect(fp1).not.toBe(fp2);
    });

    it("should include affected symbols in fingerprint", () => {
      const findingNoSymbols: Finding = {
        id: "finding-1",
        ruleId: "RAW_SQL",
        category: "security",
        severity: "medium",
        confidence: 0.8,
        title: "Raw SQL",
        summary: "SQL construction",
        evidence: [
          {
            id: "ev-1",
            path: "src/db/query.ts",
            kind: "text",
          },
        ],
      };

      const findingWithSymbols: Finding = {
        ...findingNoSymbols,
        affectedSymbols: ["createQuery"],
      };

      const fp1 = generateFindingFingerprint(findingNoSymbols);
      const fp2 = generateFindingFingerprint(findingWithSymbols);

      expect(fp1).not.toBe(fp2);
    });

    it("should include excerpt hash in fingerprint", () => {
      const findingNoExcerpt: Finding = {
        id: "finding-1",
        ruleId: "RAW_SQL",
        category: "security",
        severity: "medium",
        confidence: 0.8,
        title: "Raw SQL",
        summary: "SQL construction",
        evidence: [
          {
            id: "ev-1",
            path: "src/db/query.ts",
            kind: "text",
          },
        ],
      };

      const findingWithExcerpt: Finding = {
        ...findingNoExcerpt,
        evidence: [
          {
            id: "ev-1",
            path: "src/db/query.ts",
            kind: "text",
            excerptHash: "unique-hash-123",
          },
        ],
      };

      const fp1 = generateFindingFingerprint(findingNoExcerpt);
      const fp2 = generateFindingFingerprint(findingWithExcerpt);

      expect(fp1).not.toBe(fp2);
    });
  });

  describe("addFingerprintsToFindings", () => {
    it("should add fingerprints to all findings", () => {
      const findings: Finding[] = [
        {
          id: "finding-1",
          ruleId: "RAW_SQL",
          category: "security",
          severity: "medium",
          confidence: 0.8,
          title: "Raw SQL",
          summary: "SQL construction",
          evidence: [
            {
              id: "ev-1",
              path: "src/db/query.ts",
              kind: "text",
            },
          ],
        },
        {
          id: "finding-2",
          ruleId: "WEAK_AUTH_GUARD",
          category: "auth",
          severity: "high",
          confidence: 0.9,
          title: "Weak auth",
          summary: "Missing auth check",
          evidence: [
            {
              id: "ev-2",
              path: "src/auth/guard.ts",
              kind: "text",
            },
          ],
        },
      ];

      const withFingerprints = addFingerprintsToFindings(findings);

      expect(withFingerprints.length).toBe(2);
      expect(withFingerprints[0].fingerprint).toBeDefined();
      expect(withFingerprints[1].fingerprint).toBeDefined();
      expect(withFingerprints[0].fingerprint).not.toBe(withFingerprints[1].fingerprint);
    });

    it("should preserve other finding properties", () => {
      const findings: Finding[] = [
        {
          id: "finding-1",
          ruleId: "RAW_SQL",
          category: "security",
          severity: "medium",
          confidence: 0.8,
          title: "Raw SQL",
          summary: "SQL construction",
          evidence: [
            {
              id: "ev-1",
              path: "src/db/query.ts",
              kind: "text",
            },
          ],
          affectedSymbols: ["query"],
          tags: ["security", "sql"],
        },
      ];

      const withFingerprints = addFingerprintsToFindings(findings);

      expect(withFingerprints[0].id).toBe("finding-1");
      expect(withFingerprints[0].ruleId).toBe("RAW_SQL");
      expect(withFingerprints[0].category).toBe("security");
      expect(withFingerprints[0].affectedSymbols).toEqual(["query"]);
      expect(withFingerprints[0].tags).toEqual(["security", "sql"]);
    });
  });

  describe("buildFingerprintLookupMap", () => {
    it("should build map from findings with fingerprints (array-based for duplicate handling)", () => {
      const findings: Finding[] = [
        {
          id: "finding-1",
          ruleId: "RAW_SQL",
          category: "security",
          severity: "medium",
          confidence: 0.8,
          title: "Raw SQL",
          summary: "SQL construction",
          evidence: [
            {
              id: "ev-1",
              path: "src/db/query.ts",
              kind: "text",
            },
          ],
          fingerprint: "fp123",
        },
        {
          id: "finding-2",
          ruleId: "WEAK_AUTH_GUARD",
          category: "auth",
          severity: "high",
          confidence: 0.9,
          title: "Weak auth",
          summary: "Missing auth check",
          evidence: [
            {
              id: "ev-2",
              path: "src/auth/guard.ts",
              kind: "text",
            },
          ],
          fingerprint: "fp456",
        },
      ];

      const map = buildFingerprintLookupMap(findings);

      expect(map.size).toBe(2);
      expect(map.get("fp123")?.[0]?.id).toBe("finding-1");
      expect(map.get("fp456")?.[0]?.id).toBe("finding-2");
    });

    it("should skip findings without fingerprint", () => {
      const findings: Finding[] = [
        {
          id: "finding-1",
          ruleId: "RAW_SQL",
          category: "security",
          severity: "medium",
          confidence: 0.8,
          title: "Raw SQL",
          summary: "SQL construction",
          evidence: [
            {
              id: "ev-1",
              path: "src/db/query.ts",
              kind: "text",
            },
          ],
          fingerprint: "fp123",
        },
        {
          id: "finding-2",
          ruleId: "WEAK_AUTH_GUARD",
          category: "auth",
          severity: "high",
          confidence: 0.9,
          title: "Weak auth",
          summary: "Missing auth check",
          evidence: [
            {
              id: "ev-2",
              path: "src/auth/guard.ts",
              kind: "text",
            },
          ],
          // No fingerprint
        },
      ];

      const map = buildFingerprintLookupMap(findings);

      expect(map.size).toBe(1);
      expect(map.get("fp123")?.[0]?.id).toBe("finding-1");
    });

    it("should handle duplicate fingerprints safely (Phase C)", () => {
      const findings: Finding[] = [
        {
          id: "finding-1",
          ruleId: "RAW_SQL",
          category: "security",
          severity: "medium",
          confidence: 0.8,
          title: "Raw SQL instance 1",
          summary: "SQL construction",
          evidence: [
            {
              id: "ev-1",
              path: "src/db/query.ts",
              kind: "text",
            },
          ],
          fingerprint: "fp123", // Same fingerprint
        },
        {
          id: "finding-2",
          ruleId: "RAW_SQL",
          category: "security",
          severity: "medium",
          confidence: 0.8,
          title: "Raw SQL instance 2",
          summary: "SQL construction",
          evidence: [
            {
              id: "ev-2",
              path: "src/db/query.ts",
              kind: "text",
            },
          ],
          fingerprint: "fp123", // Same fingerprint
        },
      ];

      const map = buildFingerprintLookupMap(findings);

      expect(map.size).toBe(1); // One unique fingerprint
      expect(map.get("fp123")?.length).toBe(2); // Two findings with same fingerprint
      expect(map.get("fp123")?.[0]?.id).toBe("finding-1");
      expect(map.get("fp123")?.[1]?.id).toBe("finding-2");
    });
  });
});