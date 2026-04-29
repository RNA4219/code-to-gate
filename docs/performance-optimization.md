# Performance Optimization Guide

This guide covers performance optimization strategies for code-to-gate Phase 2.

## Performance Targets

| Target | Phase 2 | Phase 3 |
|---|---|---|
| Small repo (100-500 files) scan | <= 20s | <= 15s |
| Medium repo (500-2000 files) scan | <= 45s | <= 30s |
| Large repo (2000-5000 files) scan | <= 180s | <= 120s |
| Analyze (small, no LLM) | <= 10s | <= 8s |
| Analyze (medium, no LLM) | <= 45s | <= 30s |

## Caching Architecture

code-to-gate uses a three-tier caching system for incremental analysis:

### 1. File Hash Cache (`file-hash-cache.json`)

Stores per-file content hashes for detecting changes.

```typescript
interface FileHashEntry {
  path: string;       // Relative file path
  hash: string;       // SHA-256 hash of content
  sizeBytes: number;  // File size
  mtimeMs: number;    // Last modification time
  cachedAt: number;   // Cache timestamp
}
```

**Cache invalidation triggers:**
- File content change (hash mismatch)
- File deletion
- Config file modification
- Policy file modification

### 2. Graph Cache (`graph-cache.json`)

Stores the NormalizedRepoGraph for reuse.

```typescript
interface GraphCacheEntry {
  graph: NormalizedRepoGraph;  // Cached graph
  filesHash: string;           // Combined file hashes
  configHash?: string;         // Config hash
  cachedAt: number;            // Cache timestamp
}
```

**Cache invalidation triggers:**
- Combined file hashes change
- Config hash change
- Policy hash change

### 3. Findings Cache (`findings-cache.json`)

Stores per-file findings for incremental rule evaluation.

```typescript
interface FindingsCacheEntry {
  path: string;        // File path
  fileHash: string;    // File hash at evaluation
  findings: Finding[]; // Cached findings
  cachedAt: number;    // Cache timestamp
}
```

**Cache invalidation triggers:**
- File hash change
- Rule version change
- Blast radius propagation

## Cache Directory Structure

```
.qh/
  .cache/
    file-hash-cache.json
    graph-cache.json
    findings-cache.json
  repo-graph.json
  findings.json
  ...
```

## Using Cache CLI Option

### Enable Caching

```bash
# Default: cache enabled
code-to-gate scan ./my-repo --out .qh

# Explicit cache enable
code-to-gate scan ./my-repo --cache enabled --out .qh
```

### Force Full Re-scan

```bash
# Ignore cache, scan all files
code-to-gate scan ./my-repo --cache force --out .qh
```

### Disable Cache

```bash
# No caching, fresh scan
code-to-gate scan ./my-repo --cache disabled --out .qh
```

### Cache with Analyze

```bash
# Analyze with caching
code-to-gate analyze ./my-repo --cache enabled --emit all --out .qh
```

## Diff-Only Re-scan

The cache manager implements "blast radius" computation for changed files:

1. **Changed files**: Files with hash mismatch or new files
2. **Blast radius**: Files that import or depend on changed files
3. **Unchanged files**: Files that can use cached data

```bash
# Scan only changed files (from git diff)
code-to-gate scan ./my-repo --base main --head feature-branch --cache enabled
```

## Parallel Processing

### File Processor

Parses files using Node.js worker threads:

```typescript
const processor = new FileProcessor({
  repoRoot: "./my-repo",
  maxWorkers: 4,        // Maximum worker threads
  batchSize: 50,        // Files per batch
  useWorkers: true,     // Enable parallel processing
});
```

**Optimal configuration by repo size:**

| Repo Size | maxWorkers | batchSize |
|---|---|---|
| Small (100-500) | 2 | 25 |
| Medium (500-2000) | 4 | 50 |
| Large (2000-5000) | 6-8 | 100 |

### Rule Evaluator

Evaluates rules concurrently:

```typescript
const evaluator = new RuleEvaluator({
  maxConcurrent: 4,     // Concurrent rule evaluations
  parallel: true,       // Enable parallel evaluation
  timeoutMs: 30000,     // Per-rule timeout
});
```

## Cache Statistics

Monitor cache effectiveness:

```bash
# Get cache stats
code-to-gate scan ./my-repo --cache enabled --verbose
```

Output includes:
```json
{
  "cacheStats": {
    "fileHash": {
      "entryCount": 500,
      "hitRate": 0.95
    },
    "graph": {
      "hasCache": true,
      "fileCount": 500
    },
    "overall": {
      "filesChanged": 25,
      "filesCached": 475
    }
  }
}
```

## Config/Policy Invalidation

Cache is invalidated when config or policy files change:

