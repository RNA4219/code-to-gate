/**
 * Dataflow-lite: Simple data flow analysis module
 *
 * Provides:
 * - Variable assignment tracking
 * - Function argument flow
 * - Return value flow
 *
 * Used for:
 * - CLIENT_TRUSTED_PRICE detection accuracy
 * - Raw SQL detection accuracy
 * - Blast radius estimation accuracy
 */

import type { DataflowNode, DataflowRelation, DataflowGraph, EvidenceRef, SymbolNode, GraphRelation } from "../types/graph.js";
import { sha256 } from "./path-utils.js";

export type { DataflowNode, DataflowRelation, DataflowGraph };

/**
 * Extract dataflow from symbol assignments
 */
export function extractAssignDataflow(
  symbolId: string,
  filePath: string,
  startLine: number,
  endLine: number,
  sourceValue: string
): DataflowNode {
  return {
    id: `df:${sha256(`${filePath}:${symbolId}:assign`).slice(0, 8)}`,
    kind: "assign",
    source: sourceValue,
    target: symbolId,
    filePath,
    location: { startLine, endLine },
    evidence: [
      {
        id: `ev-df-${sha256(`${filePath}:${startLine}`).slice(0, 8)}`,
        path: filePath,
        startLine,
        endLine,
        kind: "ast",
        excerptHash: sha256(`${filePath}:${startLine}-${endLine}`),
        symbolId,
      },
    ],
  };
}

/**
 * Extract dataflow from function parameters
 */
export function extractParamDataflow(
  paramSymbolId: string,
  funcSymbolId: string,
  filePath: string,
  startLine: number,
  endLine: number
): DataflowNode {
  return {
    id: `df:${sha256(`${filePath}:${paramSymbolId}:param`).slice(0, 8)}`,
    kind: "param",
    source: funcSymbolId,
    target: paramSymbolId,
    filePath,
    location: { startLine, endLine },
    evidence: [
      {
        id: `ev-df-param-${sha256(`${filePath}:${paramSymbolId}`).slice(0, 8)}`,
        path: filePath,
        startLine,
        endLine,
        kind: "ast",
        excerptHash: sha256(`${filePath}:${startLine}-${endLine}`),
        symbolId: paramSymbolId,
      },
    ],
  };
}

/**
 * Extract dataflow from return values
 */
export function extractReturnDataflow(
  funcSymbolId: string,
  returnExpr: string,
  filePath: string,
  startLine: number,
  endLine: number
): DataflowNode {
  return {
    id: `df:${sha256(`${filePath}:${funcSymbolId}:return`).slice(0, 8)}`,
    kind: "return",
    source: returnExpr,
    target: funcSymbolId,
    filePath,
    location: { startLine, endLine },
    evidence: [
      {
        id: `ev-df-return-${sha256(`${filePath}:${funcSymbolId}`).slice(0, 8)}`,
        path: filePath,
        startLine,
        endLine,
        kind: "ast",
        excerptHash: sha256(`${filePath}:${startLine}-${endLine}`),
        symbolId: funcSymbolId,
      },
    ],
  };
}

/**
 * Create dataflow relation between nodes
 */
export function createDataflowRelation(
  fromId: string,
  toId: string,
  filePath: string,
  confidence: number = 0.7
): DataflowRelation {
  return {
    id: `dfrel:${sha256(`${fromId}:${toId}`).slice(0, 8)}`,
    from: fromId,
    to: toId,
    kind: "flows_to",
    confidence,
    evidence: [
      {
        id: `ev-dfrel-${sha256(`${fromId}:${toId}`).slice(0, 8)}`,
        path: filePath,
        kind: "ast",
      },
    ],
  };
}

/**
 * Track dataflow from call expression to return value
 * Used for CLIENT_TRUSTED_PRICE: clientPrice = calculatePrice(productId)
 */
export function trackCallToReturn(
  callRelation: GraphRelation,
  symbols: SymbolNode[],
  filePath: string
): DataflowGraph {
  const nodes: DataflowNode[] = [];
  const relations: DataflowRelation[] = [];

  // Find caller symbol
  const callerSymbol = symbols.find(s => s.id === callRelation.from);
  if (!callerSymbol) {
    return { nodes, relations };
  }

  // Create dataflow: call result flows to caller
  const returnNode = extractReturnDataflow(
    callerSymbol.id,
    callRelation.to,
    filePath,
    callerSymbol.location?.startLine || 1,
    callerSymbol.location?.endLine || 1
  );
  nodes.push(returnNode);

  // Create relation: call flows_to caller
  relations.push(createDataflowRelation(
    callRelation.to,
    callerSymbol.id,
    filePath,
    callRelation.confidence
  ));

  return {
    nodes,
    relations,
    sourceSymbolId: callRelation.to,
    targetSymbolId: callerSymbol.id,
  };
}

