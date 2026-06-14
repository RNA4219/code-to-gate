---
spec_id: SPEC-29
intent_id: INT-SQL-DATABASE-ANALYSIS-001
owner: code-to-gate-team
status: done
priority: P1
last_reviewed_at: 2026-06-14
next_review_due: 2026-07-14
---

# SPEC-29: SQL・データベース変更リスク解析

## 1. 目的

リポジトリ内のSQLスキーマおよびmigrationを静的解析し、データベース変更に伴う破壊的変更、整合性低下、移行失敗、ロールバック困難化の候補を証拠付きで出力する。

code-to-gateは、レビューが必要なリスク候補と追加テスト観点を生成するevidence producerに留まり、実DBの変更、migrationの実行、リリース可否の最終判断は行わない。

## 2. 背景

現状の`RAW_SQL`ルールは、アプリケーションコード内で動的に組み立てられたSQLとSQL injection候補を検出する。一方、`.sql`ファイルやmigrationそのものが引き起こす次のリスクは評価対象外である。

- table・column・constraintの削除による後方互換性の破壊
- 既存データを考慮しない`NOT NULL`追加や型変更
- index・foreign key・unique constraint削除による性能または整合性低下
- transaction境界やrollback手順が不明なmigration

## 3. Scope

### In Scope

- リポジトリ内の`.sql`ファイルの検出
- SQL DDLおよびmigration操作の静的抽出
- PostgreSQL、MySQL、SQLiteの共通DDL構文
- migration単体のリスク解析
- base/head間のSQL変更差分解析
- finding、risk seed、test seed、release-readiness入力への変換
- parser不明・方言不明・解析不能箇所のdiagnostic化

### Out of Scope

- 実DBへの接続、schema introspection、query実行
- migrationの自動実行、修正、rollback実行
- 本番データ量や実行時間の断定
- ORM固有migrationの完全解析
- DMLの完全な意味解析およびquery optimizer相当の性能評価
- stored procedure、trigger、view内部処理の完全解析
- release decisionまたは自動承認

## 4. 利用者とユースケース

| 利用者 | ユースケース | 期待結果 |
|---|---|---|
| 開発者 | PRで追加したmigrationを確認する | 破壊的変更候補と根拠行を確認できる |
| QA | DB変更に必要なテスト観点を抽出する | migration前後の互換性・整合性テストseedを得る |
| リリース担当 | DB変更を含むリリースを評価する | 未解消のhigh/critical findingをreadiness材料として確認できる |

## 5. 入力契約

### 5.1 対象ファイル

- 拡張子が`.sql`のUTF-8テキストファイルを対象とする。
- migration source内の埋め込みSQLはbest-effortで抽出してよいが、ORM固有意味解析は行わない。
- `test`、`fixture`、`generated`として分類されたファイルは、既定ではリスクfindingの対象外とする。
- pathに`migration`、`migrations`、`schema`、`database`、`db`を含むファイルはmigrationまたはschema候補として分類する。
- 文字コード不明、読み込み失敗、サイズ上限超過は解析を中断せずdiagnosticとして記録する。

### 5.2 対象SQL操作

初期対応で抽出する操作を次に限定する。

| 操作 | 最低限抽出する情報 |
|---|---|
| `CREATE TABLE` | table名、column名、型、nullability、default、主要constraint |
| `ALTER TABLE` | table名、追加・変更・削除対象、操作種別 |
| `DROP TABLE` / `DROP COLUMN` | 削除対象、`IF EXISTS`有無 |
| `CREATE INDEX` / `DROP INDEX` | index名、対象table、unique有無 |
| constraint追加・削除 | primary key、foreign key、unique、check |

SQL方言を確定できない場合は共通構文として解析し、方言固有の断定を行わない。

## 6. 出力契約

### 6.1 Database Assets Artifact

SQL解析結果は、stable freeze中の`normalized-repo-graph@v1`を変更せず、独立した実験的artifactとして出力する。

```json
{
  "version": "ctg/v1",
  "artifact": "database-assets",
  "schema": "database-assets@v1alpha1",
  "completeness": "complete",
  "dialects": ["postgresql"],
  "files": [],
  "objects": [],
  "operations": [],
  "diagnostics": []
}
```

必須契約:

- 同一入力から生成されるobject・operation IDと配列順は決定的である。
- 各operationは、repo root相対pathと1-based行番号を持つevidenceへ追跡できる。
- 解析不能箇所がある場合は`completeness: partial`とし、解析できた結果を破棄しない。
- SQL方言の推定値にはconfidenceを持たせ、確定情報として扱わない。

### 6.2 Existing Artifacts

検出結果は既存の次のartifact契約へ変換できること。

- `findings.json`: DB変更リスク候補
- `risk-register.yaml`: 影響と推奨確認事項
- `test-seeds.json`: migration前後の追加テスト観点
- `release-readiness.json`: policyによる判定材料
- `results.sarif`: SQLファイル上の根拠位置

既存artifact schemaの必須field、enum、意味を変更してはならない。

## 7. 検出ルール

初期対応では次のルールを提供する。

