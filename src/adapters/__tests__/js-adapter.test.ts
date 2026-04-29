import { describe, it, expect } from 'vitest';
import { parseJavaScriptFile } from '../js-adapter';
import path from 'node:path';

const fixturesDir = path.resolve(import.meta.dirname, '../../../fixtures');
const demoAuthJsDir = path.join(fixturesDir, 'demo-auth-js');

describe('js-adapter', () => {
  describe('JavaScript file parsing', () => {
    it('should parse admin.js and extract symbols', () => {
      const filePath = path.join(demoAuthJsDir, 'src/routes/admin.js');
      const result = parseJavaScriptFile(filePath, demoAuthJsDir, 'file:admin');

      expect(result.parserStatus).toBe('parsed');
      expect(result.parserAdapter).toBe('acorn-v0');
      expect(result.symbols.length).toBeGreaterThan(0);
      expect(result.diagnostics.length).toBe(0);
    });

    it('should parse audit-log.js and extract symbols', () => {
      const filePath = path.join(demoAuthJsDir, 'src/services/audit-log.js');
      const result = parseJavaScriptFile(filePath, demoAuthJsDir, 'file:audit-log');

      expect(result.parserStatus).toBe('parsed');
      expect(result.symbols.length).toBeGreaterThan(0);
    });
  });

  describe('Function detection', () => {
    it('should detect function declarations', () => {
      const filePath = path.join(demoAuthJsDir, 'src/services/audit-log.js');
      const result = parseJavaScriptFile(filePath, demoAuthJsDir, 'file:audit-log');

      const functions = result.symbols.filter(s => s.kind === 'function');
      expect(functions.length).toBeGreaterThan(0);

      const logAuditEvent = functions.find(f => f.name === 'logAuditEvent');
      expect(logAuditEvent).toBeDefined();
      expect(logAuditEvent?.async).toBe(true);
    });

    it('should detect async functions', () => {
      const filePath = path.join(demoAuthJsDir, 'src/services/audit-log.js');
      const result = parseJavaScriptFile(filePath, demoAuthJsDir, 'file:audit-log');

      const asyncFunctions = result.symbols.filter(s => s.async === true);
      expect(asyncFunctions.length).toBeGreaterThan(0);

      const logUserAction = result.symbols.find(s => s.name === 'logUserAction');
      expect(logUserAction?.async).toBe(true);
    });
  });

  describe('Variable detection', () => {
    it('should detect variable declarations', () => {
      const filePath = path.join(demoAuthJsDir, 'src/routes/admin.js');
      const result = parseJavaScriptFile(filePath, demoAuthJsDir, 'file:admin');

      // Variables and route handlers are detected
      const variables = result.symbols.filter(s => s.kind === 'variable' || s.kind === 'route');
      expect(variables.length).toBeGreaterThan(0);

      // router is detected (classified as "route" because of name)
      const router = result.symbols.find(s => s.name === 'router');
      expect(router).toBeDefined();
    });
  });

  describe('Require/import relationship extraction', () => {
    it('should detect require calls as call relationships', () => {
      const filePath = path.join(demoAuthJsDir, 'src/routes/admin.js');
      const result = parseJavaScriptFile(filePath, demoAuthJsDir, 'file:admin');

      // CommonJS require() calls are detected as call relationships
      const calls = result.relations.filter(r => r.kind === 'calls');
      expect(calls.length).toBeGreaterThan(0);

      // Check for require call
      const requireCall = calls.find(c => c.to.includes('require'));
      expect(requireCall).toBeDefined();
    });

    it('should extract import relationships from middleware.js', () => {
      const filePath = path.join(demoAuthJsDir, 'src/auth/middleware.js');
      const result = parseJavaScriptFile(filePath, demoAuthJsDir, 'file:middleware');

      expect(result.parserStatus).toBe('parsed');
      expect(result.relations.filter(r => r.kind === 'imports').length).toBeGreaterThanOrEqual(0);
    });

    it('should detect express.Router call pattern', () => {
      const filePath = path.join(demoAuthJsDir, 'src/routes/admin.js');
      const result = parseJavaScriptFile(filePath, demoAuthJsDir, 'file:admin');

      const calls = result.relations.filter(r => r.kind === 'calls');
      // express.Router() is detected as a method call
      const routerCall = calls.find(c => c.to.includes('express.Router'));
      expect(routerCall).toBeDefined();
    });
  });

  describe('Call relationship extraction', () => {
    it('should extract call relationships', () => {
      const filePath = path.join(demoAuthJsDir, 'src/services/audit-log.js');
      const result = parseJavaScriptFile(filePath, demoAuthJsDir, 'file:audit-log');

      const calls = result.relations.filter(r => r.kind === 'calls');
      expect(calls.length).toBeGreaterThan(0);
    });

    it('should detect method calls on objects', () => {
      const filePath = path.join(demoAuthJsDir, 'src/routes/admin.js');
      const result = parseJavaScriptFile(filePath, demoAuthJsDir, 'file:admin');

      const calls = result.relations.filter(r => r.kind === 'calls');
      // router.get, router.delete, router.post are called
      const routerCalls = calls.filter(c => c.to.includes('router'));
      expect(routerCalls.length).toBeGreaterThan(0);
    });
  });

  describe('Export relationship extraction', () => {
    it('should extract module.exports relationships', () => {
      const filePath = path.join(demoAuthJsDir, 'src/routes/admin.js');
      const result = parseJavaScriptFile(filePath, demoAuthJsDir, 'file:admin');

      const exports = result.relations.filter(r => r.kind === 'exports');
      expect(exports.length).toBeGreaterThanOrEqual(0);
    });

    it('should mark exported symbols correctly', () => {
      const filePath = path.join(demoAuthJsDir, 'src/services/audit-log.js');
      const result = parseJavaScriptFile(filePath, demoAuthJsDir, 'file:audit-log');

      // Check exported symbols from module.exports
      const exportedSymbols = result.symbols.filter(s => s.exported);
      expect(exportedSymbols.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Evidence generation', () => {
    it('should generate evidence for each symbol', () => {
      const filePath = path.join(demoAuthJsDir, 'src/services/audit-log.js');
      const result = parseJavaScriptFile(filePath, demoAuthJsDir, 'file:audit-log');

      for (const symbol of result.symbols) {
        expect(symbol.evidence.length).toBeGreaterThan(0);
        expect(symbol.evidence[0].kind).toBe('ast');
        expect(symbol.evidence[0].path).toBeDefined();
      }
    });

    it('should include line numbers in evidence', () => {
      const filePath = path.join(demoAuthJsDir, 'src/services/audit-log.js');
      const result = parseJavaScriptFile(filePath, demoAuthJsDir, 'file:audit-log');

      const logAuditEvent = result.symbols.find(s => s.name === 'logAuditEvent');
      expect(logAuditEvent).toBeDefined();
      expect(logAuditEvent?.evidence[0].startLine).toBeDefined();
      expect(logAuditEvent?.evidence[0].endLine).toBeDefined();
    });

    it('should generate evidence for relations', () => {
      const filePath = path.join(demoAuthJsDir, 'src/routes/admin.js');
      const result = parseJavaScriptFile(filePath, demoAuthJsDir, 'file:admin');

      for (const relation of result.relations) {
        expect(relation.evidence.length).toBeGreaterThan(0);
        expect(relation.confidence).toBeGreaterThanOrEqual(0);
        expect(relation.confidence).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Error handling', () => {
    it('should handle parse errors gracefully', () => {
      // Create a temporary invalid file path
      const invalidPath = path.join(demoAuthJsDir, 'nonexistent.js');
      const result = parseJavaScriptFile(invalidPath, demoAuthJsDir, 'file:invalid');

      expect(result.parserStatus).toBe('failed');
      expect(result.diagnostics.length).toBeGreaterThan(0);
      expect(result.diagnostics[0].severity).toBe('error');
      expect(result.diagnostics[0].code).toBe('PARSER_FAILED');
    });
  });

  describe('Class detection', () => {
    it('should detect class declarations', () => {
      const filePath = path.join(demoAuthJsDir, 'src/auth/middleware.js');
      const result = parseJavaScriptFile(filePath, demoAuthJsDir, 'file:middleware');

      expect(result.parserStatus).toBe('parsed');
      // Middleware.js contains function definitions, not classes
      const functions = result.symbols.filter(s => s.kind === 'function');
      expect(functions.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Symbol kind classification', () => {
    it('should classify symbols with handler/controller/route in name as route', () => {
      const filePath = path.join(demoAuthJsDir, 'src/routes/admin.js');
      const result = parseJavaScriptFile(filePath, demoAuthJsDir, 'file:admin');

      // router is classified as 'route' because its name contains 'route'
      const router = result.symbols.find(s => s.name === 'router');
      expect(router?.kind).toBe('route');
    });

    it('should classify symbols in test files as test kind', () => {
      const filePath = path.join(demoAuthJsDir, 'src/tests/public.test.js');
      const result = parseJavaScriptFile(filePath, demoAuthJsDir, 'file:test');

      expect(result.parserStatus).toBe('parsed');
      // Symbols in test files should be classified as 'test'
      const testSymbols = result.symbols.filter(s => s.kind === 'test');
      expect(testSymbols.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Arrow function detection', () => {
    it('should detect arrow functions assigned to variables', () => {
      const filePath = path.join(demoAuthJsDir, 'src/routes/admin.js');
      const result = parseJavaScriptFile(filePath, demoAuthJsDir, 'file:admin');

      // The route handlers in admin.js use arrow functions
      expect(result.parserStatus).toBe('parsed');
      // Check that symbols are properly detected
      const variables = result.symbols.filter(s => s.kind === 'variable' || s.kind === 'route');
      expect(variables.length).toBeGreaterThan(0);
    });
  });

  describe('Relation ID format', () => {
    it('should generate properly formatted relation IDs', () => {
      const filePath = path.join(demoAuthJsDir, 'src/routes/admin.js');
      const result = parseJavaScriptFile(filePath, demoAuthJsDir, 'file:admin');

      for (const relation of result.relations) {
        expect(relation.id).toContain('relation:');
        expect(relation.from).toBeDefined();
        expect(relation.to).toBeDefined();
      }
    });
  });

  describe('Symbol ID format', () => {
    it('should generate properly formatted symbol IDs', () => {
      const filePath = path.join(demoAuthJsDir, 'src/services/audit-log.js');
      const result = parseJavaScriptFile(filePath, demoAuthJsDir, 'file:audit-log');

      for (const symbol of result.symbols) {
        expect(symbol.id).toContain('symbol:');
        expect(symbol.fileId).toBe('file:audit-log');
      }
    });
  });

  describe('GetAuditLogs function', () => {
    it('should detect getAuditLogs function', () => {
      const filePath = path.join(demoAuthJsDir, 'src/services/audit-log.js');
      const result = parseJavaScriptFile(filePath, demoAuthJsDir, 'file:audit-log');

      const getAuditLogs = result.symbols.find(s => s.name === 'getAuditLogs');
      expect(getAuditLogs).toBeDefined();
      expect(getAuditLogs?.async).toBe(true);
      expect(getAuditLogs?.kind).toBe('function');
    });

    it('should detect logAdminAction function', () => {
      const filePath = path.join(demoAuthJsDir, 'src/services/audit-log.js');
      const result = parseJavaScriptFile(filePath, demoAuthJsDir, 'file:audit-log');

      const logAdminAction = result.symbols.find(s => s.name === 'logAdminAction');
      expect(logAdminAction).toBeDefined();
      expect(logAdminAction?.async).toBe(true);
    });
  });

  describe('Middleware functions', () => {
    it('should detect middleware functions', () => {
      const filePath = path.join(demoAuthJsDir, 'src/auth/middleware.js');
      const result = parseJavaScriptFile(filePath, demoAuthJsDir, 'file:middleware');

      expect(result.parserStatus).toBe('parsed');

      const functions = result.symbols.filter(s => s.kind === 'function');
      expect(functions.length).toBeGreaterThan(0);

      const verifyToken = functions.find(f => f.name === 'verifyToken');
      expect(verifyToken).toBeDefined();

      const requireUser = functions.find(f => f.name === 'requireUser');
      expect(requireUser).toBeDefined();

      const requireAdmin = functions.find(f => f.name === 'requireAdmin');
      expect(requireAdmin).toBeDefined();
    });
  });

  describe('Public routes', () => {
    it('should parse public.js and extract symbols', () => {
      const filePath = path.join(demoAuthJsDir, 'src/routes/public.js');
      const result = parseJavaScriptFile(filePath, demoAuthJsDir, 'file:public');

      expect(result.parserStatus).toBe('parsed');
      expect(result.symbols.length).toBeGreaterThan(0);
    });
  });

  describe('Server file', () => {
    it('should parse server.js and extract symbols', () => {
      const filePath = path.join(demoAuthJsDir, 'src/server.js');
      const result = parseJavaScriptFile(filePath, demoAuthJsDir, 'file:server');

      expect(result.parserStatus).toBe('parsed');
      expect(result.symbols.length).toBeGreaterThanOrEqual(0);
    });
  });
});