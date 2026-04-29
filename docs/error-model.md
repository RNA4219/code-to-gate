# code-to-gate Error Model

**バージョン**: v1alpha1  
**作成日**: 2026-04-29  
**適用範囲**: CLI、Library API、CI integration

---

## 1. 基本方針

code-to-gate は CI で使われるため、失敗を曖昧にしない。

- tool 実行失敗と release readiness の blocking は区別する。
- artifact が生成できた場合は、可能な限り `.qh/audit.json` を残す。
- 部分成功は成功扱いにせず、`completeness=partial` と status で表現する。
- CI は exit code と `release-readiness.json.status` の両方を読める。

---

## 2. Exit Code

| code | 名前 | 意味 | artifact |
|---:|---|---|---|
| 0 | `OK` | 実行成功。status は `passed` または `passed_with_risk` | complete または warning partial |
| 1 | `READINESS_NOT_CLEAR` | 実行成功。ただし status は `needs_review` または `blocked_input` | 生成される |
| 2 | `USAGE_ERROR` | CLI 引数、path、mode、format 指定が不正 | audit 可能なら生成 |
| 3 | `SCAN_FAILED` | repo scan / parser が致命的に失敗 | partial graph 可能なら生成 |
| 4 | `LLM_FAILED` | LLM 必須 phase が失敗し、要求 artifact を生成できない | deterministic artifact は生成可 |
| 5 | `POLICY_FAILED` | policy ファイル不正、未知 status、評価不能 | findings までは生成可 |
| 6 | `PLUGIN_FAILED` | plugin 起動、通信、戻り値検証に失敗 | plugin 前の artifact は生成可 |
| 7 | `SCHEMA_FAILED` | artifact schema validation に失敗 | invalid artifact は隔離 |
| 8 | `IMPORT_FAILED` | 外部ツール結果の import が失敗 | import 以外は継続可 |
| 9 | `INTEGRATION_EXPORT_FAILED` | downstream export が失敗 | core artifact は生成可 |
| 10 | `INTERNAL_ERROR` | 未分類の内部エラー | audit 可能なら生成 |

---

## 3. Command 別の成功条件

### 3.1 `scan`

成功条件:

- `.qh/repo-graph.json` が schema validation を通る。
- unsupported file があっても、対象言語ファイルが処理できていれば exit code `0`。
- すべての対象言語 parser が失敗した場合は exit code `3`。

### 3.2 `analyze`

成功条件:

- repo graph、findings、risk-register、invariants、test-seeds、analysis-report、audit が生成される。
- readiness status が `passed` または `passed_with_risk` なら exit code `0`。
- readiness status が `needs_review` または `blocked_input` なら exit code `1`。
- LLM artifact が要求されているのに LLM が完全失敗した場合は exit code `4`。

### 3.3 `diff`

成功条件:

- base / head の差分が解決できる。
- changed files と blast radius が artifact に入る。
- base ref が存在しない場合は exit code `2`。
- diff は取れるが一部ファイルが parser 失敗した場合は `partial` とし、policy に従う。

### 3.4 `readiness`

成功条件:

- policy evaluation が実行される。
- `release-readiness.json` が生成される。
- status に応じて exit code `0` または `1`。

### 3.5 `export`

成功条件:

- 指定 downstream の adapter schema に合う artifact を生成する。
- core artifact が存在しない場合は exit code `2`。
- adapter schema validation 失敗は exit code `9`。

---

## 4. 部分成功

部分成功は次の状態を指す。

| 状態 | 例 | 表現 |
|---|---|---|
| parser partial | 一部ファイルが parse 失敗 | `repo-graph.stats.partial=true` |
| import partial | Semgrep import は成功、coverage import は失敗 | `diagnostics` と exit code `8` または warning |
| LLM partial | summary は成功、invariant 生成は失敗 | `llm_sections[].status=failed` |
| export partial | core artifact は生成、Gatefield export は失敗 | exit code `9` |

部分成功時の規則:

- 生成済み artifact は削除しない。
- invalid artifact は `.qh/invalid/` に隔離する。
- `.qh/audit.json` に failure と生成済み artifact refs を残す。
- policy が `allow_partial=false` の場合、status は `needs_review` 以上にする。

---

## 5. Error Object

CLI の JSON output と audit には次の error object を含める。

```ts
export interface CtgError {
  code:
    | "USAGE_ERROR"
    | "SCAN_FAILED"
    | "LLM_FAILED"
    | "POLICY_FAILED"
    | "PLUGIN_FAILED"
    | "SCHEMA_FAILED"
    | "IMPORT_FAILED"
    | "INTEGRATION_EXPORT_FAILED"
    | "INTERNAL_ERROR";
  message: string;
  retryable: boolean;
  phase:
    | "scan"
    | "parse"
    | "import"
    | "evaluate"
    | "llm"
    | "policy"
    | "report"
    | "export"
    | "schema";
  details?: Record<string, unknown>;
  evidence?: string[];
}
```

---

## 6. Retry 方針

| 失敗 | retryable | 方針 |
|---|---:|---|
| LLM timeout | true | bounded retry する |
| LLM schema invalid | true | 1 回だけ repair prompt を試す |
| parser syntax error | false | finding ではなく diagnostic に入れる |
| policy parse error | false | 利用者修正が必要 |
| plugin process crash | true | 1 回だけ再起動 |
| schema validation failure | false | 実装または plugin の bug |

---

## 7. CI 表示

CI では次を標準出力に 1 行 JSON で出せる。

```json
{
  "tool": "code-to-gate",
  "run_id": "ctg-20260429-001",
  "exit_code": 1,
  "status": "needs_review",
  "summary": "2 high risks require review",
  "artifacts": [".qh/release-readiness.json", ".qh/risk-register.yaml"]
}
```

human-readable log は stderr に出す。machine-readable output と混ぜない。
