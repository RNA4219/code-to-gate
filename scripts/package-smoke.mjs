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

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const TEMP_DIR = join(ROOT, ".test-temp", "package-smoke");
const FIXTURES_DIR = join(ROOT, "fixtures", "demo-shop-ts");
const DIST_DIR = join(ROOT, "dist");
const NPM_CACHE_DIR = join(ROOT, ".qh", "npm-cache");
const NPM_ENV = { ...process.env, npm_config_cache: NPM_CACHE_DIR };
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
  execSync("npm run build", { cwd: ROOT, stdio: "inherit", env: NPM_ENV });
  console.log("  ✓ Build complete\n");

  // Step 3: npm pack
  console.log("Step 3: npm pack...");
  removeDirectory(TEMP_DIR);
  mkdirSync(TEMP_DIR, { recursive: true });

  const packOutput = execSync("npm pack", { cwd: ROOT, encoding: "utf8", env: NPM_ENV });
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

  execSync(`npm install "${tgzPath}"`, { cwd: TEMP_DIR, stdio: "inherit", env: NPM_ENV });

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
  const versionOutput = execSync(`node "${cliPath}" --version`, {
    cwd: TEMP_DIR,
    encoding: "utf8",
  });

  const pkgJson = JSON.parse(readFileSync(join(installedDir, "package.json"), "utf8"));
  if (!versionOutput.includes(pkgJson.version)) {
    throw new Error(`--version output does not match package version: ${versionOutput}`);
  }
  console.log(`    ✓ --version: ${pkgJson.version}`);

  console.log("  Testing --help...");
  const helpOutput = execSync(`node "${cliPath}" --help`, {
    cwd: TEMP_DIR,
    encoding: "utf8",
  });
  if (!helpOutput.includes("code-to-gate") || !helpOutput.includes("plugin-sandbox")) {
    throw new Error("--help output is incomplete");
  }
  console.log("    ✓ --help: command list loaded");

  console.log("  Testing rule-sdk import...");
  execSync(
    `node --input-type=module -e "const sdk = await import('@quality-harness/code-to-gate/rule-sdk'); if (typeof sdk.runRuleFixture !== 'function') process.exit(1)"`,
    { cwd: TEMP_DIR, stdio: "inherit" }
  );
  console.log("    ✓ rule-sdk: import succeeded");

  // Step 8: CLI analyze (MUST PASS - no exceptions allowed)
  console.log("  Testing analyze (strict)...");
  const analyzeOutDir = join(TEMP_DIR, "analyze-out");
  removeDirectory(analyzeOutDir);
  mkdirSync(analyzeOutDir, { recursive: true });

  // Execute analyze and check exit code
  const analyzeResult = execSync(`node "${cliPath}" analyze "${FIXTURES_DIR}" --out "${analyzeOutDir}"`, {
    cwd: TEMP_DIR,
    encoding: "utf8",
    timeout: 60000,
  });

  // Verify findings.json exists
  const findingsPath = join(analyzeOutDir, "findings.json");
  if (!existsSync(findingsPath)) {
    throw new Error("findings.json not created by analyze command");
  }
  console.log("    ✓ analyze: findings.json created");

  console.log("  Testing viewer (strict)...");
  const viewerPath = join(analyzeOutDir, "viewer-report.html");
  execSync(`node "${cliPath}" viewer --from "${analyzeOutDir}" --out "${viewerPath}"`, {
    cwd: TEMP_DIR,
    encoding: "utf8",
    timeout: 60000,
  });
  if (!existsSync(viewerPath)) {
    throw new Error("viewer-report.html not created by viewer command");
  }
  console.log("    ✓ viewer: viewer-report.html created");

  // Step 9: CLI diff (MUST PASS - no exceptions allowed)
  console.log("  Testing diff (strict)...");
  const diffOutDir = join(TEMP_DIR, "diff-out");
  removeDirectory(diffOutDir);
  mkdirSync(diffOutDir, { recursive: true });

  // Use git refs from demo-shop-ts (HEAD vs HEAD~1)
  const diffResult = execSync(
    `node "${cliPath}" diff "${FIXTURES_DIR}" --base HEAD~1 --head HEAD --out "${diffOutDir}"`,
    {
      cwd: FIXTURES_DIR, // Run inside fixture directory for git context
      encoding: "utf8",
      timeout: 60000,
    }
  );

  // Verify diff-analysis.json exists
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
