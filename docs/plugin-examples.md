# Plugin Examples

This document provides complete examples for each plugin type.

## Example 1: Custom Rule Plugin

This example demonstrates a rule plugin that detects hardcoded API keys.

### Directory Structure

```
plugins/example-custom-rule/
  plugin-manifest.yaml
  src/
    index.ts
    rules/
      hardcoded-api-key.ts
  dist/
    index.js
  package.json
```

### plugin-manifest.yaml

```yaml
apiVersion: ctg/v1alpha1
kind: rule-plugin
name: example-custom-rule
version: 0.1.0
visibility: public
description: Example custom rule plugin for detecting hardcoded API keys

entry:
  command: ["node", "./dist/index.js"]
  timeout: 30
  retry: 1

capabilities:
  - evaluate

receives:
  - normalized-repo-graph@v1

returns:
  - findings@v1

security:
  network: false
  filesystem:
    read:
      - "${repoRoot}"
    write:
      - "${workDir}/plugin-output"

metadata:
  author: "code-to-gate team"
  license: "MIT"
```

### src/index.ts

```typescript
import type { PluginInput, PluginOutput, PluginFinding, PluginEvidenceRef } from '@quality-harness/code-to-gate/plugin';
import type { RepoFile, NormalizedRepoGraph } from '@quality-harness/code-to-gate';

interface CustomRuleInput extends PluginInput {
  repo_graph: NormalizedRepoGraph;
}

/**
 * Generate UUID for findings
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Calculate SHA-256 hash for excerpt
 */
async function calculateHash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Rule: HARDCODED_API_KEY
 * Detects hardcoded API keys in source code
 */
function detectHardcodedApiKey(file: RepoFile, content: string): PluginFinding | null {
  // Patterns for detecting API keys
  const patterns = [
    /api[_-]?key\s*[=:]\s*['""][a-zA-Z0-9]{20,}['"]/gi,
    /apikey\s*[=:]\s*['""][a-zA-Z0-9]{20,}['"]/gi,
    /secret[_-]?key\s*[=:]\s*['""][a-zA-Z0-9]{20,}['"]/gi,
    /access[_-]?key\s*[=:]\s*['""][a-zA-Z0-9]{20,}['"]/gi,
  ];

  const matches: Array<{ line: number; match: string }> = [];

  const lines = content.split('\n');
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

  const evidence: PluginEvidenceRef[] = matches.map((m, idx) => ({
    id: `${file.id}-e${idx}`,
    path: file.path,
    startLine: m.line,
    endLine: m.line,
    kind: 'text',
    excerptHash: '', // Would be calculated in production
  }));

  return {
    id: generateUUID(),
    ruleId: 'HARDCODED_API_KEY',
    category: 'security',
    severity: 'high',
    confidence: 0.85,
    title: 'Hardcoded API Key Detected',
    summary: `Found ${matches.length} potential hardcoded API key(s) in ${file.path}`,
    evidence,
    tags: ['security', 'credentials', 'api-key'],
  };
}

/**
 * Main plugin entry point
 */
async function main(): Promise<void> {
  // Read input from stdin
  const inputJson = await readStdin();
  const input: CustomRuleInput = JSON.parse(inputJson);

  const findings: PluginFinding[] = [];
  const diagnostics: PluginOutput['diagnostics'] = [];

  try {
    const repoGraph = input.repo_graph;

    // Process each file
    for (const file of repoGraph.files) {
      // Skip test files and generated files
      if (file.role === 'test' || file.role === 'generated') {
        continue;
      }

      // Skip non-source files
      if (file.role !== 'source') {
        continue;
      }

      // Read file content (in production, would use provided content or fs)
      // For this example, we simulate detection
      const finding = detectHardcodedApiKey(file, 'simulated content');
      if (finding) {
        findings.push(finding);
      }
    }

    diagnostics.push({
      id: 'scan-complete',
      severity: 'info',
      code: 'SCAN_COMPLETE',
      message: `Scanned ${repoGraph.files.length} files`,
    });

  } catch (err) {
    const error = err as Error;
    diagnostics.push({
      id: 'error',
      severity: 'error',
      code: 'PROCESSING_ERROR',
      message: error.message,
    });
  }

  // Write output to stdout
  const output: PluginOutput = {
    version: 'ctg.plugin-output/v1',
    findings,
    diagnostics,
  };

  process.stdout.write(JSON.stringify(output));
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.on('data', chunk => data += chunk);
    process.stdin.on('end', () => resolve(data));
  });
}

main().catch(err => {
  process.stdout.write(JSON.stringify({
    version: 'ctg.plugin-output/v1',
    errors: [{ code: 'INTERNAL_ERROR', message: (err as Error).message }],
  }));
  process.exit(10);
});
```

