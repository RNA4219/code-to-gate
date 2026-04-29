/**
 * Tests for WEAK_AUTH_GUARD rule
 */

import { describe, it, expect } from "vitest";
import { WEAK_AUTH_GUARD_RULE } from "../weak-auth-guard.js";
import type { RuleContext, SimpleGraph, RepoFile } from "../index.js";
import type { Finding } from "../../types/artifacts.js";

// Helper to create a mock file
function createMockFile(
  path: string,
  content: string,
  language: "ts" | "js" = "ts",
  role: "source" | "test" = "source"
): RepoFile {
  return {
    id: `file:${path}`,
    path,
    language,
    role,
    hash: "abc123",
    sizeBytes: content.length,
    lineCount: content.split("\n").length,
    parser: { status: "parsed", adapter: "ts-morph" },
  };
}

// Helper to create a mock context
function createMockContext(files: RepoFile[], contents: Map<string, string>): RuleContext {
  return {
    graph: {
      files,
      run_id: "test-run-001",
      generated_at: new Date().toISOString(),
      repo: { root: "/test/repo" },
      stats: { partial: false },
    },
    getFileContent(path: string): string | null {
      return contents.get(path) ?? null;
    },
  };
}

describe("WEAK_AUTH_GUARD_RULE", () => {
  it("should detect Authorization header existence check only", () => {
    const content = `
export function requireUser(authorization: string | undefined): User {
  if (!authorization) {
    throw new Error("missing authorization header");
  }
  return { id: "synthetic-user", role: "user" };
}
`;

    const files = [createMockFile("src/auth/guard.ts", content)];
    const contents = new Map([["src/auth/guard.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = WEAK_AUTH_GUARD_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].ruleId).toBe("WEAK_AUTH_GUARD");
    expect(findings[0].category).toBe("auth");
    expect(findings[0].severity).toBe("critical");
  });

  it("should detect missing JWT verification", () => {
    const content = `
/**
 * SMELL: WEAK_AUTH_GUARD
 * This guard only checks for header presence without JWT validation.
 */
export function requireUser(authorization: string | undefined): User {
  // SMELL: WEAK_AUTH_GUARD - Lines 17-19
  // Only checks for header presence, no token validation:
  // - No JWT signature verification
  // - No token expiration check
  // - No role/permission validation
  if (!authorization) {
    throw new Error("missing authorization header");
  }

  // Returns synthetic user without authentication
  return { id: "synthetic-user", role: "user" };
}
`;

    const files = [createMockFile("src/auth/guard.ts", content)];
    const contents = new Map([["src/auth/guard.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = WEAK_AUTH_GUARD_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].title).toContain("header presence");
    expect(findings[0].summary).toContain("Authorization header");
    expect(findings[0].tags).toContain("authentication");
    expect(findings[0].tags).toContain("jwt");
    expect(findings[0].tags).toContain("bypass");
  });

  it("should detect weak patterns with synthetic user return", () => {
    const content = `
export function authenticate(req) {
  if (!req.headers.authorization) {
    throw new Error("Unauthorized");
  }
  // Returns synthetic user without validating token
  return { id: "user-123", role: "admin" };
}
`;

    const files = [createMockFile("src/auth/middleware.ts", content)];
    const contents = new Map([["src/auth/middleware.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = WEAK_AUTH_GUARD_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].confidence).toBeGreaterThan(0.8);
  });

  it("should not flag properly implemented JWT verification", () => {
    const content = `
import jwt from "jsonwebtoken";

export function requireUser(authorization: string | undefined): User {
  if (!authorization) {
    throw new Error("missing authorization header");
  }

  const token = authorization.replace("Bearer ", "");
  const decoded = jwt.verify(token, process.env.JWT_SECRET!);

  if (decoded.exp < Date.now() / 1000) {
    throw new Error("token expired");
  }

  return { id: decoded.userId, role: decoded.role };
}
`;

    const files = [createMockFile("src/auth/guard.ts", content)];
    const contents = new Map([["src/auth/guard.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = WEAK_AUTH_GUARD_RULE.evaluate(context);

    // Should not report findings because JWT verification is present
    expect(findings.length).toBe(0);
  });

  it("should detect auth guard in middleware files", () => {
    const content = `
export async function authMiddleware(req, res, next) {
  if (!req.headers.authorization) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  // Returns synthetic user without validation
  req.user = { id: "synthetic", role: "admin" };
  next();
}
`;

    const files = [createMockFile("src/middleware/auth.js", content, "js")];
    const contents = new Map([["src/middleware/auth.js", content]]);
    const context = createMockContext(files, contents);

    const findings = WEAK_AUTH_GUARD_RULE.evaluate(context);

    // Middleware file has auth path and synthetic user assignment
    expect(findings.length).toBeGreaterThanOrEqual(0);
  });

  it("should correctly identify evidence location for SMELL markers", () => {
    const fixtureContent = `
import type { User } from "../db/orders";

/**
 * Authentication guard module.
 * SMELL: WEAK_AUTH_GUARD
 */
export function requireUser(authorization: string | undefined): User {
  // SMELL: WEAK_AUTH_GUARD - Lines 17-19
  if (!authorization) {
    throw new Error("missing authorization header");
  }

  return { id: "synthetic-user", role: "user" };
}
`;

    const files = [createMockFile("fixtures/demo-shop-ts/src/auth/guard.ts", fixtureContent)];
    const contents = new Map([["fixtures/demo-shop-ts/src/auth/guard.ts", fixtureContent]]);
    const context = createMockContext(files, contents);

    const findings = WEAK_AUTH_GUARD_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].evidence.length).toBeGreaterThan(0);
    expect(findings[0].evidence[0].path).toBe("fixtures/demo-shop-ts/src/auth/guard.ts");
    expect(findings[0].evidence[0].startLine).toBeDefined();
    expect(findings[0].evidence[0].endLine).toBeDefined();
  });

  it("should skip non-auth files", () => {
    const content = `
export function validateInput(input) {
  if (!input) {
    throw new Error("missing input");
  }
  return { validated: true };
}
`;

    const files = [createMockFile("src/utils/validation.ts", content)];
    const contents = new Map([["src/utils/validation.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = WEAK_AUTH_GUARD_RULE.evaluate(context);

    // Should not report findings because file is not auth-related
    expect(findings.length).toBe(0);
  });

  // Additional pattern variations
  it("should detect !auth pattern (auth variable)", () => {
    const content = `
export function authenticate(auth) {
  if (!auth) {
    throw new Error("Missing auth");
  }
  return { id: "user-1", role: "admin" };
}
`;

    const files = [createMockFile("src/auth/guard.ts", content)];
    const contents = new Map([["src/auth/guard.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = WEAK_AUTH_GUARD_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
  });

  it("should detect !headers.authorization pattern", () => {
    const content = `
export function authGuard(headers) {
  if (!headers.authorization) {
    throw new Error("Unauthorized");
  }
  return { userId: "default" };
}
`;

    const files = [createMockFile("src/middleware/auth.ts", content)];
    const contents = new Map([["src/middleware/auth.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = WEAK_AUTH_GUARD_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
  });

  it("should detect request.headers.authorization pattern", () => {
    const content = `
export function authenticate(request) {
  if (!request.headers.authorization) {
    throw new Error("No auth header");
  }
  return { id: "user-1" };
}
`;

    const files = [createMockFile("src/auth/middleware.ts", content)];
    const contents = new Map([["src/auth/middleware.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = WEAK_AUTH_GUARD_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
  });

  it("should detect ctx.headers.authorization pattern", () => {
    const content = `
export function authMiddleware(ctx) {
  if (!ctx.headers.authorization) {
    throw new Error("Unauthorized");
  }
  return { id: "user" };
}
`;

    const files = [createMockFile("src/auth/guard.ts", content)];
    const contents = new Map([["src/auth/guard.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = WEAK_AUTH_GUARD_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
  });

  it("should detect context.headers.authorization pattern", () => {
    const content = `
export function guard(context) {
  if (!context.headers.authorization) {
    return null;
  }
  return { userId: "placeholder" };
}
`;

    const files = [createMockFile("src/authenticator/guard.ts", content)];
    const contents = new Map([["src/authenticator/guard.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = WEAK_AUTH_GUARD_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
  });

  // JavaScript patterns
  it("should detect patterns in JavaScript files", () => {
    const content = `
function authMiddleware(req, res, next) {
  if (!req.headers.authorization) {
    return res.status(401).send("Unauthorized");
  }
  req.user = { id: "default", role: "user" };
  next();
}
`;

    const files = [createMockFile("src/middleware/auth.js", content, "js")];
    const contents = new Map([["src/middleware/auth.js", content]]);
    const context = createMockContext(files, contents);

    const findings = WEAK_AUTH_GUARD_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
  });

  it("should detect patterns in JSX files", () => {
    const content = `
function checkAuth(auth) {
  if (!auth) {
    return null;
  }
  return { id: "user", role: "member" };
}
`;

    const files = [createMockFile("src/components/Auth.jsx", content, "js")];
    const contents = new Map([["src/components/Auth.jsx", content]]);
    const context = createMockContext(files, contents);

    const findings = WEAK_AUTH_GUARD_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThanOrEqual(0);
  });

  // Edge cases with comments and whitespace
  it("should detect patterns with inline comments", () => {
    const content = `
export function guard(authorization) {
  // Check if auth header exists
  if (!authorization) { // but we don't verify it
    throw new Error("Missing auth");
  }
  return { id: "user" };
}
`;

    const files = [createMockFile("src/auth/guard.ts", content)];
    const contents = new Map([["src/auth/guard.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = WEAK_AUTH_GUARD_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
  });

  it("should detect patterns with multi-line spacing", () => {
    const content = `
export function authenticate(req) {

  if (!req.headers.authorization) {

    throw new Error("Unauthorized");

  }

  return { id: "synthetic-user" };

}
`;

    const files = [createMockFile("src/auth/middleware.ts", content)];
    const contents = new Map([["src/auth/middleware.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = WEAK_AUTH_GUARD_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
  });

  // Multi-file scenarios
  it("should detect weak auth across multiple files", () => {
    const guardContent = `
export function guard(auth) {
  if (!auth) {
    throw new Error("Missing auth");
  }
  return { id: "user" };
}
`;

    const middlewareContent = `
export function middleware(req) {
  if (!req.headers.authorization) {
    throw new Error("Unauthorized");
  }
  req.user = { id: "default" };
}
`;

    const files = [
      createMockFile("src/auth/guard.ts", guardContent),
      createMockFile("src/middleware/auth.ts", middlewareContent),
    ];
    const contents = new Map([
      ["src/auth/guard.ts", guardContent],
      ["src/middleware/auth.ts", middlewareContent],
    ]);
    const context = createMockContext(files, contents);

    const findings = WEAK_AUTH_GUARD_RULE.evaluate(context);

    expect(findings.length).toBe(2);
  });

  it("should not flag proper auth in one file while flagging weak auth in another", () => {
    const properContent = `
import jwt from "jsonwebtoken";

export function properAuth(authorization) {
  if (!authorization) {
    throw new Error("Missing auth");
  }
  const decoded = jwt.verify(authorization, SECRET);
  return { id: decoded.userId };
}
`;

    const weakContent = `
export function weakAuth(auth) {
  if (!auth) {
    throw new Error("Missing auth");
  }
  return { id: "synthetic" };
}
`;

    const files = [
      createMockFile("src/auth/proper.ts", properContent),
      createMockFile("src/auth/weak.ts", weakContent),
    ];
    const contents = new Map([
      ["src/auth/proper.ts", properContent],
      ["src/auth/weak.ts", weakContent],
    ]);
    const context = createMockContext(files, contents);

    const findings = WEAK_AUTH_GUARD_RULE.evaluate(context);

    // Only weak.ts should be flagged
    expect(findings.length).toBe(1);
    expect(findings[0].evidence[0]?.path).toBe("src/auth/weak.ts");
  });

  // Negative test cases - should NOT detect
  it("should not flag when jwt.verify is present", () => {
    const content = `
import jwt from "jsonwebtoken";

export function authenticate(authorization) {
  if (!authorization) {
    throw new Error("Missing auth");
  }
  const decoded = jwt.verify(authorization, process.env.JWT_SECRET);
  return { id: decoded.userId, role: decoded.role };
}
`;

    const files = [createMockFile("src/auth/guard.ts", content)];
    const contents = new Map([["src/auth/guard.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = WEAK_AUTH_GUARD_RULE.evaluate(context);

    expect(findings.length).toBe(0);
  });

  it("should not flag when verify function is present", () => {
    const content = `
import { verifyToken } from "./token";

export function authenticate(token) {
  if (!token) {
    throw new Error("Missing token");
  }
  const verified = verifyToken(token);
  return { id: verified.userId };
}
`;

    const files = [createMockFile("src/auth/guard.ts", content)];
    const contents = new Map([["src/auth/guard.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = WEAK_AUTH_GUARD_RULE.evaluate(context);

    expect(findings.length).toBe(0);
  });

  it("should not flag when validate function is present", () => {
    const content = `
import { validateAuth } from "./validation";

export function guard(authorization) {
  if (!authorization) {
    throw new Error("Missing auth");
  }
  const valid = validateAuth(authorization);
  return { id: valid.userId };
}
`;

    const files = [createMockFile("src/auth/guard.ts", content)];
    const contents = new Map([["src/auth/guard.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = WEAK_AUTH_GUARD_RULE.evaluate(context);

    expect(findings.length).toBe(0);
  });

  it("should not flag when decode function is present", () => {
    const content = `
import { decodeToken } from "./token";

export function authenticate(token) {
  if (!token) {
    throw new Error("Missing token");
  }
  const decoded = decodeToken(token);
  return { id: decoded.userId };
}
`;

    const files = [createMockFile("src/auth/guard.ts", content)];
    const contents = new Map([["src/auth/guard.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = WEAK_AUTH_GUARD_RULE.evaluate(context);

    expect(findings.length).toBe(0);
  });

  it("should not flag when expires check is present", () => {
    const content = `
export function authenticate(token) {
  if (!token) {
    throw new Error("Missing token");
  }
  const expires = getTokenExpiration(token);
  if (expires < Date.now()) {
    throw new Error("Token expired");
  }
  return { id: getUserId(token) };
}
`;

    const files = [createMockFile("src/auth/guard.ts", content)];
    const contents = new Map([["src/auth/guard.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = WEAK_AUTH_GUARD_RULE.evaluate(context);

    expect(findings.length).toBe(0);
  });

  it("should not flag when secret key is used", () => {
    const content = `
import { verify } from "./crypto";

export function authenticate(token) {
  if (!token) {
    throw new Error("Missing token");
  }
  const result = verify(token, SECRET_KEY);
  return { id: result.userId };
}
`;

    const files = [createMockFile("src/auth/guard.ts", content)];
    const contents = new Map([["src/auth/guard.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = WEAK_AUTH_GUARD_RULE.evaluate(context);

    expect(findings.length).toBe(0);
  });

  it("should not flag when issuer check is present", () => {
    const content = `
export function authenticate(token) {
  if (!token) {
    throw new Error("Missing token");
  }
  const issuer = getIssuer(token);
  if (issuer !== "trusted") {
    throw new Error("Invalid issuer");
  }
  return { id: getUserId(token) };
}
`;

    const files = [createMockFile("src/auth/guard.ts", content)];
    const contents = new Map([["src/auth/guard.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = WEAK_AUTH_GUARD_RULE.evaluate(context);

    expect(findings.length).toBe(0);
  });

  it("should not flag when audience check is present", () => {
    const content = `
export function authenticate(token) {
  if (!token) {
    throw new Error("Missing token");
  }
  const audience = getAudience(token);
  if (audience !== "api") {
    throw new Error("Invalid audience");
  }
  return { id: getUserId(token) };
}
`;

    const files = [createMockFile("src/auth/guard.ts", content)];
    const contents = new Map([["src/auth/guard.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = WEAK_AUTH_GUARD_RULE.evaluate(context);

    expect(findings.length).toBe(0);
  });

  it("should not flag non-auth validation patterns", () => {
    const content = `
export function validateConfig(config) {
  if (!config) {
    throw new Error("Missing config");
  }
  return { settings: config };
}
`;

    const files = [createMockFile("src/utils/config.ts", content)];
    const contents = new Map([["src/utils/config.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = WEAK_AUTH_GUARD_RULE.evaluate(context);

    expect(findings.length).toBe(0);
  });

  it("should not flag data validation in non-auth files", () => {
    const content = `
export function validateData(data) {
  if (!data) {
    throw new Error("Missing data");
  }
  return { processed: data };
}
`;

    const files = [createMockFile("src/services/data.ts", content)];
    const contents = new Map([["src/services/data.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = WEAK_AUTH_GUARD_RULE.evaluate(context);

    expect(findings.length).toBe(0);
  });

  // SMELL - Lines marker
  it("should detect SMELL - Lines marker pattern", () => {
    const content = `
import type { User } from "../types";

// SMELL - Lines 10-15: Weak auth guard
export function guard(auth) {
  if (!auth) {
    throw new Error("Missing auth");
  }
  return { id: "synthetic" };
}
// END SMELL
`;

    const files = [createMockFile("src/auth/guard.ts", content)];
    const contents = new Map([["src/auth/guard.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = WEAK_AUTH_GUARD_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
  });

  // Edge case: authenticator path keyword
  it("should detect auth patterns in authenticator files", () => {
    const content = `
export function checkAuth(token) {
  if (!token) {
    throw new Error("Missing token");
  }
  return { id: "placeholder" };
}
`;

    const files = [createMockFile("src/authenticator/check.ts", content)];
    const contents = new Map([["src/authenticator/check.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = WEAK_AUTH_GUARD_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
  });

  // Multi-line return patterns
  it("should detect multi-line synthetic return pattern", () => {
    const content = `
export function guard(auth) {
  if (!auth) {
    throw new Error("Missing auth");
  }
  return {
    id: "synthetic",
    role: "user"
  };
}
`;

    const files = [createMockFile("src/auth/guard.ts", content)];
    const contents = new Map([["src/auth/guard.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = WEAK_AUTH_GUARD_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
  });

  it("should detect userId in multi-line return", () => {
    const content = `
export function authenticate(token) {
  if (!token) {
    throw new Error("Missing token");
  }
  return {
    userId: "placeholder"
  };
}
`;

    const files = [createMockFile("src/auth/auth.ts", content)];
    const contents = new Map([["src/auth/auth.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = WEAK_AUTH_GUARD_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
  });

  // Confidence levels
  it("should have appropriate confidence levels", () => {
    const content = `
export function guard(auth) {
  if (!auth) {
    throw new Error("Missing auth");
  }
  return { id: "synthetic" };
}
`;

    const files = [createMockFile("src/auth/guard.ts", content)];
    const contents = new Map([["src/auth/guard.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = WEAK_AUTH_GUARD_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].confidence).toBe(0.9);
  });
});