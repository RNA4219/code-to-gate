---
intent_id: RUN-001
owner: code-to-gate
status: active
last_reviewed_at: 2026-04-30
next_review_due: 2026-05-15
---

# code-to-gate RUNBOOK

実行手順、コマンド、トラブルシューティング。

## 1. 前提確認

実行前に確認:

```powershell
# Node.js 18+ 確認
node --version

# TypeScript 確認 (adapter 用)
npm list typescript

# LLM provider 確認
# OpenAI
$env:OPENAI_API_KEY = "sk-..."
# Anthropic
$env:ANTHROPIC_API_KEY = "sk-ant-..."
# Alibaba Cloud
$env:ALIBABA_API_KEY = "..."
# OpenRouter
$env:OPENROUTER_API_KEY = "..."
# ollama (local)
ollama list
# llama.cpp (local)
./llama-cli --version
```

---

## 2. CLI コマンド

### 2.1 scan

repo 構造を解析し、NormalizedRepoGraph を生成。

```powershell
# 基本実行
code-to-gate scan <repo-path> --out <output-dir>

# 例
code-to-gate scan ./my-repo --out .qh

# 出力
# .qh/repo-graph.json
```

Options:
- `--out <dir>`: 出力ディレクトリ (default: `.qh`)
- `--lang <langs>`: 対象言語 (例: `ts,js`)
- `--ignore <patterns>`: 除外パターン (例: `node_modules,dist`)

Exit codes:
- `0`: 成功
- `2`: USAGE_ERROR (path不正)
- `3`: SCAN_FAILED (parser致命的失敗)

---

### 2.2 analyze

scan + evaluate + LLM + report を一括実行。

```powershell
# 基本実行
code-to-gate analyze <repo-path> --emit <formats> --out <output-dir> --llm-provider <provider>

# 例 (OpenAI)
code-to-gate analyze ./my-repo --emit all --out .qh --llm-provider openai

# 例 (ollama local)
code-to-gate analyze ./my-repo --emit all --out .qh --llm-provider ollama --llm-model llama3

# 例 (llama.cpp local)
code-to-gate analyze ./my-repo --emit all --out .qh --llm-provider llama.cpp --llm-model-path ./models/qwen.gguf

# LLM 必須モード
code-to-gate analyze ./my-repo --emit all --out .qh --require-llm
```

Options:
- `--emit <formats>`: `all`, `md,json,yaml,mermaid,sarif`
- `--llm-provider <provider>`: `openai`, `anthropic`, `alibaba`, `openrouter`, `ollama`, `llama.cpp`
- `--llm-model <model>`: モデル名
- `--llm-model-path <path>`: llama.cpp 用モデルファイルパス
- `--require-llm`: LLM 成功必須 (失敗時 exit code `4`)
- `--policy <path>`: policy YAML

Outputs:
- `.qh/repo-graph.json`
- `.qh/findings.json`
- `.qh/risk-register.yaml`
- `.qh/invariants.yaml`
- `.qh/test-seeds.json`
- `.qh/release-readiness.json`
- `.qh/analysis-report.md`
- `.qh/audit.json`

Exit codes:
- `0`: passed / passed_with_risk
- `1`: needs_review / blocked_input
- `4`: LLM_FAILED (--require-llm 時)

---

### 2.3 diff

base/head 差分を解析。

```powershell
code-to-gate diff <repo-path> --base <base-ref> --head <head-ref> --out <output-dir>

# 例
code-to-gate diff ./my-repo --base main --head feature-x --out .qh
```

Options:
- `--base <ref>`: base branch/commit
- `--head <ref>`: head branch/commit

Outputs:
- `.qh/repo-graph.json` (changed_files 含む)
- `.qh/blast-radius.json`

---

### 2.4 import

外部ツール結果を取り込み。

