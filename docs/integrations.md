# code-to-gate Integration Contracts

**バージョン**: v1alpha1  
**作成日**: 2026-04-29  
**対象**: `agent-gatefield`、`agent-state-gate`、`manual-bb-test-harness`、`workflow-cookbook`

---

## 1. 原則

code-to-gate は既存 4 repo の正本領域を再実装しない。

提供するもの:

- コード由来の findings
- risk seeds
- invariant seeds
- test seeds
- release readiness summary
- audit metadata
- artifact hash

提供しないもの:

- AI artifact の最終 pass / hold / block
- agent run の approval / freshness
- manual black-box test case の最終設計
- Task Seed / Acceptance / Evidence 運用そのもの

---

## 2. `agent-gatefield` Export

### 2.1 ファイル

`.qh/gatefield-static-result.json`

### 2.2 目的

Gatefield の `static gate result` として、コード解析由来の危険信号を渡す。

### 2.3 Payload

```ts
export interface GatefieldStaticResult {
  version: "ctg.gatefield/v1alpha1";
  producer: "code-to-gate";
  run_id: string;
  artifact_hash: string;
  repo: {
    root: string;
    revision?: string;
    branch?: string;
  };
  status: "passed" | "warning" | "blocked_input" | "failed";
  summary: string;
  signals: Array<{
    id: string;
    kind: "sast" | "secret" | "quality" | "test_gap" | "release_risk";
    severity: "low" | "medium" | "high" | "critical";
    confidence: number;
    finding_id: string;
    evidence: string[];
  }>;
  non_binding_gate_hint: "pass" | "hold" | "block";
}
```

### 2.4 責務境界

code-to-gate:

- static result を生成する。
- severity / confidence / evidence を渡す。
- `non_binding_gate_hint` は非拘束の hint として出す。Gatefield の最終判定ではない。

agent-gatefield:

- 最終 DecisionPacket を作る。
- Judgment KB 類似度を評価する。
- `pass` / `hold` / `block` を決める。

---

## 3. `agent-state-gate` Export

### 3.1 ファイル

`.qh/state-gate-evidence.json`

### 3.2 目的

State Gate の Assessment に入れる evidence summary を渡す。

### 3.3 Payload

```ts
export interface StateGateEvidence {
  version: "ctg.state-gate/v1alpha1";
  producer: "code-to-gate";
  run_id: string;
  artifact_hash: string;
  release_readiness: {
    status: "passed" | "passed_with_risk" | "needs_review" | "blocked_input" | "failed";
    summary: string;
    failed_conditions: string[];
  };
  evidence_refs: Array<{
    artifact: "findings" | "risk-register" | "invariants" | "test-seeds" | "audit";
    path: string;
    hash: string;
  }>;
  approval_relevance: {
    requires_human_attention: boolean;
    reasons: string[];
  };
}
```

### 3.4 責務境界

code-to-gate:

- code risk evidence をまとめる。
- human attention が必要そうな理由を hint として出す。

agent-state-gate:

- final verdict へ変換する。
- approval binding / freshness check を行う。
- Human Attention Queue へ積むか決める。

---

## 4. `manual-bb-test-harness` Export

### 4.1 ファイル

`.qh/manual-bb-seed.json`

### 4.2 目的

手動 black-box テスト設計の入力として、コード由来の risk / invariant / changed behavior hint を渡す。

### 4.3 Payload

```ts
export interface ManualBbSeed {
  version: "ctg.manual-bb/v1alpha1";
  producer: "code-to-gate";
  run_id: string;
  scope: {
    repo: string;
    changed_files: string[];
    affected_entrypoints: string[];
  };
  risk_seeds: Array<{
    id: string;
    title: string;
    severity: "low" | "medium" | "high" | "critical";
    evidence: string[];
    suggested_test_intents: Array<"regression" | "boundary" | "negative" | "abuse" | "smoke" | "compatibility">;
  }>;
  invariant_seeds: Array<{
    id: string;
    statement: string;
    confidence: number;
    evidence: string[];
  }>;
  test_seed_refs: string[];
  known_gaps: string[];
}
```

### 4.4 責務境界

code-to-gate:

- code-derived seed を出す。
- evidence と affected entrypoint を渡す。

manual-bb-test-harness:

- coverage model を作る。
- manual test case を設計する。
- effort と Go / No-Go brief を作る。

---

## 5. `workflow-cookbook` Evidence Export

### 5.1 ファイル

`.qh/workflow-evidence.json`

### 5.2 目的

workflow-cookbook の Evidence 運用へ添付できる release evidence bundle を渡す。

### 5.3 Payload

```ts
export interface WorkflowEvidence {
  version: "ctg.workflow-evidence/v1alpha1";
  producer: "code-to-gate";
  run_id: string;
  intent_id?: string;
  evidence_type: "release-readiness" | "pr-risk-scan" | "quality-scan";
  subject: {
    repo: string;
    revision?: string;
    branch?: string;
  };
  artifacts: Array<{
    name: string;
    path: string;
    hash: string;
    schema: string;
  }>;
  summary: {
    status: string;
    critical_count: number;
    high_count: number;
    needs_review: boolean;
  };
}
```

### 5.4 責務境界

code-to-gate:

- evidence bundle を生成する。
- artifact refs と hash を提供する。

workflow-cookbook:

- Evidence 正本の構造を定義する。
- Task Seed / Acceptance / CI pattern へ接続する。

---

## 6. Schema Validation

v0.1 では次の adapter schema を提供する。

- `schemas/integrations/gatefield-static-result.schema.json`
- `schemas/integrations/state-gate-evidence.schema.json`
- `schemas/integrations/manual-bb-seed.schema.json`
- `schemas/integrations/workflow-evidence.schema.json`

受入条件:

- `code-to-gate export <target>` が生成する payload は schema validation を通る。
- export failure は exit code `9`。
- downstream repo の schema が変わった場合、code-to-gate 側は adapter version を上げる。

---

## 7. 互換性方針

- adapter payload の field 追加は minor compatible とする。
- enum 値追加は downstream が unknown を許容する場合のみ compatible とする。
- field 削除、型変更、意味変更は incompatible とする。
- incompatible change は `v1alpha2` 以上へ上げる。
