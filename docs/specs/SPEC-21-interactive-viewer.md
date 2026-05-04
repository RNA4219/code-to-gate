# SPEC-21: Interactive HTML Viewer

**Version**: v1.0
**Created**: 2026-05-04
**Status**: draft
**Priority**: P2
**Estimated Time**: 1 week

---

## 1. Purpose

Create an interactive React/Vue-based HTML viewer for dynamic exploration of findings and repo graph.

---

## 2. Scope

### Included
- React/Vue viewer component
- Dynamic finding filtering
- Graph exploration
- Finding detail expansion

### Excluded
- Real-time updates (static artifact)
- Server-side viewer
- Multi-repo comparison view

---

## 3. Current State

**Status**: Static HTML viewer exists

**Current Viewer**: `src/viewer/*.ts` generates static HTML

**Limitation**: No dynamic filtering or interactive exploration.

---

## 4. Proposed Implementation

### Viewer Architecture

```
viewer-app/
├── src/
│   ├── components/
│   │   ├── FindingList.tsx     // List with filtering
│   │   ├── FindingDetail.tsx   // Expanded view
│   │   ├── GraphView.tsx       // Mermaid graph explorer
│   │   ├── SeverityFilter.tsx  // Severity dropdown
│   │   └── CategoryFilter.tsx  // Category dropdown
│   ├── App.tsx                 // Main app
│   └── index.tsx               // Entry point
├── dist/
│   └── viewer.bundle.js        // Bundled JS
└── index.html                  // Viewer shell
```

### Finding List Component

```typescript
// FindingList.tsx
interface FindingListProps {
  findings: Finding[];
  filters: { severity?: Severity[]; category?: FindingCategory[] };
  onSelect: (finding: Finding) => void;
}

function FindingList({ findings, filters, onSelect }: FindingListProps) {
  const filtered = useMemo(() => {
    return findings.filter(f => {
      if (filters.severity && !filters.severity.includes(f.severity)) return false;
      if (filters.category && !filters.category.includes(f.category)) return false;
      return true;
    });
  }, [findings, filters]);

  return (
    <div className="finding-list">
      <div className="filters">
        <SeverityFilter onChange={(s) => setFilters({ severity: s })} />
        <CategoryFilter onChange={(c) => setFilters({ category: c })} />
        <SearchBox onChange={(q) => setFilters({ query: q })} />
      </div>
      <ul>
        {filtered.map(f => (
          <li key={f.id} onClick={() => onSelect(f)}>
            <span className={`severity-${f.severity}`}>{f.severity}</span>
            <span>{f.ruleId}</span>
            <span>{f.evidence[0]?.path}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

### Graph View Component

```typescript
// GraphView.tsx
function GraphView({ graph }: { graph: RepoGraphArtifact }) {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  // Generate Mermaid diagram
  const mermaidCode = useMemo(() => {
    return generateMermaidFromGraph(graph, selectedNode);
  }, [graph, selectedNode]);

  return (
    <div className="graph-view">
      <div className="mermaid-container">
        <Mermaid diagram={mermaidCode} />
      </div>
      <div className="node-detail">
        {selectedNode && renderNodeDetail(graph.files.find(f => f.id === selectedNode))}
      </div>
    </div>
  );
}
```

### Bundle Generation

```bash
# Build viewer bundle
npm run build:viewer

# Output: dist/viewer.bundle.js (embedded in HTML)
```

---

## 5. Technical Design

### Files to Create/Modify

| File | Action | Purpose |
|---|---|---|
| `viewer-app/src/App.tsx` | Create | Main React app |
| `viewer-app/src/components/*.tsx` | Create | UI components |
| `viewer-app/index.html` | Create | HTML shell |
| `viewer-app/webpack.config.js` | Create | Bundle config |
| `src/cli/viewer.ts` | Modify | Generate bundled HTML |

---

## 6. Dependencies

| Dependency | Type | Status |
|---|---|:---:|
| React | npm | New |
| Mermaid renderer | Existing | Active |
| webpack/esbuild | npm | New |

---

## 7. Acceptance Criteria

| Criterion | Measurable | Verification |
|---|---|---|
| Dynamic filtering works | Filters update list in real-time | Manual |
| Graph interactive | Click nodes to expand | Manual |
| Bundle embedded in HTML | Single HTML file with embedded JS | Automated |
| Performance acceptable | Load < 5s for 1000 findings | Automated |

---

## 8. Test Plan

### Component Tests
```typescript
describe("FindingList", () => {
  it("should filter by severity", () => {
    const filtered = filterFindings(mockFindings, { severity: ["critical"] });
    expect(filtered.every(f => f.severity === "critical")).toBe(true);
  });

  it("should search by ruleId", () => {
    const filtered = filterFindings(mockFindings, { query: "CLIENT" });
    expect(filtered.some(f => f.ruleId.includes("CLIENT"))).toBe(true);
  });
});
```

---

## 9. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|:---:|:---:|---|
| Bundle size too large | Medium | Medium | Tree shaking |
| Browser compatibility | Low | Low | ES5 target |
| Mermaid rendering issues | Low | Medium | Static fallback |

---

## 10. References

| Reference | Path |
|---|---|
| Current viewer | `src/viewer/*.ts` |
| Mermaid renderer | `src/viewer/mermaid-renderer-js.ts` |
| Report sections | `src/viewer/report-sections.ts` |