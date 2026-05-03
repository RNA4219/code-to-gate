/**
 * Tests for Go tree-sitter WASM adapter
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  initGoParser,
  parseGoTreeSitter,
  parseGoFileSync,
  isGoTreeSitterAvailable,
} from "../go-tree-sitter-adapter.js";

describe("Go tree-sitter adapter", () => {
  beforeAll(async () => {
    await initGoParser();
  });

  describe("initialization", () => {
    it("should attempt to initialize", async () => {
      const result = await initGoParser();
      expect(typeof result).toBe("boolean");
    });

    it("should report availability", () => {
      const available = isGoTreeSitterAvailable();
      expect(typeof available).toBe("boolean");
    });
  });

  describe("package parsing", () => {
    it("should parse package declaration", async () => {
      const content = `package main`;
      const result = await parseGoTreeSitter(content, "main.go");

      const packageSymbol = result.symbols.find(s => s.name === "main" && s.kind === "interface");
      expect(packageSymbol).toBeDefined();
    });
  });

  describe("import parsing", () => {
    it("should parse single import", async () => {
      const content = `package main

import "fmt"`;
      const result = await parseGoTreeSitter(content, "main.go");

      const importSymbols = result.symbols.filter(s => s.name === "fmt");
      expect(importSymbols.length).toBeGreaterThan(0);
    });

    it("should parse multiple imports", async () => {
      const content = `package main

import (
  "fmt"
  "os"
)`;
      const result = await parseGoTreeSitter(content, "main.go");

      const importSymbols = result.symbols.filter(
        s => s.name === "fmt" || s.name === "os"
      );
      expect(importSymbols.length).toBe(2);
    });
  });

  describe("function parsing", () => {
    it("should parse basic function", async () => {
      const content = `package main

func main() {
  fmt.Println("hello")
}`;
      const result = await parseGoTreeSitter(content, "main.go");

      const func = result.symbols.find(s => s.kind === "function" && s.name === "main");
      expect(func).toBeDefined();
    });

    it("should parse function with parameters", async () => {
      const content = `package main

func add(a int, b int) int {
  return a + b
}`;
      const result = await parseGoTreeSitter(content, "main.go");

      const func = result.symbols.find(s => s.kind === "function" && s.name === "add");
      expect(func).toBeDefined();
    });
  });

  describe("struct parsing", () => {
    it("should parse struct", async () => {
      const content = `package main

type Config struct {
  Name string
  Value int
}`;
      const result = await parseGoTreeSitter(content, "config.go");

      const structSymbol = result.symbols.find(s => s.kind === "class" && s.name === "Config");
      expect(structSymbol).toBeDefined();
    });
  });

  describe("interface parsing", () => {
    it("should parse interface", async () => {
      const content = `package main

type Reader interface {
  Read() error
}`;
      const result = await parseGoTreeSitter(content, "reader.go");

      const interfaceSymbol = result.symbols.find(s => s.kind === "interface" && s.name === "Reader");
      expect(interfaceSymbol).toBeDefined();
    });
  });

  describe("method parsing", () => {
    it("should parse method with receiver", async () => {
      const content = `package main

type Service struct{}

func (s *Service) Run() error {
  return nil
}`;
      const result = await parseGoTreeSitter(content, "service.go");

      const method = result.symbols.find(s => s.kind === "method");
      expect(method).toBeDefined();
    });
  });

  describe("error handling", () => {
    it("should handle syntax errors", async () => {
      const content = `package main

func broken(`;
      const result = await parseGoTreeSitter(content, "broken.go");

      expect(result.symbols).toBeDefined();
    });

    it("should handle empty file", async () => {
      const content = "";
      const result = await parseGoTreeSitter(content, "empty.go");

      expect(result.symbols.length).toBe(0);
      expect(result.relations.length).toBe(0);
    });
  });

  describe("regex fallback", () => {
    it("should work with regex fallback", async () => {
      const content = `package main

import "fmt"

func hello() {
  fmt.Println("hello")
}`;
      const result = await parseGoTreeSitter(content, "hello.go");

      expect(result.parserStatus).toBe("parsed");
      expect(result.symbols.length).toBeGreaterThan(0);
    });

    it("sync parse should work", () => {
      const content = `package main

func main() {}`;
      const result = parseGoFileSync(content, "main.go");

      expect(result.parserStatus).toBe("parsed");
      expect(result.symbols.length).toBeGreaterThan(0);
    });
  });
});