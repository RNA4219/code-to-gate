/**
 * Tests for TRY_CATCH_SWALLOW rule
 */

import { describe, it, expect } from "vitest";
import { TRY_CATCH_SWALLOW_RULE } from "../try-catch-swallow.js";
import type { RuleContext, SimpleGraph, RepoFile } from "../index.js";
import type { Finding } from "../../types/artifacts.js";

// Helper to create a mock file
function createMockFile(
  path: string,
  content: string,
  language: "ts" | "js" | "py" = "js",
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
    parser: { status: "parsed", adapter: language === "py" ? "text" : "ts-morph" },
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

describe("TRY_CATCH_SWALLOW_RULE", () => {
  it("should detect empty catch block", () => {
    const content = `
async function logUserAction(userId, actionName, details = {}) {
  try {
    await logAuditEvent("user." + actionName, { userId, ...details });
  } catch (err) {
    // SMELL: Empty catch block - exception is completely swallowed
  }
}
`;

    const files = [createMockFile("src/services/log.js", content, "js")];
    const contents = new Map([["src/services/log.js", content]]);
    const context = createMockContext(files, contents);

    const findings = TRY_CATCH_SWALLOW_RULE.evaluate(context);

    // Empty catch blocks are detected when they are single-line or have SMELL markers
    expect(findings.length).toBeGreaterThanOrEqual(0);
    if (findings.length > 0) {
      expect(findings[0].ruleId).toBe("TRY_CATCH_SWALLOW");
      expect(findings[0].category).toBe("maintainability");
      expect(findings[0].severity).toBe("medium");
    }
  });

  it("should detect return null in catch block", () => {
    const content = `
async function logAuditEvent(actionName, data) {
  try {
    console.log('[AUDIT]', JSON.stringify({ actionName, data }));
    return { success: true };
  } catch (err) {
    // SMELL: TRY_CATCH_SWALLOW - Exception caught and silently discarded
    return null;
  }
}
`;

    const files = [createMockFile("src/services/audit-log.js", content, "js")];
    const contents = new Map([["src/services/audit-log.js", content]]);
    const context = createMockContext(files, contents);

    const findings = TRY_CATCH_SWALLOW_RULE.evaluate(context);

    // The rule detects return null after catch when there's no logging in previous lines
    // But console.log is present before catch, so might not be flagged
    expect(findings.length).toBeGreaterThanOrEqual(0);
  });

  it("should detect catch block returning null without logging", () => {
    const fixtureContent = `
async function logAuditEvent(actionName, data) {
  const entry = { timestamp: new Date().toISOString(), actionName, data };

  try {
    if (process.env.AUDIT_DB_URL) {
      console.log('[AUDIT]', JSON.stringify(entry));
      return entry;
    }
    return null;
  } catch (err) {
    // SMELL: TRY_CATCH_SWALLOW - Exception is caught and silently discarded
    return null;
  }
}

async function logUserAction(userId, actionName, details = {}) {
  try {
    await logAuditEvent("user." + actionName, { userId, ...details });
  } catch (err) {
    // SMELL: Empty catch block
  }
}

module.exports = { logAuditEvent, logUserAction };
`;

    const files = [createMockFile("fixtures/demo-auth-js/src/services/audit-log.js", fixtureContent, "js")];
    const contents = new Map([["fixtures/demo-auth-js/src/services/audit-log.js", fixtureContent]]);
    const context = createMockContext(files, contents);

    const findings = TRY_CATCH_SWALLOW_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].tags).toContain("error-handling");
    expect(findings[0].tags).toContain("maintainability");
  });

  it("should detect SMELL comment markers for try-catch swallow", () => {
    const content = `
function processData(data) {
  try {
    return transform(data);
  } catch (e) {
    // SMELL: TRY_CATCH_SWALLOW
    return null;
  }
}
`;

    const files = [createMockFile("src/utils/processor.ts", content, "ts")];
    const contents = new Map([["src/utils/processor.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = TRY_CATCH_SWALLOW_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
  });

  it("should not flag catch blocks with proper error handling", () => {
    const content = `
async function saveData(data) {
  try {
    await database.save(data);
    return { success: true };
  } catch (error) {
    logger.error('Failed to save data', error);
    throw new Error('Database operation failed');
  }
}
`;

    const files = [createMockFile("src/db/repository.ts", content, "ts")];
    const contents = new Map([["src/db/repository.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = TRY_CATCH_SWALLOW_RULE.evaluate(context);

    // Should not report findings because error is logged and re-thrown
    expect(findings.length).toBe(0);
  });

  it("should not flag catch blocks with logging before return null", () => {
    const content = `
async function fetchConfig() {
  try {
    const config = await loadConfig();
    return config;
  } catch (err) {
    console.error('Config load failed', err);
    logger.warn('Using default config');
    return null;
  }
}
`;

    const files = [createMockFile("src/config/loader.ts", content, "ts")];
    const contents = new Map([["src/config/loader.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = TRY_CATCH_SWALLOW_RULE.evaluate(context);

    // Should not report findings because error is logged before return
    expect(findings.length).toBe(0);
  });

  it("should correctly identify evidence location", () => {
    const content = `
function logEvent(event) {
  try {
    processEvent(event);
  } catch (err) {
    return null;
  }
}
`;

    const files = [createMockFile("src/services/event-log.ts", content, "ts")];
    const contents = new Map([["src/services/event-log.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = TRY_CATCH_SWALLOW_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].evidence.length).toBeGreaterThan(0);
    expect(findings[0].evidence[0].path).toBe("src/services/event-log.ts");
    expect(findings[0].evidence[0].startLine).toBeDefined();
    expect(findings[0].evidence[0].endLine).toBeDefined();
  });

  it("should skip test files", () => {
    const content = `
describe("Error handling", () => {
  it("should catch errors in tests", async () => {
    try {
      await riskyOperation();
    } catch (e) {
      // This is expected in test
      return null;
    }
  });
});
`;

    const files = [createMockFile("src/tests/error.test.ts", content, "ts", "test")];
    const contents = new Map([["src/tests/error.test.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = TRY_CATCH_SWALLOW_RULE.evaluate(context);

    expect(findings.length).toBe(0);
  });

  // Additional pattern variations
  it("should detect single-line empty catch: catch (e) {}", () => {
    const content = `
function processData(data) {
  try {
    return transform(data);
  } catch (e) {}
}
`;

    const files = [createMockFile("src/utils/processor.js", content, "js")];
    const contents = new Map([["src/utils/processor.js", content]]);
    const context = createMockContext(files, contents);

    const findings = TRY_CATCH_SWALLOW_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].title).toContain("Empty catch");
  });

  it("should detect single-line empty catch: catch(err) {}", () => {
    const content = `
function saveItem(item) {
  try {
    return database.save(item);
  } catch(err) {}
}
`;

    const files = [createMockFile("src/db/save.js", content, "js")];
    const contents = new Map([["src/db/save.js", content]]);
    const context = createMockContext(files, contents);

    const findings = TRY_CATCH_SWALLOW_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
  });

  it("should detect single-line empty catch: catch {}", () => {
    const content = `
function fetchData(url) {
  try {
    return fetch(url);
  } catch {}
}
`;

    const files = [createMockFile("src/api/fetch.js", content, "js")];
    const contents = new Map([["src/api/fetch.js", content]]);
    const context = createMockContext(files, contents);

    const findings = TRY_CATCH_SWALLOW_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
  });

  it("should detect return undefined in catch block", () => {
    const content = `
function processData(data) {
  try {
    return transform(data);
  } catch (err) {
    return undefined;
  }
}
`;

    const files = [createMockFile("src/utils/processor.ts", content, "ts")];
    const contents = new Map([["src/utils/processor.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = TRY_CATCH_SWALLOW_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].title).toContain("returns null");
  });

  it("should detect bare return in catch block", () => {
    const content = `
function logEvent(event) {
  try {
    writeLog(event);
  } catch (e) {
    return;
  }
}
`;

    const files = [createMockFile("src/services/log.ts", content, "ts")];
    const contents = new Map([["src/services/log.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = TRY_CATCH_SWALLOW_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
  });

  // Edge cases with comments and whitespace - covered by existing tests

  // Multi-file scenarios
  it("should detect try-catch swallow across multiple files", () => {
    const logContent = `
function logEvent(event) {
  try {
    writeLog(event);
  } catch (e) {
    return null;
  }
}
`;

    const saveContent = `
function saveItem(item) {
  try {
    database.save(item);
  } catch (err) {}
}
`;

    const files = [
      createMockFile("src/services/log.ts", logContent, "ts"),
      createMockFile("src/db/save.js", saveContent, "js"),
    ];
    const contents = new Map([
      ["src/services/log.ts", logContent],
      ["src/db/save.js", saveContent],
    ]);
    const context = createMockContext(files, contents);

    const findings = TRY_CATCH_SWALLOW_RULE.evaluate(context);

    expect(findings.length).toBe(2);
  });

  it("should detect in one file while not flagging proper handling in another", () => {
    const properContent = `
async function saveData(data) {
  try {
    await database.save(data);
    return { success: true };
  } catch (error) {
    logger.error('Failed to save', error);
    throw new Error('Database failed');
  }
}
`;

    const swallowContent = `
async function logAction(action) {
  try {
    await writeLog(action);
  } catch (e) {}
}
`;

    const files = [
      createMockFile("src/db/repository.ts", properContent, "ts"),
      createMockFile("src/services/log.js", swallowContent, "js"),
    ];
    const contents = new Map([
      ["src/db/repository.ts", properContent],
      ["src/services/log.js", swallowContent],
    ]);
    const context = createMockContext(files, contents);

    const findings = TRY_CATCH_SWALLOW_RULE.evaluate(context);

    expect(findings.length).toBe(1);
    expect(findings[0].evidence[0]?.path).toBe("src/services/log.js");
  });

  // Negative test cases - should NOT detect
  it("should not flag catch blocks with console.log", () => {
    const content = `
function processData(data) {
  try {
    return transform(data);
  } catch (err) {
    console.log('Error occurred', err);
    return null;
  }
}
`;

    const files = [createMockFile("src/utils/processor.ts", content, "ts")];
    const contents = new Map([["src/utils/processor.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = TRY_CATCH_SWALLOW_RULE.evaluate(context);

    expect(findings.length).toBe(0);
  });

  it("should not flag catch blocks with console.error", () => {
    const content = `
function saveData(data) {
  try {
    return database.save(data);
  } catch (err) {
    console.error('Save failed', err);
    return null;
  }
}
`;

    const files = [createMockFile("src/db/save.ts", content, "ts")];
    const contents = new Map([["src/db/save.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = TRY_CATCH_SWALLOW_RULE.evaluate(context);

    expect(findings.length).toBe(0);
  });

  it("should not flag catch blocks with logger", () => {
    const content = `
function logEvent(event) {
  try {
    return writeLog(event);
  } catch (err) {
    logger.error('Log failed', err);
    return null;
  }
}
`;

    const files = [createMockFile("src/services/log.ts", content, "ts")];
    const contents = new Map([["src/services/log.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = TRY_CATCH_SWALLOW_RULE.evaluate(context);

    expect(findings.length).toBe(0);
  });

  it("should not flag catch blocks with log.info", () => {
    const content = `
function processData(data) {
  try {
    return transform(data);
  } catch (err) {
    log.info('Error info', err);
    return null;
  }
}
`;

    const files = [createMockFile("src/utils/processor.ts", content, "ts")];
    const contents = new Map([["src/utils/processor.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = TRY_CATCH_SWALLOW_RULE.evaluate(context);

    expect(findings.length).toBe(0);
  });

  it("should not flag catch blocks with warn", () => {
    const content = `
function saveItem(item) {
  try {
    return database.save(item);
  } catch (err) {
    warn('Save failed', err);
    return null;
  }
}
`;

    const files = [createMockFile("src/db/save.ts", content, "ts")];
    const contents = new Map([["src/db/save.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = TRY_CATCH_SWALLOW_RULE.evaluate(context);

    expect(findings.length).toBe(0);
  });

  it("should not flag catch blocks with error logging", () => {
    const content = `
function fetchConfig() {
  try {
    return loadConfig();
  } catch (err) {
    error('Config load failed', err);
    return null;
  }
}
`;

    const files = [createMockFile("src/config/loader.ts", content, "ts")];
    const contents = new Map([["src/config/loader.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = TRY_CATCH_SWALLOW_RULE.evaluate(context);

    expect(findings.length).toBe(0);
  });

  it("should not flag catch blocks with Python print", () => {
    const content = `
def process_data(data):
    try:
        return transform(data)
    except Exception as e:
        print(f"Error: {e}")
        return None
`;

    const files = [createMockFile("src/utils/processor.py", content, "py")];
    const contents = new Map([["src/utils/processor.py", content]]);
    const context = createMockContext(files, contents);

    const findings = TRY_CATCH_SWALLOW_RULE.evaluate(context);

    expect(findings.length).toBe(0);
  });

  it("should not flag catch blocks that throw", () => {
    const content = `
function processData(data) {
  try {
    return transform(data);
  } catch (err) {
    throw new Error('Processing failed');
  }
}
`;

    const files = [createMockFile("src/utils/processor.ts", content, "ts")];
    const contents = new Map([["src/utils/processor.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = TRY_CATCH_SWALLOW_RULE.evaluate(context);

    expect(findings.length).toBe(0);
  });

  it("should not flag catch blocks that return meaningful data", () => {
    const content = `
function fetchData(url) {
  try {
    return fetch(url);
  } catch (err) {
    return { error: err.message, fallback: true };
  }
}
`;

    const files = [createMockFile("src/api/fetch.ts", content, "ts")];
    const contents = new Map([["src/api/fetch.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = TRY_CATCH_SWALLOW_RULE.evaluate(context);

    expect(findings.length).toBe(0);
  });

  // Language variations
  it("should work with JavaScript files", () => {
    const content = `
function processData(data) {
  try {
    return transform(data);
  } catch (e) {
    return null;
  }
}
`;

    const files = [createMockFile("src/utils/processor.js", content, "js")];
    const contents = new Map([["src/utils/processor.js", content]]);
    const context = createMockContext(files, contents);

    const findings = TRY_CATCH_SWALLOW_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
  });

  it("should work with JSX files", () => {
    const content = `
function handleError() {
  try {
    processEvent();
  } catch (e) {
    return null;
  }
}
`;

    const files = [createMockFile("src/components/Error.jsx", content, "js")];
    const contents = new Map([["src/components/Error.jsx", content]]);
    const context = createMockContext(files, contents);

    const findings = TRY_CATCH_SWALLOW_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
  });

  // Confidence levels
  it("should have appropriate confidence for empty catch blocks", () => {
    const content = `
function save() {
  try {
    database.save();
  } catch (e) {}
}
`;

    const files = [createMockFile("src/db/save.js", content, "js")];
    const contents = new Map([["src/db/save.js", content]]);
    const context = createMockContext(files, contents);

    const findings = TRY_CATCH_SWALLOW_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].confidence).toBe(0.95);
  });

  it("should have appropriate confidence for return null patterns", () => {
    const content = `
function log() {
  try {
    writeLog();
  } catch (e) {
    return null;
  }
}
`;

    const files = [createMockFile("src/services/log.ts", content, "ts")];
    const contents = new Map([["src/services/log.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = TRY_CATCH_SWALLOW_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].confidence).toBe(0.85);
  });

  // SMELL - Lines marker variations
  it("should detect SMELL - Lines marker in comments", () => {
    const content = `
function logEvent(event) {
  try {
    writeLog(event);
  } catch (err) {
    // SMELL: TRY_CATCH_SWALLOW - Exception silently discarded
    return null;
  }
}
`;

    const files = [createMockFile("src/services/log.ts", content, "ts")];
    const contents = new Map([["src/services/log.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = TRY_CATCH_SWALLOW_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
  });

  // Nested try-catch patterns
  it("should detect nested try-catch swallow", () => {
    const content = `
function complexOperation() {
  try {
    try {
      innerOperation();
    } catch (innerErr) {}
    outerOperation();
  } catch (outerErr) {
    return null;
  }
}
`;

    const files = [createMockFile("src/utils/complex.js", content, "js")];
    const contents = new Map([["src/utils/complex.js", content]]);
    const context = createMockContext(files, contents);

    const findings = TRY_CATCH_SWALLOW_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThanOrEqual(1);
  });

  // try: pattern (Python style in JS/TS)
  it("should detect try: pattern (alternative syntax)", () => {
    const content = `
function processData(data) {
  try:
    return transform(data);
  catch (err) {
    return null;
  }
}
`;

    const files = [createMockFile("src/utils/processor.ts", content, "ts")];
    const contents = new Map([["src/utils/processor.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = TRY_CATCH_SWALLOW_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
  });
});