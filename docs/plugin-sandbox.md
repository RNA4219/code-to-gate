# Plugin Sandbox Documentation

This document describes the fail-closed execution policy for code-to-gate plugins.

## Overview

Plugin execution defaults to permission-restricted Process mode. Process mode only accepts plugins whose manifest and entrypoint SHA-256 digests are bound by an execution policy. Docker mode is required for untrusted plugins and never falls back to host execution. The direct `none` mode is an explicit emergency escape hatch and is forbidden in CI and release contexts.

The sandbox enforces:

- **Trust binding**: Process-mode plugins are identified by name, version, manifest digest, and entrypoint digest
- **Resource control**: 60-second runtime, bounded stdout/stderr, finding count, and evidence count
- **Network isolation**: Docker always uses `--network=none`
- **Filesystem restriction**: Docker uses a read-only root; Node Process mode uses the permission model
- **Environment isolation**: Only explicitly allowed variables are passed; `NODE_OPTIONS`, `NODE_PATH`, and `ELECTRON_RUN_AS_NODE` are denied

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    code-to-gate core                         │
│                                                             │
│  ┌──────────────────┐     ┌──────────────────────────────┐ │
│  │  Plugin Runner   │────▶│  Docker Sandbox Runner       │ │
│  │  (sandbox mode)  │     │                              │ │
│  └──────────────────┘     │  - Container lifecycle       │ │
│                           │  - Resource limits            │ │
│                           │  - Security enforcement       │ │
│                           │  - Volume mounting            │ │
│                           └──────────────────────────────┘ │
│                                      │                      │
└──────────────────────────────────────│──────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────┐
│                  Docker Container                            │
│                                                             │
│  ┌────────────────┐  ┌───────────────┐  ┌────────────────┐ │
│  │ /plugin/code   │  │ /plugin/io    │  │ Plugin Process │ │
│  │ (read-only)    │  │ (read-write)  │  │                │ │
│  │                │  │               │  │ - Node.js      │ │
│  │ Plugin source  │  │ Input/output  │  │ - Isolated     │ │
│  │                │  │ JSON files    │  │ - Limited      │ │
│  └────────────────┘  └───────────────┘  └────────────────┘ │
│                                                             │
│  Constraints:                                                │
│  - Memory: configurable (default 512MB)                     │
│  - CPU: configurable (default 0.5 cores)                    │
│  - Network: disabled by default                              │
│  - PIDs: limited to 100                                      │
│  - Security: seccomp, no-new-privileges, cap-drop=ALL       │
└─────────────────────────────────────────────────────────────┘
```

## Configuration

### Sandbox Modes

| Mode | Description |
|------|-------------|
| `process` | Default. Node permission model plus digest-bound execution policy |
| `docker` | Required for untrusted plugins; network-disabled and read-only |
| `none` | Unsafe direct execution; requires `--unsafe-allow-none` and is rejected in CI/release |

### Default Configuration

```typescript
const DEFAULT_SANDBOX_CONFIG = {
  mode: "process",
  timeout: 60,
  memoryLimit: 512,
  cpuLimit: 0.5,
  networkAccess: false,
  dockerImage: "code-to-gate-plugin-runner:latest",
  containerUser: "node",
  strictSecurity: true,
  maxStdoutBytes: 10 * 1024 * 1024,
  maxStderrBytes: 1 * 1024 * 1024,
  maxFindings: 1000,
  maxEvidencePerFinding: 10,
  nodePermissionModel: true,
};
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `timeout` | number | 60 | Maximum execution time in seconds |
| `memoryLimit` | number | 512 | Memory limit in MB |
| `cpuLimit` | number | 0.5 | CPU limit as fraction (0-4) |
| `networkAccess` | boolean | false | Must remain false for Docker execution |
| `dockerImage` | string | "code-to-gate-plugin-runner:latest" | Docker image to use |
| `containerUser` | string | "node" | User to run as in container |
| `strictSecurity` | boolean | true | Required for Docker execution |
| `allowedReadPaths` | string[] | ["${repoRoot}"] | Paths plugin can read |
| `allowedWritePaths` | string[] | ["${workDir}"] | Paths plugin can write |
| `maxFileSizeMB` | number | 10 | Maximum file size for writes |
| `maxStdoutBytes` | number | 10485760 | Hard stdout limit |
| `maxStderrBytes` | number | 1048576 | Hard stderr limit |
| `maxFindings` | number | 1000 | Maximum findings accepted from one plugin |
| `maxEvidencePerFinding` | number | 10 | Maximum evidence references per finding |

## CLI Usage

### Check Sandbox Status

```bash
code-to-gate plugin-sandbox status
```

Output:
```
Docker: AVAILABLE
  Version: Docker version 24.0.7, build afdd53b
  Daemon: Running
Image code-to-gate-plugin-runner:latest: AVAILABLE
Available Memory: 8192 MB

Sandbox Configuration:
  Default Timeout: 60 seconds
  Default Memory Limit: 512 MB
  Default CPU Limit: 0.5
  Network Access: Blocked
  Strict Security: Enabled
```

