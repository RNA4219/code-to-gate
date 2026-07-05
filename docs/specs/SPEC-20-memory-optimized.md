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

**Status**: Large-repo streaming and lazy symbol optimization are implemented for scan; explicit heap-limit CLI remains future scope.

**CI Environment**: GitHub Actions free tier ~7GB RAM

**Current implementation**:
- `src/parallel/file-processor.ts` supports streaming mode, chunked processing, lazy symbols, and cache clearing.
- `src/cache/*` supports streaming validation for large file sets.
- `src/__tests__/performance/large-repo-performance.test.ts` covers streaming chunks, lazy symbol loading, cache validation, 5000+ file scan, cache clearing, and large-repo memory behavior.

**Re-evaluation 2026-07-04**:
- Tie SPEC-20 acceptance to the large-repo performance suite for v1.
- Keep explicit `--memory-limit` / dynamic heap enforcement as future scope because Node heap limits are better controlled by `NODE_OPTIONS` in CI today.
- Treat memory optimization as scan-path behavior: streaming batches, lazy symbols, and cache clearing must keep large repo processing bounded.

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
| `src/parallel/file-processor.ts` | Existing | Streaming, chunked processing, lazy symbol cache |
| `src/cache/*` | Existing | Streaming cache validation |
| `src/__tests__/performance/large-repo-performance.test.ts` | Existing | Large repo and memory behavior acceptance |
| `src/config/memory-config.ts` | Future | Explicit memory configuration |
| `docs/memory-optimization.md` | Future | Dedicated operator guide if heap-limit CLI is added |

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
| Streaming mode processes chunks | Multiple chunks are processed without retaining all lazy symbols | Automated |
| Large repo processed | 5000 files within acceptance time | Automated |
| Cache validation scales | Large file set uses streaming validation | Automated |
| Memory behavior bounded | Lazy symbol cache can be cleared during large repo processing | Automated |

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
