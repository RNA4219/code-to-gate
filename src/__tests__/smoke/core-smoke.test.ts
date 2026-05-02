/**
 * Core Module Smoke Tests
 *
 * Quick validation that core utilities work correctly.
 * Total execution time should be under 5 seconds.
 */

import { describe, it, expect } from 'vitest';
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
  parseEmitOption,
  parseSimpleYaml,
  getOption,
  hasFlag,
  validateRequiredArgs,
  generateRunId,
  isValidSeverity,
  isValidCategory,
} from '../../core/index.js';

describe('Core Module Smoke Tests', () => {
  describe('Path Utilities', () => {
    it('toPosix converts backslashes to forward slashes', () => {
      expect(toPosix('C:\\Users\\test\\file.ts')).toBe('C:/Users/test/file.ts');
      expect(toPosix('path/to/file.ts')).toBe('path/to/file.ts');
    });

    it('sha256 generates consistent hash', () => {
      const hash1 = sha256('test');
      const hash2 = sha256('test');
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });

    it('getRelativePath returns relative path', () => {
      const result = getRelativePath('/base', '/base/dir/file.ts');
      expect(result).toContain('dir');
      expect(result).toContain('file.ts');
    });

    it('joinPosix joins paths with forward slashes', () => {
      expect(joinPosix('path', 'to', 'file.ts')).toBe('path/to/file.ts');
    });

    it('isAbsolutePath detects absolute paths', () => {
      expect(isAbsolutePath('/absolute/path')).toBe(true);
      expect(isAbsolutePath('relative/path')).toBe(false);
    });

    it('getExtension extracts file extension', () => {
      expect(getExtension('file.ts')).toBe('.ts');
      expect(getExtension('file.test.js')).toBe('.js');
      expect(getExtension('.gitignore')).toBe('.gitignore');
    });

    it('getDirectoryName extracts directory name', () => {
      expect(getDirectoryName('/path/to/file.ts')).toBe('/path/to');
    });

    it('getBaseName extracts base name', () => {
      expect(getBaseName('/path/to/file.ts')).toBe('file.ts');
    });

    it('normalizePosix normalizes paths', () => {
      const result = normalizePosix('/path/./to/../file.ts');
      expect(result).toContain('file.ts');
    });
  });

  describe('File Utilities', () => {
    it('detectLanguage identifies file languages', () => {
      expect(detectLanguage('file.ts')).toBe('ts');
      expect(detectLanguage('file.tsx')).toBe('tsx');
      expect(detectLanguage('file.js')).toBe('js');
      expect(detectLanguage('file.jsx')).toBe('jsx');
      expect(detectLanguage('file.py')).toBe('py');
      expect(detectLanguage('file.rb')).toBe('rb');
      expect(detectLanguage('file.go')).toBe('go');
      expect(detectLanguage('file.rs')).toBe('rs');
      expect(detectLanguage('file.java')).toBe('java');
      expect(detectLanguage('file.php')).toBe('php');
      expect(detectLanguage('file.unknown')).toBe('unknown');
    });

    it('detectRole identifies file roles', () => {
      expect(detectRole('tests/file.test.ts')).toBe('test');
      expect(detectRole('src/index.ts')).toBe('source');
      expect(detectRole('package.json')).toBe('config');
      expect(detectRole('README.md')).toBe('docs');
      expect(detectRole('fixtures/data.json')).toBe('fixture');
      expect(detectRole('dist/output.js')).toBe('generated');
    });

    it('walkDir returns array for existing directory', () => {
      const files = walkDir('./src/core');
      expect(Array.isArray(files)).toBe(true);
      expect(files.length).toBeGreaterThan(0);
    });

    it('walkDir returns empty array for non-existent directory', () => {
      const files = walkDir('./non-existent-dir');
      expect(files).toEqual([]);
    });

    it('isTargetFile identifies target file types', () => {
      expect(isTargetFile('file.ts')).toBe(true);
      expect(isTargetFile('file.js')).toBe(true);
      expect(isTargetFile('file.py')).toBe(true);
      expect(isTargetFile('file.rb')).toBe(true);
      expect(isTargetFile('file.go')).toBe(true);
      expect(isTargetFile('file.rs')).toBe(true);
      expect(isTargetFile('file.java')).toBe(true);
      expect(isTargetFile('file.php')).toBe(true);
      expect(isTargetFile('file.json')).toBe(true);
      expect(isTargetFile('file.d.ts')).toBe(false);
      expect(isTargetFile('file.exe')).toBe(false);
    });

    it('isEntrypoint identifies entrypoint files', () => {
      expect(isEntrypoint('src/index.ts')).toBe(true);
      expect(isEntrypoint('src/server.ts')).toBe(true);
      expect(isEntrypoint('api/routes.ts')).toBe(true);
      expect(isEntrypoint('src/utils/helper.ts')).toBe(false);
    });

    it('entrypointKind categorizes entrypoints', () => {
      expect(entrypointKind('src/admin.ts')).toBe('admin-route');
      expect(entrypointKind('src/server.ts')).toBe('server-entry');
      expect(entrypointKind('src/index.ts')).toBe('main-entry');
      expect(entrypointKind('api/user.ts')).toBe('api-route');
    });

    it('isValidDirectory correctly checks directories', () => {
      expect(isValidDirectory('./src')).toBe(true);
      expect(isValidDirectory('./non-existent')).toBe(false);
      expect(isValidDirectory('./package.json')).toBe(false);
    });

    it('detectTestFramework returns correct framework', () => {
      expect(detectTestFramework('test.ts')).toBe('vitest');
      expect(detectTestFramework('test.js')).toBe('node:test');
      expect(detectTestFramework('test.py')).toBe('pytest');
      expect(detectTestFramework('order_spec.rb')).toBe('rspec');
      expect(detectTestFramework('handler_test.go')).toBe('go test');
      expect(detectTestFramework('main_test.rs')).toBe('cargo test');
      expect(detectTestFramework('OrderControllerTest.java')).toBe('junit');
      expect(detectTestFramework('OrderControllerTest.php')).toBe('phpunit');
      expect(detectTestFramework('test.unknown')).toBe('unknown');
    });

    it('DEFAULT_IGNORED_DIRS contains expected directories', () => {
      expect(DEFAULT_IGNORED_DIRS.has('node_modules')).toBe(true);
      expect(DEFAULT_IGNORED_DIRS.has('.git')).toBe(true);
      expect(DEFAULT_IGNORED_DIRS.has('dist')).toBe(true);
      expect(DEFAULT_IGNORED_DIRS.has('.venv')).toBe(true);
      expect(DEFAULT_IGNORED_DIRS.has('venv')).toBe(true);
      expect(DEFAULT_IGNORED_DIRS.has('.browser-use-env')).toBe(true);
    });
  });

  describe('Config Utilities', () => {
    it('parseEmitOption parses emit formats', () => {
      expect(parseEmitOption('json')).toEqual(['json']);
      expect(parseEmitOption('json,yaml')).toEqual(['json', 'yaml']);
      expect(parseEmitOption('all')).toEqual(['json', 'yaml', 'md', 'mermaid']);
      expect(parseEmitOption(undefined)).toEqual(['json', 'yaml', 'md', 'mermaid']);
    });

    it('parseSimpleYaml parses basic YAML', () => {
      const yaml = 'name: test-policy\nversion: 1.0';
      const result = parseSimpleYaml(yaml);
      expect(result.name).toBe('test-policy');
      expect(result.version).toBe('1.0');
    });

    it('getOption extracts option value', () => {
      const args = ['--out', 'output-dir', '--format', 'json'];
      expect(getOption(args, '--out')).toBe('output-dir');
      expect(getOption(args, '--format')).toBe('json');
      expect(getOption(args, '--missing')).toBeUndefined();
    });

    it('hasFlag checks for flag presence', () => {
      const args = ['--verbose', '--force'];
      expect(hasFlag(args, '--verbose')).toBe(true);
      expect(hasFlag(args, '--force')).toBe(true);
      expect(hasFlag(args, '--quiet')).toBe(false);
    });

    it('validateRequiredArgs validates presence', () => {
      const args = ['--out', 'dir', '--format', 'json'];
      const result1 = validateRequiredArgs(args, ['--out']);
      expect(result1.valid).toBe(true);
      expect(result1.missing).toEqual([]);

      const result2 = validateRequiredArgs(args, ['--out', '--missing']);
      expect(result2.valid).toBe(false);
      expect(result2.missing).toContain('--missing');
    });

    it('generateRunId creates valid ID', () => {
      const timestamp = '2026-04-30T12:34:56.789Z';
      const id = generateRunId(timestamp);
      expect(id).toMatch(/^ctg-\d{12}$/);
    });

    it('isValidSeverity validates severities', () => {
      expect(isValidSeverity('low')).toBe(true);
      expect(isValidSeverity('medium')).toBe(true);
      expect(isValidSeverity('high')).toBe(true);
      expect(isValidSeverity('critical')).toBe(true);
      expect(isValidSeverity('unknown')).toBe(false);
    });

    it('isValidCategory validates categories', () => {
      expect(isValidCategory('auth')).toBe(true);
      expect(isValidCategory('payment')).toBe(true);
      expect(isValidCategory('validation')).toBe(true);
      expect(isValidCategory('data')).toBe(true);
      expect(isValidCategory('config')).toBe(true);
      expect(isValidCategory('maintainability')).toBe(true);
      expect(isValidCategory('testing')).toBe(true);
      expect(isValidCategory('unknown')).toBe(false);
    });
  });
});
