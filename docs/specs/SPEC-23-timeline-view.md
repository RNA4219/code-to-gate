# SPEC-23: Finding Timeline View

**Version**: v1.0
**Created**: 2026-05-04
**Status**: draft
**Priority**: P3
**Estimated Time**: 3 days

---

## 1. Purpose

Display findings timeline to show trend of findings over time (increasing/decreasing).

---

## 2. Scope

### Included
- Historical finding comparison
- Timeline visualization
- New/resolved finding tracking
- Trend analysis

### Excluded
- Real-time updates
- External timeline library integration
- Email/report generation

---

## 3. Current State

**Status**: Historical comparison exists (`code-to-gate historical`)

**Current Historical**: Shows new/resolved/unchanged findings

**Need**: Visual timeline for trend understanding.

---

## 4. Proposed Implementation

### Timeline Data Structure

```typescript
// src/historical/timeline-data.ts
interface TimelinePoint {
  date: string;              // ISO date
  runId: string;
  totalFindings: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  newFindings: number;
  resolvedFindings: number;
}

interface TimelineData {
  points: TimelinePoint[];
  trend: "improving" | "stable" | "worsening";
  averageNewPerWeek: number;
  averageResolvedPerWeek: number;
}
```

### Timeline Generator

```typescript
// src/historical/timeline-generator.ts
async function generateTimeline(
  historicalRuns: HistoricalRun[]
): Promise<TimelineData> {
  const points: TimelinePoint[] = historicalRuns.map(run => ({
    date: run.generatedAt,
    runId: run.runId,
    totalFindings: run.findings.length,
    critical: run.findings.filter(f => f.severity === "critical").length,
    high: run.findings.filter(f => f.severity === "high").length,
    medium: run.findings.filter(f => f.severity === "medium").length,
    low: run.findings.filter(f => f.severity === "low").length,
    newFindings: run.newFindings?.length || 0,
    resolvedFindings: run.resolvedFindings?.length || 0,
  }));

  // Calculate trend
  const recentPoints = points.slice(-5);
  const olderPoints = points.slice(0, -5);

  const recentAvg = average(recentPoints.map(p => p.totalFindings));
  const olderAvg = average(olderPoints.map(p => p.totalFindings));

  const trend = recentAvg < olderAvg * 0.9 ? "improving" :
                recentAvg > olderAvg * 1.1 ? "worsening" : "stable";

  return {
    points,
    trend,
    averageNewPerWeek: average(points.map(p => p.newFindings)),
    averageResolvedPerWeek: average(points.map(p => p.resolvedFindings)),
  };
}
```

### Timeline Viewer (HTML)

```typescript
// src/viewer/timeline-viewer.ts
function generateTimelineHtml(data: TimelineData): string {
  return `
    <div class="timeline">
      <h2>Finding Timeline</h2>
      <div class="trend-summary">
        <span class="trend-${data.trend}">Trend: ${data.trend}</span>
        <span>Avg new/week: ${data.averageNewPerWeek.toFixed(1)}</span>
        <span>Avg resolved/week: ${data.averageResolvedPerWeek.toFixed(1)}</span>
      </div>
      <div class="timeline-chart">
        <svg viewBox="0 0 800 400">
          <!-- X axis: dates -->
          <!-- Y axis: finding count -->
          <!-- Lines: total, critical, high, medium, low -->
          ${generateTimelineChart(data.points)}
        </svg>
      </div>
      <div class="timeline-details">
        ${data.points.map(p => `
          <div class="timeline-point">
            <span class="date">${p.date}</span>
            <span class="total">${p.totalFindings}</span>
            <span class="new">+${p.newFindings}</span>
            <span class="resolved">-${p.resolvedFindings}</span>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function generateTimelineChart(points: TimelinePoint[]): string {
  const maxTotal = Math.max(...points.map(p => p.totalFindings));
  const width = 800;
  const height = 400;
  const margin = 50;

  // Scale points to SVG coordinates
  const xScale = (i: number) => margin + (i * (width - 2 * margin) / (points.length - 1));
  const yScale = (v: number) => height - margin - (v * (height - 2 * margin) / maxTotal);

  // Generate paths for each severity line
  return `
    <path d="${points.map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(i)} ${yScale(p.totalFindings)}`).join(" ")}" 
          fill="none" stroke="blue" stroke-width="2"/>
    <path d="${points.map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(i)} ${yScale(p.critical)}`).join(" ")}" 
          fill="none" stroke="red" stroke-width="2"/>
    <path d="${points.map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(i)} ${yScale(p.high)}`).join(" ")}" 
          fill="none" stroke="orange" stroke-width="2"/>
  `;
}
```

---

## 5. Technical Design

### Files to Create/Modify

| File | Action | Purpose |
|---|---|---|
| `src/historical/timeline-data.ts` | Create | Data types |
| `src/historical/timeline-generator.ts` | Create | Timeline logic |
| `src/viewer/timeline-viewer.ts` | Create | HTML generation |
| `src/cli/timeline.ts` | Create | CLI command |
| `docs/timeline-view.md` | Create | Documentation |

---

## 6. Dependencies

| Dependency | Type | Status |
|---|---|:---:|
| Historical comparison | Existing | Active |
| SVG generation | Custom | New |
| Viewer framework | Existing | Active |

---

## 7. Acceptance Criteria

| Criterion | Measurable | Verification |
|---|---|---|
| Timeline data generated | Points array populated | Automated |
| Trend calculated correctly | improving/stable/worsening | Automated |
| HTML viewer displays timeline | SVG chart rendered | Manual |
| New/resolved tracked | Delta values shown | Automated |

---

## 8. Test Plan

### Timeline Tests
```typescript
describe("timeline-generator", () => {
  it("should calculate improving trend", () => {
    const points = [
      { date: "2026-01-01", totalFindings: 100 },
      { date: "2026-01-08", totalFindings: 80 },
      { date: "2026-01-15", totalFindings: 60 },
    ];
    const data = generateTimeline(points);
    expect(data.trend).toBe("improving");
  });

  it("should calculate worsening trend", () => {
    const points = [
      { date: "2026-01-01", totalFindings: 50 },
      { date: "2026-01-08", totalFindings: 80 },
      { date: "2026-01-15", totalFindings: 100 },
    ];
    const data = generateTimeline(points);
    expect(data.trend).toBe("worsening");
  });
});
```

---

## 9. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|:---:|:---:|---|
| Insufficient historical data | High | Medium | Minimum 3 points |
| SVG scaling issues | Low | Low | Dynamic scaling |
| Trend calculation accuracy | Medium | Low | Weighted average |

---

## 10. References

| Reference | Path |
|---|---|
| Historical module | `src/historical/*.ts` |
| Viewer module | `src/viewer/*.ts` |
| Regression detection | `src/historical/regression.ts` |