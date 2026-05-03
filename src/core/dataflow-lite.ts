/**
 * Dataflow-lite: Simple data flow analysis module
 *
 * Provides:
 * - Variable assignment tracking
 * - Function argument flow
 * - Return value flow
 * - Conditional branch flow (if/else/switch)
 * - Field/member access tracking
 * - Call chain tracking (multi-hop)
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
 * Dataflow node kinds (extended for full analysis)
 */
export type DataflowNodeKind =
  | "assign"      // Variable assignment
  | "param"       // Function parameter
  | "return"      // Return value
  | "branch"      // Conditional branch (if/else)
  | "member"      // Field/member access
  | "call_chain"  // Multi-hop call chain
  | "merge"       // Branch merge point
  | "loop"        // Loop iteration
  | "closure"     // Closure capture;

/**
 * Branch information for conditional dataflow
 */
export interface BranchInfo {
  condition: string;
  branches: string[];  // Branch target IDs
  mergePoint?: string; // Where branches converge
}

/**
 * Extended dataflow node with branch info
 */
export interface ExtendedDataflowNode extends DataflowNode {
  branchInfo?: BranchInfo;
  callChain?: string[];  // Ordered list of call IDs in chain
  capturedVars?: string[]; // Variables captured by closure
}

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

/**
 * Extract conditional branch dataflow
 * Used for tracking data flow through if/else/switch statements
 */
export function extractBranchDataflow(
  conditionExpr: string,
  branchTargets: string[],
  mergePoint: string | undefined,
  filePath: string,
  startLine: number,
  endLine: number
): ExtendedDataflowNode {
  return {
    id: `df:${sha256(`${filePath}:${conditionExpr}:branch`).slice(0, 8)}`,
    kind: "branch",
    source: conditionExpr,
    target: mergePoint || "",
    filePath,
    location: { startLine, endLine },
    evidence: [
      {
        id: `ev-df-branch-${sha256(`${filePath}:${startLine}`).slice(0, 8)}`,
        path: filePath,
        startLine,
        endLine,
        kind: "ast",
        excerptHash: sha256(`${filePath}:${startLine}-${endLine}`),
      },
    ],
    branchInfo: {
      condition: conditionExpr,
      branches: branchTargets,
      mergePoint,
    },
  };
}

/**
 * Extract field/member access dataflow
 * Used for tracking obj.field access patterns
 */
export function extractMemberAccessDataflow(
  objectId: string,
  fieldName: string,
  filePath: string,
  startLine: number,
  endLine: number
): ExtendedDataflowNode {
  return {
    id: `df:${sha256(`${filePath}:${objectId}.${fieldName}:member`).slice(0, 8)}`,
    kind: "member",
    source: objectId,
    target: `${objectId}.${fieldName}`,
    filePath,
    location: { startLine, endLine },
    evidence: [
      {
        id: `ev-df-member-${sha256(`${filePath}:${objectId}.${fieldName}`).slice(0, 8)}`,
        path: filePath,
        startLine,
        endLine,
        kind: "ast",
        excerptHash: sha256(`${filePath}:${startLine}-${endLine}`),
        symbolId: objectId,
      },
    ],
  };
}

/**
 * Extract call chain dataflow (multi-hop)
 * Used for tracking data through multiple function calls
 * Example: userInput -> sanitize() -> validate() -> process()
 */
export function extractCallChainDataflow(
  chainSymbols: string[], // Ordered list of symbol IDs in the call chain
  filePath: string,
  startLine: number,
  endLine: number
): ExtendedDataflowNode {
  const chainId = chainSymbols.join("->");
  return {
    id: `df:${sha256(`${filePath}:${chainId}:chain`).slice(0, 8)}`,
    kind: "call_chain",
    source: chainSymbols[0] || "",
    target: chainSymbols[chainSymbols.length - 1] || "",
    filePath,
    location: { startLine, endLine },
    evidence: [
      {
        id: `ev-df-chain-${sha256(`${filePath}:${chainId}`).slice(0, 8)}`,
        path: filePath,
        startLine,
        endLine,
        kind: "ast",
        excerptHash: sha256(`${filePath}:${startLine}-${endLine}`),
      },
    ],
    callChain: chainSymbols,
  };
}

/**
 * Track call chain from source through multiple hops
 * Enhanced version of trackDataflowChain with better multi-hop tracking
 */
