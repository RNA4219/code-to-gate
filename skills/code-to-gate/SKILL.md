---
name: code-to-gate
description: code-to-gate品質解析CLIツールのSkill。リポジトリ品質分析、検出ルール、ポリシー評価、リリース判定の整合性を保つ場合に使用。
---

# code-to-gate

リポジトリ品質分析CLIツール。17 core rules、任意の database analysis rules、ポリシー評価によるリリース判定。

## 概要

| 役割 | 内容 |
|------|------|
| **Analysis** | リポジトリスキャン・品質検出 |
| **Rules** | 17 core rules + optional database analysis |
| **Policy** | ポリシー評価・ブロック判定 |
| **Readiness** | リリース判定・ゲート入力生成 |

## Quick Start

```bash
# 1. core files 確認
cat src/cli/analyze.ts
cat src/rules/index.ts

# 2. build & test
npm run build
npm run test:smoke

# 3. analyze demo
node ./dist/cli.js analyze ./fixtures/demo-shop-ts --out .qh

# 4. database migration analysis
node ./dist/cli.js analyze . --database-analysis --emit all --out .qh
node ./dist/cli.js diff . --base origin/main --head HEAD --database-analysis --out .qh
```

## Integration Points

### Core Files

| File | Role |
|------|------|
| `src/cli/scan.ts` | Repository scanning |
| `src/cli/analyze.ts` | Quality analysis |
| `src/cli/readiness.ts` | Release readiness |
| `src/rules/index.ts` | Rule registry |
| `src/core/database-analyzer.ts` | Database asset extraction |
| `src/config/policy-loader.ts` | Policy parsing |
| `src/adapters/parser-registry.ts` | Language parser selection |

### Config

| File | Role |
|------|------|
| `.ctg/policy.yaml` | Quality policy |
| `.github/ctg-policy.yaml` | CI policy |
| `governance/policy.yaml` | Self-modification bounds |

## Standard Flow

### 1. 分析実行

優先ファイル:

- `src/cli/analyze.ts`
- `src/rules/index.ts`
- `src/config/policy-loader.ts`

### 2. ルール追加

- `src/rules/my-rule.ts` を作成
- `RuleEvaluator` interface を実装
- `src/rules/index.ts` に登録
- `src/rules/__tests__/my-rule.test.ts` でテスト

### 3. ポリシー評価

必須フィールド:

- `blocking.severity`: critical/high/medium/low
- `blocking.category`: auth/payment/validation/security
- `blocking.rules`: 特定ルールID
- `readiness.criticalFindingStatus`: blocked_input/needs_review

### 4. Docs/Test同期

実装変更時に更新:

- `CLAUDE.md`, `GUARDRAILS.md`, `CHECKLISTS.md`
- `CHANGELOG.md`

### 5. Validate

```bash
# core tests
npm run test:smoke

# coverage gate
npm run test:coverage

# lint
npm run lint
```

## Built-in Rules

| Rule | Category | Detection |
|------|----------|-----------|
| CLIENT_TRUSTED_PRICE | payment | Client-side price calculation |
| WEAK_AUTH_GUARD | auth | Weak authorization guards |
| MISSING_SERVER_VALIDATION | validation | Missing request validation |
| UNTESTED_CRITICAL_PATH | testing | Missing tests on entrypoints |
| TRY_CATCH_SWALLOW | maintainability | Empty/silent catch blocks |
| RAW_SQL | security | SQL string construction |
| ENV_DIRECT_ACCESS | security | Direct env var access |
| UNSAFE_DELETE | maintainability | Unsafe delete operations |
| LARGE_MODULE | maintainability | Module size thresholds |
| DEBT_MARKER | maintainability | Explicit debt markers |
| SUPPRESSION_DEBT | maintainability | Suppressions that need repayment |
| HARDCODED_SECRET | security | Hardcoded secrets/credentials |
| MISSING_RATE_LIMIT | security | Missing rate limiting |
| UNSAFE_REDIRECT | security | Unsafe redirect patterns |
| DEPRECATED_API_USAGE | maintainability | Deprecated API usage |
| CIRCULAR_DEPENDENCY | maintainability | Circular dependencies |
| MISSING_INPUT_SANITIZATION | security | Unsanitized user input |

## Database Analysis Rules

`--database-analysis` 有効時に、`.sql` と migration らしい source から DDL 操作を抽出し、`database-assets.json` と DB finding を生成する。

| Rule | Category | Detection |
|------|----------|-----------|
| DB_DROP_TABLE | data | DROP TABLE without safeguards |
| DB_DROP_COLUMN | data | DROP COLUMN without rollback evidence |
| DB_ADD_NOT_NULL_WITHOUT_DEFAULT | data | NOT NULL constraint without default value |
| DB_RISKY_TYPE_CHANGE | data | Type changes with data loss risk |
| DB_DROP_CONSTRAINT | data | Dropped constraints without rollback evidence |
| DB_DROP_INDEX | data | Dropped indexes without rollback evidence |
| DB_MIGRATION_NO_TRANSACTION_SIGNAL | data | Missing transaction signal |
| DB_ROLLBACK_NOT_EVIDENCED | data | Missing rollback evidence |

## References

| File | Content |
|------|---------|
| `CLAUDE.md` | Project context |
| `GUARDRAILS.md` | Implementation principles |
| `CHECKLISTS.md` | Checklists |
| `README.md` | Overview |
