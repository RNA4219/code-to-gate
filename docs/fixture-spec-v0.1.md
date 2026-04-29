# code-to-gate v0.1 Fixture 仕様

**バージョン**: v1alpha1  
**対象**: `fixtures/demo-shop-ts`, `fixtures/demo-auth-js`, `fixtures/demo-ci-imports`  
**目的**: `docs/acceptance-v0.1.md` の fixture 受入条件を実装可能な入力仕様へ落とし込む。

---

## 1. 共通方針

v0.1 fixture は、code-to-gate の TS/JS scan、core rule findings、外部解析 import、risk/test seed/readiness 生成を検収するための synthetic repo とする。

必須方針:

- public fixture はすべて synthetic とし、実在サービス、社内コード、社内解析結果を含めない。
- fixture 内のコードは小さく保ち、smell が実装者と rule evaluator の両方から読み取れるようにする。
- smell は「検出されるべき行」を明確にし、期待 finding の evidence が repo root 相対パスと 1-based line を持てるようにする。
- `scan` で `files`, `symbols`, `relations`, `tests`, `entrypoints` が空にならない構成にする。
- 生成 artifact は `ctg/v1alpha1`、`EvidenceRef`、`FindingsArtifact`、`RiskRegisterArtifact`、`TestSeedsArtifact`、`ReleaseReadinessArtifact` の契約に合わせる。
- LLM narrative は補助情報に留め、finding の evidence、severity、readiness status は deterministic rule/policy で再現できること。

推奨ディレクトリ:

```text
fixtures/
  demo-shop-ts/
  demo-auth-js/
  demo-ci-imports/
  policies/
    strict.yaml
```

---

## 2. `demo-shop-ts`

### 2.1 目的

EC checkout/order flow の critical path を題材に、金額改ざん、認可不足、server validation 不足、重要経路のテスト不足を検出する。v0.1 では `CLIENT_TRUSTED_PRICE` により `blocked_input` を確実に再現する代表 fixture とする。

### 2.2 ファイル構成案

```text
fixtures/demo-shop-ts/
  package.json
  tsconfig.json
  src/
    api/
      order/
        create.ts
    auth/
      guard.ts
    domain/
      cart.ts
      pricing.ts
    db/
      orders.ts
    tests/
      cart.test.ts
```

各ファイルの役割:

| path | 役割 |
|---|---|
| `src/api/order/create.ts` | checkout/order entrypoint。request body の `price` または `total` を信頼して注文を作る。 |
| `src/auth/guard.ts` | weak auth guard。token の存在確認のみ、role/session 検証なし。 |
| `src/domain/cart.ts` | cart item と quantity を扱う通常ロジック。 |
| `src/domain/pricing.ts` | 本来 server 側価格計算に使うべき関数。ただし `create.ts` から使われない状態にする。 |
| `src/db/orders.ts` | order persistence の薄い adapter。 |
| `src/tests/cart.test.ts` | cart の smoke/regression のみ。checkout/order entrypoint の negative/abuse test は置かない。 |

### 2.3 含める smell

| smell | 実装例 | 期待 rule |
|---|---|---|
| client trusted price | `create.ts` で `req.body.total` や `req.body.items[].price` をそのまま `createOrder` に渡す | `CLIENT_TRUSTED_PRICE` |
| weak auth guard | `Authorization` header の有無だけで user を authenticated 扱いにする | `WEAK_AUTH_GUARD` |
| missing server validation | quantity、sku、price、currency の型・範囲・整合性を route handler で検証しない | `MISSING_SERVER_VALIDATION` |
| untested critical path | `src/api/order/create.ts` を直接または間接にテストする file/relation がない | `UNTESTED_CRITICAL_PATH` |

### 2.4 期待 finding

最低限:

- `ruleId=CLIENT_TRUSTED_PRICE`
- `category=payment`
- `severity=critical`
- `confidence>=0.8`
- evidence は `src/api/order/create.ts` の client supplied price/total を参照する。
- `affectedEntrypoints` に checkout/order route 相当を含める。
- `upstream.tool=native`

追加で期待:

- `WEAK_AUTH_GUARD`: `src/auth/guard.ts` または `src/api/order/create.ts` の guard 呼び出し不足を evidence にする。
- `MISSING_SERVER_VALIDATION`: `src/api/order/create.ts` の request body 利用箇所を evidence にする。
- `UNTESTED_CRITICAL_PATH`: `src/api/order/create.ts` と test relation 不足を evidence または graph-derived evidence にする。

### 2.5 期待 risk

`risk-register.yaml` には、少なくとも次を含める。

| 項目 | 期待値 |
|---|---|
| title | client supplied price による金銭損失または不正注文 |
| severity | `critical` |
| likelihood | `medium` 以上 |
| impact | `financial_loss`, `fraud`, `revenue_integrity` など |
| sourceFindingIds | `CLIENT_TRUSTED_PRICE` finding の id を含む |
| evidence | `src/api/order/create.ts` の evidence を引き継ぐ |
| recommendedActions | server side price lookup、total 再計算、negative/abuse test 追加 |

