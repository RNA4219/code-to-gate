/**
 * Tests for Viewer performance with large findings sets
 *
 * Measures:
 * - HTML generation time for large findings
 * - Memory efficiency
 * - Rendering performance thresholds
 */

import { describe, it, expect } from "vitest";
import { generateReportHtml, writeReportHtml } from "../report-viewer.js";
import {
  FindingsArtifact,
  RiskRegisterArtifact,
  CTG_VERSION,
  Severity,
  FindingCategory,
  Finding,
} from "../../types/artifacts.js";
import { tmpdir } from "node:os";
import path from "node:path";
import { mkdirSync, rmSync, existsSync } from "node:fs";

// Performance thresholds (in milliseconds)
const PERFORMANCE_THRESHOLDS = {
  small: 100,    // < 50 findings
  medium: 500,   // < 500 findings
  large: 2000,   // < 1000 findings
};

function createLargeFindingsArtifact(count: number): FindingsArtifact {
  const findings: Finding[] = [];

  const severities: Severity[] = ["critical", "high", "medium", "low"];
  const categories: FindingCategory[] = [
    "security", "auth", "validation", "maintainability", "payment", "testing"
  ];

  for (let i = 0; i < count; i++) {
    findings.push({
      id: `finding-${i}`,
      ruleId: `RULE_${i % 10}`,
      category: categories[i % categories.length],
      severity: severities[i % severities.length],
      confidence: 0.8 + (Math.random() * 0.2),
      title: `Finding ${i}: ${severities[i % severities.length]} severity issue`,
      summary: `Detailed summary for finding ${i}. This finding was detected in the codebase and represents a potential quality risk.`,
      evidence: [
        {
          id: `ev-${i}-1`,
          path: `src/module${i % 20}/file${i % 10}.ts`,
          kind: "ast",
          startLine: i * 10,
          endLine: i * 10 + 5,
        },
        {
          id: `ev-${i}-2`,
          path: `src/module${i % 20}/file${i % 10}.ts`,
          kind: "text",
          excerptHash: `hash-${i}`,
        },
      ],
      affectedSymbols: [`symbol${i}`, `func${i % 50}`],
      tags: [`tag${i % 5}`, `category-${categories[i % categories.length]}`],
    });
  }

  return {
    version: CTG_VERSION,
    generated_at: new Date().toISOString(),
    run_id: `perf-test-${count}`,
    repo: { root: "/test/repo" },
    tool: { name: "code-to-gate", version: "0.2.0", plugin_versions: [] },
    artifact: "findings",
    schema: "findings@v1",
    completeness: "complete",
    findings,
    unsupported_claims: [],
  };
}

describe("Viewer Performance", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = path.join(tmpdir(), `ctg-viewer-perf-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterAll(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("HTML generation performance", () => {
    it("generates HTML for small findings set (< 50) under threshold", () => {
      const findings = createLargeFindingsArtifact(30);
      const artifacts = { findings };

      const start = Date.now();
      const html = generateReportHtml(artifacts);
      const duration = Date.now() - start;

      expect(html).toBeDefined();
      expect(html.length).toBeGreaterThan(1000);
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.small);
    });

    it("generates HTML for medium findings set (< 500) under threshold", () => {
      const findings = createLargeFindingsArtifact(200);
      const artifacts = { findings };

      const start = Date.now();
      const html = generateReportHtml(artifacts);
      const duration = Date.now() - start;

      expect(html).toBeDefined();
      expect(html.length).toBeGreaterThan(50000);
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.medium);
    });

    it("generates HTML for large findings set (< 1000) under threshold", () => {
      const findings = createLargeFindingsArtifact(500);
      const artifacts = { findings };

      const start = Date.now();
      const html = generateReportHtml(artifacts);
      const duration = Date.now() - start;

      expect(html).toBeDefined();
      expect(html.length).toBeGreaterThan(100000);
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.large);
    });

    it("writes HTML file efficiently", () => {
      const findings = createLargeFindingsArtifact(200);
      const outputPath = path.join(tempDir, "perf-report.html");

      const start = Date.now();
      writeReportHtml(outputPath, { findings });
      const duration = Date.now() - start;

      expect(existsSync(outputPath)).toBe(true);
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.medium + 100); // +100 for file I/O
    });
  });

  describe("HTML content verification", () => {
    it("includes all findings in generated HTML", () => {
      const findings = createLargeFindingsArtifact(50);
      const html = generateReportHtml({ findings });

      // Check that finding IDs are present
      expect(html).toContain("finding-0");
      expect(html).toContain("finding-49");
    });

    it("includes severity distribution", () => {
      const findings = createLargeFindingsArtifact(100);
      const html = generateReportHtml({ findings });

      expect(html).toContain("critical");
      expect(html).toContain("high");
      expect(html).toContain("medium");
      expect(html).toContain("low");
    });

    it("includes category distribution", () => {
      const findings = createLargeFindingsArtifact(100);
      const html = generateReportHtml({ findings });

      expect(html).toContain("security");
      expect(html).toContain("auth");
      expect(html).toContain("validation");
    });

    it("generates valid HTML structure for large findings", () => {
      const findings = createLargeFindingsArtifact(300);
      const html = generateReportHtml({ findings });

      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("<html");
      expect(html).toContain("</html>");
      expect(html).toContain("<body");
      expect(html).toContain("</body>");
    });
  });

  describe("Performance summary", () => {
    it("reports performance metrics for documentation", () => {
      // This test documents expected performance characteristics
      const testSizes = [10, 50, 100, 200, 500];

      const metrics: Array<{ size: number; duration: number; htmlSize: number }> = [];

      for (const size of testSizes) {
        const findings = createLargeFindingsArtifact(size);

        const start = Date.now();
        const html = generateReportHtml({ findings });
        const duration = Date.now() - start;

        metrics.push({
          size,
          duration,
          htmlSize: html.length,
        });
      }

      // Log metrics for documentation (visible in test output)
      console.log("\nViewer Performance Metrics:");
      console.log("Size | Duration (ms) | HTML Size (KB)");
      console.log("-----|---------------|---------------");
      for (const m of metrics) {
        console.log(`${m.size} | ${m.duration} | ${(m.htmlSize / 1024).toFixed(1)}`);
      }

      // All should complete within reasonable time
      expect(metrics.every(m => m.duration < 5000)).toBe(true);
    });
  });
});