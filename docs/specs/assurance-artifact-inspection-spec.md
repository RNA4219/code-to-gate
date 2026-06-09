---
spec_id: SPEC-ASSURANCE-ARTIFACT-INSPECTION-001
intent_id: INT-ASSURANCE-SMELL-DETECTOR-001
owner: code-to-gate-team
status: active
last_reviewed_at: 2026-06-09
---

# Assurance Artifact-only Inspection Specification

## 1. 目的

生成済みartifact bundleだけを入力としてAssurance Smell Detectorを明示実行し、release判断を支えるtraceability/evidence gapを`assurance-findings.json`へ出力する。code-to-gateはreview-required candidateとcoverage情報を生成するevidence producerに留まり、release decisionは生成しない。

## 2. 対象

- Task 20260608-08: `RELEASE_DECISION_UNSUPPORTED`
- Task 20260608-09: 純粋な`inspectAssurance` orchestration API
- Task 20260608-10: artifact loader/writer
- Task 20260608-11: `assurance inspect` CLI

diff semantic rule、QEG export統合、通常`analyze`/`release:validate`への自動組込みは対象外とする。

## 3. Application API

```ts
interface InspectAssuranceOptions {
  minConfidence?: number; // default 0.60
  candidateLimit?: number; // default 500
}

interface AssuranceInspectionResult {
  graph: AssuranceGraph;
  candidates: Finding[];
  unsupportedClaims: UnsupportedClaim[];
  executedRuleIds: AssuranceFindingRuleId[];
  truncated: boolean;
}

function inspectAssurance(
  bundle: AssuranceArtifactBundle,
  hashService: HashService,
  options?: InspectAssuranceOptions
): AssuranceInspectionResult;
```

- artifact-only rulesを固定順で実行する。
- candidateはstable IDでdeduplicateし、`severity desc`、`ruleId`、`id`の順で決定的にsortする。
- `minConfidence`未満を除外後、最大500件に制限する。
- rule例外は握り潰さず、CLIがexit code 11へ変換する。

## 4. RELEASE_DECISION_UNSUPPORTED

`release-readiness.json`のstatusが`passed`または`passed_with_risk`の場合だけ評価する。次のいずれかを根拠化できる場合、readiness artifact単位で1 candidateを生成する。

- readinessが参照するartifact pathに対応する入力artifactがloadされていない
- readiness artifact自身がpartialである
- `failedConditions`が参照するfinding/risk/input IDがgraph上に存在しない
- high/critical finding、または`EVIDENCE_MISSING` candidateが存在する

readiness未入力、またはstatusが`needs_review`、`blocked_input`、`failed`の場合はcandidateを生成しない。readiness未入力時のみunsupported claimを生成する。

## 5. Artifact I/O

`--from` directoryから次を読む。

- 必須: `findings.json`, `repo-graph.json`
- 任意: `risk-register.yaml`, `test-seeds.json`, `invariants.json`, `release-readiness.json`, `intake.json`

JSON/YAMLの構文不正、必須artifact欠落、artifact/schema識別子不一致はartifact errorとする。任意artifact欠落はcoverageへ記録する。loaderは既存artifact wrapperから内部bundle配列へ変換する。

writerは入力findings headerを基礎に、次の既存schema互換artifactをUTF-8 JSONで出力する。

```json
{
  "artifact": "findings",
  "schema": "findings@v1",
  "completeness": "complete | partial",
  "findings": [],
  "unsupported_claims": []
}
```

既定出力は`<from>/assurance-findings.json`。入力artifactは変更しない。

## 6. CLI契約

```text
code-to-gate assurance inspect <repo> --from <artifact-dir> [--out <file>] [--min-confidence <0..1>] [--include-low-confidence]
```

- `<repo>`と`--from`は必須。存在するdirectoryでなければusage error `2`。
- `--out`省略時は`<from>/assurance-findings.json`。
- `--min-confidence`既定値は`0.60`。`--include-low-confidence`指定時は`0`。
- artifact load/parse/contract failureは`7`、detector実行失敗は`11`、candidate有無に関係なく成功は`0`。
- 成功時に出力path、candidate数、unsupported claim数、partial/truncated状態を表示する。

## 7. 受入条件

- 全artifact-only ruleが固定順で実行され、同一入力でID・順序が安定する
- `RELEASE_DECISION_UNSUPPORTED`はdecisionを変更せずevidence gapだけを表現する
- `assurance-findings.json`が`findings@v1` schema-validでdecision fieldを含まない
- 入力artifactの内容・hashを変更しない
- application層はNode APIをimportしない
- artifact-only inspectionは通常fixtureで5秒以内
