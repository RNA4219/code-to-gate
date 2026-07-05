import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import type {
  HostedEvidencePortalArtifact,
  HostedEvidencePortalRun,
  HostedEvidencePortalRunArtifact,
  HostedEvidencePortalSearchEntry,
  RedactionProfile,
  RedactionSummary,
} from "../types/artifacts.js";
import { getAllStyles } from "./styles.js";
import { escapeHtml } from "./report-sections.js";

const PORTAL_ARTIFACT_FILES = [
  "release-readiness.json",
  "historical-comparison.json",
  "release-pack.json",
  "manual-bb.json",
  "manual-bb-seed.json",
  "pr-review.json",
  "baseline-debt-ledger.json",
  "hosted-static-report.json",
  "qeg-code-to-gate.json",
  "evidence-dag.json",
] as const;

export interface EvidencePortalOptions {
  runsDir: string;
  cwd: string;
  outputPath: string;
  version: string;
  publicUrl?: string;
  redactionProfile: RedactionProfile;
  redactionSummary: RedactionSummary;
  now?: Date;
}

export interface EvidencePortalResult {
  html: string;
  manifest: HostedEvidencePortalArtifact;
}

function sha256(content: Buffer | string): string {
  return createHash("sha256").update(content).digest("hex");
}

function relativeToCwd(cwd: string, filePath: string): string {
  return path.relative(cwd, filePath) || ".";
}

function readJson(filePath: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getString(record: Record<string, unknown> | null, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" ? value : undefined;
}

function collectRunDirs(runsDir: string): string[] {
  const directArtifacts = PORTAL_ARTIFACT_FILES.some((file) => existsSync(path.join(runsDir, file)));
  const childDirs = readdirSync(runsDir)
    .map((entry) => path.join(runsDir, entry))
    .filter((entry) => statSync(entry).isDirectory())
    .filter((entry) => PORTAL_ARTIFACT_FILES.some((file) => existsSync(path.join(entry, file))))
    .sort();
  return directArtifacts ? [runsDir, ...childDirs] : childDirs;
}

function artifactRecord(cwd: string, filePath: string): HostedEvidencePortalRunArtifact {
  const content = readFileSync(filePath);
  const parsed = readJson(filePath);
  const schema = getString(parsed, "schema") ?? getString(parsed, "version");
  return {
    file: relativeToCwd(cwd, filePath),
    schema,
    hashSha256: sha256(content),
    sizeBytes: statSync(filePath).size,
    generatedAt: getString(parsed, "generated_at"),
  };
}

function countExpiredBaselineDebt(ledger: Record<string, unknown> | null): number {
  const items = ledger?.items;
  if (!Array.isArray(items)) return 0;
  return items.filter((item) => typeof item === "object" && item !== null && (item as { expired?: unknown }).expired === true).length;
}

function searchText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(searchText).filter(Boolean).join(" ");
  }
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).map(searchText).filter(Boolean).join(" ");
  }
  return "";
}

function addSearchEntry(
  entries: HostedEvidencePortalSearchEntry[],
  input: Omit<HostedEvidencePortalSearchEntry, "id">
): void {
  entries.push({ id: `portal-search-${String(entries.length + 1).padStart(3, "0")}`, ...input });
}

