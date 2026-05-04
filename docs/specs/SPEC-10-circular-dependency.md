# SPEC-10: CIRCULAR_DEPENDENCY Rule

**Version**: v1.0
**Created**: 2026-05-04
**Status**: draft
**Priority**: P1
**Estimated Time**: 2 hours

---

## 1. Purpose

Detect circular dependencies between modules that can cause runtime errors and build issues.

---

## 2. Scope

### Included
- Import cycle detection
- Require cycle detection
- Circular dependency graph analysis
- Severity based on cycle depth

### Excluded
- Auto-fix for circular deps
- Circular dependency visualization (future)
- Dynamic import cycles

---

## 3. Current State

**Status**: Not implemented

**Related**: Import/export extraction exists in adapters

**Need**: Circular dependencies cause:
- Runtime errors ("Cannot access before initialization")
- Build failures
- Module initialization order issues

---

## 4. Proposed Implementation

### Detection Algorithm

```typescript
// src/rules/circular-dependency.ts
interface ImportGraph {
  nodes: Map<string, Set<string>>; // file -> imported files
}

function detectCircularDependencies(
  graph: ImportGraph
): CircularDependency[] {
  const cycles: CircularDependency[] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  for (const [file, imports] of graph.nodes) {
    dfs(file, imports, [], visited, recursionStack, cycles);
  }

  return cycles;
}

function dfs(
  current: string,
  imports: Set<string>,
  path: string[],
  visited: Set<string>,
  stack: Set<string>,
  cycles: CircularDependency[]
): void {
  if (stack.has(current)) {
    // Found cycle
    const cycleStart = path.indexOf(current);
    cycles.push({
      files: [...path.slice(cycleStart), current],
      depth: path.length - cycleStart,
    });
    return;
  }

  if (visited.has(current)) return;

  visited.add(current);
  stack.add(current);
  path.push(current);

  for (const imported of imports) {
    dfs(imported, graph.nodes.get(imported) || new Set(), path, visited, stack, cycles);
  }

  stack.delete(current);
  path.pop();
}
```

### Rule Implementation

```typescript
export const CIRCULAR_DEPENDENCY_RULE: RulePlugin = {
  id: "CIRCULAR_DEPENDENCY",
  name: "Circular Dependency",
  description: "Detects circular import dependencies that may cause runtime errors.",
  category: "maintainability",
  defaultSeverity: "high",
  defaultConfidence: 0.95,

  evaluate(context: RuleContext): Finding[] {
    const findings: Finding[] = [];

    // Build import graph from repo-graph.json
    const importGraph = buildImportGraph(context.graph);

    // Detect cycles
    const cycles = detectCircularDependencies(importGraph);

    for (const cycle of cycles) {
      const severity = cycle.depth > 3 ? "critical" : "high";

      findings.push({
        id: generateFindingId("CIRCULAR_DEPENDENCY", cycle.files[0]),
        ruleId: "CIRCULAR_DEPENDENCY",
        category: "maintainability",
        severity,
        confidence: 0.95,
        title: `Circular dependency detected (${cycle.depth} files)`,
        summary: `Import cycle: ${cycle.files.join(" → ")}`,
        evidence: cycle.files.map(f => createFileEvidence(f)),
        tags: ["maintainability", "circular-dependency", "imports"],
        upstream: { tool: "native" },
      });
    }

    return findings;
  },
};
```

---

## 5. Technical Design

### Files to Create/Modify

| File | Action | Purpose |
|---|---|---|
| `src/rules/circular-dependency.ts` | Create | Rule implementation |
| `src/rules/index.ts` | Modify | Register rule |
| `src/rules/__tests__/circular-dependency.test.ts` | Create | Tests |
| `fixtures/demo-circular/` | Create | Test fixtures |

### Test Fixture Structure

```
fixtures/demo-circular/
├── a.ts  // imports from b
├── b.ts  // imports from c
└── c.ts  // imports from a (circular!)
```

---

## 6. Dependencies

| Dependency | Type | Status |
|---|---|:---:|
| Import extraction | Existing | Active (adapters) |
| Graph analysis | New | Needed |
| Rule interface | Existing | Active |

---

## 7. Acceptance Criteria

| Criterion | Measurable | Verification |
|---|---|---|
| Detects A→B→A cycle | Simple 2-file cycle found | Automated |
| Detects A→B→C→A cycle | Multi-file cycle found | Automated |
| Severity based on depth | deep cycles = critical | Automated |
| No false positives on linear deps | Linear imports not flagged | Automated |

---

## 8. Test Plan

### Test Cases

```typescript
describe("circular-dependency", () => {
  it("should detect simple A→B→A cycle", () => {
    // fixtures: a.ts imports b.ts, b.ts imports a.ts
    const findings = rule.evaluate(context);
    expect(findings.length).toBe(1);
    expect(findings[0].severity).toBe("high");
  });

  it("should detect deep cycle A→B→C→D→A", () => {
    const findings = rule.evaluate(context);
    expect(findings[0].severity).toBe("critical");
  });

  it("should not flag linear imports", () => {
    // fixtures: a.ts imports b.ts imports c.ts (no cycle back)
    const findings = rule.evaluate(context);
    expect(findings.length).toBe(0);
  });
});
```

---

## 9. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|:---:|:---:|---|
| Performance on large graphs | Medium | Medium | Limit graph depth |
| Dynamic import handling | Low | Low | Skip dynamic imports |
| Type-only imports | Low | Low | Filter type imports |

---

## 10. References

| Reference | Path |
|---|---|
| Import extraction | `src/adapters/ts-adapter.ts` |
| Graph relations | `src/types/graph.ts` |
| Rule pattern | `src/rules/*.ts` |