### Run Plugin in Sandbox

```bash
code-to-gate plugin-sandbox run ./my-plugin \
  --input input.json \
  --sandbox docker \
  --timeout 30 \
  --memory 256
```

Options:
- `--input <file>`: Input JSON file
- `--output <file>`: Output file (default: stdout)
- `--sandbox <mode>`: `process` (default), `docker`, or `none`
- `--execution-policy <file>`: Required for Process mode
- `--unsafe-allow-none`: Required together with `--sandbox none`
- `--timeout <s>`: Execution timeout in seconds, capped at 60
- `--memory <MB>`: Docker memory limit in MB
- `--cpu <fraction>`: Docker CPU limit
- `--verbose`: Show detailed information

Process mode rejects unknown or tampered plugins. The policy schema is
`ctg/plugin-execution-policy/v1`; each trusted plugin entry binds its name,
version, manifest SHA-256, and entrypoint SHA-256. Use Docker for plugins that
cannot be placed on that allowlist. `none` mode is rejected when `CI`,
`GITHUB_ACTIONS`, or `CTG_RELEASE` is set.

### Build Docker Image

```bash
code-to-gate plugin-sandbox build-image
```

Build the minimal Node.js Docker image used for plugin execution.

## Security Features

### Network Isolation

By default, plugins run with `--network=none`, preventing any network access:

```bash
docker run --network=none ...
```

Docker network access cannot be enabled by plugin manifests or CLI input. Unsafe configuration is rejected, and the command builder still emits `--network=none` defensively.

### Docker Unavailable Fallback Policy

If Docker is unavailable, `--sandbox docker` returns a plugin failure and never falls back to Process or `none`. Trusted plugins may be run with Process mode and a valid execution policy. Direct execution requires both `--sandbox none` and `--unsafe-allow-none`, and remains unavailable in CI/release contexts.

### Memory Limits

Memory limits prevent plugins from consuming excessive resources:

```bash
docker run --memory=512m --memory-swap=512m ...
```

- `--memory`: Maximum memory
- `--memory-swap`: Equal to memory (disables swap)

### CPU Limits

CPU limits control processing power:

```bash
docker run --cpu-quota=50000 --cpu-period=100000 ...
```

- `--cpu-quota`: Microseconds per period
- `--cpu-period`: 100ms period

### Security Options

Strict security mode applies:

```bash
docker run \
  --cap-drop=ALL \
  --security-opt seccomp=default \
  --security-opt no-new-privileges=true \
  --pids-limit=100 \
  ...
```

- `--cap-drop=ALL`: Drop all Linux capabilities
- `seccomp=default`: Apply default syscall filtering
- `no-new-privileges=true`: Prevent privilege escalation
- `--pids-limit=100`: Limit number of processes

## Volume Mounting

### Plugin Code Mount

Plugin source code is mounted read-only:

```bash
-v /path/to/plugin:/plugin/code:ro
```

### IO Directory Mount

Input/output files are in a writable directory:

```bash
-v /tmp/ctg-plugin-io:/plugin/io:rw
```

### Repository Access

Allowed read paths from manifest:

```yaml
security:
  filesystem:
    read:
      - "${repoRoot}"
      - "${repoRoot}/src"
```

## Environment Variables

### Passed to Plugin

- `CTG_INPUT_FILE`: Path to input JSON file
- `CTG_OUTPUT_FILE`: Path to output JSON file

### Filtered

Sensitive environment variables are blocked:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `GITHUB_TOKEN`
- `NPM_TOKEN`
- `*_KEY`, `*_SECRET`, `*_PASSWORD`

### Manifest Environment

Manifest environment values are filtered through the execution policy allowlist.
The full host environment is never inherited. Runtime-control variables such as
`NODE_OPTIONS`, `NODE_PATH`, and `ELECTRON_RUN_AS_NODE` cannot be allowed.

## Docker Image

The default Docker image is based on Node.js Alpine:

```dockerfile
FROM node:20-alpine

# Create non-root user
RUN addgroup -S plugin && adduser -S node -G plugin

WORKDIR /plugin/work

# Set permissions
RUN chmod 755 /plugin/work

# Switch to non-root user
USER node

# Default entrypoint reads from stdin, writes to stdout
ENTRYPOINT ["node"]
```

### Custom Image

Build a custom image:

```bash
code-to-gate plugin-sandbox build-image --docker-image my-runner:v1
```

Or use an existing image:

```bash
code-to-gate plugin-sandbox run ./my-plugin \
  --input input.json \
  --sandbox docker \
  --docker-image node:20-alpine
```

## Plugin Execution Flow

1. **Prepare IO Directory**: Create temporary directory for input/output
2. **Write Input**: Save input JSON to `input.json`
3. **Build Docker Command**: Construct docker run command with all options
4. **Execute Container**: Run plugin in isolated container
5. **Read Output**: Parse output JSON from `output.json`
6. **Cleanup**: Remove container and IO directory

## Error Handling