function buildRun(input: { runDir: string; runsDir: string; cwd: string; searchIndex: HostedEvidencePortalSearchEntry[] }): HostedEvidencePortalRun {
  const artifacts: HostedEvidencePortalRunArtifact[] = [];
  const parsedByFile = new Map<string, Record<string, unknown> | null>();
  for (const file of PORTAL_ARTIFACT_FILES) {
    const filePath = path.join(input.runDir, file);
    if (!existsSync(filePath)) continue;
    artifacts.push(artifactRecord(input.cwd, filePath));
    parsedByFile.set(file, readJson(filePath));
  }

  const readiness = parsedByFile.get("release-readiness.json") ?? null;
  const historical = parsedByFile.get("historical-comparison.json") ?? null;
  const releasePack = parsedByFile.get("release-pack.json") ?? null;
  const manualBb = parsedByFile.get("manual-bb.json") ?? parsedByFile.get("manual-bb-seed.json") ?? null;
  const prReview = parsedByFile.get("pr-review.json") ?? null;
  const baselineLedger = parsedByFile.get("baseline-debt-ledger.json") ?? null;
  const runId = getString(readiness, "run_id")
    ?? getString(historical, "run_id")
    ?? getString(releasePack, "run_id")
    ?? path.basename(input.runDir);
  const runPath = relativeToCwd(input.cwd, input.runDir);
  const historicalSlo = historical?.qualitySlo as { status?: unknown } | undefined;
  const expiredDebt = countExpiredBaselineDebt(baselineLedger);

  const run: HostedEvidencePortalRun = {
    id: runId,
    path: runPath,
    generatedAt: getString(readiness, "generated_at") ?? getString(historical, "generated_at") ?? getString(releasePack, "generated_at"),
    readinessStatus: getString(readiness, "status"),
    historicalSloStatus: typeof historicalSlo?.status === "string" ? historicalSlo.status : undefined,
    releasePack: releasePack ? "release-pack.json" : undefined,
    manualBb: manualBb ? (parsedByFile.has("manual-bb.json") ? "manual-bb.json" : "manual-bb-seed.json") : undefined,
    prReview: prReview ? "pr-review.json" : undefined,
    baselineDebtExpired: expiredDebt,
    artifacts,
  };

  addSearchEntry(input.searchIndex, {
    runId,
    type: "run",
    title: `Run ${runId}`,
    text: `${runId} ${runPath} ${run.readinessStatus ?? ""} ${run.historicalSloStatus ?? ""}`,
  });

  for (const [file, parsed] of parsedByFile.entries()) {
    addSearchEntry(input.searchIndex, {
      runId,
      type: file === "release-readiness.json"
        ? "readiness"
        : file === "historical-comparison.json"
          ? "slo"
          : file === "release-pack.json"
            ? "release-pack"
            : file.startsWith("manual-bb")
              ? "manual-bb"
              : file === "pr-review.json"
                ? "pr-review"
                : file === "baseline-debt-ledger.json"
                  ? "baseline-debt"
                  : "artifact",
      title: file,
      text: searchText(parsed),
      artifact: file,
    });
  }

  return run;
}

