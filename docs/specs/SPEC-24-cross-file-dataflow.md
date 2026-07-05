# SPEC-24: Cross-file Dataflow

**Version**: v1.0
**Created**: 2026-05-04
**Status**: draft
**Priority**: P2
**Estimated Time**: 1 week

---

## 1. Purpose

Extend dataflow analysis to track data flow across multiple files for more accurate finding impact assessment.

---

## 2. Scope

### Included
- Inter-file dataflow tracking
- Import/export dataflow connection
- Function call chain across files
- Blast radius estimation improvement

### Excluded
- Full dataflow analysis (complex)
- Runtime dataflow tracing
- Dynamic import handling

---

## 3. Current State

**Status**: Dataflow-lite is implemented; full cross-file taint analysis remains future scope.

**Current Dataflow**:
- `src/core/dataflow-lite.ts` tracks assignments, parameters, returns, branches, member access, and call-chain hops.
- `src/core/dataflow-full.ts` extends the in-memory graph traversal model for richer call-chain analysis.
- `src/adapters/ts-adapter.ts` emits import/export/reference/call relations used as cross-file hints.
- `src/core/__tests__/dataflow-lite.test.ts` and `src/core/__tests__/dataflow-full.test.ts` cover source-to-sink chains, validation-aware flows, and multi-hop call traversal.

**Current Boundary**:
- The analyzer may use call/import/export relations as evidence, but it does not claim whole-program taint completeness.
- Source/sink/sanitizer classification is heuristic and intended for rule precision, not proof of exploitability.
- Cross-file findings must keep confidence conservative unless the full path is present in graph relations.

---

## 4. Proposed Implementation

### Target Cross-file Dataflow Architecture

```
File A: userInput -> sanitize() -> export sanitizedData
                                        ↓
File B: import { sanitizedData } -> processData()
                                        ↓
File C: import { processData } -> storeInDb()
```

### Future Implementation

```typescript
// src/core/cross-file-dataflow.ts
interface CrossFileDataflow {
  sourceFile: string;
  sourceSymbol: string;
  path: DataflowHop[];
  sinkFile: string;
  sinkSymbol: string;
}

interface DataflowHop {
  file: string;
  symbol: string;
  kind: "import" | "export" | "call" | "param" | "return";
}

function buildCrossFileDataflow(
  graph: RepoGraphArtifact,
  symbols: SymbolNode[]
): CrossFileDataflow[] {
  const flows: CrossFileDataflow[] = [];

  // 1. Build symbol lookup
  const symbolByFile = groupSymbolsByFile(symbols);

  // 2. Track exports
  for (const file of graph.files) {
    const exports = file.exports || [];
    for (const exp of exports) {
      // Find symbols that use this export
      const importers = findImporters(graph, file.path, exp.name);
      for (const importer of importers) {
        // Connect dataflow: source -> import -> usage
        flows.push({
          sourceFile: file.path,
          sourceSymbol: exp.symbolId || exp.name,
          path: [
            { file: file.path, symbol: exp.name, kind: "export" },
            { file: importer.path, symbol: exp.name, kind: "import" },
          ],
          sinkFile: importer.path,
          sinkSymbol: exp.name,
        });
      }
    }
  }

  // 3. Track call chains
  for (const relation of graph.relations || []) {
    if (relation.kind === "calls") {
      const callerSymbol = symbols.find(s => s.id === relation.from);
      const calleeSymbol = symbols.find(s => s.id === relation.to);

      if (callerSymbol && calleeSymbol && callerSymbol.file !== calleeSymbol.file) {
        flows.push({
          sourceFile: callerSymbol.file,
          sourceSymbol: callerSymbol.id,
          path: [
            { file: callerSymbol.file, symbol: callerSymbol.name, kind: "call" },
            { file: calleeSymbol.file, symbol: calleeSymbol.name, kind: "param" },
          ],
          sinkFile: calleeSymbol.file,
          sinkSymbol: calleeSymbol.id,
        });
      }
    }
  }

  return flows;
}
```

