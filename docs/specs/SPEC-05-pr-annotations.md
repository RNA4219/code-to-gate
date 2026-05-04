# SPEC-05: GitHub PR Annotations

**Version**: v1.0
**Created**: 2026-05-04
**Status**: draft
**Priority**: P2
**Estimated Time**: 30 minutes

---

## 1. Purpose

Display findings as GitHub PR inline annotations for better developer experience and faster issue identification.

---

## 2. Scope

### Included
- GitHub Checks API annotation creation
- Severity to annotation level mapping
- Maximum annotations handling (GitHub limit: 50)
- Annotation click-to-code-line linking

### Excluded
- SARIF upload (already implemented)
- PR comment summary (already implemented)
- Third-party annotation services

---

## 3. Current State

**Status**: Checks API implemented, annotations generated

**Current Implementation** (`src/github/checks.ts`):
- `createCheckRun()` creates check with annotations
- `severityToAnnotationLevel()` maps severity
- Annotations limited to 50 (GitHub limit)

**Missing**: Explicit annotation display verification in PR UI

---

## 4. Proposed Implementation

### Current Annotation Flow

1. Analysis runs → findings.json generated
2. Checks action reads findings
3. `createAnnotationFromFinding()` creates annotations
4. POST to GitHub Checks API

### Enhancement: Annotation Quality

Improve annotation content for better DX:

```typescript
// Enhanced annotation format
interface EnhancedAnnotation {
  path: string;
  start_line: number;
  end_line: number;
  annotation_level: "failure" | "warning" | "notice";
  message: string;  // Finding summary
  title: string;    // Rule ID + severity
  raw_details?: string; // Full finding details (optional)
}
```

### Implementation Enhancement

```typescript
// src/github/checks.ts enhancement
function createAnnotationFromFinding(finding: Finding): CheckAnnotation | null {
  const evidence = finding.evidence[0];
  if (!evidence || !evidence.path) return null;

  return {
    path: evidence.path,
    start_line: evidence.startLine || 1,
    end_line: evidence.endLine || evidence.startLine || 1,
    annotation_level: severityToAnnotationLevel(finding.severity),
    message: finding.summary,
    title: `[${finding.severity.toUpperCase()}] ${finding.ruleId}`,
    raw_details: JSON.stringify({
      category: finding.category,
      confidence: finding.confidence,
      tags: finding.tags,
    }),
  };
}
```

---

## 5. Technical Design

### Files to Modify

| File | Changes |
|---|---|
| `src/github/checks.ts` | Enhanced annotation content |
| `.github/actions/checks/action.yml` | Verify annotation handling |
| `src/github/__tests__/checks.test.ts` | Test annotation generation |

### No New Files Required

---

## 6. Dependencies

| Dependency | Type | Status |
|---|---|:---:|
| GitHub Checks API | External | Active |
| GitHub Actions | Existing | Active |
| GITHUB_TOKEN | Secret | Required |

---

## 7. Acceptance Criteria

| Criterion | Measurable | Verification |
|---|---|---|
| PR shows inline annotations | Annotations visible in PR "Files changed" | Manual |
| Annotation level matches severity | critical→failure, high→warning, medium→notice | Automated |
| Click annotation links to code | GitHub links to correct line | Manual |
| Max 50 annotations handled | High finding count truncated to 50 | Automated |

---

## 8. Test Plan

### Unit Test
```typescript
describe("createAnnotationFromFinding", () => {
  it("should create failure annotation for critical", () => {
    const finding = { severity: "critical", ... };
    const annotation = createAnnotationFromFinding(finding);
    expect(annotation.annotation_level).toBe("failure");
  });
});
```

### Integration Test
1. Create PR with findings
2. Check GitHub PR UI for annotations
3. Verify annotation appears on correct line
4. Verify severity color matches

---

## 9. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|:---:|:---:|---|
| GitHub API changes | Low | Medium | API versioning |
| Annotation limit exceeded | Medium | Low | Sort by severity, limit to 50 |
| UI display issues | Low | Low | Test with real PR |

---

## 10. References

| Reference | Path |
|---|---|
| Checks implementation | `src/github/checks.ts` |
| Checks action | `.github/actions/checks/action.yml` |
| Checks tests | `src/github/__tests__/checks.test.ts` |
| GitHub Checks API docs | https://docs.github.com/en/rest/checks |