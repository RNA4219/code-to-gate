/**
 * Tests for file-utils.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  detectLanguage,
  detectRole,
  walkDir,
  isTargetFile,
  isEntrypoint,
  entrypointKind,
  getFileStats,
  isValidDirectory,
  detectTestFramework,
  DEFAULT_IGNORED_DIRS,
  Language,
  FileRole,
} from "../file-utils.js";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

describe("file-utils", () => {
  let tempTestDir: string;

  beforeAll(() => {
    tempTestDir = path.join(tmpdir(), `ctg-file-utils-test-${Date.now()}`);
    mkdirSync(tempTestDir, { recursive: true });

    // Create test file structure
    mkdirSync(path.join(tempTestDir, "src"), { recursive: true });
    mkdirSync(path.join(tempTestDir, "tests"), { recursive: true });
    mkdirSync(path.join(tempTestDir, "__tests__"), { recursive: true });
    mkdirSync(path.join(tempTestDir, "fixtures"), { recursive: true });
    mkdirSync(path.join(tempTestDir, "docs"), { recursive: true });
    mkdirSync(path.join(tempTestDir, "config"), { recursive: true });
    mkdirSync(path.join(tempTestDir, "api"), { recursive: true });
    mkdirSync(path.join(tempTestDir, "routes"), { recursive: true });

    // Create sample files
    writeFileSync(path.join(tempTestDir, "src", "index.ts"), "export {};", "utf8");
    writeFileSync(path.join(tempTestDir, "src", "component.tsx"), "export const X = 1;", "utf8");
    writeFileSync(path.join(tempTestDir, "src", "app.js"), "const app = {};", "utf8");
    writeFileSync(path.join(tempTestDir, "src", "Button.jsx"), "export default () => {};", "utf8");
    writeFileSync(path.join(tempTestDir, "src", "main.py"), "def main(): pass", "utf8");
    writeFileSync(path.join(tempTestDir, "src", "app.rb"), "class App; end", "utf8");
    writeFileSync(path.join(tempTestDir, "src", "main.go"), "package main", "utf8");
    writeFileSync(path.join(tempTestDir, "src", "main.rs"), "fn main() {}", "utf8");
    writeFileSync(path.join(tempTestDir, "src", "Main.java"), "class Main {}", "utf8");
    writeFileSync(path.join(tempTestDir, "src", "app.php"), "<?php", "utf8");
    writeFileSync(path.join(tempTestDir, "src", "utils.mjs"), "export const x = 1;", "utf8");
    writeFileSync(path.join(tempTestDir, "src", "config.cjs"), "module.exports = {};", "utf8");

    // Test files
    writeFileSync(path.join(tempTestDir, "tests", "app.test.ts"), "test('x', () => {});", "utf8");
    writeFileSync(path.join(tempTestDir, "__tests__", "utils.spec.js"), "test('x', () => {});", "utf8");
    writeFileSync(path.join(tempTestDir, "src", "module_test.py"), "def test_x(): pass", "utf8");
    writeFileSync(path.join(tempTestDir, "src", "order_spec.rb"), "RSpec.describe 'x'", "utf8");
    writeFileSync(path.join(tempTestDir, "src", "handler_test.go"), "package main", "utf8");
    writeFileSync(path.join(tempTestDir, "src", "OrderControllerTest.java"), "class OrderControllerTest {}", "utf8");
    writeFileSync(path.join(tempTestDir, "src", "OrderControllerTest.php"), "<?php", "utf8");

    // Fixture files
    writeFileSync(path.join(tempTestDir, "fixtures", "data.json"), "{}", "utf8");
    mkdirSync(path.join(tempTestDir, "src", "mocks"), { recursive: true });
    writeFileSync(path.join(tempTestDir, "src", "mocks", "mock.ts"), "export {};", "utf8");

    // Documentation
    writeFileSync(path.join(tempTestDir, "docs", "README.md"), "# Docs", "utf8");
    writeFileSync(path.join(tempTestDir, "CHANGELOG.txt"), "Changes", "utf8");

    // Config files
    writeFileSync(path.join(tempTestDir, "package.json"), "{}", "utf8");
    writeFileSync(path.join(tempTestDir, "tsconfig.json"), "{}", "utf8");
    writeFileSync(path.join(tempTestDir, "vitest.config.ts"), "export default {};", "utf8");
    writeFileSync(path.join(tempTestDir, "my-config.json"), "{}", "utf8");

    // API/Routes (entrypoints)
    writeFileSync(path.join(tempTestDir, "api", "handler.ts"), "export const handler = () => {};", "utf8");
    writeFileSync(path.join(tempTestDir, "routes", "admin.ts"), "export const admin = {};", "utf8");
  });

  afterAll(() => {
    if (existsSync(tempTestDir)) {
      rmSync(tempTestDir, { recursive: true, force: true });
    }
  });

  describe("detectLanguage", () => {
    describe("TypeScript detection", () => {
      it("detects .ts files as TypeScript", () => {
        expect(detectLanguage("file.ts")).toBe("ts");
        expect(detectLanguage("src/file.ts")).toBe("ts");
        expect(detectLanguage("/path/to/file.ts")).toBe("ts");
      });

      it("detects .tsx files as TypeScript React", () => {
        expect(detectLanguage("component.tsx")).toBe("tsx");
        expect(detectLanguage("src/Component.tsx")).toBe("tsx");
      });
    });

    describe("JavaScript detection", () => {
      it("detects .js files as JavaScript", () => {
        expect(detectLanguage("file.js")).toBe("js");
        expect(detectLanguage("src/app.js")).toBe("js");
      });

      it("detects .jsx files as JavaScript React", () => {
        expect(detectLanguage("component.jsx")).toBe("jsx");
        expect(detectLanguage("src/Button.jsx")).toBe("jsx");
      });

      it("detects .mjs files as JavaScript (ES modules)", () => {
        expect(detectLanguage("module.mjs")).toBe("js");
        expect(detectLanguage("src/utils.mjs")).toBe("js");
      });

      it("detects .cjs files as JavaScript (CommonJS)", () => {
        expect(detectLanguage("module.cjs")).toBe("js");
        expect(detectLanguage("src/config.cjs")).toBe("js");
      });
    });

    describe("Python detection", () => {
      it("detects .py files as Python", () => {
        expect(detectLanguage("script.py")).toBe("py");
        expect(detectLanguage("src/main.py")).toBe("py");
      });
    });

    describe("Ruby detection", () => {
      it("detects .rb files as Ruby", () => {
        expect(detectLanguage("app.rb")).toBe("rb");
        expect(detectLanguage("src/order_service.rb")).toBe("rb");
      });
    });

    describe("Additional language detection", () => {
      it("detects Go, Rust, Java, and PHP files", () => {
        expect(detectLanguage("main.go")).toBe("go");
        expect(detectLanguage("main.rs")).toBe("rs");
        expect(detectLanguage("Main.java")).toBe("java");
        expect(detectLanguage("index.php")).toBe("php");
      });
    });

    describe("Unknown detection", () => {
      it("returns unknown for unrecognized extensions", () => {
        expect(detectLanguage("file.txt")).toBe("unknown");
        expect(detectLanguage("file.json")).toBe("unknown");
        expect(detectLanguage("file.md")).toBe("unknown");
        expect(detectLanguage("file.yaml")).toBe("unknown");
        expect(detectLanguage("file.yml")).toBe("unknown");
        expect(detectLanguage("file")).toBe("unknown");
        expect(detectLanguage("file.swift")).toBe("unknown");
        expect(detectLanguage("file.kt")).toBe("unknown");
      });
    });

    describe("Edge cases", () => {
      it("handles uppercase extensions", () => {
        expect(detectLanguage("file.TS")).toBe("ts");
        expect(detectLanguage("file.JS")).toBe("js");
        expect(detectLanguage("file.PY")).toBe("py");
        expect(detectLanguage("file.RB")).toBe("rb");
        expect(detectLanguage("file.GO")).toBe("go");
        expect(detectLanguage("file.RS")).toBe("rs");
        expect(detectLanguage("file.JAVA")).toBe("java");
        expect(detectLanguage("file.PHP")).toBe("php");
      });

      it("handles mixed case extensions", () => {
        expect(detectLanguage("file.Ts")).toBe("ts");
        expect(detectLanguage("file.Jsx")).toBe("jsx");
      });

      it("handles compound extensions", () => {
        expect(detectLanguage("file.d.ts")).toBe("ts");
        expect(detectLanguage("file.test.ts")).toBe("ts");
        expect(detectLanguage("file.spec.js")).toBe("js");
      });

      it("handles files with no extension", () => {
        expect(detectLanguage("README")).toBe("unknown");
        expect(detectLanguage("LICENSE")).toBe("unknown");
      });

      it("handles hidden files with extension", () => {
        expect(detectLanguage(".env")).toBe("unknown");
        expect(detectLanguage(".gitignore")).toBe("unknown");
      });

      it("handles paths with dots in directory names", () => {
        expect(detectLanguage("src.test/file.ts")).toBe("ts");
        expect(detectLanguage("v1.0.0/file.js")).toBe("js");
      });
    });
  });

  describe("detectRole", () => {
    describe("Test file detection", () => {
      it("detects files in /tests/ directory as test", () => {
        expect(detectRole("tests/app.test.ts")).toBe("test");
        expect(detectRole("src/tests/helper.ts")).toBe("test");
      });

      it("detects files in /test/ directory as test", () => {
        expect(detectRole("test/unit.ts")).toBe("test");
        expect(detectRole("src/test/helper.ts")).toBe("test");
      });

      it("detects files in __tests__/ directory as test", () => {
        expect(detectRole("__tests__/utils.js")).toBe("test");
        expect(detectRole("src/__tests__/component.ts")).toBe("test");
      });

      it("detects .test. pattern as test", () => {
        expect(detectRole("app.test.ts")).toBe("test");
        expect(detectRole("src/app.test.js")).toBe("test");
        expect(detectRole("utils.test.py")).toBe("test");
      });

      it("detects .spec. pattern as test", () => {
        expect(detectRole("app.spec.ts")).toBe("test");
        expect(detectRole("src/utils.spec.js")).toBe("test");
      });

      it("detects _test suffix for Python files as test", () => {
        expect(detectRole("module_test.ts")).toBe("test");
        expect(detectRole("src/utils_test.py")).toBe("test");
        expect(detectRole("src/utils_test.js")).toBe("test");
        expect(detectRole("src/order_spec.rb")).toBe("test");
        expect(detectRole("src/handler_test.go")).toBe("test");
        expect(detectRole("src/OrderControllerTest.java")).toBe("test");
        expect(detectRole("src/OrderControllerTest.php")).toBe("test");
      });
    });

    describe("Fixture file detection", () => {
      it("detects files in /fixtures/ directory as fixture", () => {
        expect(detectRole("fixtures/data.json")).toBe("fixture");
        expect(detectRole("src/fixtures/mock.ts")).toBe("fixture");
      });

      it("detects files in /fixture/ directory as fixture", () => {
        expect(detectRole("fixture/sample.ts")).toBe("fixture");
      });

      it("detects files in __fixtures__/ directory as fixture", () => {
        expect(detectRole("__fixtures__/data.json")).toBe("fixture");
      });

      it("detects files in /mocks/ directory as fixture", () => {
        expect(detectRole("mocks/handler.ts")).toBe("fixture");
        expect(detectRole("src/mocks/service.ts")).toBe("fixture");
      });

      it("detects files in __mocks__/ directory as fixture", () => {
        expect(detectRole("__mocks__/api.ts")).toBe("fixture");
      });

      it("detects files in /stubs/ directory as fixture", () => {
        expect(detectRole("stubs/data.ts")).toBe("fixture");
        expect(detectRole("src/stubs/response.ts")).toBe("fixture");
      });
    });

    describe("Documentation file detection", () => {
      it("detects files starting with docs/ as docs", () => {
        expect(detectRole("docs/README.md")).toBe("docs");
        expect(detectRole("docs/guide.md")).toBe("docs");
      });

      it("detects files in /docs/ directory as docs", () => {
        expect(detectRole("src/docs/api.md")).toBe("docs");
      });

      it("detects .md files as docs", () => {
        expect(detectRole("README.md")).toBe("docs");
        expect(detectRole("CHANGELOG.md")).toBe("docs");
        expect(detectRole("src/component.md")).toBe("docs");
      });

      it("detects .rst files as docs", () => {
        expect(detectRole("docs/index.rst")).toBe("docs");
      });

      it("detects .txt files as docs", () => {
        expect(detectRole("notes.txt")).toBe("docs");
        expect(detectRole("CHANGELOG.txt")).toBe("docs");
      });

      it("detects README without extension as docs", () => {
        expect(detectRole("README")).toBe("docs");
        expect(detectRole("src/README")).toBe("docs");
      });

      it("detects CHANGELOG without extension as docs", () => {
        expect(detectRole("CHANGELOG")).toBe("docs");
      });

      it("detects LICENSE without extension as docs", () => {
        expect(detectRole("LICENSE")).toBe("docs");
      });
    });

    describe("Config file detection", () => {
      it("detects package.json as config", () => {
        expect(detectRole("package.json")).toBe("config");
        expect(detectRole("sub/package.json")).toBe("config");
      });

      it("detects tsconfig.json as config", () => {
        expect(detectRole("tsconfig.json")).toBe("config");
      });

      it("detects jsconfig.json as config", () => {
        expect(detectRole("jsconfig.json")).toBe("config");
      });

      it("detects eslint config files as config", () => {
        expect(detectRole(".eslintrc.json")).toBe("config");
      });

      it("detects prettier config files as config", () => {
        expect(detectRole(".prettierrc.json")).toBe("config");
      });

      it("detects jest.config.js as config", () => {
        expect(detectRole("jest.config.js")).toBe("config");
      });

      it("detects vitest.config.ts as config", () => {
        expect(detectRole("vitest.config.ts")).toBe("config");
      });

      it("detects .yaml files as config", () => {
        expect(detectRole("config.yaml")).toBe("config");
        expect(detectRole("policy.yaml")).toBe("config");
      });

      it("detects .yml files as config", () => {
        expect(detectRole("config.yml")).toBe("config");
        expect(detectRole("workflow.yml")).toBe("config");
      });

      it("detects JSON files with 'config' in name as config", () => {
        expect(detectRole("my-config.json")).toBe("config");
        expect(detectRole("app.config.json")).toBe("config");
      });

      it("detects JSON files with 'settings' in name as config", () => {
        expect(detectRole("settings.json")).toBe("config");
        expect(detectRole("user-settings.json")).toBe("config");
      });

      it("does NOT detect random JSON files as config", () => {
        expect(detectRole("data.json")).toBe("source");
        expect(detectRole("response.json")).toBe("source");
      });
    });

    describe("Generated file detection", () => {
      it("detects files in /dist/ directory as generated", () => {
        expect(detectRole("dist/index.js")).toBe("generated");
        expect(detectRole("src/dist/output.js")).toBe("generated");
      });

      it("detects files in /build/ directory as generated", () => {
        expect(detectRole("build/output.js")).toBe("generated");
      });

      it("detects files in /generated/ directory as generated", () => {
        expect(detectRole("generated/types.ts")).toBe("generated");
      });

      it("detects files in __generated__/ directory as generated", () => {
        expect(detectRole("__generated__/graphql.ts")).toBe("generated");
      });

      it("detects files in /out/ directory as generated", () => {
        expect(detectRole("out/bundle.js")).toBe("generated");
      });

      it("detects .d.ts files as generated", () => {
        expect(detectRole("types.d.ts")).toBe("generated");
        expect(detectRole("src/index.d.ts")).toBe("generated");
      });
    });

    describe("Source file detection", () => {
      it("returns source for regular TypeScript files", () => {
        expect(detectRole("src/index.ts")).toBe("source");
        expect(detectRole("app.ts")).toBe("source");
      });

      it("returns source for regular JavaScript files", () => {
        expect(detectRole("src/app.js")).toBe("source");
        expect(detectRole("utils.js")).toBe("source");
      });

      it("returns source for regular Python files", () => {
        expect(detectRole("src/main.py")).toBe("source");
        expect(detectRole("script.py")).toBe("source");
      });

      it("returns source for regular Ruby files", () => {
        expect(detectRole("src/app.rb")).toBe("source");
        expect(detectRole("lib/order_service.rb")).toBe("source");
      });

      it("returns source for regular additional language files", () => {
        expect(detectRole("src/main.go")).toBe("source");
        expect(detectRole("src/main.rs")).toBe("source");
        expect(detectRole("src/Main.java")).toBe("source");
        expect(detectRole("src/app.php")).toBe("source");
      });

      it("returns source for JSON data files", () => {
        expect(detectRole("data.json")).toBe("source");
        expect(detectRole("response.json")).toBe("source");
      });
    });

    describe("Edge cases", () => {
      it("handles Windows-style paths", () => {
        expect(detectRole("src\\tests\\app.test.ts")).toBe("test");
        expect(detectRole("src\\core\\file.ts")).toBe("source");
      });

      it("handles paths with mixed separators", () => {
        expect(detectRole("src/tests/app.test.ts")).toBe("test");
      });

      it("handles deeply nested paths", () => {
        expect(detectRole("src/a/b/c/d/e/file.test.ts")).toBe("test");
        expect(detectRole("src/a/b/c/d/e/file.ts")).toBe("source");
      });

      it("handles paths with special characters", () => {
        expect(detectRole("src/[test]/file.ts")).toBe("source");
        expect(detectRole("test (1)/file.ts")).toBe("source");
      });
    });
  });

  describe("walkDir", () => {
    it("walks directory and returns all files", () => {
      const files = walkDir(tempTestDir);
      expect(files.length).toBeGreaterThan(0);
    });

    it("returns absolute paths", () => {
      const files = walkDir(tempTestDir);
      for (const file of files) {
        expect(path.isAbsolute(file)).toBe(true);
      }
    });

    it("ignores node_modules by default", () => {
      mkdirSync(path.join(tempTestDir, "node_modules", "package"), { recursive: true });
      writeFileSync(path.join(tempTestDir, "node_modules", "package", "index.js"), "{}", "utf8");

      const files = walkDir(tempTestDir);
      expect(files.some((f) => f.includes("node_modules"))).toBe(false);
    });

    it("ignores .git by default", () => {
      mkdirSync(path.join(tempTestDir, ".git"), { recursive: true });
      writeFileSync(path.join(tempTestDir, ".git", "config"), "test", "utf8");

      const files = walkDir(tempTestDir);
      expect(files.some((f) => f.includes(".git"))).toBe(false);
    });

    it("ignores dist by default", () => {
      mkdirSync(path.join(tempTestDir, "dist"), { recursive: true });
      writeFileSync(path.join(tempTestDir, "dist", "bundle.js"), "{}", "utf8");

      const files = walkDir(tempTestDir);
      expect(files.some((f) => f.includes("dist"))).toBe(false);
    });

    it("allows custom ignored directories", () => {
      const customIgnored = new Set(["custom-ignore"]);
      mkdirSync(path.join(tempTestDir, "custom-ignore"), { recursive: true });
      writeFileSync(path.join(tempTestDir, "custom-ignore", "file.ts"), "test", "utf8");

      const files = walkDir(tempTestDir, customIgnored);
      expect(files.some((f) => f.includes("custom-ignore"))).toBe(false);
    });

    it("returns empty array for non-existent directory", () => {
      const files = walkDir("/nonexistent/path");
      expect(files).toEqual([]);
    });

    it("handles empty directory", () => {
      const emptyDir = path.join(tempTestDir, "empty-dir");
      mkdirSync(emptyDir, { recursive: true });

      const files = walkDir(emptyDir);
      expect(files).toEqual([]);
    });

    it("ignores .qh* pattern directories", () => {
      mkdirSync(path.join(tempTestDir, ".qh-custom"), { recursive: true });
      writeFileSync(path.join(tempTestDir, ".qh-custom", "file.ts"), "test", "utf8");

      const files = walkDir(tempTestDir);
      expect(files.some((f) => f.includes(".qh-custom"))).toBe(false);
    });

    it("ignores .test-temp* pattern directories", () => {
      mkdirSync(path.join(tempTestDir, ".test-temp-smoke"), { recursive: true });
      writeFileSync(path.join(tempTestDir, ".test-temp-smoke", "file.ts"), "test", "utf8");

      const files = walkDir(tempTestDir);
      expect(files.some((f) => f.includes(".test-temp-smoke"))).toBe(false);
    });
  });

  describe("isTargetFile", () => {
    it("returns true for TypeScript files", () => {
      expect(isTargetFile("file.ts")).toBe(true);
      expect(isTargetFile("src/file.ts")).toBe(true);
    });

    it("returns true for TSX files", () => {
      expect(isTargetFile("component.tsx")).toBe(true);
    });

    it("returns true for JavaScript files", () => {
      expect(isTargetFile("file.js")).toBe(true);
      expect(isTargetFile("app.jsx")).toBe(true);
      expect(isTargetFile("module.mjs")).toBe(true);
      expect(isTargetFile("config.cjs")).toBe(true);
    });

    it("returns true for Python files", () => {
      expect(isTargetFile("script.py")).toBe(true);
    });

    it("returns true for Ruby files", () => {
      expect(isTargetFile("app.rb")).toBe(true);
    });

    it("returns true for Go, Rust, Java, and PHP files", () => {
      expect(isTargetFile("main.go")).toBe(true);
      expect(isTargetFile("main.rs")).toBe(true);
      expect(isTargetFile("Main.java")).toBe(true);
      expect(isTargetFile("index.php")).toBe(true);
    });

    it("returns true for JSON files", () => {
      expect(isTargetFile("data.json")).toBe(true);
      expect(isTargetFile("package.json")).toBe(true);
    });

    it("returns true for YAML files", () => {
      expect(isTargetFile("config.yaml")).toBe(true);
      expect(isTargetFile("workflow.yml")).toBe(true);
    });

    it("returns true for Markdown files", () => {
      expect(isTargetFile("README.md")).toBe(true);
    });

    it("returns false for .d.ts declaration files", () => {
      expect(isTargetFile("types.d.ts")).toBe(false);
      expect(isTargetFile("src/index.d.ts")).toBe(false);
    });

    it("returns false for non-target extensions", () => {
      expect(isTargetFile("file.txt")).toBe(false);
      expect(isTargetFile("file.swift")).toBe(false);
      expect(isTargetFile("file.kt")).toBe(false);
      expect(isTargetFile("file.css")).toBe(false);
      expect(isTargetFile("file.html")).toBe(false);
    });
  });

  describe("isEntrypoint", () => {
    describe("Path-based detection", () => {
      it("detects /api/ paths as entrypoints", () => {
        expect(isEntrypoint("api/handler.ts")).toBe(true);
        expect(isEntrypoint("src/api/routes.ts")).toBe(true);
      });

      it("detects /routes/ paths as entrypoints", () => {
        expect(isEntrypoint("routes/admin.ts")).toBe(true);
        expect(isEntrypoint("src/routes/index.ts")).toBe(true);
      });

      it("detects /handlers/ paths as entrypoints", () => {
        expect(isEntrypoint("handlers/request.ts")).toBe(true);
      });

      it("detects /controllers/ paths as entrypoints", () => {
        expect(isEntrypoint("controllers/user.ts")).toBe(true);
      });

      it("detects server.ts as entrypoint", () => {
        expect(isEntrypoint("server.ts")).toBe(true);
        expect(isEntrypoint("src/server.ts")).toBe(true);
      });

      it("detects server.js as entrypoint", () => {
        expect(isEntrypoint("server.js")).toBe(true);
      });

      it("detects app.ts as entrypoint", () => {
        expect(isEntrypoint("app.ts")).toBe(true);
        expect(isEntrypoint("src/app.ts")).toBe(true);
      });

      it("detects app.js as entrypoint", () => {
        expect(isEntrypoint("app.js")).toBe(true);
      });

      it("detects index.ts as entrypoint", () => {
        expect(isEntrypoint("index.ts")).toBe(true);
        expect(isEntrypoint("src/index.ts")).toBe(true);
      });

      it("detects index.js as entrypoint", () => {
        expect(isEntrypoint("index.js")).toBe(true);
      });

      it("detects main.ts as entrypoint", () => {
        expect(isEntrypoint("main.ts")).toBe(true);
      });

      it("detects main.js as entrypoint", () => {
        expect(isEntrypoint("main.js")).toBe(true);
      });

      it("returns false for regular source files", () => {
        expect(isEntrypoint("src/utils.ts")).toBe(false);
        expect(isEntrypoint("lib/helper.ts")).toBe(false);
        expect(isEntrypoint("domain/model.ts")).toBe(false);
      });
    });

    describe("Content-based detection", () => {
      it("detects app.use pattern", () => {
        expect(isEntrypoint("src/middleware.ts", "app.use(express.json())")).toBe(true);
      });

      it("detects app.listen pattern", () => {
        expect(isEntrypoint("src/start.ts", "app.listen(3000)")).toBe(true);
      });

      it("detects express() pattern", () => {
        expect(isEntrypoint("src/server.ts", "const app = express()")).toBe(true);
      });

      it("detects createServer pattern", () => {
        expect(isEntrypoint("src/server.ts", "http.createServer()")).toBe(true);
      });

      it("detects createOrderRoute pattern", () => {
        expect(isEntrypoint("src/routes.ts", "export const createOrderRoute")).toBe(true);
      });

      it("detects adminRoutes pattern", () => {
        expect(isEntrypoint("src/admin.ts", "export const adminRoutes")).toBe(true);
      });

      it("detects accountRoutes pattern", () => {
        expect(isEntrypoint("src/account.ts", "export const accountRoutes")).toBe(true);
      });

      it("detects publicRoutes pattern", () => {
        expect(isEntrypoint("src/public.ts", "export const publicRoutes")).toBe(true);
      });

      it("detects router. pattern", () => {
        expect(isEntrypoint("src/routes.ts", "router.get('/api')")).toBe(true);
        expect(isEntrypoint("src/routes.ts", "router.post('/data')")).toBe(true);
      });

      it("detects express.Router pattern", () => {
        expect(isEntrypoint("src/routes.ts", "const router = express.Router()")).toBe(true);
      });

      it("returns false for non-entrypoint content", () => {
        expect(isEntrypoint("src/utils.ts", "export const helper = () => {}")).toBe(false);
        expect(isEntrypoint("src/model.ts", "interface User {}")).toBe(false);
      });

      it("returns false without content for regular files", () => {
        expect(isEntrypoint("src/utils.ts")).toBe(false);
      });
    });
  });

  describe("entrypointKind", () => {
    it("returns admin-route for admin paths", () => {
      expect(entrypointKind("routes/admin.ts")).toBe("admin-route");
      expect(entrypointKind("api/admin/index.ts")).toBe("admin-route");
    });

    it("returns checkout-route for order/checkout paths", () => {
      expect(entrypointKind("routes/order.ts")).toBe("checkout-route");
      expect(entrypointKind("api/checkout.ts")).toBe("checkout-route");
    });

    it("returns api-route for api paths", () => {
      expect(entrypointKind("api/users.ts")).toBe("api-route");
      expect(entrypointKind("src/api/handler.ts")).toBe("api-route");
    });

    it("returns route for routes/router paths", () => {
      expect(entrypointKind("routes/index.ts")).toBe("route");
      expect(entrypointKind("src/router.ts")).toBe("route");
    });

    it("returns server-entry for server/app paths", () => {
      expect(entrypointKind("server.ts")).toBe("server-entry");
      expect(entrypointKind("src/app.ts")).toBe("server-entry");
    });

    it("returns main-entry for index/main paths", () => {
      expect(entrypointKind("index.ts")).toBe("main-entry");
      expect(entrypointKind("src/main.ts")).toBe("main-entry");
    });

    it("returns entrypoint as default", () => {
      expect(entrypointKind("src/utils.ts")).toBe("entrypoint");
      expect(entrypointKind("lib/helper.ts")).toBe("entrypoint");
    });
  });

  describe("getFileStats", () => {
    it("returns stats for existing file", () => {
      const filePath = path.join(tempTestDir, "src", "index.ts");
      const stats = getFileStats(filePath, "export {};");
      expect(stats.sizeBytes).toBeGreaterThan(0);
      expect(stats.lineCount).toBe(1);
    });

    it("returns zeros for non-existent file", () => {
      const stats = getFileStats("/nonexistent/file.ts");
      expect(stats.sizeBytes).toBe(0);
      expect(stats.lineCount).toBe(0);
    });

    it("counts lines correctly for multi-line content", () => {
      const content = "line1\nline2\nline3\nline4";
      const stats = getFileStats(path.join(tempTestDir, "src", "index.ts"), content);
      expect(stats.lineCount).toBe(4);
    });

    it("counts lines correctly for CRLF endings", () => {
      const content = "line1\r\nline2\r\nline3";
      const stats = getFileStats(path.join(tempTestDir, "src", "index.ts"), content);
      expect(stats.lineCount).toBe(3);
    });
  });

  describe("isValidDirectory", () => {
    it("returns true for valid directory", () => {
      expect(isValidDirectory(tempTestDir)).toBe(true);
      expect(isValidDirectory(path.join(tempTestDir, "src"))).toBe(true);
    });

    it("returns false for non-existent directory", () => {
      expect(isValidDirectory("/nonexistent/path")).toBe(false);
    });

    it("returns false for a file", () => {
      const filePath = path.join(tempTestDir, "src", "index.ts");
      expect(isValidDirectory(filePath)).toBe(false);
    });
  });

  describe("detectTestFramework", () => {
    it("returns pytest for Python files", () => {
      expect(detectTestFramework("test.py")).toBe("pytest");
      expect(detectTestFramework("src/test.py")).toBe("pytest");
    });

    it("returns Ruby test frameworks for Ruby files", () => {
      expect(detectTestFramework("order_spec.rb")).toBe("rspec");
      expect(detectTestFramework("order_test.rb")).toBe("minitest");
    });

    it("returns frameworks for additional languages", () => {
      expect(detectTestFramework("handler_test.go")).toBe("go test");
      expect(detectTestFramework("main_test.rs")).toBe("cargo test");
      expect(detectTestFramework("OrderControllerTest.java")).toBe("junit");
      expect(detectTestFramework("OrderControllerTest.php")).toBe("phpunit");
    });

    it("returns node:test for JavaScript files", () => {
      expect(detectTestFramework("test.js")).toBe("node:test");
      expect(detectTestFramework("src/test.js")).toBe("node:test");
    });

    it("returns vitest for TypeScript files", () => {
      expect(detectTestFramework("test.ts")).toBe("vitest");
      expect(detectTestFramework("src/test.ts")).toBe("vitest");
    });

    it("returns vitest for TSX files", () => {
      expect(detectTestFramework("test.tsx")).toBe("vitest");
    });

    it("returns unknown for other extensions", () => {
      expect(detectTestFramework("test.swift")).toBe("unknown");
      expect(detectTestFramework("test.kt")).toBe("unknown");
    });
  });

  describe("DEFAULT_IGNORED_DIRS", () => {
    it("contains .git", () => {
      expect(DEFAULT_IGNORED_DIRS.has(".git")).toBe(true);
    });

    it("contains node_modules", () => {
      expect(DEFAULT_IGNORED_DIRS.has("node_modules")).toBe(true);
    });

    it("contains dist", () => {
      expect(DEFAULT_IGNORED_DIRS.has("dist")).toBe(true);
    });

    it("contains coverage", () => {
      expect(DEFAULT_IGNORED_DIRS.has("coverage")).toBe(true);
    });

    it("contains __pycache__", () => {
      expect(DEFAULT_IGNORED_DIRS.has("__pycache__")).toBe(true);
    });

    it("contains .cache", () => {
      expect(DEFAULT_IGNORED_DIRS.has(".cache")).toBe(true);
    });

    it("contains .venv", () => {
      expect(DEFAULT_IGNORED_DIRS.has(".venv")).toBe(true);
    });

    it("contains venv", () => {
      expect(DEFAULT_IGNORED_DIRS.has("venv")).toBe(true);
    });

    it("contains .browser-use-env", () => {
      expect(DEFAULT_IGNORED_DIRS.has(".browser-use-env")).toBe(true);
    });

    it("contains .test-temp", () => {
      expect(DEFAULT_IGNORED_DIRS.has(".test-temp")).toBe(true);
    });
  });
});
