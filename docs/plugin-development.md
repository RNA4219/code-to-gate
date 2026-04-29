# Plugin Development Guide

This document provides a comprehensive guide for developing plugins for code-to-gate.

## Overview

code-to-gate supports a plugin architecture that allows developers to extend the core functionality with custom rules, language adapters, importers, reporters, and exporters.

## Plugin Types

| Kind | Description | Capabilities |
|---|---|---|
| `rule-plugin` | Custom rule evaluation | `evaluate` |
| `language-plugin` | Language parsing adapter | `parse` |
| `importer-plugin` | External tool import | `import` |
| `reporter-plugin` | Custom reporting format | `report` |
| `exporter-plugin` | Downstream export adapter | `export` |

## Plugin Manifest

Every plugin requires a manifest file (`plugin-manifest.yaml` or `plugin-manifest.json`) that defines the plugin's metadata, entry point, and capabilities.

### Manifest Structure

```yaml
apiVersion: ctg/v1alpha1
kind: rule-plugin
name: my-custom-rules
version: 1.0.0
visibility: public  # or 'private'
description: Custom security rules for my project

entry:
  command: ["node", "./dist/index.js"]
  timeout: 60  # seconds
  retry: 1     # retry count on failure
  env:
    DEBUG: "false"

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
  secrets:
    allow: []

dependencies:
  - name: "@code-to-gate/core-rules"
    version: "^0.1.0"
    optional: false

metadata:
  author: "Your Name"
  homepage: "https://github.com/your-org/my-plugin"
  license: "MIT"
```

### Required Fields

| Field | Type | Description |
|---|---|---|
| `apiVersion` | string | Must be `ctg/v1alpha1` |
| `kind` | string | Plugin type |
| `name` | string | Unique identifier (lowercase alphanumeric with hyphens) |
| `version` | string | Semver version (e.g., `1.0.0`) |
| `visibility` | string | `public` or `private` |
| `entry.command` | array | Command to execute plugin |
| `capabilities` | array | Plugin capabilities |
| `receives` | array | Input schemas |
| `returns` | array | Output schemas |

### Optional Fields

| Field | Type | Description |
|---|---|---|
| `description` | string | Plugin description |
| `entry.timeout` | number | Timeout in seconds (default: 60, max: 300) |
| `entry.retry` | number | Retry count (default: 1, max: 5) |
| `entry.env` | object | Environment variables |
| `security` | object | Security configuration |
| `dependencies` | array | Plugin dependencies |
| `metadata` | object | Additional metadata |

## Communication Protocol

Plugins communicate with code-to-gate via stdin/stdout JSON.

### Input Format (stdin)

```json
{
  "version": "ctg.plugin-input/v1",
  "repo_graph": {
    "version": "ctg/v1alpha1",
    "files": [...],
    "symbols": [...],
    "relations": [...]
  },
  "imported_findings": {
    "findings": [...]
  },
  "config": {
    "custom": true
  },
  "policy": {
    "blocking": {...}
  },
  "metadata": {
    "run_id": "run-123",
    "repo_root": "/path/to/repo",
    "work_dir": "/path/to/work"
  }
}
```

### Output Format (stdout)

```json
{
  "version": "ctg.plugin-output/v1",
  "findings": [
    {
      "id": "uuid",
      "ruleId": "MY_CUSTOM_RULE",
      "category": "security",
      "severity": "high",
      "confidence": 0.85,
      "title": "Security Issue Detected",
      "summary": "Description of the issue",
      "evidence": [
        {
          "id": "e1",
          "path": "src/file.ts",
          "startLine": 10,
          "endLine": 15,
          "kind": "ast"
        }
      ],
      "tags": ["security", "custom"]
    }
  ],
  "risk_seeds": [...],
  "invariant_seeds": [...],
  "test_seeds": [...],
  "diagnostics": [
    {
      "id": "d1",
      "severity": "info",
      "code": "INFO_CODE",
      "message": "Information message"
    }
  ],
  "errors": [
    {
      "code": "ERROR_CODE",
      "message": "Error description",
      "details": {...}
    }
  ]
}
```

## Finding Structure

Each finding must include:

| Field | Type | Required | Description |
|---|---|:---:|---|
| `id` | string (UUID) | Yes | Unique identifier |
| `ruleId` | string | Yes | Rule identifier (e.g., `MY_RULE`) |
| `category` | string | Yes | Category (auth, payment, validation, data, config, maintainability, testing, compatibility, release-risk, security) |
| `severity` | string | Yes | Severity (low, medium, high, critical) |
| `confidence` | number | Yes | Confidence level (0.0-1.0) |
| `title` | string | Yes | Short title |
| `summary` | string | Yes | Detailed description |
| `evidence` | array | Yes | Evidence references |
| `affectedSymbols` | array | No | Affected symbol IDs |
| `affectedEntrypoints` | array | No | Affected entrypoint IDs |
| `tags` | array | No | Tags for categorization |
| `upstream` | object | No | External tool reference |

## Evidence Reference

Evidence must include:

