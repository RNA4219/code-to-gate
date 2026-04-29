/**
 * Types for NormalizedRepoGraph and related structures
 */

export interface RepoRef {
  root: string;
  revision?: string;
  branch?: string;
  base_ref?: string;
  head_ref?: string;
  dirty?: boolean;
}

export interface ToolRef {
  name: "code-to-gate";
  version: string;
  config_hash?: string;
  policy_id?: string;
  plugin_versions: Array<{
    name: string;
    version: string;
    visibility: "public" | "private";
  }>;
}

export interface RepoFile {
  id: string;
  path: string;
  language: "ts" | "tsx" | "js" | "jsx" | "py" | "unknown";
  role: "source" | "test" | "config" | "fixture" | "docs" | "generated" | "unknown";
  hash: string;
  sizeBytes: number;
  lineCount: number;
  moduleId?: string;
  parser: {
    status: "parsed" | "text_fallback" | "skipped" | "failed";
    adapter?: string;
    errorCode?: string;
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

export interface TestNode {
  id: string;
  path: string;
  framework?: string;
  targetFile?: string;
  targetSymbol?: string;
}

export interface ConfigNode {
  id: string;
  path: string;
  type?: string;
}

export interface EntrypointNode {
  id: string;
  path: string;
  type: "http" | "cli" | "event" | "scheduled" | "export";
  method?: string;
  route?: string;
  symbolId?: string;
}

export interface GraphDiagnostic {
  id: string;
  severity: "info" | "warning" | "error";
  code:
    | "PARSER_FAILED"
    | "UNSUPPORTED_LANGUAGE"
    | "MISSING_FILE"
    | "PARTIAL_GRAPH"
    | "EXTERNAL_IMPORT_FAILED";
  message: string;
  evidence?: EvidenceRef[];
}

export interface GraphStats {
  partial: boolean;
}

export interface NormalizedRepoGraph {
  version: "ctg/v1alpha1";
  generated_at: string;
  run_id: string;
  repo: RepoRef;
  tool: ToolRef;
  artifact: "normalized-repo-graph";
  schema: "normalized-repo-graph@v1";
  files: RepoFile[];
  modules: unknown[];
  symbols: SymbolNode[];
  relations: GraphRelation[];
  tests: TestNode[];
  configs: ConfigNode[];
  entrypoints: EntrypointNode[];
  diagnostics: GraphDiagnostic[];
  stats: GraphStats;
}

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