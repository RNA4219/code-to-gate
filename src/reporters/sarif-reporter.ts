/**
 * SARIF Reporter - generates SARIF v2.1.0 output
 *
 * Static Analysis Results Interchange Format (SARIF) is an OASIS standard
 * for exchanging static analysis results. This reporter converts code-to-gate
 * findings to SARIF v2.1.0 format for integration with tools like GitHub
 * Advanced Security, Azure DevOps, and SonarQube.
 */

import {
  FindingsArtifact,
  RiskRegisterArtifact,
  TestSeedsArtifact,
  Finding,
  Severity,
} from "../types/artifacts.js";
import { writeFileSync } from "node:fs";
import path from "node:path";

const VERSION = "0.1.0";
const SARIF_SCHEMA_URL = "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json";

// SARIF v2.1.0 type definitions

export interface SarifArtifactLocation {
  uri: string;
  uriBaseId?: string;
}

export interface SarifRegion {
  startLine: number;
  startColumn?: number;
  endLine?: number;
  endColumn?: number;
}

export interface SarifPhysicalLocation {
  artifactLocation: SarifArtifactLocation;
  region?: SarifRegion;
}

export interface SarifLocation {
  physicalLocation: SarifPhysicalLocation;
  logicalLocations?: Array<{
    name: string;
    kind?: string;
  }>;
}

export interface SarifMessage {
  text: string;
  markdown?: string;
}

export interface SarifResult {
  ruleId: string;
  ruleIndex?: number;
  level: "error" | "warning" | "note" | "none";
  message: SarifMessage;
  locations: SarifLocation[];
  relatedLocations?: SarifLocation[];
  properties?: Record<string, unknown>;
}

export interface SarifRule {
  id: string;
  name?: string;
  shortDescription?: SarifMessage;
  fullDescription?: SarifMessage;
  helpUri?: string;
  help?: SarifMessage;
  defaultConfiguration?: {
    level: "error" | "warning" | "note" | "none";
  };
  properties?: Record<string, unknown>;
}

export interface SarifToolDriver {
  name: string;
  version: string;
  informationUri?: string;
  rules: SarifRule[];
  organization?: string;
  product?: string;
  productUri?: string;
}

export interface SarifTool {
  driver: SarifToolDriver;
  extensions?: Array<{
    name: string;
    version: string;
    rules?: SarifRule[];
  }>;
}

export interface SarifRun {
  tool: SarifTool;
  results: SarifResult[];
  invocations?: Array<{
    executionSuccessful: boolean;
    startTimeUtc?: string;
    endTimeUtc?: string;
    toolExecutionNotifications?: Array<{
      level: "error" | "warning" | "note";
      message: SarifMessage;
    }>;
  }>;
  artifacts?: Array<{
    location: SarifArtifactLocation;
    roles?: string[];
    hashes?: Record<string, string>;
  }>;
  properties?: Record<string, unknown>;
}

export interface SarifLog {
  $schema: typeof SARIF_SCHEMA_URL;
  version: "2.1.0";
  runs: SarifRun[];
}

/**
 * Map code-to-gate severity to SARIF level
 *
 * Severity mapping as specified:
 * - critical/high -> error
 * - medium -> warning
 * - low -> note
 */
function mapSeverityToSarifLevel(severity: Severity): "error" | "warning" | "note" {
  switch (severity) {
    case "critical":
    case "high":
      return "error";
    case "medium":
      return "warning";
    case "low":
      return "note";
    default:
      return "note";
  }
}

/**
 * Generate a unique rule ID for a finding
 */
function generateRuleId(finding: Finding): string {
  return finding.ruleId;
}

/**
 * Collect unique rules from findings
 */
function collectRules(findings: Finding[]): SarifRule[] {
  const rulesMap = new Map<string, SarifRule>();

  for (const finding of findings) {
    const ruleId = generateRuleId(finding);
    if (!rulesMap.has(ruleId)) {
      const level = mapSeverityToSarifLevel(finding.severity);
      rulesMap.set(ruleId, {
        id: ruleId,
        shortDescription: {
          text: finding.title,
        },
        fullDescription: {
          text: finding.summary,
        },
        defaultConfiguration: {
          level,
        },
        properties: {
          category: finding.category,
          confidence: finding.confidence,
          tags: finding.tags || [],
        },
      });
    }
  }

  return Array.from(rulesMap.values());
}

