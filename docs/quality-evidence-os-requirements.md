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
| QEOS-006 | Rule SDK | P2 | `ctg rule new <id>` で rule/test/docs/schema fixture の雛形を生成できる |
| QEOS-007 | Quality Packs | P2 | `security-basic` などの pack を選択し、rule/policy/export を一括適用できる |
| QEOS-008 | Auto Test Selection | P1 | diff blast radius から推奨テスト一覧を出力できる |
| QEOS-009 | Manual BB First-Class | P1 | oracle不足・手動確認が必要な risk を manual-bb seed に明示できる |
| QEOS-010 | LLM Trust Boundary | P0 | LLM主張は evidence-bound で、unsupported claim は gate外に隔離される |
| QEOS-011 | Schema Evolution | P2 | artifact schema version migration と検証結果を出力できる |
| QEOS-012 | Importer Expansion | P1 | SARIF/CodeQL/Semgrep/ESLint を normalized finding に変換できる |
| QEOS-013 | Release Evidence Pack | P1 | QEG、audit、diff、readiness、manual-bb、CI URL、hash をHTML/ZIP化できる |
| QEOS-014 | Policy DSL | P1 | new/worsened、manual evidence、criticalなどをYAMLで表現できる |
| QEOS-015 | Ownership / Module Risk | P1 | CODEOWNERS/workspace/module graph から reviewer と影響領域を出せる |
| QEOS-016 | `ctg doctor` | P0 | Node/Git/Docker/schema/CI/plugin sandbox の導入診断を出せる |
| QEOS-017 | Plugin Marketplace | P3 | rule/reporter/exporter/adapter plugin の配布契約を定義する |
| QEOS-018 | AI Code Review Mode | P2 | AI生成コード特有のrisk packを選択できる |
| QEOS-019 | Historical Quality Trend | P2 | QEG/readinessの時系列 trend をviewerに表示できる |
| QEOS-020 | Hosted Static Report | P2 | GitHub Pages/artifact preview 向け単一HTMLを生成できる |

## 5. P0 完了条件

- QEOS-003: `readiness --baseline <path>` で ratchet gate が動く。
- QEOS-010: 既存 LLM trust boundary と audit hash の仕様を本拡張仕様に接続する。
- QEOS-016: `ctg doctor` の要求・I/O 契約が仕様化される。
- この文書、仕様書、Task Seed、チェックリストが相互参照される。

## 6. 非機能要件

- 既存 `ctg/v1` artifact は後方互換を維持する。
- 新規 field は原則 optional とし、既存 consumer を壊さない。
- baseline 比較は deterministic に行い、LLM判断に依存しない。
- public fixtures は synthetic のみを使う。
- CI では JSON summary と artifact hash により再現性を確認できる。