### Blast Radius Enhancement

```typescript
// Enhanced blast radius using cross-file dataflow
function calculateEnhancedBlastRadius(
  finding: Finding,
  crossFileFlows: CrossFileDataflow[],
  graph: RepoGraphArtifact
): BlastRadiusResult {
  const affectedFiles = new Set<string>();
  const affectedSymbols = new Set<string>();

  // 1. Find all flows that pass through finding location
  const relevantFlows = crossFileFlows.filter(flow =>
    flow.path.some(hop => 
      hop.file === finding.evidence[0]?.path &&
      hop.symbol.includes(finding.ruleId)
    )
  );

  // 2. Track downstream impact
  for (const flow of relevantFlows) {
    affectedFiles.add(flow.sinkFile);
    for (const hop of flow.path) {
      affectedFiles.add(hop.file);
      affectedSymbols.add(hop.symbol);
    }
  }

  // 3. Find entrypoints that use affected files
  const entrypoints = graph.files.filter(f => f.role === "entrypoint");
  const affectedEntrypoints = entrypoints.filter(e =>
    affectedFiles.has(e.path) ||
    hasDependencyOn(graph, e.path, affectedFiles)
  );

  return {
    affectedFiles: Array.from(affectedFiles),
    affectedSymbols: Array.from(affectedSymbols),
    affectedEntrypoints,
    severityMultiplier: affectedEntrypoints.length > 0 ? 1.5 : 1.0,
  };
}
```

---

## 5. Technical Design

### Files to Create/Modify

| File | Action | Purpose |
|---|---|---|
| `src/core/dataflow-lite.ts` | Existing | Heuristic source/sink/sanitizer and call-chain dataflow |
| `src/core/dataflow-full.ts` | Existing | Expanded in-memory call-chain traversal |
| `src/adapters/ts-adapter.ts` | Existing | Import/export/reference/call graph hints |
| `src/core/cross-file-dataflow.ts` | Future | Whole-program cross-file logic |
| `src/core/blast-radius-enhanced.ts` | Future | Enhanced blast radius |
| `docs/cross-file-dataflow.md` | Future | Operator documentation |

---

## 6. Dependencies

| Dependency | Type | Status |
|---|---|:---:|
| Dataflow-lite | Existing | Active |
| Import/export extraction | Existing | Active |
| Symbol tracking | Existing | Active |

---

## 7. Acceptance Criteria

| Criterion | Measurable | Verification |
|---|---|---|
| Dataflow-lite classifies sources, sinks, and validation/sanitizer hops | Source/sink/sanitizer helpers return expected boolean decisions | Automated |
| Call-chain hints are available | TS adapter emits `calls`; dataflow-lite can traverse multi-hop chains | Automated |
| Cross-file claims stay conservative | Specs and finding confidence do not claim whole-program taint completeness | Documentation |
| Future whole-program flow has depth/cycle limits | Design includes depth limit and cycle detection | Design review |

---

## 8. Test Plan

### Cross-file Test
```typescript
describe("cross-file-dataflow", () => {
  it("should track export to import flow", () => {
    // File A exports `userInput`
    // File B imports and uses `userInput`
    const flows = buildCrossFileDataflow(graph, symbols);
    expect(flows.some(f => f.sourceFile === "A.ts" && f.sinkFile === "B.ts")).toBe(true);
  });

  it("should expand blast radius", () => {
    const radius = calculateEnhancedBlastRadius(finding, flows, graph);
    expect(radius.affectedFiles.length).toBeGreaterThan(1);
  });
});
```

---

## 9. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|:---:|:---:|---|
| Complex call chains | High | Medium | Depth limit |
| Circular imports | Medium | Low | Cycle detection |
| Performance overhead | Medium | Medium | Incremental caching |

---

## 10. References

| Reference | Path |
|---|---|
| Dataflow-lite | `src/core/dataflow-lite.ts` |
| Import extraction | `src/adapters/ts-adapter.ts` |
| Graph relations | `src/types/graph.ts` |
