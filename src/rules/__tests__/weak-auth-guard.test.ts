/**
 * Tests for WEAK_AUTH_GUARD rule - Refactored
 *
 * Original: 33 tests, 807 lines
 * Refactored: 10 tests (merged similar cases)
 */

import { describe, it, expect } from "vitest";
import { WEAK_AUTH_GUARD_RULE } from "../weak-auth-guard.js";
import type { RuleContext, RepoFile } from "../index.js";

// Helper: Create mock file
function createFile(path: string, content: string, language: "ts" | "js" = "ts", role: "source" | "test" = "source"): RepoFile {
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

// Helper: Create rule context
function createContext(files: RepoFile[], contents: Map<string, string>): RuleContext {
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

// Helper: Run rule and get findings
function runRule(path: string, content: string, language: "ts" | "js" = "ts"): Finding[] {
  const files = [createFile(path, content, language)];
  const contents = new Map([[path, content]]);
  return WEAK_AUTH_GUARD_RULE.evaluate(createContext(files, contents));
}

import type { Finding } from "../../types/artifacts.js";

describe("WEAK_AUTH_GUARD_RULE", () => {
  describe("positive detection patterns", () => {
    it("detects weak auth patterns with various authorization variable styles", () => {
      const patterns = [
        { path: "src/auth/guard.ts", content: `export function f(auth) {\n  if (!auth) {\n    throw new Error();\n  }\n  return { id: "synthetic" }; }` },
        { path: "src/auth/middleware.ts", content: `export function f(authorization) {\n  if (!authorization) {\n    throw new Error();\n  }\n  return { userId: "x" }; }` },
        { path: "src/auth/auth.ts", content: `export function f(req) {\n  if (!req.headers.authorization) {\n    throw new Error();\n  }\n  return { id: "u" }; }` },
        { path: "src/authenticator/check.ts", content: `export function f(ctx) {\n  if (!ctx.headers.authorization) {\n    throw new Error();\n  }\n  return { id: "u" }; }` },
        { path: "src/middleware/auth.ts", content: `export function f(request) {\n  if (!request.headers.authorization) {\n    throw new Error();\n  }\n  return { id: "u" }; }` },
        { path: "src/middleware/auth.js", content: `function f(req, res, next) {\n  if (!req.headers.authorization) {\n    return res.status(401);\n  }\n  req.user = { id: "d" }; next(); }`, language: "js" },
      ];

      for (const { path, content, language = "ts" } of patterns) {
        const findings = runRule(path, content, language as "ts" | "js");
        expect(findings.length).toBeGreaterThan(0);
        expect(findings[0].ruleId).toBe("WEAK_AUTH_GUARD");
        expect(findings[0].category).toBe("auth");
        expect(findings[0].severity).toBe("critical");
      }
    });

    it("detects patterns with SMELL markers and synthetic returns", () => {
      const content = `
/**
 * SMELL: WEAK_AUTH_GUARD
 */
export function requireUser(authorization) {
  // SMELL: WEAK_AUTH_GUARD - Lines 17-19
  if (!authorization) {
    throw new Error("missing authorization header");
  }
  return { id: "synthetic-user", role: "user" };
}
`;
      const findings = runRule("src/auth/guard.ts", content);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].title).toContain("header presence");
      expect(findings[0].tags).toContain("authentication");
      expect(findings[0].confidence).toBeGreaterThan(0.8);
      expect(findings[0].evidence[0].path).toBe("src/auth/guard.ts");
      expect(findings[0].evidence[0].startLine).toBeDefined();
    });

    it("handles multi-line patterns and whitespace variations", () => {
      const content = `
export function authenticate(req) {

  if (!req.headers.authorization) {

    throw new Error("Unauthorized");

  }

  return {
    id: "synthetic-user",
    role: "admin"
  };

}
`;
      const findings = runRule("src/auth/middleware.ts", content);
      expect(findings.length).toBeGreaterThan(0);
    });
  });

  describe("negative patterns - proper auth implementations", () => {
    it("does not flag when JWT verification, verify, validate, or decode is present", () => {
      const safePatterns = [
        `import jwt from "jsonwebtoken"; export function f(auth) { if (!auth) throw; const decoded = jwt.verify(auth, SECRET); return { id: decoded.userId }; }`,
        `import { verifyToken } from "./token"; export function f(auth) { if (!auth) throw; const verified = verifyToken(auth); return { id: verified.userId }; }`,
        `import { validateAuth } from "./validation"; export function f(auth) { if (!auth) throw; const valid = validateAuth(auth); return { id: valid.userId }; }`,
        `import { decodeToken } from "./token"; export function f(auth) { if (!auth) throw; const decoded = decodeToken(auth); return { id: decoded.userId }; }`,
        `import { verify } from "./crypto"; export function f(auth) { if (!auth) throw; const result = verify(auth, SECRET_KEY); return { id: result.userId }; }`,
        `export function f(auth) { if (!auth) throw; const expires = getTokenExpiration(auth); if (expires < Date.now()) throw; return { id: getUserId(auth) }; }`,
        `export function f(auth) { if (!auth) throw; const issuer = getIssuer(auth); if (issuer !== "trusted") throw; return { id: getUserId(auth) }; }`,
        `export function f(auth) { if (!auth) throw; const audience = getAudience(auth); if (audience !== "api") throw; return { id: getUserId(auth) }; }`,
      ];

      for (const content of safePatterns) {
        const findings = runRule("src/auth/guard.ts", content);
        expect(findings.length).toBe(0);
      }
    });

    it("does not flag non-auth files with validation patterns", () => {
      const nonAuthPatterns = [
        { path: "src/utils/validation.ts", content: "export function validateInput(input) { if (!input) throw new Error(); return { validated: true }; }" },
        { path: "src/utils/config.ts", content: "export function validateConfig(config) { if (!config) throw new Error(); return { settings: config }; }" },
        { path: "src/services/data.ts", content: "export function validateData(data) { if (!data) throw new Error(); return { processed: data }; }" },
      ];

      for (const { path, content } of nonAuthPatterns) {
        const findings = runRule(path, content);
        expect(findings.length).toBe(0);
      }
    });
  });

  describe("multi-file scenarios", () => {
    it("detects weak auth across multiple files", () => {
      const guardContent = "export function guard(auth) { if (!auth) throw; return { id: 'user' }; }";
      const middlewareContent = "export function middleware(req) { if (!req.headers.authorization) throw; req.user = { id: 'default' }; }";

      const files = [
        createFile("src/auth/guard.ts", guardContent),
        createFile("src/middleware/auth.ts", middlewareContent),
      ];
      const contents = new Map([
        ["src/auth/guard.ts", guardContent],
        ["src/middleware/auth.ts", middlewareContent],
      ]);

      const findings = WEAK_AUTH_GUARD_RULE.evaluate(createContext(files, contents));
      expect(findings.length).toBe(2);
    });

    it("flags weak auth while not flagging proper auth in separate files", () => {
      const properContent = "import jwt from 'jsonwebtoken'; export function properAuth(auth) { if (!auth) throw; const decoded = jwt.verify(auth, SECRET); return { id: decoded.userId }; }";
      const weakContent = "export function weakAuth(auth) { if (!auth) throw; return { id: 'synthetic' }; }";

      const files = [
        createFile("src/auth/proper.ts", properContent),
        createFile("src/auth/weak.ts", weakContent),
      ];
      const contents = new Map([
        ["src/auth/proper.ts", properContent],
        ["src/auth/weak.ts", weakContent],
      ]);

      const findings = WEAK_AUTH_GUARD_RULE.evaluate(createContext(files, contents));
      expect(findings.length).toBe(1);
      expect(findings[0].evidence[0]?.path).toBe("src/auth/weak.ts");
    });
  });

  describe("finding structure", () => {
    it("produces findings with correct structure and confidence", () => {
      const content = "export function guard(auth) { if (!auth) throw new Error(); return { id: 'synthetic' }; }";
      const findings = runRule("src/auth/guard.ts", content);

      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].ruleId).toBe("WEAK_AUTH_GUARD");
      expect(findings[0].category).toBe("auth");
      expect(findings[0].severity).toBe("critical");
      expect(findings[0].confidence).toBe(0.9);
      expect(findings[0].title).toBeDefined();
      expect(findings[0].summary).toBeDefined();
      expect(findings[0].tags).toContain("authentication");
    });
  });
});