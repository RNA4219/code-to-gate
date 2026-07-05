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

Requirements:

- `readiness --baseline <path>` を追加する。
- policy `baseline.enabled` / `baseline.file` でも有効化できる。
- baseline summary を `release-readiness.json` に optional field として出す。
- 既存 schema consumer を壊さない。

Commands:

- `npx vitest run src/cli/__tests__/readiness.test.ts --reporter=dot`
- `npm run build`

## Task Seed QEOS-P1-01 Evidence DAG

Objective: findings、audit、readiness、QEG、manual-bb、Gatefield、CI artifact を横断する証跡DAGを出す。

Status: in_progress

Requirements:

- `evidence-dag.json` schema を追加する。
- artifact hash と `run_id` を node metadata に含める。
- QEG export と重複せず、QEG が消費できる evidence projection にする。
- `export evidence-dag` で生成できる。

## Task Seed QEOS-P1-02 Spec Drift Detector

Objective: docs/schema/CLI/test の不整合を release risk として検出する。

Status: in_progress

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

Requirements:

- finding、evidence、artifact hash、schema validation、CI run を表示する。
- 大きい artifact でも初期表示を軽くする。
- hosted static report と共有可能な renderer にする。

## Task Seed QEOS-P1-04 Auto Test Selection

Objective: diff blast radius と repo graph から推奨テストを出す。

Requirements:

- changed file、importer、entrypoint、test file relation を使う。
- `test-plan.json` と human-readable summary を出す。
- manual-bb seed へ oracle gap を渡す。

## Task Seed QEOS-P2/P3 Backlog

- QEOS-002 PR Reviewer Bot
- QEOS-006 Rule SDK
- QEOS-007 Quality Packs
- QEOS-011 Schema Evolution
- QEOS-012 Importer Expansion
- QEOS-013 Release Evidence Pack
- QEOS-014 Policy DSL
- QEOS-015 Ownership / Module Risk
- QEOS-016 `ctg doctor`
- QEOS-017 Plugin Marketplace
- QEOS-018 AI Code Review Mode
- QEOS-019 Historical Quality Trend
- QEOS-020 Hosted Static Report
