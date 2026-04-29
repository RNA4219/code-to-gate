/**
 * Example Python Language Adapter Plugin
 * Demonstrates a language plugin that provides Python parsing capabilities
 */

const PLUGIN_INPUT_VERSION = "ctg.plugin-input/v1";
const PLUGIN_OUTPUT_VERSION = "ctg.plugin-output/v1";

/**
 * Parse Python file for symbols and relations
 */
function parsePythonFile(file, content) {
  const symbols = [];
  const relations = [];
  const imports = [];
  const exports = [];

  try {
    const lines = content.split("\n");
    let lineNum = 0;

    for (const line of lines) {
      lineNum++;

      // Detect function definitions
      const funcMatch = /^def\s+(\w+)\s*\(/.exec(line);
      if (funcMatch) {
        symbols.push({
          id: `${file.id}-func-${funcMatch[1]}`,
          fileId: file.id,
          name: funcMatch[1],
          kind: "function",
          exported: false,
          evidence: [
            {
              id: `${file.id}-e${lineNum}`,
              path: file.path,
              startLine: lineNum,
              kind: "text",
            },
          ],
        });
      }

      // Detect class definitions
      const classMatch = /^class\s+(\w+)/.exec(line);
      if (classMatch) {
        symbols.push({
          id: `${file.id}-class-${classMatch[1]}`,
          fileId: file.id,
          name: classMatch[1],
          kind: "class",
          exported: false,
          evidence: [
            {
              id: `${file.id}-e${lineNum}`,
              path: file.path,
              startLine: lineNum,
              kind: "text",
            },
          ],
        });
      }

      // Detect imports
      const importMatch = /^import\s+(\w+)/.exec(line) || /^from\s+(\w+)\s+import/.exec(line);
      if (importMatch) {
        imports.push(importMatch[1]);
      }

      // Detect async functions
      const asyncMatch = /^async\s+def\s+(\w+)\s*\(/.exec(line);
      if (asyncMatch) {
        symbols.push({
          id: `${file.id}-async-${asyncMatch[1]}`,
          fileId: file.id,
          name: asyncMatch[1],
          kind: "function",
          exported: false,
          async: true,
          evidence: [
            {
              id: `${file.id}-e${lineNum}`,
              path: file.path,
              startLine: lineNum,
              kind: "text",
            },
          ],
        });
      }
    }

    return {
      status: "text_fallback",
      symbols,
      relations,
      imports,
      exports,
    };
  } catch (err) {
    return {
      status: "failed",
      symbols: [],
      relations: [],
      imports: [],
      exports: [],
      error: err.message,
    };
  }
}

/**
 * Detect Python-specific test patterns
 */
function detectPythonTest(content) {
  const testPatterns = [
    /^import\s+unittest/,
    /^import\s+pytest/,
    /^from\s+unittest\s+import/,
    /^from\s+pytest\s+import/,
    /class\s+.*Test.*:/,
    /^def\s+test_/,
    /^async\s+def\s+test_/,
  ];

  for (const pattern of testPatterns) {
    if (pattern.test(content)) {
      return true;
    }
  }

  return false;
}

/**
 * Detect Python entrypoints
 */
function detectPythonEntrypoint(content) {
  const entrypointPatterns = [
    /^if\s+__name__\s*==\s*['"]__main__['"]:/,
    /^def\s+main\s*\(/,
    /^def\s+app\s*\(/,
  ];

  for (const pattern of entrypointPatterns) {
    if (pattern.test(content)) {
      return true;
    }
  }

  return false;
}

/**
 * Main plugin entry point
 */
async function main() {
  const inputJson = await readStdin();
  const input = JSON.parse(inputJson);

  const diagnostics = [];
  const parsedFiles = [];
  let totalSymbols = 0;
  let totalImports = 0;

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

    for (const file of repoGraph.files || []) {
      // Only process Python files
      if (file.language !== "py") {
        continue;
      }

      // Simulate parsing with sample Python content
      const simulatedContent = `
import os
import sys
from typing import List

def example_function():
    pass

class ExampleClass:
    def method(self):
        pass

async def async_handler():
    pass

def test_example():
    pass

if __name__ == "__main__":
    main()
`;

      const result = parsePythonFile(file, simulatedContent);
      parsedFiles.push({ path: file.path, result });

      totalSymbols += result.symbols.length;
      totalImports += result.imports.length;

      diagnostics.push({
        id: `parse-${file.id}`,
        severity: "info",
        code: "PARSE_SUCCESS",
        message: `Parsed ${file.path}: found ${result.symbols.length} symbols, ${result.imports.length} imports`,
      });

      // Detect test files
      if (detectPythonTest(simulatedContent)) {
        diagnostics.push({
          id: `test-${file.id}`,
          severity: "info",
          code: "TEST_FILE_DETECTED",
          message: `${file.path} appears to be a test file`,
        });
      }

      // Detect entrypoints
      if (detectPythonEntrypoint(simulatedContent)) {
        diagnostics.push({
          id: `entry-${file.id}`,
          severity: "info",
          code: "ENTRYPOINT_DETECTED",
          message: `${file.path} has potential entrypoint`,
        });
      }
    }

    diagnostics.push({
      id: "parse-summary",
      severity: "info",
      code: "PARSE_SUMMARY",
      message: `Parsed ${parsedFiles.length} Python files: ${totalSymbols} symbols, ${totalImports} imports`,
    });
  } catch (err) {
    diagnostics.push({
      id: "parse-error",
      severity: "error",
      code: "PARSE_ERROR",
      message: err.message,
    });
  }

  const output = {
    version: PLUGIN_OUTPUT_VERSION,
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