/**
 * Rules Smoke Tests
 *
 * Quick validation that all rules can be loaded and have required properties.
 * Total execution time should be under 5 seconds.
 */

import { describe, it, expect } from 'vitest';
import {
  ALL_RULES,
  CLIENT_TRUSTED_PRICE_RULE,
  WEAK_AUTH_GUARD_RULE,
  TRY_CATCH_SWALLOW_RULE,
  MISSING_SERVER_VALIDATION_RULE,
  UNTESTED_CRITICAL_PATH_RULE,
  RAW_SQL_RULE,
  ENV_DIRECT_ACCESS_RULE,
  UNSAFE_DELETE_RULE,
  LARGE_MODULE_RULE,
  type RulePlugin,
  generateFindingId,
  hashExcerpt,
  createEvidence,
} from '../../rules/index.js';

describe('Rules Smoke Tests', () => {
  describe('ALL_RULES array', () => {
    it('contains all expected rules', () => {
      expect(ALL_RULES).toHaveLength(13);
    });

    it('all rules have unique IDs', () => {
      const ids = ALL_RULES.map(r => r.id);
      const uniqueIds = new Set(ids);
      expect(ids.length).toBe(uniqueIds.size);
    });
  });

  describe('Individual rule exports', () => {
    it('exports CLIENT_TRUSTED_PRICE_RULE with correct structure', () => {
      expect(CLIENT_TRUSTED_PRICE_RULE.id).toBe('CLIENT_TRUSTED_PRICE');
      expect(CLIENT_TRUSTED_PRICE_RULE.name).toBeTruthy();
      expect(CLIENT_TRUSTED_PRICE_RULE.description).toBeTruthy();
      expect(CLIENT_TRUSTED_PRICE_RULE.category).toBe('payment');
      expect(CLIENT_TRUSTED_PRICE_RULE.defaultSeverity).toBe('critical');
      expect(CLIENT_TRUSTED_PRICE_RULE.defaultConfidence).toBeGreaterThan(0);
      expect(CLIENT_TRUSTED_PRICE_RULE.defaultConfidence).toBeLessThanOrEqual(1);
      expect(typeof CLIENT_TRUSTED_PRICE_RULE.evaluate).toBe('function');
    });

    it('exports WEAK_AUTH_GUARD_RULE with correct structure', () => {
      expect(WEAK_AUTH_GUARD_RULE.id).toBe('WEAK_AUTH_GUARD');
      expect(WEAK_AUTH_GUARD_RULE.name).toBeTruthy();
      expect(WEAK_AUTH_GUARD_RULE.category).toBe('auth');
      expect(typeof WEAK_AUTH_GUARD_RULE.evaluate).toBe('function');
    });

    it('exports TRY_CATCH_SWALLOW_RULE with correct structure', () => {
      expect(TRY_CATCH_SWALLOW_RULE.id).toBe('TRY_CATCH_SWALLOW');
      expect(TRY_CATCH_SWALLOW_RULE.name).toBeTruthy();
      expect(TRY_CATCH_SWALLOW_RULE.category).toBe('maintainability');
      expect(typeof TRY_CATCH_SWALLOW_RULE.evaluate).toBe('function');
    });

    it('exports MISSING_SERVER_VALIDATION_RULE with correct structure', () => {
      expect(MISSING_SERVER_VALIDATION_RULE.id).toBe('MISSING_SERVER_VALIDATION');
      expect(MISSING_SERVER_VALIDATION_RULE.name).toBeTruthy();
      expect(MISSING_SERVER_VALIDATION_RULE.category).toBe('validation');
      expect(typeof MISSING_SERVER_VALIDATION_RULE.evaluate).toBe('function');
    });

    it('exports UNTESTED_CRITICAL_PATH_RULE with correct structure', () => {
      expect(UNTESTED_CRITICAL_PATH_RULE.id).toBe('UNTESTED_CRITICAL_PATH');
      expect(UNTESTED_CRITICAL_PATH_RULE.name).toBeTruthy();
      expect(UNTESTED_CRITICAL_PATH_RULE.category).toBe('testing');
      expect(typeof UNTESTED_CRITICAL_PATH_RULE.evaluate).toBe('function');
    });

    it('exports RAW_SQL_RULE with correct structure', () => {
      expect(RAW_SQL_RULE.id).toBe('RAW_SQL');
      expect(RAW_SQL_RULE.name).toBeTruthy();
      expect(RAW_SQL_RULE.category).toBe('data');
      expect(RAW_SQL_RULE.defaultSeverity).toBe('high');
      expect(typeof RAW_SQL_RULE.evaluate).toBe('function');
    });

    it('exports ENV_DIRECT_ACCESS_RULE with correct structure', () => {
      expect(ENV_DIRECT_ACCESS_RULE.id).toBe('ENV_DIRECT_ACCESS');
      expect(ENV_DIRECT_ACCESS_RULE.name).toBeTruthy();
      expect(ENV_DIRECT_ACCESS_RULE.category).toBe('config');
      expect(typeof ENV_DIRECT_ACCESS_RULE.evaluate).toBe('function');
    });

    it('exports UNSAFE_DELETE_RULE with correct structure', () => {
      expect(UNSAFE_DELETE_RULE.id).toBe('UNSAFE_DELETE');
      expect(UNSAFE_DELETE_RULE.name).toBeTruthy();
      expect(UNSAFE_DELETE_RULE.category).toBe('data');
      expect(typeof UNSAFE_DELETE_RULE.evaluate).toBe('function');
    });

    it('exports LARGE_MODULE_RULE with correct structure', () => {
      expect(LARGE_MODULE_RULE.id).toBe('LARGE_MODULE');
      expect(LARGE_MODULE_RULE.name).toBeTruthy();
      expect(LARGE_MODULE_RULE.category).toBe('maintainability');
      expect(typeof LARGE_MODULE_RULE.evaluate).toBe('function');
    });
  });

  describe('Rule interface validation', () => {
    it('all rules have valid severities', () => {
      const validSeverities = ['low', 'medium', 'high', 'critical'];
      for (const rule of ALL_RULES) {
        expect(validSeverities).toContain(rule.defaultSeverity);
      }
    });

    it('all rules have valid categories', () => {
      const validCategories = [
        'auth',
        'payment',
        'validation',
        'data',
        'config',
        'maintainability',
        'testing',
        'compatibility',
        'release-risk',
        'security',
      ];
      for (const rule of ALL_RULES) {
        expect(validCategories).toContain(rule.category);
      }
    });

    it('all rules have confidence between 0 and 1', () => {
      for (const rule of ALL_RULES) {
        expect(rule.defaultConfidence).toBeGreaterThanOrEqual(0);
        expect(rule.defaultConfidence).toBeLessThanOrEqual(1);
      }
    });

    it('all rules have non-empty name and description', () => {
      for (const rule of ALL_RULES) {
        expect(rule.name.length).toBeGreaterThan(0);
        expect(rule.description.length).toBeGreaterThan(10);
      }
    });
  });

  describe('Utility functions', () => {
    it('generateFindingId creates valid IDs', () => {
      const id = generateFindingId('TEST_RULE', '/path/to/file.ts', 42);
      expect(id).toMatch(/^finding:TEST_RULE:[a-f0-9]+:L42$/);
    });

    it('generateFindingId works without line number', () => {
      const id = generateFindingId('TEST_RULE', '/path/to/file.ts');
      expect(id).toMatch(/^finding:TEST_RULE:[a-f0-9]+$/);
    });

    it('hashExcerpt produces consistent hashes', () => {
      const text = 'test content';
      const hash1 = hashExcerpt(text);
      const hash2 = hashExcerpt(text);
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{8}$/);
    });

    it('createEvidence creates valid evidence objects', () => {
      const evidence = createEvidence('/path/to/file.ts', 10, 20, 'text', 'excerpt content');
      expect(evidence.path).toBe('/path/to/file.ts');
      expect(evidence.startLine).toBe(10);
      expect(evidence.endLine).toBe(20);
      expect(evidence.kind).toBe('text');
      expect(evidence.id).toContain('evidence:');
    });
  });

  describe('Rule evaluation with minimal context', () => {
    const mockContext = {
      graph: {
        files: [],
        run_id: 'test-run',
        generated_at: new Date().toISOString(),
        repo: { root: '/test' },
        stats: { partial: false },
      },
      getFileContent: () => null,
    };

    it('all rules can evaluate empty context without errors', () => {
      for (const rule of ALL_RULES) {
        const findings = rule.evaluate(mockContext);
        expect(Array.isArray(findings)).toBe(true);
      }
    });
  });
});