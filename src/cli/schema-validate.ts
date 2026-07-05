// Ajv ESM/CJS interop workaround
import AjvImport from "ajv";
const Ajv = AjvImport.default || AjvImport;
import type { ValidateFunction, ErrorObject } from "ajv";
import addFormatsImport from "ajv-formats";
const addFormats = addFormatsImport.default || addFormatsImport;
import { readFileSync, existsSync, mkdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yamlImport from "js-yaml";
import type { SchemaMigrationArtifact } from "../types/artifacts.js";

const EXIT = {
  OK: 0,
  USAGE_ERROR: 2,
  SCHEMA_FAILED: 7,
};

const TOOL_VERSION = "schema-cli";

const VERSION_MIGRATIONS = new Map<string, string>([
  ["ctg/v1alpha1", "ctg/v1"],
  ["ctg.state-gate/v1alpha1", "ctg.state-gate/v1"],
  ["ctg.manual-bb/v1alpha1", "ctg.manual-bb/v1"],
  ["ctg.workflow-evidence/v1alpha1", "ctg.workflow-evidence/v1"],
  ["ctg.gatefield/v1alpha1", "ctg.gatefield/v1"],
]);

const SUPPORTED_MIGRATION_TARGETS = new Set<string>(["ctg/v1", ...VERSION_MIGRATIONS.values()]);

export interface SchemaValidationResult {
  artifact: string;
  status: "ok" | "error";
  errors?: string[];
}

export async function validateArtifactFile(filePath: string): Promise<SchemaValidationResult> {
  if (!existsSync(filePath)) {
    return { artifact: path.basename(filePath), status: "error", errors: ["file not found"] };
  }

  let data: unknown;
  try {
    data = readJson(filePath);
  } catch (error) {
    return {
      artifact: path.basename(filePath),
      status: "error",
      errors: [`parse error: ${error instanceof Error ? error.message : String(error)}`],
    };
  }

  const schemaPath = schemaForArtifact(data);
  if (!schemaPath) {
    return { artifact: path.basename(filePath), status: "error", errors: ["no schema found"] };
  }

  const ajv = createAjv();
  await loadSchemas(ajv);
  const schema = readJson(schemaPath) as { $id?: string };
  try {
    const validate: ValidateFunction = ajv.getSchema(schema.$id || schemaPath) || ajv.compile(schema);
    return validate(data)
      ? { artifact: path.basename(filePath), status: "ok" }
      : { artifact: path.basename(filePath), status: "error", errors: formatErrors(validate.errors) };
  } catch (error) {
    return {
      artifact: path.basename(filePath),
      status: "error",
      errors: [`validation error: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

const SCHEMA_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "schemas"
);

function readJson(filePath: string): unknown {
  const content = readFileSync(filePath, "utf8");
  if (filePath.endsWith(".yaml") || filePath.endsWith(".yml")) {
    // Use JSON_SCHEMA to prevent YAML type conversions (dates, binary, etc.)
    // Raw YAML validation - no key normalization
    return yamlImport.load(content, { schema: yamlImport.JSON_SCHEMA }) as unknown;
  }
  return JSON.parse(content);
}

function getSchemaPath(artifactName: string): string {
  return path.join(SCHEMA_DIR, `${artifactName}.schema.json`);
}

function getIntegrationSchemaPath(integrationName: string): string {
  return path.join(SCHEMA_DIR, "integrations", `${integrationName}.schema.json`);
}

function schemaForArtifact(data: unknown): string | null {
  if (typeof data !== "object" || data === null) {
    return null;
  }

  const obj = data as Record<string, unknown>;

  // Check for artifact field
  if (obj.artifact && typeof obj.artifact === "string") {
    const schemaPath = getSchemaPath(obj.artifact);
    if (existsSync(schemaPath)) {
      return schemaPath;
    }
  }

  // Check for integration version identifiers
  if (obj.version === "ctg.gatefield/v1alpha1" || obj.version === "ctg.gatefield/v1") {
    return getIntegrationSchemaPath("gatefield-static-result");
  }
  if (obj.version === "ctg.state-gate/v1alpha1" || obj.version === "ctg.state-gate/v1") {
    return getIntegrationSchemaPath("state-gate-evidence");
  }
  if (obj.version === "ctg.manual-bb/v1alpha1" || obj.version === "ctg.manual-bb/v1") {
    return getIntegrationSchemaPath("manual-bb-seed");
  }
  if (obj.version === "ctg.workflow-evidence/v1alpha1" || obj.version === "ctg.workflow-evidence/v1") {
    return getIntegrationSchemaPath("workflow-evidence");
  }
  if (obj.version === "ctg.qeg-input/v1") {
    return getIntegrationSchemaPath("qeg-code-to-gate");
  }

  return null;
}

function createAjv(): InstanceType<typeof Ajv> {
  const ajv = new Ajv({
    allErrors: true,
    strict: false,
    // Ignore $schema references to avoid meta-schema resolution issues
    validateSchema: false,
  });

  // Add format validators (date-time, etc.)
  addFormats(ajv);

  return ajv;
}

async function loadSchemas(ajv: InstanceType<typeof Ajv>): Promise<void> {
  // Pre-load all schemas for $ref resolution
  const schemaFiles = [
    "shared-defs.schema.json",
    "normalized-repo-graph.schema.json",
    "raw-findings.schema.json",
    "findings.schema.json",
    "risk-register.schema.json",
    "invariants.schema.json",
    "test-seeds.schema.json",
    "test-plan.schema.json",
    "quality-pack.schema.json",
    "release-pack.schema.json",
    "hosted-static-report.schema.json",
    "schema-migration.schema.json",
    "release-readiness.schema.json",
    "audit.schema.json",
    "evidence-ref.schema.json",
    "evidence-dag.schema.json",
    "historical-comparison.schema.json",
    "spec-drift.schema.json",
    "doctor.schema.json",
    "diff-analysis.schema.json",
    "database-assets.schema.json",
    "self-analysis-debt.schema.json",
  ];

  for (const file of schemaFiles) {
    const filePath = path.join(SCHEMA_DIR, file);
    if (existsSync(filePath)) {
      try {
        const content = readFileSync(filePath, "utf8");
        if (!content.trim()) {
          console.error(`warning: empty schema file: ${file}`);
          continue;
        }
        const schema = JSON.parse(content) as object;
        ajv.addSchema(schema, `https://code-to-gate.local/schemas/${file}`);
      } catch (err) {
        console.error(`warning: failed to load schema ${file}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // Load integration schemas
  const integrationFiles = [
    "gatefield-static-result.schema.json",
    "state-gate-evidence.schema.json",
    "manual-bb-seed.schema.json",
    "workflow-evidence.schema.json",
    "qeg-code-to-gate.schema.json",
  ];

  for (const file of integrationFiles) {
    const filePath = path.join(SCHEMA_DIR, "integrations", file);
    if (existsSync(filePath)) {
      try {
        const content = readFileSync(filePath, "utf8");
        if (!content.trim()) {
          console.error(`warning: empty integration schema file: ${file}`);
          continue;
        }
        const schema = JSON.parse(content) as object;
        ajv.addSchema(schema, `https://code-to-gate.local/schemas/integrations/${file}`);
      } catch (err) {
        console.error(`warning: failed to load integration schema ${file}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
}

function formatErrors(errors: ErrorObject[] | null | undefined): string[] {
  if (!errors) return [];

  return errors.map((err: ErrorObject) => {
    const instancePath = err.instancePath || "$";
    const message = err.message || "unknown error";
    return `${instancePath}: ${message}`;
  });
}

/**
 * Required artifacts - missing in strict mode will cause failure
 */
/**
 * Validation profile determines which artifacts are required.
 *
 * - analyze: analyze command output (findings, repo-graph, audit)
 * - readiness: readiness command output (release-readiness only)
 * - full: all required artifacts (default, backward compatible)
 */
export type ValidationProfile = "analyze" | "readiness" | "full";

export interface ValidateAllOptions {
  profile?: ValidationProfile;
}

/**
 * Required artifacts by validation profile.
 */
const PROFILE_REQUIRED_ARTIFACTS: Record<ValidationProfile, string[]> = {
  analyze: ["findings.json", "repo-graph.json", "audit.json"],
  readiness: ["release-readiness.json"],
  full: ["findings.json", "release-readiness.json", "repo-graph.json", "audit.json"],
};

/**
 * Legacy required artifacts - kept for backward compatibility.
 * Equivalent to 'full' profile.
 * @deprecated Use PROFILE_REQUIRED_ARTIFACTS.full instead
 */
const REQUIRED_ARTIFACTS = [
  "findings.json",
  "release-readiness.json",
  "repo-graph.json",
  "audit.json",
];

/**
 * Optional artifacts - missing is allowed even in strict mode
 */
const OPTIONAL_ARTIFACTS = [
  "risk-register.yaml",
  "self-analysis-debt.json",
  "test-seeds.json",
  "test-plan.json",
  "quality-pack.json",
  "release-pack.json",
  "hosted-static-report.json",
  "schema-migration.json",
  "invariants.json",
  "raw-findings.json",
  "database-assets.json",
  "diff.json",
  "diff-analysis.json",
  "evidence-dag.json",
  "historical-comparison.json",
  "spec-drift.json",
  "doctor.json",
];

/**
 * All artifacts to validate (required + optional)
 */
const ARTIFACTS_TO_VALIDATE = [...REQUIRED_ARTIFACTS, ...OPTIONAL_ARTIFACTS];

function getValidationProfile(options?: ValidateAllOptions): ValidationProfile {
  return options?.profile ?? "full";
}

function isKnownValidateAllOption(value: string): value is "--profile" | "--strict" | "--allow-missing" {
  return value === "--profile" || value === "--strict" || value === "--allow-missing";
}

function parseValidateAllArgs(args: string[]): {
  dirArg: string;
  profile: ValidationProfile;
  strictMode: boolean;
  allowMissing: boolean;
} | { error: string } {
  if (!args[0]) {
    return { error: "usage: code-to-gate schema validate-all <dir> [--profile <analyze|readiness|full>] [--strict] [--allow-missing]" };
  }

  const dirArg = args[0];
  const seen = new Set<string>();
  let profile: ValidationProfile = "full";
  let strictMode = false;
  let allowMissing = false;

  for (let i = 1; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === "--profile") {
      if (seen.has("--profile")) {
        return { error: "Error: --profile specified more than once" };
      }
      seen.add("--profile");
      const value = args[i + 1];
      if (!value) {
        return { error: "Error: --profile requires a value (analyze, readiness, or full)" };
      }
      if (value.startsWith("--")) {
        return { error: `Error: --profile requires a value, got option '${value}'` };
      }
      if (value === "analyze" || value === "readiness" || value === "full") {
        profile = value;
        i += 1;
        continue;
      }
      return { error: `Error: Invalid profile '${value}'. Valid profiles: analyze, readiness, full` };
    }

    if (arg === "--strict") {
      if (seen.has("--strict")) {
        return { error: "Error: --strict specified more than once" };
      }
      seen.add("--strict");
      strictMode = true;
      continue;
    }

    if (arg === "--allow-missing") {
      if (seen.has("--allow-missing")) {
        return { error: "Error: --allow-missing specified more than once" };
      }
      seen.add("--allow-missing");
      allowMissing = true;
      continue;
    }

    if (isKnownValidateAllOption(arg)) {
      return { error: `Error: unexpected option '${arg}'` };
    }

    if (arg.startsWith("--")) {
      return { error: `Error: unknown option '${arg}'` };
    }

    return { error: `Error: unexpected positional argument '${arg}'` };
  }

  return { dirArg, profile, strictMode, allowMissing };
}

async function validateArtifactsInDir(
  dirArg: string,
  silent: boolean,
  strictMode: boolean,
  allowMissing: boolean,
  profile: ValidationProfile
): Promise<SchemaValidationResult[]> {
  const dir = path.resolve(process.cwd(), dirArg);

  if (!existsSync(dir)) {
    return [{ artifact: "directory", status: "error", errors: [`directory not found: ${dirArg}`] }];
  }

  const ajv = createAjv();
  await loadSchemas(ajv);

  const results: SchemaValidationResult[] = [];
  const skipped: string[] = [];
  const missingRequired: string[] = [];
  const requiredArtifacts = PROFILE_REQUIRED_ARTIFACTS[profile];

  for (const artifact of ARTIFACTS_TO_VALIDATE) {
    const filePath = path.join(dir, artifact);

    if (!existsSync(filePath)) {
      const isRequired = requiredArtifacts.includes(artifact);
      if (strictMode && isRequired && !allowMissing) {
        results.push({ artifact, status: "error", errors: ["MISSING_REQUIRED_ARTIFACT"] });
        missingRequired.push(artifact);
        if (!silent) {
          console.error(`ERROR: Required artifact missing: ${artifact}`);
        }
      } else {
        skipped.push(artifact);
      }
      continue;
    }

    let data: unknown;
    try {
      data = readJson(filePath);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      results.push({ artifact, status: "error", errors: [`parse error: ${errorMsg}`] });
      quarantineInvalidArtifact(dir, filePath, artifact);
      if (!silent) {
        console.error(`parse error: ${artifact}`);
        console.error(errorMsg);
      }
      continue;
    }

    const schemaPath = schemaForArtifact(data);
    if (!schemaPath) {
      results.push({ artifact, status: "error", errors: ["no schema found"] });
      quarantineInvalidArtifact(dir, filePath, artifact);
      if (!silent) {
        console.error(`no schema: ${artifact}`);
      }
      continue;
    }

    const schema = readJson(schemaPath) as { $id?: string };

    try {
      const validate: ValidateFunction = ajv.getSchema(schema.$id || schemaPath) || ajv.compile(schema);
      const valid = validate(data);

      if (!valid) {
        const errors = formatErrors(validate.errors);
        results.push({ artifact, status: "error", errors });
        quarantineInvalidArtifact(dir, filePath, artifact);
        if (!silent) {
          console.error(`invalid: ${artifact}`);
          for (const error of errors) {
            console.error(`  ${error}`);
          }
        }
      } else {
        results.push({ artifact, status: "ok" });
        if (!silent) {
          console.log(`ok: ${artifact}`);
        }
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      results.push({ artifact, status: "error", errors: [`validation error: ${errorMsg}`] });
      quarantineInvalidArtifact(dir, filePath, artifact);
      if (!silent) {
        console.error(`error: ${artifact}`);
        console.error(`  ${errorMsg}`);
      }
    }
  }

  if (!silent && skipped.length > 0) {
    console.log(`skipped (not found): ${skipped.join(", ")}`);
  }

  if (!silent && missingRequired.length > 0 && strictMode) {
    console.error(`\nMISSING_REQUIRED_ARTIFACT: ${missingRequired.join(", ")}`);
  }

  if (!silent && results.some((result) => result.status === "error")) {
    const failures = results.filter((result) => result.status === "error").map((result) => result.artifact);
    console.error(`\nSchema validation failed for: ${failures.join(", ")}`);
  } else if (!silent) {
    console.log(`\nAll artifacts validated successfully`);
  }

  return results;
}

function quarantineInvalidArtifact(dir: string, filePath: string, artifact: string): void {
  if (!existsSync(filePath)) return;

  const invalidDir = path.join(dir, "invalid");
  mkdirSync(invalidDir, { recursive: true });

  let target = path.join(invalidDir, artifact);
  if (existsSync(target)) {
    const parsed = path.parse(artifact);
    target = path.join(invalidDir, `${parsed.name}-${Date.now()}${parsed.ext}`);
  }

  renameSync(filePath, target);
}

async function validateAllArtifacts(
  dirArg: string,
  strictMode: boolean = false,
  allowMissing: boolean = false,
  options: ValidateAllOptions = {}
): Promise<number> {
  if (!existsSync(path.resolve(process.cwd(), dirArg))) {
    console.error(`directory not found: ${dirArg}`);
    return EXIT.USAGE_ERROR;
  }

  const profile = getValidationProfile(options);
  const results = await validateArtifactsInDir(dirArg, false, strictMode, allowMissing, profile);
  const failures = results.filter((result) => result.status === "error");
  return failures.length > 0 ? EXIT.SCHEMA_FAILED : EXIT.OK;
}

/**
 * Validate all artifacts and return results (for QEG integration)
 * @param dirArg Directory containing artifacts
 * @param silent If true, suppress console output
 * @param profile Validation profile (analyze/readiness/full)
 * @param strictMode If true, fail on missing required artifacts
 * @param allowMissing If true, allow missing artifacts even in strict mode
 * @returns Array of validation results
 */
export async function validateAllArtifactsWithResults(
  dirArg: string,
  silent: boolean = false,
  strictMode: boolean = false,
  allowMissing: boolean = false,
  options: ValidateAllOptions = {}
): Promise<SchemaValidationResult[]> {
  return validateArtifactsInDir(dirArg, silent, strictMode, allowMissing, getValidationProfile(options));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneJsonRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function parseMigrateArgs(args: string[]): {
  inputArg: string;
  outArg: string;
  targetVersion?: string;
} | { error: string } {
  const inputArg = args[0];
  if (!inputArg || inputArg.startsWith("--")) {
    return { error: "usage: code-to-gate schema migrate <artifact> --out <file-or-dir> [--target-version <version>]" };
  }

  let outArg: string | undefined;
  let targetVersion: string | undefined;

  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--out") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        return { error: "Error: --out requires a value" };
      }
      outArg = value;
      index += 1;
      continue;
    }

    if (arg === "--target-version") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        return { error: "Error: --target-version requires a value" };
      }
      targetVersion = value;
      index += 1;
      continue;
    }

    return { error: `Error: unknown schema migrate option '${arg}'` };
  }

  if (!outArg) {
    return { error: "Error: schema migrate requires --out <file-or-dir>" };
  }

  if (targetVersion && !SUPPORTED_MIGRATION_TARGETS.has(targetVersion)) {
    return {
      error: `Error: unsupported --target-version '${targetVersion}'. Supported targets: ${Array.from(SUPPORTED_MIGRATION_TARGETS).join(", ")}`,
    };
  }

  return { inputArg, outArg, targetVersion };
}

function migrationOutputPaths(inputPath: string, outArg: string): { artifactPath: string; reportPath: string } {
  const output = path.resolve(process.cwd(), outArg);
  const outputIsDirectory = existsSync(output)
    ? statSync(output).isDirectory()
    : path.extname(output) === "";

  if (outputIsDirectory) {
    return {
      artifactPath: path.join(output, path.basename(inputPath)),
      reportPath: path.join(output, "schema-migration.json"),
    };
  }

  return {
    artifactPath: output,
    reportPath: path.join(path.dirname(output), "schema-migration.json"),
  };
}

function getStringField(record: Record<string, unknown>, field: string): string | undefined {
  const value = record[field];
  return typeof value === "string" ? value : undefined;
}

function createMigrationReport(input: {
  inputPath: string;
  outputPath: string;
  source: Record<string, unknown>;
  target: Record<string, unknown>;
  changes: SchemaMigrationArtifact["changes"];
  validation: SchemaMigrationArtifact["validation"];
  status: SchemaMigrationArtifact["status"];
}): SchemaMigrationArtifact {
  const sourceRepo = isRecord(input.source.repo) ? input.source.repo : undefined;
  const targetRepo = isRecord(input.target.repo) ? input.target.repo : undefined;
  const repoRoot = getStringField(targetRepo ?? sourceRepo ?? {}, "root") ?? process.cwd();
  const runId = getStringField(input.target, "run_id") ?? getStringField(input.source, "run_id") ?? `schema-migration-${Date.now()}`;

  return {
    version: "ctg/v1",
    generated_at: new Date().toISOString(),
    run_id: runId,
    repo: { root: repoRoot },
    tool: { name: "code-to-gate", version: TOOL_VERSION, plugin_versions: [] },
    artifact: "schema-migration",
    schema: "schema-migration@v1",
    completeness: input.validation.status === "ok" ? "complete" : "partial",
    status: input.status,
    source: {
      path: path.relative(process.cwd(), input.inputPath) || ".",
      artifact: getStringField(input.source, "artifact"),
      schema: getStringField(input.source, "schema"),
      version: getStringField(input.source, "version"),
    },
    target: {
      path: path.relative(process.cwd(), input.outputPath) || ".",
      artifact: getStringField(input.target, "artifact"),
      schema: getStringField(input.target, "schema"),
      version: getStringField(input.target, "version") ?? "ctg/v1",
    },
    changes: input.changes,
    validation: input.validation,
    generated_by: "ctg-schema-migrate-v1",
  };
}

async function migrateSchemaArtifact(args: string[]): Promise<number> {
  const parsed = parseMigrateArgs(args);
  if ("error" in parsed) {
    console.error(parsed.error);
    return EXIT.USAGE_ERROR;
  }

  const inputPath = path.resolve(process.cwd(), parsed.inputArg);
  if (!existsSync(inputPath)) {
    console.error(`file not found: ${parsed.inputArg}`);
    return EXIT.USAGE_ERROR;
  }

  let source: unknown;
  try {
    source = readJson(inputPath);
  } catch (error) {
    console.error(`invalid JSON: ${parsed.inputArg}`);
    console.error(error instanceof Error ? error.message : String(error));
    return EXIT.SCHEMA_FAILED;
  }

  if (!isRecord(source)) {
    console.error("schema migrate requires a JSON object artifact");
    return EXIT.SCHEMA_FAILED;
  }

  const sourceVersion = getStringField(source, "version");
  const inferredTargetVersion = sourceVersion ? VERSION_MIGRATIONS.get(sourceVersion) : undefined;
  const isCurrentTargetVersion = sourceVersion ? SUPPORTED_MIGRATION_TARGETS.has(sourceVersion) : false;
  if (!sourceVersion || (!inferredTargetVersion && !isCurrentTargetVersion)) {
    console.error(`unsupported artifact version for migration: ${sourceVersion ?? "missing"}`);
    return EXIT.SCHEMA_FAILED;
  }

  const targetVersion = inferredTargetVersion ?? sourceVersion;
  if (parsed.targetVersion && parsed.targetVersion !== targetVersion) {
    console.error(
      `unsupported migration target '${parsed.targetVersion}' for source version '${sourceVersion}'. Expected target: ${targetVersion}`
    );
    return EXIT.SCHEMA_FAILED;
  }

  const migrated = cloneJsonRecord(source);
  const changes: SchemaMigrationArtifact["changes"] = [];
  let status: SchemaMigrationArtifact["status"] = "unchanged";

  if (targetVersion && targetVersion !== sourceVersion) {
    migrated.version = targetVersion;
    status = "migrated";
    changes.push({
      path: "/version",
      from: sourceVersion,
      to: targetVersion,
      reason: "Normalize legacy v1alpha1 artifact version to the stable v1 version string.",
    });
  }

  const outputs = migrationOutputPaths(inputPath, parsed.outArg);
  mkdirSync(path.dirname(outputs.artifactPath), { recursive: true });
  writeFileSync(outputs.artifactPath, JSON.stringify(migrated, null, 2) + "\n", "utf8");

  const validationResult = await validateArtifactFile(outputs.artifactPath);
  const validation: SchemaMigrationArtifact["validation"] = validationResult.status === "ok"
    ? { status: "ok", errors: [] }
    : { status: "error", errors: validationResult.errors ?? ["schema validation failed"] };

  if (validation.status === "error") {
    status = "failed";
  }

  const report = createMigrationReport({
    inputPath,
    outputPath: outputs.artifactPath,
    source,
    target: migrated,
    changes,
    validation,
    status,
  });

  mkdirSync(path.dirname(outputs.reportPath), { recursive: true });
  writeFileSync(outputs.reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");

  console.log(JSON.stringify({
    schema: "ctg.cli.summary@v1",
    tool: "code-to-gate",
    command: "schema migrate",
    status,
    exit_code: validation.status === "ok" ? EXIT.OK : EXIT.SCHEMA_FAILED,
    output: {
      artifact: path.relative(process.cwd(), outputs.artifactPath) || ".",
      report: path.relative(process.cwd(), outputs.reportPath) || ".",
    },
    migration: {
      from: sourceVersion,
      to: getStringField(migrated, "version"),
      changes: changes.length,
    },
    validation,
  }));

  return validation.status === "ok" ? EXIT.OK : EXIT.SCHEMA_FAILED;
}

export async function schemaValidate(args: string[]): Promise<number> {
  const command = args[0];

  if (command === "migrate") {
    return migrateSchemaArtifact(args.slice(1));
  }

  if (command === "validate-all") {
    const parsed = parseValidateAllArgs(args.slice(1));
    if ("error" in parsed) {
      console.error(parsed.error);
      return EXIT.USAGE_ERROR;
    }
    return validateAllArtifacts(parsed.dirArg, parsed.strictMode, parsed.allowMissing, { profile: parsed.profile });
  }

  if (command === "validate") {
    if (args.length !== 2 || !args[1] || args[1].startsWith("--")) {
      console.error("usage: code-to-gate schema validate <artifact-or-schema>");
      console.error("usage: code-to-gate schema validate-all <dir> [--profile <analyze|readiness|full>] [--strict] [--allow-missing]");
      console.error("usage: code-to-gate schema migrate <artifact> --out <file-or-dir> [--target-version <version>]");
      return EXIT.USAGE_ERROR;
    }
  } else {
    console.error("usage: code-to-gate schema validate <artifact-or-schema>");
    console.error("usage: code-to-gate schema validate-all <dir> [--profile <analyze|readiness|full>] [--strict] [--allow-missing]");
    console.error("usage: code-to-gate schema migrate <artifact> --out <file-or-dir> [--target-version <version>]");
    return EXIT.USAGE_ERROR;
  }

  const targetArg = args[1];
  const target = path.resolve(process.cwd(), targetArg);

  if (!existsSync(target)) {
    console.error(`file not found: ${targetArg}`);
    return EXIT.USAGE_ERROR;
  }

  // Read and parse JSON/YAML, return SCHEMA_FAILED for parse errors
  let data: unknown;
  try {
    data = readJson(target);
  } catch (err) {
    if (err instanceof SyntaxError || err instanceof yamlImport.YAMLException) {
      console.error(`invalid ${target.endsWith(".yaml") || target.endsWith(".yml") ? "YAML" : "JSON"}: ${targetArg}`);
      console.error(err.message);
      return EXIT.SCHEMA_FAILED;
    }
    throw err;
  }

  // If validating a schema file itself, check basic structure without Ajv
  if (target.endsWith(".schema.json")) {
    const schema = data as {
      $schema?: string;
      title?: string;
      $id?: string;
      type?: string;
      allOf?: unknown[];
      anyOf?: unknown[];
      oneOf?: unknown[];
      $defs?: Record<string, unknown>;
      properties?: Record<string, unknown>;
      $ref?: string;
    };

    if (!schema.$schema || !schema.title) {
      console.error("schema document is missing $schema or title");
      return EXIT.SCHEMA_FAILED;
    }

    // For schema files, we validate the basic structure
    // We don't validate against the JSON Schema meta-schema since it may not be available
    // Instead, we check that it's a valid JSON Schema by checking required properties
    const hasValidStructure =
      schema.$schema &&
      schema.title &&
      (schema.type || schema.allOf || schema.anyOf || schema.oneOf || schema.$defs || schema.properties || schema.$ref);

    if (!hasValidStructure) {
      console.error(`schema invalid: ${targetArg} - missing required schema structure`);
      return EXIT.SCHEMA_FAILED;
    }

    console.log(`schema ok: ${targetArg}`);
    return EXIT.OK;
  }

  // For artifact validation, use Ajv with loaded schemas
  const ajv = createAjv();

  // Load all schemas for $ref resolution
  await loadSchemas(ajv);

  // For artifact validation, find the appropriate schema
  const schemaPath = schemaForArtifact(data);

  if (!schemaPath) {
    console.error("unable to choose schema for artifact");
    return EXIT.SCHEMA_FAILED;
  }

  const schema = readJson(schemaPath) as { $id?: string };

  try {
    const validate: ValidateFunction = ajv.getSchema(schema.$id || schemaPath) || ajv.compile(schema);
    const valid = validate(data);

    if (!valid) {
      console.error(`artifact invalid: ${targetArg}`);
      for (const error of formatErrors(validate.errors)) {
        console.error(error);
      }
      return EXIT.SCHEMA_FAILED;
    }

    console.log(`artifact ok: ${targetArg}`);
    return EXIT.OK;
  } catch (err: unknown) {
    console.error(`validation error: ${targetArg}`);
    if (err instanceof Error) {
      console.error(err.message);
    }
    return EXIT.SCHEMA_FAILED;
  }
}