```powershell
# ESLint
code-to-gate import eslint <eslint.json> --out <output-dir>

# Semgrep
code-to-gate import semgrep <semgrep.json> --out <output-dir>

# TypeScript diagnostics
code-to-gate import tsc <tsc.json> --out <output-dir>

# Coverage
code-to-gate import coverage <coverage-summary.json> --out <output-dir>

# 例
code-to-gate import semgrep ./semgrep-results.json --out .qh/imports
```

Exit codes:
- `0`: import 成功
- `8`: IMPORT_FAILED

---

### 2.5 readiness

release readiness を評価。

```powershell
code-to-gate readiness <repo-path> --policy <policy.yaml> --out <output-dir>

# 例
code-to-gate readiness ./my-repo --policy ./policies/strict.yaml --out .qh
```

Outputs:
- `.qh/release-readiness.json`

---

### 2.6 export

downstream adapter 用 payload を生成。

```powershell
# agent-gatefield 用
code-to-gate export gatefield --from <.qh> --out <output-file>

# agent-state-gate 用
code-to-gate export state-gate --from <.qh> --out <output-file>

# manual-bb-test-harness 用
code-to-gate export manual-bb --from <.qh> --out <output-file>

# workflow-cookbook 用
code-to-gate export workflow-evidence --from <.qh> --out <output-file>

# 例
code-to-gate export gatefield --from .qh --out .qh/gatefield-static-result.json
```

Exit codes:
- `0`: export 成功
- `9`: INTEGRATION_EXPORT_FAILED

---

### 2.7 schema validate

artifact schema validation。

```powershell
code-to-gate schema validate <artifact-file>

# 例
code-to-gate schema validate .qh/repo-graph.json
code-to-gate schema validate .qh/findings.json
code-to-gate schema validate .qh/release-readiness.json
```

Exit codes:
- `0`: valid
- `7`: SCHEMA_FAILED

---

### 2.8 plugin

plugin 管理。

```powershell
# plugin 一覧
code-to-gate plugin list

# plugin 検証
code-to-gate plugin doctor <plugin-name>

# 例
code-to-gate plugin doctor @quality-harness/rules-core
```

---

## 3. Policy YAML 形式

```yaml
apiVersion: ctg/v1alpha1
kind: release-policy
id: strict
version: 0.1.0

thresholds:
  severity:
    critical: 0      # critical が 1 件以上で blocked_input
    high: 3          # high が 4 件以上で blocked_input
  category:
    auth: 0          # auth finding が 1 件以上で blocked_input
    payment: 0       # payment finding が 1 件以上で blocked_input

allow_partial: false  # partial artifact で needs_review

llm:
  min_confidence: 0.6
  require_binding: true  # evidence binding 必須
```

---

## 4. LLM Provider 設定

### 4.1 OpenAI

```powershell
$env:OPENAI_API_KEY = "sk-..."
code-to-gate analyze ./my-repo --emit all --out .qh --llm-provider openai --llm-model gpt-4
```

### 4.2 Anthropic

```powershell
$env:ANTHROPIC_API_KEY = "sk-ant-..."
code-to-gate analyze ./my-repo --emit all --out .qh --llm-provider anthropic --llm-model claude-sonnet-4-6
```

### 4.3 Alibaba Cloud

```powershell
$env:ALIBABA_API_KEY = "..."
code-to-gate analyze ./my-repo --emit all --out .qh --llm-provider alibaba --llm-model qwen-max
```

### 4.4 OpenRouter

```powershell
$env:OPENROUTER_API_KEY = "..."
code-to-gate analyze ./my-repo --emit all --out .qh --llm-provider openrouter --llm-model deepseek/deepseek-v3
```

### 4.5 ollama (local)

```powershell
# ollama 起動
ollama serve

# モデル確認
ollama list

code-to-gate analyze ./my-repo --emit all --out .qh --llm-provider ollama --llm-model llama3
```

### 4.6 llama.cpp (local)

```powershell
# モデル準備
./llama-cli -m ./models/qwen3-8b-q4_k_m.gguf

code-to-gate analyze ./my-repo --emit all --out .qh --llm-provider llama.cpp --llm-model-path ./models/qwen3-8b-q4_k_m.gguf
```

