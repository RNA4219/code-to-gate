---
intent_id: QEOS-ORCH-001
owner: code-to-gate
status: active
last_reviewed_at: 2026-07-05
next_review_due: 2026-08-05
---

# Quality Evidence OS 実装 Task Seeds

## Task Seed QEOS-P0-01 Baseline/Ratchet Gate

Objective: 既存負債を baseline に固定し、新規・severity悪化 finding だけを readiness gate 対象にする。

Status: done

Requirements:

- `readiness --baseline <path>` を追加する。
- policy `baseline.enabled` / `baseline.file` でも有効化できる。
- baseline summary を `release-readiness.json` に optional field として出す。
- 既存 schema consumer を壊さない。

Commands:

- `npx vitest run src/cli/__tests__/readiness.test.ts --reporter=dot`
- `npm run build`

## Task Seed QEOS-P0-02 Doctor

Objective: OSS利用者とCIが code-to-gate の前提条件を事前診断できるようにする。

Status: done

Requirements:

- `code-to-gate doctor` を追加する。
- Node/Git/Docker/schema bundle/artifact dir/GitHub Actions context を診断する。
- `doctor.json` と `doctor@v1` schema を追加する。
- failed check がある場合は `READINESS_NOT_CLEAR` を返す。

Commands:

- `npx vitest run src/cli/__tests__/doctor.test.ts tests/integration/schema-coverage.test.ts --reporter=dot`
- `npm run build`
- `npm run quality:spec-drift`

## Task Seed QEOS-P1-01 Evidence DAG

Objective: findings、audit、readiness、QEG、manual-bb、Gatefield、CI artifact を横断する証跡DAGを出す。

Status: done

Requirements:

- `evidence-dag.json` schema を追加する。
- artifact hash と `run_id` を node metadata に含める。
- QEG export と重複せず、QEG が消費できる evidence projection にする。
- `export evidence-dag` で生成できる。

## Task Seed QEOS-P1-02 Spec Drift Detector

Objective: docs/schema/CLI/test の不整合を release risk として検出する。

Status: done

Requirements:

- CLI reference と `src/cli.ts` help の option drift を検出する。
- docs artifact field と schema field の drift を検出する。
- drift finding は `release-risk` category にする。
- `code-to-gate spec-drift <repo> --out <dir>` で `spec-drift.json` を生成する。
- drift がある場合は `READINESS_NOT_CLEAR` を返す。

Commands:

- `npx vitest run src/cli/__tests__/spec-drift.test.ts tests/integration/schema-coverage.test.ts --reporter=dot`
- `npm run build`
- `npm run lint`
- `npm run docs:lint-refs`

## Task Seed QEOS-P1-03 QEG Viewer

Objective: QEG JSON を standalone HTML として drill-down 可能にする。

Status: done

Requirements:

- finding、evidence、artifact hash、schema validation、CI run を表示する。
- 大きい artifact でも初期表示を軽くする。
- hosted static report と共有可能な renderer にする。
- 既存 `viewer --from <dir>` が `qeg-code-to-gate.json` / `evidence-dag.json`
  を読み、QEG tab を表示する。

Commands:

- `npx vitest run src/viewer/__tests__/report-viewer.test.ts src/__tests__/smoke/cli-smoke.test.ts --reporter=dot`
- `npm run build`
- `npm run lint`
- `npm run docs:lint-refs`

## Task Seed QEOS-P1-04 Auto Test Selection

Objective: diff blast radius と repo graph から推奨テストを出す。

Status: done

Requirements:

- changed file、importer、entrypoint、test file relation を使う。
- `test-plan.json` と human-readable summary を出す。
- manual-bb seed へ oracle gap を渡す。

Commands:

- `npx vitest run src/cli/__tests__/test-plan.test.ts tests/integration/schema-coverage.test.ts --reporter=dot`
- `npm run build`
- `npm run quality:spec-drift`