export function trackCallChainFull(
  startSymbolId: string,
  maxHops: number = 5,
  callRelations: GraphRelation[],
  symbols: SymbolNode[],
  filePath: string
): ExtendedDataflowNode[] {
  const chains: ExtendedDataflowNode[] = [];
  const visited = new Set<string>();

  // BFS to find all reachable symbols within maxHops
  const hopQueue: Array<{ symbolId: string; path: string[]; hops: number }> = [
    { symbolId: startSymbolId, path: [startSymbolId], hops: 0 }
  ];

  while (hopQueue.length > 0) {
    const current = hopQueue.shift() || { symbolId: "", path: [], hops: 0 };

    if (visited.has(current.symbolId) || current.hops >= maxHops) continue;
    visited.add(current.symbolId);

    // Find calls from current symbol
    const outgoingCalls = callRelations.filter(
      r => r.from === current.symbolId && r.kind === "calls"
    );

    for (const call of outgoingCalls) {
      const newPath = [...current.path, call.to];

      // Create call chain node if path > 1
      if (newPath.length > 1) {
        const targetSymbol = symbols.find(s => s.id === call.to);
        if (targetSymbol) {
          chains.push(extractCallChainDataflow(
            newPath,
            filePath,
            targetSymbol.location?.startLine || 1,
            targetSymbol.location?.endLine || 1
          ));
        }
      }

      // Continue BFS
      if (!visited.has(call.to)) {
        hopQueue.push({
          symbolId: call.to,
          path: newPath,
          hops: current.hops + 1,
        });
      }
    }
  }

  return chains;
}

/**
 * Check if data flows through validation/sanitization
 * Used for determining if user input is properly handled
 */
export function flowsThroughValidation(
  startSymbolId: string,
  callRelations: GraphRelation[],
  symbols: SymbolNode[],
  filePath: string
): boolean {
  const validationPatterns = ["validate", "sanitize", "check", "verify", "assert", "escape", "encode"];

  const chains = trackCallChainFull(startSymbolId, 10, callRelations, symbols, filePath);

  for (const chain of chains) {
    const callChain = chain.callChain || [];
    for (const symbolId of callChain) {
      const symbolName = symbolId.split(":").pop() || "";
      if (validationPatterns.some(p => symbolName.toLowerCase().includes(p))) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Build complete dataflow graph with extended analysis
 * Includes branches, member access, and call chains
 */
export function buildDataflowGraphFull(
  symbols: SymbolNode[],
  relations: GraphRelation[],
  filePath: string,
  options: { maxCallHops?: number; trackBranches?: boolean; trackMembers?: boolean } = {}
): DataflowGraph {
  const nodes: DataflowNode[] = [];
  const dfRelations: DataflowRelation[] = [];
  const maxHops = options.maxCallHops ?? 5;

  const callRelations = relations.filter(r => r.kind === "calls");

  // 1. Basic call-based dataflow
  for (const call of callRelations) {
    const callerSymbol = symbols.find(s => s.id === call.from);
    if (!callerSymbol) continue;

    const returnNode = extractReturnDataflow(
      call.from,
      call.to,
      filePath,
      callerSymbol.location?.startLine || 1,
      callerSymbol.location?.endLine || 1
    );
    nodes.push(returnNode);

    dfRelations.push(createDataflowRelation(call.to, call.from, filePath, call.confidence));
  }

  // 2. Call chain tracking
  const functionSymbols = symbols.filter(s => s.kind === "function" || s.kind === "method");
  for (const func of functionSymbols) {
    const chains = trackCallChainFull(func.id, maxHops, callRelations, symbols, filePath);
    for (const chain of chains) {
      nodes.push(chain);

      // Create relations between chain elements
      const callChain = chain.callChain || [];
      for (let i = 0; i < callChain.length - 1; i++) {
        dfRelations.push(createDataflowRelation(
          callChain[i],
          callChain[i + 1],
          filePath,
          0.7 // Chain confidence
        ));
      }
    }
  }

  // 3. Member access tracking (if enabled)
  if (options.trackMembers) {
    const memberRelations = relations.filter(r => r.kind === "accesses");
    for (const member of memberRelations) {
      const sourceSymbol = symbols.find(s => s.id === member.from);
      if (!sourceSymbol) continue;

      const memberName = member.to.split(".").pop() || "";
      const memberNode = extractMemberAccessDataflow(
        member.from,
        memberName,
        filePath,
        sourceSymbol.location?.startLine || 1,
        sourceSymbol.location?.endLine || 1
      );
      nodes.push(memberNode);

      dfRelations.push(createDataflowRelation(member.from, member.to, filePath, member.confidence));
    }
  }

  return {
    nodes,
    relations: dfRelations,
  };
}