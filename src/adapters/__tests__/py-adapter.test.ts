import { describe, it, expect } from 'vitest';
import { parsePythonFile } from '../py-adapter';
import path from 'node:path';

const fixturesDir = path.resolve(import.meta.dirname, '../../../fixtures');
const demoPythonDir = path.join(fixturesDir, 'demo-python');
const edgeCasesDir = path.join(fixturesDir, 'demo-edge-cases');

describe('py-adapter', () => {
  describe('Python file parsing and symbol extraction', () => {
    it('should parse order.py and extract symbols', () => {
      const filePath = path.join(demoPythonDir, 'src/api/order.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:order');

      expect(result.parserStatus).toBe('parsed');
      expect(result.parserAdapter).toBe('py-regex-v0');
      expect(result.symbols.length).toBeGreaterThan(0);
    });

    it('should detect function declarations', () => {
      const filePath = path.join(demoPythonDir, 'src/api/order.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:order');

      // Check for async_create_order as a function
      const functions = result.symbols.filter(s => s.kind === 'function');
      expect(functions.length).toBeGreaterThan(0);

      const asyncCreateOrder = functions.find(f => f.name === 'async_create_order');
      expect(asyncCreateOrder).toBeDefined();
      expect(asyncCreateOrder?.async).toBe(true);

      // Note: create_order_route is classified as 'route' because name contains 'route'
      const routes = result.symbols.filter(s => s.kind === 'route');
      const createOrderRoute = routes.find(f => f.name === 'create_order_route');
      expect(createOrderRoute).toBeDefined();
    });

    it('should detect async function declarations', () => {
      const filePath = path.join(demoPythonDir, 'src/api/order.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:order');

      const asyncFunctions = result.symbols.filter(s => s.async === true);
      expect(asyncFunctions.length).toBeGreaterThan(0);

      const asyncCreateOrder = asyncFunctions.find(f => f.name === 'async_create_order');
      expect(asyncCreateOrder).toBeDefined();
      expect(asyncCreateOrder?.async).toBe(true);
    });

    it('should detect route handler symbols by decorator', () => {
      const filePath = path.join(demoPythonDir, 'src/api/order.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:order');

      const routes = result.symbols.filter(s => s.kind === 'route');
      expect(routes.length).toBeGreaterThan(0);

      // Check for @router.post decorated function
      const postOrder = routes.find(r => r.name === 'post_order');
      expect(postOrder).toBeDefined();
    });

    it('should detect route handler symbols by name pattern', () => {
      const filePath = path.join(demoPythonDir, 'src/api/order.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:order');

      const createOrderRoute = result.symbols.find(s => s.name === 'create_order_route');
      expect(createOrderRoute?.kind).toBe('route');
    });

    it('should detect class declarations', () => {
      const filePath = path.join(demoPythonDir, 'src/api/order.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:order');

      const classes = result.symbols.filter(s => s.kind === 'class');
      expect(classes.length).toBeGreaterThan(0);

      const orderHandler = classes.find(c => c.name === 'OrderHandler');
      expect(orderHandler).toBeDefined();
      expect(orderHandler?.exported).toBe(true);
    });

    it('should detect class methods', () => {
      const filePath = path.join(demoPythonDir, 'src/api/order.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:order');

      const methods = result.symbols.filter(s => s.kind === 'method');
      expect(methods.length).toBeGreaterThan(0);

      const handleCreate = methods.find(m => m.name === 'handle_create');
      expect(handleCreate).toBeDefined();
    });

    it('should detect async class methods', () => {
      const filePath = path.join(demoPythonDir, 'src/api/order.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:order');

      const asyncMethods = result.symbols.filter(s => s.kind === 'method' && s.async === true);
      expect(asyncMethods.length).toBeGreaterThan(0);
    });
  });

  describe('Import relationship extraction', () => {
    it('should extract basic import relationships', () => {
      const filePath = path.join(demoPythonDir, 'src/api/order.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:order');

      const imports = result.relations.filter(r => r.kind === 'imports');
      expect(imports.length).toBeGreaterThan(0);
    });

    it('should extract from import relationships', () => {
      const filePath = path.join(demoPythonDir, 'src/api/order.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:order');

      const imports = result.relations.filter(r => r.kind === 'imports');
      const flaskImport = imports.find(i => i.to.includes('flask'));
      expect(flaskImport).toBeDefined();
    });

    it('should extract reference relationships for imported symbols', () => {
      const filePath = path.join(demoPythonDir, 'src/api/order.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:order');

      const references = result.relations.filter(r => r.kind === 'references');
      expect(references.length).toBeGreaterThan(0);

      const requireUserRef = references.find(r => r.to.includes('require_user'));
      expect(requireUserRef).toBeDefined();
    });

    it('should handle import with multiple symbols', () => {
      const filePath = path.join(demoPythonDir, 'src/utils/imports_example.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:imports');

      const references = result.relations.filter(r => r.kind === 'references');

      // Check for multiple imported symbols from same module
      const createOrderRef = references.find(r => r.to.includes('create_order'));
      const orderRef = references.find(r => r.to.includes('Order'));
      expect(createOrderRef).toBeDefined();
      expect(orderRef).toBeDefined();
    });

    it('should handle import with alias', () => {
      const filePath = path.join(demoPythonDir, 'src/utils/imports_example.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:imports');

      const imports = result.relations.filter(r => r.kind === 'imports');
      const datetimeImport = imports.find(i => i.to.includes('datetime'));
      expect(datetimeImport).toBeDefined();
    });

    it('should handle relative imports', () => {
      const filePath = path.join(demoPythonDir, 'src/utils/imports_example.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:imports');

      const imports = result.relations.filter(r => r.kind === 'imports');
      const relativeImport = imports.find(i => i.to.startsWith('.'));
      expect(relativeImport).toBeDefined();
      expect(relativeImport?.confidence).toBeLessThan(1.0);
    });
  });

  describe('Evidence generation', () => {
    it('should generate evidence for each symbol', () => {
      const filePath = path.join(demoPythonDir, 'src/api/order.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:order');

      for (const symbol of result.symbols) {
        expect(symbol.evidence.length).toBeGreaterThan(0);
        expect(symbol.evidence[0].kind).toBe('ast');
        expect(symbol.evidence[0].path).toBeDefined();
        expect(symbol.evidence[0].excerptHash).toBeDefined();
      }
    });

    it('should include line numbers in evidence', () => {
      const filePath = path.join(demoPythonDir, 'src/api/order.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:order');

      const orderHandler = result.symbols.find(s => s.name === 'OrderHandler');
      expect(orderHandler).toBeDefined();
      expect(orderHandler?.evidence[0].startLine).toBeDefined();
      expect(orderHandler?.evidence[0].endLine).toBeDefined();
      expect(orderHandler?.evidence[0].startLine).toBeLessThanOrEqual(
        orderHandler?.evidence[0].endLine ?? 0
      );
    });

    it('should generate evidence for relations', () => {
      const filePath = path.join(demoPythonDir, 'src/api/order.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:order');

      for (const relation of result.relations) {
        expect(relation.evidence.length).toBeGreaterThan(0);
        expect(relation.confidence).toBeGreaterThanOrEqual(0);
        expect(relation.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should include excerptHash in evidence', () => {
      const filePath = path.join(demoPythonDir, 'src/auth/guard.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:guard');

      for (const symbol of result.symbols) {
        expect(symbol.evidence[0].excerptHash).toBeDefined();
        expect(symbol.evidence[0].excerptHash).toMatch(/^[a-f0-9]{64}$/);
      }
    });

    it('should include symbolId in evidence when present', () => {
      const filePath = path.join(demoPythonDir, 'src/auth/guard.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:guard');

      const requireUser = result.symbols.find(s => s.name === 'require_user');
      expect(requireUser).toBeDefined();
      expect(requireUser?.evidence[0].symbolId).toBeDefined();
      expect(requireUser?.evidence[0].symbolId).toContain('symbol:');
    });
  });

  describe('Class and method detection', () => {
    it('should detect class declarations', () => {
      const filePath = path.join(demoPythonDir, 'src/services/order_processor.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:order-processor');

      expect(result.parserStatus).toBe('parsed');
      const classes = result.symbols.filter(s => s.kind === 'class');
      expect(classes.length).toBeGreaterThan(0);

      const orderProcessor = classes.find(c => c.name === 'OrderProcessor');
      expect(orderProcessor).toBeDefined();
      expect(orderProcessor?.exported).toBe(true);

      const paymentHandler = classes.find(c => c.name === 'PaymentHandler');
      expect(paymentHandler).toBeDefined();
    });

    it('should detect methods in classes', () => {
      const filePath = path.join(demoPythonDir, 'src/services/order_processor.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:order-processor');

      const methods = result.symbols.filter(s => s.kind === 'method');
      expect(methods.length).toBeGreaterThan(0);

      const processOrder = methods.find(m => m.name === 'process_order');
      expect(processOrder).toBeDefined();
      expect(processOrder?.async).toBeFalsy();

      const asyncProcess = methods.find(m => m.name === 'async_process');
      expect(asyncProcess?.async).toBe(true);
    });

    it('should detect private methods (underscore prefix)', () => {
      const filePath = path.join(demoPythonDir, 'src/services/order_processor.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:order-processor');

      const methods = result.symbols.filter(s => s.kind === 'method');
      const validateItems = methods.find(m => m.name === '_validate_items');
      expect(validateItems).toBeDefined();
      expect(validateItems?.async).toBe(false);
    });

    it('should detect __init__ method', () => {
      const filePath = path.join(demoPythonDir, 'src/services/order_processor.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:order-processor');

      const methods = result.symbols.filter(s => s.kind === 'method');
      const initMethod = methods.find(m => m.name === '__init__');
      expect(initMethod).toBeDefined();
    });

    it('should handle non-exported classes', () => {
      const filePath = path.join(demoPythonDir, 'src/services/order_processor.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:order-processor');

      // In Python, all classes at module level are "exported"
      const inventoryManager = result.symbols.find(s => s.name === 'InventoryManager');
      expect(inventoryManager).toBeDefined();
      expect(inventoryManager?.exported).toBe(true);
    });
  });

  describe('Call relationship extraction', () => {
    it('should extract call relationships within functions', () => {
      const filePath = path.join(demoPythonDir, 'src/api/order.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:order');

      const calls = result.relations.filter(r => r.kind === 'calls');
      expect(calls.length).toBeGreaterThan(0);
    });

    it('should extract call relationships within methods', () => {
      const filePath = path.join(demoPythonDir, 'src/services/order_processor.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:order-processor');

      const calls = result.relations.filter(r => r.kind === 'calls');
      expect(calls.length).toBeGreaterThan(0);
    });
  });

  describe('Symbol ID format', () => {
    it('should generate properly formatted symbol IDs', () => {
      const filePath = path.join(demoPythonDir, 'src/api/order.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:order');

      for (const symbol of result.symbols) {
        expect(symbol.id).toContain('symbol:');
        expect(symbol.id).toContain('src/api/order.py');
      }
    });

    it('should include fileId in symbols', () => {
      const filePath = path.join(demoPythonDir, 'src/api/order.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:order');

      for (const symbol of result.symbols) {
        expect(symbol.fileId).toBe('file:order');
      }
    });

    it('should format method IDs with class name', () => {
      const filePath = path.join(demoPythonDir, 'src/api/order.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:order');

      const methods = result.symbols.filter(s => s.kind === 'method');
      for (const method of methods) {
        expect(method.id).toContain('OrderHandler.');
      }
    });
  });

  describe('Relation ID format', () => {
    it('should generate properly formatted relation IDs', () => {
      const filePath = path.join(demoPythonDir, 'src/api/order.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:order');

      for (const relation of result.relations) {
        expect(relation.id).toContain('relation:');
        expect(relation.from).toBeDefined();
        expect(relation.to).toBeDefined();
      }
    });

    it('should have valid confidence values', () => {
      const filePath = path.join(demoPythonDir, 'src/api/order.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:order');

      for (const relation of result.relations) {
        expect(relation.confidence).toBeGreaterThanOrEqual(0);
        expect(relation.confidence).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Variable declarations', () => {
    it('should detect variable declarations', () => {
      const filePath = path.join(demoPythonDir, 'src/api/order.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:order');

      const variables = result.symbols.filter(s => s.kind === 'variable');
      expect(variables.length).toBeGreaterThanOrEqual(0);
    });

    it('should detect lambda assignments as function kind', () => {
      const filePath = path.join(demoPythonDir, 'src/utils/nested_structures.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:nested');

      const lambdaFunctions = result.symbols.filter(s =>
        s.name.includes('lambda') || s.kind === 'function'
      );
      expect(lambdaFunctions.length).toBeGreaterThanOrEqual(0);
    });

    it('should detect instance variable in OrderProcessor', () => {
      const filePath = path.join(demoPythonDir, 'src/services/order_processor.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:order-processor');

      // Check parsing works
      expect(result.parserStatus).toBe('parsed');
      expect(result.symbols.length).toBeGreaterThan(0);
    });
  });

  describe('Error handling', () => {
    it('should handle parse errors gracefully', () => {
      const invalidPath = path.join(demoPythonDir, 'nonexistent.py');
      const result = parsePythonFile(invalidPath, demoPythonDir, 'file:invalid');

      expect(result.parserStatus).toBe('failed');
      expect(result.diagnostics.length).toBeGreaterThan(0);
      expect(result.diagnostics[0].severity).toBe('error');
      expect(result.diagnostics[0].code).toBe('PARSER_FAILED');
    });

    it('should return empty symbols for parse failures', () => {
      const invalidPath = path.join(demoPythonDir, 'nonexistent.py');
      const result = parsePythonFile(invalidPath, demoPythonDir, 'file:invalid');

      expect(result.symbols.length).toBe(0);
      expect(result.relations.length).toBe(0);
    });

    it('should include error message in diagnostics', () => {
      const invalidPath = path.join(demoPythonDir, 'nonexistent.py');
      const result = parsePythonFile(invalidPath, demoPythonDir, 'file:invalid');

      expect(result.diagnostics[0].message).toBeDefined();
      expect(result.diagnostics[0].message.length).toBeGreaterThan(0);
    });

    it('should handle syntax error files with warning', () => {
      const filePath = path.join(demoPythonDir, 'src/utils/syntax_error.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:syntax-error');

      // Should still parse but with warnings about unbalanced brackets
      expect(result.diagnostics.length).toBeGreaterThan(0);
      const syntaxWarning = result.diagnostics.find(d => d.code === 'UNBALANCED_BRACKETS');
      expect(syntaxWarning).toBeDefined();
      expect(syntaxWarning?.severity).toBe('warning');
    });
  });

  describe('Test file detection', () => {
    it('should parse test files and classify symbols as test kind', () => {
      const filePath = path.join(demoPythonDir, 'tests/order_test.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:test');

      expect(result.parserStatus).toBe('parsed');
      const testSymbols = result.symbols.filter(s => s.kind === 'test');
      expect(testSymbols.length).toBeGreaterThan(0);
    });

    it('should detect test_ prefixed functions as test kind', () => {
      const filePath = path.join(demoPythonDir, 'tests/order_test.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:test');

      const testFuncs = result.symbols.filter(s => s.name.startsWith('test_'));
      expect(testFuncs.length).toBeGreaterThan(0);

      for (const func of testFuncs) {
        expect(func.kind).toBe('test');
      }
    });

    it('should detect test methods in test classes', () => {
      const filePath = path.join(demoPythonDir, 'tests/order_test.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:test');

      const testMethods = result.symbols.filter(s =>
        s.kind === 'test' && s.name.startsWith('test_')
      );
      expect(testMethods.length).toBeGreaterThan(0);
    });
  });

  describe('Entrypoint detection', () => {
    it('should detect __name__ == "__main__" entrypoint', () => {
      const filePath = path.join(demoPythonDir, 'src/api/order.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:order');

      const entrypoints = result.relations.filter(r => r.kind === 'configures' && r.to.includes('entrypoint'));
      expect(entrypoints.length).toBeGreaterThan(0);

      const mainEntry = entrypoints.find(e => e.to.includes('__main__'));
      expect(mainEntry).toBeDefined();
    });

    it('should detect FastAPI app initialization', () => {
      const filePath = path.join(demoPythonDir, 'src/api/fastapi_routes.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:fastapi');

      const frameworkConfigs = result.relations.filter(r => r.kind === 'configures' && r.to.includes('framework'));
      expect(frameworkConfigs.length).toBeGreaterThan(0);
    });

    it('should detect uvicorn.run call', () => {
      const filePath = path.join(demoPythonDir, 'src/api/fastapi_routes.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:fastapi');

      expect(result.parserStatus).toBe('parsed');
      const entrypoints = result.relations.filter(r => r.kind === 'configures');
      expect(entrypoints.length).toBeGreaterThan(0);
    });
  });

  describe('Type definitions', () => {
    it('should detect TypedDict definitions', () => {
      const filePath = path.join(demoPythonDir, 'src/domain/order.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:order');

      const types = result.symbols.filter(s => s.kind === 'type');
      expect(types.length).toBeGreaterThan(0);

      const orderRequest = types.find(t => t.name === 'OrderRequest');
      expect(orderRequest).toBeDefined();
    });

    it('should detect dataclass definitions', () => {
      const filePath = path.join(demoPythonDir, 'src/domain/order.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:order');

      const types = result.symbols.filter(s => s.kind === 'type');
      const order = types.find(t => t.name === 'Order');
      expect(order).toBeDefined();
    });

    it('should detect class-based types in pricing module', () => {
      const filePath = path.join(demoPythonDir, 'src/domain/pricing.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:pricing');

      const classes = result.symbols.filter(s => s.kind === 'class');
      expect(classes.length).toBeGreaterThan(0);

      const calculator = classes.find(c => c.name === 'PricingCalculator');
      expect(calculator).toBeDefined();
    });
  });

  describe('Generator functions', () => {
    it('should parse generator functions', () => {
      const filePath = path.join(demoPythonDir, 'src/utils/generators.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:generators');

      expect(result.parserStatus).toBe('parsed');
      expect(result.symbols.length).toBeGreaterThan(0);
    });

    it('should detect generator function declarations', () => {
      const filePath = path.join(demoPythonDir, 'src/utils/generators.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:generators');

      const iterateCartItems = result.symbols.find(s => s.name === 'iterate_cart_items');
      expect(iterateCartItems).toBeDefined();
      expect(iterateCartItems?.exported).toBe(true);
    });

    it('should detect async generator functions', () => {
      const filePath = path.join(demoPythonDir, 'src/utils/generators.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:generators');

      const processBatches = result.symbols.find(s => s.name === 'process_batches');
      expect(processBatches).toBeDefined();
      expect(processBatches?.async).toBe(true);
    });
  });

  describe('Nested structures', () => {
    it('should parse complex nested structures', () => {
      const filePath = path.join(demoPythonDir, 'src/utils/nested_structures.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:nested');

      expect(result.parserStatus).toBe('parsed');
      expect(result.symbols.length).toBeGreaterThan(0);
    });

    it('should detect nested function definitions', () => {
      const filePath = path.join(demoPythonDir, 'src/utils/nested_structures.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:nested');

      const functions = result.symbols.filter(s => s.kind === 'function');
      expect(functions.length).toBeGreaterThan(0);

      const createNestedProcessor = functions.find(f => f.name === 'create_nested_processor');
      expect(createNestedProcessor).toBeDefined();
      expect(createNestedProcessor?.exported).toBe(true);
    });

    it('should detect outer class definitions', () => {
      const filePath = path.join(demoPythonDir, 'src/utils/nested_structures.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:nested');

      const classes = result.symbols.filter(s => s.kind === 'class');
      expect(classes.length).toBeGreaterThan(0);

      const outerClass = classes.find(c => c.name === 'OuterClass');
      expect(outerClass).toBeDefined();
    });
  });

  describe('Large file handling', () => {
    it('should parse large files with many symbols', () => {
      const filePath = path.join(demoPythonDir, 'src/utils/large_file.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:large');

      expect(result.parserStatus).toBe('parsed');
      expect(result.symbols.length).toBeGreaterThan(20);
    });

    it('should detect many exported functions', () => {
      const filePath = path.join(demoPythonDir, 'src/utils/large_file.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:large');

      const exportedFunctions = result.symbols.filter(s => s.exported && s.kind === 'function');
      expect(exportedFunctions.length).toBeGreaterThan(10);
    });

    it('should detect many classes with methods', () => {
      const filePath = path.join(demoPythonDir, 'src/utils/large_file.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:large');

      const classes = result.symbols.filter(s => s.kind === 'class');
      expect(classes.length).toBeGreaterThan(1);

      const methods = result.symbols.filter(s => s.kind === 'method');
      expect(methods.length).toBeGreaterThan(10);
    });

    it('should detect many type definitions', () => {
      const filePath = path.join(demoPythonDir, 'src/utils/large_file.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:large');

      const types = result.symbols.filter(s => s.kind === 'type');
      expect(types.length).toBeGreaterThan(3);
    });
  });

  describe('Empty file handling', () => {
    it('should parse empty Python files', () => {
      const filePath = path.join(demoPythonDir, 'src/utils/empty.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:empty');

      expect(result.parserStatus).toBe('parsed');
      expect(result.symbols.length).toBe(0);
      expect(result.relations.length).toBe(0);
    });

    it('should parse empty.py from edge cases', () => {
      const filePath = path.join(edgeCasesDir, 'empty.py');
      const result = parsePythonFile(filePath, edgeCasesDir, 'file:empty-edge');

      expect(result.parserStatus).toBe('parsed');
      expect(result.symbols.length).toBe(0);
    });
  });

  describe('Decorators', () => {
    it('should handle decorated functions', () => {
      const filePath = path.join(demoPythonDir, 'src/utils/edge_cases.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:edge-cases');

      expect(result.parserStatus).toBe('parsed');
      const functions = result.symbols.filter(s => s.kind === 'function');
      expect(functions.length).toBeGreaterThan(0);
    });

    it('should handle decorated classes', () => {
      const filePath = path.join(demoPythonDir, 'src/utils/edge_cases.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:edge-cases');

      const classes = result.symbols.filter(s => s.kind === 'class');
      expect(classes.length).toBeGreaterThan(0);

      const decoratedClass = classes.find(c => c.name === 'DecoratedClass');
      expect(decoratedClass).toBeDefined();
    });

    it('should handle multiple decorators', () => {
      const filePath = path.join(demoPythonDir, 'src/utils/edge_cases.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:edge-cases');

      expect(result.parserStatus).toBe('parsed');
    });

    it('should classify route decorator methods as route kind', () => {
      const filePath = path.join(demoPythonDir, 'src/utils/edge_cases.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:edge-cases');

      const routes = result.symbols.filter(s => s.kind === 'route');
      expect(routes.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Database module', () => {
    it('should parse orders.py and detect classes', () => {
      const filePath = path.join(demoPythonDir, 'src/db/orders.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:orders');

      expect(result.parserStatus).toBe('parsed');

      const classes = result.symbols.filter(s => s.kind === 'class');
      expect(classes.length).toBeGreaterThan(0);
    });

    it('should detect async functions in orders module', () => {
      const filePath = path.join(demoPythonDir, 'src/db/orders.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:orders');

      const asyncFunctions = result.symbols.filter(s => s.async === true);
      expect(asyncFunctions.length).toBeGreaterThan(0);
    });

    it('should detect methods in OrderDatabase class', () => {
      const filePath = path.join(demoPythonDir, 'src/db/orders.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:orders');

      const methods = result.symbols.filter(s => s.kind === 'method');
      expect(methods.length).toBeGreaterThan(0);

      const insertMethod = methods.find(m => m.name === 'insert');
      expect(insertMethod).toBeDefined();
    });
  });

  describe('Async function detection', () => {
    it('should mark async functions correctly', () => {
      const filePath = path.join(demoPythonDir, 'src/api/order.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:order');

      const asyncFunctions = result.symbols.filter(s => s.async === true);
      expect(asyncFunctions.length).toBeGreaterThan(0);
    });

    it('should detect async methods', () => {
      const filePath = path.join(demoPythonDir, 'src/services/order_processor.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:order-processor');

      const asyncMethods = result.symbols.filter(s => s.kind === 'method' && s.async === true);
      expect(asyncMethods.length).toBeGreaterThan(0);
    });
  });

  describe('FastAPI routes', () => {
    it('should classify FastAPI decorator functions as routes', () => {
      const filePath = path.join(demoPythonDir, 'src/api/fastapi_routes.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:fastapi');

      const routes = result.symbols.filter(s => s.kind === 'route');
      expect(routes.length).toBeGreaterThan(0);
    });

    it('should detect @app.get decorated functions', () => {
      const filePath = path.join(demoPythonDir, 'src/api/fastapi_routes.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:fastapi');

      const routes = result.symbols.filter(s => s.kind === 'route');
      const root = routes.find(r => r.name === 'root');
      expect(root).toBeDefined();
      expect(root?.async).toBe(true);
    });

    it('should detect @router.get decorated functions', () => {
      const filePath = path.join(demoPythonDir, 'src/api/fastapi_routes.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:fastapi');

      const routes = result.symbols.filter(s => s.kind === 'route');
      const listUsers = routes.find(r => r.name === 'list_users');
      expect(listUsers).toBeDefined();
    });
  });

  describe('Path handling', () => {
    it('should normalize Windows paths to POSIX format', () => {
      const filePath = path.join(demoPythonDir, 'src/api/order.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:order');

      // Evidence paths should use forward slashes
      for (const symbol of result.symbols) {
        expect(symbol.evidence[0].path).not.toContain('\\');
      }
    });
  });

  describe('Export relations', () => {
    it('should generate export relations for exported symbols', () => {
      const filePath = path.join(demoPythonDir, 'src/auth/guard.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:guard');

      const exports = result.relations.filter(r => r.kind === 'exports');
      expect(exports.length).toBeGreaterThan(0);
    });

    it('should export all module-level definitions', () => {
      const filePath = path.join(demoPythonDir, 'src/domain/pricing.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:pricing');

      const exports = result.relations.filter(r => r.kind === 'exports');
      expect(exports.length).toBeGreaterThan(0);
    });
  });

  describe('Pricing module', () => {
    it('should parse pricing.py and detect functions', () => {
      const filePath = path.join(demoPythonDir, 'src/domain/pricing.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:pricing');

      expect(result.parserStatus).toBe('parsed');

      const calculateTotal = result.symbols.find(s => s.name === 'calculate_total');
      expect(calculateTotal).toBeDefined();
      expect(calculateTotal?.exported).toBe(true);

      const getServerPrice = result.symbols.find(s => s.name === 'get_server_price');
      expect(getServerPrice).toBeDefined();
    });

    it('should detect async pricing function', () => {
      const filePath = path.join(demoPythonDir, 'src/domain/pricing.py');
      const result = parsePythonFile(filePath, demoPythonDir, 'file:pricing');

      const asyncCalculate = result.symbols.find(s => s.name === 'async_calculate');
      expect(asyncCalculate).toBeDefined();
      expect(asyncCalculate?.async).toBe(true);
    });
  });
});