/**
 * Example Custom Rule Plugin
 * Demonstrates a rule plugin that detects hardcoded API keys
 */

// Plugin Input Version
const PLUGIN_INPUT_VERSION = "ctg.plugin-input/v1";
const PLUGIN_OUTPUT_VERSION = "ctg.plugin-output/v1";

/**
 * Generate UUID for findings
 */
function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Rule: HARDCODED_API_KEY
 * Detects hardcoded API keys in source code
 */
function detectHardcodedApiKey(file, content) {
  // Patterns for detecting API keys
  const patterns = [
    /api[_-]?key\s*[=:]\s*['""][a-zA-Z0-9]{20,}['"]/gi,
    /apikey\s*[=:]\s*['""][a-zA-Z0-9]{20,}['"]/gi,
    /secret[_-]?key\s*[=:]\s*['""][a-zA-Z0-9]{20,}['"]/gi,
    /access[_-]?key\s*[=:]\s*['""][a-zA-Z0-9]{20,}['"]/gi,
  ];

  const matches = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of patterns) {
      const match = pattern.exec(line);
      if (match) {
        matches.push({ line: i + 1, match: match[0] });
      }
    }
  }

  if (matches.length === 0) {
    return null;
  }

  const evidence = matches.map((m, idx) => ({
    id: `${file.id}-e${idx}`,
    path: file.path,
    startLine: m.line,
    endLine: m.line,
    kind: "text",
  }));

  return {
    id: generateUUID(),
    ruleId: "HARDCODED_API_KEY",
    category: "security",
    severity: "high",
    confidence: 0.85,
    title: "Hardcoded API Key Detected",
    summary: `Found ${matches.length} potential hardcoded API key(s) in ${file.path}`,
    evidence,
    tags: ["security", "credentials", "api-key"],
  };
}

/**
 * Main plugin entry point
 */
async function main() {
  // Read input from stdin
  const inputJson = await readStdin();
  const input = JSON.parse(inputJson);

  const findings = [];
  const diagnostics = [];

  try {
    const repoGraph = input.repo_graph;

    // Check input version
    if (input.version !== PLUGIN_INPUT_VERSION) {
      diagnostics.push({
        id: "version-mismatch",
        severity: "warning",
        code: "VERSION_MISMATCH",
        message: `Expected ${PLUGIN_INPUT_VERSION}, got ${input.version}`,
      });
    }

    // Process each file
    const fileCount = repoGraph.files ? repoGraph.files.length : 0;

    for (const file of repoGraph.files || []) {
      // Skip test files and generated files
      if (file.role === "test" || file.role === "generated") {
        continue;
      }

      // Skip non-source files
      if (file.role !== "source") {
        continue;
      }

      // In a real plugin, we would read the actual file content
      // For this example, we simulate detection
      const simulatedContent = `const apiKey = "sk-test-1234567890abcdef";`;
      const finding = detectHardcodedApiKey(file, simulatedContent);

      if (finding) {
        findings.push(finding);
      }
    }

    diagnostics.push({
      id: "scan-complete",
      severity: "info",
      code: "SCAN_COMPLETE",
      message: `Scanned ${fileCount} files, found ${findings.length} issues`,
    });
  } catch (err) {
    diagnostics.push({
      id: "error",
      severity: "error",
      code: "PROCESSING_ERROR",
      message: err.message,
    });
  }

  // Write output to stdout
  const output = {
    version: PLUGIN_OUTPUT_VERSION,
    findings,
    diagnostics,
  };

  process.stdout.write(JSON.stringify(output));
}

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
  });
}

main().catch((err) => {
  process.stdout.write(
    JSON.stringify({
      version: PLUGIN_OUTPUT_VERSION,
      errors: [{ code: "INTERNAL_ERROR", message: err.message }],
    })
  );
  process.exit(10);
});