### 2.6 期待 test seed

`test-seeds.json` には、少なくとも次を含める。

| intent | suggestedLevel | 内容 |
|---|---|---|
| `negative` | `integration` または `e2e` | client が `total=1` や商品単価を改ざんした注文を拒否する。 |
| `abuse` | `e2e` または `manual` | 複数 item、割引、currency を混ぜた改ざん request で server 再計算との差分を検証する。 |
| `regression` | `unit` または `integration` | server side `pricing.ts` を通して注文 total が決まることを固定する。 |

### 2.7 期待 readiness

- `release-readiness.status=blocked_input`
- `counts.critical>=1`
- `failedConditions` に critical finding または payment threshold 超過を含める。
- CLI `analyze --require-llm` の deterministic artifact が揃う場合、LLM narrative の有無にかかわらず critical finding により exit code `1` とする。

---

## 3. `demo-auth-js`

### 3.1 目的

JS の route 構成で、public route と protected/admin route が混在する状態を作り、admin guard 不足と try/catch swallow を検出する。`demo-shop-ts` より小さく、auth/maintainability rule の検収に使う。

### 3.2 ファイル構成案

```text
fixtures/demo-auth-js/
  package.json
  src/
    server.js
    routes/
      public.js
      account.js
      admin.js
    auth/
      middleware.js
    services/
      audit-log.js
    tests/
      public.test.js
```

各ファイルの役割:

| path | 役割 |
|---|---|
| `src/server.js` | route 登録。public/protected/admin の混在を graph に出す。 |
| `src/routes/public.js` | 認証不要 route。比較対象として置く。 |
| `src/routes/account.js` | 通常 protected route。middleware を使う。 |
| `src/routes/admin.js` | admin route。admin role guard を省く、または weak guard のみで通す。 |
| `src/auth/middleware.js` | `requireUser` はあるが `requireAdmin` が未使用または不完全。 |
| `src/services/audit-log.js` | `catch (e) {}` やログなし return で swallow する。 |
| `src/tests/public.test.js` | public route のみテストし、admin deny path は未テストにする。 |

### 3.3 含める smell

| smell | 実装例 | 期待 rule |
|---|---|---|
| admin route guard 不足 | `/admin/users` や `/admin/reports` が `requireUser` のみ、または middleware なし | `WEAK_AUTH_GUARD` |
| try/catch swallow | `catch (err) { return null; }`、`catch (err) {}`、監査ログ失敗を握りつぶす | `TRY_CATCH_SWALLOW` |
| public/protected route 混在 | `server.js` で public route と account/admin route を同居させる | graph/entrypoint evidence |

### 3.4 期待 finding

最低限:

- `ruleId=WEAK_AUTH_GUARD`
- `category=auth`
- `severity=high` 以上
- evidence は `src/routes/admin.js` の admin route 定義、または `src/server.js` の admin route 登録を参照する。

最低限:

- `ruleId=TRY_CATCH_SWALLOW`
- `category=maintainability`
- `severity=medium` 以上
- evidence は `src/services/audit-log.js` の catch block を参照する。

補足:

- `WEAK_AUTH_GUARD` は protected/account route ではなく admin route を主 evidence にする。
- public route の存在は false positive 抑制の比較材料として使い、public route 自体を finding にしない。

### 3.5 期待 risk

`risk-register.yaml` には、少なくとも次を含める。

| 項目 | 期待値 |
|---|---|
| title | admin endpoint の認可不足による権限昇格 |
| severity | `high` または `critical` |
| impact | `unauthorized_access`, `privilege_escalation`, `audit_gap` など |
| sourceFindingIds | `WEAK_AUTH_GUARD` finding の id を含む |
| recommendedActions | admin role guard 追加、deny path test、audit logging failure の可視化 |

`TRY_CATCH_SWALLOW` 由来の risk は、監査ログ欠落、障害検知遅延、調査不能性として `medium` 以上で出してよい。

### 3.6 期待 test seed

| intent | suggestedLevel | 内容 |
|---|---|---|
| `negative` | `integration` | non-admin user が admin route にアクセスした場合に 403 になる。 |
| `abuse` | `e2e` または `manual` | user token のみで admin 操作を試行し、状態変更されないことを確認する。 |
| `regression` | `unit` または `integration` | audit log failure が握りつぶされず、少なくとも observable な error/metric になる。 |

### 3.7 期待 readiness

- `release-readiness.status` は `needs_review` または `blocked_input`。
- strict policy で auth high finding を blocking にする場合は `blocked_input`。
- default policy で human review threshold に留める場合は `needs_review`。
- `failedConditions` または `recommendedActions` に admin guard と try/catch swallow の両方を反映する。

---

## 4. `demo-ci-imports`

### 4.1 目的

外部ツール結果を code-to-gate の normalized findings と coverage/test evidence に取り込む import 検収用 fixture とする。実コード解析よりも、ESLint JSON、Semgrep JSON、TypeScript diagnostics JSON、coverage summary の正規化を主目的にする。

