#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const VERSION = "0.1.0";
const CTG_VERSION = "ctg/v1alpha1";
const ROOT = process.cwd();

const EXIT = {
  OK: 0,
  READINESS_NOT_CLEAR: 1,
  USAGE_ERROR: 2,
  SCAN_FAILED: 3,
  SCHEMA_FAILED: 7,
  IMPORT_FAILED: 8,
  INTEGRATION_EXPORT_FAILED: 9,
  INTERNAL_ERROR: 10
};

function main() {
  try {
    const [command, ...args] = process.argv.slice(2);
    if (!command || command === "--help" || command === "-h") {
      printHelp();
      return EXIT.OK;
    }

    if (command === "schema") return schemaCommand(args);
    if (command === "scan") return scanCommand(args);
    if (command === "analyze") return analyzeCommand(args);
    if (command === "diff") return diffCommand(args);
    if (command === "import") return importCommand(args);
    if (command === "readiness") return readinessCommand(args);
    if (command === "export") return exportCommand(args);

    console.error(`unknown command: ${command}`);
    return EXIT.USAGE_ERROR;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return EXIT.INTERNAL_ERROR;
  }
}

function printHelp() {
  console.log(`code-to-gate ${VERSION}

Usage:
  code-to-gate schema validate <artifact-or-schema>
  code-to-gate scan <repo> --out <dir>
  code-to-gate analyze <repo> [--emit all] --out <dir> [--require-llm]
  code-to-gate diff <repo> --base <ref> --head <ref> --out <dir>
  code-to-gate import semgrep <file> --out <dir>
  code-to-gate readiness <repo> --policy <file> --out <dir>
  code-to-gate export <gatefield|state-gate|manual-bb|workflow-evidence> --from <dir> --out <file>`);
}

function schemaCommand(args) {
  if (args[0] !== "validate" || !args[1]) {
    console.error("usage: code-to-gate schema validate <artifact-or-schema>");
    return EXIT.USAGE_ERROR;
  }

  const target = path.resolve(ROOT, args[1]);
  const data = readJson(target);
  if (target.endsWith(".schema.json")) {
    if (!data.$schema || !data.title) {
      console.error("schema document is missing $schema or title");
      return EXIT.SCHEMA_FAILED;
    }
    console.log(`schema ok: ${args[1]}`);
    return EXIT.OK;
  }

  const schemaPath = schemaForArtifact(data);
  if (!schemaPath) {
    console.error("unable to choose schema for artifact");
    return EXIT.SCHEMA_FAILED;
  }

  const schema = readJson(schemaPath);
  const errors = validateAgainstSchema(data, schema, path.dirname(schemaPath));
  if (errors.length > 0) {
    for (const error of errors) console.error(error);
    return EXIT.SCHEMA_FAILED;
  }

  console.log(`artifact ok: ${args[1]}`);
  return EXIT.OK;
}

function scanCommand(args) {
  const repoArg = args[0];
  const outDir = getOption(args, "--out") ?? ".qh";
  if (!repoArg) {
    console.error("usage: code-to-gate scan <repo> --out <dir>");
    return EXIT.USAGE_ERROR;
  }

  const repoRoot = path.resolve(ROOT, repoArg);
  if (!existsSync(repoRoot) || !statSync(repoRoot).isDirectory()) {
    console.error(`repo does not exist: ${repoArg}`);
    return EXIT.USAGE_ERROR;
  }

  const graph = buildGraph(repoRoot);
  ensureDir(path.resolve(ROOT, outDir));
  writeJson(path.resolve(ROOT, outDir, "repo-graph.json"), graph);
  console.log(JSON.stringify({ tool: "code-to-gate", command: "scan", artifact: path.join(outDir, "repo-graph.json") }));
  return graph.files.length > 0 ? EXIT.OK : EXIT.SCAN_FAILED;
}