/**
 * Convert finding evidence to SARIF locations
 */
function convertEvidenceToLocations(finding: Finding): SarifLocation[] {
  return finding.evidence.map((e) => ({
    physicalLocation: {
      artifactLocation: {
        uri: e.path,
      },
      region: {
        startLine: e.startLine || 1,
        endLine: e.endLine,
      },
    },
  }));
}

/**
 * Convert a single finding to a SARIF result
 */
function convertFindingToResult(finding: Finding): SarifResult {
  return {
    ruleId: finding.ruleId,
    level: mapSeverityToSarifLevel(finding.severity),
    message: {
      text: finding.summary,
      markdown: `**${finding.title}**\n\n${finding.summary}`,
    },
    locations: convertEvidenceToLocations(finding),
    properties: {
      id: finding.id,
      category: finding.category,
      confidence: finding.confidence,
      affectedSymbols: finding.affectedSymbols || [],
      affectedEntrypoints: finding.affectedEntrypoints || [],
    },
  };
}

/**
 * Generate SARIF v2.1.0 log from findings artifact
 */
export function generateSarifReport(
  findings: FindingsArtifact,
  options?: {
    includeRiskRegister?: boolean;
    includeTestSeeds?: boolean;
    riskRegister?: RiskRegisterArtifact;
    testSeeds?: TestSeedsArtifact;
  }
): SarifLog {
  const rules = collectRules(findings.findings);
  const results = findings.findings.map(convertFindingToResult);

  // Build artifacts list from evidence
  const artifactsSet = new Set<string>();
  for (const finding of findings.findings) {
    for (const e of finding.evidence) {
      artifactsSet.add(e.path);
    }
  }

  const artifacts = Array.from(artifactsSet).map((uri) => ({
    location: { uri },
    roles: ["analysisTarget"],
  }));

  const run: SarifRun = {
    tool: {
      driver: {
        name: "code-to-gate",
        version: VERSION,
        informationUri: "https://github.com/example/code-to-gate",
        rules,
        organization: "code-to-gate",
      },
    },
    results,
    invocations: [
      {
        executionSuccessful: true,
        startTimeUtc: findings.generated_at,
        endTimeUtc: findings.generated_at,
        toolExecutionNotifications: [],
      },
    ],
    artifacts,
    properties: {
      runId: findings.run_id,
      repoRoot: findings.repo.root,
      completeness: findings.completeness,
      unsupportedClaimsCount: findings.unsupported_claims.length,
    },
  };

  // Add risk register info if provided
  if (options?.includeRiskRegister && options?.riskRegister) {
    run.properties = {
      ...run.properties,
      riskCount: options.riskRegister.risks.length,
      highRiskCount: options.riskRegister.risks.filter(
        (r) => r.severity === "high" || r.severity === "critical"
      ).length,
    };
  }

  // Add test seeds info if provided
  if (options?.includeTestSeeds && options?.testSeeds) {
    run.properties = {
      ...run.properties,
      testSeedCount: options.testSeeds.seeds.length,
    };
  }

  return {
    $schema: SARIF_SCHEMA_URL,
    version: "2.1.0",
    runs: [run],
  };
}

/**
 * Write SARIF output to file
 */
export function writeSarifReport(
  outDir: string,
  findings: FindingsArtifact,
  options?: {
    filename?: string;
    includeRiskRegister?: boolean;
    includeTestSeeds?: boolean;
    riskRegister?: RiskRegisterArtifact;
    testSeeds?: TestSeedsArtifact;
  }
): string {
  const filename = options?.filename || "results.sarif";
  const filePath = path.join(outDir, filename);
  const sarif = generateSarifReport(findings, options);
  writeFileSync(filePath, JSON.stringify(sarif, null, 2) + "\n", "utf8");
  return filePath;
}

/**
 * Generate SARIF from multiple artifacts
 */
export function generateFullSarifReport(
  findings: FindingsArtifact,
  riskRegister?: RiskRegisterArtifact,
  testSeeds?: TestSeedsArtifact
): SarifLog {
  return generateSarifReport(findings, {
    includeRiskRegister: !!riskRegister,
    includeTestSeeds: !!testSeeds,
    riskRegister,
    testSeeds,
  });
}