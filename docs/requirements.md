# code-to-gate 要件定義書

> **注意**: この文書は v0.1 MVP の要件定義です。v0.1 MVP は要件定義検収 GO です。プロダクトレベル(v1.0)の要件定義は `docs/product-requirements-v1.md` を参照してください。

**バージョン**: v0.1  
**作成日**: 2026-04-29  
**製品名**: code-to-gate / quality-harness  
**ライセンス**: MIT  

---

## 0. 要件セットの構成

この要件定義は、実装・検収・連携で使えるように、次の文書を正本セットとして扱う。

| 文書 | 役割 |
|---|---|
| `docs/requirements.md` | 製品定義、スコープ、機能要件、非機能要件、責務境界 |
| `docs/artifact-contracts.md` | `NormalizedRepoGraph`、各 artifact、status、schema 互換性の契約 |
| `docs/error-model.md` | CLI exit code、失敗分類、部分成功、degraded behavior |
| `docs/llm-trust-model.md` | LLM 利用範囲、失敗時挙動、低 confidence、evidence 不足時の仕様 |
| `docs/acceptance-v0.1.md` | v0.1 の executable acceptance、fixtures、検収コマンド |
| `docs/integrations.md` | 既存 4 repo との adapter schema と責務境界 |
| `docs/plugin-security-contract.md` | private plugin と OSS core の安全境界 |
| `docs/implementation-plan-v0.1.md` | Shipyard-cp 型の plan / dev / acceptance / integrate 実装分解 |
| `docs/fixture-spec-v0.1.md` | synthetic fixture の実装仕様 |
| `schemas/*.schema.json` | core artifact の JSON Schema |
| `schemas/integrations/*.schema.json` | downstream adapter payload の JSON Schema |

`requirements.md` に書く内容は「外から見える要求」と「製品境界」に限る。型の詳細、exit code、受入ケース、adapter payload は上記の契約文書で固定する。

---

## 1. 製品定義

### 1.1 一文定義

**code-to-gate は、アプリケーションコード、変更差分、静的解析結果、テスト証跡を入力にして、コード由来の品質リスク、影響範囲、追加テスト観点、リリース判断材料を証拠付き artifact として生成するローカルファーストの品質ハーネスである。**

### 1.2 何ではないか

code-to-gate は、次の領域を主責務にしない。

| 領域 | 正本 repo | code-to-gate の扱い |
|---|---|---|
| AI エージェント成果物の pass / hold / block 判定 | `agent-gatefield` | 必要なら解析 artifact を `static gate result` として渡す |
| エージェント実行状態、approval、context freshness、Human Attention Queue | `agent-state-gate` | 必要なら release / risk artifact を evidence として渡す |
| 手動ブラックボックステスト設計の最終成果物 | `manual-bb-test-harness` | コード由来の risk / invariant / coverage hint を入力として渡す |
| ワークフロー、Task Seed、Acceptance、Evidence 運用の正本 | `workflow-cookbook` | Evidence 形式、CI 再利用、acceptance 連携の参照先とする |

### 1.3 差別化

code-to-gate の主戦場は、**コード構造と変更差分から、リリース前に見るべき品質リスクを抽出し、証拠付きで downstream tool に渡せる形にすること**である。

既存 repo との棲み分けは次の通り。

- `agent-gatefield`: 「AI が作った成果物を通してよいか」を判定する。
- `agent-state-gate`: 「エージェント作業を運用上進めてよいか」を統合評価する。
- `manual-bb-test-harness`: 「人間が行う black-box テスト設計」を作る。
- `workflow-cookbook`: 「作業・証跡・受入・CI の運用パターン」を定義する。
- `code-to-gate`: 「コードそのものと差分から、品質リスクと検証材料を生成する」。

---

## 2. 対象ユーザーと利用シーン

### 2.1 Primary Users