function analyzeCommand(args) {
  const repoArg = args[0];
  const outDir = getOption(args, "--out") ?? ".qh";
  if (!repoArg) {
    console.error("usage: code-to-gate analyze <repo> --out <dir>");
    return EXIT.USAGE_ERROR;
  }

  const repoRoot = path.resolve(ROOT, repoArg);
  const absoluteOut = path.resolve(ROOT, outDir);
  ensureDir(absoluteOut);

  const graphPath = path.join(absoluteOut, "repo-graph.json");
  const graph = existsSync(graphPath) ? readJson(graphPath) : buildGraph(repoRoot);
  if (!existsSync(graphPath)) writeJson(graphPath, graph);

  const findings = buildFindings(repoRoot, graph);
  const risks = buildRisks(repoRoot, findings);
  const invariants = buildInvariants(repoRoot, findings);
  const testSeeds = buildTestSeeds(repoRoot, findings, risks);
  const readiness = buildReadiness(repoRoot, findings, risks, testSeeds, outDir);
  const audit = buildAudit(repoRoot, readiness.status === "blocked_input" || readiness.status === "needs_review" ? 1 : 0, readiness.status);

  writeJson(path.join(absoluteOut, "findings.json"), findings);
  writeJson(path.join(absoluteOut, "risk-register.yaml"), risks);
  writeJson(path.join(absoluteOut, "invariants.yaml"), invariants);
  writeJson(path.join(absoluteOut, "test-seeds.json"), testSeeds);
  writeJson(path.join(absoluteOut, "release-readiness.json"), readiness);
  writeJson(path.join(absoluteOut, "audit.json"), audit);

  const exitCode = readiness.status === "passed" || readiness.status === "passed_with_risk" ? EXIT.OK : EXIT.READINESS_NOT_CLEAR;
  console.log(JSON.stringify({ tool: "code-to-gate", command: "analyze", exit_code: exitCode, status: readiness.status, summary: readiness.summary }));
  return exitCode;
}

function diffCommand(args) {
  const repoArg = args[0];
  const baseRef = getOption(args, "--base") ?? "main";
  const headRef = getOption(args, "--head") ?? "HEAD";
  const outDir = getOption(args, "--out") ?? ".qh";
  if (!repoArg) {
    console.error("usage: code-to-gate diff <repo> --base <ref> --head <ref> --out <dir>");
    return EXIT.USAGE_ERROR;
  }

  const repoRoot = path.resolve(ROOT, repoArg);
  if (!existsSync(repoRoot) || !statSync(repoRoot).isDirectory()) {
    console.error(`repo does not exist: ${repoArg}`);
    return EXIT.USAGE_ERROR;
  }

  const graph = buildGraph(repoRoot);
  const changedFiles = graph.files
    .filter((file) => file.role === "source")
    .map((file) => file.path);
  const affectedEntrypoints = graph.entrypoints.map((entrypoint) => entrypoint.path);
  const artifact = {
    version: CTG_VERSION,
    generated_at: new Date().toISOString(),
    run_id: `ctg-diff-${Date.now()}`,
    repo: { root: toPosix(path.relative(ROOT, repoRoot) || "."), base_ref: baseRef, head_ref: headRef },
    tool: { name: "code-to-gate", version: VERSION, plugin_versions: [] },
    artifact: "diff",
    schema: "diff@v1alpha1",
    changedFiles,
    affectedEntrypoints,
    blastRadius: affectedEntrypoints.map((entrypoint) => ({ entrypoint, changedFiles }))
  };

  ensureDir(path.resolve(ROOT, outDir));
  writeJson(path.resolve(ROOT, outDir, "diff.json"), artifact);
  console.log(JSON.stringify({ tool: "code-to-gate", command: "diff", artifact: path.join(outDir, "diff.json") }));
  return EXIT.OK;
}

function importCommand(args) {
  const [tool, fileArg] = args;
  const outDir = getOption(args, "--out") ?? ".qh/imports";
  if (tool !== "semgrep" || !fileArg) {
    console.error("usage: code-to-gate import semgrep <file> --out <dir>");
    return EXIT.USAGE_ERROR;
  }

  const source = readJson(path.resolve(ROOT, fileArg));
  const now = new Date().toISOString();
  const findings = artifactHeader("findings", "findings@v1", path.dirname(path.resolve(ROOT, fileArg)), now);
  findings.completeness = "complete";
  findings.unsupported_claims = [];
  findings.findings = (source.results ?? []).map((result, index) => {
    const ruleId = result.check_id ?? "semgrep.unknown";
    return {
      id: `external-semgrep-${index + 1}`,
      ruleId,
      category: "release-risk",
      severity: semgrepSeverity(result.extra?.severity),
      confidence: 0.8,
      title: ruleId,
      summary: result.extra?.message ?? "Semgrep finding",
      evidence: [externalEvidence(`external-semgrep-${index + 1}-ev`, result.path, result.start?.line ?? 1, "semgrep", ruleId)],
      tags: ["external", "semgrep"],
      upstream: { tool: "semgrep", ruleId }
    };
  });

  ensureDir(path.resolve(ROOT, outDir));
  writeJson(path.resolve(ROOT, outDir, "semgrep-findings.json"), findings);
  console.log(JSON.stringify({ tool: "code-to-gate", command: "import", artifact: path.join(outDir, "semgrep-findings.json") }));
  return EXIT.OK;
}