### 4.2 ファイル構成案

```text
fixtures/demo-ci-imports/
  package.json
  src/
    index.ts
    config.ts
    user.ts
  tests/
    user.test.ts
  eslint.json
  semgrep.json
  tsc.json
  coverage-summary.json
```

各ファイルの役割:

| path | 役割 |
|---|---|
| `src/index.ts` | import target になる通常 source。 |
| `src/config.ts` | ESLint または Semgrep の指摘対象にする。 |
| `src/user.ts` | TypeScript diagnostics と coverage の対象にする。 |
| `tests/user.test.ts` | coverage summary が参照する test file。 |
| `eslint.json` | ESLint formatter JSON の synthetic output。 |
| `semgrep.json` | Semgrep JSON の synthetic output。 |
| `tsc.json` | TypeScript diagnostics の synthetic normalized input。 |
| `coverage-summary.json` | Istanbul/nyc 互換の coverage summary。 |

### 4.3 含める外部結果

| file | 含める内容 | normalized finding 期待 |
|---|---|---|
| `eslint.json` | `no-empty`, `no-console`, `@typescript-eslint/no-floating-promises` などのうち 1 件以上 | `upstream.tool=eslint`, `upstream.ruleId` 保持 |
| `semgrep.json` | security または correctness 系 rule 1 件以上 | `upstream.tool=semgrep`, `upstream.ruleId` 保持 |
| `tsc.json` | `TS2322` や `TS7006` など location 付き diagnostic 1 件以上 | `upstream.tool=tsc`, `upstream.ruleId=TSxxxx` |
| `coverage-summary.json` | uncovered line/branch が分かる summary | coverage evidence、coverage gap test seed |

外部結果は、参照先 file/line が fixture 内に存在するようにする。存在しない参照を混ぜる場合は別テスト用に限定し、v0.1 happy path では import 失敗なしにする。

### 4.4 期待 finding

最低限:

- external findings が `findings.json` の `findings[]` に正規化される。
- 各 finding は `evidence.kind=external` を持つ。
- `evidence.externalRef.tool` に `eslint`, `semgrep`, `tsc` のいずれかが入る。
- `upstream.tool` と `upstream.ruleId` が元 tool の値を保持する。
- severity は tool 固有値を code-to-gate の `low|medium|high|critical` に map する。

severity mapping の推奨:

| upstream | 入力例 | code-to-gate |
|---|---|---|
| ESLint | warning | `medium` |
| ESLint | error | `high` |
| Semgrep | WARNING | `medium` |
| Semgrep | ERROR | `high` |
| TypeScript | error | `high` |
| Coverage | uncovered critical file | `medium` または `high` |

### 4.5 期待 risk

`demo-ci-imports` は critical release block の代表ではない。risk は import 結果から次のように生成する。

| 起点 | risk 例 | severity |
|---|---|---|
| Semgrep finding | unsafe pattern または injection-prone code の混入 | `high` |
| TypeScript diagnostic | 型不整合による runtime failure | `medium` または `high` |
| Coverage gap | 重要 file の未カバー branch による regression 見逃し | `medium` |

各 risk は external finding id と evidence を参照する。

### 4.6 期待 test seed

| intent | suggestedLevel | 内容 |
|---|---|---|
| `regression` | `unit` | TypeScript diagnostic の対象関数に型境界の unit test を追加する。 |
| `negative` | `integration` | Semgrep 指摘箇所に不正入力を与えて reject/sanitize を確認する。 |
| `boundary` | `unit` | coverage が不足している branch の境界値を追加する。 |

### 4.7 期待 readiness

- import 失敗なしの場合、CLI exit code は `0` または `1`。
- blocking threshold を超える high/critical がなければ `passed_with_risk` または `needs_review`。
- Semgrep high を strict policy で blocking にする場合は `blocked_input` でもよいが、v0.1 acceptance の主目的は import 正規化であり、必須期待は「import 失敗なし」と「upstream 情報保持」とする。

---

## 5. 実装者向け検収メモ

fixture 実装後、最低限次を確認する。

```powershell
code-to-gate scan fixtures/demo-shop-ts --out .qh
code-to-gate analyze fixtures/demo-shop-ts --emit all --out .qh --require-llm
code-to-gate import semgrep fixtures/demo-ci-imports/semgrep.json --out .qh/imports
code-to-gate readiness fixtures/demo-shop-ts --policy fixtures/policies/strict.yaml --out .qh
```

期待:

- `demo-shop-ts` は `CLIENT_TRUSTED_PRICE` critical finding と `blocked_input` を再現する。
- `demo-auth-js` は `WEAK_AUTH_GUARD` と `TRY_CATCH_SWALLOW` を再現する。
- `demo-ci-imports` は external finding の `upstream.tool` / `upstream.ruleId` を失わない。
- すべての finding/risk/test seed は evidence を持つ。
- public fixture に private code、private result、company-specific rule を含めない。
