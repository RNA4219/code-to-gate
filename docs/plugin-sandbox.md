# Plugin Sandbox Documentation

This document describes the Docker-based sandbox execution environment for code-to-gate plugins.

## Overview

The plugin sandbox provides isolated execution for plugins using Docker containers. This ensures:

- **Security**: Plugins run in isolated containers with limited resources
- **Resource Control**: Memory, CPU, and timeout limits are enforced
- **Network Isolation**: Plugins have no network access by default
- **Filesystem Restriction**: Plugins can only access specified paths

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
| `none` | Direct process execution (no isolation) |
| `docker` | Execute plugins in isolated Docker containers |

### Default Configuration

```typescript
const DEFAULT_SANDBOX_CONFIG = {
  mode: "none",
  timeout: 60,            // seconds
  memoryLimit: 512,       // MB
  cpuLimit: 0.5,          // fraction of CPU
  networkAccess: false,   // blocked by default
  dockerImage: "code-to-gate-plugin-runner:latest",
  containerUser: "node",
  strictSecurity: true,
};
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `timeout` | number | 60 | Maximum execution time in seconds |
| `memoryLimit` | number | 512 | Memory limit in MB |
| `cpuLimit` | number | 0.5 | CPU limit as fraction (0-4) |
| `networkAccess` | boolean | false | Allow network access |
| `dockerImage` | string | "code-to-gate-plugin-runner:latest" | Docker image to use |
| `containerUser` | string | "node" | User to run as in container |
| `strictSecurity` | boolean | true | Enable strict security (seccomp, no-new-privileges) |
| `allowedReadPaths` | string[] | ["${repoRoot}"] | Paths plugin can read |
| `allowedWritePaths` | string[] | ["${workDir}"] | Paths plugin can write |
| `maxFileSizeMB` | number | 10 | Maximum file size for writes |

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
- `--sandbox <mode>`: Sandbox mode (none, docker)
- `--timeout <s>`: Execution timeout in seconds
- `--memory <MB>`: Memory limit in MB
- `--cpu <fraction>`: CPU limit
- `--verbose`: Show detailed information

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

To allow network access (requires manifest declaration):

```yaml
security:
  network: true
```

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

Custom environment from manifest:

```yaml
entry:
  env:
    CUSTOM_VAR: "value"
```

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
- Increase timeout in manifest: `entry.timeout: 120`
- Use CLI option: `--timeout 120`
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

1. **Always use sandbox mode for production**: Prevent plugins from affecting host system
2. **Set appropriate timeouts**: Balance between allowing completion and preventing hangs
3. **Limit memory based on plugin needs**: Lower limits for simple plugins, higher for complex analysis
4. **Declare security requirements**: Use manifest `security` section for explicit permissions
5. **Test in sandbox before deployment**: Verify plugin works correctly in isolated environment
6. **Handle errors gracefully**: Plugins should write meaningful error messages to output
7. **Avoid network dependencies**: Design plugins to work without network access when possible

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
}
```

## Related Documentation

- [Plugin Security Contract](./plugin-security-contract.md)
- [Plugin Development Guide](./plugin-development.md)
- [Plugin Examples](./plugin-examples.md)