function renderPortalHtml(input: {
  runs: HostedEvidencePortalRun[];
  searchIndex: HostedEvidencePortalSearchEntry[];
  redactionSummary: RedactionSummary;
  publicUrl?: string;
}): string {
  const styles = getAllStyles();
  const searchJson = JSON.stringify(input.searchIndex).replace(/</g, "\\u003c");
  const runRows = input.runs.map((run) => `
    <tr>
      <td>${escapeHtml(run.id)}</td>
      <td>${escapeHtml(run.readinessStatus ?? "unknown")}</td>
      <td>${escapeHtml(run.historicalSloStatus ?? "none")}</td>
      <td>${run.releasePack ? "yes" : "no"}</td>
      <td>${run.manualBb ? "yes" : "no"}</td>
      <td>${run.prReview ? "yes" : "no"}</td>
      <td>${run.baselineDebtExpired ?? 0}</td>
      <td>${run.artifacts.length}</td>
    </tr>
  `).join("");
  const artifactRows = input.runs.flatMap((run) =>
    run.artifacts.map((artifact) => `
      <tr>
        <td>${escapeHtml(run.id)}</td>
        <td>${escapeHtml(artifact.file)}</td>
        <td>${escapeHtml(artifact.schema ?? "unknown")}</td>
        <td><code>${escapeHtml(artifact.hashSha256.slice(0, 16))}</code></td>
      </tr>
    `)
  ).join("");

  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>code-to-gate Evidence Portal</title>
  <style>
${styles}
  .portal-search { width: 100%; padding: 12px; border: 1px solid var(--color-border); border-radius: 6px; margin-bottom: 16px; }
  .portal-table { width: 100%; border-collapse: collapse; }
  .portal-table th, .portal-table td { padding: 8px; border-bottom: 1px solid var(--color-border); text-align: left; vertical-align: top; }
  .portal-result { padding: 10px 0; border-bottom: 1px solid var(--color-border); }
  </style>
</head>
<body>
<div class="header">
  <div class="header-info">
    <h1>code-to-gate Evidence Portal</h1>
    <div class="header-meta">
      <div>Runs: ${input.runs.length}</div>
      <div>Public URL: ${escapeHtml(input.publicUrl ?? "not published")}</div>
      <div>Network: external access not required</div>
      <div>Redaction: ${escapeHtml(input.redactionSummary.profile)}</div>
    </div>
  </div>
  <div class="header-controls"><button class="theme-toggle" onclick="toggleTheme()"><span id="theme-label">Dark Mode</span></button></div>
</div>
<div class="section">
  <div class="section-title"><h2>Search</h2><span class="section-count">${input.searchIndex.length}</span></div>
  <input class="portal-search" id="portal-search" type="search" placeholder="Search runs, readiness, SLO, release packs, manual BB, PR reviews, baseline debt" oninput="filterPortal()">
  <div id="portal-results"></div>
</div>
<div class="section">
  <div class="section-title"><h2>Runs</h2><span class="section-count">${input.runs.length}</span></div>
  <table class="portal-table">
    <thead><tr><th>Run</th><th>Readiness</th><th>SLO</th><th>Release Pack</th><th>Manual BB</th><th>PR Review</th><th>Expired Debt</th><th>Artifacts</th></tr></thead>
    <tbody>${runRows || "<tr><td colspan=\"8\">No runs found.</td></tr>"}</tbody>
  </table>
</div>
<div class="section">
  <div class="section-title"><h2>Artifact Hashes</h2><span class="section-count">${input.runs.reduce((sum, run) => sum + run.artifacts.length, 0)}</span></div>
  <table class="portal-table">
    <thead><tr><th>Run</th><th>Artifact</th><th>Schema</th><th>SHA-256</th></tr></thead>
    <tbody>${artifactRows || "<tr><td colspan=\"4\">No artifacts found.</td></tr>"}</tbody>
  </table>
</div>
<script>
const portalSearchIndex = ${searchJson};
function toggleTheme() {
  const html = document.documentElement;
  const next = html.getAttribute("data-theme") === "dark" ? "light" : "dark";
  html.setAttribute("data-theme", next);
  const label = document.getElementById("theme-label");
  if (label) label.textContent = next === "dark" ? "Light Mode" : "Dark Mode";
}
function escapeText(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}
function filterPortal() {
  const query = document.getElementById("portal-search").value.toLowerCase().trim();
  const results = query ? portalSearchIndex.filter((entry) =>
    [entry.title, entry.text, entry.type, entry.artifact, entry.runId].filter(Boolean).join(" ").toLowerCase().includes(query)
  ).slice(0, 50) : [];
  document.getElementById("portal-results").innerHTML = results.map((entry) =>
    '<div class="portal-result"><strong>' + escapeText(entry.title) + '</strong> <span class="badge">' + escapeText(entry.type) + '</span><div>Run: ' + escapeText(entry.runId) + '</div><div>' + escapeText(entry.text).slice(0, 240) + '</div></div>'
  ).join("");
}
</script>
</body>
</html>`;
}

export function createEvidencePortal(options: EvidencePortalOptions): EvidencePortalResult {
  const searchIndex: HostedEvidencePortalSearchEntry[] = [];
  const runs = collectRunDirs(options.runsDir).map((runDir) =>
    buildRun({ runDir, runsDir: options.runsDir, cwd: options.cwd, searchIndex })
  );
  const html = renderPortalHtml({
    runs,
    searchIndex,
    redactionSummary: options.redactionSummary,
    publicUrl: options.publicUrl,
  });
  const htmlBytes = Buffer.from(html, "utf8");
  const sourceArtifacts = runs.flatMap((run) => run.artifacts);
  const generatedAt = (options.now ?? new Date()).toISOString();
  const manifest: HostedEvidencePortalArtifact = {
    version: "ctg/v1",
    generated_at: generatedAt,
    run_id: `hosted-evidence-portal-${generatedAt.replace(/[-:.TZ]/g, "").slice(0, 14)}`,
    repo: { root: options.runsDir },
    tool: { name: "code-to-gate", version: options.version, plugin_versions: [] },
    artifact: "hosted-evidence-portal",
    schema: "hosted-evidence-portal@v1",
    completeness: runs.length > 0 ? "complete" : "partial",
    publicUrl: options.publicUrl,
    redactionProfile: options.redactionProfile,
    redactionSummary: options.redactionSummary,
    html: {
      path: relativeToCwd(options.cwd, options.outputPath),
      hashSha256: sha256(htmlBytes),
      sizeBytes: htmlBytes.byteLength,
      singleFile: true,
      externalAssets: [],
    },
    runs,
    searchIndex,
    sourceArtifacts,
    security: {
      selfContained: true,
      externalNetworkRequired: false,
      inlineAssets: true,
    },
    summary: {
      runs: runs.length,
      artifacts: sourceArtifacts.length,
      searchEntries: searchIndex.length,
      manualBb: runs.filter((run) => run.manualBb).length,
      releasePacks: runs.filter((run) => run.releasePack).length,
      prReviews: runs.filter((run) => run.prReview).length,
      baselineDebtExpired: runs.reduce((sum, run) => sum + (run.baselineDebtExpired ?? 0), 0),
    },
    generated_by: "ctg-viewer-portal-v1",
  };
  return { html, manifest };
}