---

## 5. トラブルシューティング

### 5.1 Exit Code 2: USAGE_ERROR

原因: CLI 引数、path、mode 指定不正

解決:
```powershell
# path 確認
ls ./my-repo

# help 確認
code-to-gate --help
code-to-gate analyze --help
```

---

### 5.2 Exit Code 3: SCAN_FAILED

原因: repo scan/parser 致命的失敗

解決:
```powershell
# 詳細ログ確認
code-to-gate scan ./my-repo --out .qh --verbose

# .qh/repo-graph.json の diagnostics 確認
# PARSER_FAILED、UNSUPPORTED_LANGUAGE を確認

# 対象言語限定
code-to-gate scan ./my-repo --out .qh --lang ts
```

---

### 5.3 Exit Code 4: LLM_FAILED

原因: LLM 接続失敗、timeout

解決:
```powershell
# API key 確認
echo $env:OPENAI_API_KEY
echo $env:ANTHROPIC_API_KEY

# モデル確認
# OpenAI: gpt-4, gpt-3.5-turbo
# Anthropic: claude-sonnet-4-6, claude-haiku-4-5

# ollama 起動確認
ollama list
curl http://localhost:11434/api/tags

# --require-llm を外して deterministic artifact を確認
code-to-gate analyze ./my-repo --emit all --out .qh
```

---

### 5.4 Exit Code 5: POLICY_FAILED

原因: policy YAML 不正

解決:
```powershell
# policy YAML 確認
cat ./policies/strict.yaml

# schema 確認
code-to-gate schema validate ./policies/strict.yaml
```

---

### 5.5 Exit Code 7: SCHEMA_FAILED

原因: artifact schema validation 失敗

解決:
```powershell
# 該当 artifact 確認
code-to-gate schema validate .qh/findings.json

# JSON 内容確認
cat .qh/findings.json | jq .

# version 確認 (ctg/v1alpha1)
```

---

### 5.6 Exit Code 8: IMPORT_FAILED

原因: 外部ツール結果 import 失敗

解決:
```powershell
# 入力ファイル確認
cat ./semgrep-results.json | jq .

# 形式確認
# ESLint: formatter JSON
# Semgrep: --json output
# Coverage: Istanbul/nyc summary
```

---

### 5.7 Exit Code 9: INTEGRATION_EXPORT_FAILED

原因: downstream adapter export 失敗

解決:
```powershell
# core artifact 確認
ls .qh/*.json

# from 指定確認
code-to-gate export gatefield --from .qh --out .qh/gatefield-static-result.json
```

---

### 5.8 unsupported_claims 多発

原因: LLM confidence 低、evidence binding 失敗

解決:
```powershell
# .qh/findings.json の unsupported_claims 確認
cat .qh/findings.json | jq '.unsupported_claims'

# confidence threshold 確認
cat ./policies/strict.yaml | grep min_confidence

# evidence 確認
cat .qh/findings.json | jq '.findings[].evidence'
```

---

### 5.9 redaction 警告

原因: secret-like string 検出

解決:
```powershell
# .qh/audit.json の redaction 確認
cat .qh/audit.json | jq '.llm.redaction_enabled'

# 環境変数確認
echo $env:OPENAI_API_KEY

# .env を repo から除外
code-to-gate scan ./my-repo --out .qh --ignore .env,secrets
```

---

## 6. 既知の負債

### 6.1 Full Vitest / coverage が安定完走していない

状態:
- `npm run build` は通過済み。
- `npx vitest run src/cli/__tests__/scan.test.ts --reporter=dot` は 38 tests pass。
- 追加機能群の targeted test は 2026-04-30 時点で `11 files / 270 tests passed`。
- `npx vitest run --maxWorkers=1 --reporter=dot` は過去に 5 分 timeout。追加機能群の安定化後、full suite は未再検証。
- `npm run test:coverage` は coverage summary 未取得。sandbox では Vitest/esbuild spawn が失敗する場合がある。

