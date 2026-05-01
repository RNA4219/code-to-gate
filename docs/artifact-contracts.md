# code-to-gate Artifact Contracts

**バージョン**: v1 (stable freeze)  
**作成日**: 2026-04-29  
**更新日**: 2026-04-30 (v1 freeze)  
**適用範囲**: v1.0 以降の machine-readable artifact

---

## 1. 原則

すべての machine-readable artifact は次を満たす。

- top-level に `version` を持つ。
- `version` は `ctg/v1` 形式とする（v1alpha1 は後方互換として受け付ける）。
- top-level に `generated_at`、`run_id`、`repo`、`tool` を持つ。
- evidence 参照は `EvidenceRef` 形式に統一する。
- LLM 生成文は、根拠となる finding / risk / evidence と紐づける。
- schema 破壊変更は `v2` 以上へ上げる。
- field の追加は後方互換変更として許可する。
- field の削除、型変更、enum 値の意味変更は破壊変更とする。

**v1 Stability Guarantees**:
- v1 schemas は後方互換性を保証する
- v1alpha1 artifacts は v1 schemas で validation を通る
- 新規 optional field の追加のみ許可（version bump 不要）
- 12-month deprecation period for v1alpha1 (until 2027-04-30)

---

## 2. 共通ヘッダ

```ts
export interface ArtifactHeader {
  version: "ctg/v1" | "ctg/v1alpha1";  // v1 stable, v1alpha1 backward compatible
  generated_at: string; // ISO 8601
  run_id: string;
  repo: RepoRef;
  tool: ToolRef;
}

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
```

---

## 3. EvidenceRef

```ts
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
```

制約:

- `path` は repo root からの相対パスとする。
- `startLine` と `endLine` は 1-based とする。
- `kind=text` の場合は `excerptHash` を必須とする。
- `kind=external` の場合は `externalRef.tool` を必須とする。
- evidence が指すファイルが存在しない場合、artifact は `partial` として扱う。

---

## 4. NormalizedRepoGraph

### 4.1 目的

`NormalizedRepoGraph` は、言語 adapter の差を吸収し、rule engine、reporter、LLM input builder、downstream exporter が共通に読む repo 構造である。

### 4.2 必須構造

```ts
export interface NormalizedRepoGraph extends ArtifactHeader {
  artifact: "normalized-repo-graph";
  schema: "normalized-repo-graph@v1";
  files: RepoFile[];
  modules: RepoModule[];
  symbols: SymbolNode[];
  relations: GraphRelation[];
  tests: TestNode[];
  configs: ConfigNode[];
  entrypoints: EntrypointNode[];
  diagnostics: GraphDiagnostic[];
  stats: GraphStats;
}
```

### 4.3 RepoFile

```ts
export interface RepoFile {
  id: string;
  path: string;
  language: "ts" | "tsx" | "js" | "jsx" | "py" | "rb" | "go" | "rs" | "java" | "php" | "unknown";
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
```

### 4.4 SymbolNode

```ts
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
```

### 4.5 GraphRelation

```ts
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
```

### 4.6 GraphDiagnostic

```ts
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
```

### 4.7 受入条件

- TS/JS fixture で `files`、`symbols`、`relations`、`entrypoints`、`tests` が生成される。
- evaluator は adapter 固有 AST を直接参照しない。
- `diagnostics` に error がある場合も、可能な限り graph を部分生成する。
- `stats.partial` が true の場合、後続 artifact は `completeness=partial` を継承する。

---

## 5. Findings

```ts
export interface FindingsArtifact extends ArtifactHeader {
  artifact: "findings";
  schema: "findings@v1";
  completeness: "complete" | "partial";
  findings: Finding[];
  unsupported_claims: UnsupportedClaim[];
}

export interface UnsupportedClaim {
  id: string;
  claim: string;
  reason: "missing_evidence" | "unknown_symbol" | "policy_conflict" | "schema_invalid";
  sourceSection: string;
}

export interface Finding {
  id: string;
  ruleId: string;
  category:
    | "auth"
    | "payment"
    | "validation"
    | "data"
    | "config"
    | "maintainability"
    | "testing"
    | "compatibility"
    | "release-risk";
  severity: "low" | "medium" | "high" | "critical";
  confidence: number;
  title: string;
  summary: string;
  evidence: EvidenceRef[];
  affectedSymbols?: string[];
  affectedEntrypoints?: string[];
  tags?: string[];
  upstream?: {
    tool: "native" | "semgrep" | "eslint" | "sonarqube" | "tsc" | "coverage" | "test";
    ruleId?: string;
  };
}
```

制約:

- `confidence` は 0.0 以上 1.0 以下。
- `severity=critical` または `high` の finding は evidence 必須。
- evidence なしの finding は出力してはならない。
- LLM が根拠なしに生成した主張は `unsupported_claims` に隔離する。

---

## 6. RiskSeed

```ts
export interface RiskRegisterArtifact extends ArtifactHeader {
  artifact: "risk-register";
  schema: "risk-register@v1";
  completeness: "complete" | "partial";
  risks: RiskSeed[];
}

export interface RiskSeed {
  id: string;
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  likelihood: "low" | "medium" | "high" | "unknown";
  impact: string[];
  confidence: number;
  sourceFindingIds: string[];
  evidence: EvidenceRef[];
  narrative?: string;
  recommendedActions: string[];
}
```