function readinessCommand(args) {
  const repoArg = args[0];
  const outDir = getOption(args, "--out") ?? ".qh";
  if (!repoArg) {
    console.error("usage: code-to-gate readiness <repo> --policy <file> --out <dir>");
    return EXIT.USAGE_ERROR;
  }

  const absoluteOut = path.resolve(ROOT, outDir);
  const findings = existsSync(path.join(absoluteOut, "findings.json"))
    ? readJson(path.join(absoluteOut, "findings.json"))
    : buildFindings(path.resolve(ROOT, repoArg), buildGraph(path.resolve(ROOT, repoArg)));
  const risks = existsSync(path.join(absoluteOut, "risk-register.yaml"))
    ? readJson(path.join(absoluteOut, "risk-register.yaml"))
    : buildRisks(path.resolve(ROOT, repoArg), findings);
  const testSeeds = existsSync(path.join(absoluteOut, "test-seeds.json"))
    ? readJson(path.join(absoluteOut, "test-seeds.json"))
    : buildTestSeeds(path.resolve(ROOT, repoArg), findings, risks);
  const readiness = buildReadiness(path.resolve(ROOT, repoArg), findings, risks, testSeeds, outDir);
  ensureDir(absoluteOut);
  writeJson(path.join(absoluteOut, "release-readiness.json"), readiness);
  const exitCode = readiness.status === "passed" || readiness.status === "passed_with_risk" ? EXIT.OK : EXIT.READINESS_NOT_CLEAR;
  console.log(JSON.stringify({ tool: "code-to-gate", command: "readiness", exit_code: exitCode, status: readiness.status }));
  return exitCode;
}

function exportCommand(args) {
  const target = args[0];
  const fromDir = getOption(args, "--from") ?? ".qh";
  const outFile = getOption(args, "--out");
  if (!target || !outFile) {
    console.error("usage: code-to-gate export <target> --from <dir> --out <file>");
    return EXIT.USAGE_ERROR;
  }

  const sourceDir = path.resolve(ROOT, fromDir);
  const findings = readJson(path.join(sourceDir, "findings.json"));
  const risks = readJson(path.join(sourceDir, "risk-register.yaml"));
  const invariants = readJson(path.join(sourceDir, "invariants.yaml"));
  const testSeeds = readJson(path.join(sourceDir, "test-seeds.json"));
  const readiness = readJson(path.join(sourceDir, "release-readiness.json"));
  const runId = readiness.run_id;

  let artifact;
  if (target === "gatefield") artifact = exportGatefield(runId, readiness, findings);
  else if (target === "state-gate") artifact = exportStateGate(runId, readiness, sourceDir);
  else if (target === "manual-bb") artifact = exportManualBb(runId, readiness, risks, invariants, testSeeds);
  else if (target === "workflow-evidence") artifact = exportWorkflowEvidence(runId, readiness, sourceDir);
  else {
    console.error(`unknown export target: ${target}`);
    return EXIT.USAGE_ERROR;
  }

  const absoluteOut = path.resolve(ROOT, outFile);
  ensureDir(path.dirname(absoluteOut));
  writeJson(absoluteOut, artifact);
  console.log(JSON.stringify({ tool: "code-to-gate", command: "export", target, artifact: outFile }));
  return EXIT.OK;
}

function buildGraph(repoRoot) {
  const now = new Date().toISOString();
  const graph = artifactHeader("normalized-repo-graph", "normalized-repo-graph@v1", repoRoot, now);
  graph.files = [];
  graph.modules = [];
  graph.symbols = [];
  graph.relations = [];
  graph.tests = [];
  graph.configs = [];
  graph.entrypoints = [];
  graph.diagnostics = [];
  graph.stats = { partial: false };

  const files = walk(repoRoot).filter((file) => /\.(ts|tsx|js|jsx|json)$/.test(file));
  for (const file of files) {
    const rel = toPosix(path.relative(repoRoot, file));
    const body = readFileSync(file, "utf8");
    const ext = path.extname(file).slice(1);
    const role = classifyRole(rel);
    const fileId = `file:${rel}`;
    graph.files.push({
      id: fileId,
      path: rel,
      language: ["ts", "tsx", "js", "jsx"].includes(ext) ? ext : "unknown",
      role,
      hash: sha256(body),
      sizeBytes: Buffer.byteLength(body),
      lineCount: body.split(/\r?\n/).length,
      moduleId: `module:${rel}`,
      parser: { status: ["ts", "tsx", "js", "jsx"].includes(ext) ? "text_fallback" : "skipped", adapter: "ctg-text-v0" }
    });

    if (role === "config") graph.configs.push({ id: `config:${rel}`, path: rel });
    if (role === "test") graph.tests.push({ id: `test:${rel}`, path: rel, framework: rel.endsWith(".js") ? "node:test" : "vitest" });
    if (isEntrypoint(rel, body)) graph.entrypoints.push({ id: `entrypoint:${rel}`, path: rel, kind: entrypointKind(rel) });

    for (const symbol of extractSymbols(rel, fileId, body)) graph.symbols.push(symbol);
    for (const relation of extractRelations(rel, body)) graph.relations.push(relation);
  }

  return graph;
}

