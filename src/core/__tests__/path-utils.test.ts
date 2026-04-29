/**
 * Tests for path-utils.ts
 */

import { describe, it, expect } from "vitest";
import {
  toPosix,
  sha256,
  getRelativePath,
  joinPosix,
  resolvePosix,
  isAbsolutePath,
  getExtension,
  getDirectoryName,
  getBaseName,
  normalizePosix,
} from "../path-utils.js";
import path from "node:path";

describe("path-utils", () => {
  describe("toPosix", () => {
    it("converts Windows-style backslash paths to forward slashes", () => {
      expect(toPosix("C:\\Users\\test\\file.ts")).toBe("C:/Users/test/file.ts");
    });

    it("converts mixed backslash and forward slash paths", () => {
      expect(toPosix("C:\\Users/test\\file.ts")).toBe("C:/Users/test/file.ts");
    });

    it("preserves POSIX-style paths unchanged", () => {
      expect(toPosix("/home/user/file.ts")).toBe("/home/user/file.ts");
    });

    it("handles relative paths with backslashes", () => {
      expect(toPosix("src\\core\\file.ts")).toBe("src/core/file.ts");
    });

    it("handles paths with multiple backslashes", () => {
      expect(toPosix("src\\deep\\nested\\path\\file.ts")).toBe("src/deep/nested/path/file.ts");
    });

    it("handles empty string", () => {
      expect(toPosix("")).toBe("");
    });

    it("handles paths with only forward slashes", () => {
      expect(toPosix("src/core/file.ts")).toBe("src/core/file.ts");
    });

    it("handles paths with no separators", () => {
      expect(toPosix("file.ts")).toBe("file.ts");
    });

    it("handles root paths", () => {
      expect(toPosix("C:\\")).toBe("C:/");
    });

    it("handles UNC paths", () => {
      expect(toPosix("\\\\server\\share\\file.ts")).toBe("//server/share/file.ts");
    });
  });

  describe("sha256", () => {
    it("generates consistent SHA-256 hash for same input", () => {
      const hash1 = sha256("test content");
      const hash2 = sha256("test content");
      expect(hash1).toBe(hash2);
    });

    it("generates different hashes for different inputs", () => {
      const hash1 = sha256("test content 1");
      const hash2 = sha256("test content 2");
      expect(hash1).not.toBe(hash2);
    });

    it("returns hex-encoded string", () => {
      const hash = sha256("test");
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("handles empty string", () => {
      const hash = sha256("");
      expect(hash).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    });

    it("handles unicode characters", () => {
      const hash = sha256("test unicode: \u{1F600}");
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("handles long strings", () => {
      const longString = "a".repeat(10000);
      const hash = sha256(longString);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("handles special characters", () => {
      const hash = sha256("special: !@#$%^&*()");
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("handles newlines", () => {
      const hash = sha256("line1\nline2\nline3");
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe("getRelativePath", () => {
    it("gets relative path from base to target", () => {
      const result = getRelativePath("/home/user", "/home/user/src/file.ts");
      expect(result).toBe("src/file.ts");
    });

    it("returns POSIX format for Windows paths", () => {
      // Use path.relative behavior which depends on platform
      const base = "C:\\Users\\test";
      const target = "C:\\Users\\test\\src\\file.ts";
      const result = getRelativePath(base, target);
      expect(result).not.toContain("\\");
    });

    it("handles same directory", () => {
      const result = getRelativePath("/home/user", "/home/user");
      expect(result).toBe("");
    });

    it("handles nested directories", () => {
      const result = getRelativePath("/home", "/home/user/project/src/file.ts");
      expect(result).toBe("user/project/src/file.ts");
    });
  });

  describe("joinPosix", () => {
    it("joins path segments and converts to POSIX", () => {
      const result = joinPosix("src", "core", "file.ts");
      expect(result).toBe("src/core/file.ts");
    });

    it("handles single segment", () => {
      const result = joinPosix("file.ts");
      expect(result).toBe("file.ts");
    });

    it("handles no segments", () => {
      const result = joinPosix();
      expect(result).toBe(".");
    });

    it("handles absolute path prefix", () => {
      const result = joinPosix("/", "src", "file.ts");
      expect(result).toBe("/src/file.ts");
    });
  });

  describe("resolvePosix", () => {
    it("resolves to absolute path and converts to POSIX", () => {
      const result = resolvePosix("src", "file.ts");
      expect(result).not.toContain("\\");
      expect(isAbsolutePath(result)).toBe(true);
    });

    it("handles empty segments", () => {
      const result = resolvePosix();
      expect(isAbsolutePath(result)).toBe(true);
    });
  });

  describe("isAbsolutePath", () => {
    it("returns true for absolute POSIX paths", () => {
      expect(isAbsolutePath("/home/user/file.ts")).toBe(true);
    });

    it("returns true for absolute Windows paths", () => {
      expect(isAbsolutePath("C:\\Users\\file.ts")).toBe(true);
    });

    it("returns false for relative paths", () => {
      expect(isAbsolutePath("src/file.ts")).toBe(false);
    });

    it("returns false for paths starting with ./", () => {
      expect(isAbsolutePath("./src/file.ts")).toBe(false);
    });

    it("returns false for paths starting with ../", () => {
      expect(isAbsolutePath("../src/file.ts")).toBe(false);
    });
  });

  describe("getExtension", () => {
    it("returns extension with dot for TypeScript files", () => {
      expect(getExtension("file.ts")).toBe(".ts");
    });

    it("returns extension with dot for JavaScript files", () => {
      expect(getExtension("file.js")).toBe(".js");
    });

    it("returns extension for files with multiple dots", () => {
      expect(getExtension("file.test.ts")).toBe(".ts");
    });

    it("returns empty string for files without extension", () => {
      expect(getExtension("README")).toBe("");
    });

    it("handles hidden files with extension", () => {
      expect(getExtension(".gitignore")).toBe(".gitignore");
    });

    it("handles compound extensions", () => {
      expect(getExtension("file.d.ts")).toBe(".ts");
    });

    it("handles uppercase extensions", () => {
      expect(getExtension("file.TS")).toBe(".TS");
    });
  });

  describe("getDirectoryName", () => {
    it("returns directory name for file in subdirectory", () => {
      expect(getDirectoryName("src/core/file.ts")).toBe("src/core");
    });

    it("returns . for file in current directory", () => {
      expect(getDirectoryName("file.ts")).toBe(".");
    });

    it("handles root paths", () => {
      expect(getDirectoryName("/file.ts")).toBe("/");
    });
  });

  describe("getBaseName", () => {
    it("returns file name from full path", () => {
      expect(getBaseName("src/core/file.ts")).toBe("file.ts");
    });

    it("returns file name for simple path", () => {
      expect(getBaseName("file.ts")).toBe("file.ts");
    });

    it("handles paths ending with separator", () => {
      expect(getBaseName("src/core/")).toBe("core");
    });
  });

  describe("normalizePosix", () => {
    it("normalizes and converts path to POSIX", () => {
      const result = normalizePosix("src/../core/./file.ts");
      expect(result).toBe("core/file.ts");
    });

    it("handles empty path", () => {
      const result = normalizePosix("");
      expect(result).toBe(".");
    });

    it("handles paths with multiple consecutive slashes", () => {
      const result = normalizePosix("src//core///file.ts");
      expect(result).toBe("src/core/file.ts");
    });
  });
});