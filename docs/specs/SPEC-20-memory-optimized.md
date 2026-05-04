# SPEC-20: Memory-optimized Mode

**Version**: v1.0
**Created**: 2026-05-04
**Status**: draft
**Priority**: P2
**Estimated Time**: 3 days

---

## 1. Purpose

Provide low-memory mode for CI environments with limited RAM (e.g., GitHub Actions free tier).

---

## 2. Scope

### Included
- Streaming file processing
- Memory limit enforcement
- Garbage collection optimization
- Large file handling

### Excluded
- External memory profiling
- Memory monitoring dashboard
- Dynamic memory allocation

---

## 3. Current State

**Status**: No memory optimization, potential issues on large repos

**CI Environment**: GitHub Actions free tier ~7GB RAM

**Problem**: Large repos (5000+ files) may exceed memory limits.

---

## 4. Proposed Implementation

### Memory Limit Configuration

```typescript
// src/config/memory-config.ts
interface MemoryConfig {
  maxHeapMB: number;          // Maximum heap size
  batchSize: number;          // Files per batch (memory tradeoff)
  gcInterval: number;         // GC interval in batches
  streamThresholdMB: number;  // File size for streaming
}

const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  maxHeapMB: 2048,            // 2GB limit
  batchSize: 100,             // Smaller batches
  gcInterval: 5,              // GC every 5 batches
  streamThresholdMB: 1,       // Stream files > 1MB
};
```

### Streaming File Processing

```typescript
// src/core/streaming-processor.ts
async function processFilesStreaming(
  files: string[],
  config: MemoryConfig,
  processor: FileProcessor
): Promise<StreamResult> {
  const batchSize = config.batchSize;
  const batches = chunkArray(files, batchSize);
  const results: PartialResult[] = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];

    // Process batch
    const batchResult = await processBatch(batch, processor);
    results.push(batchResult);

    // Check memory usage
    const memUsage = process.memoryUsage().heapUsed / 1024 / 1024;
    if (memUsage > config.maxHeapMB * 0.8) {
      // Trigger GC
      if (global.gc) {
        global.gc();
      }

      // Reduce batch size if still high
      if (memUsage > config.maxHeapMB * 0.9) {
        console.warn("Memory near limit, reducing batch size");
        config.batchSize = Math.floor(config.batchSize / 2);
      }
    }

    // Periodic GC
    if (i % config.gcInterval === 0 && global.gc) {
      global.gc();
    }
  }

  return aggregateResults(results);
}
```

### Large File Streaming

```typescript
// src/core/streaming-reader.ts
async function readLargeFileStreaming(
  filePath: string,
  thresholdMB: number
): Promise<string | AsyncIterable<string>> {
  const stats = await fs.promises.stat(filePath);
  const sizeMB = stats.size / 1024 / 1024;

  if (sizeMB > thresholdMB) {
    // Stream file in chunks
    return fs.promises.readFile(filePath, { encoding: "utf8" });
    // For very large files, return async iterable
    // return createFileStream(filePath);
  }

  // Normal read for small files
  return fs.promises.readFile(filePath, "utf8");
}
```

### CLI Option

```bash
# Low memory mode
code-to-gate analyze . --memory-limit 1024 --batch-size 50 --out .qh
```

---

## 5. Technical Design

### Files to Create/Modify

| File | Action | Purpose |
|---|---|---|
| `src/config/memory-config.ts` | Create | Memory configuration |
| `src/core/streaming-processor.ts` | Create | Streaming logic |
| `src/core/streaming-reader.ts` | Create | Large file handling |
| `src/cli/analyze.ts` | Modify | Memory options |
| `docs/memory-optimization.md` | Create | Documentation |

---

## 6. Dependencies

| Dependency | Type | Status |
|---|---|:---:|
| Node.js memory APIs | Node.js | Active |
| Global GC | Node.js flag | Optional |
| Batch processing | Existing | Active |

---

## 7. Acceptance Criteria

| Criterion | Measurable | Verification |
|---|---|---|
| Memory limit respected | Peak memory < limit | Automated |
| Large repo processed | 5000 files in 2GB | Automated |
| Results unchanged | Same findings as normal mode | Automated |
| Graceful degradation | Smaller batches on limit | Automated |

---

## 8. Test Plan

### Memory Test
```typescript
describe("memory-optimized", () => {
  it("should stay under memory limit", async () => {
    const config = { maxHeapMB: 512, batchSize: 50 };
    const startMem = process.memoryUsage().heapUsed;

    await processFilesStreaming(largeFiles, config, processor);

    const peakMem = process.memoryUsage().heapUsed;
    expect(peakMem - startMem).toBeLessThan(config.maxHeapMB * 1024 * 1024);
  });

  it("should produce same results as normal mode", async () => {
    const normalResult = await normalProcess(files);
    const streamingResult = await streamingProcess(files, memoryConfig);

    expect(normalResult.findings.length).toBe(streamingResult.findings.length);
  });
});
```

---

## 9. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|:---:|:---:|---|
| Performance slowdown | Medium | Medium | Configurable batch size |
| GC not available | Medium | Low | Graceful fallback |
| Memory fragmentation | Low | Low | Periodic GC |

---

## 10. References

| Reference | Path |
|---|---|
| Current batch processing | `src/parallel/batch-processor.ts` |
| File processor | `src/parallel/file-processor-worker.ts` |
| Node.js memory | https://nodejs.org/api/process.html#process_process_memoryusage |