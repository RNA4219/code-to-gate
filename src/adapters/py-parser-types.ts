/**
 * Python parser types
 * Shared types for Python file parsing modules
 */

export interface EvidenceRef {
  id: string;
  path: string;
  startLine?: number;
  endLine?: number;
  kind: "ast" | "text" | "import" | "external" | "test" | "coverage" | "diff";
  excerptHash?: string;
  nodeId?: string;
  symbolId?: string;
  externalRef?: {
    tool: string;
    ruleId?: string;
    url?: string;
  };
}

export interface SymbolNode {
  id: string;
  fileId: string;
  name: string;
  kind:
    | "function"
    | "class"
    | "method"
    | "variable"
    | "type"
    | "interface"
    | "route"
    | "test"
    | "unknown";
  exported: boolean;
  async?: boolean;
  location?: {
    startLine: number;
    endLine: number;
  };
  evidence: EvidenceRef[];
}

export interface GraphRelation {
  id: string;
  from: string;
  to: string;
  kind:
    | "imports"
    | "exports"
    | "calls"
    | "references"
    | "tests"
    | "configures"
    | "depends_on";
  confidence: number;
  evidence: EvidenceRef[];
}

export interface ParseResult {
  symbols: SymbolNode[];
  relations: GraphRelation[];
  diagnostics: Array<{
    id: string;
    severity: "info" | "warning" | "error";
    code: string;
    message: string;
    evidence?: EvidenceRef[];
  }>;
  parserStatus: "parsed" | "text_fallback" | "skipped" | "failed";
  parserAdapter: string;
}