| ユーザー | 欲しいもの | code-to-gate の価値 |
|---|---|---|
| 開発者 | PR 前に危険箇所と追加テストを知りたい | 差分中心の risk / test hint を出す |
| レビュアー | 変更影響と根拠行を短時間で把握したい | evidence 付き finding と dependency graph を出す |
| QA / SET | コード変更から確認観点を得たい | manual-bb-test-harness に渡せる risk seed を出す |
| Tech Lead | リリース判断材料を残したい | release readiness bundle を生成する |

### 2.2 Primary Use Cases

1. **PR Risk Scan**
   - 変更差分を解析し、危険な変更、影響範囲、確認すべきテスト観点を出す。

2. **Release Readiness Bundle**
   - リリース前に `risk-register`、`findings`、`coverage gaps`、`release-gate input`、`audit metadata` をまとめて出す。

3. **Static Analysis Aggregation**
   - ESLint、Semgrep、TypeScript diagnostics、coverage、test results を正規化して、コード由来の品質証跡として統合する。

4. **Downstream Gate Integration**
   - `agent-gatefield` / `agent-state-gate` に渡せる機械可読 artifact を出す。

5. **Manual QA Seed Generation**
   - `manual-bb-test-harness` が使える、コード根拠付きの risk seed / invariant seed / changed behavior hint を出す。

---

## 3. スコープ

### 3.1 In Scope

- TypeScript / JavaScript の repo scan
- Python adapter
- fallback text adapter
- AST / import / export / symbol / call / test file 抽出
- changed files / PR diff 解析
- dependency graph / blast radius 推定
- core smell rules
- external tool importer
- normalized findings
- risk register
- invariant candidates
- coverage gap hints
- test seed artifact
- release readiness bundle
- policy-based release gate input
- Markdown / JSON / YAML / Mermaid / SARIF / HTML 出力
- LLM による要約、risk narrative、推奨アクション、test seed 補強
- private plugin / private policy / private rulepack 分離
- CI / PR comment / GitHub Checks 連携
- workflow-cookbook Evidence 互換 export
- agent-gatefield / agent-state-gate 連携 adapter
- manual-bb-test-harness 連携 adapter

### 3.2 Out of Scope

- AI エージェント成果物の最終 pass / hold / block 判定
- エージェント実行状態の approval / freshness / human queue 管理
- 手動 black-box テストケースの最終設計
- Task Seed や Acceptance 運用そのもの
- company-specific rule を OSS core に含めること
- 社内 repo の解析結果を public fixtures に含めること
- 本番無人リリース承認の最終権限

---

## 4. 成果物モデル

### 4.1 第一級成果物

code-to-gate は次の artifact を生成する。

| ファイル | 目的 | 主な消費者 |
|---|---|---|
| `.qh/repo-graph.json` | コード構造、依存、symbol、entrypoint | code-to-gate 内部、reviewer |
| `.qh/dependency.mmd` | 依存関係の軽量可視化 | reviewer |
| `.qh/findings.json` | 正規化 finding | CI、agent-gatefield、agent-state-gate |
| `.qh/risk-register.yaml` | コード由来リスク台帳 | reviewer、Tech Lead |
| `.qh/invariants.yaml` | 推定不変条件候補 | QA、manual-bb-test-harness |
| `.qh/test-seeds.json` | black-box / gray-box テスト設計の入力 seed | manual-bb-test-harness |
| `.qh/release-readiness.json` | release 判断材料 bundle | agent-state-gate、CI |
| `.qh/analysis-report.md` | 人間向け要約 | 開発者、レビュアー |
| `.qh/audit.json` | run metadata / policy / plugin / model 情報 | 監査、再現 |
| `.qh/results.sarif` | code scanning 連携 | GitHub / CI |

### 4.2 Downstream 連携成果物

| 出力 | 用途 |
|---|---|
| `gatefield-static-result.json` | `agent-gatefield` の static gate result として渡す |
| `state-gate-evidence.json` | `agent-state-gate` の evidence summary として渡す |
| `manual-bb-seed.json` | `manual-bb-test-harness` の入力として渡す |
| `workflow-evidence.json` | `workflow-cookbook` Evidence として保存する |

---

## 5. 信頼モデル

