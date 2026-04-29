# Local LLM Setup Guide

This guide explains how to set up and configure local LLM providers for code-to-gate Phase 2.

## Overview

code-to-gate supports the following local LLM providers:

- **Ollama** - Default port: 11434
- **llama.cpp** - Default port: 8080
- **Deterministic fallback** - Always available, no external server needed

All providers communicate **only with localhost** (127.0.0.1) for security reasons.

## Quick Start

### Option 1: Ollama (Recommended)

1. Install Ollama:
   ```bash
   # macOS/Linux
   curl -fsSL https://ollama.com/install.sh | sh
   
   # Windows
   # Download from https://ollama.com/download
   ```

2. Pull a model:
   ```bash
   ollama pull llama3.2
   ```

3. Start the server (if not running):
   ```bash
   ollama serve
   ```

4. Verify health:
   ```bash
   ./scripts/ollama-health-check.sh
   ```

### Option 2: llama.cpp

1. Clone and build llama.cpp:
   ```bash
   git clone https://github.com/ggerganov/llama.cpp
   cd llama.cpp
   make
   ```

2. Download a GGUF model:
   ```bash
   # Example: Llama 3.2
   wget https://huggingface.co/meta-llama/Llama-3.2-3B-Instruct-GGUF/resolve/main/llama-3.2-3b-instruct-q4_k_m.gguf
   ```

3. Start the server:
   ```bash
   ./llama-server -m llama-3.2-3b-instruct-q4_k_m.gguf --port 8080
   ```

4. Verify health:
   ```bash
   curl http://127.0.0.1:8080/health
   ```

## CLI Usage

### Basic Analysis

```bash
# Use default provider (auto-detect)
code-to-gate analyze ./my-repo --out ./output

# Explicitly specify Ollama
code-to-gate analyze ./my-repo --out ./output --llm-provider ollama

# Explicitly specify llama.cpp
code-to-gate analyze ./my-repo --out ./output --llm-provider llamacpp

# Use deterministic fallback (no LLM needed)
code-to-gate analyze ./my-repo --out ./output --llm-provider deterministic
```

### Health Check Mode

```bash
# Check Ollama health
code-to-gate llm-health --provider ollama

# Check llama.cpp health
code-to-gate llm-health --provider llamacpp

# Check all providers
code-to-gate llm-health --all
```

### Local-Only Mode

Enforce local-only LLM usage:

```bash
code-to-gate analyze ./my-repo --out ./output --llm-mode local-only
```

This ensures no external API calls are made.

## Configuration

### Provider Options

| Option | Description | Default |
|--------|-------------|---------|
| `--llm-provider` | Provider type (ollama, llamacpp, deterministic) | auto-detect |
| `--llm-mode` | Mode (local-only, allow-cloud) | local-only |
| `--llm-model` | Model name | llama3.2 (ollama), local-model (llamacpp) |
| `--llm-port` | Custom port | 11434 (ollama), 8080 (llamacpp) |
| `--llm-timeout` | Request timeout (ms) | 30000 |

### Environment Variables

```bash
# Set default provider
export CTG_LLM_PROVIDER=ollama

# Set default model
export CTG_LLM_MODEL=llama3.2

# Set base URL
export CTG_LLM_BASE_URL=http://127.0.0.1:11434

# Set timeout
export CTG_LLM_TIMEOUT=60000
```

## Security Requirements

### Localhost-Only Enforcement

All LLM providers are restricted to localhost addresses:

- `127.0.0.1`
- `localhost`
- `::1` (IPv6 localhost)
- `0.0.0.0` (all interfaces, for Docker/VM scenarios)

**Attempting to connect to non-localhost addresses will result in an error.**

This restriction prevents:
- API key exposure to external services
- Data leakage to third-party servers
- Compliance violations in regulated environments

## Graceful Fallback

When the specified LLM provider is unavailable, code-to-gate automatically falls back to the deterministic provider:

1. **Health check before analysis** - Provider availability is checked first
2. **Automatic fallback** - If provider fails, deterministic analysis is used
3. **Clear reporting** - Output indicates whether LLM or fallback was used

## Model Recommendations

### For Code Analysis

| Provider | Model | Use Case |
|----------|-------|----------|
| Ollama | llama3.2 | General code analysis |
| Ollama | codellama | Code-specific tasks |
| Ollama | deepseek-coder | Advanced code understanding |
| llama.cpp | Any GGUF code model | Custom hardware tuning |

### Memory Requirements

| Model Size | RAM Needed |
|------------|------------|
| 3B (Q4_K_M) | 4 GB |
| 7B (Q4_K_M) | 8 GB |
| 14B (Q4_K_M) | 16 GB |

## Troubleshooting

### Ollama Issues

```bash
# Check if Ollama is running
curl http://127.0.0.1:11434/api/tags

# Restart Ollama
ollama serve

# Check available models
ollama list

# Pull missing model
ollama pull llama3.2
```

### llama.cpp Issues

```bash
# Check server health
curl http://127.0.0.1:8080/health

# Check server props
curl http://127.0.0.1:8080/props

# Restart with debug
./llama-server -m model.gguf --port 8080 --log-disable false
```

### Common Errors

| Error | Solution |
|-------|----------|
| Connection refused | Start the LLM server |
| Model not found | Pull/download the model |
| Timeout exceeded | Increase --llm-timeout |
| Non-localhost URL | Use only localhost addresses |

## Health Check Script

Use the provided health check script:

```bash
# Basic check
./scripts/ollama-health-check.sh

# JSON output (for automation)
./scripts/ollama-health-check.sh --json

# Custom port
./scripts/ollama-health-check.sh --port 11435

# Multiple retries
./scripts/ollama-health-check.sh --retries 5
```

## Integration Testing

Run the test suite to verify LLM integration:

```bash
# All LLM tests
npm run test -- src/llm/__tests__

# Provider-specific tests
npm run test -- src/llm/__tests__/ollama-provider.test.ts
npm run test -- src/llm/__tests__/llamacpp-provider.test.ts

# CLI integration tests
npm run test -- src/cli/__tests__/local-llm.test.ts
```