暫定運用:
```powershell
# まず型検査
npm run build

# 変更範囲の targeted test を優先
npx vitest run src/cli/__tests__/scan.test.ts --reporter=dot

# full test は長時間枠で実行し、timeout したら対象 test file を二分探索する
npx vitest run --maxWorkers=1 --reporter=dot
```

切り分け観点:
- performance tests の閾値が現環境に対して厳しすぎないか。
- integration / full-flow 系が同じ fixture scan/analyze を過剰に繰り返していないか。
- Vitest worker timeout が並列実行や残存 Node process に起因していないか。
- schema validation / artifact generation の一時ディレクトリが test 間で競合していないか。

解消条件:
- `npm test` が通常開発環境で timeout せず完走する。
- `npm run test:coverage` が coverage summary を出力する。
- release 手順で full test / coverage の扱いを `skip` ではなく gate として運用できる。

### 6.2 scan test は軽量化済みだが、全体負荷の恒久対策は未完了

対応済み:
- test 実行時の scan graph cache を導入。
- test 実行時の `scan` stdout を抑制。
- `vitest.config.ts` で `.qh*`、`.test-temp*`、`fixtures/**/node_modules` を test discovery から除外。
- `.gitignore` で `.test-temp*/` を除外。

残作業:
- CLI / integration tests で同一 fixture を何度も生成する箇所を shared fixture setup に寄せる。
- performance tests を通常 unit test と別 script に分離する。
- full test と release validation test の境界を `package.json` scripts に明示する。

### 6.3 Release readiness policy の gate 判定が弱い

状態:
- GitHub Actions の Release Readiness は成功している。
- `analyze` は critical/high findings を生成し exit code `5` になるが、workflow では artifact 生成済みなら続行する。
- `readiness` は `.github/ctg-policy.yaml` を読むが、現行の簡易 YAML parser / policy shape の不整合により、critical/high findings があっても `passed` になる可能性がある。

暫定運用:
```powershell
npm run build
node ./dist/cli.js analyze . --policy .github/ctg-policy.yaml --emit all --out .qh --format json
node ./dist/cli.js readiness . --policy .github/ctg-policy.yaml --from .qh --out .qh
```

確認観点:
- `.qh/findings.json` の severity count と `.qh/release-readiness.json` の `failedConditions` が一致しているか。
- `.github/ctg-policy.yaml`、`fixtures/policies/*.yaml`、`src/cli/readiness.ts` の policy schema が同じ形を前提にしているか。
- CI の `Block release if not ready` が、本当に release blocking 条件を拾えているか。

解消条件:
- policy loader を共通化し、`analyze` / `readiness` / tests が同じ policy model を使う。
- critical/high blocking fixture で `readiness.status=blocked_input` または `needs_review` になる contract test を追加する。
- CI が findings ありの alpha と release blocking を区別できる。

### 6.4 Parallel worker 実装は smoke 済みだが本番 worker path は要検証

状態:
- `src/parallel/__tests__/file-processor.test.ts` は 2026-04-30 時点で 18 tests pass。
- `scan --cache enabled --parallel 2` の fixture smoke は通過済み。
- 現行 scan は `targetFiles.length > 100 && parallelWorkers > 1` のとき worker mode に入る。
- worker script path は `file-processor-worker.js` を前提にしており、dist 配下の実ファイル存在・ESM 実行互換は未検証。

暫定運用:
- 大きめ repo で不安定な場合は `--parallel 1` または worker が起動しない file count で切り分ける。
- CI / release gate では、worker mode の大規模 repo smoke をまだ必須条件にしない。

解消条件:
- dist 後の worker script を用意し、Node ESM 環境で worker mode が実行できる。
- 100+ files fixture で `scan --parallel 2` が安定して完走する integration test を追加する。

### 6.5 Historical comparison は重複 finding 対応済みだが matching heuristic は限定的

