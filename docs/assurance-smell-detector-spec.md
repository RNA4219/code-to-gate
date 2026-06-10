---
intent_id: INT-ASSURANCE-SMELL-DETECTOR-001
owner: code-to-gate
status: draft
last_reviewed_at: 2026-06-08
---

# Assurance Smell Detector Specification

## 1. 目的

Assurance Smell Detectorは、コード上のbugを断定する静的解析器ではなく、リリース判断に必要な意図・要件・risk・test・invariant・evidenceのつながりが弱い箇所を、根拠付きのreview-required candidateとして抽出する。

code-to-gateはevidence producerに留まり、pass/blockを最終決定しない。最終判断のownerは人間またはquality-evidence-graph（QEG）とする。

## 2. スコープ

### 2.1 対象

- 既存artifact間の参照整合性とcoverage gap
- intake artifactに記載された要件・意図とのtraceability gap
- git diffで観測できるguard・validation・error path・business ruleの弱化候補
- release-readinessを支えるartifact/evidenceの不足候補
- 既存`Finding`形状と`findings@v1` schemaで表現可能な出力

### 2.2 非対象

- bug、脆弱性、仕様違反の断定
- LLMによる自動判定
- QEGのdecision生成
- readiness statusの自動変更
- requirement管理システムの新設
- 新しいFinding category、severity、既存artifact schemaの破壊変更

## 3. 基本原則

1. **Evidence required**: 全candidateは、検査対象artifactまたはdiff hunkを指す`EvidenceRef`を1件以上持つ。
2. **No evidence, no claim**: 入力不足で成立を確認できない場合、candidateを生成せずcoverage noteへ記録する。
3. **Deterministic first**: 初期実装は決定論的ルールのみとし、LLMを必要条件にしない。
4. **Review required**: titleとsummaryは「gap」「candidate」「review required」を用い、bug断定表現を避ける。
5. **No decision feedback loop**: Assurance Findingを同一runのrisk/test/invariant/readiness生成へ再投入しない。
6. **QEG owns decisions**: QEG exportへ渡す場合もevidenceとして扱い、decision fieldを生成しない。

## 4. 実行モデル

### 4.1 独立した後段検査

Detectorは通常rule engineとは分離し、生成済みartifact bundleを読むapplication-level use caseとして実行する。

```text
scan/analyze/diff/readiness
  -> artifact bundle
  -> assurance inspect
  -> assurance-findings.json
  -> human review / QEG evidence
```

通常rule engineの`ALL_RULES`には追加しない。通常ruleはrepo graphとfile contentを評価するが、Assurance Smell Detectorは複数artifactとbase/head差分を横断評価するためである。

### 4.2 出力

既定出力は`assurance-findings.json`とする。内容は既存`FindingsArtifact` / `findings@v1` schemaに準拠する。

- `artifact`: `findings`
- `schema`: `findings@v1`
- 各findingに`assurance-smell` tagを必須付与
- 通常の`findings.json`は変更しない
- 同一runのrisk register、test seeds、invariants、readinessへ自動混入しない
- QEG連携時は追加evidence sourceとして明示的に読み込む
- 入力不足によるrule skipは`unsupported_claims`へ記録し、`reason`は`missing_evidence`または`unknown_symbol`を使用する

独立viewとする理由は、Assurance Finding自身からrisk/test/invariantを生成してgapが自己解消したように見える循環を防ぐためである。

## 5. CLI契約

```text
code-to-gate assurance inspect <repo> --from <artifact-dir> [options]
```

| option | 必須 | 内容 |
|---|:---:|---|
| `<repo>` | Yes | 対象repository root |
| `--from <dir>` | Yes | 既存artifact bundle |
| `--out <file>` | No | 既定値`<from>/assurance-findings.json` |
| `--intake <file>` | No | phase contract / project intake / requirement evidence |
| `--base <ref>` | No | diff semantic検査のbase ref |
| `--head <ref>` | No | diff semantic検査のhead ref |
| `--min-confidence <n>` | No | 出力下限。既定値`0.60` |
| `--include-low-confidence` | No | 低confidence candidateも出力 |

`--base`と`--head`は同時指定を必須とする。未指定時はdiff依存ルールをskipし、coverage noteに理由を残す。

