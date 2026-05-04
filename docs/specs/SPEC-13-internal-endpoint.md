# SPEC-13: EXPOSED_INTERNAL_ENDPOINT Rule

**Version**: v1.0
**Created**: 2026-05-04
**Status**: draft
**Priority**: P2
**Estimated Time**: 2 hours

---

## 1. Purpose

Detect internal/admin endpoints that may be exposed to public access without proper authentication or authorization.

---

## 2. Scope

### Included
- Admin/debug endpoint detection
- Missing authentication check on sensitive routes
- Internal API exposure patterns
- Health/debug endpoint security

### Excluded
- Rate limiting detection (separate rule)
- CORS configuration issues
- Network-level security (firewall, VPN)

---

## 3. Current State

**Status**: Not implemented

**Related**: WEAK_AUTH_GUARD (detects weak authorization)

**Need**: Internal endpoints exposed publicly are a common security issue.

---

## 4. Proposed Implementation

### Detection Patterns

```typescript
// Pattern 1: Admin routes without auth
// ❌ Unsafe
app.get("/admin/users", (req, res) => { ... }); // No auth middleware

// ✓ Safe
app.get("/admin/users", authenticate, authorize("admin"), (req, res) => { ... });

// Pattern 2: Debug endpoints
// ❌ Unsafe
app.get("/debug/env", (req, res) => { res.json(process.env); });

// ✓ Safe
app.get("/debug/env", authenticate, (req, res) => { ... });

// Pattern 3: Internal API routes
// ❌ Unsafe
app.post("/internal/sync", (req, res) => { ... });

// Pattern 4: Health check exposure
// OK if limited
app.get("/health", (req, res) => { res.json({ status: "ok" }); }); // Safe if minimal
```

### Internal Endpoint Patterns

```typescript
const INTERNAL_PATTERNS = [
  { path: "/admin", severity: "critical" },
  { path: "/debug", severity: "high" },
  { path: "/internal", severity: "high" },
  { path: "/metrics", severity: "medium" },
  { path: "/config", severity: "critical" },
  { path: "/settings", severity: "high" },
  { path: "/management", severity: "critical" },
];
```

### Rule Implementation

```typescript
export const EXPOSED_INTERNAL_ENDPOINT_RULE: RulePlugin = {
  id: "EXPOSED_INTERNAL_ENDPOINT",
  name: "Exposed Internal Endpoint",
  description: "Detects internal/admin endpoints that may be exposed without proper authentication.",
  category: "security",
  defaultSeverity: "high",
  defaultConfidence: 0.80,

  evaluate(context: RuleContext): Finding[] {
    const findings: Finding[] = [];

    for (const file of context.graph.files) {
      if (file.role !== "source") continue;
      if (!["ts", "tsx", "js", "jsx"].includes(file.language)) continue;

      const content = context.getFileContent(file.path);
      if (!content) continue;

      const lines = content.split("\n");

      // Find route definitions
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Express/Fastify route pattern
        const routeMatch = line.match(/(?:app|router)\.(?:get|post|put|delete|patch)\s*\(\s*["']([^"']+)["']/);
        if (routeMatch) {
          const path = routeMatch[1];

          // Check if path matches internal pattern
          for (const internal of INTERNAL_PATTERNS) {
            if (path.startsWith(internal.path) || path.includes(internal.path)) {
              // Check for authentication middleware
              const nextLine = lines.slice(i, i + 3).join("\n");
              const hasAuth = 
                nextLine.includes("authenticate") ||
                nextLine.includes("auth") ||
                nextLine.includes("authorize") ||
                nextLine.includes("middleware") ||
                nextLine.includes("requireAuth");

              if (!hasAuth) {
                findings.push(createExposedEndpointFinding(file, i + 1, path, internal));
              }
            }
          }
        }
      }
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
| `src/rules/exposed-internal-endpoint.ts` | Create | Rule implementation |
| `src/rules/index.ts` | Modify | Register rule |
| `src/rules/__tests__/exposed-internal-endpoint.test.ts` | Create | Tests |
| `fixtures/demo-internal-endpoints.ts` | Create | Test fixture |

---

## 6. Dependencies

| Dependency | Type | Status |
|---|---|:---:|
| WEAK_AUTH_GUARD | Existing | Related |
| Route extraction | Existing | Active (adapters) |

---

## 7. Acceptance Criteria

| Criterion | Measurable | Verification |
|---|---|---|
| Detects /admin without auth | Finds exposed admin routes | Automated |
| Detects /debug without auth | Finds exposed debug routes | Automated |
| Detects /internal routes | Finds internal routes | Automated |
| Respects auth middleware | No finding with auth middleware | Automated |
| Severity based on path sensitivity | admin > debug > metrics | Automated |

---

## 8. Test Plan

### Test Fixture: fixtures/demo-internal-endpoints.ts

```typescript
// SMELL: EXPOSED_INTERNAL_ENDPOINT
app.get("/admin/users", (req, res) => {
  res.json(users); // No auth!
});
// END SMELL

// SMELL: EXPOSED_INTERNAL_ENDPOINT
app.get("/debug/env", (req, res) => {
  res.json(process.env); // No auth!
});
// END SMELL

// Safe pattern - should NOT trigger
app.get("/admin/users", authenticate, authorize("admin"), (req, res) => {
  res.json(users);
});

// Safe health endpoint - should NOT trigger (minimal exposure)
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});
```

---

## 9. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|:---:|:---:|---|
| False positives on public routes | Medium | Medium | Exclude public patterns |
| Framework variations | Medium | Low | Multi-framework patterns |
| Auth function naming | Low | Low | Common auth names |

---

## 10. References

| Reference | Path |
|---|---|
| WEAK_AUTH_GUARD rule | `src/rules/weak-auth-guard.ts` |
| Route extraction | `src/adapters/ts-adapter.ts` |
| OWASP API Security | https://owasp.org/www-project-api-security/ |