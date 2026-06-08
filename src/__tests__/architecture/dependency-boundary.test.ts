/**
 * Dependency Boundary Tests
 *
 * Phase 8: Programmatic verification of architectural layer boundaries.
 * These tests complement ESLint no-restricted-imports rules by providing
 * explicit test coverage for dependency direction enforcement.
 *
 * Boundary Rules:
 * - types: Innermost layer, no imports from other src layers
 * - core: Pure logic, no imports from cli/application/reporters/adapters layers
 *         Node API whitelist: node:fs, node:crypto, node:path (for I/O, hashing, path operations)
 *         ParserRegistry interface imported from types/contracts.ts (composition root pattern)
 * - reporters: Cannot import from application/cli/adapters layers
 * - rules: Cannot import from cli or adapters layers
 * - adapters: Can import from types/core (permitted direction)
 *             Cannot import from cli/application/reporters layers
 * - application: Cannot import from reporters/cli/adapters layers
 */

import { describe, it, expect } from 'vitest';
import { globSync } from 'glob';
import fs from 'node:fs';
import path from 'node:path';

const SRC_DIR = path.resolve(import.meta.dirname, '../../');

/**
 * Extract import statements from a TypeScript file
 */
function extractImports(filePath: string): string[] {
  const content = fs.readFileSync(filePath, 'utf8');
  const imports: string[] = [];

  // Match ES module imports: import ... from '...'
  const importRegex = /^import\s+[^;]+\s+from\s+['"]([^'"]+)['"]/gm;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }

  // Match dynamic imports: import('...')
  const dynamicImportRegex = /import\(['"]([^'"]+)['"]\)/g;
  while ((match = dynamicImportRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }

  return imports;
}

/**
 * Check if an import is from another src layer
 */
function isSrcLayerImport(importPath: string): boolean {
  // Relative imports starting with ../ are cross-layer
  // Relative imports starting with ./ are same-layer (allowed)
  if (importPath.startsWith('./')) return false;
  if (importPath.startsWith('../')) return true;

  // External package imports (node:*, npm packages) are allowed
  return false;
}

/**
 * Resolve relative import to absolute path
 */
function resolveImport(importPath: string, fromFile: string): string | null {
  if (!importPath.startsWith('../')) return null;

  const fromDir = path.dirname(fromFile);
  const resolved = path.resolve(fromDir, importPath);

  // Normalize to posix for comparison
  return resolved.replace(/\\/g, '/');
}

/**
 * Get the layer name from a file path
 */
function getLayerName(filePath: string): string | null {
  const relativePath = path.relative(SRC_DIR, filePath).replace(/\\/g, '/');
  const parts = relativePath.split('/');

  if (parts.length < 1) return null;

  // Top-level directories are layers
  const topLevel = parts[0];

  // __tests__ is special - it's within a layer's test subdirectory
  if (topLevel === '__tests__') {
    // Architecture tests are allowed to import anything for testing
    if (relativePath.includes('architecture/')) return 'architecture-tests';
    return null;
  }

  return topLevel;
}