### 5.1 Exit code

| 状態 | exit code |
|---|---:|
| 検査成功。candidate有無は問わない | 0 |
| CLI引数・入力path不正 | 2 |
| artifact parse/schema failure | 7 |
| detector実行失敗 | 11 |

candidateの存在だけで非0にしない。Detectorはdecision ownerではないためである。

## 6. 入力契約

### 6.1 入力matrix

| 入力 | 必須 | 利用目的 |
|---|:---:|---|
| `findings.json` | Yes | source finding、evidence、tag |
| `repo-graph.json` | Yes | file role、symbol、relation、entrypoint、parser completeness |
| `risk-register.yaml` | No | risk/test linkage |
| `test-seeds.json` | No | risk/finding/invariantのtest linkage |
| `invariants.json` | No | intent/invariant/test linkage |
| `release-readiness.json` | No | release decision support検査 |
| `diff-analysis.json` | No | changed fileとblast radius |
| intake artifact | No | requirement、intent、open gap |
| git base/head content | No | semantic diff検査 |

optional入力が欠落している場合、その入力を必要とするルールはcandidateを出さずskipする。欠落自体が既存契約上問題で、別のartifactから根拠を示せる場合に限り`EVIDENCE_MISSING`または`RELEASE_DECISION_UNSUPPORTED`を出す。

### 6.2 Traceability tag規約

schema変更を避けるため、既存`tags: string[]`へ次の形式を追加できる。

```text
intent:<id>
requirement:<id>
risk:<id>
invariant:<id>
test-seed:<id>
```

Detectorはtag、`sourceFindingIds`、`sourceRiskIds`、evidence path、graph relationをtraceability edgeとして正規化する。自由文の類似だけではlink成立とみなさない。

## 7. 内部モデル

Detectorは入力artifactを次のread-only graphへ正規化する。

```ts
interface AssuranceGraph {
  nodes: AssuranceNode[];
  edges: AssuranceEdge[];
  coverage: AssuranceCoverage;
}

type AssuranceNodeKind =
  | "requirement"
  | "intent"
  | "finding"
  | "risk"
  | "invariant"
  | "test-seed"
  | "evidence"
  | "file"
  | "symbol"
  | "entrypoint"
  | "readiness-condition";

type AssuranceEdgeKind =
  | "declares"
  | "derived-from"
  | "supported-by"
  | "tested-by"
  | "maps-to"
  | "affects"
  | "changed-by";
```

この内部graphはruntime内部型であり、新規公開artifact schemaにはしない。

## 8. Detection Rules

全rule IDは`src/types/assurance-findings.ts`の語彙を正本とする。

### 8.1 Artifact横断ルール

| rule ID | 成立条件 | 生成しない条件 | default category | severity | confidence |
|---|---|---|---|---|---:|
| `EVIDENCE_MISSING` | finding/risk/invariant/test seed/readiness conditionが、必須evidence欠落、存在しないpath、不正line range、dangling refのいずれかを持つ | 対象artifact自体を読めず、欠落を根拠化できない | `release-risk` | medium | 0.95 |
| `RISK_WITHOUT_TEST` | riskに対し、`sourceRiskIds`または共通`sourceFindingIds`で結ばれたtest seedがない | risk/test-seeds入力がない、またはriskがlowかつpolicy対象外 | `testing` | medium | 0.90 |
| `INVARIANT_UNMAPPED` | invariantがsource finding、test seed、対象symbol/entrypointのいずれにもtraceできない | invariants入力がない、または明示的に`needs_human_confirmation` | `testing` | medium | 0.85 |
| `REQUIREMENT_LINK_MISSING` | intakeにID付きrequirementが存在し、そのscopeに属するchanged finding/risk/invariant/test seedに`requirement:<id>` linkがない | intakeがない、requirement IDがない、scope判定不能 | `release-risk` | low | 0.70 |
| `INTENT_NOT_RECOVERABLE` | changed critical entrypoint/business/security pathに、intent、requirement、invariant、testのいずれのtraceもない | diffまたはintake/invariant/test入力がなく、意図回復可能性を評価できない | `release-risk` | medium | 0.65 |
| `RELEASE_DECISION_UNSUPPORTED` | readinessが`passed`/`passed_with_risk`だが、required artifact欠落・partial graph・dangling failedCondition ref・critical/high evidence gapがある | readiness入力がない、またはstatusが`needs_review`/`blocked_input`/`failed` | `release-risk` | high | 0.90 |

