import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { createZipEntry, createZipFile } from "../evidence/zip-utils.js";
import type { ReleasePackArtifact, ReleasePackEntry } from "../types/artifacts.js";

export interface ReleasePackOptions {
  version: string;
  fromDir?: string;
  out?: string;
  ciUrl?: string;
  includeOptional?: boolean;
  allowPartial?: boolean;
  now?: Date;
  env?: NodeJS.ProcessEnv;
}

export interface ReleasePackResult {
  artifact: ReleasePackArtifact;
  manifestPath: string;
  htmlPath: string;
  zipPath: string;
  missingRequired: ReleasePackEntry[];
}

interface InputSpec {
  id: string;
  role: ReleasePackEntry["role"];
  label: string;
  files: string[];
  required: boolean;
  description: string;
}

interface OutputPaths {
  manifestPath: string;
  htmlPath: string;
  zipPath: string;
}

const REQUIRED_INPUTS: InputSpec[] = [
  {
    id: "qeg",
    role: "qeg",
    label: "QEG evidence input",
    files: ["qeg-code-to-gate.json"],
    required: true,
    description: "Evidence-only QEG input produced by export qeg-code-to-gate.",
  },
  {
    id: "audit",
    role: "audit",
    label: "Audit metadata",
    files: ["audit.json"],
    required: true,
    description: "Run metadata and reproducibility evidence.",
  },
  {
    id: "diff",
    role: "diff",
    label: "Diff analysis",
    files: ["diff-analysis.json"],
    required: true,
    description: "Changed files and blast-radius evidence for the release.",
  },
  {
    id: "readiness",
    role: "readiness",
    label: "Release readiness",
    files: ["release-readiness.json"],
    required: true,
    description: "Policy gate verdict and failed conditions.",
  },
  {
    id: "manual-bb",
    role: "manual-bb",
    label: "Manual BB seed",
    files: ["manual-bb.json", "manual-bb-seed.json"],
    required: true,
    description: "Manual black-box risk seeds and oracle gaps.",
  },
];

const OPTIONAL_INPUTS: InputSpec[] = [
  {
    id: "findings",
    role: "artifact",
    label: "Findings",
    files: ["findings.json"],
    required: false,
    description: "Evidence-backed findings used to derive the release verdict.",
  },
  {
    id: "evidence-dag",
    role: "artifact",
    label: "Evidence DAG",
    files: ["evidence-dag.json"],
    required: false,
    description: "Cross-artifact graph for requirement, rule, finding, artifact, and verdict traceability.",
  },
  {
    id: "test-plan",
    role: "artifact",
    label: "Auto test plan",
    files: ["test-plan.json"],
    required: false,
    description: "Recommended automated and manual tests from diff blast radius.",
  },
  {
    id: "ownership-risk",
    role: "artifact",
    label: "Ownership risk",
    files: ["ownership-risk.json"],
    required: false,
    description: "CODEOWNERS reviewer candidates and module ownership risk.",
  },
  {
    id: "test-seeds",
    role: "artifact",
    label: "Test seeds",
    files: ["test-seeds.json"],
    required: false,
    description: "QA test ideas derived from findings.",
  },
  {
    id: "gatefield",
    role: "artifact",
    label: "Gatefield export",
    files: ["gatefield.json", "gatefield-static-result.json"],
    required: false,
    description: "Gatefield static result export.",
  },
  {
    id: "state-gate",
    role: "artifact",
    label: "State Gate export",
    files: ["state-gate.json", "state-gate-evidence.json"],
    required: false,
    description: "Agent State Gate evidence export.",
  },
  {
    id: "workflow-evidence",
    role: "artifact",
    label: "Workflow evidence",
    files: ["workflow.json", "workflow-evidence.json"],
    required: false,
    description: "Workflow-cookbook Evidence export.",
  },
  {
    id: "sarif",
    role: "artifact",
    label: "SARIF",
    files: ["results.sarif"],
    required: false,
    description: "SARIF result for code scanning surfaces.",
  },
  {
    id: "doctor",
    role: "artifact",
    label: "Doctor diagnostics",
    files: ["doctor.json"],
    required: false,
    description: "Local and CI readiness diagnostics.",
  },
  {
    id: "quality-pack",
    role: "artifact",
    label: "Quality Pack",
    files: ["quality-pack.json"],
    required: false,
    description: "Quality Pack preset contract used for this run.",
  },
  {
    id: "spec-drift",
    role: "artifact",
    label: "Spec drift",
    files: ["spec-drift.json"],
    required: false,
    description: "Public contract drift detector output.",
  },
  {
    id: "database-assets",
    role: "artifact",
    label: "Database assets",
    files: ["database-assets.json"],
    required: false,
    description: "Database asset and migration inventory.",
  },
];

