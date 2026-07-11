/**
 * Evidence Bundle Validator compatibility entry point.
 *
 * Validation and extraction are implemented in bundle-builder so callers of
 * either historical module share the same ZIP parsing and safe-entry resolver.
 */

export {
  validateEvidenceBundle,
  extractBundleContents,
  listBundleContents,
} from "./bundle-builder.js";
