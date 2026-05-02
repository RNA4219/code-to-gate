/**
 * Mock generators for tests
 *
 * Centralized mock artifact generators to reduce duplication across test files.
 */

import {
  FindingsArtifact,
  RiskRegisterArtifact,
  TestSeedsArtifact,
  ReleaseReadinessArtifact,
  Finding,
  EvidenceRef,
  CTG_VERSION,
  Severity,
  FindingCategory,
  Likelihood,
  ToolRef,
} from "../types/artifacts.js";

const DEFAULT_TOOL: ToolRef = {
  name: "code-to-gate",
  version: "1.0.0",
  plugin_versions: [],
};

const DEFAULT_RUN_ID = "ctg-test-run-001";

/**
 * Create a mock Finding
 */
export function createMockFinding(
  severity: Severity = "high",
  category: FindingCategory = "security",
  overrides?: Partial<Finding>
): Finding {
  const id = overrides?.id ?? `finding-${severity}-${category}-${Date.now().toString(36)}`;
  const evidence: EvidenceRef[] = overrides?.evidence ?? [
    {
      id: `evidence-${id}`,
      path: "src/test.ts",
      startLine: 10,
      endLine: 20,
      kind: "ast",
    },
  ];

  return {
    id,
    ruleId: overrides?.ruleId ?? `RULE-${category}`,
    category,
    severity,
    confidence: overrides?.confidence ?? 0.85,
    title: overrides?.title ?? `Test finding ${severity} ${category}`,
    summary: overrides?.summary ?? `Test summary for ${severity} ${category}`,
    evidence,
    tags: overrides?.tags ?? [],
    ...overrides,
  };
}

/**
 * Create a mock FindingsArtifact
 */
export function createMockFindingsArtifact(
  overrides?: Partial<FindingsArtifact>
): FindingsArtifact {
  const base: FindingsArtifact = {
    version: CTG_VERSION,
    generated_at: new Date().toISOString(),
    run_id: DEFAULT_RUN_ID,
    repo: { root: "." },
    tool: DEFAULT_TOOL,
    artifact: "findings",
    schema: "findings@v1",
    completeness: "complete",
    findings: [],
    unsupported_claims: [],
  };
  return { ...base, ...overrides } as FindingsArtifact;
}

/**
 * Create a mock RiskRegisterArtifact
 */
export function createMockRiskRegisterArtifact(
  overrides?: Partial<RiskRegisterArtifact>
): RiskRegisterArtifact {
  const base: RiskRegisterArtifact = {
    version: CTG_VERSION,
    generated_at: new Date().toISOString(),
    run_id: DEFAULT_RUN_ID,
    repo: { root: "." },
    tool: DEFAULT_TOOL,
    artifact: "risk-register",
    schema: "risk-register@v1",
    completeness: "complete",
    risks: [],
  };
  return { ...base, ...overrides } as RiskRegisterArtifact;
}

/**
 * Create a mock RiskSeed
 */
export function createMockRisk(overrides?: Partial<RiskRegisterArtifact["risks"][number]>): RiskRegisterArtifact["risks"][number] {
  const id = overrides?.id ?? `risk-${Date.now().toString(36)}`;
  return {
    id,
    title: overrides?.title ?? "Test Risk",
    severity: overrides?.severity ?? "high",
    likelihood: overrides?.likelihood ?? "medium" as Likelihood,
    impact: overrides?.impact ?? ["Financial loss"],
    confidence: overrides?.confidence ?? 0.8,
    sourceFindingIds: overrides?.sourceFindingIds ?? [],
    evidence: overrides?.evidence ?? [],
    recommendedActions: overrides?.recommendedActions ?? ["Fix the issue"],
    narrative: overrides?.narrative,
  };
}

/**
 * Create a mock TestSeedsArtifact
 */
export function createMockTestSeedsArtifact(
  overrides?: Partial<TestSeedsArtifact>
): TestSeedsArtifact {
  const base: TestSeedsArtifact = {
    version: CTG_VERSION,
    generated_at: new Date().toISOString(),
    run_id: DEFAULT_RUN_ID,
    repo: { root: "." },
    tool: DEFAULT_TOOL,
    artifact: "test-seeds",
    schema: "test-seeds@v1",
    completeness: "complete",
    seeds: [],
  };
  return { ...base, ...overrides } as TestSeedsArtifact;
}

/**
 * Create a mock TestSeed
 */
export function createMockTestSeed(overrides?: Partial<TestSeedsArtifact["seeds"][number]>): TestSeedsArtifact["seeds"][number] {
  const id = overrides?.id ?? `seed-${Date.now().toString(36)}`;
  return {
    id,
    title: overrides?.title ?? "Test Seed",
    intent: overrides?.intent ?? "regression",
    sourceRiskIds: overrides?.sourceRiskIds ?? [],
    sourceFindingIds: overrides?.sourceFindingIds ?? [],
    evidence: overrides?.evidence ?? [],
    suggestedLevel: overrides?.suggestedLevel ?? "e2e",
    notes: overrides?.notes,
  };
}

/**
 * Create a mock ReleaseReadinessArtifact
 */
export function createMockReleaseReadinessArtifact(
  overrides?: Partial<ReleaseReadinessArtifact>
): ReleaseReadinessArtifact {
  const base: ReleaseReadinessArtifact = {
    version: CTG_VERSION,
    generated_at: new Date().toISOString(),
    run_id: DEFAULT_RUN_ID,
    repo: { root: "." },
    tool: DEFAULT_TOOL,
    artifact: "release-readiness",
    schema: "release-readiness@v1",
    completeness: "complete",
    status: "passed",
    summary: "All checks passed",
    blockers: [],
    warnings: [],
    passedChecks: [],
    metrics: {
      criticalFindings: 0,
      highFindings: 0,
      mediumFindings: 0,
      lowFindings: 0,
      riskCount: 0,
      testSeedCount: 0,
    },
  };
  return { ...base, ...overrides } as ReleaseReadinessArtifact;
}