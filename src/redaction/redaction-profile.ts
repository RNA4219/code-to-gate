import type {
  RedactionProfile,
  RedactionProfileBinding,
  RedactionProfileName,
  RedactionSummary,
} from "../types/artifacts.js";

export const REDACTION_PROFILES: Record<RedactionProfileName, Omit<RedactionProfile, "name" | "binding">> = {
  public: {
    allowsPath: true,
    allowsHash: true,
    allowsCount: true,
    allowsExcerpt: false,
    allowsDetail: false,
    requiresSigner: false,
    requiresRetention: false,
    requiresApprovalBinding: false,
  },
  private: {
    allowsPath: true,
    allowsHash: true,
    allowsCount: true,
    allowsExcerpt: true,
    allowsDetail: true,
    requiresSigner: false,
    requiresRetention: false,
    requiresApprovalBinding: false,
  },
  regulated: {
    allowsPath: true,
    allowsHash: true,
    allowsCount: true,
    allowsExcerpt: true,
    allowsDetail: true,
    requiresSigner: true,
    requiresRetention: true,
    requiresApprovalBinding: true,
  },
};

export function isRedactionProfileName(value: string | undefined): value is RedactionProfileName {
  return value === "public" || value === "private" || value === "regulated";
}

export function createRedactionProfile(
  name: RedactionProfileName = "private",
  binding: RedactionProfileBinding = {}
): RedactionProfile {
  const base = REDACTION_PROFILES[name];
  return {
    name,
    ...base,
    ...(Object.keys(binding).length > 0 ? { binding } : {}),
  };
}

export function redactionWarnings(profile: RedactionProfile): string[] {
  const warnings: string[] = [];
  if (profile.requiresSigner && !profile.binding?.signer) {
    warnings.push("regulated profile requires signer");
  }
  if (profile.requiresRetention && !profile.binding?.retention) {
    warnings.push("regulated profile requires retention");
  }
  if (profile.requiresApprovalBinding && !profile.binding?.approvalBinding) {
    warnings.push("regulated profile requires approval binding");
  }
  return warnings;
}

export function createRedactionSummary(profile: RedactionProfile): RedactionSummary {
  const visibleFields = ["path", "hash", "count"];
  const redactedFields: string[] = [];
  if (profile.allowsExcerpt) visibleFields.push("excerpt");
  else redactedFields.push("excerpt");
  if (profile.allowsDetail) visibleFields.push("detail");
  else redactedFields.push("detail");

  return {
    profile: profile.name,
    visibleFields,
    redactedFields,
    warnings: redactionWarnings(profile),
  };
}

export function parseRedactionProfileOption(value: string | undefined): RedactionProfile {
  if (!value) return createRedactionProfile("private");
  if (!isRedactionProfileName(value)) {
    throw new Error(`invalid --redaction-profile: ${value}. expected public, private, or regulated`);
  }
  return createRedactionProfile(value);
}

export function redactDetailValue(value: unknown, profile: RedactionProfile): unknown {
  if (profile.allowsDetail) return value;
  if (typeof value === "string") return "[redacted]";
  if (value === undefined || value === null) return value;
  return "[redacted]";
}
