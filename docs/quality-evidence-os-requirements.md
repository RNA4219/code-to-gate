---
intent_id: QEOS-REQ-001
owner: code-to-gate
status: active
last_reviewed_at: 2026-07-05
next_review_due: 2026-08-05
---

# Quality Evidence OS 要件定義

## 1. 一文定義

code-to-gate は、静的解析CLIから、PR・CI・リリース判断に必要な証跡を
`requirement -> rule -> finding -> artifact -> verdict` で追跡できる
ローカルファーストの Quality Evidence OS へ拡張する。

## 2. 背景

現状の code-to-gate は findings、audit、readiness、viewer、downstream export、
QEG export を生成できる。一方で、OSSとして導入されるには次のギャップが残る。

- 既存負債が多い repo では、初回導入時に gate が落ち続ける。
- CI の失敗ログだけでは、PR reviewer が判断できる材料に変換されない。
- QEG、manual-bb、Gatefield、CI artifact の関係が artifact 単位に分断される。
- README、RUNBOOK、schema、実装、テストの drift が release risk として扱われない。
- custom rule、quality pack、importer、viewer、release pack の拡張軸が個別機能として散っている。

## 3. Scope

### In Scope

- Evidence DAG を中心にした証跡モデル。
- PR reviewer bot / GitHub Actions 連携。
- Baseline/Ratchet gate。
- Spec drift detector。
- QEG HTML viewer。
- Rule SDK と fixture-based harness。
- Quality Pack。
- Auto test selection。
- manual-bb 連携の第一級化。
- LLM trust boundary の製品化。
- schema migration。
- SARIF / CodeQL / Semgrep / ESLint importer。
- release evidence pack。
- policy DSL。
- ownership / module risk。
- `ctg doctor`。
- plugin marketplace 前提の拡張契約。
- AI code review mode。
- historical quality trend。
- hosted static report。

### Out of Scope

- agent-gatefield の最終 pass/hold/block 判定の再実装。
- manual-bb-test-harness の最終手動テストケース設計の再実装。
- GitHub App のホスト基盤運用。
- private business rule を OSS core に含めること。
- QEG の正本 graph store 実装。

## 4. 要求マトリクス

