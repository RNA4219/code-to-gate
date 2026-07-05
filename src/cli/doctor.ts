import { createDoctorArtifact, writeDoctorArtifact } from "../doctor/doctor.js";
import type { EXIT, getOption } from "./exit-codes.js";
import { emitCliError, emitCliSummary } from "./output.js";

export interface DoctorCliOptions {
  VERSION: string;
  EXIT: typeof EXIT;
  getOption: typeof getOption;
}

const VALUE_OPTIONS = new Set(["--out", "--from"]);
const FLAG_OPTIONS = new Set(["--require-docker", "--quiet"]);

function printDoctorHelp(): void {
  console.log(`code-to-gate doctor [--out <file-or-dir>] [--from <artifact-dir>] [--require-docker] [--quiet]

Checks local and CI readiness for code-to-gate workflows and writes doctor.json.`);
}

function validateArgs(args: string[]): string | null {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (VALUE_OPTIONS.has(arg)) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        return `${arg} requires a value`;
      }
      index += 1;
      continue;
    }
    if (FLAG_OPTIONS.has(arg)) {
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      continue;
    }
    return `unknown doctor option: ${arg}`;
  }
  return null;
}

export async function doctorCommand(args: string[], options: DoctorCliOptions): Promise<number> {
  if (args.includes("--help") || args.includes("-h")) {
    printDoctorHelp();
    return options.EXIT.OK;
  }

  const argError = validateArgs(args);
  if (argError) {
    emitCliError(argError, {
      code: "USAGE_ERROR",
      command: "doctor",
      exitCode: options.EXIT.USAGE_ERROR,
    });
    return options.EXIT.USAGE_ERROR;
  }

  try {
    const result = createDoctorArtifact({
      version: options.VERSION,
      fromDir: options.getOption(args, "--from"),
      out: options.getOption(args, "--out"),
      requireDocker: args.includes("--require-docker"),
    });
    writeDoctorArtifact(result);
    emitCliSummary(args, {
      schema: "ctg.cli.summary@v1",
      tool: { name: "code-to-gate", version: options.VERSION },
      command: "doctor",
      status: result.artifact.status,
      exit_code: result.artifact.status === "failed" ? options.EXIT.READINESS_NOT_CLEAR : options.EXIT.OK,
      output: result.outputPath,
      summary: result.artifact.summary,
    });
    return result.artifact.status === "failed" ? options.EXIT.READINESS_NOT_CLEAR : options.EXIT.OK;
  } catch (error) {
    emitCliError(error instanceof Error ? error.message : String(error), {
      code: "DOCTOR_FAILED",
      command: "doctor",
      exitCode: options.EXIT.INTERNAL_ERROR,
    });
    return options.EXIT.INTERNAL_ERROR;
  }
}