## Task Seed QEOS-P2-01 Rule SDK

Objective: OSS core を直接編集せず、外部チームが fixture 付き custom rule を作れる入口を提供する。

Status: done

Requirements:

- `code-to-gate rule new <id>` で `.ctg/rules/<id>/` を生成する。
- 生成物は rule/test/docs/schema fixture を含む。
- `@quality-harness/code-to-gate/rule-sdk` を package export として公開する。
- fixture-based harness で positive / negative fixture を scan なしで評価できる。

Commands:

- `npx vitest run src/rule-sdk/__tests__/rule-harness.test.ts src/cli/__tests__/rule.test.ts --reporter=dot`
- `npm run build`
- `npm run lint`
- `npm run docs:lint-refs`

## Task Seed QEOS-P2-02 Quality Packs

Objective: OSS利用者が最初の policy/rule/export 構成を迷わず適用できるよう、用途別 preset を提供する。

Status: done

Requirements:

- `code-to-gate pack list` で bundled pack を一覧できる。
- `code-to-gate pack show <id>` で `quality-pack.json` を生成できる。
- `code-to-gate pack export-policy <id> --out <file>` で readiness-compatible policy YAML を生成できる。
- 初期 pack は `security-basic`、`release-evidence`、`frontend-risk`、`api-contract`、`ai-generated-code`、`compliance-lite` とする。

Commands:

- `npx vitest run src/cli/__tests__/pack.test.ts tests/integration/schema-coverage.test.ts --reporter=dot`
- `npm run build`
- `npm run quality:spec-drift`

## Task Seed QEOS-P1-05 Release Evidence Pack

Objective: release review に必要な QEG、audit、diff、readiness、manual-bb、CI URL、artifact hash を HTML/ZIP と manifest にまとめる。

Status: done

Requirements:

- `code-to-gate release-pack --from <artifact-dir> --out <file-or-dir>` で `release-pack.json`、`release-pack.html`、`release-pack.zip` を生成する。
- `release-pack.json` は `release-pack@v1` schema に合格する。
- QEG、audit、diff、readiness、manual-bb、CI URL は required evidence として manifest entry に出す。
- required evidence が欠ける場合は `status: partial` と missing entry を記録し、`--allow-partial` なしでは `READINESS_NOT_CLEAR` を返す。
- HTML は readiness verdict、QEG summary、manual-bb候補数、changed files、artifact hash、CI URL を確認できる。

Commands:

- `npx vitest run src/cli/__tests__/release-pack.test.ts tests/integration/schema-coverage.test.ts --reporter=dot`
- `npm run build`
- `npm run quality:spec-drift`

## Task Seed QEOS-P2-07 PR Reviewer Bot

Objective: PRに単なる失敗ログではなく、block理由、許容理由、追加テスト、仕様差分、artifact link を含むレビュー可能な判断材料を出す。

Status: done

Requirements:

- `code-to-gate pr-review --from <artifact-dir> --out <file-or-dir>` は `pr-review.json` と `pr-review.md` を生成できる。
- `pr-review.json` は `pr-review@v1` schema に合格する。
- PR comment body は Gate verdict、Blocking reasons、Acceptable risks、Suggested tests、Spec drift、Evidence links、Suppression / baseline summary を含む。
- block理由は readiness failed conditions、failed spec drift、high-risk unowned changed files、partial release pack から deterministic に生成する。
- 追加テストは `test-plan.json.recommendedTests` と `test-plan.json.oracleGaps` を使う。
- `status: "block"` の場合は `READINESS_NOT_CLEAR` を返し、GitHub投稿なしでもCIで判定できる。

Commands:

- `npx vitest run src/pr-review/__tests__/pr-review.test.ts src/cli/__tests__/pr-review.test.ts tests/integration/schema-coverage.test.ts --reporter=dot`
- `npm run build`
- `npm run quality:spec-drift`

## Task Seed QEOS-P1-06 Policy DSL