---

## Example 2: Python Language Adapter Plugin

This example demonstrates a language plugin that provides Python parsing capabilities.

### Directory Structure

```
plugins/example-language-python/
  plugin-manifest.yaml
  src/
    index.ts
    python-parser.ts
  dist/
    index.js
  package.json
```

### plugin-manifest.yaml

```yaml
apiVersion: ctg/v1alpha1
kind: language-plugin
name: example-language-python
version: 0.1.0
visibility: public
description: Python language adapter plugin for code-to-gate

entry:
  command: ["node", "./dist/index.js"]
  timeout: 60

capabilities:
  - parse

receives:
  - normalized-repo-graph@v1

returns:
  - findings@v1

security:
  network: false

metadata:
  author: "code-to-gate team"
  license: "MIT"
```

### src/index.ts

```typescript
import type { PluginInput, PluginOutput, PluginDiagnostic } from '@quality-harness/code-to-gate/plugin';
import type { RepoFile, SymbolNode, GraphRelation } from '@quality-harness/code-to-gate';

interface PythonParseResult {
  status: 'parsed' | 'text_fallback' | 'failed';
  symbols: SymbolNode[];
  relations: GraphRelation[];
  imports: string[];
  exports: string[];
}

/**
 * Parse Python file for symbols and relations
 */
function parsePythonFile(file: RepoFile, content: string): PythonParseResult {
  const symbols: SymbolNode[] = [];
  const relations: GraphRelation[] = [];
  const imports: string[] = [];
  const exports: string[] = [];

  try {
    const lines = content.split('\n');
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
          kind: 'function',
          exported: false, // Python doesn't have explicit exports
          evidence: [{
            id: `${file.id}-e${lineNum}`,
            path: file.path,
            startLine: lineNum,
            kind: 'text',
          }],
        });
      }

      // Detect class definitions
      const classMatch = /^class\s+(\w+)/.exec(line);
      if (classMatch) {
        symbols.push({
          id: `${file.id}-class-${classMatch[1]}`,
          fileId: file.id,
          name: classMatch[1],
          kind: 'class',
          exported: false,
          evidence: [{
            id: `${file.id}-e${lineNum}`,
            path: file.path,
            startLine: lineNum,
            kind: 'text',
          }],
        });
      }

      // Detect imports
      const importMatch = /^import\s+(\w+)/.exec(line) ||
                          /^from\s+(\w+)\s+import/.exec(line);
      if (importMatch) {
        imports.push(importMatch[1]);
      }
    }

    return {
      status: 'text_fallback',
      symbols,
      relations,
      imports,
      exports,
    };

  } catch (err) {
    return {
      status: 'failed',
      symbols: [],
      relations: [],
      imports: [],
      exports: [],
    };
  }
}

/**
 * Detect Python-specific test patterns
 */
function detectPythonTest(file: RepoFile, content: string): boolean {
  const testPatterns = [
    /^import\s+unittest/,
    /^import\s+pytest/,
    /^from\s+unittest\s+import/,
    /^from\s+pytest\s+import/,
    /class\s+.*Test.*:/,
    /^def\s+test_/,
  ];

  for (const pattern of testPatterns) {
    if (pattern.test(content)) {
      return true;
    }
  }

  return false;
}

/**
 * Main plugin entry point
 */
async function main(): Promise<void> {
  const inputJson = await readStdin();
  const input: PluginInput = JSON.parse(inputJson);

  const diagnostics: PluginDiagnostic[] = [];
  const parsedFiles: Array<{ path: string; result: PythonParseResult }> = [];

  try {
    const repoGraph = input.repo_graph as any;

    for (const file of repoGraph.files || []) {
      // Only process Python files
      if (file.language !== 'py') {
        continue;
      }

      // Simulate parsing (in production, would read actual content)
      const result = parsePythonFile(file, 'def test_example(): pass');
      parsedFiles.push({ path: file.path, result });

      diagnostics.push({
        id: `parse-${file.id}`,
        severity: 'info',
        code: 'PARSE_SUCCESS',
        message: `Parsed ${file.path}: found ${result.symbols.length} symbols`,
      });
    }

  } catch (err) {
    diagnostics.push({
      id: 'parse-error',
      severity: 'error',
      code: 'PARSE_ERROR',
      message: (err as Error).message,
    });
  }

  const output: PluginOutput = {
    version: 'ctg.plugin-output/v1',
    diagnostics,
  };

  process.stdout.write(JSON.stringify(output));
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.on('data', chunk => data += chunk);
    process.stdin.on('end', () => resolve(data));
  });
}

main().catch(err => {
  process.stdout.write(JSON.stringify({
    version: 'ctg.plugin-output/v1',
    errors: [{ code: 'INTERNAL_ERROR', message: (err as Error).message }],
  }));
  process.exit(10);
});
```

