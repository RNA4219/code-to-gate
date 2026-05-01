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

    it("should generate different fingerprint for different path", () => {
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
    it("should build map from findings with fingerprints", () => {
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
      expect(map.get("fp123")?.id).toBe("finding-1");
      expect(map.get("fp456")?.id).toBe("finding-2");
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
      expect(map.get("fp123")?.id).toBe("finding-1");
    });
  });
});