制約:

- `sourceFindingIds` または `evidence` のどちらか一方は必須ではなく、両方必須とする。
- `narrative` は LLM 生成可。ただし source finding を参照する。
- `recommendedActions` は少なくとも 1 件。

---

## 7. InvariantSeed

```ts
export interface InvariantsArtifact extends ArtifactHeader {
  artifact: "invariants";
  schema: "invariants@v1";
  completeness: "complete" | "partial";
  invariants: InvariantSeed[];
}

export interface InvariantSeed {
  id: string;
  statement: string;
  kind: "business" | "technical" | "security" | "data" | "api";
  confidence: number;
  sourceFindingIds: string[];
  evidence: EvidenceRef[];
  rationale?: string;
  tags?: string[];
}
```

制約:

- invariant は候補であり、業務仕様の正本ではない。
- `confidence < 0.6` の invariant は `low_confidence` tag を付ける。
- downstream の手動確認が必要な場合は `needs_human_confirmation` tag を付ける。

---

## 8. TestSeed

```ts
export interface TestSeedsArtifact extends ArtifactHeader {
  artifact: "test-seeds";
  schema: "test-seeds@v1";
  completeness: "complete" | "partial";
  seeds: TestSeed[];
}

export interface TestSeed {
  id: string;
  title: string;
  intent: "regression" | "boundary" | "negative" | "abuse" | "smoke" | "compatibility";
  sourceRiskIds: string[];
  sourceFindingIds: string[];
  evidence: EvidenceRef[];
  suggestedLevel: "unit" | "integration" | "e2e" | "manual" | "exploratory";
  notes?: string;
}
```

制約:

- code-to-gate の `TestSeed` は最終テストケースではない。
- manual black-box の最終設計は `manual-bb-test-harness` に渡す。
- `sourceRiskIds` または `sourceFindingIds` の少なくとも一方を必須とする。

---

## 9. ReleaseReadiness

```ts
export interface ReleaseReadinessArtifact extends ArtifactHeader {
  artifact: "release-readiness";
  schema: "release-readiness@v1";
  status: ReleaseReadinessStatus;
  completeness: "complete" | "partial";
  summary: string;
  counts: {
    findings: number;
    critical: number;
    high: number;
    risks: number;
    testSeeds: number;
    unsupportedClaims: number;
  };
  failedConditions: FailedCondition[];
  recommendedActions: string[];
  artifactRefs: {
    graph?: string;
    findings?: string;
    riskRegister?: string;
    invariants?: string;
    testSeeds?: string;
    audit?: string;
  };
}

export interface FailedCondition {
  id: string;
  reason: string;
  matchedFindingIds?: string[];
  matchedRiskIds?: string[];
}

export type ReleaseReadinessStatus =
  | "passed"
  | "passed_with_risk"
  | "needs_review"
  | "blocked_input"
  | "failed";
```

### 9.1 Status 定義

| status | 意味 | CLI exit code |
|---|---|---:|
| `passed` | policy 上の blocking 条件なし。artifact は complete | 0 |
| `passed_with_risk` | blocking 条件はないが high risk または partial warning がある | 0 |
| `needs_review` | 自動判断では進められず、人間確認が必要 | 1 |
| `blocked_input` | release 判断材料として blocking 条件を満たした | 1 |
| `failed` | tool 実行自体が失敗し、readiness 判断不能 | 2 以上 |

### 9.2 Status 決定規則

- `critical` finding が未 suppression なら `blocked_input`。
- policy で指定された category threshold を超えたら `blocked_input`。
- evidence 不足、LLM unsupported claim、partial graph が policy 閾値を超えたら `needs_review`。
- LLM が失敗しても deterministic findings が complete なら `needs_review`。
- parser / plugin / schema validation が致命的に失敗したら `failed`。
- `passed` と `passed_with_risk` は後続 gate の最終 pass を意味しない。

---

## 10. Audit

```ts
export interface AuditArtifact extends ArtifactHeader {
  artifact: "audit";
  schema: "audit@v1";
  inputs: Array<{
    path: string;
    hash: string;
    kind: "source" | "config" | "policy" | "external-result";
  }>;
  llm?: {
    provider: string;
    model: string;
    prompt_version: string;
    request_hash: string;
    response_hash: string;
    redaction_enabled: boolean;
  };
  policy: {
    id: string;
    hash: string;
  };
  exit: {
    code: number;
    status: string;
    reason: string;
  };
}
```

---

## 11. JSON Schema 方針

v0.1 では、上記 TypeScript 契約をもとに `schemas/*.schema.json` を生成または手書きする。

必須 schema:

- `schemas/normalized-repo-graph.schema.json`
- `schemas/findings.schema.json`
- `schemas/risk-register.schema.json`
- `schemas/invariants.schema.json`
- `schemas/test-seeds.schema.json`
- `schemas/release-readiness.schema.json`
- `schemas/audit.schema.json`

受入条件:

- すべての v0.1 fixture artifact が schema validation を通る。
- schema validation failure は exit code `7` とする。