/**
 * Track dataflow chain from source to sink
 * Used for Raw SQL: userInput -> sanitize -> sqlQuery
 */
export function trackDataflowChain(
  startSymbolId: string,
  endSymbolId: string,
  callRelations: GraphRelation[],
  symbols: SymbolNode[],
  filePath: string
): DataflowGraph {
  const nodes: DataflowNode[] = [];
  const relations: DataflowRelation[] = [];
  const visited = new Set<string>();
  const queue: string[] = [startSymbolId];

  while (queue.length > 0) {
    const currentId = queue.shift() || "";
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    // Find calls from current symbol
    const outgoingCalls = callRelations.filter(r => r.from === currentId && r.kind === "calls");

    for (const call of outgoingCalls) {
      const targetSymbol = symbols.find(s => s.id === call.to);
      if (!targetSymbol) continue;

      // Create dataflow node
      const flowNode = extractAssignDataflow(
        call.to,
        filePath,
        targetSymbol.location?.startLine || 1,
        targetSymbol.location?.endLine || 1,
        currentId
      );
      nodes.push(flowNode);

      // Create relation
      relations.push(createDataflowRelation(currentId, call.to, filePath, call.confidence));

      // Continue chain
      if (!visited.has(call.to)) {
        queue.push(call.to);
      }

      // Check if reached sink
      if (call.to === endSymbolId) {
        return {
          nodes,
          relations,
          sourceSymbolId: startSymbolId,
          targetSymbolId: endSymbolId,
        };
      }
    }
  }

  return {
    nodes,
    relations,
    sourceSymbolId: startSymbolId,
    targetSymbolId: undefined, // not reached
  };
}

/**
 * Detect if symbol is client-trusted (client-side calculation)
 * Heuristic: symbol in client file, no server validation call
 */
export function isClientTrustedSource(
  symbolId: string,
  symbols: SymbolNode[],
  callRelations: GraphRelation[],
  filePath: string
): boolean {
  // Check if file is client-side (component, page, client)
  if (
    filePath.includes("/components/") ||
    filePath.includes("/pages/") ||
    filePath.includes("/client/") ||
    filePath.includes(".client.") ||
    filePath.includes("frontend")
  ) {
    // Check if symbol has no validation calls
    const validationPatterns = ["validate", "sanitize", "check", "verify", "assert"];
    const outgoingCalls = callRelations.filter(r => r.from === symbolId && r.kind === "calls");

    for (const call of outgoingCalls) {
      const targetName = call.to.split(":").pop() || "";
      if (validationPatterns.some(p => targetName.toLowerCase().includes(p))) {
        return false;
      }
    }

    return true;
  }

  return false;
}

/**
 * Detect if symbol flows to payment/price calculation
 * Used for CLIENT_TRUSTED_PRICE rule
 */
export function flowsToPayment(
  symbolId: string,
  symbols: SymbolNode[],
  callRelations: GraphRelation[],
  filePath: string
): boolean {
  const paymentPatterns = ["price", "total", "amount", "payment", "checkout", "order"];

  // Check if symbol name contains payment pattern
  const symbolName = symbolId.split(":").pop() || "";
  if (paymentPatterns.some(p => symbolName.toLowerCase().includes(p))) {
    return true;
  }

  // Check if symbol flows to payment function
  const chain = trackDataflowChain(
    symbolId,
    "", // no specific end
    callRelations,
    symbols,
    filePath
  );

  for (const node of chain.nodes) {
    const targetName = node.target.split(":").pop() || "";
    if (paymentPatterns.some(p => targetName.toLowerCase().includes(p))) {
      return true;
    }
  }

  return false;
}

/**
 * Build complete dataflow graph from symbols and relations
 */
export function buildDataflowGraph(
  symbols: SymbolNode[],
  relations: GraphRelation[],
  filePath: string
): DataflowGraph {
  const nodes: DataflowNode[] = [];
  const dfRelations: DataflowRelation[] = [];

  // Extract call-based dataflow
  const callRelations = relations.filter(r => r.kind === "calls");

  for (const call of callRelations) {
    const callerSymbol = symbols.find(s => s.id === call.from);
    if (!callerSymbol) continue;

    // Create return dataflow node
    const returnNode = extractReturnDataflow(
      call.from,
      call.to,
      filePath,
      callerSymbol.location?.startLine || 1,
      callerSymbol.location?.endLine || 1
    );
    nodes.push(returnNode);

    // Create dataflow relation
    dfRelations.push(createDataflowRelation(call.to, call.from, filePath, call.confidence));
  }

  return {
    nodes,
    relations: dfRelations,
  };
}