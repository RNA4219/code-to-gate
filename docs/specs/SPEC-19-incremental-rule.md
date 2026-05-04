# SPEC-19: Incremental Rule Evaluation

**Version**: v1.0
**Created**: 2026-05-04
**Status**: draft
**Priority**: P2
**Estimated Time**: 1 week

---

## 1. Purpose

Evaluate rules only on changed files (from baseline or diff) to speed up PR analysis.

---

## 2. Scope

### Included
- Baseline artifact comparison
- Changed file identification
- Incremental rule evaluation
- Result merging with baseline

### Excluded
- Historical comparison (existing feature)
- Cross-file rule impact (separate spec)
- Cache invalidation strategy

---

## 3. Current State

**Status**: Full scan on every run (diff mode exists but limited)

**Current Diff**: `code-to-gate diff` analyzes changed files

**Limitation**: Rule evaluation still processes all findings, not incremental.

---

## 4. Proposed Implementation

### Incremental Evaluation Flow

```
1. Load baseline artifact (previous findings)
2. Identify changed files (git diff)
3. Evaluate rules ONLY on changed files
4. Merge new findings with baseline
5. Remove resolved findings (files changed, issue fixed)
6. Output updated findings
```

### Implementation

```typescript
// src/rules/incremental-evaluator.ts
interface IncrementalEvaluationOptions {
  baseline: FindingsArtifact;
  changedFiles: string[];
  preserveUnchanged: boolean;
}

async function incrementalRuleEvaluation(
  graph: RepoGraphArtifact,
  rules: RulePlugin[],
  options: IncrementalEvaluationOptions
): Promise<FindingsArtifact> {
  const newFindings: Finding[] = [];

  // 1. Evaluate rules only on changed files
  const changedGraph = filterGraphToChangedFiles(graph, options.changedFiles);

  for (const rule of rules) {
    const ruleFindings = rule.evaluate({
      graph: changedGraph,
      getFileContent: (path) => getFileContent(path),
    });
    newFindings.push(...ruleFindings);
  }

  // 2. Preserve unchanged findings from baseline
  if (options.preserveUnchanged) {
    const unchangedFindings = options.baseline.findings.filter(
      f => !options.changedFiles.includes(f.evidence[0]?.path || "")
    );
    newFindings.push(...unchangedFindings);
  }

  // 3. Detect resolved findings
  const resolvedFindings = detectResolvedFindings(
    options.baseline.findings,
    newFindings,
    options.changedFiles
  );

  return {
    findings: newFindings,
    resolved: resolvedFindings,
    incremental: true,
    baselineId: options.baseline.run_id,
  };
}

function filterGraphToChangedFiles(
  graph: RepoGraphArtifact,
  changedFiles: string[]
): SimpleGraph {
  return {
    ...graph,
    files: graph.files.filter(f => changedFiles.includes(f.path)),
  };
}
```

### CLI Integration

```bash
# Incremental analysis with baseline
code-to-gate analyze . --baseline .qh-baseline/findings.json --changed-files diff.txt --out .qh
```

---

## 5. Technical Design

### Files to Create/Modify

| File | Action | Purpose |
|---|---|---|
| `src/rules/incremental-evaluator.ts` | Create | Incremental logic |
| `src/cli/analyze.ts` | Modify | Add incremental options |
| `src/cache/findings-cache.ts` | Modify | Baseline handling |
| `docs/incremental-analysis.md` | Create | Documentation |

---

## 6. Dependencies

| Dependency | Type | Status |
|---|---|:---:|
| Baseline artifact | Existing | Active |
| Git diff | Existing | Active |
| Historical comparison | Existing | Active |

---

## 7. Acceptance Criteria

| Criterion | Measurable | Verification |
|---|---|---|
| Only changed files evaluated | Rule calls limited to changed files | Automated |
| Baseline preserved | Unchanged findings retained | Automated |
| Resolved findings detected | Fixed issues marked resolved | Automated |
| Performance improved | 50% faster for small changes | Automated |

---

## 8. Test Plan

### Incremental Test
```typescript
describe("incremental-evaluator", () => {
  it("should evaluate only changed files", () => {
    const changedFiles = ["src/api/handler.ts"];
    const result = incrementalRuleEvaluation(graph, rules, { changedFiles });
    
    // All findings should be in changed files
    expect(result.findings.every(f => 
      changedFiles.includes(f.evidence[0]?.path)
    ).toBe(true);
  });

  it("should preserve baseline unchanged findings", () => {
    const baseline = { findings: [{ ruleId: "TEST", evidence: [{ path: "other.ts" }] }] };
    const result = incrementalRuleEvaluation(graph, rules, { 
      baseline, 
      changedFiles: ["src/api.ts"],
      preserveUnchanged: true 
    });
    
    expect(result.findings.some(f => f.path === "other.ts")).toBe(true);
  });
});
```

---

## 9. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|:---:|:---:|---|
| Cross-file rule impact | High | Medium | Full re-evaluation option |
| Baseline drift | Medium | Low | Baseline validation |
| Missing resolved findings | Medium | Medium | Line-level comparison |

---

## 10. References

| Reference | Path |
|---|---|
| Historical comparison | `src/historical/*.ts` |
| Diff command | `src/cli/diff.ts` |
| Findings cache | `src/cache/findings-cache.ts` |