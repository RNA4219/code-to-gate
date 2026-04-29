# code-to-gate v0.1 Acceptance

**バージョン**: v1alpha1  
**作成日**: 2026-04-29  
**対象**: v0.1 Local Release Readiness MVP

---

## 1. v0.1 完成定義

v0.1 は、synthetic TS/JS repo に対して、1 コマンドでコード由来の release readiness bundle を生成できる状態を完成とする。

必須:

- TS/JS repo scan
- `NormalizedRepoGraph`
- dependency graph
- core rule findings
- LLM structured output
- risk-register
- invariants
- test-seeds
- release-readiness
- audit
- schema validation
- downstream export の最小 4 種

---

## 2. Fixture

### 2.1 `demo-shop-ts`

含めるもの:

- client trusted price
- weak auth guard
- missing server validation
- untested critical path
- checkout / order entrypoint

期待:

- `CLIENT_TRUSTED_PRICE` finding が生成される。
- severity は `critical`。
- evidence は `src/api/order/create.ts` 相当の source location を持つ。
- risk-register に金銭損失系 risk が入る。
- test-seeds に negative / abuse test seed が入る。
- release-readiness status は `blocked_input`。

### 2.2 `demo-auth-js`

含めるもの:

- admin route guard 不足
- try/catch swallow
- public route と protected route の混在

期待:

- `WEAK_AUTH_GUARD` finding が生成される。
- `TRY_CATCH_SWALLOW` finding が生成される。
- release-readiness status は `needs_review` または `blocked_input`。

### 2.3 `demo-ci-imports`

含めるもの:

- ESLint JSON
- Semgrep JSON
- TypeScript diagnostics JSON
- coverage summary

期待:

- external findings が normalized findings に入る。
- upstream tool / ruleId が保持される。
- import 失敗なしなら exit code `0` または `1`。

---

## 3. 必須コマンド

### 3.1 Scan

```powershell
code-to-gate scan fixtures/demo-shop-ts --out .qh
```

受入:

- exit code `0`
- `.qh/repo-graph.json` が存在
- schema validation 成功
- files / symbols / relations / tests / entrypoints が空でない

### 3.2 Analyze

```powershell
code-to-gate analyze fixtures/demo-shop-ts --emit all --out .qh --require-llm
```

受入:

- exit code `1`
- `.qh/findings.json` が存在
- `.qh/risk-register.yaml` が存在
- `.qh/invariants.yaml` が存在
- `.qh/test-seeds.json` が存在
- `.qh/release-readiness.json` が存在
- `.qh/audit.json` が存在
- `release-readiness.status=blocked_input`

### 3.3 Diff

```powershell
code-to-gate diff fixtures/demo-shop-ts --base main --head HEAD --out .qh
```

受入:

- changed files が artifact に入る。
- affected entrypoints が生成される。
- blast radius が空でない。

### 3.4 Import

```powershell
code-to-gate import semgrep fixtures/demo-ci-imports/semgrep.json --out .qh/imports
```

受入:

- external finding が normalized form へ変換される。
- upstream tool が `semgrep` として保存される。

### 3.5 Readiness

```powershell
code-to-gate readiness fixtures/demo-shop-ts --policy fixtures/policies/strict.yaml --out .qh
```

受入:

- `release-readiness.json` が schema validation を通る。
- critical finding により `blocked_input` になる。

### 3.6 Export

```powershell
code-to-gate export gatefield --from .qh --out .qh/gatefield-static-result.json
code-to-gate export state-gate --from .qh --out .qh/state-gate-evidence.json
code-to-gate export manual-bb --from .qh --out .qh/manual-bb-seed.json
code-to-gate export workflow-evidence --from .qh --out .qh/workflow-evidence.json
```

受入:

- 4 artifact が生成される。
- 各 adapter schema validation が成功する。

---

## 4. Schema Acceptance

必須:

```powershell
code-to-gate schema validate .qh/repo-graph.json
code-to-gate schema validate .qh/findings.json
code-to-gate schema validate .qh/test-seeds.json
code-to-gate schema validate .qh/release-readiness.json
code-to-gate schema validate .qh/audit.json
```

受入:

- すべて exit code `0`。
- invalid artifact は exit code `7`。

---

## 5. LLM Acceptance

必須:

- LLM output は structured schema に合う。
- unsupported claims は primary artifact に混入しない。
- risk narrative は finding / evidence に紐づく。
- LLM timeout を模擬した場合、deterministic artifact は残る。
- `--require-llm` で LLM 完全失敗時は exit code `4`。

---

## 6. Performance Acceptance

v0.1 の性能目標:

| 対象 | 条件 | 目標 |
|---|---|---:|
| small fixture | 100 files 未満 | scan 10 秒以内 |
| medium synthetic repo | 2,000 files / TSJS | scan 180 秒以内 |
| analyze | small fixture / remote LLM 除外 | 60 秒以内 |
| schema validation | generated artifacts | 5 秒以内 |

性能計測では LLM remote latency は別計測とする。

---

## 7. Security Acceptance

必須:

- `.env` は graph に file metadata として入れてよいが、body を LLM に送らない。
- secret-like string は redaction される。
- private plugin は OSS core に company rule を書き込まない。
- public fixtures は synthetic である。
- generated public artifact に private code / private result を含めない。

---

## 8. Done 判定

v0.1 は次を満たしたら done とする。

- acceptance command がすべて実行可能。
- generated artifact が schema validation を通る。
- `demo-shop-ts` で `blocked_input` が再現する。
- `demo-auth-js` で auth / maintainability finding が再現する。
- LLM failure test が exit code `4` または `needs_review` として再現する。
- downstream export 4 種が schema validation を通る。