---

## Example 3: Importer Plugin

This example demonstrates an importer plugin for Bandit (Python security scanner).

### plugin-manifest.yaml

```yaml
apiVersion: ctg/v1alpha1
kind: importer-plugin
name: bandit-importer
version: 0.1.0
visibility: public
description: Import Bandit security scanner results

entry:
  command: ["node", "./dist/index.js"]
  timeout: 30

capabilities:
  - import

receives:
  - normalized-repo-graph@v1

returns:
  - findings@v1

metadata:
  author: "code-to-gate team"
```

### src/index.ts

```typescript
import type { PluginInput, PluginOutput, PluginFinding } from '@quality-harness/code-to-gate/plugin';

interface BanditResult {
  results: Array<{
    test_id: string;
    issue_text: string;
    issue_severity: 'LOW' | 'MEDIUM' | 'HIGH';
    issue_confidence: 'LOW' | 'MEDIUM' | 'HIGH';
    file: string;
    line_number: number;
    col_offset: number;
  }>;
}

/**
 * Map Bandit severity to code-to-gate severity
 */
function mapSeverity(severity: 'LOW' | 'MEDIUM' | 'HIGH'): 'low' | 'medium' | 'high' | 'critical' {
  switch (severity) {
    case 'HIGH': return 'high';
    case 'MEDIUM': return 'medium';
    case 'LOW': return 'low';
    default: return 'low';
  }
}

/**
 * Map Bandit confidence to numeric confidence
 */
function mapConfidence(confidence: 'LOW' | 'MEDIUM' | 'HIGH'): number {
  switch (confidence) {
    case 'HIGH': return 0.9;
    case 'MEDIUM': return 0.7;
    case 'LOW': return 0.5;
    default: return 0.5;
  }
}

/**
 * Convert Bandit result to code-to-gate finding
 */
function convertBanditResult(result: BanditResult): PluginFinding[] {
  return result.results.map((issue, idx) => ({
    id: `bandit-${issue.test_id}-${idx}`,
    ruleId: `BANDIT_${issue.test_id}`,
    category: 'security',
    severity: mapSeverity(issue.issue_severity),
    confidence: mapConfidence(issue.issue_confidence),
    title: issue.issue_text,
    summary: `Bandit detected: ${issue.issue_text}`,
    evidence: [{
      id: `bandit-e-${idx}`,
      path: issue.file,
      startLine: issue.line_number,
      kind: 'external',
      externalRef: {
        tool: 'bandit',
        ruleId: issue.test_id,
      },
    }],
    tags: ['security', 'bandit', 'python'],
    upstream: {
      tool: 'bandit',
      ruleId: issue.test_id,
    },
  }));
}

async function main(): Promise<void> {
  const inputJson = await readStdin();
  const input: PluginInput = JSON.parse(inputJson);

  // In production, input.imported_findings would contain Bandit JSON output
  // For this example, we simulate conversion
  const simulatedBandit: BanditResult = {
    results: [],
  };

  const findings = convertBanditResult(simulatedBandit);

  const output: PluginOutput = {
    version: 'ctg.plugin-output/v1',
    findings,
    diagnostics: [{
      id: 'import-complete',
      severity: 'info',
      code: 'IMPORT_COMPLETE',
      message: 'Imported Bandit results successfully',
    }],
  };

  process.stdout.write(JSON.stringify(output));
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.on('data', chunk => data += chunk);
    process.stdin.on('end', () => resolve(data));
  });
}

main();
```

---

## Example 4: Reporter Plugin

This example demonstrates a reporter plugin that generates HTML reports.

### plugin-manifest.yaml

```yaml
apiVersion: ctg/v1alpha1
kind: reporter-plugin
name: html-reporter
version: 0.1.0
visibility: public
description: Generate HTML reports from findings

entry:
  command: ["node", "./dist/index.js"]
  timeout: 30

capabilities:
  - report

receives:
  - findings@v1
  - risk-register@v1

returns:
  - diagnostics@v1

metadata:
  author: "code-to-gate team"
```