Objective: gate policy を固定thresholdだけでなく、YAML rules で new/worsened、manual evidence、critical always block などを表現できるようにする。

Status: done

Requirements:

- policy YAML の `dsl.rules` を読み込める。
- DSL rule は `id`、`when`、`action`、optional `reason` を持つ。
- `when.severity`、`when.category`、`when.rule_id`、`when.baseline: new_or_worsened`、`when.manual_evidence: present|absent` を評価できる。
- `action: block` は `blocked_input`、`action: hold` は `needs_review` の failed condition に反映する。
- `action: allow` は DSL 内の block/hold を抑止する。
- `readiness --manual-evidence <file>` で manual-bb artifact を policy context に入れられる。

Commands:

- `npx vitest run src/config/__tests__/policy-loader.test.ts src/config/__tests__/policy-evaluator.test.ts src/cli/__tests__/readiness.test.ts --reporter=dot`
- `npm run build`
- `npm run quality:spec-drift`

## Task Seed QEOS-P1-07 Importer Expansion

Objective: SARIF / CodeQL / Semgrep / ESLint を normalized finding model に取り込み、code-to-gate を品質判定レイヤーとして使えるようにする。

Status: done

Requirements:

- `code-to-gate import sarif <file>` は SARIF 2.1.0 `runs[].results[]` を `findings@v1` に変換できる。
- `code-to-gate import codeql <file>` は CodeQL SARIF を同じ parser で取り込み、upstream tool を `codeql` として保持する。
- SARIF rule/result の severity、category、location、message、tags、fingerprint を deterministic に normalized finding へ写像する。
- `findings` / `raw-findings` schema の upstream tool enum は `sarif` と `codeql` を受け入れる。
- 既存 Semgrep / ESLint importer の挙動を壊さない。

Commands:

- `npx vitest run src/cli/__tests__/import.test.ts --reporter=dot`
- `npm run build`
- `npm run quality:spec-drift`

## Task Seed QEOS-P2-03 AI Code Review Mode

Objective: AI生成コードにありがちな validation gap、swallowed error、test gap、large module、compatibility risk を deterministic Quality Pack として選択できるようにする。

Status: done

Requirements:

- bundled Quality Pack に `ai-generated-code` を含める。
- `code-to-gate pack list` で `ai-generated-code` が表示される。
- `code-to-gate pack show ai-generated-code` は `quality-pack@v1` artifact を出せる。
- `code-to-gate pack export-policy ai-generated-code --out <file>` は readiness-compatible policy YAML を生成できる。
- 対象 rule は AI生成コードで起きやすい validation、testing、maintainability、compatibility risk を含む。

Commands:

- `npx vitest run src/cli/__tests__/pack.test.ts --reporter=dot`
- `npm run build`
- `npm run quality:spec-drift`

## Task Seed QEOS-P2-04 Historical Quality Trend

Objective: 各 run の findings/readiness/risk trend を `historical-comparison.json` と viewer Historical tab に出し、単発 gate から継続改善に接続する。

Status: done

Requirements:

- `code-to-gate historical --current <dir> --previous <dir> --history <dir>` で時系列 trend を含む artifact を生成できる。
- `historical-comparison.json` は `historical-comparison@v1` schema に合格する。
- schema validator は `historical-comparison.schema.json` を preload し、validate-all optional artifact として扱う。
- viewer は `historical-comparison.json` を検出して Historical tab と timeline bars を表示できる。

Commands:

- `npx vitest run src/historical/__tests__/comparison.test.ts tests/integration/schema-coverage.test.ts src/viewer/__tests__/report-viewer.test.ts --reporter=dot`
- `npm run build`
- `npm run quality:spec-drift`

## Task Seed QEOS-P2-05 Hosted Static Report

Objective: GitHub Pages / artifact preview にそのまま出せる単一HTML品質レポートと、公開用manifestを生成する。

Status: done

Requirements:

- `code-to-gate viewer --from <dir> --out <file> --hosted` は HTML と `hosted-static-report.json` を生成できる。
- `hosted-static-report.json` は `hosted-static-report@v1` schema に合格する。
- manifest は HTML hash、size、single-file guarantee、source artifact hash、host target、optional public URL を含む。
- `--hosted-target` は `github-pages`、`artifact-preview`、`generic-static` を受け付け、不正値を usage error にする。

Commands:

- `npx vitest run src/cli/__tests__/viewer.test.ts tests/integration/schema-coverage.test.ts --reporter=dot`
- `npm run build`
- `npm run quality:spec-drift`

## Task Seed QEOS-P2-06 Schema Evolution / Migration

Objective: 古いCI artifactやリリース証跡を現行schemaへ検証・変換し、migration結果を証跡として残せるようにする。

Status: done

Requirements:

- `code-to-gate schema migrate <artifact> --out <file-or-dir>` は `ctg/v1alpha1` artifact を `ctg/v1` artifact に変換できる。
- 変換後 artifact は `schema validate` に合格する。
- `schema-migration.json` は source、target、changes、validation result を記録する。
- `schema-migration.json` は `schema-migration@v1` schema に合格する。
- 未対応versionや不正な `--target-version` は usage/schema error として失敗する。

Commands:

- `npx vitest run src/cli/__tests__/schema-validate.test.ts tests/integration/schema-coverage.test.ts --reporter=dot`
- `npm run build`
- `npm run quality:spec-drift`

## Task Seed QEOS-P1-08 Ownership / Module Risk

Objective: CODEOWNERS、workspace package、module graph を取り込み、PR/releaseで誰が見るべきか、どの領域の品質リスクかを artifact として出力する。

Status: done

Requirements:

- `code-to-gate ownership --from <artifact-dir> --out <file-or-dir>` は `repo-graph.json` と optional `diff-analysis.json` を入力にできる。
- `.github/CODEOWNERS`、root `CODEOWNERS`、`docs/CODEOWNERS` を探索し、last-match-wins で owner を解決する。
- `diff-analysis.json` がある場合は changed / blast-radius file を中心に file risk と module risk を出す。
- owner が存在しない changed source/config file は high risk として記録する。
- `ownership-risk.json` は `ownership-risk@v1` schema に合格する。

Commands:

- `npx vitest run src/ownership/__tests__/ownership-risk.test.ts src/cli/__tests__/ownership.test.ts tests/integration/schema-coverage.test.ts --reporter=dot`
- `npm run build`
- `npm run quality:spec-drift`

## Task Seed QEOS-P3-01 Plugin Marketplace

Objective: rule、reporter、exporter、importer、language plugin を配布・reviewできる marketplace registry artifact を定義し、既存 plugin manifest validation と sandbox 契約に接続する。

Status: done

Requirements:

- `code-to-gate plugin-marketplace --plugins <dir[,dir...]> --out <file-or-dir>` は plugin manifest 群から `plugin-marketplace.json` を生成できる。
- registry entry は kind、capabilities、receives、returns、sandbox permissions、distribution metadata、validation status を含む。
- invalid manifest は `validation.status: invalid` と errors に記録する。
- `--allow-invalid` がない場合、invalid manifest がある registry は `PLUGIN_FAILED` を返す。
- `plugin-marketplace.json` は `plugin-marketplace@v1` schema に合格する。

Commands:

- `npx vitest run src/plugin/__tests__/marketplace.test.ts src/cli/__tests__/plugin-marketplace.test.ts tests/integration/schema-coverage.test.ts --reporter=dot`
- `npm run build`
- `npm run quality:spec-drift`

## Task Seed QEOS-P2-07 PR Review App Mode

Objective: `pr-review@v1` を GitHub Actions comment step だけでなく常設GitHub App/Botからも利用できる安定contractにする。

Status: done

Requirements:

- App/Bot contract は repository、pull request、commit sha、artifact URL、comment marker、permission要求を記録する。
- `pr-review.md` の content hash と run id で既存コメント更新を識別できる。
- Actions実装とApp実装が同じ `pr-review.json` / `pr-review.md` を入力にできる。
- `code-to-gate pr-review-publish --from <artifact-dir> --repo <owner/repo> --pull <number>` は
  `GITHUB_TOKEN` または GitHub App 認証で既存PRコメントを更新/新規作成し、
  commit sha、artifact URL、comment action を含む `github-app-health.json` を残す。

Commands:

- `npx vitest run src/cli/__tests__/pr-review.test.ts --reporter=dot`
- `npx vitest run src/cli/__tests__/pr-review-publish.test.ts tests/integration/schema-coverage.test.ts --reporter=dot`
- `npm run build`
- `npm run quality:spec-drift`

## Task Seed QEOS-P1-09 Spec Drift Surface Expansion

Objective: workflow YAML と PR comment action/template を spec-drift の監視対象に追加し、QEG/PR証跡経路の欠落を検出する。

Status: done

Requirements:

- `.github/workflows/code-to-gate-pr.yml` が test-plan、evidence-dag、QEG、pr-review、schema validation、PR comment action を含むことを検査する。
- `.github/actions/pr-comment/action.yml` が `pr-review.md` を優先して投稿することを検査する。
- spec-drift failure 時も PR review evidence を生成する workflow 構造を検査する。

Commands:

- `npx vitest run src/cli/__tests__/spec-drift.test.ts --reporter=dot`
- `npm run quality:spec-drift`

## Task Seed QEOS-P1-10 Evidence Backlinks and Release Pack Standardization

Objective: PRコメント行から根拠artifactへ逆引きできる Evidence DAG edge と、release pack 標準同梱を実装する。

Status: done

Requirements:

- `evidence-dag@v1` は `pr-comment-line` node と `cites_artifact` edge を出せる。
- `release-pack` は `pr-review.json`、`pr-review.md`、`hosted-static-report.json` を標準同梱する。
- hosted report URL を manifest summary と HTML に表示する。

Commands:

- `npx vitest run src/cli/__tests__/export.test.ts src/cli/__tests__/release-pack.test.ts --reporter=dot`
- `npm run build`

## Task Seed QEOS-P2-08 Pack Distribution, Doctor Permission, Manual Draft, Viewer Search, SLO

Objective: Quality Pack配布単位、Actions権限doctor、oracle gap手動テスト草案、Evidence DAG検索、Historical SLOを追加する。

Status: done

Requirements:

- `quality-pack@v1` は sample repo と expected artifacts を持つ。
- `doctor@v1` は workflow permissions を診断する。
- `test-plan@v1.oracleGaps[]` は `manualTestDraft` を持つ。
- viewer は Evidence DAG 検索/filter を持つ。
- `historical-comparison@v1` は optional quality SLO summary を持つ。

Commands:

- `npx vitest run src/cli/__tests__/pack.test.ts src/cli/__tests__/doctor.test.ts src/cli/__tests__/test-plan.test.ts src/viewer/__tests__/report-viewer.test.ts src/historical/__tests__/comparison.test.ts --reporter=dot`
- `npm run build`
- `npm run quality:spec-drift`

## Task Seed QEOS-P2-11 Evidence Query Language

Objective: artifact directory を横断して finding / artifact / baseline / SLO を軽量queryで抽出できる `evidence-query@v1` を実装する。

Status: planned

Requirements:

- `code-to-gate query <expression> --from <artifact-dir> [--out <file-or-dir>]` を追加する。
- 初期構文は `finding where severity >= high`、`artifact where schema = findings@v1`、`baseline where expired = true` を扱う。
- query結果は source artifact hash と matched item locator を保持する。

Commands:

- `npx vitest run src/cli/__tests__/query.test.ts tests/integration/schema-coverage.test.ts --reporter=dot`
- `npm run build`
- `npm run quality:spec-drift`