function sha256(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function readJson(filePath: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function artifactPath(fromDir: string, fileName: string): string {
  return path.resolve(process.cwd(), fromDir, fileName);
}

function findFirstExisting(fromDir: string, files: string[]): string | undefined {
  return files.map((file) => artifactPath(fromDir, file)).find((filePath) => existsSync(filePath));
}

function relativeToCwd(filePath: string): string {
  return path.relative(process.cwd(), filePath) || ".";
}

function outputPaths(fromDir: string, out: string | undefined): OutputPaths {
  if (!out) {
    const outputDir = path.resolve(process.cwd(), fromDir, "release-pack");
    return {
      manifestPath: path.join(outputDir, "release-pack.json"),
      htmlPath: path.join(outputDir, "release-pack.html"),
      zipPath: path.join(outputDir, "release-pack.zip"),
    };
  }

  const absolute = path.resolve(process.cwd(), out);
  if (out.endsWith(".zip")) {
    const dir = path.dirname(absolute);
    const base = path.basename(absolute, ".zip");
    return {
      manifestPath: path.join(dir, `${base}.json`),
      htmlPath: path.join(dir, `${base}.html`),
      zipPath: absolute,
    };
  }

  return {
    manifestPath: path.join(absolute, "release-pack.json"),
    htmlPath: path.join(absolute, "release-pack.html"),
    zipPath: path.join(absolute, "release-pack.zip"),
  };
}

function entryFromSpec(fromDir: string, spec: InputSpec): ReleasePackEntry {
  const filePath = findFirstExisting(fromDir, spec.files);
  if (!filePath) {
    return {
      id: spec.id,
      role: spec.role,
      label: spec.label,
      kind: spec.required ? "required" : "optional",
      present: false,
      description: spec.description,
    };
  }

  const content = readFileSync(filePath);
  const parsed = readJson(filePath);
  const stats = statSync(filePath);
  const schemaValue = parsed?.schema ?? parsed?.version;
  const generatedAt = typeof parsed?.generated_at === "string" ? parsed.generated_at : undefined;

  return {
    id: spec.id,
    role: spec.role,
    label: spec.label,
    kind: spec.required ? "required" : "optional",
    present: true,
    sourcePath: relativeToCwd(filePath),
    packPath: `artifacts/${path.basename(filePath)}`,
    hashSha256: sha256(content),
    schema: typeof schemaValue === "string" ? schemaValue : undefined,
    sizeBytes: stats.size,
    generatedAt,
    description: spec.description,
  };
}

function ciUrlFromEnv(env: NodeJS.ProcessEnv): { url?: string; provider?: "github-actions"; runId?: string } {
  if (env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID) {
    return {
      url: `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`,
      provider: "github-actions",
      runId: env.GITHUB_RUN_ID,
    };
  }
  return {};
}

function ciEntry(ciUrl: string | undefined): ReleasePackEntry {
  return {
    id: "ci-url",
    role: "ci",
    label: "CI run URL",
    kind: "required",
    present: !!ciUrl,
    sourcePath: ciUrl,
    description: "CI workflow run URL for this release evidence pack.",
  };
}

function countFindings(qeg: Record<string, unknown> | null, findings: Record<string, unknown> | null): number {
  const qegSummary = qeg?.findings_summary as Record<string, unknown> | undefined;
  if (typeof qegSummary?.total === "number") {
    return qegSummary.total;
  }
  const findingsList = findings?.findings;
  return Array.isArray(findingsList) ? findingsList.length : 0;
}

function countQegSchemaChecks(qeg: Record<string, unknown> | null): number {
  const checks = qeg?.schema_compliance;
  return Array.isArray(checks) ? checks.length : 0;
}

function countManualCandidates(manual: Record<string, unknown> | null): number {
  const riskSeeds = manual?.risk_seeds;
  const oracleGaps = manual?.oracle_gaps;
  const testCases = manual?.test_cases;
  return (
    (Array.isArray(riskSeeds) ? riskSeeds.length : 0) +
    (Array.isArray(oracleGaps) ? oracleGaps.length : 0) +
    (Array.isArray(testCases) ? testCases.length : 0)
  );
}

function countChangedFiles(diff: Record<string, unknown> | null): number {
  const changedFiles = diff?.changed_files;
  return Array.isArray(changedFiles) ? changedFiles.length : 0;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function generateHtml(artifact: ReleasePackArtifact): string {
  const requiredRows = artifact.entries
    .filter((entry) => entry.kind === "required")
    .map((entry) => `
      <tr>
        <td>${escapeHtml(entry.label)}</td>
        <td class="${entry.present ? "ok" : "missing"}">${entry.present ? "present" : "missing"}</td>
        <td>${escapeHtml(entry.schema ?? "")}</td>
        <td><code>${escapeHtml(entry.hashSha256 ? entry.hashSha256.slice(0, 16) : "")}</code></td>
        <td>${entry.sourcePath?.startsWith("http") ? `<a href="${escapeHtml(entry.sourcePath)}">${escapeHtml(entry.sourcePath)}</a>` : escapeHtml(entry.sourcePath ?? "")}</td>
      </tr>`)
    .join("");

  const artifactRows = artifact.entries
    .filter((entry) => entry.present && entry.kind !== "required")
    .map((entry) => `
      <tr>
        <td>${escapeHtml(entry.label)}</td>
        <td>${escapeHtml(entry.schema ?? "")}</td>
        <td><code>${escapeHtml(entry.hashSha256?.slice(0, 16) ?? "")}</code></td>
        <td>${escapeHtml(entry.sourcePath ?? "")}</td>
      </tr>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>code-to-gate Release Pack - ${escapeHtml(artifact.run_id)}</title>
  <style>
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 32px; color: #17202a; background: #f7f8fb; }
    main { max-width: 1120px; margin: 0 auto; }
    h1, h2 { margin: 0 0 12px; }
    section { margin: 22px 0; padding: 18px; background: #fff; border: 1px solid #d9dee8; border-radius: 8px; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
    .metric { border: 1px solid #d9dee8; border-radius: 6px; padding: 12px; background: #fbfcff; }
    .metric b { display: block; font-size: 1.55rem; margin-top: 4px; }
    table { border-collapse: collapse; width: 100%; font-size: 0.92rem; }
    th, td { border-bottom: 1px solid #e5e8f0; padding: 9px; text-align: left; vertical-align: top; }
    th { background: #eef2f8; }
    code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
    .ok { color: #0f6b3a; font-weight: 700; }
    .missing { color: #a83232; font-weight: 700; }
    a { color: #175cd3; }
  </style>
</head>
<body>
<main>
  <h1>code-to-gate Release Pack</h1>
  <p>Run <code>${escapeHtml(artifact.run_id)}</code> generated at ${escapeHtml(artifact.generated_at)}</p>

  <section>
    <h2>Release Summary</h2>
    <div class="summary">
      <div class="metric">Status<b>${escapeHtml(artifact.status)}</b></div>
      <div class="metric">Readiness<b>${escapeHtml(artifact.summary.readinessStatus ?? "unknown")}</b></div>
      <div class="metric">Findings<b>${artifact.summary.findings}</b></div>
      <div class="metric">Missing Required<b>${artifact.summary.missingRequiredEvidence}</b></div>
      <div class="metric">Changed Files<b>${artifact.summary.changedFiles}</b></div>
      <div class="metric">Manual Candidates<b>${artifact.summary.manualTestCandidates}</b></div>
    </div>
    ${artifact.ci.url ? `<p>CI: <a href="${escapeHtml(artifact.ci.url)}">${escapeHtml(artifact.ci.url)}</a></p>` : "<p class=\"missing\">CI URL missing</p>"}
  </section>

  <section>
    <h2>Required Evidence</h2>
    <table>
      <thead><tr><th>Evidence</th><th>Status</th><th>Schema</th><th>Hash</th><th>Source</th></tr></thead>
      <tbody>${requiredRows}</tbody>
    </table>
  </section>

  <section>
    <h2>Included Optional Artifacts</h2>
    <table>
      <thead><tr><th>Artifact</th><th>Schema</th><th>Hash</th><th>Source</th></tr></thead>
      <tbody>${artifactRows || "<tr><td colspan=\"4\">No optional artifacts included.</td></tr>"}</tbody>
    </table>
  </section>

  <section>
    <h2>Output Paths</h2>
    <ul>
      <li>Manifest: <code>${escapeHtml(artifact.outputs.manifest)}</code></li>
      <li>HTML: <code>${escapeHtml(artifact.outputs.html)}</code></li>
      <li>ZIP: <code>${escapeHtml(artifact.outputs.zip)}</code></li>
    </ul>
  </section>
</main>
</body>
</html>`;
}

function firstParsed(fromDir: string, files: string[]): Record<string, unknown> | null {
  const filePath = findFirstExisting(fromDir, files);
  return filePath ? readJson(filePath) : null;
}

function baseHeader(fromDir: string): { runId: string; repoRoot: string; generatedAt?: string } {
  for (const file of ["audit.json", "release-readiness.json", "findings.json", "qeg-code-to-gate.json"]) {
    const parsed = readJson(artifactPath(fromDir, file));
    if (!parsed) continue;
    const repo = parsed.repo as Record<string, unknown> | undefined;
    return {
      runId: typeof parsed.run_id === "string" ? parsed.run_id : `release-pack-${Date.now()}`,
      repoRoot: typeof repo?.root === "string" ? repo.root : process.cwd(),
      generatedAt: typeof parsed.generated_at === "string" ? parsed.generated_at : undefined,
    };
  }
  return { runId: `release-pack-${Date.now()}`, repoRoot: process.cwd() };
}

export function createReleasePack(options: ReleasePackOptions): ReleasePackResult {
  const fromDir = options.fromDir ?? ".qh";
  const artifactDir = path.resolve(process.cwd(), fromDir);
  if (!existsSync(artifactDir) || !statSync(artifactDir).isDirectory()) {
    throw new Error(`artifact directory not found: ${fromDir}`);
  }

  const outputs = outputPaths(fromDir, options.out);
  mkdirSync(path.dirname(outputs.manifestPath), { recursive: true });
  mkdirSync(path.dirname(outputs.htmlPath), { recursive: true });
  mkdirSync(path.dirname(outputs.zipPath), { recursive: true });

  const requiredEntries = REQUIRED_INPUTS.map((spec) => entryFromSpec(fromDir, spec));
  const optionalEntries = options.includeOptional
    ? OPTIONAL_INPUTS.map((spec) => entryFromSpec(fromDir, spec)).filter((entry) => entry.present)
    : [];
  const ci = options.ciUrl
    ? { url: options.ciUrl, provider: "manual" as const }
    : ciUrlFromEnv(options.env ?? process.env);
  const entries = [...requiredEntries, ciEntry(ci.url), ...optionalEntries];
  const missingRequired = entries.filter((entry) => entry.kind === "required" && !entry.present);

  const qeg = firstParsed(fromDir, ["qeg-code-to-gate.json"]);
  const readiness = firstParsed(fromDir, ["release-readiness.json"]);
  const diff = firstParsed(fromDir, ["diff-analysis.json"]);
  const manual = firstParsed(fromDir, ["manual-bb.json", "manual-bb-seed.json"]);
  const findings = firstParsed(fromDir, ["findings.json"]);
  const header = baseHeader(fromDir);
  const generatedAt = (options.now ?? new Date()).toISOString();

  const artifact: ReleasePackArtifact = {
    version: "ctg/v1",
    generated_at: generatedAt,
    run_id: header.runId,
    repo: { root: header.repoRoot },
    tool: { name: "code-to-gate", version: options.version, plugin_versions: [] },
    artifact: "release-pack",
    schema: "release-pack@v1",
    completeness: missingRequired.length === 0 ? "complete" : "partial",
    status: missingRequired.length === 0 ? "ready" : "partial",
    ci,
    entries,
    outputs: {
      manifest: relativeToCwd(outputs.manifestPath),
      html: relativeToCwd(outputs.htmlPath),
      zip: relativeToCwd(outputs.zipPath),
    },
    summary: {
      requiredEvidence: entries.filter((entry) => entry.kind === "required").length,
      presentRequiredEvidence: entries.filter((entry) => entry.kind === "required" && entry.present).length,
      missingRequiredEvidence: missingRequired.length,
      includedArtifacts: entries.filter((entry) => entry.present && entry.role !== "ci").length,
      findings: countFindings(qeg, findings),
      readinessStatus: typeof readiness?.status === "string" ? readiness.status : undefined,
      qegSchemaChecks: countQegSchemaChecks(qeg),
      manualTestCandidates: countManualCandidates(manual),
      changedFiles: countChangedFiles(diff),
      ciUrl: ci.url,
    },
  };

  writeFileSync(outputs.manifestPath, JSON.stringify(artifact, null, 2) + "\n", "utf8");
  const html = generateHtml(artifact);
  writeFileSync(outputs.htmlPath, html, "utf8");

  const zipEntries = [
    createZipEntry("release-pack.json", readFileSync(outputs.manifestPath)),
    createZipEntry("release-pack.html", readFileSync(outputs.htmlPath)),
  ];

  for (const entry of entries) {
    if (entry.present && entry.sourcePath && entry.packPath && !entry.sourcePath.startsWith("http")) {
      zipEntries.push(createZipEntry(entry.packPath, readFileSync(path.resolve(process.cwd(), entry.sourcePath))));
    }
  }

  writeFileSync(outputs.zipPath, createZipFile(zipEntries));

  return {
    artifact,
    manifestPath: outputs.manifestPath,
    htmlPath: outputs.htmlPath,
    zipPath: outputs.zipPath,
    missingRequired,
  };
}