### 5.1 LLM の責務

LLM は必須コンポーネントだが、無制約な最終判定者にはしない。

LLM が担うもの:

- analysis summary
- risk narrative
- invariant candidate の説明
- recommended actions
- test seed の補強
- PR comment draft
- release note draft

LLM が単独で決めないもの:

- finding の evidence
- gate status
- severity threshold
- policy violation
- suppression の有効性

### 5.2 機械判定の責務

次の判定は deterministic component が担う。

- AST / import / symbol extraction
- rule matching
- external tool result normalization
- policy threshold evaluation
- evidence reference validation
- schema validation
- artifact hash generation

### 5.3 Evidence 原則

- すべての finding は少なくとも 1 つの evidence を持つ。
- LLM 生成の risk / invariant / test seed は、元 finding または evidence に紐づく。
- evidence のない LLM 主張は `unsupported_claims` に隔離する。
- public fixtures は synthetic repo のみを使う。
- private code / private result / company-specific rule は OSS core に含めない。

---

## 6. 機能要件

### 6.1 P0: Local Release Readiness MVP

| ID | 要求 | 内容 | 受入基準 |
|---|---|---|---|
| F001 | Repo scan | directory / file / config / test / CI ファイルを抽出 | `.qh/repo-graph.json` を生成できる |
| F002 | TS/JS adapter | import / export / symbol / entrypoint / test を抽出 | synthetic fixture で golden と一致する |
| F003 | NormalizedRepoGraph | 言語差を吸収する共通 IR | evaluator / reporter が共通入力を受ける |
| F004 | Dependency graph | file / module / symbol 依存を抽出 | JSON と Mermaid を出力できる |
| F005 | Core findings | ルール駆動で finding を生成 | severity / confidence / evidence を持つ |
| F006 | LLM narrative | summary / risk narrative / recommendation を生成 | evidence 参照付きで出力される |
| F007 | Risk register | コード由来リスクを YAML 化 | risk が finding / evidence に紐づく |
| F008 | Invariant candidates | 業務・技術的不変条件候補を生成 | confidence / rationale / evidence を持つ |
| F009 | Test seeds | QA 設計用の seed を生成 | `manual-bb-seed.json` に出力できる |
| F010 | Release readiness | release 判断材料を bundle 化 | `release-readiness.json` を生成できる |
| F011 | Policy evaluation | severity / confidence / category threshold を評価 | `passed` / `needs_review` / `blocked_input` を出せる |
| F012 | Private plugin seam | private rulepack を OSS core 外に分離 | OSS core に company rule が残らない |
| F013 | Audit metadata | run / revision / policy / plugin / model を記録 | `.qh/audit.json` に出力できる |

### 6.2 P1: PR / CI Integration

| ID | 要求 | 内容 | 受入基準 |
|---|---|---|---|
| F101 | Diff mode | changed files 中心に再解析 | PR差分だけで readiness bundle を出せる |
| F102 | Blast radius | 変更影響範囲を推定 | affected files / tests / entrypoints を出せる |
| F103 | External import | ESLint / Semgrep / TypeScript / coverage / test result を取り込む | findings へ正規化できる |
| F104 | SARIF export | CI / code scanning 連携 | `results.sarif` を生成できる |
| F105 | GitHub PR output | PR comment / Checks summary | release readiness summary を PR に出せる |
| F106 | Suppression | allowlist / suppression / expiry | 期限切れ suppression を失敗扱いにできる |
| F107 | HTML report | 静的 viewer | `.qh/report.html` を生成できる |
| F108 | agent-gatefield adapter | static gate result を出力 | Gatefield が consume できる JSON を生成 |
| F109 | agent-state-gate adapter | evidence summary を出力 | State Gate が consume できる JSON を生成 |
| F110 | manual-bb adapter | manual test seed を出力 | manual-bb-test-harness 入力 schema に合う |
| F111 | workflow evidence export | workflow-cookbook Evidence 形式に寄せる | Evidence artifact として保存可能 |

### 6.3 P2: Platform Expansion

