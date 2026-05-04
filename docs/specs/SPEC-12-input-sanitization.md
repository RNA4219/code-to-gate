# SPEC-12: MISSING_INPUT_SANITIZATION Rule

**Version**: v1.0
**Created**: 2026-05-04
**Status**: draft
**Priority**: P1
**Estimated Time**: 2 hours

---

## 1. Purpose

Detect missing input sanitization for user-supplied data to prevent injection attacks and data corruption.

---

## 2. Scope

### Included
- User input used in database queries
- User input used in DOM manipulation
- User input used in file operations
- User input used in command execution

### Excluded
- Output encoding detection
- CSRF token detection
- Input validation (length, format) - separate concern

---

## 3. Current State

**Status**: Not implemented

**Related**: MISSING_SERVER_VALIDATION (validates request body structure)

**Need**: Injection attacks (XSS, SQL injection, command injection) are top OWASP vulnerabilities.

---

## 4. Proposed Implementation

### Detection Patterns

```typescript
// Pattern 1: SQL injection risk
// ❌ Unsafe
const query = `SELECT * FROM users WHERE id = ${req.params.id}`;

// ✓ Safe
const query = "SELECT * FROM users WHERE id = ?";
db.query(query, [req.params.id]);

// Pattern 2: XSS risk
// ❌ Unsafe
element.innerHTML = req.body.content;

// ✓ Safe
element.textContent = sanitize(req.body.content);

// Pattern 3: Command injection
// ❌ Unsafe
exec(`cat ${req.query.file}`);

// ✓ Safe
exec(`cat ${escapeShellArg(req.query.file)}`);

// Pattern 4: Path traversal
// ❌ Unsafe
fs.readFile(`/data/${req.params.filename}`);

// ✓ Safe
const safePath = path.join("/data", sanitizeFilename(req.params.filename));
```

### Rule Implementation

```typescript
export const MISSING_INPUT_SANITIZATION_RULE: RulePlugin = {
  id: "MISSING_INPUT_SANITIZATION",
  name: "Missing Input Sanitization",
  description: "Detects user input used without sanitization in dangerous contexts.",
  category: "security",
  defaultSeverity: "critical",
  defaultConfidence: 0.85,

  evaluate(context: RuleContext): Finding[] {
    const findings: Finding[] = [];
    const dangerContexts = [
      { pattern: /`.*\$\{.*(?:req|request|body|query|params).*\}.*`/, type: "sql", severity: "critical" },
      { pattern: /\.innerHTML\s*=\s*(?:req|request|body|query)/, type: "xss", severity: "critical" },
      { pattern: /exec\s*\(\s*`.*(?:req|request|query)/, type: "command", severity: "critical" },
      { pattern: /fs\.(?:read|write).*\`.*(?:req|request|params)/, type: "path", severity: "high" },
    ];

    for (const file of context.graph.files) {
      if (file.role !== "source") continue;

      const content = context.getFileContent(file.path);
      if (!content) continue;

      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const prevLines = lines.slice(Math.max(0, i - 5), i).join("\n");

        for (const ctx of dangerContexts) {
          ctx.pattern.lastIndex = 0;
          const match = ctx.pattern.exec(line);

          if (match) {
            // Check for sanitization nearby
            const hasSanitization = 
              prevLines.includes("sanitize") ||
              prevLines.includes("escape") ||
              prevLines.includes("validate") ||
              prevLines.includes("whitelist") ||
              line.includes("sanitize") ||
              line.includes("escape");

            if (!hasSanitization) {
              findings.push(createSanitizationFinding(file, i + 1, ctx, line));
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
| `src/rules/missing-input-sanitization.ts` | Create | Rule implementation |
| `src/rules/index.ts` | Modify | Register rule |
| `src/rules/__tests__/missing-input-sanitization.test.ts` | Create | Tests |
| `fixtures/demo-sanitization.ts` | Create | Test fixture |

---

## 6. Dependencies

| Dependency | Type | Status |
|---|---|:---:|
| RAW_SQL rule | Existing | Related |
| Pattern detection | Existing | Active |

---

## 7. Acceptance Criteria

| Criterion | Measurable | Verification |
|---|---|---|
| Detects SQL injection risk | Finds template literal SQL | Automated |
| Detects XSS risk | Finds innerHTML assignment | Automated |
| Detects command injection | Finds exec with user input | Automated |
| Detects path traversal | Finds fs operations with user input | Automated |
| Respects sanitization patterns | No finding with sanitize call | Automated |

---

## 8. Test Plan

### Test Fixture: fixtures/demo-sanitization.ts

```typescript
// SMELL: MISSING_INPUT_SANITIZATION - SQL
app.get("/user/:id", (req, res) => {
  const query = `SELECT * FROM users WHERE id = ${req.params.id}`;
  db.query(query);
});
// END SMELL

// SMELL: MISSING_INPUT_SANITIZATION - XSS
app.post("/comment", (req, res) => {
  element.innerHTML = req.body.comment; // VULNERABLE
});
// END SMELL

// SMELL: MISSING_INPUT_SANITIZATION - Command
app.get("/file", (req, res) => {
  exec(`cat ${req.query.filename}`); // VULNERABLE
});
// END SMELL

// Safe pattern - should NOT trigger
app.get("/user/:id", (req, res) => {
  const safeId = sanitize(req.params.id);
  const query = `SELECT * FROM users WHERE id = ?`;
  db.query(query, [safeId]);
});
```

---

## 9. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|:---:|:---:|---|
| False positives on safe patterns | Medium | Medium | Check sanitization context |
| Missing sanitization functions | Medium | Low | Common function names |
| ORM usage patterns | Low | Low | ORM method detection |

---

## 10. References

| Reference | Path |
|---|---|
| RAW_SQL rule | `src/rules/raw-sql.ts` |
| OWASP Top 10 | https://owasp.org/www-project-top-ten/ |
| Rule pattern | `src/rules/*.ts` |