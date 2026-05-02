/**
 * Shared types for code-to-gate artifacts.
 * Based on docs/artifact-contracts.md and schemas/*.schema.json
 */

// Schema version constants
export const CTG_VERSION_V1 = "ctg/v1";
export const CTG_VERSION_V1ALPHA1 = "ctg/v1alpha1";

// Current stable version (v1 freeze)
export const CTG_VERSION = CTG_VERSION_V1;

// Schema version identifiers for artifacts
export const SCHEMA_VERSIONS = {
  findings: "findings@v1",
  riskRegister: "risk-register@v1",
  invariants: "invariants@v1",
  testSeeds: "test-seeds@v1",
  releaseReadiness: "release-readiness@v1",
  audit: "audit@v1",
  normalizedRepoGraph: "normalized-repo-graph@v1",
  stateGateEvidence: "ctg.state-gate/v1",
  manualBbSeed: "ctg.manual-bb/v1",
  workflowEvidence: "ctg.workflow-evidence/v1",
  gatefieldStaticResult: "ctg.gatefield/v1",
} as const;

// Legacy schema versions for backward compatibility
export const SCHEMA_VERSIONS_V1ALPHA1 = {
  findings: "findings@v1",
  riskRegister: "risk-register@v1",
  invariants: "invariants@v1",
  testSeeds: "test-seeds@v1",
  releaseReadiness: "release-readiness@v1",
  audit: "audit@v1",
  normalizedRepoGraph: "normalized-repo-graph@v1",
  stateGateEvidence: "ctg.state-gate/v1alpha1",
  manualBbSeed: "ctg.manual-bb/v1alpha1",
  workflowEvidence: "ctg.workflow-evidence/v1alpha1",
  gatefieldStaticResult: "ctg.gatefield/v1alpha1",
} as const;

export interface ArtifactHeader {
  version: "ctg/v1" | "ctg/v1alpha1";
  generated_at: string; // ISO 8601
  run_id: string;
  repo: RepoRef;
  tool: ToolRef;
}

export interface RepoRef {
  root: string;
  revision?: string;
  branch?: string;
  base_ref?: string;
  head_ref?: string;
  dirty?: boolean;
}

export interface ToolRef {
  name: "code-to-gate";
  version: string;
  config_hash?: string;
  policy_id?: string;
  plugin_versions: Array<{
    name: string;
    version: string;
    visibility: "public" | "private";
  }>;
}

export interface EvidenceRef {
  id: string;
  path: string;
  startLine?: number;
  endLine?: number;
  kind: "ast" | "text" | "import" | "external" | "test" | "coverage" | "diff";
  excerptHash?: string;
  nodeId?: string;
  symbolId?: string;
  externalRef?: {
    tool: string;
    ruleId?: string;
    url?: string;
  };
}

export type Severity = "low" | "medium" | "high" | "critical";
export type Completeness = "complete" | "partial";

// === Findings ===

export type FindingCategory =
  | "auth"
  | "payment"
  | "validation"
  | "data"
  | "config"
  | "maintainability"
  | "testing"
  | "compatibility"
  | "release-risk"
  | "security";

export type UnsupportedReason =
  | "missing_evidence"
  | "unknown_symbol"
  | "policy_conflict"
  | "schema_invalid";

export type UpstreamTool =
  | "native"
  | "semgrep"
  | "eslint"
  | "sonarqube"
  | "tsc"
  | "coverage"
  | "test";

export interface Finding {
  id: string;
  ruleId: string;
  category: FindingCategory;
  severity: Severity;
  confidence: number;
  title: string;
  summary: string;
  evidence: EvidenceRef[];
  affectedSymbols?: string[];
  affectedEntrypoints?: string[];
  tags?: string[];
  upstream?: {
    tool: UpstreamTool;
    ruleId?: string;
  };
  /** Stable fingerprint for historical matching (SHA-256 truncated to 16 chars) */
  fingerprint?: string;
}

export interface UnsupportedClaim {
  id: string;
  claim: string;
  reason: UnsupportedReason;
  sourceSection: string;
}

export interface FindingsArtifact extends ArtifactHeader {
  artifact: "findings";
  schema: "findings@v1";
  completeness: Completeness;
  findings: Finding[];
  unsupported_claims: UnsupportedClaim[];
}

// === Risk Register ===

export type Likelihood = "low" | "medium" | "high" | "unknown";

export interface RiskSeed {
  id: string;
  title: string;
  severity: Severity;
  likelihood: Likelihood;
  impact: string[];
  confidence: number;
  sourceFindingIds: string[];
  evidence: EvidenceRef[];
  narrative?: string;
  recommendedActions: string[];
}

