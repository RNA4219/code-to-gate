# SPEC-18: Distributed Scan

**Version**: v1.0
**Created**: 2026-05-04
**Status**: draft
**Priority**: P3
**Estimated Time**: 2 weeks

---

## 1. Purpose

Enable distributed scanning across multiple workers for large repositories (5000+ files) to improve performance.

---

## 2. Scope

### Included
- Worker-based parallel file processing
- Distributed rule evaluation
- Result aggregation
- Progress reporting

### Excluded
- Remote worker nodes (local only)
- Cloud-based scanning
- Dynamic worker scaling

---

## 3. Current State

**Status**: Single-threaded scan (with parallel file processing option)

**Current Parallel**: `--parallel` flag uses worker threads for file parsing

**Limitation**: Large repos (5000+ files) still take > 2 minutes.

---

## 4. Proposed Implementation

### Architecture

```
Main Process
├── File Discovery (walkDir)
├── Worker Coordinator
│   ├── Worker Pool (N workers)
│   │   ├── Worker 1: Files 1-1000
│   │   ├── Worker 2: Files 1001-2000
│   │   ├── Worker 3: Files 2001-3000
│   │   └── ...
│   └── Result Aggregator
└── Rule Evaluation (parallel)
```

### Worker Distribution

```typescript
// src/parallel/distributed-scan.ts
interface DistributedScanConfig {
  workerCount: number;       // Number of workers
  batchSize: number;         // Files per worker batch
  timeoutMs: number;         // Worker timeout
}

async function distributedScan(
  root: string,
  config: DistributedScanConfig
): Promise<RepoGraphArtifact> {
  // 1. Discover all files
  const files = await walkDir(root);

  // 2. Split into batches
  const batches = chunkArray(files, config.batchSize);

  // 3. Create worker pool
  const workerPool = new WorkerPool(config.workerCount);

  // 4. Distribute work
  const results = await Promise.all(
    batches.map(batch => workerPool.execute(batch))
  );

  // 5. Aggregate results
  return aggregateRepoGraph(results);
}
```

### Worker Pool Implementation

```typescript
// src/parallel/worker-pool.ts
class WorkerPool {
  private workers: Worker[];
  private available: Worker[];
  private queue: Task[];

  constructor(count: number) {
    this.workers = Array.from({ length: count }, () => 
      new Worker("./file-processor-worker.js")
    );
    this.available = [...this.workers];
    this.queue = [];
  }

  async execute(batch: string[]): Promise<PartialResult> {
    const worker = await this.getAvailableWorker();
    
    return new Promise((resolve, reject) => {
      worker.onmessage = (e) => {
        this.releaseWorker(worker);
        resolve(e.data);
      };
      worker.onerror = (e) => {
        this.releaseWorker(worker);
        reject(e.error);
      };
      worker.postMessage({ type: "scan", files: batch });
    });
  }

  private async getAvailableWorker(): Promise<Worker> {
    if (this.available.length > 0) {
      return this.available.pop()!;
    }
    // Wait for worker to become available
    return new Promise(resolve => {
      this.queue.push(resolve);
    });
  }

  private releaseWorker(worker: Worker): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      next(worker);
    } else {
      this.available.push(worker);
    }
  }
}
```

---

## 5. Technical Design

### Files to Create/Modify

| File | Action | Purpose |
|---|---|---|
| `src/parallel/distributed-scan.ts` | Create | Distributed coordinator |
| `src/parallel/worker-pool.ts` | Create | Worker pool management |
| `src/parallel/result-aggregator.ts` | Create | Result merging |
| `src/cli/scan.ts` | Modify | Add distributed option |
| `src/__tests__/distributed-scan.test.ts` | Create | Tests |

---

## 6. Dependencies

| Dependency | Type | Status |
|---|---|:---:|
| Node.js worker_threads | Node.js | Active |
| Existing parallel module | Existing | Active |
| File processor | Existing | Active |

---

## 7. Acceptance Criteria

| Criterion | Measurable | Verification |
|---|---|---|
| Large repo scan < 2 min | 5000 files in < 120s | Automated |
| Worker utilization | All workers active | Automated |
| Result correctness | Same as single-threaded | Automated |
| Graceful degradation | Single-thread fallback | Automated |

---

## 8. Test Plan

### Performance Test
```typescript
describe("distributed-scan performance", () => {
  it("should scan 5000 files in < 120s", async () => {
    const start = Date.now();
    const result = await distributedScan(largeRepoFixture, { workerCount: 4, batchSize: 500 });
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(120000);
    expect(result.files.length).toBe(5000);
  });
});
```

---

## 9. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|:---:|:---:|---|
| Worker memory overhead | High | Medium | Limit batch size |
| Worker startup latency | Medium | Low | Lazy worker creation |
| Result merge complexity | Medium | Medium | Standard merge logic |

---

## 10. References

| Reference | Path |
|---|---|
| Current parallel | `src/parallel/*.ts` |
| File processor | `src/parallel/file-processor-worker.ts` |
| Worker threads | Node.js worker_threads API |