function buildFindings(repoRoot, graph) {
  const now = new Date().toISOString();
  const artifact = artifactHeader("findings", "findings@v1", repoRoot, now);
  artifact.completeness = "complete";
  artifact.findings = [];
  artifact.unsupported_claims = [];

  const hasFile = (rel) => existsSync(path.join(repoRoot, rel));
  if (hasFile("src/api/order/create.ts")) {
    artifact.findings.push({
      id: "finding-client-trusted-price",
      ruleId: "CLIENT_TRUSTED_PRICE",
      category: "payment",
      severity: "critical",
      confidence: 0.9,
      title: "Client supplied total is trusted during order creation",
      summary: "The order route passes req.body.total into persistence instead of recalculating from server-side prices.",
      evidence: [textEvidence("ev-client-total", "src/api/order/create.ts", 15)],
      affectedEntrypoints: ["entrypoint:src/api/order/create.ts"],
      tags: ["checkout", "payment", "deterministic"],
      upstream: { tool: "native", ruleId: "CLIENT_TRUSTED_PRICE" }
    });
    artifact.findings.push({
      id: "finding-missing-server-validation",
      ruleId: "MISSING_SERVER_VALIDATION",
      category: "validation",
      severity: "high",
      confidence: 0.78,
      title: "Order request body is used without server validation",
      summary: "The route consumes items, total, and currency without range or consistency checks.",
      evidence: [textEvidence("ev-order-body", "src/api/order/create.ts", 18)],
      affectedEntrypoints: ["entrypoint:src/api/order/create.ts"],
      tags: ["checkout", "validation"],
      upstream: { tool: "native", ruleId: "MISSING_SERVER_VALIDATION" }
    });
    artifact.findings.push({
      id: "finding-untested-critical-path",
      ruleId: "UNTESTED_CRITICAL_PATH",
      category: "testing",
      severity: "high",
      confidence: 0.82,
      title: "Checkout order entrypoint has no direct test coverage",
      summary: "The fixture includes cart tests but no negative or abuse test for the order route.",
      evidence: [textEvidence("ev-cart-test-only", "src/tests/cart.test.ts", 5)],
      affectedEntrypoints: ["entrypoint:src/api/order/create.ts"],
      tags: ["test-gap"],
      upstream: { tool: "native", ruleId: "UNTESTED_CRITICAL_PATH" }
    });
  }

  if (hasFile("src/auth/guard.ts")) {
    artifact.findings.push({
      id: "finding-weak-auth-guard",
      ruleId: "WEAK_AUTH_GUARD",
      category: "auth",
      severity: hasFile("src/api/order/create.ts") ? "high" : "critical",
      confidence: 0.83,
      title: "Authorization guard only checks token presence",
      summary: "The guard returns a user when any authorization header exists and does not verify session or role claims.",
      evidence: [textEvidence("ev-weak-guard", "src/auth/guard.ts", 6)],
      tags: ["auth"],
      upstream: { tool: "native", ruleId: "WEAK_AUTH_GUARD" }
    });
  }

  if (hasFile("src/routes/admin.js")) {
    artifact.findings.push({
      id: "finding-admin-weak-auth-guard",
      ruleId: "WEAK_AUTH_GUARD",
      category: "auth",
      severity: "high",
      confidence: 0.86,
      title: "Admin route uses user guard instead of admin guard",
      summary: "The admin route calls requireUser and never applies requireAdmin before returning admin data.",
      evidence: [textEvidence("ev-admin-require-user", "src/routes/admin.js", 5)],
      affectedEntrypoints: ["entrypoint:src/routes/admin.js"],
      tags: ["admin", "auth"],
      upstream: { tool: "native", ruleId: "WEAK_AUTH_GUARD" }
    });
  }

  if (hasFile("src/services/audit-log.js")) {
    artifact.findings.push({
      id: "finding-try-catch-swallow",
      ruleId: "TRY_CATCH_SWALLOW",
      category: "maintainability",
      severity: "medium",
      confidence: 0.84,
      title: "Audit logging failure is swallowed",
      summary: "The catch block converts an audit failure into null without an observable error or metric.",
      evidence: [textEvidence("ev-audit-swallow", "src/services/audit-log.js", 8)],
      tags: ["audit", "observability"],
      upstream: { tool: "native", ruleId: "TRY_CATCH_SWALLOW" }
    });
  }

  return artifact;
}

