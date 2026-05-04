/**
 * CIRCULAR_DEPENDENCY Rule
 *
 * Detects circular import dependencies that can cause:
 * - Runtime errors ("Cannot access before initialization")
 * - Build failures
 * - Module initialization order issues
 *
 * Uses DFS-based cycle detection on the import graph.
 */

import type { RulePlugin, RuleContext, Finding } from "./index.js";
import { createEvidence, generateFindingId } from "./index.js";

interface ImportGraph {
  nodes: Map<string, Set<string>>; // file -> imported files
}

interface CircularDependency {
  files: string[];
  depth: number;
}

// Extract imports from file content
function extractImports(content: string, filePath: string): Set<string> {
  const imports = new Set<string>();

  // Simple regex to capture module path from import/export statements
  // Match any import/export followed by a quoted string
  const patterns = [
    // import X from 'path' or import { X } from 'path' etc.
    /import[^'"]*['"]([^'"]+)['"]/g,
    // export ... from 'path'
    /export[^'"]*from[^'"]*['"]([^'"]+)['"]/g,
    // import 'path' (side effect)
    /import\s*['"]([^'"]+)['"]/g,
    // require('path')
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];

  // Get directory path (without trailing slash)
  const lastSlash = filePath.lastIndexOf("/");
  const baseDir = lastSlash > 0 ? filePath.substring(0, lastSlash) : "";

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const importPath = resolveImportPath(match[1], baseDir);
      if (importPath) imports.add(importPath);
    }
  }

  return imports;
}

// Resolve relative import path to file path
function resolveImportPath(importPath: string, baseDir: string): string | null {
  // Skip external packages (don't start with ./ or ../)
  if (!importPath.startsWith("./") && !importPath.startsWith("../")) {
    return null;
  }

  // Start with baseDir
  let resolved = baseDir;

  // Split import path by "/" to handle each segment
  const segments = importPath.split("/");

  for (const segment of segments) {
    if (segment === "..") {
      // Go up one directory level
      const lastSlash = resolved.lastIndexOf("/");
      if (lastSlash > 0) {
        resolved = resolved.substring(0, lastSlash);
      } else {
        resolved = "";
      }
    } else if (segment === "." || segment === "") {
      // Current directory - no change
      continue;
    } else {
      // Normal segment - add to path
      resolved = resolved + "/" + segment;
    }
  }

  // Add .ts extension if missing
  if (!resolved.match(/\.(ts|tsx|js|jsx|mjs|cjs)$/)) {
    resolved += ".ts";
  }

  return resolved;
}

// Build import graph from all files
function buildImportGraph(context: RuleContext): ImportGraph {
  const nodes = new Map<string, Set<string>>();

  for (const file of context.graph.files) {
    if (file.role !== "source") continue;

    const content = context.getFileContent(file.path);
    if (!content) continue;

    const imports = extractImports(content, file.path);
    if (imports.size > 0) {
      nodes.set(file.path, imports);
    }
  }

  return { nodes };
}

// DFS-based cycle detection
function detectCircularDependencies(graph: ImportGraph): CircularDependency[] {
  const cycles: CircularDependency[] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const path: string[] = [];

  function dfs(current: string): void {
    if (recursionStack.has(current)) {
      // Found cycle - extract the cycle from path
      const cycleStart = path.indexOf(current);
      if (cycleStart !== -1) {
        const cycleFiles = [...path.slice(cycleStart), current];
        cycles.push({
          files: cycleFiles,
          depth: cycleFiles.length - 1,
        });
      }
      return;
    }

    if (visited.has(current)) return;

    visited.add(current);
    recursionStack.add(current);
    path.push(current);

    const imports = graph.nodes.get(current) || new Set();
    for (const imported of imports) {
      dfs(imported);
    }

    path.pop();
    recursionStack.delete(current);
  }

  // Run DFS from each node
  for (const [file] of graph.nodes) {
    if (!visited.has(file)) {
      dfs(file);
    }
  }

  // Deduplicate cycles (same cycle can be found from multiple starting points)
  const uniqueCycles = new Map<string, CircularDependency>();
  for (const cycle of cycles) {
    // Normalize cycle for deduplication (start from smallest path)
    const normalized = normalizeCycle(cycle.files);
    const key = normalized.join("→");
    if (!uniqueCycles.has(key) || cycle.depth < uniqueCycles.get(key)!.depth) {
      uniqueCycles.set(key, cycle);
    }
  }

  return Array.from(uniqueCycles.values());
}

// Normalize cycle by starting from the smallest path element
function normalizeCycle(files: string[]): string[] {
  if (files.length <= 1) return files;

  // Find the smallest element
  let minIdx = 0;
  for (let i = 1; i < files.length - 1; i++) {
    if (files[i] < files[minIdx]) {
      minIdx = i;
    }
  }

  // Rotate cycle to start from smallest
  return [...files.slice(minIdx), ...files.slice(0, minIdx)];
}

export const CIRCULAR_DEPENDENCY_RULE: RulePlugin = {
  id: "CIRCULAR_DEPENDENCY",
  name: "Circular Dependency",
  description:
    "Detects circular import dependencies that may cause runtime errors ('Cannot access before initialization'), build failures, and module initialization order issues. Severity increases with cycle depth.",
  category: "maintainability",
  defaultSeverity: "high",
  defaultConfidence: 0.95,

  evaluate(context: RuleContext): Finding[] {
    const findings: Finding[] = [];

    // Build import graph
    const graph = buildImportGraph(context);

    // Detect cycles
    const cycles = detectCircularDependencies(graph);

    for (const cycle of cycles) {
      // Severity based on depth
      const severity = cycle.depth > 3 ? "critical" : "high";

      // Create evidence for each file in cycle
      const evidence = cycle.files.map((f) => createEvidence(f, 1, 1));

      findings.push({
        id: generateFindingId("CIRCULAR_DEPENDENCY", cycle.files[0]),
        ruleId: "CIRCULAR_DEPENDENCY",
        title: `Circular dependency detected (${cycle.depth} files in cycle)`,
        summary: `Import cycle: ${cycle.files.join(" → ")}. Circular dependencies can cause "Cannot access before initialization" errors and make the code harder to maintain.`,
        severity,
        confidence: 0.95,
        category: "maintainability",
        evidence,
      });
    }

    return findings;
  },
};