/**
 * Tests for Rust tree-sitter WASM adapter
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  initRustParser,
  parseRustTreeSitter,
  parseRustFileSync,
  isRustTreeSitterAvailable,
} from "../rs-tree-sitter-adapter.js";

describe("Rust tree-sitter adapter", () => {
  beforeAll(async () => {
    await initRustParser();
  });

  describe("initialization", () => {
    it("should attempt to initialize", async () => {
      const result = await initRustParser();
      expect(typeof result).toBe("boolean");
    });

    it("should report availability", () => {
      const available = isRustTreeSitterAvailable();
      expect(typeof available).toBe("boolean");
    });
  });

  describe("use parsing", () => {
    it("should parse single use", async () => {
      const content = `use std::collections::HashMap;`;
      const result = await parseRustTreeSitter(content, "main.rs");

      const useSymbols = result.symbols.filter(s => s.name.includes("std"));
      expect(useSymbols.length).toBeGreaterThan(0);
    });

    it("should parse use list", async () => {
      const content = `use std::{io, fmt};`;
      const result = await parseRustTreeSitter(content, "main.rs");

      expect(result.symbols.length).toBeGreaterThan(0);
    });
  });

  describe("function parsing", () => {
    it("should parse basic function", async () => {
      const content = `fn main() {
    println!("hello");
}`;
      const result = await parseRustTreeSitter(content, "main.rs");

      const func = result.symbols.find(s => s.kind === "function" && s.name === "main");
      expect(func).toBeDefined();
    });

    it("should parse async function", async () => {
      const content = `async fn fetch() -> Result<String, Error> {
    Ok("data".to_string())
}`;
      const result = await parseRustTreeSitter(content, "fetch.rs");

      const func = result.symbols.find(s => s.kind === "function" && s.name === "fetch");
      expect(func).toBeDefined();
      expect(func?.async).toBe(true);
    });

    it("should parse pub function", async () => {
      const content = `pub fn public_func() {}`;
      const result = await parseRustTreeSitter(content, "lib.rs");

      const func = result.symbols.find(s => s.kind === "function" && s.name === "public_func");
      expect(func).toBeDefined();
    });
  });

  describe("struct parsing", () => {
    it("should parse struct", async () => {
      const content = `struct Config {
    name: String,
    value: i32,
}`;
      const result = await parseRustTreeSitter(content, "config.rs");

      const structSymbol = result.symbols.find(s => s.kind === "class" && s.name === "Config");
      expect(structSymbol).toBeDefined();
    });

    it("should parse pub struct", async () => {
      const content = `pub struct Service {
    id: u64,
}`;
      const result = await parseRustTreeSitter(content, "service.rs");

      const structSymbol = result.symbols.find(s => s.kind === "class" && s.name === "Service");
      expect(structSymbol).toBeDefined();
    });
  });

  describe("enum parsing", () => {
    it("should parse enum", async () => {
      const content = `enum Status {
    Active,
    Inactive,
}`;
      const result = await parseRustTreeSitter(content, "status.rs");

      const enumSymbol = result.symbols.find(s => s.kind === "type" && s.name === "Status");
      expect(enumSymbol).toBeDefined();
    });

    it("should parse enum variants", async () => {
      const content = `pub enum Result {
    Ok,
    Err,
}`;
      const result = await parseRustTreeSitter(content, "result.rs");

      const variants = result.symbols.filter(s => s.name.includes("Result."));
      expect(variants.length).toBeGreaterThan(0);
    });
  });

  describe("trait parsing", () => {
    it("should parse trait", async () => {
      const content = `trait Reader {
    fn read(&self) -> String;
}`;
      const result = await parseRustTreeSitter(content, "reader.rs");

      const traitSymbol = result.symbols.find(s => s.kind === "interface" && s.name === "Reader");
      expect(traitSymbol).toBeDefined();
    });
  });

  describe("impl parsing", () => {
    it("should parse impl block", async () => {
      const content = `struct Point { x: i32, y: i32 }

impl Point {
    fn new(x: i32, y: i32) -> Self {
        Self { x, y }
    }
}`;
      const result = await parseRustTreeSitter(content, "point.rs");

      const implSymbol = result.symbols.find(s => s.name === "impl Point");
      expect(implSymbol).toBeDefined();
    });

    it("should parse trait impl", async () => {
      const content = `impl Display for Point {
    fn fmt(&self, f: &mut Formatter) -> Result {
        write!(f, "({}, {})", self.x, self.y)
    }
}`;
      const result = await parseRustTreeSitter(content, "point.rs");

      const implSymbol = result.symbols.find(s => s.name.includes("Display"));
      expect(implSymbol).toBeDefined();
    });

    it("should extract impl methods", async () => {
      const content = `impl Service {
    fn run(&self) {}
    fn stop(&self) {}
}`;
      const result = await parseRustTreeSitter(content, "service.rs");

      const methods = result.symbols.filter(s => s.kind === "method");
      expect(methods.length).toBeGreaterThan(0);
    });
  });

  describe("error handling", () => {
    it("should handle syntax errors", async () => {
      const content = `fn broken(`;
      const result = await parseRustTreeSitter(content, "broken.rs");

      expect(result.symbols).toBeDefined();
    });

    it("should handle empty file", async () => {
      const content = "";
      const result = await parseRustTreeSitter(content, "empty.rs");

      expect(result.symbols.length).toBe(0);
      expect(result.relations.length).toBe(0);
    });
  });

  describe("regex fallback", () => {
    it("should work with regex fallback", async () => {
      const content = `use std::io;

fn main() {
    println!("hello");
}`;
      const result = await parseRustTreeSitter(content, "main.rs");

      expect(result.parserStatus).toBe("parsed");
      expect(result.symbols.length).toBeGreaterThan(0);
    });

    it("sync parse should work", () => {
      const content = `fn main() {}`;
      const result = parseRustFileSync(content, "main.rs");

      expect(result.parserStatus).toBe("parsed");
      expect(result.symbols.length).toBeGreaterThan(0);
    });
  });
});