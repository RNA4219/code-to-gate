#!/usr/bin/env node
/**
 * Package Smoke Test (Strict Release Gate)
 *
 * Validates that the npm package is correctly bundled and CLI works after install.
 *
 * Steps:
 * 1. Clean dist directory
 * 2. Fresh build
 * 3. npm pack
 * 4. npm install packed tgz in temp directory
 * 5. CLI execution (--version, --help, analyze, viewer, diff) - ALL MUST PASS
 * 6. Verify required runtime directories and rule-sdk export
 * 7. Verify deleted files NOT included (domain-context.*)
 * 8. Cleanup tarball and temp directory (always)
 */

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const TEMP_DIR = join(ROOT, ".test-temp", "package-smoke");
const FIXTURES_DIR = join(ROOT, "fixtures", "demo-shop-ts");
const DIFF_FIXTURE_DIR = join(TEMP_DIR, "diff-fixture");
const DIST_DIR = join(ROOT, "dist");
const NPM_CACHE_DIR = join(ROOT, ".qh", "npm-cache");
const NPM_ENV = { ...process.env, npm_config_cache: NPM_CACHE_DIR };
const NPM_EXECUTABLE = process.env.npm_execpath ? process.execPath : process.platform === "win32" ? "npm.cmd" : "npm";
const NPM_PREFIX_ARGS = process.env.npm_execpath ? [process.env.npm_execpath] : [];
function runNpm(args, options) { return execFileSync(NPM_EXECUTABLE, [...NPM_PREFIX_ARGS, ...args], options); }
const REMOVE_DIRECTORY_OPTIONS = {
  recursive: true,
  force: true,
  maxRetries: 3,
  retryDelay: 100,
};

let tgzPath = null;

function removeDirectory(target) {
  rmSync(target, REMOVE_DIRECTORY_OPTIONS);
}

