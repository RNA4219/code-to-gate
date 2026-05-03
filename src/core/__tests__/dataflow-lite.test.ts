/**
 * Tests for Dataflow-lite module
 */

import { describe, it, expect } from "vitest";
import {
  extractAssignDataflow,
  extractParamDataflow,
  extractReturnDataflow,
  createDataflowRelation,
  trackCallToReturn,
  trackDataflowChain,
  isClientTrustedSource,
  flowsToPayment,
  buildDataflowGraph,
} from "../dataflow-lite.js";
import type { SymbolNode, GraphRelation } from "../../types/graph.js";

describe("Dataflow-lite", () => {
  const filePath = "src/payment/calculatePrice.ts";

  describe("extractAssignDataflow", () => {
    it("creates assign dataflow node", () => {
      const node = extractAssignDataflow(
        "symbol:src/payment/calculatePrice.ts:clientPrice",
        filePath,
        10,
        12,
        "calculatePrice(productId)"
      );

      expect(node.kind).toBe("assign");
      expect(node.source).toBe("calculatePrice(productId)");
      expect(node.target).toBe("symbol:src/payment/calculatePrice.ts:clientPrice");
      expect(node.filePath).toBe(filePath);
      expect(node.location.startLine).toBe(10);
      expect(node.evidence.length).toBe(1);
    });
  });

  describe("extractParamDataflow", () => {
    it("creates param dataflow node", () => {
      const node = extractParamDataflow(
        "symbol:src/payment/calculatePrice.ts:productId",
        "symbol:src/payment/calculatePrice.ts:calculatePrice",
        filePath,
        5,
        5
      );

      expect(node.kind).toBe("param");
      expect(node.source).toBe("symbol:src/payment/calculatePrice.ts:calculatePrice");
      expect(node.target).toBe("symbol:src/payment/calculatePrice.ts:productId");
    });
  });

  describe("extractReturnDataflow", () => {
    it("creates return dataflow node", () => {
      const node = extractReturnDataflow(
        "symbol:src/payment/calculatePrice.ts:calculatePrice",
        "basePrice * quantity",
        filePath,
        15,
        17
      );

      expect(node.kind).toBe("return");
      expect(node.source).toBe("basePrice * quantity");
      expect(node.target).toBe("symbol:src/payment/calculatePrice.ts:calculatePrice");
    });
  });

  describe("createDataflowRelation", () => {
    it("creates flows_to relation", () => {
      const relation = createDataflowRelation(
        "symbol:src/payment/calculatePrice.ts:calculatePrice",
        "symbol:src/payment/calculatePrice.ts:clientPrice",
        filePath,
        0.8
      );

      expect(relation.kind).toBe("flows_to");
      expect(relation.from).toBe("symbol:src/payment/calculatePrice.ts:calculatePrice");
      expect(relation.to).toBe("symbol:src/payment/calculatePrice.ts:clientPrice");
      expect(relation.confidence).toBe(0.8);
    });
  });

  describe("trackCallToReturn", () => {
    it("tracks call to return dataflow", () => {
      const symbols: SymbolNode[] = [
        {
          id: "symbol:src/client/order.ts:handleSubmit",
          fileId: "file:src/client/order.ts",
          name: "handleSubmit",
          kind: "function",
          exported: false,
          location: { startLine: 20, endLine: 30 },
          evidence: [],
        },
      ];

      const callRelation: GraphRelation = {
        id: "relation:src/client/order.ts:call:handleSubmit:1",
        from: "symbol:src/client/order.ts:handleSubmit",
        to: "symbol:src/payment/calculatePrice.ts:calculatePrice",
        kind: "calls",
        confidence: 0.7,
        evidence: [],
      };

      const graph = trackCallToReturn(callRelation, symbols, "src/client/order.ts");

      expect(graph.nodes.length).toBe(1);
      expect(graph.nodes[0].kind).toBe("return");
      expect(graph.relations.length).toBe(1);
      expect(graph.sourceSymbolId).toBe("symbol:src/payment/calculatePrice.ts:calculatePrice");
      expect(graph.targetSymbolId).toBe("symbol:src/client/order.ts:handleSubmit");
    });
  });

  describe("trackDataflowChain", () => {
    it("tracks dataflow chain from source to sink", () => {
      const symbols: SymbolNode[] = [
        {
          id: "symbol:src/api/handler.ts:userInput",
          fileId: "file:src/api/handler.ts",
          name: "userInput",
          kind: "variable",
          exported: false,
          location: { startLine: 5, endLine: 5 },
          evidence: [],
        },
        {
          id: "symbol:src/db/query.ts:sqlQuery",
          fileId: "file:src/db/query.ts",
          name: "sqlQuery",
          kind: "function",
          exported: true,
          location: { startLine: 10, endLine: 15 },
          evidence: [],
        },
      ];

      const callRelations: GraphRelation[] = [
        {
          id: "relation:src/api/handler.ts:call:1",
          from: "symbol:src/api/handler.ts:userInput",
          to: "symbol:src/db/query.ts:sqlQuery",
          kind: "calls",
          confidence: 0.7,
          evidence: [],
        },
      ];

      const graph = trackDataflowChain(
        "symbol:src/api/handler.ts:userInput",
        "symbol:src/db/query.ts:sqlQuery",
        callRelations,
        symbols,
        "src/api/handler.ts"
      );

      expect(graph.nodes.length).toBeGreaterThan(0);
      expect(graph.sourceSymbolId).toBe("symbol:src/api/handler.ts:userInput");
      expect(graph.targetSymbolId).toBe("symbol:src/db/query.ts:sqlQuery");
    });

    it("returns empty graph when chain not found", () => {
      const symbols: SymbolNode[] = [];
      const callRelations: GraphRelation[] = [];

      const graph = trackDataflowChain(
        "symbol:src/unknown.ts:start",
        "symbol:src/unknown.ts:end",
        callRelations,
        symbols,
        "src/unknown.ts"
      );

      expect(graph.nodes.length).toBe(0);
      expect(graph.targetSymbolId).toBeUndefined();
    });
  });

  describe("isClientTrustedSource", () => {
    it("detects client-trusted source in components", () => {
      const symbols: SymbolNode[] = [
        {
          id: "symbol:src/components/PriceCalculator.tsx:clientPrice",
          fileId: "file:src/components/PriceCalculator.tsx",
          name: "clientPrice",
          kind: "variable",
          exported: false,
          location: { startLine: 10, endLine: 12 },
          evidence: [],
        },
      ];

      const callRelations: GraphRelation[] = [];
      const filePath = "src/components/PriceCalculator.tsx";

      const result = isClientTrustedSource(
        "symbol:src/components/PriceCalculator.tsx:clientPrice",
        symbols,
        callRelations,
        filePath
      );

      expect(result).toBe(true);
    });

    it("returns false when validation call exists", () => {
      const symbols: SymbolNode[] = [
        {
          id: "symbol:src/components/PriceCalculator.tsx:price",
          fileId: "file:src/components/PriceCalculator.tsx",
          name: "price",
          kind: "variable",
          exported: false,
          location: { startLine: 10, endLine: 12 },
          evidence: [],
        },
      ];

      const callRelations: GraphRelation[] = [
        {
          id: "relation:src/components/PriceCalculator.tsx:call:1",
          from: "symbol:src/components/PriceCalculator.tsx:price",
          to: "symbol:src/utils/validate.ts:validatePrice",
          kind: "calls",
          confidence: 0.7,
          evidence: [],
        },
      ];

      const filePath = "src/components/PriceCalculator.tsx";

      const result = isClientTrustedSource(
        "symbol:src/components/PriceCalculator.tsx:price",
        symbols,
        callRelations,
        filePath
      );

      expect(result).toBe(false);
    });

    it("returns false for server-side files", () => {
      const symbols: SymbolNode[] = [];
      const callRelations: GraphRelation[] = [];
      const filePath = "src/api/payment.ts";

      const result = isClientTrustedSource(
        "symbol:src/api/payment.ts:price",
        symbols,
        callRelations,
        filePath
      );

      expect(result).toBe(false);
    });
  });

  describe("flowsToPayment", () => {
    it("detects payment-related symbol", () => {
      const symbols: SymbolNode[] = [];
      const callRelations: GraphRelation[] = [];

      const result = flowsToPayment(
        "symbol:src/payment/calculatePrice.ts:calculateTotal",
        symbols,
        callRelations,
        filePath
      );

      expect(result).toBe(true);
    });

    it("detects flows to payment function", () => {
      const symbols: SymbolNode[] = [
        {
          id: "symbol:src/payment/process.ts:processPayment",
          fileId: "file:src/payment/process.ts",
          name: "processPayment",
          kind: "function",
          exported: true,
          location: { startLine: 1, endLine: 10 },
          evidence: [],
        },
      ];

      const callRelations: GraphRelation[] = [
        {
          id: "relation:src/api.ts:call:1",
          from: "symbol:src/api.ts:handleRequest",
          to: "symbol:src/payment/process.ts:processPayment",
          kind: "calls",
          confidence: 0.7,
          evidence: [],
        },
      ];

      const result = flowsToPayment(
        "symbol:src/api.ts:handleRequest",
        symbols,
        callRelations,
        "src/api.ts"
      );

      expect(result).toBe(true);
    });
  });

  describe("buildDataflowGraph", () => {
    it("builds complete dataflow graph", () => {
      const symbols: SymbolNode[] = [
        {
          id: "symbol:src/payment.ts:calculate",
          fileId: "file:src/payment.ts",
          name: "calculate",
          kind: "function",
          exported: true,
          location: { startLine: 5, endLine: 10 },
          evidence: [],
        },
      ];

      const relations: GraphRelation[] = [
        {
          id: "relation:src/payment.ts:call:1",
          from: "symbol:src/payment.ts:calculate",
          to: "symbol:src/utils.ts:helper",
          kind: "calls",
          confidence: 0.7,
          evidence: [],
        },
      ];

      const graph = buildDataflowGraph(symbols, relations, filePath);

      expect(graph.nodes.length).toBe(1);
      expect(graph.nodes[0].kind).toBe("return");
      expect(graph.relations.length).toBe(1);
      expect(graph.relations[0].kind).toBe("flows_to");
    });

    it("returns empty graph when no calls", () => {
      const symbols: SymbolNode[] = [];
      const relations: GraphRelation[] = [];

      const graph = buildDataflowGraph(symbols, relations, filePath);

      expect(graph.nodes.length).toBe(0);
      expect(graph.relations.length).toBe(0);
    });
  });
});