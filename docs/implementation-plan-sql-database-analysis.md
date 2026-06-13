---
intent_id: INT-SQL-DATABASE-ANALYSIS-001
owner: code-to-gate-team
status: done
last_reviewed_at: 2026-06-11
next_review_due: 2026-07-11
---

# SQL・データベース変更リスク解析 実装計画

## Objective

`SPEC-29`を、既存stable artifactを破壊せず、明示的な`--database-analysis`指定時だけ動作する一括機能として実装・検収する。

## Scope

- In: SQL/migration探索、`database-assets@v1alpha1`、8 DB rule、scan/analyze/diff配線、schema/fixture/docs/acceptance
- Out: 実DB接続、ORM固有migration完全解析、migration実行、release decision

## Architecture

- `normalized-repo-graph@v1`へ`sql` languageや`migration` roleを追加しない。
- SQLファイルはdatabase analyzerが探索し、DB rule評価用の内部graphにだけ追加する。
- 通常のrule評価は`CORE_RULES`、明示フラグ時は`CORE_RULES + DATABASE_RULES`を使用する。
- `database-assets.json`はoptional artifactとして出力・検証する。

## Task Seed Ledger

| Wave | Task Seed | Objective | Dependency |
|---|---|---|---|
| 0 | `20260611-01` | 契約・計画・台帳整合 | - |
| 1 | `20260611-02` | database asset型・schema | 01 |
| 1 | `20260611-03` | SQL lightweight parser | 02 |
| 2 | `20260611-04` | destructive operation rules | 03 |
| 2 | `20260611-05` | schema change rules | 04 |
| 2 | `20260611-06` | migration operation rules | 05 |
| 3 | `20260611-07` | scan配線 | 06 |
| 3 | `20260611-08` | analyze/diff配線 | 07 |
| 4 | `20260611-09` | fixture・統合・性能検証 | 08 |
| 4 | `20260611-10` | 公開契約・Acceptance | 09 |

## Acceptance Criteria

- `--database-analysis`なしのscan/analyze/diff結果が既存契約を維持する。
- フラグ指定時に`database-assets.json`とDB findingsを生成する。
- `database-assets@v1alpha1`と既存artifactがschema-validである。
- 8 ruleにpositive/negative/refutation testがある。
- SQL解析はread-only、local-onlyで、実DBやnetworkへ接続しない。
- lint、typecheck、smoke、architecture、package、対象unit/integration testが通る。

## Verification Commands

```bash
npm run lint
npm run typecheck
npm run test:smoke
npm run test:architecture
npm run test:package
npx vitest run src/adapters/__tests__/sql-lightweight-parser.test.ts src/rules/__tests__/db-destructive-ops.test.ts src/rules/__tests__/db-schema-change.test.ts src/rules/__tests__/db-migration-ops.test.ts tests/integration/demo-migrations-ts.test.ts --maxWorkers=1
```

## References

- `docs/specs/SPEC-29-sql-database-analysis.md`
- `docs/task-seeds/SPEC-29-ledger.md`
- `docs/tasks/20260611-01-sql-database-contract-foundation.md`
- `docs/acceptance/ACCEPTANCE_TEMPLATE.md`
