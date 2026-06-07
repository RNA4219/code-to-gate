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
 * 5. CLI execution (--version, analyze, diff) - ALL MUST PASS
 * 6. Verify dist/application and dist/utils exist
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

let tgzPath = null;

function cleanup() {
  // Always cleanup tarball and temp directory
  if (tgzPath && existsSync(tgzPath)) {
    rmSync(tgzPath, { force: true });
  }
  rmSync(TEMP_DIR, { recursive: true, force: true });
}

console.log("=== Package Smoke Test (Strict) ===\n");

try {
  // Step 1: Clean dist directory
  console.log("Step 1: Clean dist directory...");
  rmSync(DIST_DIR, { recursive: true, force: true });
  console.log("  ✓ dist removed\n");

  // Step 2: Fresh build
  console.log("Step 2: Fresh build...");
  execSync("npm run build", { cwd: ROOT, stdio: "inherit" });
  console.log("  ✓ Build complete\n");

  // Step 3: npm pack
  console.log("Step 3: npm pack...");
  rmSync(TEMP_DIR, { recursive: true, force: true });
  mkdirSync(TEMP_DIR, { recursive: true });

  const packOutput = execSync("npm pack", { cwd: ROOT, encoding: "utf8" });
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

  execSync(`npm install "${tgzPath}"`, { cwd: TEMP_DIR, stdio: "inherit" });

  const installedDir = join(TEMP_DIR, "node_modules", "@quality-harness", "code-to-gate");
  if (!existsSync(installedDir)) {
    throw new Error("Failed to install package");
  }
  console.log(`  ✓ Installed to ${installedDir}\n`);

  // Step 5: Verify dist/application and dist/utils exist
  console.log("Step 5: Verify required directories...");
  const applicationDir = join(installedDir, "dist", "application");
  const utilsDir = join(installedDir, "dist", "utils");

  if (!existsSync(applicationDir)) {
    throw new Error("dist/application not found in package");
  }
  console.log("  ✓ dist/application exists");

  if (!existsSync(utilsDir)) {
    throw new Error("dist/utils not found in package");
  }
  console.log("  ✓ dist/utils exists\n");

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

  // Step 8: CLI analyze (MUST PASS - no exceptions allowed)
  console.log("  Testing analyze (strict)...");
  const analyzeOutDir = join(TEMP_DIR, "analyze-out");
  rmSync(analyzeOutDir, { recursive: true, force: true });
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

  // Step 9: CLI diff (MUST PASS - no exceptions allowed)
  console.log("  Testing diff (strict)...");
  const diffOutDir = join(TEMP_DIR, "diff-out");
  rmSync(diffOutDir, { recursive: true, force: true });
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