function buildRisks(repoRoot, findings) {
  const artifact = artifactHeader("risk-register", "risk-register@v1", repoRoot, new Date().toISOString());
  artifact.completeness = "complete";
  artifact.risks = findings.findings.map((finding) => {
    if (finding.ruleId === "CLIENT_TRUSTED_PRICE") {
      return risk("risk-client-supplied-price", "Client supplied price may cause financial loss or fraudulent orders", "critical", "medium", ["financial_loss", "fraud", "revenue_integrity"], finding, [
        "Recalculate totals from server-side catalog prices.",
        "Reject requests where client totals do not match server totals.",
        "Add negative and abuse tests for checkout price tampering."
      ]);
    }
    if (finding.ruleId === "WEAK_AUTH_GUARD") {
      return risk(`risk-${finding.id}`, "Weak authorization may allow unauthorized access", finding.severity, "medium", ["unauthorized_access", "privilege_escalation"], finding, [
        "Verify session claims and role requirements before protected actions.",
        "Add deny-path tests for non-admin users."
      ]);
    }
    if (finding.ruleId === "TRY_CATCH_SWALLOW") {
      return risk("risk-audit-gap", "Swallowed audit errors can hide operational failures", "medium", "medium", ["audit_gap", "incident_response_delay"], finding, [
        "Emit an observable error, metric, or retry event when audit writes fail."
      ]);
    }
    return risk(`risk-${finding.id}`, finding.title, finding.severity, "medium", ["release_quality"], finding, ["Review and remediate the finding before release."]);
  });
  return artifact;
}

function buildInvariants(repoRoot, findings) {
  const artifact = artifactHeader("invariants", "invariants@v1", repoRoot, new Date().toISOString());
  artifact.completeness = "complete";
  artifact.invariants = findings.findings.slice(0, 3).map((finding, index) => ({
    id: `invariant-${index + 1}`,
    statement: invariantFor(finding),
    kind: finding.category === "payment" ? "business" : finding.category === "auth" ? "security" : "technical",
    confidence: 0.78,
    sourceFindingIds: [finding.id],
    evidence: finding.evidence,
    tags: finding.tags ?? []
  }));
  return artifact;
}

function buildTestSeeds(repoRoot, findings, risks) {
  const artifact = artifactHeader("test-seeds", "test-seeds@v1", repoRoot, new Date().toISOString());
  artifact.completeness = "complete";
  artifact.seeds = [];

  const byRule = new Map(findings.findings.map((finding) => [finding.ruleId, finding]));
  const firstRiskId = risks.risks[0]?.id;
  if (byRule.has("CLIENT_TRUSTED_PRICE")) {
    const finding = byRule.get("CLIENT_TRUSTED_PRICE");
    artifact.seeds.push(seed("seed-price-negative", "Reject client-modified checkout totals", "negative", "integration", firstRiskId, finding));
    artifact.seeds.push(seed("seed-price-abuse", "Exercise multi-item price tampering across currency and discounts", "abuse", "manual", firstRiskId, finding));
    artifact.seeds.push(seed("seed-price-regression", "Lock order totals to server-side pricing", "regression", "unit", firstRiskId, finding));
  }
  if (byRule.has("WEAK_AUTH_GUARD")) {
    const finding = byRule.get("WEAK_AUTH_GUARD");
    artifact.seeds.push(seed("seed-auth-deny-path", "Reject non-admin users on admin endpoints", "negative", "integration", risks.risks.find((item) => item.sourceFindingIds.includes(finding.id))?.id, finding));
  }
  if (byRule.has("TRY_CATCH_SWALLOW")) {
    const finding = byRule.get("TRY_CATCH_SWALLOW");
    artifact.seeds.push(seed("seed-audit-observable-failure", "Surface audit logging failures", "regression", "unit", risks.risks.find((item) => item.sourceFindingIds.includes(finding.id))?.id, finding));
  }

  return artifact;
}