| ID | 要求 | 内容 | 受入基準 |
|---|---|---|---|
| F201 | Python adapter | Python import / function / class / test 抽出 | Python fixture で golden と一致 |
| F202 | Monorepo support | package boundary / workspace / app boundary | package 単位の graph を出せる |
| F203 | Local LLM | ollama / llama.cpp 対応 | 外部 API なしで LLM artifact を生成 |
| F204 | Cloud LLM | OpenAI / Anthropic / Alibaba / OpenRouter 対応 | provider 切替が可能 |
| F205 | Redaction | LLM 送信前の秘匿化 | configured patterns が送信 payload から除去される |
| F206 | Incremental cache | graph / findings の再利用 | changed files 中心に高速化できる |
| F207 | Web UI | report viewer / graph viewer / finding explorer | CLI artifact を読み込んで閲覧できる |
| F208 | Plugin SDK | language / rule / importer / reporter plugin | manifest と contract test を提供 |
| F209 | Quality dimensions | maintainability / testability / security / release risk | 総合点ではなく次元別に出す |
| F210 | Historical comparison | 前回 run との差分 | new / resolved / unchanged risk を出せる |

---

## 7. コアルール

### 7.1 v0.1 Core Rules

| ID | ルール名 | カテゴリ | 検出元 |
|---|---|---|---|
| R001 | CLIENT_TRUSTED_PRICE | payment | AST / dataflow-lite |
| R002 | MISSING_SERVER_VALIDATION | validation | AST / route handler |
| R003 | WEAK_AUTH_GUARD | auth | AST / config / route |
| R004 | TRY_CATCH_SWALLOW | maintainability | AST |
| R005 | RAW_SQL | data | AST / text |
| R006 | UNSAFE_DELETE | data | AST |
| R007 | UNTESTED_CRITICAL_PATH | testing | graph / test mapping |
| R008 | ENV_DIRECT_ACCESS | config | AST |
| R009 | WRAPPER_ONLY_FUNCTION | maintainability | AST |
| R010 | LARGE_MODULE | maintainability | metrics |
| R011 | HIGH_FANOUT_CHANGE | release-risk | graph / diff |
| R012 | PUBLIC_API_BEHAVIOR_CHANGE | compatibility | graph / diff |

### 7.2 Rule Non-goals

- Gatefield の taboo / accept / reject KB 類似度判定を再実装しない。
- State Gate の approval freshness 判定を再実装しない。
- manual-bb-test-harness の coverage model を再実装しない。
- workflow-cookbook の acceptance / Task Seed 運用を再実装しない。

---

## 8. インターフェース

### 8.1 CLI

| コマンド | 役割 | 例 |
|---|---|---|
| `code-to-gate scan` | repo graph を生成 | `code-to-gate scan ./repo --out .qh` |
| `code-to-gate analyze` | scan + rules + LLM + reports | `code-to-gate analyze ./repo --emit all --out .qh` |
| `code-to-gate diff` | PR / changed files 解析 | `code-to-gate diff ./repo --base main --head HEAD --out .qh` |
| `code-to-gate import` | 外部ツール成果物を取り込む | `code-to-gate import semgrep semgrep.json --out .qh/imports` |
| `code-to-gate readiness` | release readiness bundle を生成 | `code-to-gate readiness ./repo --policy policy.yaml --out .qh` |
| `code-to-gate export` | downstream 連携形式へ変換 | `code-to-gate export gatefield --from .qh --out gatefield-static-result.json` |
| `code-to-gate plugin` | plugin doctor / list / validate | `code-to-gate plugin doctor` |
| `code-to-gate fixture` | synthetic fixture 検証 | `code-to-gate fixture run demo-shop-ts` |

### 8.2 Library API