describe('Dependency Boundaries', () => {
  describe('types layer', () => {
    it('should not import from other src layers', () => {
      const typesFiles = globSync('types/**/*.ts', { cwd: SRC_DIR });

      for (const file of typesFiles) {
        // Skip test files - test files can import anything for testing purposes
        if (file.includes('__tests__')) continue;

        const filePath = path.join(SRC_DIR, file);
        const imports = extractImports(filePath);

        for (const importPath of imports) {
          // Skip external package imports (node:*, npm packages)
          if (!importPath.startsWith('../')) {
            continue;
          }

          // types is innermost - any ../ import is a violation
          expect(importPath).not.toMatch(
            /^\.\./,
            `types/${file} imports from '${importPath}' - types layer cannot import from other src layers`
          );
        }
      }
    });
  });

  describe('reporters layer', () => {
    it('should not import from cli layer', () => {
      const reporterFiles = globSync('reporters/**/*.ts', { cwd: SRC_DIR });

      for (const file of reporterFiles) {
        // Skip test files - test files can import anything for testing purposes
        if (file.includes('__tests__')) continue;

        const filePath = path.join(SRC_DIR, file);
        const imports = extractImports(filePath);

        for (const importPath of imports) {
          // Skip external package imports
          if (!importPath.startsWith('../')) continue;

          const resolved = resolveImport(importPath, filePath);
          if (!resolved) continue;

          // Check if resolved path is in cli layer
          const normalizedResolved = resolved.replace(/\\/g, '/');
          const isCliImport = normalizedResolved.includes('/cli/');

          expect(isCliImport).toBe(
            false,
            `reporters/${file} imports from cli layer via '${importPath}' - reporters cannot import VERSION or other cli exports`
          );
        }
      }
    });

    it('should not import from application layer', () => {
      const reporterFiles = globSync('reporters/**/*.ts', { cwd: SRC_DIR });

      for (const file of reporterFiles) {
        // Skip test files
        if (file.includes('__tests__')) continue;

        const filePath = path.join(SRC_DIR, file);
        const imports = extractImports(filePath);

        for (const importPath of imports) {
          if (!importPath.startsWith('../')) continue;

          const resolved = resolveImport(importPath, filePath);
          if (!resolved) continue;

          const normalizedResolved = resolved.replace(/\\/g, '/');
          const isApplicationImport = normalizedResolved.includes('/application/');

          expect(isApplicationImport).toBe(
            false,
            `reporters/${file} imports from application layer via '${importPath}' - reporters format artifacts, application orchestrates rules. Import evaluateRules directly from application in CLI.`
          );
        }
      }
    });

    it('should not import from adapters layer', () => {
      const reporterFiles = globSync('reporters/**/*.ts', { cwd: SRC_DIR });

      for (const file of reporterFiles) {
        // Skip test files
        if (file.includes('__tests__')) continue;

        const filePath = path.join(SRC_DIR, file);
        const imports = extractImports(filePath);

        for (const importPath of imports) {
          if (!importPath.startsWith('../')) continue;

          const resolved = resolveImport(importPath, filePath);
          if (!resolved) continue;

          const normalizedResolved = resolved.replace(/\\/g, '/');
          const isAdaptersImport = normalizedResolved.includes('/adapters/');

          expect(isAdaptersImport).toBe(
            false,
            `reporters/${file} imports from adapters layer via '${importPath}' - reporters should use ApplicationContext for service access`
          );
        }
      }
    });

    it('should not import VERSION constant from exit-codes', () => {
      const reporterFiles = globSync('reporters/**/*.ts', { cwd: SRC_DIR });

      for (const file of reporterFiles) {
        const filePath = path.join(SRC_DIR, file);
        const content = fs.readFileSync(filePath, 'utf8');

        // Check for VERSION import from exit-codes
        const versionImportRegex = /import\s+\{[^}]*VERSION[^}]*\}\s+from\s+['"][^'"]*exit-codes['"]/;

        expect(versionImportRegex.test(content)).toBe(
          false,
          `reporters/${file} imports VERSION from exit-codes - VERSION should be passed as parameter from CLI`
        );
      }
    });
  });

  describe('rules layer', () => {
    it('should not import from cli layer', () => {
      const rulesFiles = globSync('rules/**/*.ts', { cwd: SRC_DIR });

      for (const file of rulesFiles) {
        // Skip test files
        if (file.includes('__tests__')) continue;

        const filePath = path.join(SRC_DIR, file);
        const imports = extractImports(filePath);

        for (const importPath of imports) {
          if (!importPath.startsWith('../')) continue;

          const resolved = resolveImport(importPath, filePath);
          if (!resolved) continue;

          const normalizedResolved = resolved.replace(/\\/g, '/');
          const isCliImport = normalizedResolved.includes('/cli/');

          expect(isCliImport).toBe(
            false,
            `rules/${file} imports from cli layer via '${importPath}' - rules cannot import from CLI`
          );
        }
      }
    });

    it('should not import from adapters layer', () => {
      const rulesFiles = globSync('rules/**/*.ts', { cwd: SRC_DIR });

      for (const file of rulesFiles) {
        // Skip test files
        if (file.includes('__tests__')) continue;

        const filePath = path.join(SRC_DIR, file);
        const imports = extractImports(filePath);

        for (const importPath of imports) {
          if (!importPath.startsWith('../')) continue;

          const resolved = resolveImport(importPath, filePath);
          if (!resolved) continue;

          const normalizedResolved = resolved.replace(/\\/g, '/');
          const isAdaptersImport = normalizedResolved.includes('/adapters/');

          expect(isAdaptersImport).toBe(
            false,
            `rules/${file} imports from adapters layer via '${importPath}' - rules should use RuleContext for file content access`
          );
        }
      }
    });
  });

  describe('adapters layer', () => {
    it('should not import from cli layer', () => {
      const adapterFiles = globSync('adapters/**/*.ts', { cwd: SRC_DIR });

      for (const file of adapterFiles) {
        // Skip test files
        if (file.includes('__tests__')) continue;

        const filePath = path.join(SRC_DIR, file);
        const imports = extractImports(filePath);

        for (const importPath of imports) {
          if (!importPath.startsWith('../')) continue;

          const resolved = resolveImport(importPath, filePath);
          if (!resolved) continue;

          const normalizedResolved = resolved.replace(/\\/g, '/');
          const isCliImport = normalizedResolved.includes('/cli/');

          expect(isCliImport).toBe(
            false,
            `adapters/${file} imports from cli layer via '${importPath}' - adapters cannot import from CLI`
          );
        }
      }
    });

    it('should not import from application layer', () => {
      const adapterFiles = globSync('adapters/**/*.ts', { cwd: SRC_DIR });

      for (const file of adapterFiles) {
        // Skip test files
        if (file.includes('__tests__')) continue;

        const filePath = path.join(SRC_DIR, file);
        const imports = extractImports(filePath);

        for (const importPath of imports) {
          if (!importPath.startsWith('../')) continue;

          const resolved = resolveImport(importPath, filePath);
          if (!resolved) continue;

          const normalizedResolved = resolved.replace(/\\/g, '/');
          const isApplicationImport = normalizedResolved.includes('/application/');

          expect(isApplicationImport).toBe(
            false,
            `adapters/${file} imports from application layer via '${importPath}' - adapters cannot import from application layer`
          );
        }
      }
    });

    it('should not import from reporters layer', () => {
      const adapterFiles = globSync('adapters/**/*.ts', { cwd: SRC_DIR });

      for (const file of adapterFiles) {
        // Skip test files
        if (file.includes('__tests__')) continue;

        const filePath = path.join(SRC_DIR, file);
        const imports = extractImports(filePath);

        for (const importPath of imports) {
          if (!importPath.startsWith('../')) continue;

          const resolved = resolveImport(importPath, filePath);
          if (!resolved) continue;

          const normalizedResolved = resolved.replace(/\\/g, '/');
          const isReportersImport = normalizedResolved.includes('/reporters/');

          expect(isReportersImport).toBe(
            false,
            `adapters/${file} imports from reporters layer via '${importPath}' - adapters cannot import from reporters layer`
          );
        }
      }
    });
  });

  describe('core layer', () => {
    it('should not import from cli layer', () => {
      const coreFiles = globSync('core/**/*.ts', { cwd: SRC_DIR });

      for (const file of coreFiles) {
        // Skip test files
        if (file.includes('__tests__')) continue;

        const filePath = path.join(SRC_DIR, file);
        const imports = extractImports(filePath);

        for (const importPath of imports) {
          if (!importPath.startsWith('../')) continue;

          const resolved = resolveImport(importPath, filePath);
          if (!resolved) continue;

          const normalizedResolved = resolved.replace(/\\/g, '/');
          const isCliImport = normalizedResolved.includes('/cli/');

          expect(isCliImport).toBe(
            false,
            `core/${file} imports from cli layer via '${importPath}' - core layer cannot import from CLI`
          );
        }
      }
    });

    it('should not import from application layer', () => {
      const coreFiles = globSync('core/**/*.ts', { cwd: SRC_DIR });

      for (const file of coreFiles) {
        // Skip test files
        if (file.includes('__tests__')) continue;

        const filePath = path.join(SRC_DIR, file);
        const imports = extractImports(filePath);

        for (const importPath of imports) {
          if (!importPath.startsWith('../')) continue;

          const resolved = resolveImport(importPath, filePath);
          if (!resolved) continue;

          const normalizedResolved = resolved.replace(/\\/g, '/');
          const isApplicationImport = normalizedResolved.includes('/application/');

          expect(isApplicationImport).toBe(
            false,
            `core/${file} imports from application layer via '${importPath}' - core layer cannot import from application layer`
          );
        }
      }
    });

    it('should not import from reporters layer', () => {
      const coreFiles = globSync('core/**/*.ts', { cwd: SRC_DIR });

      for (const file of coreFiles) {
        // Skip test files
        if (file.includes('__tests__')) continue;

        const filePath = path.join(SRC_DIR, file);
        const imports = extractImports(filePath);

        for (const importPath of imports) {
          if (!importPath.startsWith('../')) continue;

          const resolved = resolveImport(importPath, filePath);
          if (!resolved) continue;

          const normalizedResolved = resolved.replace(/\\/g, '/');
          const isReportersImport = normalizedResolved.includes('/reporters/');

          expect(isReportersImport).toBe(
            false,
            `core/${file} imports from reporters layer via '${importPath}' - core layer cannot import from reporters layer`
          );
        }
      }
    });

    it('should not import from adapters layer', () => {
      const coreFiles = globSync('core/**/*.ts', { cwd: SRC_DIR });

      for (const file of coreFiles) {
        // Skip test files
        if (file.includes('__tests__')) continue;

        const filePath = path.join(SRC_DIR, file);
        const imports = extractImports(filePath);

        for (const importPath of imports) {
          if (!importPath.startsWith('../')) continue;

          const resolved = resolveImport(importPath, filePath);
          if (!resolved) continue;

          const normalizedResolved = resolved.replace(/\\/g, '/');
          const isAdaptersImport = normalizedResolved.includes('/adapters/');

          expect(isAdaptersImport).toBe(
            false,
            `core/${file.replace(/\\/g, '/')} imports from adapters layer via '${importPath}' - core layer cannot import from adapters layer. Use ParserRegistry interface from types/contracts.ts instead.`
          );
        }
      }
    });
  });

  describe('application layer', () => {
    it('should not import from cli layer', () => {
      const applicationFiles = globSync('application/**/*.ts', { cwd: SRC_DIR });

      for (const file of applicationFiles) {
        // Skip test files
        if (file.includes('__tests__')) continue;

        const filePath = path.join(SRC_DIR, file);
        const imports = extractImports(filePath);

        for (const importPath of imports) {
          if (!importPath.startsWith('../')) continue;

          const resolved = resolveImport(importPath, filePath);
          if (!resolved) continue;

          const normalizedResolved = resolved.replace(/\\/g, '/');
          const isCliImport = normalizedResolved.includes('/cli/');

          expect(isCliImport).toBe(
            false,
            `application/${file} imports from cli layer via '${importPath}' - application layer should not import from CLI composition root`
          );
        }
      }
    });

    it('should not import from reporters layer', () => {
      const applicationFiles = globSync('application/**/*.ts', { cwd: SRC_DIR });

      for (const file of applicationFiles) {
        // Skip test files
        if (file.includes('__tests__')) continue;

        const filePath = path.join(SRC_DIR, file);
        const imports = extractImports(filePath);

        for (const importPath of imports) {
          if (!importPath.startsWith('../')) continue;

          const resolved = resolveImport(importPath, filePath);
          if (!resolved) continue;

          const normalizedResolved = resolved.replace(/\\/g, '/');
          const isReportersImport = normalizedResolved.includes('/reporters/');

          expect(isReportersImport).toBe(
            false,
            `application/${file} imports from reporters layer via '${importPath}' - application orchestrates rules, reporters format artifacts. Dependency should flow CLI→application→rules/core.`
          );
        }
      }
    });

    it('should not import from adapters layer', () => {
      const applicationFiles = globSync('application/**/*.ts', { cwd: SRC_DIR });

      for (const file of applicationFiles) {
        // Skip test files
        if (file.includes('__tests__')) continue;

        const filePath = path.join(SRC_DIR, file);
        const imports = extractImports(filePath);

        for (const importPath of imports) {
          if (!importPath.startsWith('../')) continue;

          const resolved = resolveImport(importPath, filePath);
          if (!resolved) continue;

          const normalizedResolved = resolved.replace(/\\/g, '/');
          const isAdaptersImport = normalizedResolved.includes('/adapters/');

          expect(isAdaptersImport).toBe(
            false,
            `application/${file} imports from adapters layer via '${importPath}' - application should use injected ApplicationContext services, not concrete adapters`
          );
        }
      }
    });
  });
});