```bash
# Config files trigger invalidation
.qh/config.json
.qh/policy.yaml
tsconfig.json
.code-to-gate.yaml
```

### Manual Cache Invalidation

```bash
# Clear cache manually
rm -rf .qh/.cache/

# Or use CLI
code-to-gate scan ./my-repo --cache force
```

## Performance Monitoring

### Timing Metrics

```bash
# Verbose output shows timing
code-to-gate scan ./my-repo --cache enabled --verbose
```

```json
{
  "timing": {
    "fileDiscovery": 150,
    "cacheValidation": 50,
    "fileParsing": 2000,
    "graphBuilding": 100,
    "total": 2300
  }
}
```

### Memory Limits

For large repos, configure memory limits:

```bash
# Limit memory usage
code-to-gate scan ./large-repo --memory-limit 1GB --cache enabled
```

## Best Practices

### 1. Commit Cache Files

Cache files should be excluded from git:

```gitignore
# .gitignore
.qh/.cache/
```

However, commit `.qh/` output artifacts for CI caching.

### 2. CI Cache Strategy

```yaml
# GitHub Actions
steps:
  - name: Restore cache
    uses: actions/cache@v3
    with:
      path: .qh/
      key: ${{ runner.os }}-qh-${{ hashFiles('**/*.ts') }}
      restore-keys: |
        ${{ runner.os }}-qh-

  - name: Scan
    run: code-to-gate scan . --cache enabled

  - name: Analyze
    run: code-to-gate analyze . --cache enabled --emit all
```

### 3. Incremental PR Analysis

```bash
# PR scan with diff-only
code-to-gate diff ./repo \
  --base origin/main \
  --head HEAD \
  --cache enabled \
  --out .qh
```

### 4. Large File Handling

Files > 1MB are skipped by default. Configure threshold:

```bash
# Increase file size limit
code-to-gate scan ./repo --max-file-size 2MB
```

## Troubleshooting

### Cache Not Loading

```bash
# Debug cache issues
code-to-gate scan ./repo --cache enabled --debug-cache
```

Common causes:
- Repo root mismatch
- Version mismatch
- Corrupt cache file

### Slow First Scan

First scan has no cache. Expected behavior:
- Small repo: 15-30s
- Medium repo: 30-60s
- Large repo: 60-180s

Subsequent scans with cache should be significantly faster.

### Memory Errors

For large repos:
- Reduce `maxWorkers`
- Reduce `batchSize`
- Set `--memory-limit`

## API Usage

### Using CacheManager

```typescript
import { CacheManager } from "@code-to-gate/cache";

const manager = new CacheManager(repoRoot, {
  enabled: true,
  cacheDir: ".qh/.cache",
});

// Initialize
manager.initialize(ruleVersions);

// Validate cache
const result = manager.validateCache(allFiles, configHash, policyHash);

// Process only changed files
for (const file of result.changedFiles) {
  const hash = manager.getFileHash(file);
  // ... process file
}

// Save cache
manager.save();
```

### Using FileProcessor

```typescript
import { FileProcessor } from "@code-to-gate/parallel";

const processor = new FileProcessor({
  repoRoot: "./my-repo",
  maxWorkers: 4,
  batchSize: 50,
});

// Process files
const results = await processor.processFiles(filePaths);

// Get stats
const stats = processor.getStats();

// Terminate workers
processor.terminate();
```

### Using RuleEvaluator

```typescript
import { RuleEvaluator, ALL_RULES } from "@code-to-gate/parallel";

const evaluator = new RuleEvaluator({
  maxConcurrent: 4,
  parallel: true,
});

// Evaluate all rules
const result = await evaluator.evaluateAll(
  ALL_RULES,
  graph,
  getFileContent
);

console.log(`Total findings: ${result.allFindings.length}`);
console.log(`Time: ${result.totalTimeMs}ms`);
```

## Performance Benchmarks

### Benchmark Results (Phase 2)

| Repo | Files | First Scan | Cached Scan | Analyze (no LLM) |
|---|---|---|---|---|
| Small TS | 150 | 12s | 3s | 8s |
| Medium TS | 800 | 35s | 8s | 28s |
| Large TS | 2500 | 120s | 25s | 90s |

### Optimization Impact

| Optimization | Impact |
|---|---|---|
| File hash cache | 70-90% faster on unchanged files |
| Graph cache | 50-80% faster graph building |
| Findings cache | 60-95% faster rule evaluation |
| Parallel parsing | 2-4x faster file processing |
| Parallel rules | 1.5-3x faster rule evaluation |

---

## Next Steps

1. Run `code-to-gate scan --cache enabled` on your repo
2. Check cache hit rate with `--verbose`
3. Tune `maxWorkers` and `batchSize` for your hardware
4. Set up CI caching for faster pipelines