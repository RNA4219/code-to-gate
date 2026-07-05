# SPEC-25: Framework-specific Patterns

**Version**: v1.0
**Created**: 2026-05-04
**Status**: draft
**Priority**: P2
**Estimated Time**: 3 days

---

## 1. Purpose

Add framework-specific detection patterns for Express, Fastify, NestJS, and Next.js to reduce false positives.

---

## 2. Scope

### Included
- Express route and middleware patterns
- Fastify route, hook, and schema patterns
- NestJS controller, guard, pipe, and DTO patterns
- Next.js App Router / Pages Router / Server Action patterns

### Excluded
- Django patterns (future)
- Spring patterns (future)
- Vue patterns (future)
- Generic React component styling rules; only Next.js routing/security contexts are in scope

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
type Framework = "express" | "fastify" | "nestjs" | "nextjs" | "generic";

function detectFramework(graph: RepoGraphArtifact): Framework {
  // Check package.json dependencies
  const dependencies = graph.dependencies || [];

  if (dependencies.some(d => d.name === "express")) return "express";
  if (dependencies.some(d => d.name === "fastify" || d.name === "@fastify/websocket")) return "fastify";
  if (dependencies.some(d => d.name === "@nestjs/core")) return "nestjs";
  if (dependencies.some(d => d.name === "next")) return "nextjs";

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

### Fastify-specific Patterns

```typescript
// src/rules/patterns/fastify-patterns.ts
const FASTIFY_PATTERNS = {
  routeHandler: [
    /fastify\.(?:get|post|put|delete|patch)\s*\(\s*["']([^"']+)["']/,
    /fastify\.route\s*\(\s*\{[\s\S]*?url:\s*["']([^"']+)["']/,
  ],
  authHook: [
    /preHandler:\s*(?:authenticate|requireAuth|verifyToken)/,
    /fastify\.addHook\s*\(\s*["']preHandler["']\s*,\s*(?:authenticate|requireAuth|verifyToken)/,
  ],
  schemaValidation: [
    /schema:\s*\{[\s\S]*?(?:body|params|querystring):/,
  ],
};

function isFastifySafeContext(content: string): boolean {
  return FASTIFY_PATTERNS.authHook.some(p => p.test(content)) ||
    FASTIFY_PATTERNS.schemaValidation.some(p => p.test(content));
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

### Next.js-specific Patterns

```typescript
// src/rules/patterns/nextjs-patterns.ts
const NEXTJS_PATTERNS = {
  // Route handlers
  appRouteHandler: /export\s+async\s+function\s+(?:GET|POST|PUT|DELETE|PATCH)\s*\(/,
  pagesApiRoute: /export\s+default\s+(?:async\s+)?function\s+handler\s*\(/,

  // Server/client markers
  serverAction: /["']use server["']/,
  clientComponent: /["']use client["']/,

  // Safe context hints
  nextAuth: /getServerSession|auth\s*\(|withAuth/,
  middleware: /export\s+function\s+middleware\s*\(/,
};

function isNextRouteFile(filePath: string): boolean {
  return /(?:app\/api\/.*\/route|pages\/api\/.*)\.(?:ts|tsx|js|jsx)$/.test(filePath);
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
                 framework === "fastify" ? isFastifySafeContext(content) :
                 framework === "nestjs" ? isNestJSSafeContext(content) :
                 framework === "nextjs" ? isNextSafeContext(content, file.path) :
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
| `src/rules/patterns/fastify-patterns.ts` | Create | Fastify patterns |
| `src/rules/patterns/nestjs-patterns.ts` | Create | NestJS patterns |
| `src/rules/patterns/nextjs-patterns.ts` | Create | Next.js patterns |
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
| Framework detected correctly | Express/Fastify/NestJS/Next.js identified | Automated |
| FP reduced for Express | Express routes not flagged incorrectly | Automated |
| FP reduced for Fastify | Fastify schema/hook-protected routes not flagged incorrectly | Automated |
| FP reduced for NestJS | NestJS DTOs not flagged | Automated |
| Next.js route context detected | App Router and Pages API routes identified | Automated |

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

  it("should detect Fastify", () => {
    const graph = { dependencies: [{ name: "fastify" }] };
    expect(detectFramework(graph)).toBe("fastify");
  });

  it("should detect Next.js", () => {
    const graph = { dependencies: [{ name: "next" }] };
    expect(detectFramework(graph)).toBe("nextjs");
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
| Fastify docs | https://fastify.dev/ |
| NestJS docs | https://nestjs.com/ |
| Next.js docs | https://nextjs.org/docs |
