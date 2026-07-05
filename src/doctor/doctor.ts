import { execFileSync } from "node:child_process";
import { constants, existsSync, mkdirSync, writeFileSync, accessSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { DoctorArtifact, DoctorCheck } from "../types/artifacts.js";

export interface DoctorOptions {
  version: string;
  repoRoot?: string;
  fromDir?: string;
  out?: string;
  requireDocker?: boolean;
  now?: Date;
  env?: NodeJS.ProcessEnv;
}

export interface DoctorResult {
  artifact: DoctorArtifact;
  outputPath: string;
}

function runVersion(command: string, args: string[]): string | null {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5000,
    }).trim();
  } catch {
    return null;
  }
}

function nodeMajor(version: string): number {
  return Number.parseInt(version.split(".")[0], 10);
}

function checkNodeVersion(): DoctorCheck {
  const version = process.versions.node;
  const major = nodeMajor(version);
  return {
    id: "runtime.node",
    category: "runtime",
    status: major >= 20 ? "pass" : "fail",
    summary: major >= 20 ? "Node.js version is supported." : "Node.js version is unsupported.",
    observed: version,
    remediation: major >= 20 ? undefined : "Install Node.js 20 or newer.",
  };
}

function checkGit(): DoctorCheck {
  const version = runVersion("git", ["--version"]);
  return {
    id: "tooling.git",
    category: "tooling",
    status: version ? "pass" : "warn",
    summary: version ? "Git is available." : "Git is not available on PATH.",
    observed: version ?? "not found",
    remediation: version ? undefined : "Install Git or add it to PATH for diff and revision-aware workflows.",
  };
}

function checkDocker(requireDocker: boolean): DoctorCheck {
  const version = runVersion("docker", ["--version"]);
  if (version) {
    return {
      id: "tooling.docker",
      category: "tooling",
      status: "pass",
      summary: "Docker is available for plugin sandbox workflows.",
      observed: version,
    };
  }

  return {
    id: "tooling.docker",
    category: "tooling",
    status: requireDocker ? "fail" : "skip",
    summary: requireDocker
      ? "Docker is required but not available on PATH."
      : "Docker is not available; plugin sandbox checks are skipped.",
    observed: "not found",
    remediation: "Install Docker Desktop or omit --require-docker when sandbox workflows are not needed.",
  };
}

function schemaDir(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "schemas");
}

function checkSchemas(): DoctorCheck {
  const dir = schemaDir();
  const findingsSchema = join(dir, "findings.schema.json");
  const doctorSchema = join(dir, "doctor.schema.json");
  const ok = existsSync(findingsSchema) && existsSync(doctorSchema);
  return {
    id: "schema.bundle",
    category: "schema",
    status: ok ? "pass" : "fail",
    summary: ok ? "Packaged schemas are available." : "Packaged schemas are incomplete.",
    observed: dir,
    remediation: ok ? undefined : "Reinstall the package or verify package files include schemas/.",
  };
}

function checkArtifactDir(fromDir: string | undefined): DoctorCheck {
  if (!fromDir) {
    return {
      id: "artifact.from",
      category: "artifact",
      status: "skip",
      summary: "No artifact directory was provided.",
      observed: "not provided",
    };
  }

  const absolute = resolve(process.cwd(), fromDir);
  const ok = existsSync(absolute);
  return {
    id: "artifact.from",
    category: "artifact",
    status: ok ? "pass" : "fail",
    summary: ok ? "Artifact directory exists." : "Artifact directory does not exist.",
    observed: absolute,
    remediation: ok ? undefined : "Run analyze/readiness first or pass a valid --from directory.",
  };
}

function checkCi(env: NodeJS.ProcessEnv): DoctorCheck {
  if (env.GITHUB_ACTIONS === "true") {
    return {
      id: "ci.github-actions",
      category: "ci",
      status: "pass",
      summary: "GitHub Actions environment detected.",
      observed: env.GITHUB_RUN_ID ? `run_id=${env.GITHUB_RUN_ID}` : "GITHUB_ACTIONS=true",
    };
  }

  return {
    id: "ci.github-actions",
    category: "ci",
    status: "skip",
    summary: "GitHub Actions environment was not detected.",
    observed: "local",
  };
}

function outputPath(out: string | undefined): string {
  if (!out) {
    return resolve(process.cwd(), ".qh", "doctor.json");
  }
  const absolute = resolve(process.cwd(), out);
  return out.endsWith(".json") ? absolute : join(absolute, "doctor.json");
}

function checkOutput(output: string): DoctorCheck {
  const parent = dirname(output);
  try {
    mkdirSync(parent, { recursive: true });
    accessSync(parent, constants.W_OK);
    return {
      id: "filesystem.output",
      category: "filesystem",
      status: "pass",
      summary: "Output directory is writable.",
      observed: parent,
    };
  } catch (error) {
    return {
      id: "filesystem.output",
      category: "filesystem",
      status: "fail",
      summary: "Output directory is not writable.",
      observed: parent,
      remediation: error instanceof Error ? error.message : String(error),
    };
  }
}

function summarize(checks: DoctorCheck[]): DoctorArtifact["summary"] {
  return {
    checks: checks.length,
    passed: checks.filter((check) => check.status === "pass").length,
    warnings: checks.filter((check) => check.status === "warn").length,
    failed: checks.filter((check) => check.status === "fail").length,
    skipped: checks.filter((check) => check.status === "skip").length,
  };
}

function doctorStatus(summary: DoctorArtifact["summary"]): DoctorArtifact["status"] {
  if (summary.failed > 0) {
    return "failed";
  }
  if (summary.warnings > 0) {
    return "needs_attention";
  }
  return "passed";
}

export function createDoctorArtifact(options: DoctorOptions): DoctorResult {
  const generatedAt = (options.now ?? new Date()).toISOString();
  const outPath = outputPath(options.out);
  const checks = [
    checkNodeVersion(),
    checkGit(),
    checkDocker(options.requireDocker ?? false),
    checkOutput(outPath),
    checkSchemas(),
    checkArtifactDir(options.fromDir),
    checkCi(options.env ?? process.env),
  ];
  const summary = summarize(checks);

  return {
    outputPath: outPath,
    artifact: {
      version: "ctg/v1",
      generated_at: generatedAt,
      run_id: `doctor-${generatedAt.replace(/[-:.TZ]/g, "").slice(0, 14)}`,
      repo: { root: options.repoRoot ?? process.cwd() },
      tool: { name: "code-to-gate", version: options.version, plugin_versions: [] },
      artifact: "doctor",
      schema: "doctor@v1",
      completeness: "complete",
      status: doctorStatus(summary),
      checks,
      summary,
    },
  };
}

export function writeDoctorArtifact(result: DoctorResult): void {
  mkdirSync(dirname(result.outputPath), { recursive: true });
  writeFileSync(result.outputPath, JSON.stringify(result.artifact, null, 2) + "\n", "utf8");
}
