// Ajv ESM/CJS interop workaround
import AjvImport from "ajv";
const Ajv = AjvImport.default || AjvImport;
import type { ValidateFunction, ErrorObject } from "ajv";
import addFormatsImport from "ajv-formats";
const addFormats = addFormatsImport.default || addFormatsImport;
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EXIT = {
  OK: 0,
  USAGE_ERROR: 2,
  SCHEMA_FAILED: 7,
};

const SCHEMA_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "schemas"
);

function readJson(filePath: string): unknown {
  const content = readFileSync(filePath, "utf8");
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
  if (obj.version === "ctg.gatefield/v1alpha1") {
    return getIntegrationSchemaPath("gatefield-static-result");
  }
  if (obj.version === "ctg.state-gate/v1alpha1") {
    return getIntegrationSchemaPath("state-gate-evidence");
  }
  if (obj.version === "ctg.manual-bb/v1alpha1") {
    return getIntegrationSchemaPath("manual-bb-seed");
  }
  if (obj.version === "ctg.workflow-evidence/v1alpha1") {
    return getIntegrationSchemaPath("workflow-evidence");
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
    "findings.schema.json",
    "risk-register.schema.json",
    "invariants.schema.json",
    "test-seeds.schema.json",
    "release-readiness.schema.json",
    "audit.schema.json",
    "evidence-ref.schema.json",
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

export async function schemaValidate(args: string[]): Promise<number> {
  if (args[0] !== "validate" || !args[1]) {
    console.error("usage: code-to-gate schema validate <artifact-or-schema>");
    return EXIT.USAGE_ERROR;
  }

  const targetArg = args[1];
  const target = path.resolve(process.cwd(), targetArg);

  if (!existsSync(target)) {
    console.error(`file not found: ${targetArg}`);
    return EXIT.USAGE_ERROR;
  }

  // Read and parse JSON, return SCHEMA_FAILED for parse errors
  let data: unknown;
  try {
    data = readJson(target);
  } catch (err) {
    if (err instanceof SyntaxError) {
      console.error(`invalid JSON: ${targetArg}`);
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