| ID | 要求 | Phase | 受入条件 |
|---|---|:---:|---|
| QEOS-001 | Evidence DAG | P1 | finding、audit、readiness、QEG、manual-bb、Gatefield、CI artifact を node/edge として出力できる |
| QEOS-002 | PR Reviewer Bot | P2 | PR comment が block理由、許容理由、追加テスト、仕様差分、artifact link を含む |
| QEOS-003 | Baseline/Ratchet Gate | P0 | baseline 既知findingは gate 対象外、新規・severity悪化だけ policy 評価対象になる |
| QEOS-004 | Spec Drift Detector | P1 | README/RUNBOOK/schema/実装/テストの不整合を `spec-drift.json` と `release-risk` finding にできる |
| QEOS-005 | QEG Viewer | P1 | QEG JSON を standalone HTML として閲覧でき、finding単位に drill-down できる |
| QEOS-006 | Rule SDK | P2 | `code-to-gate rule new <id>` で rule/test/docs/schema fixture の雛形を生成できる |
| QEOS-007 | Quality Packs | P2 | `code-to-gate pack list/show/export-policy` で pack contract と readiness policy YAML を生成できる |
| QEOS-008 | Auto Test Selection | P1 | diff blast radius から `test-plan.json` と oracle gap を出力できる |
| QEOS-009 | Manual BB First-Class | P1 | oracle不足・手動確認が必要な risk を manual-bb seed に明示できる |
| QEOS-010 | LLM Trust Boundary | P0 | LLM主張は evidence-bound で、unsupported claim は gate外に隔離される |
| QEOS-011 | Schema Evolution | P2 | artifact schema version migration と検証結果を出力できる |
| QEOS-012 | Importer Expansion | P1 | SARIF/CodeQL/Semgrep/ESLint を normalized finding に変換できる |
| QEOS-013 | Release Evidence Pack | P1 | `code-to-gate release-pack` で QEG、audit、diff、readiness、manual-bb、CI URL、artifact hash を `release-pack.json` / HTML / ZIP に集約できる |
| QEOS-014 | Policy DSL | P1 | `dsl.rules` で `critical always block`、`new_or_worsened block`、`manual evidence present hold` を readiness policy として表現できる |
| QEOS-015 | Ownership / Module Risk | P1 | CODEOWNERS/workspace/module graph から reviewer と影響領域を出せる |
| QEOS-016 | `ctg doctor` | P0 | Node/Git/Docker/schema/CI/plugin sandbox の導入診断を `doctor.json` として出せる |
| QEOS-017 | Plugin Marketplace | P3 | rule/reporter/exporter/adapter plugin の配布契約を定義する |
| QEOS-018 | AI Code Review Mode | P2 | AI生成コード特有のrisk packを選択できる |
| QEOS-019 | Historical Quality Trend | P2 | QEG/readinessの時系列 trend をviewerに表示できる |
| QEOS-020 | Hosted Static Report | P2 | GitHub Pages/artifact preview 向け単一HTMLを生成できる |
| QEOS-021 | PR Review App Mode | P2 | GitHub Actions comment step だけに依存せず、常設Bot/Appが `pr-review.json` / `pr-review.md` を投稿・更新できる contract を持つ |
| QEOS-022 | Spec Drift Surface Expansion | P1 | workflow YAML と PR comment action/template も spec-drift の監視対象に含め、QEG/PR証跡生成経路の欠落を検出する |
| QEOS-023 | PR Comment Evidence Backlink | P1 | `pr-review.md` の行と根拠 artifact を `evidence-dag.json` の逆引き edge で追跡できる |
| QEOS-024 | Standard Release Review Pack | P1 | `release-pack` は `pr-review.md` と hosted report URL/manifest を標準同梱対象として扱う |
| QEOS-025 | Quality Pack Distribution Unit | P2 | quality pack は sample repo と expected artifact を持つ実配布単位として export できる |
| QEOS-026 | Doctor GitHub Actions Permissions | P0 | `ctg doctor` は GitHub Actions の権限不足を workflow file から診断できる |
| QEOS-027 | Baseline Ownership and Expiry | P1 | baseline/ratchet は owner と expiry を持ち、期限切れ debt を明示できる |
| QEOS-028 | Manual BB Drafts from Oracle Gaps | P1 | `oracleGaps` から手動ブラックボックステストケース草案を自動生成できる |
| QEOS-029 | Evidence DAG Search and Filter | P2 | viewer は Evidence DAG node/edge を検索・filter できる |
| QEOS-030 | Historical Quality SLO | P2 | historical comparison は品質SLO indicator を出し、regression だけでなくSLO逸脱を追跡できる |

## 5. P0 完了条件

- QEOS-003: `readiness --baseline <path>` で ratchet gate が動く。
- QEOS-010: 既存 LLM trust boundary と audit hash の仕様を本拡張仕様に接続する。
- QEOS-016: `code-to-gate doctor` が local/CI readiness と remediation を `doctor.json` に出力する。
- この文書、仕様書、Task Seed、チェックリストが相互参照される。

## 6. 非機能要件

- 既存 `ctg/v1` artifact は後方互換を維持する。
- 新規 field は原則 optional とし、既存 consumer を壊さない。
- baseline 比較は deterministic に行い、LLM判断に依存しない。
- public fixtures は synthetic のみを使う。
- CI では JSON summary と artifact hash により再現性を確認できる。

## 7. 実装済み証跡

- QEOS-001: `code-to-gate export evidence-dag --from <artifact-dir>` による
  `evidence-dag@v1` artifact。requirement/rule/finding/artifact/verdict、
  manual-test、CI run node/edge を横断索引化。
- QEOS-002: `code-to-gate pr-review --from <artifact-dir>` による
  `pr-review@v1` artifact と `pr-review.md` 生成。PR comment の固定セクションとして
  block理由、許容理由、追加テスト、仕様差分、artifact link、baseline summary を出力。
