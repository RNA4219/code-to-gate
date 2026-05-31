# Technical Architecture for Public Readiness

This document provides a comprehensive technical overview for external reviewers.

## System Architecture

### High-Level Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                          CLI Entry Point                           │
│                        (src/cli/index.ts)                          │
└───────────────────────────────┬────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐      ┌───────────────┐      ┌───────────────┐
│     Scan      │      │    Analyze    │      │   Readiness   │
│   Command     │      │    Command    │      │    Command    │
└───────┬───────┘      └───────┬───────┘      └───────┬───────┘
        │                      │                      │
        ▼                      ▼                      ▼
┌───────────────────────────────────────────────────────────────────┐
│                        Core Engine                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   Parsers   │  │   Rules     │  │  Reporters  │              │
│  │ (Adapters)  │  │  (Plugins)  │  │ (Outputs)   │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└───────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────────┐
│                      Supporting Systems                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   Cache     │  │   Config    │  │   Plugin    │              │
│  │ (Incremental)│  │  (Policy)  │  │  Sandbox    │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└───────────────────────────────────────────────────────────────────┘
```

### Component Breakdown

| Component | Location | Responsibility |
|-----------|----------|---------------|
| CLI | `src/cli/` | Command-line interface, argument parsing |
| Parsers | `src/adapters/` | Language-specific AST parsing |
| Rules | `src/rules/` | Detection logic for issues |
| Reporters | `src/reporters/` | Output formatting (SARIF, JSON, HTML) |
| Config | `src/config/` | Policy loading and evaluation |
| Cache | `src/cache/` | Incremental analysis optimization |
| Plugin | `src/plugin/` | Plugin SDK and Docker sandbox |
| LLM | `src/llm/` | LLM integration for enhanced analysis |
| Evidence | `src/evidence/` | Release evidence generation |
| Viewer | `src/viewer/` | HTML report viewer |
| Historical | `src/historical/` | Baseline comparison |

## Technology Stack

### Runtime & Language

| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | 20+ | Runtime environment |
| TypeScript | 5.x | Primary language |
| ESM | - | Module system |

### Key Dependencies

| Dependency | Purpose | License |
|------------|---------|---------|
| ts-morph | TypeScript AST | MIT |
| acorn | JavaScript parser | MIT |
| glob | File matching | ISC |
| ajv | JSON Schema validation | MIT |
| commander | CLI framework | MIT |
| vitest | Testing framework | MIT |

### Build & Tooling

| Tool | Purpose |
|------|---------|
| tsc | TypeScript compilation |
| ESLint | Code linting |
| Vitest | Unit testing |
| npm | Package management |

## Data Flow

### Scan Command Flow

```
User Input (CLI args)
        │
        ▼
┌───────────────┐
│ Parse Args    │
│ Validate      │
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ Load Config   │
│ (.ctgrc.yml)  │
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ Discover     │
│ Files (glob)  │
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ Parse Files   │◀─────┐
│ (Adapters)    │      │
└───────┬───────┘      │
        │              │
        ▼              │
┌───────────────┐      │
│ Run Rules     │      │
│ (Plugins)     │──────┘
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ Aggregate     │
│ Findings      │
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ Generate      │
│ Output        │
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ Write Report  │
│ (SARIF/JSON)  │
└───────────────┘
```

### Incremental Analysis

The cache system enables incremental analysis:

```
┌───────────────┐     ┌───────────────┐
│ Source File   │────▶│ Hash Compute  │
└───────────────┘     └───────┬───────┘
                              │
                              ▼
                      ┌───────────────┐
                      │ Cache Lookup  │
                      └───────┬───────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌─────────┐     ┌─────────┐     ┌─────────┐
        │ Cache   │     │ Partial │     │ Full    │
        │ Hit     │     │ Cache   │     │ Miss    │
        │ (Skip)  │     │ (Delta) │     │ (Parse) │
        └─────────┘     └─────────┘     └─────────┘
```

## Security Architecture

### Plugin Sandbox

Plugins run in isolated Docker containers:

```
┌───────────────────────────────────────────────┐
│                 Host System                    │
│  ┌─────────────────────────────────────────┐  │
│  │           code-to-gate                   │  │
│  │  ┌─────────────┐  ┌─────────────┐      │  │
│  │  │  Plugin     │  │  Plugin     │      │  │
│  │  │  Manager    │  │  SDK        │      │  │
│  │  └──────┬──────┘  └─────────────┘      │  │
│  └─────────┼───────────────────────────────┘  │
│            │ gRPC / STDIO                      │
│  ┌─────────▼───────────────────────────────┐  │
│  │        Docker Container                  │  │
│  │  ┌─────────────────────────────────────┐│  │
│  │  │         Plugin Process              ││  │
│  │  │  (Isolated, Limited Resources)     ││  │
│  │  └─────────────────────────────────────┘│  │
│  └─────────────────────────────────────────┘  │
└───────────────────────────────────────────────┘
```

### Sandbox Security Controls

| Control | Implementation |
|---------|---------------|
| Network isolation | No external network access |
| Filesystem isolation | Read-only mount of target only |
| Resource limits | CPU, memory, time limits |
| User namespace | Non-root container user |
| Seccomp | Limited syscall surface |

### Data Privacy

**Local-First Design**:

```
┌───────────────────────────────────────────────┐
│                 Your Machine                   │
│                                               │
│  ┌─────────────┐     ┌─────────────────────┐ │
│  │  Source     │────▶│   code-to-gate      │ │
│  │  Code       │     │   (Analysis)        │ │
│  └─────────────┘     └──────────┬──────────┘ │
│                                 │            │
│                                 ▼            │
│                      ┌─────────────────────┐ │
│                      │   Output Artifacts  │ │
│                      │   (findings.json)   │ │
│                      └─────────────────────┘ │
│                                               │
│            ❌ No external transmission       │
└───────────────────────────────────────────────┘
```

## Rule System

### Rule Interface

```typescript
interface RulePlugin {
  id: string;                    // Unique identifier
  name: string;                  // Human-readable name
  description: string;            // What this rule detects
  category: RuleCategory;        // security | quality | compliance
  defaultSeverity: Severity;     // critical | high | medium | low
  defaultConfidence: number;     // 0.0 to 1.0