状態:
- 同一 artifact 比較で `new=0 resolved=0 unchanged=16 modified=0` になることは確認済み。
- 同じ `ruleId + path` が複数あるケースはキュー方式で上書きしないよう修正済み。
- ただし matching は主に `ruleId + primary evidence path` / `ruleId + affectedSymbols` で、行移動・rename・rule id 変更には弱い。

解消条件:
- finding fingerprint を artifact contract に追加する。
- path rename / line move / duplicate finding の golden fixtures を追加する。
- historical report が matching confidence を出す。

### 6.6 Viewer / report 出力は MVP

状態:
- `viewer --from <dir>` は HTML 生成 smoke 済み。
- `risk-register.yaml` は viewer 側で完全 parse せず、警告して findings 中心の表示になる。
- 生成 HTML の視覚 QA、アクセシビリティ、巨大 artifact 表示性能は未検証。

解消条件:
- risk-register YAML または JSON を正式に読み込む。
- generated HTML の snapshot / smoke を CI に追加する。
- large findings set での表示性能を測る。

### 6.7 Local LLM provider は health smoke 中心

状態:
- `llm-health --provider deterministic` と `llm-health --all` はローカルで通過済み。
- ollama / llama.cpp はローカル endpoint の health check 中心で、実 model response schema / timeout / fallback の contract test は限定的。
- 外部 LLM や secret redaction の end-to-end 検証は未完了。

解消条件:
- provider ごとの response schema contract test を追加する。
- local-only / allow-cloud / require-llm の失敗時 exit code を fixture で固定する。
- redaction と audit hash の検証を CI に載せる。

## 7. リファクタリング方針

### 7.1 優先順位

P0:
- release readiness policy の共通化と gate 判定修正。
- full test / coverage の完走条件を回復する。
- CI が green でも release blocking を見逃さないようにする。

P1:
- scan / analyze / readiness の artifact 生成パイプラインを共通化する。
- cache / parallel / worker mode を小さな単位に分け、worker path と fallback を明確にする。
- historical matching に stable fingerprint を導入する。

P2:
- viewer の risk / readiness / test seed 表示を拡張する。
- plugin SDK と example plugin の contract を固める。
- local LLM provider の model response contract と redaction/audit 検証を増やす。

### 7.2 境界整理

CLI 層:
- 引数 parse、exit code、stdout/stderr、artifact path の責務に限定する。
- business logic を CLI file に増やさない。
- `src/cli/*` は各 domain service を呼ぶ薄い adapter に寄せる。

Policy / readiness 層:
- `.github/ctg-policy.yaml`、`fixtures/policies/*.yaml`、docs の policy 例を同じ schema に揃える。
- `analyze` と `readiness` で別々の policy parser を持たない。
- blocking 判定は unit test と fixture test の両方で固定する。

Scan / graph 層:
- file discovery、file metadata、parser adapter、cache、parallel execution を分離する。
- cache hit した artifact と fresh parse artifact が同じ schema を満たすことを contract test する。
- worker mode は dist 後の実行互換を確認してから release gate に入れる。

Historical 層:
- matching key を `ruleId + path` から stable fingerprint へ段階移行する。
- fingerprint 導入までは、duplicate finding / path rename / severity change を fixture で明示する。
- trend score は matching confidence と一緒に出す。

Viewer 層:
- artifact loader と HTML renderer を分離する。
- YAML risk-register の parse を正式対応するか、JSON artifact へ寄せる。
- generated HTML は snapshot / smoke / large artifact 表示の 3 段で検証する。

LLM 層:
- provider health check と analyze response generation を分離する。
- `deterministic` provider は fallback と test oracle 用に扱い、remote provider の代替として過信しない。
- redaction、request hash、response hash、unsupported claims を audit contract に固定する。

Plugin 層:
- manifest validation、sandbox policy、execution result validation を別々に保つ。
- example plugin は docs 用と contract test 用を分ける。
- timeout / invalid output / retry は noisy log を抑え、テストでは期待 warning として扱う。

### 7.3 作業単位