### 8.2 Diff semanticルール

diff semanticルールは`--base`と`--head`の両方、および変更前後のcontent取得成功を必須とする。単純な削除行だけでは成立させず、変更後の代替signal有無を確認する。

| rule ID | 最低成立条件 | 必須evidence | severity | confidence範囲 |
|---|---|---|---|---:|
| `GUARD_WEAKENED` | auth/permission/role guardのcallまたはbranchが削除・緩和され、変更後pathに同等guardが見つからない | diff hunk + before guard symbol + affected entrypoint | high | 0.70-0.90 |
| `VALIDATION_REMOVED` | validation/sanitization/schema checkが削除され、変更後dataflow上で代替validationが見つからない | diff hunk + before validation symbol + affected input path | high | 0.70-0.90 |
| `ERROR_PATH_SUCCESS_FALLBACK` | catch/error branchがsuccess status、空値、default値へ変更され、error propagation/logging/explicit fallback契約がない | diff hunk + affected function/route | high | 0.75-0.90 |
| `BUSINESS_RULE_LOCALIZED` | shared business ruleへのcallが削除され、一つのcaller内へ条件がinline化され、他callerとの不整合候補が生じる | removed call relation + added local branch + sibling caller evidence | medium | 0.60-0.80 |

### 8.3 Rule共通抑制条件

- test、fixture、generated、docs roleは既定で除外する。
- 明示tag `accepted-design`、`fixture-intentional`、`generated-artifact`は既存suppression契約に従う。
- parser statusが`failed`の場合、symbol精度を必要とするdiff ruleはskipする。
- regex/text fallbackのみの場合、diff semantic ruleのconfidence上限を`0.70`とする。
- 代替guard/validation/error handlingが別symbolまたはimport先に存在する場合はcandidateを生成しない。
- candidateを生成した場合、成立signalと反証確認結果をsummaryへ記載する。

## 9. Finding表現

### 9.1 必須tag

```text
assurance-smell
<rule固有tag>
review-required
```

rule固有tagはrule IDをlower kebab-caseへ変換した値を正本とする。例: `GUARD_WEAKENED`は`guard-weakened`、`ERROR_PATH_SUCCESS_FALLBACK`は`error-path-success-fallback`。`src/types/assurance-findings.ts`は10 ruleすべてのtag定数を公開する。

追加可能な補助tag:

```text
evidence-gap
intent-recovery-gap
risk-test-linkage-gap
diff-semantic-candidate
low-confidence
partial-input
```

### 9.2 文言規約

良い例:

> Review required: a validation call was removed and no equivalent validation signal was recovered in the changed path.

禁止例:

> Validation is broken.

### 9.3 安定ID

finding IDは次の入力からstable fingerprintを生成する。

```text
ruleId + primary evidence path + symbol/entrypoint ID + base/head refs
```

line番号だけをidentityに使わない。

## 10. Architecture

推奨module構成:

```text
src/types/assurance-findings.ts              # 公開語彙
src/application/assurance/
  assurance-detector.ts                      # orchestration
  assurance-graph.ts                         # artifact正規化
  artifact-rules.ts                          # 横断rule
  diff-rules.ts                              # semantic diff rule
  finding-factory.ts                         # Finding正規化
  coverage.ts                                # skip/coverage集計
src/adapters/
  git-diff-access.ts                         # base/head contentとhunk取得
src/cli/assurance.ts                         # composition root
```

### 10.1 Dependency rules

- application detectorはNode APIを直接importしない。
- git操作は小さな`DiffAccess` contract越しに注入する。
- ruleはread-only inputを受け、file writeやprocess exitを行わない。
- CLIだけがartifact load/write、git adapter、exit codeを配線する。
- 新しいruntime dependencyは追加しない。

## 11. QEG連携