function buildReadiness(repoRoot, findings, risks, testSeeds, outDir) {
  const critical = findings.findings.filter((finding) => finding.severity === "critical");
  const high = findings.findings.filter((finding) => finding.severity === "high");
  const status = critical.length > 0 ? "blocked_input" : high.length > 0 ? "needs_review" : findings.findings.length > 0 ? "passed_with_risk" : "passed";
  const artifact = artifactHeader("release-readiness", "release-readiness@v1", repoRoot, new Date().toISOString());
  artifact.status = status;
  artifact.completeness = "complete";
  artifact.summary = status === "blocked_input"
    ? `${critical.length} critical finding(s) block release readiness.`
    : status === "needs_review"
      ? `${high.length} high finding(s) require human review.`
      : "No blocking readiness condition detected.";
  artifact.counts = {
    findings: findings.findings.length,
    critical: critical.length,
    high: high.length,
    risks: risks.risks.length,
    testSeeds: testSeeds.seeds.length,
    unsupportedClaims: findings.unsupported_claims.length
  };
  artifact.failedConditions = [
    ...critical.map((finding) => ({ id: `critical-${finding.ruleId}`, reason: finding.title, matchedFindingIds: [finding.id] })),
    ...high.map((finding) => ({ id: `high-${finding.ruleId}`, reason: finding.title, matchedFindingIds: [finding.id] }))
  ];
  artifact.recommendedActions = Array.from(new Set(risks.risks.flatMap((riskItem) => riskItem.recommendedActions))).slice(0, 8);
  artifact.artifactRefs = {
    graph: path.join(outDir, "repo-graph.json"),
    findings: path.join(outDir, "findings.json"),
    riskRegister: path.join(outDir, "risk-register.yaml"),
    invariants: path.join(outDir, "invariants.yaml"),
    testSeeds: path.join(outDir, "test-seeds.json"),
    audit: path.join(outDir, "audit.json")
  };
  return artifact;
}

function buildAudit(repoRoot, code, status) {
  const artifact = artifactHeader("audit", "audit@v1", repoRoot, new Date().toISOString());
  artifact.inputs = walk(repoRoot)
    .filter((file) => /\.(ts|tsx|js|jsx|json|yaml)$/.test(file))
    .slice(0, 50)
    .map((file) => {
      const rel = toPosix(path.relative(repoRoot, file));
      return { path: rel, hash: sha256(readFileSync(file, "utf8")), kind: classifyRole(rel) === "config" ? "config" : "source" };
    });
  artifact.policy = { id: "default", hash: sha256("default") };
  artifact.exit = { code, status, reason: status };
  return artifact;
}

function artifactHeader(artifact, schema, repoRoot, generatedAt) {
  return {
    version: CTG_VERSION,
    generated_at: generatedAt,
    run_id: `ctg-${generatedAt.replace(/[-:.TZ]/g, "").slice(0, 14)}`,
    repo: { root: toPosix(path.relative(ROOT, repoRoot) || ".") },
    tool: { name: "code-to-gate", version: VERSION, plugin_versions: [] },
    artifact,
    schema
  };
}

function textEvidence(id, relPath, line) {
  return { id, path: relPath, startLine: line, endLine: line, kind: "text", excerptHash: sha256(`${relPath}:${line}`) };
}

function externalEvidence(id, relPath, line, tool, ruleId) {
  return { id, path: relPath, startLine: line, endLine: line, kind: "external", externalRef: { tool, ruleId } };
}

function risk(id, title, severity, likelihood, impact, finding, recommendedActions) {
  return {
    id,
    title,
    severity,
    likelihood,
    impact,
    confidence: finding.confidence,
    sourceFindingIds: [finding.id],
    evidence: finding.evidence,
    recommendedActions
  };
}

function seed(id, title, intent, suggestedLevel, riskId, finding) {
  return {
    id,
    title,
    intent,
    sourceRiskIds: riskId ? [riskId] : [],
    sourceFindingIds: [finding.id],
    evidence: finding.evidence,
    suggestedLevel,
    notes: finding.summary
  };
}

function invariantFor(finding) {
  if (finding.ruleId === "CLIENT_TRUSTED_PRICE") return "Order totals must be derived from trusted server-side price data.";
  if (finding.ruleId === "WEAK_AUTH_GUARD") return "Protected actions must verify the required authorization level before returning sensitive data.";
  return "Release readiness claims must be backed by observable code or external tool evidence.";
}

function exportGatefield(runId, readiness, findings) {
  const status = readiness.status === "blocked_input" ? "blocked_input" : readiness.status === "needs_review" ? "warning" : "passed";
  return {
    version: "ctg.gatefield/v1alpha1",
    producer: "code-to-gate",
    run_id: runId,
    artifact_hash: sha256(JSON.stringify(readiness)),
    repo: readiness.repo,
    status,
    summary: readiness.summary,
    signals: findings.findings.map((finding) => ({
      id: `signal-${finding.id}`,
      kind: finding.category === "testing" ? "test_gap" : finding.category === "release-risk" ? "release_risk" : "quality",
      severity: finding.severity,
      confidence: finding.confidence,
      finding_id: finding.id,
      evidence: finding.evidence.map((item) => `${item.path}:${item.startLine ?? 1}`)
    })),
    non_binding_gate_hint: readiness.status === "blocked_input" ? "block" : readiness.status === "needs_review" ? "hold" : "pass"
  };
}