1 回の PR / commit で混ぜないもの:
- policy parser 修正と viewer UI 拡張。
- worker mode 実装と cache schema 変更。
- LLM provider 追加と release readiness gate 変更。
- docs 大改稿と runtime behavior 変更。

推奨する小分け:
- `policy-loader` 共通化 + readiness fixture test。
- `scan` pipeline 分割 + existing scan tests green。
- worker script 実行互換修正 + 100+ files fixture smoke。
- historical fingerprint 追加 + duplicate/path move golden。
- viewer artifact loader 改善 + HTML smoke。
- LLM audit contract + deterministic provider tests。

### 7.4 検証ゲート

各 refactor の最低条件:
```powershell
npm run build
npx vitest run <changed-test-files> --reporter=dot
node ./dist/cli.js scan fixtures/demo-shop-ts --out .qh-refactor-smoke --cache disabled --parallel 1
```

policy / readiness 変更時:
```powershell
node ./dist/cli.js analyze fixtures/demo-shop-ts --policy .github/ctg-policy.yaml --emit all --out .qh-refactor-smoke --llm-provider deterministic
node ./dist/cli.js readiness fixtures/demo-shop-ts --policy .github/ctg-policy.yaml --from .qh-refactor-smoke --out .qh-refactor-smoke
```

viewer 変更時:
```powershell
node ./dist/cli.js viewer --from .qh-refactor-smoke --out .qh-refactor-smoke/viewer.html
```

完了条件:
- 対象テストが exit 0。
- generated artifact が schema validation を通る。
- RUNBOOK の該当負債を「対応済み」または削除に更新できる。

---

## 8. CI 連携例

### GitHub Actions

```yaml
name: code-to-gate

on: [push, pull_request]

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install code-to-gate
        run: npm install -g @quality-harness/code-to-gate
      
      - name: Analyze
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          code-to-gate analyze ./ \
            --emit json,sarif \
            --out .qh \
            --llm-provider openai \
            --llm-model gpt-4
      
      - name: Upload SARIF
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: .qh/results.sarif
      
      - name: Check Readiness
        run: |
          status=$(jq -r '.status' .qh/release-readiness.json)
          if [ "$status" = "blocked_input" ]; then
            echo "Release blocked"
            exit 1
          fi
```

---

## 9. 監査ログ確認

```powershell
# audit 確認
cat .qh/audit.json | jq .

# version 確認
cat .qh/audit.json | jq '.version'

# policy 確認
cat .qh/audit.json | jq '.policy'

# LLM 確認
cat .qh/audit.json | jq '.llm'

# plugin 確認
cat .qh/audit.json | jq '.tool.plugin_versions'
```

---

## 10. よくある質問

### Q: LLM なしで実行できるか?

A: `scan` と `readiness` は LLM 不要。`analyze` は `--require-llm` なしなら deterministic artifact だけ生成。

### Q: private repo で実行できるか?

A: できる。LLM 送信前に redaction される。local-only mode (`--llm-provider ollama` または `llama.cpp`) で外部送信なし。

### Q: finding を suppression できるか?

A: policy YAML で suppression_rules を定義。ただし plugin 単独では有効化できない。

### Q: downstream export は必須か?

A: 必須ではない。code-to-gate core artifact だけ使う場合、export なしで OK。

---

## 11. 緊急時対応

### LLM provider 全停止

```powershell
# local-only に切り替え
ollama serve
code-to-gate analyze ./my-repo --emit all --out .qh --llm-provider ollama --llm-model llama3

# または deterministic だけ確認
code-to-gate analyze ./my-repo --emit findings,risk-register --out .qh
```

### schema 大量 invalid

```powershell
# version 確認
cat .qh/findings.json | jq '.version'
# 期待値: "ctg/v1alpha1"

# shared-defs 確認
code-to-gate schema validate schemas/shared-defs.schema.json
```

### plugin crash

```powershell
# plugin 除外
code-to-gate analyze ./my-repo --emit all --out .qh --plugin core-only

# doctor 確認
code-to-gate plugin doctor @quality-harness/rules-core
```