## Task Seed QEOS-P1-12 Evidence Redaction Profile

Objective: public/private/regulated profile により artifact と human surface の情報量を切り替える。

Status: planned

Requirements:

- redaction profile contract を `redaction-profile@v1` として定義する。
- viewer、release-pack、PR review、query output が profile と redaction summary を保持できる。
- regulated profile は signer、retention、approval binding の欠落を warning 以上にする。

Commands:

- `npx vitest run src/cli/__tests__/redaction-profile.test.ts src/viewer/__tests__/report-viewer.test.ts src/cli/__tests__/release-pack.test.ts --reporter=dot`
- `npm run build`
- `npm run quality:spec-drift`

## Task Seed QEOS-P1-13 Gate Explainability Snapshot

Objective: gate failure から、通過に必要な変更候補を機械可読に出す。

Status: planned

Requirements:

- `gate-explainability@v1` schema と `code-to-gate explain-gate --from <artifact-dir>` を追加する。
- failed condition、blocking finding、manual evidence候補、baseline更新候補、severity再評価候補を出す。
- PR review と release-pack に explainability summary を表示する。

Commands:

- `npx vitest run src/cli/__tests__/explain-gate.test.ts src/cli/__tests__/pr-review.test.ts src/cli/__tests__/release-pack.test.ts --reporter=dot`
- `npm run build`
- `npm run quality:spec-drift`

## Task Seed QEOS-P2-14 Community Rule Quality Score

Objective: rule/plugin のfixture coverage、FP review、evidence completeness、schema compatibility、runtime cost を採点する。

Status: planned

Requirements:

- `rule-quality-score@v1` schema と `code-to-gate rule score <rule-or-plugin>` を追加する。
- plugin marketplace は score がある場合に entry へ品質指標を接続する。
- score artifact は算出式と入力evidenceを保持する。

Commands:

- `npx vitest run src/cli/__tests__/rule-score.test.ts src/plugin/__tests__/marketplace.test.ts tests/integration/schema-coverage.test.ts --reporter=dot`
- `npm run build`
- `npm run quality:spec-drift`

## Task Seed QEOS-P1-15 Self-Auditing Drift Budget

Objective: spec-drift の累積・再発・許容量を budget として追跡し、release branchで超過をblockする。

Status: planned

Requirements:

- `drift-budget@v1` schema と `code-to-gate drift-budget --from <history-dir|artifact-dir>` を追加する。
- failed/warning count、再発check、許容budget、branch policy を保持する。
- PR review は budget 超過時に修正対象を表示する。

Commands:

- `npx vitest run src/cli/__tests__/drift-budget.test.ts src/cli/__tests__/pr-review.test.ts tests/integration/schema-coverage.test.ts --reporter=dot`
- `npm run build`
- `npm run quality:spec-drift`

## Task Seed QEOS-P1-16 Evidence Provenance Index

Objective: human surface から元artifact/hash/source idへ戻れる `evidence-provenance-index@v1` を生成する。

Status: planned

Requirements:

- `code-to-gate export provenance-index --from <artifact-dir>` を追加する。
- PR comment、viewer section、release-pack HTML、SARIF annotation の locator を index 化する。
- entry は surface、locator、artifactPath、artifactHash、sourceId、line/anchor を持つ。

Commands:

- `npx vitest run src/cli/__tests__/export.test.ts tests/integration/schema-coverage.test.ts --reporter=dot`
- `npm run build`
- `npm run quality:spec-drift`

## Task Seed QEOS-P2-17 App-Native Review Queue

Objective: GitHub App/Bot が SLO逸脱、baseline expiry、manual oracle gap、spec drift recurrence を queue item として管理できる。

Status: planned

Requirements:

- `review-queue@v1` schema と `code-to-gate review-queue --from <artifact-dir>` を追加する。
- item は owner、due date、status、dismissal reason、source artifact を持つ。
- hosted service運用はcore外とし、coreはartifact生成とPR/check summary contractに限定する。

