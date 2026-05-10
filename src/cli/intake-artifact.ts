/**
 * Intake artifact support for readiness.
 *
 * Reads planning/phase-contract artifacts as non-code evidence and turns
 * unresolved critical input gaps into release-readiness failed conditions.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

type UnknownRecord = Record<string, unknown>;

export interface IntakeBlockingIssue {
  id: string;
  reason: string;
  source: "readiness" | "open_question" | "spec_gap" | "technical_risk";
}

export interface IntakeAssessment {
  path: string;
  artifactType: "phase_contract" | "project_intake" | "unknown";
  status?: string;
  decision?: string;
  blockingIssues: IntakeBlockingIssue[];
  recommendedActions: string[];
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function getBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function getArray(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function getStatusLike(value: unknown): string | undefined {
  return getString(value)?.trim().toLowerCase();
}

function getArtifactType(data: UnknownRecord): IntakeAssessment["artifactType"] {
  const artifact = getString(data.artifact)?.toLowerCase();
  const schema = getString(data.schema)?.toLowerCase();

  if (artifact === "phase_contract" || schema?.includes("phase_contract") || "phase1_scope" in data) {
    return "phase_contract";
  }
  if (artifact === "project_intake" || schema?.includes("project_intake") || "success_conditions" in data) {
    return "project_intake";
  }
  return "unknown";
}

function isOpenStatus(value: unknown): boolean {
  const status = getStatusLike(value);
  return status === undefined || ["open", "todo", "pending", "unresolved", "unknown"].includes(status);
}

function issueId(item: UnknownRecord, fallback: string): string {
  return getString(item.id) ?? getString(item.key) ?? fallback;
}

function issueText(item: UnknownRecord, ...fields: string[]): string {
  for (const field of fields) {
    const value = getString(item[field]);
    if (value) return value;
  }
  return "Unresolved intake issue";
}

function collectCriticalIssues(
  items: UnknownRecord[],
  source: IntakeBlockingIssue["source"],
  prefix: string
): IntakeBlockingIssue[] {
  const issues: IntakeBlockingIssue[] = [];

  items.forEach((item, index) => {
    const severity = getStatusLike(item.severity);
    const blocksReady = getBoolean(item.blocks_ready) ?? getBoolean(item.blocksReady) ?? false;
    const unresolved = isOpenStatus(item.resolution_status) && isOpenStatus(item.status);

    if ((severity === "critical" || blocksReady) && unresolved) {
      const id = issueId(item, `${prefix}-${index + 1}`);
      const text = issueText(item, "question", "gap", "risk", "title", "text");
      issues.push({
        id,
        source,
        reason: `${id}: ${text}`,
      });
    }
  });

  return issues;
}

function parseIntakeFile(filePath: string): UnknownRecord {
  const content = readFileSync(filePath, "utf8");
  const extension = path.extname(filePath).toLowerCase();
  const parsed = extension === ".yaml" || extension === ".yml"
    ? yaml.load(content)
    : JSON.parse(content);

  if (!isRecord(parsed)) {
    throw new Error("intake artifact must be a JSON/YAML object");
  }
  return parsed;
}

export function assessIntakeArtifact(filePath: string): IntakeAssessment {
  const data = parseIntakeFile(filePath);
  const readiness = isRecord(data.readiness) ? data.readiness : {};
  const status = getStatusLike(readiness.status) ?? getStatusLike(data.status);
  const decision = getStatusLike(readiness.decision) ?? getStatusLike(data.decision);
  const blockingIssues: IntakeBlockingIssue[] = [];

  if (status === "blocked" || decision === "not_ready") {
    blockingIssues.push({
      id: "INTAKE_READINESS_BLOCKED",
      source: "readiness",
      reason: `Intake readiness is ${status ?? decision}`,
    });
  }

  blockingIssues.push(
    ...collectCriticalIssues(getArray(data.open_questions), "open_question", "Q"),
    ...collectCriticalIssues(getArray(data.spec_gaps), "spec_gap", "GAP"),
    ...collectCriticalIssues(getArray(data.technical_risks), "technical_risk", "TR")
  );

  const recommendedActions = blockingIssues.map((issue) =>
    `Resolve intake blocker ${issue.id} before release readiness can pass`
  );

  return {
    path: filePath,
    artifactType: getArtifactType(data),
    status,
    decision,
    blockingIssues,
    recommendedActions,
  };
}