```ts
import { analyzeRepo } from "@code-to-gate/core";

const result = await analyzeRepo({
  repoPath: "./repo",
  mode: "diff",
  baseRef: "main",
  headRef: "HEAD",
  formats: ["json", "yaml", "md", "mermaid", "sarif"],
  plugins: [
    "@code-to-gate/lang-ts",
    "@code-to-gate/rules-core",
    "file:../private-rules"
  ],
  llm: {
    provider: "openai",
    model: "gpt-4.1",
    apiKey: process.env.OPENAI_API_KEY
  },
  policyPath: "./policy.yaml",
  exportTargets: ["gatefield", "state-gate", "manual-bb", "workflow-evidence"]
});
```

### 8.3 Plugin Manifest

```yaml
apiVersion: ctg/v1alpha1
kind: rule-plugin
name: private-order-rules
version: 0.1.0
visibility: private
entry:
  command: ["node", "./dist/index.js"]
capabilities:
  - evaluate
receives:
  - normalized-repo-graph@v1
  - imported-findings@v1
returns:
  - findings@v1
  - risk-seeds@v1
languages:
  - ts
  - tsx
  - js
  - jsx
```

---

## 9. 最小データ型

この章は要件定義上の概略を示す。実装時の正本は `docs/artifact-contracts.md` とし、JSON Schema は `schemas/*.schema.json` に置く。

```ts
export interface EvidenceRef {
  path: string;
  startLine?: number;
  endLine?: number;
  kind: "ast" | "text" | "import" | "external" | "test" | "coverage" | "diff";
  excerptHash?: string;
  symbolId?: string;
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

export interface RiskSeed {
  id: string;
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  likelihood?: "low" | "medium" | "high";
  impact?: string[];
  confidence: number;
  sourceFindingIds: string[];
  evidence: EvidenceRef[];
  recommendedActions?: string[];
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

export interface ReleaseReadiness {
  version: "ctg/v1alpha1";
  status: "passed" | "passed_with_risk" | "needs_review" | "blocked_input" | "failed";
  repoRevision: string;
  policyId: string;
  summary: string;
  findingIds: string[];
  riskIds: string[];
  testSeedIds: string[];
  failedConditions: Array<{
    id: string;
    reason: string;
    matchedFindingIds?: string[];
    matchedRiskIds?: string[];
  }>;
  downstreamHints?: {
    gatefield?: string;
    stateGate?: string;
    manualBb?: string;
    workflowEvidence?: string;
  };
}
```

---

## 10. 連携方針

### 10.1 agent-gatefield 連携

code-to-gate は Gatefield の DecisionEngine を再実装しない。

提供するもの:

- `gatefield-static-result.json`
- findings summary
- risk flags
- secret / SAST / dangerous pattern result
- artifact hash

Gatefield に任せるもの:

- AI artifact 全体の `pass` / `hold` / `block`
- Judgment KB との類似度
- State-space scoring
- human review queue への振り分け

### 10.2 agent-state-gate 連携

code-to-gate は State Gate の Assessment / Approval / Context freshness を再実装しない。

提供するもの:

- `state-gate-evidence.json`
- release readiness summary
- policy evaluation result
- risk / finding / test seed artifact references
- audit metadata

State Gate に任せるもの:

- final verdict transformation
- approval binding
- stale check
- Human Attention Queue
- audit packet の統合

### 10.3 manual-bb-test-harness 連携

code-to-gate は手動 black-box テストケースの最終設計を再実装しない。

提供するもの:

- `manual-bb-seed.json`
- code-derived risk seeds
- invariant candidates
- changed behavior hints
- evidence references

manual-bb-test-harness に任せるもの:

- coverage model
- manual test case design
- effort estimate
- Go / No-Go brief
- oracle 不足の整理

### 10.4 workflow-cookbook 連携

code-to-gate は workflow-cookbook の Task Seed / Acceptance / Evidence 運用を再実装しない。

提供するもの:

- `workflow-evidence.json`
- acceptance evidence attachment
- CI artifact bundle
- release evidence bundle

workflow-cookbook に任せるもの:

- workflow pattern
- Task Seed 運用
- reusable CI 方針
- Evidence 正本
- acceptance gate の設計指針

---

## 11. 非機能要件