- QEOS-003: `readiness --baseline <path>` と policy `baseline.enabled/file`
  による ratchet gate。新規・severity悪化 finding のみを policy 対象化し、
  `release-readiness.json.baseline` に summary を出力。
- QEOS-004: `code-to-gate spec-drift <repo>` による docs/schema/CLI/test drift 検出、
  `spec-drift@v1` artifact、release-risk finding、自己検査 `quality:spec-drift`。
- QEOS-005: `code-to-gate viewer --from <dir>` による standalone HTML viewer。
  `qeg-code-to-gate.json` と `evidence-dag.json` を読み、QEG tab と
  finding drill-down を表示。
- QEOS-006: `code-to-gate rule new <id>`、`@quality-harness/code-to-gate/rule-sdk`、
  fixture-based harness、生成README、生成manifest schema。
- QEOS-007: `code-to-gate pack list/show/export-policy`、`quality-pack@v1`
  schema、`security-basic` / `release-evidence` / `frontend-risk` /
  `api-contract` / `ai-generated-code` / `compliance-lite` bundled packs。
- QEOS-008: `code-to-gate test-plan --from <artifact-dir>`、`test-plan@v1`
  schema、diff blast radius 優先の推奨テスト、manual oracle gap。
- QEOS-009: `code-to-gate export manual-bb` と `test-plan.json.oracleGaps`
  による manual-bb seed / oracle gap handoff。
- QEOS-010: rule evaluator と LLM trust tests による evidence-bound finding、
  missing/invalid evidence の `unsupported_claims` 隔離、audit hash / redaction trace。
- QEOS-011: `code-to-gate schema migrate` による v1alpha1 -> v1 artifact migration、
  変換後validation、`schema-migration@v1` report。
- QEOS-012: `code-to-gate import sarif|codeql|semgrep|eslint` による
  external tool results の normalized `findings@v1` 変換。
- QEOS-013: `code-to-gate release-pack` による QEG、audit、diff、readiness、
  manual-bb、CI URL、artifact hash の `release-pack@v1` / HTML / ZIP 集約。
- QEOS-014: policy YAML `dsl.rules`、`when.baseline: new_or_worsened`、
  `when.manual_evidence: present|absent`、`action: block|hold|allow` の readiness 評価。
- QEOS-015: `code-to-gate ownership --from <artifact-dir>` による
  CODEOWNERS reviewer candidates、file risk、module risk、`ownership-risk@v1`
  artifact。
- QEOS-016: `code-to-gate doctor`、`doctor@v1` schema、schema validation、
  Node/Git/Docker/schema/artifact/CI readiness checks。
- QEOS-017: `code-to-gate plugin-marketplace --plugins <dir>` による
  rule/reporter/exporter/importer/language plugin registry、manifest validation、
  `plugin-marketplace@v1` artifact。
- QEOS-018: `ai-generated-code` Quality Pack による AI生成コード向け
  validation/testing/maintainability/compatibility risk review mode。
- QEOS-019: `code-to-gate historical` と viewer Historical tab による
  readiness/finding trend と regression の時系列表示。
- QEOS-020: `code-to-gate viewer --hosted` による単一HTML品質レポートと
  `hosted-static-report@v1` manifest の GitHub Pages / artifact preview 対応。
- QEOS-021..030: PR review App contract、workflow/comment spec-drift、PR comment
  backlink、standard release review pack、quality pack distribution、Actions
  permission doctor、baseline owner/expiry、manual-bb draft、DAG search、quality SLO
  を追加拡張対象として定義。
- QEOS-021: `src/github/api-client.ts` が GitHub App JWT 生成、installation lookup、
  installation token 取得を実装し、PR comment / Checks API の常設Bot利用に接続。
  `code-to-gate pr-review-publish` は `pr-review.md` を投稿/更新し、
  `github-app-health@v1` で認証方式、markdown hash、対象PR、comment action、
  失敗理由を証跡化する。
- QEOS-026: `doctor` が workflow permissions に加えて artifact upload path
  (`actions/upload-artifact`) を診断。
- QEOS-030: `historical-comparison.qualitySlo` が high findings増加率、
  spec drift再発率、未解消baseline期限超過年齢を optional indicator として保持。