Commands:

- `npx vitest run src/cli/__tests__/review-queue.test.ts tests/integration/schema-coverage.test.ts --reporter=dot`
- `npm run build`
- `npm run quality:spec-drift`

## Task Seed QEOS-P2-18 Quality Pack Golden Repository Suite

Objective: quality pack ごとに golden repo suite を実行し、検出力とfalse positiveを継続測定する。

Status: planned

Requirements:

- `quality-pack-golden-suite@v1` schema と bundled pack の golden suite candidate を追加する。
- pack id、sample/golden repo、expected artifacts、expected finding profile、FP/FN summary を保持する。
- pack更新時の差分を release evidence として保存できる。

Commands:

- `npx vitest run src/cli/__tests__/pack.test.ts tests/integration/schema-coverage.test.ts --reporter=dot`
- `npm run build`
- `npm run quality:spec-drift`

## Task Seed QEOS-P1-19 Baseline Debt Ledger

Objective: baseline debt を owner/expiry/承認者/更新理由/残工数/再発防止メモ付きledgerとして管理する。

Status: planned

Requirements:

- `baseline-debt-ledger@v1` schema と `code-to-gate baseline-ledger --from <artifact-dir>` を追加する。
- ledger item は owner、expiry、approver、approval reason、refresh reason、estimated effort、prevention note を持つ。
- expired debt は readiness、review queue、hosted portal に接続できる。

Commands:

- `npx vitest run src/cli/__tests__/baseline-ledger.test.ts src/cli/__tests__/readiness.test.ts tests/integration/schema-coverage.test.ts --reporter=dot`
- `npm run build`
- `npm run quality:spec-drift`

## Task Seed QEOS-P2-20 Hosted Evidence Portal

Objective: hosted viewer を複数run横断の静的evidence portalへ拡張する。

Status: planned

Requirements:

- `code-to-gate viewer --portal --from <runs-dir>` と `hosted-evidence-portal@v1` manifest を追加する。
- portal は複数run、historical SLO、release pack、manual-bb、PR review backlink を横断検索できる。
- portal は外部network不要で redaction profile を尊重する。

Commands:

- `npx vitest run src/cli/__tests__/viewer.test.ts src/viewer/__tests__/report-viewer.test.ts tests/integration/schema-coverage.test.ts --reporter=dot`
- `npm run build`
- `npm run quality:spec-drift`

## Task Seed QEOS-P1-21 GitHub App Health Evidence

Objective: GitHub App の token取得、権限、rate limit、comment更新結果を稼働診断artifactとして残す。

Status: done

Requirements:

- `github-app-health@v1` に repository permission と rate limit summary を追加する。
- `pr-review-publish` は投稿/更新/失敗時に health artifact を出力する。
- `doctor` は静的workflow診断、health artifact は実App稼働診断を担う。

Commands:

- `npx vitest run src/cli/__tests__/pr-review-publish.test.ts src/github/__tests__/api-client.test.ts tests/integration/schema-coverage.test.ts --reporter=dot`
- `npm run build`
- `npm run quality:spec-drift`

## Task Seed QEOS-P0-22 QEOS Acceptance Matrix Artifact

Objective: QEOS要件、仕様acceptance、schema、CLI、テスト、CI gate の対応表を機械可読に出す。

Status: planned

Requirements:

- `qeos-acceptance-matrix@v1` schema と `code-to-gate qeos matrix --from <repo-or-artifact-dir>` を追加する。
- matrix は QEOS ID、requirement、spec acceptance、schema、CLI、test command、CI gate、status、evidence link を保持する。
- missing evidence は `needs_evidence` として明示する。

Commands:

- `npx vitest run src/cli/__tests__/qeos-matrix.test.ts tests/integration/schema-coverage.test.ts --reporter=dot`
- `npm run build`
- `npm run quality:spec-drift`
