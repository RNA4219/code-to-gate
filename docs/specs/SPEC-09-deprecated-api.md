# SPEC-09: DEPRECATED_API_USAGE Rule

**Version**: v1.0
**Created**: 2026-05-04
**Status**: draft
**Priority**: P1
**Estimated Time**: 2 hours

---

## 1. Purpose

Detect usage of deprecated APIs and functions to help developers update code before breaking changes.

---

## 2. Scope

### Included
- Deprecated function detection
- Deprecated package/API detection
- Deprecation comment annotation parsing
- Severity based on removal timeline

### Excluded
- Auto-fix for deprecated APIs
- Deprecation database maintenance
- Third-party deprecation tracking

---

## 3. Current State

**Status**: Not implemented

**Similar Rules**: None directly comparable

**Need**: Many projects use deprecated APIs unknowingly, leading to future breakage.

---

## 4. Proposed Implementation

### Detection Patterns

```typescript
// Pattern 1: @deprecated JSDoc annotation
/**
 * @deprecated Use newFunction() instead
 */
function oldFunction() {}

// Pattern 2: Deprecated package imports
import { deprecatedFunc } from "old-package"; // package marked deprecated

// Pattern 3: Known deprecated APIs
// Node.js deprecated APIs
process.exitCode = 1; // deprecated in Node.js 20+

// React deprecated patterns
componentWillMount() {} // deprecated in React 16.3+
```

### Rule Implementation

```typescript
// src/rules/deprecated-api.ts
export const DEPRECATED_API_USAGE_RULE: RulePlugin = {
  id: "DEPRECATED_API_USAGE",
  name: "Deprecated API Usage",
  description: "Detects usage of deprecated APIs, functions, or packages.",
  category: "compatibility",
  defaultSeverity: "medium",
  defaultConfidence: 0.90,

  evaluate(context: RuleContext): Finding[] {
    const findings: Finding[] = [];
    const deprecatedApis = loadDeprecatedApiDatabase();

    for (const file of context.graph.files) {
      if (file.role !== "source") continue;

      const content = context.getFileContent(file.path);
      if (!content) continue;

      // 1. Check for @deprecated annotations in same file
      const deprecatedInFile = findDeprecatedAnnotations(content);

      // 2. Check for known deprecated API usage
      for (const api of deprecatedApis) {
        if (content.includes(api.pattern)) {
          findings.push(createDeprecatedFinding(file, api, content));
        }
      }

      // 3. Check for usage of functions marked @deprecated
      for (const dep of deprecatedInFile) {
        if (isUsed(content, dep.name)) {
          findings.push(createLocalDeprecatedFinding(file, dep));
        }
      }
    }

    return findings;
  },
};
```

### Deprecated API Database

```typescript
// src/rules/deprecated-api-db.ts
interface DeprecatedApi {
  name: string;
  pattern: string;
  replacement: string;
  removalVersion?: string;
  severity: Severity;
  source: "nodejs" | "react" | "typescript" | "custom";
}

const DEPRECATED_APIS: DeprecatedApi[] = [
  {
    name: "process.exitCode setter",
    pattern: "process.exitCode =",
    replacement: "process.exit(code)",
    removalVersion: "Node.js 22",
    severity: "medium",
    source: "nodejs",
  },
  {
    name: "componentWillMount",
    pattern: "componentWillMount",
    replacement: "useEffect or componentDidMount",
    removalVersion: "React 17",
    severity: "high",
    source: "react",
  },
  // ... more APIs
];
```

---

## 5. Technical Design

### Files to Create/Modify

| File | Action | Purpose |
|---|---|---|
| `src/rules/deprecated-api.ts` | Create | Rule implementation |
| `src/rules/deprecated-api-db.ts` | Create | API database |
| `src/rules/index.ts` | Modify | Register rule |
| `src/rules/__tests__/deprecated-api.test.ts` | Create | Tests |
| `fixtures/demo-deprecated.ts` | Create | Test fixture |

---

## 6. Dependencies

| Dependency | Type | Status |
|---|---|:---:|
| Rule interface | Existing | Active |
| JSDoc parser | Optional | Available |

---

## 7. Acceptance Criteria

| Criterion | Measurable | Verification |
|---|---|---|
| Detects @deprecated functions | Finds usage of deprecated functions | Automated |
| Detects known deprecated APIs | Finds Node.js/React deprecated | Automated |
| Severity reflects removal timeline | High for imminent removal | Automated |
| Suggests replacement | Finding includes replacement | Automated |

---

## 8. Test Plan

### Test Fixture: fixtures/demo-deprecated.ts

```typescript
/**
 * @deprecated Use newMethod() instead. Will be removed in v2.0.
 */
function oldMethod() {
  return "old";
}

// SMELL: DEPRECATED_API_USAGE
const result = oldMethod(); // Using deprecated function
// END SMELL

// SMELL: DEPRECATED_API_USAGE - Node.js
process.exitCode = 1;
// END SMELL

// SMELL: DEPRECATED_API_USAGE - React
class MyComponent extends React.Component {
  componentWillMount() {} // Deprecated
}
// END SMELL
```

---

## 9. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|:---:|:---:|---|
| API database maintenance | High | Medium | Community contributions |
| False positives on similar names | Medium | Low | Exact pattern matching |
| Missing custom deprecations | Low | Low | Allow user-defined APIs |

---

## 10. References

| Reference | Path |
|---|---|
| Rule pattern | `src/rules/client-trusted-price.ts` |
| Node.js deprecations | https://nodejs.org/api/deprecations.html |
| React deprecations | https://react.dev/blog/ |