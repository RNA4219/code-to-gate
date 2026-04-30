/**
 * Evidence Bundle Types - Types for release evidence bundle
 *
 * Based on docs/product-acceptance-v1.md Section 6 "Acceptance Evidence"
 * and workflow-cookbook Evidence format requirements.
 */

export const EVIDENCE_VERSION = "ctg.evidence/v1alpha1";

// === Bundle Metadata ===

export interface EvidenceBundleMetadata {
  version: typeof EVIDENCE_VERSION;
  generated_at: string; // ISO 8601
  bundle_id: string; // Unique identifier for this bundle
  source: {
    repo_root: string;
    revision?: string;
    branch?: string;
    run_id: string;
    tool_version: string;
    policy_id?: string;
  };
  contents: BundleArtifactManifest[];
  signature?: BundleSignature;
  validation_status: "pending" | "valid" | "invalid";
}

export interface BundleArtifactManifest {
  name: string; // Artifact filename
  path: string; // Path within bundle
  type: ArtifactType;
  size_bytes: number;
  hash_sha256: string;
  schema_version?: string;
  generated_at?: string;
}

export type ArtifactType =
  | "repo-graph"
  | "findings"
  | "risk-register"
  | "test-seeds"
  | "release-readiness"
  | "audit"
  | "gatefield-static-result"
  | "state-gate-evidence"
  | "manual-bb-seed"
  | "workflow-evidence"
  | "sarif"
  | "metadata"
  | "signature";

export interface BundleSignature {
  algorithm: "sha256" | "sha512" | "ed25519";
  value: string;
  created_at: string;
  signer?: string;
  certificate_ref?: string;
}

// === Bundle Validation ===

export interface BundleValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  artifact_results: ArtifactValidationResult[];
  summary: {
    total_artifacts: number;
    valid_artifacts: number;
    invalid_artifacts: number;
    missing_artifacts: number;
  };
}

export interface ValidationError {
  code: string;
  message: string;
  artifact?: string;
  details?: Record<string, unknown>;
}

export interface ValidationWarning {
  code: string;
  message: string;
  artifact?: string;
}

export interface ArtifactValidationResult {
  artifact_name: string;
  artifact_type: ArtifactType;
  exists: boolean;
  hash_valid: boolean;
  schema_valid: boolean;
  parseable: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

// === Required Artifacts ===

export const REQUIRED_ARTIFACTS: ArtifactType[] = [
  "repo-graph",
  "findings",
  "risk-register",
  "release-readiness",
  "audit",
];

export const OPTIONAL_ARTIFACTS: ArtifactType[] = [
  "test-seeds",
  "gatefield-static-result",
  "state-gate-evidence",
  "manual-bb-seed",
  "workflow-evidence",
  "sarif",
];

export const ALL_ARTIFACT_TYPES: ArtifactType[] = [
  ...REQUIRED_ARTIFACTS,
  ...OPTIONAL_ARTIFACTS,
];

// === Artifact Filename Mapping ===

export const ARTIFACT_FILENAME_MAP: Record<ArtifactType, string> = {
  "repo-graph": "repo-graph.json",
  "findings": "findings.json",
  "risk-register": "risk-register.yaml",
  "test-seeds": "test-seeds.json",
  "release-readiness": "release-readiness.json",
  "audit": "audit.json",
  "gatefield-static-result": "gatefield-static-result.json",
  "state-gate-evidence": "state-gate-evidence.json",
  "manual-bb-seed": "manual-bb-seed.json",
  "workflow-evidence": "workflow-evidence.json",
  "sarif": "results.sarif",
  "metadata": "metadata.json",
  "signature": "signature.json",
};

// === Bundle Builder Options ===

export interface BundleBuilderOptions {
  sourceDir: string; // Directory containing artifacts
  outputPath: string; // Output bundle path (ZIP file)
  runId?: string; // Optional run ID override
  includeOptional?: boolean; // Include optional artifacts
  excludeArtifacts?: ArtifactType[]; // Artifacts to exclude
  sign?: boolean; // Sign the bundle
  signerOptions?: SignerOptions;
}

export interface SignerOptions {
  algorithm?: "sha256" | "sha512" | "ed25519";
  privateKeyPath?: string;
  signerName?: string;
}

// === Bundle Validator Options ===

export interface BundleValidatorOptions {
  bundlePath: string; // Path to bundle ZIP file
  strict?: boolean; // Fail on warnings
  validateSchemas?: boolean; // Validate artifact schemas
  extractDir?: string; // Directory to extract bundle contents
}

// === Evidence Export Formats ===

export type EvidenceExportFormat = "zip" | "tar" | "tar.gz" | "directory";

// === Evidence Run Context ===

export interface EvidenceRunContext {
  runId: string;
  repoRoot: string;
  revision?: string;
  branch?: string;
  toolVersion: string;
  policyId?: string;
  generatedAt: string;
}

// === Acceptance Evidence Types (from product-acceptance-v1.md Section 6) ===

export interface ExitCodeEvidence {
  run_id: string;
  date: string;
  commands: Array<{
    command: string;
    exit_code: number;
    expected: number;
    result: "pass" | "fail";
  }>;
}

export interface SchemaValidationEvidence {
  run_id: string;
  date: string;
  validations: Array<{
    artifact: string;
    schema: string;
    result: "pass" | "fail";
    errors: string[];
  }>;
}

export interface TimingEvidence {
  run_id: string;
  date: string;
  measurements: Array<{
    operation: string;
    repo?: string;
    artifact_count?: number;
    duration_seconds: number;
    target_seconds: number;
    result: "pass" | "fail";
  }>;
}

export interface FpFnEvidence {
  evaluation_id: string;
  date: string;
  evaluator?: string;
  fp_evaluation?: {
    repo: string;
    findings_count: number;
    tp_count: number;
    fp_count: number;
    uncertain_count: number;
    fp_rate: string;
    target: string;
    result: "pass" | "fail";
  };
  fn_evaluation?: {
    fixture: string;
    seeded_smells_count: number;
    detected_count: number;
    detection_rate: string;
    target: string;
    result: "pass" | "fail";
    missed_smells?: Array<{
      seeded_id: string;
      rule_id: string;
      reason: string;
    }>;
  };
}

export interface DocumentationEvidence {
  review_id: string;
  date: string;
  reviewer?: string;
  documents: Array<{
    path: string;
    required_sections: Record<string, "present" | "missing">;
    result: "pass" | "fail";
  }>;
}

export interface AcceptanceSummaryEvidence {
  product: string;
  phase: string;
  version: string;
  date: string;
  status: "GO" | "Conditional GO" | "No-Go";
  criteria_results: Record<string, boolean | { rate: string; target: string; result: string }>;
  go_criteria: Record<string, boolean>;
  conditional_criteria: string[];
  no_go_criteria: string[];
  blockers: string[];
  evidence_package: string;
  decision: "GO" | "Conditional GO" | "No-Go";
  decision_date?: string;
  decision_by?: string;
  notes?: string;
}

// === Evidence Package Structure ===

export interface EvidencePackage {
  metadata: EvidenceBundleMetadata;
  artifacts: Map<string, unknown>;
  exitCodeEvidence?: ExitCodeEvidence;
  schemaValidationEvidence?: SchemaValidationEvidence;
  timingEvidence?: TimingEvidence;
  fpFnEvidence?: FpFnEvidence;
  documentationEvidence?: DocumentationEvidence;
  acceptanceSummary?: AcceptanceSummaryEvidence;
}