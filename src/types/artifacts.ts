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
  releasePack: "release-pack@v1",
  hostedStaticReport: "hosted-static-report@v1",
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
  releasePack: "release-pack@v1",
  hostedStaticReport: "hosted-static-report@v1",
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
  | "sarif"
  | "codeql"
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

export interface PackageRiskSummary {
  packagePath: string;
  findingCount: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  riskIds: string[];
}

export interface RiskRegisterArtifact extends ArtifactHeader {
  artifact: "risk-register";
  schema: "risk-register@v1";
  completeness: Completeness;
  risks: RiskSeed[];
  packageSummary?: PackageRiskSummary[];
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

export const READINESS_STATUSES = [
  "passed",
  "passed_with_risk",
  "needs_review",
  "blocked_input",
  "failed",
] as const;

export type ReadinessStatus = typeof READINESS_STATUSES[number];
export type PolicyReadinessStatus = Exclude<ReadinessStatus, "failed">;

export interface ReadinessFailedCondition {
  id: string;
  reason: string;
  matchedFindingIds?: string[];
  matchedRiskIds?: string[];
  matchedInputIds?: string[];
}

export interface ReleaseReadinessCounts {
  findings: number;
  critical: number;
  high: number;
  risks: number;
  testSeeds: number;
  unsupportedClaims: number;
}

export interface ReleaseReadinessSelfAnalysis {
  rawCritical: number;
  rawHigh: number;
  rawMedium: number;
  rawLow: number;
  suppressedCritical: number;
  suppressedHigh: number;
  suppressedMedium: number;
  suppressedLow: number;
  broadSuppressions: number;
  acceptedExceptionsByClass: Record<
    "self-reference" | "fixture-intentional" | "generated-artifact" | "accepted-design" | "temporary-debt",
    number
  >;
}

export interface ReleaseReadinessBaselineSummary {
  mode: "ratchet";
  source: string;
  baselineRunId?: string;
  baselineFindings: number;
  currentFindings: number;
  newFindings: number;
  worsenedFindings: number;
  unchangedFindings: number;
  resolvedFindings: number;
  gatedFindingIds: string[];
  resolvedFindingIds: string[];
}

export interface ReleaseReadinessArtifact extends ArtifactHeader {
  artifact: "release-readiness";
  schema: "release-readiness@v1";
  completeness: Completeness;
  status: ReadinessStatus;
  summary: string;
  counts: ReleaseReadinessCounts;
  selfAnalysis?: ReleaseReadinessSelfAnalysis;
  baseline?: ReleaseReadinessBaselineSummary;
  failedConditions: ReadinessFailedCondition[];
  recommendedActions: string[];
  artifactRefs: {
    graph?: string;
    findings?: string;
    riskRegister?: string;
    invariants?: string;
    testSeeds?: string;
    audit?: string;
    intake?: string;
    baseline?: string;
    manualEvidence?: string;
  };
}

// === Audit ===

export interface AuditInput {
  path: string;
  hash: string;
  kind: "source" | "config" | "policy" | "external-result";
}

export interface AuditOutputArtifact {
  path: string;
  hash: string;
  stable_hash?: string;
  kind: "json" | "yaml" | "markdown" | "graph" | "test-seeds" | "invariants" | "self-analysis" | "database";
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
  artifacts?: AuditOutputArtifact[];
  llm?: AuditLlm;
  policy: AuditPolicy;
  exit: AuditExit;
}

// === Evidence DAG ===

export type EvidenceDagNodeType =
  | "requirement"
  | "rule"
  | "finding"
  | "artifact"
  | "verdict"
  | "manual-test"
  | "ci-run";

export type EvidenceDagEdgeType =
  | "satisfies"
  | "generated_by"
  | "evidenced_by"
  | "gated_by"
  | "exports_to"
  | "requires_manual_oracle";

export interface EvidenceDagNode {
  id: string;
  type: EvidenceDagNodeType;
  label: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface EvidenceDagEdge {
  id: string;
  source: string;
  target: string;
  type: EvidenceDagEdgeType;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface EvidenceDagArtifact extends ArtifactHeader {
  artifact: "evidence-dag";
  schema: "evidence-dag@v1";
  completeness: Completeness;
  nodes: EvidenceDagNode[];
  edges: EvidenceDagEdge[];
  summary: {
    nodeCount: number;
    edgeCount: number;
    findings: number;
    artifacts: number;
    verdicts: number;
  };
}

// === Spec Drift ===

export type SpecDriftCheckType = "command" | "schema" | "test" | "status";
export type SpecDriftCheckStatus = "pass" | "fail" | "warning";

export interface SpecDriftEvidence {
  path: string;
  detail: string;
}

export interface SpecDriftCheck {
  id: string;
  type: SpecDriftCheckType;
  status: SpecDriftCheckStatus;
  summary: string;
  expected?: string[];
  actual?: string[];
  evidence: SpecDriftEvidence[];
}

export interface SpecDriftFinding {
  id: string;
  severity: Severity;
  category: "release-risk";
  title: string;
  summary: string;
  sourceCheckId: string;
  evidence: SpecDriftEvidence[];
}

export interface SpecDriftArtifact extends ArtifactHeader {
  artifact: "spec-drift";
  schema: "spec-drift@v1";
  completeness: Completeness;
  status: "passed" | "failed";
  checks: SpecDriftCheck[];
  findings: SpecDriftFinding[];
  summary: {
    checks: number;
    failed: number;
    warnings: number;
    findings: number;
  };
}

// === Doctor ===

export type DoctorCheckStatus = "pass" | "warn" | "fail" | "skip";
export type DoctorCheckCategory = "runtime" | "tooling" | "filesystem" | "schema" | "artifact" | "ci";

export interface DoctorCheck {
  id: string;
  category: DoctorCheckCategory;
  status: DoctorCheckStatus;
  summary: string;
  observed?: string;
  remediation?: string;
}

export interface DoctorArtifact extends ArtifactHeader {
  artifact: "doctor";
  schema: "doctor@v1";
  completeness: Completeness;
  status: "passed" | "needs_attention" | "failed";
  checks: DoctorCheck[];
  summary: {
    checks: number;
    passed: number;
    warnings: number;
    failed: number;
    skipped: number;
  };
}

// === Test Plan ===

export type TestPlanStatus = "ready" | "needs_manual_oracle" | "no_changes";
export type TestPlanLevel = "unit" | "integration" | "e2e" | "manual" | "smoke";
export type TestPlanPriority = "high" | "medium" | "low";

export interface TestPlanEvidence {
  path: string;
  detail: string;
}

export interface TestPlanItem {
  id: string;
  title: string;
  target: string;
  level: TestPlanLevel;
  priority: TestPlanPriority;
  reason: string;
  sourcePaths: string[];
  evidence: TestPlanEvidence[];
  command?: string;
}

export interface TestPlanOracleGap {
  id: string;
  sourcePath: string;
  reason: string;
  suggestedManualTest: string;
  evidence: TestPlanEvidence[];
}

export interface TestPlanArtifact extends ArtifactHeader {
  artifact: "test-plan";
  schema: "test-plan@v1";
  completeness: Completeness;
  status: TestPlanStatus;
  changedFiles: string[];
  affectedFiles: string[];
  recommendedTests: TestPlanItem[];
  oracleGaps: TestPlanOracleGap[];
  summary: {
    changedFiles: number;
    affectedFiles: number;
    recommendedTests: number;
    oracleGaps: number;
  };
}

// === Quality Pack ===

export type QualityPackId =
  | "security-basic"
  | "release-evidence"
  | "frontend-risk"
  | "api-contract"
  | "ai-generated-code"
  | "compliance-lite";

export interface QualityPackRules {
  include: string[];
  block: string[];
  warn: string[];
}

export interface QualityPackPolicyProfile {
  blocking: {
    severity: Partial<Record<Severity, boolean>>;
    category: Partial<Record<FindingCategory, boolean>>;
    rules: Record<string, boolean>;
  };
  confidence: {
    minConfidence: number;
    lowConfidenceThreshold: number;
    filterLow: boolean;
  };
  baseline?: {
    enabled: boolean;
    newFindingsBlock: boolean;
  };
  llm?: {
    mode: "local-only" | "none";
    requireLlm: boolean;
  };
}

export interface QualityPackDefinition {
  id: QualityPackId;
  name: string;
  description: string;
  useCase: string;
  maturity: "stable" | "preview";
  tags: string[];
  rules: QualityPackRules;
  policy: QualityPackPolicyProfile;
  exports: string[];
  recommendedCommands: string[];
}

export interface QualityPackArtifact extends ArtifactHeader {
  artifact: "quality-pack";
  schema: "quality-pack@v1";
  completeness: Completeness;
  pack: QualityPackDefinition;
}

// === Release Pack ===

export type ReleasePackStatus = "ready" | "partial";

export type ReleasePackEntryRole =
  | "qeg"
  | "audit"
  | "diff"
  | "readiness"
  | "manual-bb"
  | "ci"
  | "artifact"
  | "generated";

export interface ReleasePackEntry {
  id: string;
  role: ReleasePackEntryRole;
  label: string;
  kind: "required" | "optional" | "generated";
  present: boolean;
  sourcePath?: string;
  packPath?: string;
  hashSha256?: string;
  schema?: string;
  sizeBytes?: number;
  generatedAt?: string;
  description?: string;
}

export interface ReleasePackArtifact extends ArtifactHeader {
  artifact: "release-pack";
  schema: "release-pack@v1";
  completeness: Completeness;
  status: ReleasePackStatus;
  ci: {
    url?: string;
    provider?: "github-actions" | "manual";
    runId?: string;
  };
  entries: ReleasePackEntry[];
  outputs: {
    manifest: string;
    html: string;
    zip: string;
  };
  summary: {
    requiredEvidence: number;
    presentRequiredEvidence: number;
    missingRequiredEvidence: number;
    includedArtifacts: number;
    findings: number;
    readinessStatus?: string;
    qegSchemaChecks: number;
    manualTestCandidates: number;
    changedFiles: number;
    ciUrl?: string;
  };
}

// === Hosted Static Report ===

export type HostedStaticReportTarget = "github-pages" | "artifact-preview" | "generic-static";

export interface HostedStaticReportSourceArtifact {
  id: string;
  file: string;
  schema?: string;
  hashSha256: string;
  sizeBytes: number;
  generatedAt?: string;
}

export interface HostedStaticReportArtifact extends ArtifactHeader {
  artifact: "hosted-static-report";
  schema: "hosted-static-report@v1";
  completeness: Completeness;
  target: HostedStaticReportTarget;
  publicUrl?: string;
  html: {
    path: string;
    hashSha256: string;
    sizeBytes: number;
    singleFile: boolean;
    externalAssets: string[];
  };
  sourceArtifacts: HostedStaticReportSourceArtifact[];
  security: {
    selfContained: boolean;
    externalNetworkRequired: boolean;
    inlineAssets: boolean;
  };
  compatibleHosts: HostedStaticReportTarget[];
  generated_by: "ctg-viewer-hosted-v1";
}

// === Normalized Repo Graph (for analyze input) ===

export interface RepoFile {
  id: string;
  path: string;
  language: "ts" | "tsx" | "js" | "jsx" | "py" | "rb" | "go" | "rs" | "java" | "php" | "cs" | "cpp" | "unknown";
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

export interface RepoModule {
  id: string;
  path: string;
  name?: string;
  version?: string;
  packageManager?: "npm" | "pnpm" | "yarn" | "unknown";
  workspace?: boolean;
  dependencies?: string[];
}

export interface NormalizedRepoGraph extends ArtifactHeader {
  artifact: "normalized-repo-graph";
  schema: "normalized-repo-graph@v1";
  files: RepoFile[];
  modules: RepoModule[];
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