function runGit(args, cwd) {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

function prepareDiffFixture() {
  removeDirectory(DIFF_FIXTURE_DIR);
  cpSync(FIXTURES_DIR, DIFF_FIXTURE_DIR, { recursive: true });
  removeDirectory(join(DIFF_FIXTURE_DIR, ".git"));

  writeFileSync(join(DIFF_FIXTURE_DIR, "package-smoke-baseline.txt"), "baseline\n");
  runGit(["init", "--quiet"], DIFF_FIXTURE_DIR);
  runGit(["config", "user.name", "code-to-gate package smoke"], DIFF_FIXTURE_DIR);
  runGit(["config", "user.email", "package-smoke@code-to-gate.invalid"], DIFF_FIXTURE_DIR);
  runGit(["add", "-f", "."], DIFF_FIXTURE_DIR);
  runGit(["-c", "commit.gpgSign=false", "commit", "--quiet", "-m", "Create baseline fixture"], DIFF_FIXTURE_DIR);

  writeFileSync(join(DIFF_FIXTURE_DIR, "package-smoke-change.ts"), "export const packageSmokeChange = true;\n");
  runGit(["add", "-f", "package-smoke-change.ts"], DIFF_FIXTURE_DIR);
  runGit(["-c", "commit.gpgSign=false", "commit", "--quiet", "-m", "Add diff fixture change"], DIFF_FIXTURE_DIR);
}

function cleanup() {
  // Always cleanup tarball and temp directory
  if (tgzPath && existsSync(tgzPath)) {
    rmSync(tgzPath, { force: true });
  }
  removeDirectory(TEMP_DIR);
}

console.log("=== Package Smoke Test (Strict) ===\n");

try {
  // Step 1: Clean dist directory
  console.log("Step 1: Clean dist directory...");
  removeDirectory(DIST_DIR);
  console.log("  ✓ dist removed\n");

  // Step 2: Fresh build
  console.log("Step 2: Fresh build...");
  mkdirSync(NPM_CACHE_DIR, { recursive: true });
  runNpm(["run", "build"], { cwd: ROOT, stdio: "inherit", env: NPM_ENV });
  console.log("  ✓ Build complete\n");

  // Step 3: npm pack
  console.log("Step 3: npm pack...");
  removeDirectory(TEMP_DIR);
  mkdirSync(TEMP_DIR, { recursive: true });

  const packOutput = runNpm(["pack"], { cwd: ROOT, encoding: "utf8", env: NPM_ENV });
  const tgzFile = packOutput.trim();
  tgzPath = join(ROOT, tgzFile);

  if (!existsSync(tgzPath)) {
    throw new Error(`Failed to create package: ${tgzFile}`);
  }
  console.log(`  ✓ Package created: ${tgzFile}\n`);

  // Step 4: npm install in temp directory
  console.log("Step 4: npm install packed tgz...");

  const tempPackageJson = {
    name: "package-smoke-test",
    version: "1.0.0",
    private: true,
  };
  writeFileSync(join(TEMP_DIR, "package.json"), JSON.stringify(tempPackageJson, null, 2));

  runNpm(["install", tgzPath], { cwd: TEMP_DIR, stdio: "inherit", env: NPM_ENV });

  const installedDir = join(TEMP_DIR, "node_modules", "@quality-harness", "code-to-gate");
  if (!existsSync(installedDir)) {
    throw new Error("Failed to install package");
  }
  console.log(`  ✓ Installed to ${installedDir}\n`);

  // Step 5: Verify dist/application and dist/utils exist
  console.log("Step 5: Verify required directories...");
  const applicationDir = join(installedDir, "dist", "application");
  const utilsDir = join(installedDir, "dist", "utils");
  const redactionDir = join(installedDir, "dist", "redaction");

  if (!existsSync(applicationDir)) {
    throw new Error("dist/application not found in package");
  }
  console.log("  ✓ dist/application exists");

  if (!existsSync(utilsDir)) {
    throw new Error("dist/utils not found in package");
  }
  console.log("  ✓ dist/utils exists");

  if (!existsSync(redactionDir)) {
    throw new Error("dist/redaction not found in package");
  }
  console.log("  ✓ dist/redaction exists\n");

  // Step 6: Verify deleted files NOT included
  console.log("Step 6: Verify deleted files NOT included...");
  const domainContextJs = join(installedDir, "dist", "reporters", "domain-context.js");
  const domainContextDts = join(installedDir, "dist", "reporters", "domain-context.d.ts");

  if (existsSync(domainContextJs)) {
    throw new Error("dist/reporters/domain-context.js should NOT be included (deleted file)");
  }
  console.log("  ✓ domain-context.js NOT included");

  if (existsSync(domainContextDts)) {
    throw new Error("dist/reporters/domain-context.d.ts should NOT be included (deleted file)");
  }
  console.log("  ✓ domain-context.d.ts NOT included\n");

  // Step 7: CLI execution --version (MUST PASS)
  console.log("Step 7: CLI execution...");
  console.log("  Testing --version...");
  const cliPath = join(installedDir, "dist", "cli.js");
  const versionOutput = execFileSync(process.execPath, [cliPath, "--version"], {
    cwd: TEMP_DIR,
    encoding: "utf8",
  });  const pkgJson = JSON.parse(readFileSync(join(installedDir, "package.json"), "utf8"));
  if (!versionOutput.includes(pkgJson.version)) {
    throw new Error(`--version output does not match package version: ${versionOutput}`);
  }
  console.log(`    ✓ --version: ${pkgJson.version}`);

  console.log("  Testing --help...");
  const helpOutput = execFileSync(process.execPath, [cliPath, "--help"], {
    cwd: TEMP_DIR,
    encoding: "utf8",
  });  if (!helpOutput.includes("code-to-gate") || !helpOutput.includes("plugin-sandbox")) {
    throw new Error("--help output is incomplete");
  }
  console.log("    ✓ --help: command list loaded");

  console.log("  Testing rule-sdk import...");
  execFileSync(process.execPath, ["--input-type=module", "-e", "const sdk = await import('@quality-harness/code-to-gate/rule-sdk'); if (typeof sdk.runRuleFixture !== 'function') process.exit(1)"],
    { cwd: TEMP_DIR, stdio: "inherit" },
  );  console.log("    ✓ rule-sdk: import succeeded");

  console.log("  Testing agent capabilities...");
  const capabilities = JSON.parse(execFileSync(process.execPath, [cliPath, "agent", "capabilities", "--profile", "compact"], { cwd: TEMP_DIR, encoding: "utf8" }));  if (capabilities.data?.schema !== "ctg-agent-capabilities@v1" || !Array.isArray(capabilities.data.operations) || !Array.isArray(capabilities.data.schemas) || capabilities.data.schemas.some((schema) => typeof schema.digest_sha256 !== "string")) {
    throw new Error("agent capabilities contract is invalid");
  }
  console.log("    ✓ agent capabilities: structured response loaded");

  console.log("  Testing agent idempotent run...");
  const agentRequestPath = join(TEMP_DIR, "agent-request.json");
  const agentOutputDir = join(TEMP_DIR, "agent-out");
  writeFileSync(agentRequestPath, JSON.stringify({ schema: "ctg-agent-request@v1", request_id: "package-smoke-agent", action: "doctor", input: { out: agentOutputDir } }));
  const agentRun1 = JSON.parse(execFileSync(process.execPath, [cliPath, "agent", "run", "--request", agentRequestPath], { cwd: TEMP_DIR, encoding: "utf8" }));
  const agentRun2 = JSON.parse(execFileSync(process.execPath, [cliPath, "agent", "run", "--request", agentRequestPath], { cwd: TEMP_DIR, encoding: "utf8" }));  if (agentRun1.status !== "succeeded" || agentRun1.exit?.code !== 0) throw new Error("agent run did not succeed");
  if (agentRun2.status !== "reused" || agentRun2.run?.run_id !== agentRun1.run?.run_id) throw new Error("agent run was not idempotently reused");
  console.log("    ✓ agent run: manifest and reuse contract passed");
  // Step 8: CLI analyze (MUST PASS - no exceptions allowed)
  console.log("  Testing analyze (strict)...");
  const analyzeOutDir = join(TEMP_DIR, "analyze-out");
  removeDirectory(analyzeOutDir);
  mkdirSync(analyzeOutDir, { recursive: true });

  // Execute analyze and check exit code
  const analyzeResult = execFileSync(process.execPath, [cliPath, "analyze", FIXTURES_DIR, "--out", analyzeOutDir], {
    cwd: TEMP_DIR,
    encoding: "utf8",
    timeout: 60000,
  });  // Verify findings.json exists
  const findingsPath = join(analyzeOutDir, "findings.json");
  if (!existsSync(findingsPath)) {
    throw new Error("findings.json not created by analyze command");
  }
  console.log("    ✓ analyze: findings.json created");

  console.log("  Testing viewer (strict)...");
  const viewerPath = join(analyzeOutDir, "viewer-report.html");
  execFileSync(process.execPath, [cliPath, "viewer", "--from", analyzeOutDir, "--out", viewerPath], {
    cwd: TEMP_DIR,
    encoding: "utf8",
    timeout: 60000,
  });  if (!existsSync(viewerPath)) {
    throw new Error("viewer-report.html not created by viewer command");
  }
  console.log("    ✓ viewer: viewer-report.html created");

  // Step 9: CLI diff (MUST PASS - no exceptions allowed)
  console.log("  Testing diff (strict)...");
  const diffOutDir = join(TEMP_DIR, "diff-out");
  removeDirectory(diffOutDir);
  mkdirSync(diffOutDir, { recursive: true });

  // Build an isolated two-commit repository so the test does not depend on checkout depth.
  prepareDiffFixture();
  const diffResult = execFileSync(process.execPath, [cliPath, "diff", DIFF_FIXTURE_DIR, "--base", "HEAD~1", "--head", "HEAD", "--out", diffOutDir], {
    cwd: DIFF_FIXTURE_DIR,
    encoding: "utf8",
    timeout: 60000,
  });  // Verify diff-analysis.json exists
  const diffAnalysisPath = join(diffOutDir, "diff-analysis.json");

  if (!existsSync(diffAnalysisPath)) {
    throw new Error("diff-analysis.json not created by diff command");
  }
  console.log("    ✓ diff: diff-analysis.json created\n");

  // Cleanup (normal exit)
  cleanup();
  console.log("Cleanup...\n  ✓ Temp files removed\n");

  console.log("=== Package Smoke Test PASSED ===\n");
} catch (error) {
  // Cleanup on error
  cleanup();
  console.error("\n=== Package Smoke Test FAILED ===");
  console.error(`Error: ${error.message}`);
  process.exit(1);
}
