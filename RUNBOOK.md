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

## 6. CI 連携例

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

## 7. 監査ログ確認

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

## 8.よくある質問

### Q: LLM なしで実行できるか?

A: `scan` と `readiness` は LLM 不要。`analyze` は `--require-llm` なしなら deterministic artifact だけ生成。

### Q: private repo で実行できるか?

A: できる。LLM 送信前に redaction される。local-only mode (`--llm-provider ollama` または `llama.cpp`) で外部送信なし。

### Q: finding を suppression できるか?

A: policy YAML で suppression_rules を定義。ただし plugin 単独では有効化できない。

### Q: downstream export は必須か?

A: 必須ではない。code-to-gate core artifact だけ使う場合、export なしで OK。

---

## 9. 緊急時対応

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