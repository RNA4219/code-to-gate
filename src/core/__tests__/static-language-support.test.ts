import { describe, expect, it } from "vitest";
import { detectLanguage, detectRole, isEntrypoint } from "../file-utils.js";

describe("static language support", () => {
  it("detects C# and C++ file extensions", () => {
    expect(detectLanguage("src/Program.cs")).toBe("cs");
    expect(detectLanguage("src/main.cpp")).toBe("cpp");
    expect(detectLanguage("include/order.hpp")).toBe("cpp");
  });

  it("detects common static-language tests and entrypoints", () => {
    expect(detectRole("tests/OrderControllerTests.cs")).toBe("test");
    expect(detectRole("src/order_test.cpp")).toBe("test");
    expect(isEntrypoint("src/Program.cs", "static void Main(string[] args) {}")).toBe(true);
    expect(isEntrypoint("src/main.cpp", "int main() { return 0; }")).toBe(true);
  });
});