| ID | 要件 | 内容 |
|---|---|---|
| N001 | ローカルファースト | 初期版はローカル実行と CI artifact 生成を正式サポート |
| N002 | 証拠性 | finding / risk / test seed は evidence 参照必須 |
| N003 | 再現性 | 同一 commit / policy / plugin / model で同等 artifact を生成 |
| N004 | schema versioning | すべての machine-readable artifact に version を持たせる |
| N005 | plugin 分離 | private rule / policy / importer は OSS core 外に置ける |
| N006 | 機密保護 | public fixtures に private code / result を含めない |
| N007 | LLM 送信制御 | redaction / local-only / no-code-send mode を提供 |
| N008 | 性能 | 中規模 TS/JS repo の P0 scan を数分以内に完了 |
| N009 | 監査性 | generated_at / repo_revision / policy_id / plugin_versions / model_id を残す |
| N010 | CI 適合 | exit code と JSON output で CI から扱える |
| N011 | Downstream 適合 | 4 repo への adapter output を schema test できる |

---

## 12. Fixtures

public fixtures はすべて synthetic とする。

| fixture | 主言語 | 含めるリスク | 期待成果物 |
|---|---|---|---|
| `demo-shop-ts` | TS | trusted price / weak auth / missing tests | risk-register / test-seeds / blocked_input |
| `demo-auth-js` | JS | admin guard 不足 / try-catch swallow | findings / readiness |
| `demo-batch-py` | Python | unsafe delete / env direct access | risk-register |
| `demo-monorepo-mixed` | TS/JS | dependency sprawl / high fanout change | graph / blast radius |
| `demo-wrapper-smells` | TS | wrapper-only function / large module | maintainability findings |
| `demo-ci-imports` | TS | ESLint / Semgrep / coverage import | normalized findings |

---

## 13. ロードマップ

### 13.1 v0.1

- TS/JS repo scan
- NormalizedRepoGraph
- dependency graph
- core rules 10 件前後
- LLM summary / risk narrative
- risk-register
- invariants
- test-seeds
- release-readiness
- audit metadata
- synthetic fixtures
- private plugin prototype

### 13.2 v0.2

- diff mode
- blast radius
- ESLint / Semgrep / TypeScript diagnostics importer
- coverage / test result importer
- SARIF export
- GitHub Actions
- PR comment
- suppression
- Gatefield / State Gate / manual-bb / workflow Evidence export

### 13.3 v0.3

- Python adapter
- monorepo support
- local LLM
- cloud LLM provider expansion
- redaction / no-code-send mode
- HTML report
- historical comparison

### 13.4 v1.0

- plugin SDK
- stable artifact schemas
- Web viewer
- policy profiles
- downstream integration contract tests
- release evidence bundle
- OSS-ready README / CONTRIBUTING / Origin Policy

---

## 14. README 必須セクション

### Scope

- code-derived quality risks
- repo graph / dependency graph
- static analysis aggregation
- evidence-backed findings
- release readiness artifact
- downstream gate / QA seed export

### Non-goals

- AI agent artifact gate engine
- agent approval / freshness / human queue
- manual black-box test final design
- workflow / Task Seed governance
- company-specific business rules in OSS core
- proprietary source code or analysis output

### License

- This project is MIT-licensed.
- Third-party integrations remain under their original licenses.

### Origin Policy

- This project is an original implementation.
- It does not include proprietary source code, company-specific rules, or internal analysis results.
- Example fixtures are synthetic.

---

## 15. 次のアクション

1. `docs/acceptance-v0.1.md` の fixture と検収コマンドを実行可能にする。
2. `demo-shop-ts` と `demo-auth-js` と `demo-ci-imports` を先に作る。
3. schema validation CLI を実装する。
4. TS/JS adapter と core rules を実装する。
5. LLM structured output と evidence validation を実装する。
6. plugin runtime guard を実装する。
7. `manual-bb-seed.json` export を作る。
8. `gatefield-static-result.json` export を作る。
9. `state-gate-evidence.json` export を作る。
10. `workflow-evidence.json` export を作る。