  evaluate(context: RuleContext): Finding[];
}
```

### Rule Categories

| Category | Purpose | Example Rules |
|----------|---------|---------------|
| security | Vulnerability detection | RAW_SQL, HARDCODED_SECRET |
| quality | Code quality issues | COMPLEX_FUNCTION, DUPLICATE_CODE |
| compliance | Regulatory requirements | MISSING_LICENSE, NO_CHANGELOG |
| auth | Authentication issues | WEAK_AUTH_GUARD, MISSING_MFA |
| validation | Input validation gaps | MISSING_INPUT_VALIDATION |

### Finding Structure

```typescript
interface Finding {
  id: string;                    // Unique finding ID
  ruleId: string;                // Rule that triggered
  severity: Severity;            // Impact level
  confidence: number;            // Detection confidence
  message: string;               // Human-readable description
  location: {
    file: string;                // File path
    line: number;                // Line number
    column: number;              // Column number
    snippet?: string;            // Code snippet
  };
  evidence?: Evidence[];         // Supporting evidence
  remediation?: string;          // Fix suggestion
}
```

## Output Formats

### JSON Schema

Output follows `ctg/v1` schema:

```json
{
  "$schema": "https://quality-harness.dev/schemas/ctg/v1/findings.json",
  "version": "ctg/v1",
  "timestamp": "2026-05-31T12:00:00Z",
  "repository": {
    "path": "/path/to/repo",
    "commit": "abc123"
  },
  "findings": [...]
}
```

### SARIF Output

Compatible with GitHub Code Scanning:

```json
{
  "$schema": "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
  "version": "2.1.0",
  "runs": [{
    "tool": {
      "driver": {
        "name": "code-to-gate",
        "version": "1.3.0"
      }
    },
    "results": [...]
  }]
}
```

## Testing Strategy

### Test Pyramid

```
           ┌─────────────┐
           │    E2E      │  Real-repo tests
           │   Tests     │  (~10 min)
           └─────────────┘
         ┌───────────────────┐
         │   Integration     │  Cross-module
         │      Tests        │  (~5 min)
         └───────────────────┘
       ┌─────────────────────────┐
       │       Unit Tests        │  Module-level
       │                         │  (~5 min)
       └─────────────────────────┘
     ┌───────────────────────────────┐
     │         Smoke Tests           │  CLI validation
     │                               │  (~15 sec)
     └───────────────────────────────┘
```

### Coverage Requirements

| Metric | Threshold | Current |
|--------|-----------|---------|
| Line Coverage | 45% | ✅ Met |
| Function Coverage | 50% | ✅ Met |
| Branch Coverage | 40% | ✅ Met |

## Performance Characteristics

### Benchmark Results

| Repository Size | Files | Scan Time | Memory |
|-----------------|-------|-----------|--------|
| Small (<1K files) | 500 | ~5s | ~200MB |
| Medium (1K-10K) | 5,000 | ~30s | ~500MB |
| Large (10K-100K) | 50,000 | ~5min | ~1GB |
| Very Large (>100K) | 200,000 | ~20min | ~2GB |

### Optimization Strategies

1. **Incremental Cache**: Skip unchanged files
2. **Parallel Processing**: Worker-based file analysis
3. **Tree-sitter**: Fast incremental parsing
4. **Memory Pooling**: Reusable AST structures

## Deployment Options

### npm Package

```bash
npm install -g @quality-harness/code-to-gate
code-to-gate scan ./src
```

### Docker Image

```bash
docker run -v $(pwd):/workspace qualityharness/code-to-gate scan /workspace
```

### CI/CD Integration

```yaml
# GitHub Actions
- name: Scan with code-to-gate
  run: |
    npm install -g @quality-harness/code-to-gate
    code-to-gate scan ./src --format sarif --output results.sarif
- name: Upload SARIF
  uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: results.sarif
```

## Schema Governance

### Versioning Policy

| Version | Status | Support |
|---------|--------|---------|
| ctg/v1 | Stable | Full support, backward compatible |
| ctg/v2 | Future | Planned for breaking changes |

### Breaking Change Policy

1. New major version required for:
   - Removing required fields
   - Changing field types
   - Removing enum values

2. Non-breaking changes allowed:
   - Adding optional fields
   - Adding enum values
   - Adding new output formats

## Monitoring & Observability

### Metrics Collected

| Metric | Type | Purpose |
|--------|------|---------|
| Scan duration | Histogram | Performance monitoring |
| Finding count | Counter | Issue density |
| Rule execution time | Histogram | Rule optimization |
| Cache hit rate | Gauge | Incremental effectiveness |

### Logging

- **Level**: INFO (default), DEBUG (verbose)
- **Format**: JSON structured logs
- **Output**: stderr (default), file (optional)

---

Document Version: 1.0
Last Updated: 2026-05-31