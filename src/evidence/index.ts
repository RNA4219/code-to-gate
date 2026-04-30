/**
 * Evidence Module - Release evidence bundle creation and validation
 *
 * Based on docs/product-acceptance-v1.md Section 6 "Acceptance Evidence"
 */

export {
  EVIDENCE_VERSION,
  REQUIRED_ARTIFACTS,
  OPTIONAL_ARTIFACTS,
  ALL_ARTIFACT_TYPES,
  ARTIFACT_FILENAME_MAP,
  // Types
  EvidenceBundleMetadata,
  BundleArtifactManifest,
  ArtifactType,
  BundleValidationResult,
  ArtifactValidationResult,
  ValidationError,
  ValidationWarning,
  BundleBuilderOptions,
  BundleValidatorOptions,
  BundleSignature,
  EvidenceRunContext,
  EvidencePackage,
  // Acceptance evidence types
  ExitCodeEvidence,
  SchemaValidationEvidence,
  TimingEvidence,
  FpFnEvidence,
  DocumentationEvidence,
  AcceptanceSummaryEvidence,
} from "./evidence-types.js";

export {
  // Bundle creation
  generateBundleId,
  calculateFileHash,
  calculateContentHash,
  detectArtifactType,
  isRequiredArtifact,
  isOptionalArtifact,
  findAvailableArtifacts,
  buildArtifactManifest,
  buildBundleMetadata,
  generateBundleSignature,
  createEvidenceBundle,
  // Bundle validation
  validateEvidenceBundle,
  // Bundle operations
  listBundleContents,
  extractBundleContents,
} from "./bundle-builder.js";