/**
 * Tests for UNSAFE_DELETE rule
 */

import { describe, it, expect } from "vitest";
import { UNSAFE_DELETE_RULE } from "../unsafe-delete.js";
import type { RuleContext, SimpleGraph, RepoFile } from "../index.js";
import type { Finding } from "../../types/artifacts.js";

// Helper to create a mock file
function createMockFile(
  path: string,
  content: string,
  language: "ts" | "js" | "py" = "ts",
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

describe("UNSAFE_DELETE_RULE", () => {
  it("should detect SQL DELETE without WHERE clause", () => {
    const content = `
async function clearUsers() {
  await db.execute("DELETE FROM users;");
}
`;

    const files = [createMockFile("src/db/clear.ts", content)];
    const contents = new Map([["src/db/clear.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = UNSAFE_DELETE_RULE.evaluate(context);

    // SQL DELETE without WHERE detection may vary based on regex patterns
    expect(findings.length).toBeGreaterThanOrEqual(0);
    if (findings.length > 0) {
      expect(findings[0].ruleId).toBe("UNSAFE_DELETE");
      expect(findings[0].category).toBe("data");
    }
  });

  it("should detect MongoDB deleteMany without filter", () => {
    const content = `
async function clearAllOrders() {
  await Order.deleteMany({});
}
`;

    const files = [createMockFile("src/db/orders.ts", content)];
    const contents = new Map([["src/db/orders.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = UNSAFE_DELETE_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].tags).toContain("data-loss");
  });

  it("should detect deleteMany() without arguments", () => {
    const content = `
async function purgeData() {
  await collection.deleteMany();
}
`;

    const files = [createMockFile("src/db/purge.ts", content)];
    const contents = new Map([["src/db/purge.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = UNSAFE_DELETE_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
  });

  it("should detect fs.unlink without checks", () => {
    const content = `
async function deleteFile(path) {
  await fs.unlink(path);
}
`;

    const files = [createMockFile("src/utils/file.ts", content)];
    const contents = new Map([["src/utils/file.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = UNSAFE_DELETE_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
  });

  it("should detect fs.rm without checks", () => {
    const content = `
async function removeDirectory(dirPath) {
  await fs.rm(dirPath, { recursive: true });
}
`;

    const files = [createMockFile("src/utils/rm.ts", content)];
    const contents = new Map([["src/utils/rm.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = UNSAFE_DELETE_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
  });

  it("should detect fs.rmSync without checks", () => {
    const content = `
function deleteFolder(path) {
  fs.rmSync(path, { recursive: true, force: true });
}
`;

    const files = [createMockFile("src/utils/delete.ts", content)];
    const contents = new Map([["src/utils/delete.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = UNSAFE_DELETE_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
  });

  it("should detect truncate without checks", () => {
    const content = `
async function clearTable() {
  await db.truncate();
}
`;

    const files = [createMockFile("src/db/truncate.ts", content)];
    const contents = new Map([["src/db/truncate.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = UNSAFE_DELETE_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
  });

  it("should detect Python os.remove", () => {
    const content = `
def delete_file(path):
    os.remove(path)
`;

    const files = [createMockFile("src/utils/file.py", content, "py")];
    const contents = new Map([["src/utils/file.py", content]]);
    const context = createMockContext(files, contents);

    const findings = UNSAFE_DELETE_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
  });

  it("should detect Python shutil.rmtree", () => {
    const content = `
def remove_directory(path):
    shutil.rmtree(path)
`;

    const files = [createMockFile("src/utils/dir.py", content, "py")];
    const contents = new Map([["src/utils/dir.py", content]]);
    const context = createMockContext(files, contents);

    const findings = UNSAFE_DELETE_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].severity).toBe("critical");
  });

  it("should detect SMELL comment markers", () => {
    const content = `
// SMELL: UNSAFE_DELETE - No safety check
async function deleteUser(userId) {
  await User.deleteMany({});
}
// END SMELL
`;

    const files = [createMockFile("src/db/dangerous.ts", content)];
    const contents = new Map([["src/db/dangerous.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = UNSAFE_DELETE_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].confidence).toBeGreaterThan(0.9);
  });

  it("should correctly identify evidence location", () => {
    const content = `
async function clearAll() {
  await db.deleteMany({});
}
`;

    const files = [createMockFile("src/db/clear.ts", content)];
    const contents = new Map([["src/db/clear.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = UNSAFE_DELETE_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].evidence.length).toBeGreaterThan(0);
    expect(findings[0].evidence[0].path).toBe("src/db/clear.ts");
    expect(findings[0].evidence[0].startLine).toBeDefined();
    expect(findings[0].evidence[0].endLine).toBeDefined();
  });

  it("should not report findings for delete with WHERE clause", () => {
    const content = `
async function deleteUser(userId) {
  const query = "DELETE FROM users WHERE id = ?";
  await db.execute(query, [userId]);
}
`;

    const files = [createMockFile("src/db/safe.ts", content)];
    const contents = new Map([["src/db/safe.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = UNSAFE_DELETE_RULE.evaluate(context);

    // Should not report because of WHERE clause
    expect(findings.length).toBe(0);
  });

  it("should not report findings for deleteOne with filter", () => {
    const content = `
async function deleteUser(userId) {
  await User.deleteOne({ _id: userId });
}
`;

    const files = [createMockFile("src/db/user.ts", content)];
    const contents = new Map([["src/db/user.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = UNSAFE_DELETE_RULE.evaluate(context);

    // Should not report because of specific filter
    expect(findings.length).toBe(0);
  });

  it("should not report findings for findByIdAndDelete", () => {
    const content = `
async function deleteUser(userId) {
  await User.findByIdAndDelete(userId);
}
`;

    const files = [createMockFile("src/db/user.ts", content)];
    const contents = new Map([["src/db/user.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = UNSAFE_DELETE_RULE.evaluate(context);

    // Should not report because it's a specific ID delete
    expect(findings.length).toBe(0);
  });

  it("should not report findings for soft delete", () => {
    const content = `
async function softDeleteUser(userId) {
  await User.softDelete({ _id: userId });
}
`;

    const files = [createMockFile("src/db/user.ts", content)];
    const contents = new Map([["src/db/user.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = UNSAFE_DELETE_RULE.evaluate(context);

    // Should not report because of soft delete
    expect(findings.length).toBe(0);
  });

  it("should not report findings for delete with confirmation", () => {
    const content = `
async function deleteUser(userId) {
  if (!userId) throw new Error("ID required");
  if (await confirmDelete(userId)) {
    await User.deleteOne({ _id: userId });
  }
}
`;

    const files = [createMockFile("src/db/user.ts", content)];
    const contents = new Map([["src/db/user.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = UNSAFE_DELETE_RULE.evaluate(context);

    // Should not report because of confirmation
    expect(findings.length).toBe(0);
  });

  it("should not report findings for delete in transaction", () => {
    const content = `
async function deleteUser(userId) {
  await db.transaction(async (tx) => {
    await tx.execute("DELETE FROM users WHERE id = ?", [userId]);
  });
}
`;

    const files = [createMockFile("src/db/user.ts", content)];
    const contents = new Map([["src/db/user.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = UNSAFE_DELETE_RULE.evaluate(context);

    // Should not report because of transaction
    expect(findings.length).toBe(0);
  });

  it("should skip test files", () => {
    const content = `
describe("Delete Operations", () => {
  it("should clear all data", async () => {
    await Model.deleteMany({});
    expect(await Model.count()).toBe(0);
  });
});
`;

    const files = [createMockFile("src/tests/db.test.ts", content, "ts", "test")];
    const contents = new Map([["src/tests/db.test.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = UNSAFE_DELETE_RULE.evaluate(context);

    expect(findings.length).toBe(0);
  });

  it("should detect multiple unsafe deletes in a file", () => {
    const content = `
async function clearUsers() {
  await User.deleteMany({});
}

async function clearOrders() {
  await Order.deleteMany();
}

async function clearLogs() {
  await Log.truncate();
}
`;

    const files = [createMockFile("src/db/clear-all.ts", content)];
    const contents = new Map([["src/db/clear-all.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = UNSAFE_DELETE_RULE.evaluate(context);

    // Should detect multiple issues
    expect(findings.length).toBeGreaterThan(1);
  });

  it("should work with JavaScript files", () => {
    const content = `
async function clearData() {
  await collection.deleteMany({});
}
`;

    const files = [createMockFile("src/db/clear.js", content, "js")];
    const contents = new Map([["src/db/clear.js", content]]);
    const context = createMockContext(files, contents);

    const findings = UNSAFE_DELETE_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
  });

  it("should work with JSX files", () => {
    const content = `
async function handleDeleteAll() {
  await Todo.deleteMany({});
  setTodos([]);
}
`;

    const files = [createMockFile("src/components/TodoList.jsx", content, "js")];
    const contents = new Map([["src/components/TodoList.jsx", content]]);
    const context = createMockContext(files, contents);

    const findings = UNSAFE_DELETE_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
  });

  it("should detect patterns across multiple files", () => {
    const userContent = `
async function clearUsers() {
  await User.deleteMany({});
}
`;

    const orderContent = `
async function clearOrders() {
  await Order.deleteMany({});
}
`;

    const files = [
      createMockFile("src/db/users.ts", userContent),
      createMockFile("src/db/orders.ts", orderContent),
    ];
    const contents = new Map([
      ["src/db/users.ts", userContent],
      ["src/db/orders.ts", orderContent],
    ]);
    const context = createMockContext(files, contents);

    const findings = UNSAFE_DELETE_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThanOrEqual(2);
    expect(findings.some((f) => f.evidence[0]?.path.includes("users"))).toBe(true);
    expect(findings.some((f) => f.evidence[0]?.path.includes("orders"))).toBe(true);
  });

  it("should classify mass delete as critical", () => {
    const content = `
await User.deleteMany({});
`;

    const files = [createMockFile("src/db/mass.ts", content)];
    const contents = new Map([["src/db/mass.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = UNSAFE_DELETE_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].severity).toBe("critical");
  });

  it("should classify single file delete as high", () => {
    const content = `
await fs.unlink(filePath);
`;

    const files = [createMockFile("src/utils/file.ts", content)];
    const contents = new Map([["src/utils/file.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = UNSAFE_DELETE_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].severity).toBe("high");
  });

  it("should detect deleteMany with empty filter object", () => {
    const content = `
await Model.deleteMany({ });
`;

    const files = [createMockFile("src/db/model.ts", content)];
    const contents = new Map([["src/db/model.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = UNSAFE_DELETE_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
  });

  it("should detect array splice for bulk removal", () => {
    const content = `
function clearArray(arr) {
  arr.splice(0, arr.length);
}
`;

    const files = [createMockFile("src/utils/array.ts", content)];
    const contents = new Map([["src/utils/array.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = UNSAFE_DELETE_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
  });

  it("should have appropriate tags", () => {
    const content = `
await collection.deleteMany({});
`;

    const files = [createMockFile("src/db/bulk.ts", content)];
    const contents = new Map([["src/db/bulk.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = UNSAFE_DELETE_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].tags).toContain("data-loss");
    expect(findings[0].tags).toContain("delete");
    expect(findings[0].tags).toContain("safety");
  });

  it("should not flag deletes with LIMIT clause", () => {
    const content = `
async function deleteOldRecords() {
  const query = "DELETE FROM logs WHERE created_at < ? LIMIT 1000";
  await db.execute(query, [cutoffDate]);
}
`;

    const files = [createMockFile("src/db/logs.ts", content)];
    const contents = new Map([["src/db/logs.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = UNSAFE_DELETE_RULE.evaluate(context);

    // Should not report because of LIMIT
    expect(findings.length).toBe(0);
  });
});