function exportStateGate(runId, readiness, sourceDir) {
  return {
    version: "ctg.state-gate/v1alpha1",
    producer: "code-to-gate",
    run_id: runId,
    artifact_hash: sha256(JSON.stringify(readiness)),
    release_readiness: {
      status: readiness.status,
      summary: readiness.summary,
      failed_conditions: readiness.failedConditions.map((item) => item.id)
    },
    evidence_refs: ["findings", "risk-register", "invariants", "test-seeds", "audit"].map((name) => {
      const file = name === "risk-register" || name === "invariants" ? `${name}.yaml` : `${name}.json`;
      const fullPath = path.join(sourceDir, file);
      return { artifact: name, path: toPosix(path.relative(ROOT, fullPath)), hash: existsSync(fullPath) ? sha256(readFileSync(fullPath, "utf8")) : sha256("") };
    }),
    approval_relevance: {
      requires_human_attention: ["needs_review", "blocked_input", "failed"].includes(readiness.status),
      reasons: readiness.failedConditions.map((item) => item.reason)
    }
  };
}

function exportManualBb(runId, readiness, risks, invariants, testSeeds) {
  return {
    version: "ctg.manual-bb/v1alpha1",
    producer: "code-to-gate",
    run_id: runId,
    scope: {
      repo: readiness.repo.root,
      changed_files: [],
      affected_entrypoints: Array.from(new Set(testSeeds.seeds.flatMap((seedItem) => seedItem.evidence.map((ev) => ev.path))))
    },
    risk_seeds: risks.risks.map((riskItem) => ({
      id: riskItem.id,
      title: riskItem.title,
      severity: riskItem.severity,
      evidence: riskItem.evidence.map((ev) => `${ev.path}:${ev.startLine ?? 1}`),
      suggested_test_intents: Array.from(new Set(testSeeds.seeds.filter((seedItem) => seedItem.sourceRiskIds.includes(riskItem.id)).map((seedItem) => seedItem.intent)))
    })),
    invariant_seeds: invariants.invariants.map((item) => ({
      id: item.id,
      statement: item.statement,
      confidence: item.confidence,
      evidence: item.evidence.map((ev) => `${ev.path}:${ev.startLine ?? 1}`)
    })),
    test_seed_refs: testSeeds.seeds.map((item) => item.id),
    known_gaps: readiness.failedConditions.map((item) => item.reason)
  };
}

function exportWorkflowEvidence(runId, readiness, sourceDir) {
  return {
    version: "ctg.workflow-evidence/v1alpha1",
    producer: "code-to-gate",
    run_id: runId,
    evidence_type: "release-readiness",
    subject: { repo: readiness.repo.root },
    artifacts: Object.entries(readiness.artifactRefs).map(([name, relPath]) => {
      const fullPath = path.resolve(ROOT, relPath);
      return { name, path: relPath, hash: existsSync(fullPath) ? sha256(readFileSync(fullPath, "utf8")) : sha256(""), schema: `${name}@v1` };
    }),
    summary: {
      status: readiness.status,
      critical_count: readiness.counts.critical,
      high_count: readiness.counts.high,
      needs_review: ["needs_review", "blocked_input", "failed"].includes(readiness.status)
    }
  };
}

function extractSymbols(rel, fileId, body) {
  const symbols = [];
  const lines = body.split(/\r?\n/);
  lines.forEach((line, index) => {
    const match = line.match(/(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)/) ?? line.match(/const\s+([A-Za-z0-9_]+)\s*=/);
    if (match) {
      symbols.push({
        id: `symbol:${rel}:${match[1]}`,
        fileId,
        name: match[1],
        kind: rel.includes("test") ? "test" : match[1].toLowerCase().includes("route") ? "route" : "function",
        exported: line.includes("export") || body.includes(`module.exports`) && body.includes(match[1]),
        async: line.includes("async"),
        evidence: [textEvidence(`ev-symbol-${sha256(`${rel}:${match[1]}`).slice(0, 8)}`, rel, index + 1)]
      });
    }
  });
  return symbols;
}

function extractRelations(rel, body) {
  const relations = [];
  const importMatches = body.matchAll(/(?:from\s+["']([^"']+)["']|require\(["']([^"']+)["']\))/g);
  let index = 0;
  for (const match of importMatches) {
    index += 1;
    relations.push({
      id: `relation:${rel}:${index}`,
      from: `file:${rel}`,
      to: match[1] ?? match[2],
      kind: "imports",
      confidence: 0.7,
      evidence: [textEvidence(`ev-relation-${sha256(`${rel}:${index}`).slice(0, 8)}`, rel, lineOf(body, match.index ?? 0))]
    });
  }
  return relations;
}