| Error | Code | Description |
|-------|------|-------------|
| Docker not available | `DOCKER_NOT_AVAILABLE` | Docker daemon not running |
| Timeout | `TIMEOUT` | Plugin exceeded timeout |
| Memory exceeded | `CONTAINER_ERROR` | Container killed (exit 137) |
| Invalid output | `INVALID_VERSION` | Output version mismatch |

## Example Plugin

### Plugin Manifest

```yaml
apiVersion: ctg/v1alpha1
kind: rule-plugin
name: my-rule-plugin
version: 1.0.0
visibility: public
entry:
  command: ["node", "index.js"]
  timeout: 30
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
```

### Plugin Code (index.js)

```javascript
const fs = require('fs');

// Read input from stdin or CTG_INPUT_FILE
const inputFile = process.env.CTG_INPUT_FILE || 0;
const input = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));

// Process input
const findings = [];
for (const file of input.repo_graph.files || []) {
  if (file.path.includes('sensitive')) {
    findings.push({
      id: `finding-${file.id}`,
      ruleId: 'SENSITIVE_FILE',
      category: 'security',
      severity: 'medium',
      confidence: 0.8,
      title: 'Sensitive file detected',
      summary: `File ${file.path} may contain sensitive data`,
      evidence: [{
        id: `evidence-${file.id}`,
        path: file.path,
        kind: 'text',
      }],
    });
  }
}

// Write output to stdout or CTG_OUTPUT_FILE
const output = {
  version: 'ctg.plugin-output/v1',
  findings,
};

if (process.env.CTG_OUTPUT_FILE) {
  fs.writeFileSync(process.env.CTG_OUTPUT_FILE, JSON.stringify(output));
} else {
  console.log(JSON.stringify(output));
}
```

## Troubleshooting

### Docker Not Available

```
Error: Docker is not available
```

Solution:
1. Install Docker: https://docs.docker.com/get-docker/
2. Start Docker daemon: `dockerd` or via Docker Desktop
3. Verify: `docker info`

### Image Not Found

```
Error: Docker image code-to-gate-plugin-runner:latest not ready
```

Solution:
```bash
code-to-gate plugin-sandbox build-image
```

### Permission Denied

```
Error: Permission denied accessing file
```

Solution:
- Check `allowedReadPaths` in manifest
- Ensure paths use correct placeholders (`${repoRoot}`)
- Verify container user has read permissions

### Timeout Issues

```
Error: Plugin execution timed out
```

Solution:
- Keep the manifest and CLI timeout at or below the hard 60-second cap
- Split large plugin work into bounded operations
- Optimize plugin code for faster execution

### Memory Issues

```
Error: Container killed (exit 137)
```

Solution:
- Increase memory limit: `--memory 1024`
- Optimize plugin to use less memory
- Check for memory leaks in plugin code

## Best Practices

1. **Use Docker for untrusted plugins**: Unknown code must not enter Process mode
2. **Review digest changes**: Manifest or entrypoint hash changes require an explicit policy update
3. **Keep hard caps**: Do not raise the 60-second, output, finding, or evidence limits
4. **Keep Docker offline**: Plugins must not depend on network access
5. **Treat `none` as break-glass only**: It is unavailable in CI/release and requires explicit acknowledgement
6. **Handle partial results**: Limit violations produce partial or failed execution, never silent success
7. **Rotate plugin trust deliberately**: Review name, version, and both digests together

## API Reference

### createDockerSandboxRunner

```typescript
import { createDockerSandboxRunner } from '@quality-harness/code-to-gate/plugin';

const runner = createDockerSandboxRunner({
  timeout: 60,
  memoryLimit: 512,
});
```

### DockerSandboxRunner

```typescript
class DockerSandboxRunner implements PluginRunner {
  async initialize(config: Partial<SandboxConfig>): Promise<void>;
  async executePlugin(entry: PluginRegistryEntry, input: PluginInput): Promise<PluginExecutionResult>;
  async executePlugins(entries: PluginRegistryEntry[], input: PluginInput): Promise<PluginExecutionResult[]>;
  async healthCheck(entry: PluginRegistryEntry): Promise<{ healthy: boolean; issues?: string[] }>;
  async shutdown(): Promise<void>;
  setTimeout(pluginName: string, timeoutMs: number): void;
}
```

### SandboxConfig

```typescript
interface SandboxConfig {
  mode: SandboxMode;
  timeout: number;
  memoryLimit: number;
  cpuLimit: number;
  networkAccess: boolean;
  allowedReadPaths: string[];
  allowedWritePaths: string[];
  dockerImage: string;
  containerUser: string;
  strictSecurity: boolean;
  maxStdoutBytes: number;
  maxStderrBytes: number;
  maxFindings: number;
  maxEvidencePerFinding: number;
  nodePermissionModel: boolean;
}
```

## Related Documentation

- [Plugin Security Contract](./plugin-security-contract.md)
- [Plugin Development Guide](./plugin-development.md)
- [Plugin Examples](./plugin-examples.md)
