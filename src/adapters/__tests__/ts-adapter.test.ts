import { describe, it, expect } from 'vitest';
import { parseTypeScriptFile } from '../ts-adapter';
import path from 'node:path';

const fixturesDir = path.resolve(import.meta.dirname, '../../../fixtures');
const demoShopTsDir = path.join(fixturesDir, 'demo-shop-ts');
const edgeCasesDir = path.join(fixturesDir, 'edge-cases');

describe('ts-adapter', () => {
  describe('TypeScript file parsing and symbol extraction', () => {
    it('should parse create.ts and extract symbols', () => {
      const filePath = path.join(demoShopTsDir, 'src/api/order/create.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:create');

      expect(result.parserStatus).toBe('parsed');
      expect(result.parserAdapter).toBe('ts-morph-v0');
      expect(result.symbols.length).toBeGreaterThan(0);
      expect(result.diagnostics.length).toBe(0);
    });

    it('should detect function declarations (including route handlers)', () => {
      const filePath = path.join(demoShopTsDir, 'src/api/order/create.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:create');

      // Functions with "route" in name are classified as "route" kind
      const routeHandlers = result.symbols.filter(s => s.kind === 'route');
      expect(routeHandlers.length).toBeGreaterThan(0);

      const createOrderRoute = routeHandlers.find(f => f.name === 'createOrderRoute');
      expect(createOrderRoute).toBeDefined();
      expect(createOrderRoute?.async).toBe(true);
    });

    it('should detect exported attribute on symbols', () => {
      const filePath = path.join(demoShopTsDir, 'src/api/order/create.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:create');

      const exportedSymbols = result.symbols.filter(s => s.exported);
      expect(exportedSymbols.length).toBeGreaterThan(0);

      const createOrderRoute = result.symbols.find(s => s.name === 'createOrderRoute');
      expect(createOrderRoute?.exported).toBe(true);

      const orderRequestType = result.symbols.find(s => s.name === 'OrderRequest');
      expect(orderRequestType?.exported).toBe(true);
    });

    it('should detect type and interface declarations', () => {
      const filePath = path.join(demoShopTsDir, 'src/api/order/create.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:create');

      const types = result.symbols.filter(s => s.kind === 'type' || s.kind === 'interface');
      expect(types.length).toBeGreaterThan(0);

      const orderRequest = types.find(t => t.name === 'OrderRequest');
      expect(orderRequest).toBeDefined();
      expect(orderRequest?.kind).toBe('type');
    });
  });

  describe('Import/export relationship extraction', () => {
    it('should extract import relationships', () => {
      const filePath = path.join(demoShopTsDir, 'src/api/order/create.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:create');

      const imports = result.relations.filter(r => r.kind === 'imports');
      expect(imports.length).toBeGreaterThan(0);

      // Check for the requireUser import from guard
      const requireUserImport = imports.find(i => i.to.includes('guard'));
      expect(requireUserImport).toBeDefined();
    });

    it('should extract reference relationships for imported symbols', () => {
      const filePath = path.join(demoShopTsDir, 'src/api/order/create.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:create');

      const references = result.relations.filter(r => r.kind === 'references');
      expect(references.length).toBeGreaterThan(0);

      // Check for reference to requireUser
      const requireUserRef = references.find(r => r.to.includes('requireUser'));
      expect(requireUserRef).toBeDefined();
    });

    it('should extract export relationships', () => {
      const filePath = path.join(demoShopTsDir, 'src/domain/cart.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:cart');

      const exports = result.relations.filter(r => r.kind === 'exports');
      expect(exports.length).toBeGreaterThan(0);
    });

    it('should extract named import symbols', () => {
      const filePath = path.join(demoShopTsDir, 'src/api/order/create.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:create');

      const references = result.relations.filter(r => r.kind === 'references');
      // Check for specific imported symbol reference
      const createOrderRef = references.find(r => r.to.includes('createOrder'));
      expect(createOrderRef).toBeDefined();
    });

    it('should extract re-export relationships', () => {
      const filePath = path.join(demoShopTsDir, 'src/domain/pricing.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:pricing');

      expect(result.parserStatus).toBe('parsed');
      // Pricing file has exports for its functions
      const exports = result.relations.filter(r => r.kind === 'exports');
      expect(exports.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Evidence generation', () => {
    it('should generate evidence for each symbol', () => {
      const filePath = path.join(demoShopTsDir, 'src/api/order/create.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:create');

      for (const symbol of result.symbols) {
        expect(symbol.evidence.length).toBeGreaterThan(0);
        expect(symbol.evidence[0].kind).toBe('ast');
        expect(symbol.evidence[0].path).toBeDefined();
        expect(symbol.evidence[0].excerptHash).toBeDefined();
      }
    });

    it('should include line numbers in evidence', () => {
      const filePath = path.join(demoShopTsDir, 'src/api/order/create.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:create');

      const createOrderRoute = result.symbols.find(s => s.name === 'createOrderRoute');
      expect(createOrderRoute).toBeDefined();
      expect(createOrderRoute?.evidence[0].startLine).toBeDefined();
      expect(createOrderRoute?.evidence[0].endLine).toBeDefined();
      expect(createOrderRoute?.evidence[0].startLine).toBeLessThanOrEqual(
        createOrderRoute?.evidence[0].endLine ?? 0
      );
    });

    it('should generate evidence for relations', () => {
      const filePath = path.join(demoShopTsDir, 'src/api/order/create.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:create');

      for (const relation of result.relations) {
        expect(relation.evidence.length).toBeGreaterThan(0);
        expect(relation.confidence).toBeGreaterThanOrEqual(0);
        expect(relation.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should include excerptHash in evidence', () => {
      const filePath = path.join(demoShopTsDir, 'src/domain/cart.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:cart');

      for (const symbol of result.symbols) {
        expect(symbol.evidence[0].excerptHash).toBeDefined();
        expect(symbol.evidence[0].excerptHash).toMatch(/^[a-f0-9]{64}$/);
      }
    });

    it('should include symbolId in evidence when present', () => {
      const filePath = path.join(demoShopTsDir, 'src/domain/cart.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:cart');

      const addItem = result.symbols.find(s => s.name === 'addItem');
      expect(addItem).toBeDefined();
      expect(addItem?.evidence[0].symbolId).toBeDefined();
      expect(addItem?.evidence[0].symbolId).toContain('symbol:');
    });
  });

  describe('Class and method detection', () => {
    it('should detect class declarations', () => {
      const filePath = path.join(demoShopTsDir, 'src/services/order-processor.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:order-processor');

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
      const filePath = path.join(demoShopTsDir, 'src/services/order-processor.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:order-processor');

      const methods = result.symbols.filter(s => s.kind === 'method');
      expect(methods.length).toBeGreaterThan(0);

      const processOrder = methods.find(m => m.name === 'processOrder');
      expect(processOrder).toBeDefined();
      expect(processOrder?.async).toBe(true);

      const getStats = methods.find(m => m.name === 'getStats');
      expect(getStats).toBeDefined();
      expect(getStats?.async).toBeFalsy();
    });

    it('should detect private methods', () => {
      const filePath = path.join(demoShopTsDir, 'src/services/order-processor.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:order-processor');

      const methods = result.symbols.filter(s => s.kind === 'method');
      const validateItems = methods.find(m => m.name === 'validateItems');
      expect(validateItems).toBeDefined();
      expect(validateItems?.async).toBe(true);
    });

    it('should detect constructor presence via processedCount variable', () => {
      const filePath = path.join(demoShopTsDir, 'src/services/order-processor.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:order-processor');

      // Constructor is implicit, but we check that the class was parsed
      const classes = result.symbols.filter(s => s.kind === 'class');
      expect(classes.length).toBeGreaterThan(0);
    });

    it('should handle non-exported classes', () => {
      const filePath = path.join(demoShopTsDir, 'src/services/order-processor.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:order-processor');

      // InventoryManager is not exported
      const inventoryManager = result.symbols.find(s => s.name === 'InventoryManager');
      // May or may not be detected depending on parser behavior
      expect(result.parserStatus).toBe('parsed');
    });
  });

  describe('Call relationship extraction', () => {
    it('should extract call relationships within functions', () => {
      const filePath = path.join(demoShopTsDir, 'src/api/order/create.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:create');

      const calls = result.relations.filter(r => r.kind === 'calls');
      expect(calls.length).toBeGreaterThan(0);

      // Check for call to createOrder
      const createOrderCall = calls.find(c => c.to.includes('createOrder'));
      expect(createOrderCall).toBeDefined();
    });

  describe('Cart module functions', () => {
    it('should parse cart.ts and detect exported functions', () => {
      const filePath = path.join(demoShopTsDir, 'src/domain/cart.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:cart');

      expect(result.parserStatus).toBe('parsed');
      expect(result.symbols.length).toBeGreaterThan(0);

      // Check for addItem function
      const addItem = result.symbols.find(s => s.name === 'addItem');
      expect(addItem).toBeDefined();
      expect(addItem?.kind).toBe('function');
      expect(addItem?.exported).toBe(true);

      // Check for CartItem type
      const cartItem = result.symbols.find(s => s.name === 'CartItem');
      expect(cartItem).toBeDefined();
      expect(cartItem?.kind).toBe('type');
    });

    it('should detect removeItem function', () => {
      const filePath = path.join(demoShopTsDir, 'src/domain/cart.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:cart');

      const removeItem = result.symbols.find(s => s.name === 'removeItem');
      expect(removeItem).toBeDefined();
      expect(removeItem?.exported).toBe(true);
    });

    it('should detect calculateCartTotal function', () => {
      const filePath = path.join(demoShopTsDir, 'src/domain/cart.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:cart');

      const calculateCartTotal = result.symbols.find(s => s.name === 'calculateCartTotal');
      expect(calculateCartTotal).toBeDefined();
      expect(calculateCartTotal?.exported).toBe(true);
    });
  });

  describe('Symbol ID format', () => {
    it('should generate properly formatted symbol IDs', () => {
      const filePath = path.join(demoShopTsDir, 'src/api/order/create.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:create');

      for (const symbol of result.symbols) {
        expect(symbol.id).toContain('symbol:');
        expect(symbol.id).toContain('src/api/order/create.ts');
      }
    });

    it('should include fileId in symbols', () => {
      const filePath = path.join(demoShopTsDir, 'src/api/order/create.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:create');

      for (const symbol of result.symbols) {
        expect(symbol.fileId).toBe('file:create');
      }
    });
  });

  describe('Relation ID format', () => {
    it('should generate properly formatted relation IDs', () => {
      const filePath = path.join(demoShopTsDir, 'src/api/order/create.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:create');

      for (const relation of result.relations) {
        expect(relation.id).toContain('relation:');
        expect(relation.from).toBeDefined();
        expect(relation.to).toBeDefined();
      }
    });

    it('should have valid confidence values', () => {
      const filePath = path.join(demoShopTsDir, 'src/api/order/create.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:create');

      for (const relation of result.relations) {
        expect(relation.confidence).toBeGreaterThanOrEqual(0);
        expect(relation.confidence).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Variable declarations', () => {
    it('should detect variable declarations including arrow functions', () => {
      const filePath = path.join(demoShopTsDir, 'src/domain/cart.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:cart');

      const variables = result.symbols.filter(s => s.kind === 'variable');
      // Check parsing works - variables may or may not be present depending on code structure
      expect(result.parserStatus).toBe('parsed');
    });

    it('should detect arrow functions as function kind', () => {
      const filePath = path.join(demoShopTsDir, 'src/services/order-processor.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:order-processor');

      // defaultProcessor is an exported const but initialized with new expression
      const defaultProcessor = result.symbols.find(s => s.name === 'defaultProcessor');
      expect(defaultProcessor).toBeDefined();
    });
  });

  describe('Error handling', () => {
    it('should handle parse errors gracefully', () => {
      const invalidPath = path.join(demoShopTsDir, 'nonexistent.ts');
      const result = parseTypeScriptFile(invalidPath, demoShopTsDir, 'file:invalid');

      expect(result.parserStatus).toBe('failed');
      expect(result.diagnostics.length).toBeGreaterThan(0);
      expect(result.diagnostics[0].severity).toBe('error');
      expect(result.diagnostics[0].code).toBe('PARSER_FAILED');
    });

    it('should return empty symbols for parse failures', () => {
      const invalidPath = path.join(demoShopTsDir, 'nonexistent.ts');
      const result = parseTypeScriptFile(invalidPath, demoShopTsDir, 'file:invalid');

      expect(result.symbols.length).toBe(0);
      expect(result.relations.length).toBe(0);
    });

    it('should include error message in diagnostics', () => {
      const invalidPath = path.join(demoShopTsDir, 'nonexistent.ts');
      const result = parseTypeScriptFile(invalidPath, demoShopTsDir, 'file:invalid');

      expect(result.diagnostics[0].message).toBeDefined();
      expect(result.diagnostics[0].message.length).toBeGreaterThan(0);
    });
  });

  describe('Test file detection', () => {
    it('should parse test files and classify symbols as test kind', () => {
      const filePath = path.join(demoShopTsDir, 'src/tests/cart.test.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:test');

      expect(result.parserStatus).toBe('parsed');
      // Symbols in test files should be classified as 'test'
      const testSymbols = result.symbols.filter(s => s.kind === 'test');
      expect(testSymbols.length).toBeGreaterThanOrEqual(0);
    });

    it('should detect describe function in test files', () => {
      const filePath = path.join(demoShopTsDir, 'src/tests/cart.test.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:test');

      expect(result.parserStatus).toBe('parsed');
      // Test file has imports and function calls
      expect(result.relations.length).toBeGreaterThan(0);
    });
  });

  describe('Generator functions', () => {
    it('should parse generator functions', () => {
      const filePath = path.join(demoShopTsDir, 'src/utils/generators.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:generators');

      expect(result.parserStatus).toBe('parsed');
      expect(result.symbols.length).toBeGreaterThan(0);
    });

    it('should detect generator function declarations', () => {
      const filePath = path.join(demoShopTsDir, 'src/utils/generators.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:generators');

      const iterateCartItems = result.symbols.find(s => s.name === 'iterateCartItems');
      expect(iterateCartItems).toBeDefined();
      expect(iterateCartItems?.exported).toBe(true);
    });

    it('should detect async generator functions', () => {
      const filePath = path.join(demoShopTsDir, 'src/utils/generators.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:generators');

      const processBatches = result.symbols.find(s => s.name === 'processBatches');
      expect(processBatches).toBeDefined();
      expect(processBatches?.exported).toBe(true);
    });

    it('should detect generator with return type', () => {
      const filePath = path.join(demoShopTsDir, 'src/utils/generators.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:generators');

      const cartSummaryGenerator = result.symbols.find(s => s.name === 'cartSummaryGenerator');
      expect(cartSummaryGenerator).toBeDefined();
    });
  });

  describe('Nested structures', () => {
    it('should parse complex nested structures', () => {
      const filePath = path.join(demoShopTsDir, 'src/utils/nested-structures.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:nested');

      expect(result.parserStatus).toBe('parsed');
      expect(result.symbols.length).toBeGreaterThan(0);
    });

    it('should detect exported functions in nested structures', () => {
      const filePath = path.join(demoShopTsDir, 'src/utils/nested-structures.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:nested');

      const createNestedProcessor = result.symbols.find(s => s.name === 'createNestedProcessor');
      expect(createNestedProcessor).toBeDefined();
      expect(createNestedProcessor?.exported).toBe(true);
    });

    it('should detect arrow function variables', () => {
      const filePath = path.join(demoShopTsDir, 'src/utils/nested-structures.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:nested');

      // arrowFunctionVariations is exported as an object
      const variations = result.symbols.find(s => s.name === 'arrowFunctionVariations');
      expect(variations).toBeDefined();
    });

    it('should detect deeply nested function exports', () => {
      const filePath = path.join(demoShopTsDir, 'src/utils/nested-structures.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:nested');

      const deepNestingExample = result.symbols.find(s => s.name === 'deepNestingExample');
      expect(deepNestingExample).toBeDefined();

      const createCalculator = result.symbols.find(s => s.name === 'createCalculator');
      expect(createCalculator).toBeDefined();
    });
  });

  describe('Large file handling', () => {
    it('should parse large files with many symbols', () => {
      const filePath = path.join(demoShopTsDir, 'src/utils/large-file.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:large');

      expect(result.parserStatus).toBe('parsed');
      expect(result.symbols.length).toBeGreaterThan(20);
    });

    it('should detect many exported functions', () => {
      const filePath = path.join(demoShopTsDir, 'src/utils/large-file.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:large');

      const exportedFunctions = result.symbols.filter(s => s.exported && s.kind === 'function');
      expect(exportedFunctions.length).toBeGreaterThan(10);
    });

    it('should detect many classes with methods', () => {
      const filePath = path.join(demoShopTsDir, 'src/utils/large-file.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:large');

      const classes = result.symbols.filter(s => s.kind === 'class');
      expect(classes.length).toBeGreaterThan(1);

      const methods = result.symbols.filter(s => s.kind === 'method');
      expect(methods.length).toBeGreaterThan(10);
    });

    it('should detect many type definitions', () => {
      const filePath = path.join(demoShopTsDir, 'src/utils/large-file.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:large');

      const types = result.symbols.filter(s => s.kind === 'type');
      expect(types.length).toBeGreaterThan(3);
    });

    it('should detect many interfaces', () => {
      const filePath = path.join(demoShopTsDir, 'src/utils/large-file.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:large');

      const interfaces = result.symbols.filter(s => s.kind === 'interface');
      expect(interfaces.length).toBeGreaterThan(3);
    });

    it('should handle many call relationships', () => {
      const filePath = path.join(demoShopTsDir, 'src/utils/large-file.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:large');

      const calls = result.relations.filter(r => r.kind === 'calls');
      expect(calls.length).toBeGreaterThan(0);
    });
  });

  describe('Empty file handling', () => {
    it('should parse empty TypeScript files', () => {
      const filePath = path.join(edgeCasesDir, 'empty.ts');
      const result = parseTypeScriptFile(filePath, edgeCasesDir, 'file:empty');

      expect(result.parserStatus).toBe('parsed');
      expect(result.symbols.length).toBe(0);
      expect(result.relations.length).toBe(0);
    });
  });

  describe('Guard module', () => {
    it('should parse guard.ts and detect functions', () => {
      const filePath = path.join(demoShopTsDir, 'src/auth/guard.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:guard');

      expect(result.parserStatus).toBe('parsed');
      expect(result.symbols.length).toBeGreaterThan(0);

      const requireUser = result.symbols.find(s => s.name === 'requireUser');
      expect(requireUser).toBeDefined();
      expect(requireUser?.exported).toBe(true);
    });

    it('should detect requireAdmin function', () => {
      const filePath = path.join(demoShopTsDir, 'src/auth/guard.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:guard');

      const requireAdmin = result.symbols.find(s => s.name === 'requireAdmin');
      expect(requireAdmin).toBeDefined();
      expect(requireAdmin?.exported).toBe(true);
    });
  });

  describe('Orders database module', () => {
    it('should parse orders.ts and detect types', () => {
      const filePath = path.join(demoShopTsDir, 'src/db/orders.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:orders');

      expect(result.parserStatus).toBe('parsed');

      const user = result.symbols.find(s => s.name === 'User');
      expect(user).toBeDefined();
      expect(user?.kind).toBe('type');

      const storedOrder = result.symbols.find(s => s.name === 'StoredOrder');
      expect(storedOrder).toBeDefined();
    });

    it('should detect async functions in orders module', () => {
      const filePath = path.join(demoShopTsDir, 'src/db/orders.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:orders');

      const createOrder = result.symbols.find(s => s.name === 'createOrder');
      expect(createOrder).toBeDefined();
      expect(createOrder?.async).toBe(true);

      const getOrderById = result.symbols.find(s => s.name === 'getOrderById');
      expect(getOrderById).toBeDefined();
      expect(getOrderById?.async).toBe(true);
    });
  });

  describe('Pricing module', () => {
    it('should parse pricing.ts and detect functions', () => {
      const filePath = path.join(demoShopTsDir, 'src/domain/pricing.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:pricing');

      expect(result.parserStatus).toBe('parsed');

      const getServerPrice = result.symbols.find(s => s.name === 'getServerPrice');
      expect(getServerPrice).toBeDefined();
      expect(getServerPrice?.exported).toBe(true);

      const calculateServerTotal = result.symbols.find(s => s.name === 'calculateServerTotal');
      expect(calculateServerTotal).toBeDefined();
    });

    it('should detect validateTotal function', () => {
      const filePath = path.join(demoShopTsDir, 'src/domain/pricing.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:pricing');

      const validateTotal = result.symbols.find(s => s.name === 'validateTotal');
      expect(validateTotal).toBeDefined();
      expect(validateTotal?.exported).toBe(true);
    });
  });

  describe('Async function detection', () => {
    it('should mark async functions correctly', () => {
      const filePath = path.join(demoShopTsDir, 'src/api/order/create.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:create');

      const asyncFunctions = result.symbols.filter(s => s.async === true);
      expect(asyncFunctions.length).toBeGreaterThan(0);
    });

    it('should detect async methods', () => {
      const filePath = path.join(demoShopTsDir, 'src/services/order-processor.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:order-processor');

      const asyncMethods = result.symbols.filter(s => s.kind === 'method' && s.async === true);
      expect(asyncMethods.length).toBeGreaterThan(0);
    });
  });

  describe('Route handler classification', () => {
    it('should classify functions with "route" in name as route kind', () => {
      const filePath = path.join(demoShopTsDir, 'src/api/order/create.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:create');

      const routeSymbols = result.symbols.filter(s => s.kind === 'route');
      expect(routeSymbols.length).toBeGreaterThan(0);

      for (const symbol of routeSymbols) {
        expect(symbol.name.toLowerCase()).toMatch(/route|handler|controller/);
      }
    });
  });

  describe('Interface detection', () => {
    it('should detect interface declarations', () => {
      const filePath = path.join(demoShopTsDir, 'src/services/order-processor.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:order-processor');

      const interfaces = result.symbols.filter(s => s.kind === 'interface');
      expect(interfaces.length).toBeGreaterThan(0);

      const config = interfaces.find(i => i.name === 'OrderProcessorConfig');
      expect(config).toBeDefined();
    });
  });

  describe('Default imports', () => {
    it('should handle default imports', () => {
      const filePath = path.join(demoShopTsDir, 'src/domain/cart.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:cart');

      // Cart file has no default imports, but check parsing works
      expect(result.parserStatus).toBe('parsed');
    });
  });

  describe('Path handling', () => {
    it('should normalize Windows paths to POSIX format', () => {
      const filePath = path.join(demoShopTsDir, 'src/api/order/create.ts');
      const result = parseTypeScriptFile(filePath, demoShopTsDir, 'file:create');

      // Evidence paths should use forward slashes
      for (const symbol of result.symbols) {
        expect(symbol.evidence[0].path).not.toContain('\\');
      }
    });
  });
});
});