| Rule ID | 検出候補 | 既定Severity | 必須の反証・緩和材料 |
|---|---|---:|---|
| `DB_DROP_TABLE` | table削除 | critical | 明示的な互換期間または承認済み削除根拠 |
| `DB_DROP_COLUMN` | column削除 | high | 利用停止済み根拠または段階移行 |
| `DB_ADD_NOT_NULL_WITHOUT_DEFAULT` | defaultやbackfill根拠なしの`NOT NULL`追加 | high | default、backfill、空tableの根拠 |
| `DB_RISKY_TYPE_CHANGE` | narrowingまたは互換性不明の型変更 | high | 安全な変換根拠または検証済みmigration |
| `DB_DROP_CONSTRAINT` | primary key、foreign key、unique、checkの削除 | high | 代替整合性保証 |
| `DB_DROP_INDEX` | index削除 | medium | 不要性または代替indexの根拠 |
| `DB_MIGRATION_NO_TRANSACTION_SIGNAL` | 複数の破壊的操作にtransaction境界が見つからない | medium | runner側transaction保証または非transaction必須の根拠 |
| `DB_ROLLBACK_NOT_EVIDENCED` | 破壊的変更にrollbackまたは復旧根拠が見つからない | medium | rollback、backup、forward-fix手順 |

ルールはリスク候補を示すものであり、実行失敗、データ損失、性能劣化を断定してはならない。

## 8. 差分解析契約

- base/headの両方が指定された場合、追加・削除・変更されたSQL操作を比較する。
- head側で新たに導入されたリスク候補を優先して出力する。
- rename、複数migrationへの分割、同一PR内の緩和操作を可能な範囲で関連付ける。
- 関連付けできない場合は推測で相殺せず、review-required候補またはunsupported claimとして残す。
- SQL以外のアプリケーションコードとの互換性推論は初期対応の必須条件としない。

## 9. Test Seed契約

DB変更findingから生成するtest seedは、少なくとも次の観点を表現できること。

- migration適用前後のschema期待値
- 既存データを保持した適用可否
- old application / new schemaの互換性
- new application / old schemaの互換性
- constraintおよびnullabilityの境界値
- rollbackまたはforward-fixの手動確認

期待結果を根拠化できないseedは`oracle_gaps`または`known_gaps`へ記録する。

## 10. エラー・部分成功

| 条件 | 挙動 |
|---|---|
| SQLファイルが存在しない | 成功。database assetとDB findingは空 |
| 一部SQLを解析できない | 部分成功。diagnosticを出し、completenessを`partial`にする |
| SQL方言を特定できない | 共通構文のみ解析し、方言不明diagnosticを出す |
| 全対象SQLを読み込めない | 入力失敗として扱い、既存CLIエラーモデルへ従う |
| 実DB接続情報を検出した | 接続せず、秘密値をartifactへ出力しない |

## 11. 非機能要件

### セキュリティ

- SQL解析はlocal-firstかつread-onlyとする。
- DB credential、connection string、環境変数値を出力artifactへ含めない。
- 外部ネットワークおよび実DB接続を要求しない。

### 互換性

- `normalized-repo-graph@v1`、`findings@v1`、既存CLIの意味を破壊しない。
- `database-assets@v1alpha1`は実験的契約として扱い、stable化前に利用者レビューを行う。
- DB解析を無効化した場合、既存のscan/analyze結果と終了コードを維持する。

### 性能・決定性

- SQLファイル合計10 MiB、1000ファイルのfixtureを通常の開発端末で30秒以内に解析することを目標とする。
- 同一入力・同一設定では、時刻など共通headerを除き、ID、finding、operation順序が安定する。

## 12. Acceptance Criteria

- `.sql`ファイルから対象DDL操作と根拠行を抽出できる。
- PostgreSQL、MySQL、SQLiteの共通DDL fixtureで主要操作を識別できる。
- 8つの初期ルールにpositive、negative、refutationのfixtureがある。
- base/head差分からhead側で追加された破壊的変更候補を識別できる。
- SQL方言不明・部分解析失敗を誤って完全成功として扱わない。
- `database-assets@v1alpha1`がschema validationを通過する。
- 既存artifactと`normalized-repo-graph@v1`のcontract testが回帰しない。
- SQL findingがSARIF、risk、test seed、release-readiness入力へ追跡可能である。
- 実DBへ接続せず、credentialまたはconnection string値をartifactへ出力しない。
- lint、typecheck、smoke、architecture、packageの既存ゲートが通過する。

## 13. 制約とガードレール

- regex一致だけでデータ損失やmigration失敗を断定しない。
- evidenceなしのfindingを生成しない。
- 方言固有構文を共通構文として誤解釈した場合はconfidenceを下げ、diagnosticを残す。
- stable schemaのenum追加など、後方互換性が不明な変更は別仕様またはmajor schema変更として扱う。
- 実装タスクは本仕様承認後にTask Seedへ分割する。

## 14. 未決事項

| ID | 論点 | 仕様確定前の既定方針 |
|---|---|---|
| OQ-01 | DB解析を既定有効にするか | 初期導入は明示有効化を優先する |
| OQ-02 | `database-assets`を常時出力するか | SQL対象がある場合のみ出力を優先する |
| OQ-03 | transaction保証をmigration runner設定から読むか | 初期対応ではSQL本文のsignalのみ扱う |
| OQ-04 | rollback evidenceの探索範囲 | 同一migrationと隣接down/revertファイルを優先する |
| OQ-05 | ORM migration対応の優先順位 | 利用実績を確認後、別仕様で定義する |

## 15. 参照

- `BLUEPRINT.md`
- `GUARDRAILS.md`
- `docs/requirements.md`
- `docs/artifact-contracts.md`
- `docs/error-model.md`
- `docs/specs/assurance-diff-semantic-spec.md`
- `src/rules/raw-sql.ts`
- `src/core/repo-graph-builder.ts`
- `schemas/normalized-repo-graph.schema.json`
