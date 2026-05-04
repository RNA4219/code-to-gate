# SPEC-25: Framework-specific Patterns

**Version**: v1.0
**Created**: 2026-05-04
**Status**: draft
**Priority**: P2
**Estimated Time**: 3 days

---

## 1. Purpose

Add framework-specific detection patterns for Express, FastAPI, NestJS, React to reduce false positives.

---

## 2. Scope

### Included
- Express.js route patterns
- FastAPI decorator patterns
- NestJS controller patterns
- React component patterns

### Excluded
- Django patterns (future)
- Spring patterns (future)
- Vue patterns (future)

---

## 3. Current State

**Status**: Generic patterns only

**Current Detection**: Regex-based patterns without framework awareness

**Problem**: Framework-specific patterns are missed or cause false positives.

---

## 4. Proposed Implementation

### Framework Detection

```typescript
// src/adapters/framework-detector.ts
type Framework = "express" | "fastapi" | "nestjs" | "react" | "generic";

function detectFramework(graph: RepoGraphArtifact): Framework {
  // Check package.json dependencies
  const dependencies = graph.dependencies || [];

  if (dependencies.some(d => d.name === "express")) return "express";
  if (dependencies.some(d => d.name === "@nestjs/core")) return "nestjs";
  if (dependencies.some(d => d.name === "fastapi")) return "fastapi";
  if (dependencies.some(d => d.name === "react")) return "react";

  return "generic";
}
```

### Express-specific Patterns

```typescript
// src/rules/patterns/express-patterns.ts
const EXPRESS_PATTERNS = {
  // Safe: express.json() middleware
  safeMiddleware: [
    /app\.use\s*\(\s*express\.json\s*\(\s*\)/,
    /bodyParser\.json/,
  ],

  // Route handler patterns
  routeHandler: [
    /(?:app|router)\.(?:get|post|put|delete|patch)\s*\(\s*["']([^"']+)["']/,
  ],

  // Auth middleware patterns
  authMiddleware: [
    /app\.use\s*\(\s*\/.*,\s*(?:authenticate|authMiddleware|requireAuth)/,
  ],
};

function isExpressSafeContext(content: string, lineNum: number): boolean {
  // Check if body parsing middleware is present
  return EXPRESS_PATTERNS.safeMiddleware.some(p => p.test(content));
}
```

### NestJS-specific Patterns

```typescript
// src/rules/patterns/nestjs-patterns.ts
const NESTJS_PATTERNS = {
  // Controller decorator
  controller: /@Controller\s*\(\s*["']([^"']+)["']\s*\)/,

  // Guard decorator (auth)
  guard: /@UseGuards\s*\(\s*\w+Guard/,

  // Safe: validated with class-validator
  validatedDto: /@Body\s*\(\s*\)\s*\w+:\s*\w+Dto/,

  // Safe: pipe validation
  validationPipe: /ValidationPipe|@UsePipes/,
};

function isNestJSSafeContext(content: string): boolean {
  // NestJS often uses class-validator for DTOs
  return NESTJS_PATTERNS.validationPipe.some(p => p.test(content));
}
```

### React-specific Patterns

```typescript
// src/rules/patterns/react-patterns.ts
const REACT_PATTERNS = {
  // Client-side component marker
  clientComponent: /["']use client["']|\.client\./,

  // Server component marker
  serverComponent: /["']use server["']|\.server\./,

  // Safe: controlled input
  controlledInput: /value=\s*\{\s*state/,

  // Dangerous: uncontrolled with default
  uncontrolledDanger: /defaultValue=\s*\{\s*props/,
};

function isReactClientComponent(file: RepoFile): boolean {
  return REACT_PATTERNS.clientComponent.test(file.path);
}
```

### Rule Enhancement

```typescript
// Modified rule evaluation with framework context
function evaluateWithContext(
  content: string,
  file: RepoFile,
  framework: Framework
): Finding[] {
  const findings: Finding[] = [];

  // Apply framework-specific safety checks
  const isSafe = framework === "express" ? isExpressSafeContext(content) :
                 framework === "nestjs" ? isNestJSSafeContext(content) :
                 false;

  // Only flag if not safe in framework context
  if (!isSafe) {
    findings.push(...genericEvaluate(content, file));
  }

  return findings;
}
```

---

## 5. Technical Design

### Files to Create/Modify

| File | Action | Purpose |
|---|---|---|
| `src/adapters/framework-detector.ts` | Create | Framework detection |
| `src/rules/patterns/express-patterns.ts` | Create | Express patterns |
| `src/rules/patterns/nestjs-patterns.ts` | Create | NestJS patterns |
| `src/rules/patterns/react-patterns.ts` | Create | React patterns |
| `src/rules/*.ts` | Modify | Use framework patterns |
| `docs/framework-patterns.md` | Create | Documentation |

---

## 6. Dependencies

| Dependency | Type | Status |
|---|---|:---:|
| Package.json parsing | Existing | Active |
| Import extraction | Existing | Active |
| Rule interface | Existing | Active |

---

## 7. Acceptance Criteria

| Criterion | Measurable | Verification |
|---|---|---|
| Framework detected correctly | Express/NestJS/React identified | Automated |
| FP reduced for Express | Express routes not flagged incorrectly | Automated |
| FP reduced for NestJS | NestJS DTOs not flagged | Automated |
| Client-side React detected | Client components identified | Automated |

---

## 8. Test Plan

### Framework Detection Test
```typescript
describe("framework-detector", () => {
  it("should detect Express", () => {
    const graph = { dependencies: [{ name: "express" }] };
    expect(detectFramework(graph)).toBe("express");
  });

  it("should detect NestJS", () => {
    const graph = { dependencies: [{ name: "@nestjs/core" }] };
    expect(detectFramework(graph)).toBe("nestjs");
  });
});

describe("express-patterns", () => {
  it("should recognize safe middleware", () => {
    const content = "app.use(express.json())";
    expect(isExpressSafeContext(content, 1)).toBe(true);
  });
});
```

---

## 9. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|:---:|:---:|---|
| Framework version differences | Medium | Low | Version-aware patterns |
| Mixed frameworks | Low | Low | Per-file detection |
| Custom middleware naming | Medium | Medium | Common pattern coverage |

---

## 10. References

| Reference | Path |
|---|---|
| Import extraction | `src/adapters/ts-adapter.ts` |
| Dependencies | `src/types/graph.ts` |
| Express docs | https://expressjs.com/ |
| NestJS docs | https://nestjs.com/ |