| Field | Type | Required | Description |
|---|---|:---:|---|
| `id` | string | Yes | Evidence ID |
| `path` | string | Yes | File path |
| `startLine` | number | No | Start line number |
| `endLine` | number | No | End line number |
| `kind` | string | Yes | Kind (ast, text, import, external, test) |
| `excerptHash` | string | No | SHA-256 hash of excerpt |
| `nodeId` | string | No | AST node ID |
| `symbolId` | string | No | Symbol ID |

## Plugin Implementation

### Node.js Example

```javascript
// dist/index.js
const fs = require('fs');

// Read input from stdin
const inputJson = fs.readFileSync(0, 'utf-8');
const input = JSON.parse(inputJson);

// Process repo graph
const findings = [];

for (const file of input.repo_graph.files) {
  if (file.path.includes('dangerous-pattern')) {
    findings.push({
      id: generateUUID(),
      ruleId: 'DANGEROUS_PATTERN',
      category: 'security',
      severity: 'high',
      confidence: 0.9,
      title: 'Dangerous pattern detected',
      summary: 'File contains potentially dangerous pattern',
      evidence: [{
        id: 'e1',
        path: file.path,
        kind: 'text'
      }],
      tags: ['security']
    });
  }
}

// Write output to stdout
const output = {
  version: 'ctg.plugin-output/v1',
  findings,
  diagnostics: [{
    id: 'd1',
    severity: 'info',
    code: 'SCAN_COMPLETE',
    message: 'Scanned all files'
  }]
};

console.log(JSON.stringify(output));
```

### TypeScript Example

```typescript
// src/index.ts
import type { PluginInput, PluginOutput, PluginFinding } from '@quality-harness/code-to-gate/plugin';

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

async function main(): Promise<void> {
  // Read input from stdin
  const inputJson = await readStdin();
  const input: PluginInput = JSON.parse(inputJson);

  const findings: PluginFinding[] = [];

  // Implement your rule logic here
  for (const file of (input.repo_graph as any).files || []) {
    // Custom rule evaluation
  }

  // Write output to stdout
  const output: PluginOutput = {
    version: 'ctg.plugin-output/v1',
    findings,
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
  console.error(JSON.stringify({
    version: 'ctg.plugin-output/v1',
    errors: [{ code: 'INTERNAL_ERROR', message: err.message }]
  }));
  process.exit(10);
});
```

## Security Considerations

### Prohibited Operations

- Writing to OSS core repository files
- Reading files outside allowed paths
- Including secrets/tokens in output artifacts
- Network access by default
- Modifying suppression settings
- Changing release readiness status

### Allowed Operations

- Reading `NormalizedRepoGraph`
- Reading configured external results
- Returning findings/risk-seeds/invariant-seeds
- Writing to plugin work directory
- Reading manifest-allowed repo paths

## Error Handling

### Exit Codes

| Code | Meaning |
|---:|---|
| 0 | Success |
| 6 | Plugin failure |
| 7 | Schema validation failure |
| 62 | Timeout |
| 10 | Internal error |

### Failure Handling

| Failure | Handling |
|---|---|
| Manifest invalid | Plugin not loaded, exit code 6 |
| Process spawn failed | Retry once, then `PLUGIN_FAILED` |
| Timeout | Retry once, then `PLUGIN_FAILED` |
| Output schema invalid | Invalid output isolated, exit code 7 |
| Secret leak detected | Output rejected, `needs_review` |

## Testing Your Plugin

### Local Testing

```bash
# Create test input
echo '{"version":"ctg.plugin-input/v1","repo_graph":{"files":[]}}' > test-input.json

# Run your plugin
node ./dist/index.js < test-input.json

# Validate output
cat output.json | jq '.version' # Should be "ctg.plugin-output/v1"
```

### Using Plugin Doctor

```bash
code-to-gate plugin doctor ./my-plugin

code-to-gate plugin validate ./my-plugin
```

### Integration Testing

```bash
code-to-gate analyze ./test-repo --plugin ./my-plugin
```

## Plugin Configuration

Plugins can receive configuration from the main config file:

```yaml
# ctg.config.yaml
plugins:
  - name: "./plugins/my-custom-rule"
    enabled: true
    config:
      custom_threshold: 0.8
```

Configuration is passed in the input JSON under `config`.

## Publishing Plugins

### Public Plugins

1. Create a GitHub repository
2. Add proper documentation
3. Publish to npm (optional)
4. Submit to code-to-gate plugin registry

### Private Plugins

1. Place in local directory
2. Use `visibility: private` in manifest
3. Reference via `file:` prefix in config:

```yaml
plugins:
  - name: "file:../private-rules"
    enabled: true
    visibility: private
```

## Best Practices

1. **Keep output small**: Limit findings to 1000 per plugin
2. **Evidence is required**: Every finding must have at least one evidence
3. **Confidence matters**: Use realistic confidence values
4. **Handle errors gracefully**: Return errors in output, not as exit codes
5. **Don't leak secrets**: Never include credentials in output
6. **Follow naming conventions**: Use uppercase snake_case for rule IDs
7. **Document rules**: Include clear titles and summaries

## API Reference

See `docs/plugin-examples.md` for complete examples of each plugin type.