### src/index.ts

```typescript
import type { PluginInput, PluginOutput, PluginDiagnostic } from '@quality-harness/code-to-gate/plugin';

/**
 * Generate HTML report content
 */
function generateHtmlReport(findings: any[], risks: any[]): string {
  const findingsHtml = findings.map(f => `
    <div class="finding severity-${f.severity}">
      <h3>${f.ruleId}: ${f.title}</h3>
      <p>${f.summary}</p>
      <div class="evidence">
        ${f.evidence.map(e => `<span>${e.path}:${e.startLine || 'N/A'}</span>`).join(', ')}
      </div>
    </div>
  `).join('\n');

  return `
<!DOCTYPE html>
<html>
<head>
  <title>code-to-gate Report</title>
  <style>
    .finding { margin: 10px 0; padding: 10px; border: 1px solid #ccc; }
    .severity-critical { background: #ffcccc; }
    .severity-high { background: #fff0f0; }
    .severity-medium { background: #ffffcc; }
    .severity-low { background: #f0fff0; }
  </style>
</head>
<body>
  <h1>code-to-gate Analysis Report</h1>
  <h2>Findings (${findings.length})</h2>
  ${findingsHtml}
  <h2>Risks (${risks.length})</h2>
  <p>Risk analysis results...</p>
</body>
</html>
`;
}

async function main(): Promise<void> {
  const inputJson = await readStdin();
  const input: PluginInput = JSON.parse(inputJson);

  const findings = (input.repo_graph as any)?.findings || [];
  const risks = (input.repo_graph as any)?.risks || [];

  const htmlReport = generateHtmlReport(findings, risks);

  // In production, would write to work directory
  // For this example, we just generate diagnostics

  const diagnostics: PluginDiagnostic[] = [{
    id: 'report-generated',
    severity: 'info',
    code: 'REPORT_GENERATED',
    message: `Generated HTML report with ${findings.length} findings and ${risks.length} risks`,
  }];

  const output: PluginOutput = {
    version: 'ctg.plugin-output/v1',
    diagnostics,
  };

  process.stdout.write(JSON.stringify(output));
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.on('data', chunk => data += chunk);
    process.stdin.on('end', () => resolve(data));
  });
}

main();
```

---

## Testing Examples

### Test Input JSON

```json
{
  "version": "ctg.plugin-input/v1",
  "repo_graph": {
    "version": "ctg/v1alpha1",
    "generated_at": "2026-04-30T00:00:00Z",
    "run_id": "test-run",
    "repo": { "root": "/test/repo" },
    "artifact": "normalized-repo-graph",
    "schema": "normalized-repo-graph@v1",
    "files": [
      {
        "id": "f1",
        "path": "src/api.ts",
        "language": "ts",
        "role": "source",
        "hash": "abc123",
        "sizeBytes": 1000,
        "lineCount": 50,
        "parser": { "status": "parsed", "adapter": "ts-ast" }
      },
      {
        "id": "f2",
        "path": "src/secrets.py",
        "language": "py",
        "role": "source",
        "hash": "def456",
        "sizeBytes": 500,
        "lineCount": 20,
        "parser": { "status": "text_fallback" }
      }
    ],
    "symbols": [],
    "relations": [],
    "tests": [],
    "configs": [],
    "entrypoints": [],
    "diagnostics": [],
    "stats": { "partial": false }
  },
  "metadata": {
    "run_id": "test-run-001",
    "repo_root": "/test/repo",
    "work_dir": "/test/work"
  }
}
```

### Expected Output JSON

```json
{
  "version": "ctg.plugin-output/v1",
  "findings": [
    {
      "id": "finding-001",
      "ruleId": "HARDCODED_API_KEY",
      "category": "security",
      "severity": "high",
      "confidence": 0.85,
      "title": "Hardcoded API Key Detected",
      "summary": "Found potential hardcoded API key in secrets.py",
      "evidence": [
        {
          "id": "e1",
          "path": "src/secrets.py",
          "startLine": 5,
          "kind": "text"
        }
      ],
      "tags": ["security", "credentials"]
    }
  ],
  "diagnostics": [
    {
      "id": "d1",
      "severity": "info",
      "code": "SCAN_COMPLETE",
      "message": "Scanned 2 files"
    }
  ]
}
```