export interface RiskRegisterArtifact extends ArtifactHeader {
  artifact: "risk-register";
  schema: "risk-register@v1";
  completeness: Completeness;
  risks: RiskSeed[];
}

// === Test Seeds ===

export type TestIntent = "regression" | "boundary" | "negative" | "abuse" | "smoke" | "compatibility";
export type TestLevel = "unit" | "integration" | "e2e" | "manual" | "exploratory";

export interface TestSeedEvidence {
  id: string;
  path: string;
  startLine?: number;
  endLine?: number;
  kind: "ast" | "text" | "import" | "external" | "test" | "coverage" | "diff";
}

export interface TestSeed {
  id: string;
  title: string;
  intent: TestIntent;
  sourceRiskIds: string[];
  sourceFindingIds: string[];
  evidence: TestSeedEvidence[];
  suggestedLevel: TestLevel;
  notes?: string;
}

export interface TestSeedsArtifact extends ArtifactHeader {
  artifact: "test-seeds";
  schema: "test-seeds@v1";
  completeness: Completeness;
  seeds: TestSeed[];
  oracle_gaps?: string[]; // Seeds without strong expected result evidence
  known_gaps?: string[];  // Seeds needing manual verification
}

// === Invariants ===

export type InvariantKind = "business" | "technical" | "security" | "data" | "api";

export interface InvariantEvidence {
  id: string;
  path: string;
  startLine?: number;
  endLine?: number;
  kind: "ast" | "text" | "import" | "external" | "test" | "coverage" | "diff";
}

export interface Invariant {
  id: string;
  statement: string;
  kind: InvariantKind;
  confidence: number;
  sourceFindingIds: string[];
  evidence: InvariantEvidence[];
  rationale?: string;
  tags?: string[];
}

export interface InvariantsArtifact extends ArtifactHeader {
  artifact: "invariants";
  schema: "invariants@v1";
  completeness: Completeness;
  invariants: Invariant[];
}

// === Release Readiness ===

export type ReadinessStatus = "passed" | "passed_with_risk" | "needs_review" | "blocked";

export interface ReleaseReadinessArtifact extends ArtifactHeader {
  artifact: "release-readiness";
  schema: "release-readiness@v1";
  completeness: Completeness;
  status: ReadinessStatus;
  summary: string;
  blockers: string[];
  warnings: string[];
  passedChecks: string[];
  metrics: {
    criticalFindings: number;
    highFindings: number;
    mediumFindings: number;
    lowFindings: number;
    riskCount: number;
    testSeedCount: number;
    coveragePercent?: number;
  };
}

// === Audit ===

export interface AuditInput {
  path: string;
  hash: string;
  kind: "source" | "config" | "policy" | "external-result";
}

export interface AuditLlm {
  provider: string;
  model: string;
  prompt_version: string;
  request_hash: string;
  response_hash: string;
  redaction_enabled: boolean;
}

export interface AuditPolicy {
  id: string;
  name?: string;
  hash: string;
}

export interface AuditExit {
  code: number;
  status: string;
  reason: string;
}

export interface AuditArtifact extends ArtifactHeader {
  artifact: "audit";
  schema: "audit@v1";
  inputs: AuditInput[];
  llm?: AuditLlm;
  policy: AuditPolicy;
  exit: AuditExit;
}

// === Normalized Repo Graph (for analyze input) ===

export interface RepoFile {
  id: string;
  path: string;
  language: "ts" | "tsx" | "js" | "jsx" | "py" | "rb" | "go" | "rs" | "java" | "php" | "unknown";
  role: "source" | "test" | "config" | "fixture" | "docs" | "generated" | "unknown";
  hash: string;
  sizeBytes: number;
  lineCount: number;
  moduleId?: string;
  parser: {
    status: "parsed" | "text_fallback" | "skipped" | "failed";
    adapter?: string;
    errorCode?: string;
  };
}

export interface NormalizedRepoGraph extends ArtifactHeader {
  artifact: "normalized-repo-graph";
  schema: "normalized-repo-graph@v1";
  files: RepoFile[];
  modules: unknown[];
  symbols: unknown[];
  relations: unknown[];
  tests: unknown[];
  configs: unknown[];
  entrypoints: unknown[];
  diagnostics: unknown[];
  stats: { partial: boolean };
}

// === Policy ===

export interface Policy {
  version: string;
  name: string;
  description?: string;
  blocking: {
    severities?: Severity[];
    categories?: FindingCategory[];
    rules?: string[];
  };
  readiness?: {
    criticalFindingStatus?: string;
    highAuthFindingStatus?: string;
    defaultRiskStatus?: string;
  };
}

// === Emit Options ===

export type EmitFormat = "json" | "yaml" | "md" | "mermaid" | "all";

export interface EmitOptions {
  formats: EmitFormat[];
  outDir: string;
}
