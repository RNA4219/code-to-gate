/**
 * Performance Evidence Collector
 *
 * Runs performance tests and collects timing results for product acceptance.
 * Output: .qh/acceptance/timing.json
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const ACCEPTANCE_DIR = ".qh/acceptance";
const TIMING_FILE = path.join(ACCEPTANCE_DIR, "timing.json");

interface TimingResult {
  test_name: string;
  duration_ms: number;
  target_ms: number;
  passed: boolean;
  repo?: string;
  file_count?: number;
  timestamp: string;
}

interface TimingReport {
  version: string;
  generated_at: string;
  tool: string;
  results: TimingResult[];
  summary: {
    total_tests: number;
    passed_tests: number;
    failed_tests: number;
    total_duration_ms: number;
  };
}

// Ensure acceptance directory exists
if (!existsSync(ACCEPTANCE_DIR)) {
  mkdirSync(ACCEPTANCE_DIR, { recursive: true });
}

const results: TimingResult[] = [];
const now = new Date().toISOString();

console.log("Running performance tests...");

// Run vitest with JSON reporter
const vitestProcess = spawn(
  "npx",
  ["vitest", "run", "--config", "vitest.heavy.config.ts", "--reporter=json"],
  {
    shell: true,
    cwd: process.cwd(),
  }
);

let stdout = "";
let stderr = "";

vitestProcess.stdout.on("data", (data) => {
  stdout += data.toString();
});

vitestProcess.stderr.on("data", (data) => {
  stderr += data.toString();
});

vitestProcess.on("close", (code) => {
  console.log(`Vitest exited with code ${code}`);

  // Parse vitest JSON output
  const lines = stdout.split("\n");
  for (const line of lines) {
    if (line.startsWith("{") && line.includes('"type":')) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.type === "test" && parsed.result?.duration) {
          const testName = parsed.name || parsed.testName || "unknown";
          const duration = parsed.result.duration;
          const passed = parsed.result.status === "passed";

          // Extract target from test name patterns
          let target = 0;
          if (testName.includes("scan") && testName.includes("30s")) {
            target = 30000;
          } else if (testName.includes("analyze") && testName.includes("60s")) {
            target = 60000;
          } else if (testName.includes("schema") && testName.includes("5s")) {
            target = 5000;
          } else if (testName.includes("viewer") && testName.includes("large")) {
            target = 1000;
          }

          results.push({
            test_name: testName,
            duration_ms: Math.round(duration),
            target_ms: target,
            passed,
            timestamp: now,
          });
        }
      } catch {
        // Skip non-JSON lines
      }
    }
  }

  // Create timing report
  const report: TimingReport = {
    version: "ctg/v1",
    generated_at: now,
    tool: "code-to-gate performance-collector v1",
    results,
    summary: {
      total_tests: results.length,
      passed_tests: results.filter((r) => r.passed).length,
      failed_tests: results.filter((r) => !r.passed).length,
      total_duration_ms: results.reduce((sum, r) => sum + r.duration_ms, 0),
    },
  };

  // Write timing file
  try {
    writeFileSync(TIMING_FILE, JSON.stringify(report, null, 2) + "\n", "utf8");
    console.log(`Timing results saved to ${TIMING_FILE}`);
    console.log(`Summary: ${report.summary.passed_tests}/${report.summary.total_tests} passed`);
  } catch (error) {
    console.error("Failed to write timing file:", error);
  }
});