- `assurance-findings.json`はQEGへ追加evidence sourceとして渡せる。
- QEG exportの`decision` fieldは追加しない。
- `RELEASE_DECISION_UNSUPPORTED`はdecisionを覆す判定ではなく、判断材料不足を示すevidenceとする。
- `quality_checks_actual`へ反映する場合も、実行済みcheckと件数のみを記録し、pass/blockを記録しない。

## 12. Performance

- artifact横断ruleはnode/edge数に対して概ね線形とする。
- diff semantic ruleはchanged filesだけを対象とする。
- 既定上限:
  - changed files: 500
  - diff hunk size: 1 MiB/file
  - candidate: 500件
- 上限超過時はpartial inputとしてcoverage noteを残し、全repo解析へ自動拡張しない。
- 目標時間:
  - artifact-only inspection: 5秒以内
  - 100 changed filesのdiff inspection: 30秒以内

## 13. Security / Trust

- shell文字列連結でgit commandを実行しない。引数配列を使用する。
- repo外path、symlink escape、巨大fileを拒否またはskipする。
- artifact内のpathとIDを未検証でcommandへ渡さない。
- external evidenceは存在・形式を検証し、内容を信頼済み事実として扱わない。
- LLM enrichmentを将来追加する場合も、candidate成立条件とseverityは決定論的ロジックが所有する。

## 14. Test Strategy

### 14.1 Unit

- AssuranceGraphのnode/edge正規化
- 各ruleのpositive / negative / insufficient-input case
- stable ID、tag、文言規約
- path、line range、dangling ref検証
- diff ruleの代替guard/validation検出

### 14.2 Contract

- `assurance-findings.json`が`findings@v1` schema-valid
- 全findingがevidenceと`assurance-smell` tagを持つ
- decision fieldを生成しない
- 通常`findings.json`、risk/test/invariant/readinessを変更しない

### 14.3 Fixture

各ruleに最低3 fixtureを用意する。

1. true candidate
2. 明確な反証があるnon-candidate
3. 入力不足によるskip

diff semantic ruleはbase/head commitを持つfixture repositoryで検証する。

### 14.4 Acceptance

- artifact-only rule 6種が期待どおり検出・skipされる。
- diff semantic rule 4種が期待どおり検出・反証される。
- candidate有りでもCLI exit codeは0。
- schema invalid時のみexit code 7。
- QEG evidence exportにdecisionがない。
- `npm test`、`test:architecture`、`test:package`、`release:validate`が通る。

## 15. Delivery Phases

| Phase | 内容 | 完了条件 |
|---|---|---|
| 1 | AssuranceGraph、coverage、finding factory、CLI骨格 | 空bundleとvalid bundleを安全に検査可能 |
| 2 | `EVIDENCE_MISSING`、`RISK_WITHOUT_TEST`、`INVARIANT_UNMAPPED` | artifact横断3ruleとschema-valid出力 |
| 3 | `REQUIREMENT_LINK_MISSING`、`INTENT_NOT_RECOVERABLE` | intake/traceability規約とskip制御 |
| 4 | DiffAccessとdiff semantic 4rule | base/head fixtureでpositive/negative通過 |
| 5 | `RELEASE_DECISION_UNSUPPORTED`、QEG evidence統合 | decision非所有を維持した連携 |
| 6 | precision評価、docs、release gate | FP評価と全品質ゲート通過 |

## 16. 完了条件

1. 10 rule IDすべてに決定論的実装または明示的skip条件がある。
2. 出力は既存Finding schemaと互換である。
3. 全candidateに根拠があり、bugまたはrelease decisionを断定しない。
4. 通常artifact生成とreadinessにfeedback loopを作らない。
5. QEGがdecision ownerである境界を維持する。
6. fixtureによるprecision評価結果と既知の非対応範囲を記録する。

## 17. 既知の制約

- requirement/intention linkは、ID付きintakeまたは明示tagがない限り強く推定できない。
- `BUSINESS_RULE_LOCALIZED`は意味解析の限界から最も誤検出リスクが高く、初期default confidenceを低くする。
- regex fallback言語ではdiff semantic ruleの精度が制限される。
- 「証拠が存在しないこと」の証明はできないため、Detectorは常にrecovered evidenceの範囲内でgap candidateを提示する。