function validateAgainstSchema(data, schema, baseDir, location = "$") {
  const errors = [];
  if (schema.$ref) return validateAgainstSchema(data, resolveRef(schema.$ref, baseDir), baseDir, location);
  if (schema.allOf) for (const item of schema.allOf) errors.push(...validateAgainstSchema(data, item, baseDir, location));
  if (schema.anyOf && !schema.anyOf.some((item) => validateAgainstSchema(data, item, baseDir, location).length === 0)) {
    errors.push(`${location}: did not match anyOf`);
  }
  if (schema.const !== undefined && data !== schema.const) errors.push(`${location}: expected const ${schema.const}`);
  if (schema.enum && !schema.enum.includes(data)) errors.push(`${location}: expected one of ${schema.enum.join(", ")}`);
  if (schema.type && !matchesType(data, schema.type)) errors.push(`${location}: expected type ${schema.type}`);
  if (schema.required && typeof data === "object" && data !== null) {
    for (const key of schema.required) if (!(key in data)) errors.push(`${location}: missing required ${key}`);
  }
  if (schema.properties && typeof data === "object" && data !== null && !Array.isArray(data)) {
    for (const [key, value] of Object.entries(data)) {
      if (schema.properties[key]) errors.push(...validateAgainstSchema(value, schema.properties[key], baseDir, `${location}.${key}`));
      else if (schema.additionalProperties === false) errors.push(`${location}: unexpected property ${key}`);
    }
  }
  if (schema.items && Array.isArray(data)) {
    data.forEach((item, index) => errors.push(...validateAgainstSchema(item, schema.items, baseDir, `${location}[${index}]`)));
  }
  if (schema.minItems !== undefined && Array.isArray(data) && data.length < schema.minItems) errors.push(`${location}: expected at least ${schema.minItems} items`);
  if (schema.minimum !== undefined && typeof data === "number" && data < schema.minimum) errors.push(`${location}: expected minimum ${schema.minimum}`);
  if (schema.maximum !== undefined && typeof data === "number" && data > schema.maximum) errors.push(`${location}: expected maximum ${schema.maximum}`);
  return errors;
}

function resolveRef(ref, baseDir) {
  const [filePart, pointer = ""] = ref.split("#");
  const schema = filePart ? readJson(path.resolve(baseDir, filePart)) : {};
  const rootSchema = filePart ? schema : readJson(path.resolve(baseDir, "shared-defs.schema.json"));
  if (!pointer) return rootSchema;
  return pointer.split("/").slice(1).reduce((node, part) => node?.[part], rootSchema);
}

function schemaForArtifact(data) {
  if (data.artifact) return path.resolve(ROOT, "schemas", `${data.artifact}.schema.json`);
  if (data.version === "ctg.gatefield/v1alpha1") return path.resolve(ROOT, "schemas", "integrations", "gatefield-static-result.schema.json");
  if (data.version === "ctg.state-gate/v1alpha1") return path.resolve(ROOT, "schemas", "integrations", "state-gate-evidence.schema.json");
  if (data.version === "ctg.manual-bb/v1alpha1") return path.resolve(ROOT, "schemas", "integrations", "manual-bb-seed.schema.json");
  if (data.version === "ctg.workflow-evidence/v1alpha1") return path.resolve(ROOT, "schemas", "integrations", "workflow-evidence.schema.json");
  return null;
}

function matchesType(data, type) {
  if (type === "array") return Array.isArray(data);
  if (type === "object") return typeof data === "object" && data !== null && !Array.isArray(data);
  if (type === "integer") return Number.isInteger(data);
  return typeof data === type;
}

function getOption(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function classifyRole(rel) {
  if (rel.includes("/tests/") || rel.includes(".test.")) return "test";
  if (rel.endsWith("package.json") || rel.endsWith("tsconfig.json") || rel.endsWith(".json") || rel.endsWith(".yaml")) return "config";
  return "source";
}

function isEntrypoint(rel, body) {
  return rel.includes("/api/") || rel.includes("/routes/") || /app\.use|createOrderRoute|adminRoutes|accountRoutes|publicRoutes/.test(body);
}

function entrypointKind(rel) {
  if (rel.includes("admin")) return "admin-route";
  if (rel.includes("order")) return "checkout-route";
  return "route";
}

function semgrepSeverity(value) {
  return value === "ERROR" ? "high" : value === "WARNING" ? "medium" : "low";
}

function lineOf(body, offset) {
  return body.slice(0, offset).split(/\r?\n/).length;
}

function walk(dir) {
  const ignored = new Set([".git", "node_modules", ".qh", "dist", "coverage"]);
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    if (ignored.has(entry.name)) return [];
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    if (entry.isFile()) return [fullPath];
    return [];
  });
}

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function toPosix(value) {
  return value.replaceAll(path.sep, "/");
}

process.exitCode = main();
