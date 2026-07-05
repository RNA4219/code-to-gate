export interface CliDiagnostic {
  schema: "ctg.cli.diagnostic@v1";
  status: "error" | "warning";
  code: string;
  message: string;
  command?: string;
  exit_code?: number;
}

export function hasQuietFlag(args: string[]): boolean {
  return args.includes("--quiet");
}

export function emitCliError(
  message: string,
  options: {
    code: string;
    command?: string;
    exitCode?: number;
  }
): void {
  console.error(message);
  console.error(
    JSON.stringify({
      schema: "ctg.cli.diagnostic@v1",
      status: "error",
      code: options.code,
      message,
      command: options.command,
      exit_code: options.exitCode,
    } satisfies CliDiagnostic)
  );
}

export function emitCliSummary(args: string[], summary: Record<string, unknown>): void {
  if (hasQuietFlag(args)) {
    return;
  }
  console.log(JSON.stringify(summary));
}
