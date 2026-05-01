# code-to-gate

[![npm version](https://badge.fury.io/js/@quality-harness%2Fcode-to-gate.svg)](https://badge.fury.io/js/@quality-harness/code-to-gate)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**日本語** | **[English](README_EN.md)**

`code-to-gate` は、リポジトリをスキャンしてリリース前の確認材料を作る CLI です。

主に次のことを確認できます。

- コード上に品質リスクの兆候がないか
- 追加したほうがよいテストは何か
- ポリシー上、リリース前に止めるべき状態か
- GitHub Code Scanning や他の品質ゲートへ渡せる結果を作れるか

## インストール

```bash
npm install -g @quality-harness/code-to-gate
```

プロジェクトごとに入れる場合:

```bash
npm install --save-dev @quality-harness/code-to-gate
```

## 前提条件

| 要件 | バージョン |
|------|------------|
| Node.js | 20 以上 |
| Git | 2.x |

## 基本の使い方

```bash
# リポジトリ構造をスキャンする
code-to-gate scan ./my-repo --out .qh

# finding、リスク、テスト候補、レポートを作る
code-to-gate analyze ./my-repo --emit all --out .qh

# ポリシーに照らしてリリース準備状態を確認する
code-to-gate readiness ./my-repo --policy policy.yaml --out .qh

# SARIF を出力する
code-to-gate export sarif --from .qh --out results.sarif
```

## 主なコマンド

| コマンド | 役割 |
|----------|------|
| `scan` | リポジトリの構造を読み取る |
| `analyze` | finding、リスク、テスト候補、レポートを生成する |
| `readiness` | ポリシーに基づいてリリース準備状態を評価する |
| `export` | SARIF などの形式に出力する |
| `diff` | Git の差分から影響範囲を確認する |
| `import` | ESLint、Semgrep、TypeScript、coverage などの結果を取り込む |
| `historical` | 過去の実行結果と比較する |
| `viewer` | HTML ビューアを起動する |
| `llm-health` | ローカル LLM プロバイダの状態を確認する |
| `evidence` | リリース判断用のエビデンスをまとめる |
| `schema validate` | 出力ファイルをスキーマで検証する |

## 出力されるもの

通常は `--out .qh` で指定したディレクトリに生成されます。

| ファイル | 内容 |
|----------|------|
| `repo-graph.json` | ファイル、依存、エントリポイントなどのリポジトリ構造 |
| `findings.json` | コード上で見つかった注意点 |
| `risk-register.yaml` | リスクとして確認したい項目 |
| `invariants.yaml` | 守るべき条件の候補 |
| `test-seeds.json` | 追加テストの候補 |
| `release-readiness.json` | ポリシー評価の結果 |
| `audit.json` | 実行時のメタデータ |
| `analysis-report.md` | 人が読むためのサマリー |
| `results.sarif` | Code Scanning 向けの SARIF |

## 組み込みルール

| ルール ID | 見つけるもの |
|-----------|--------------|
| `CLIENT_TRUSTED_PRICE` | クライアントから来た価格をそのまま信用している可能性 |
| `WEAK_AUTH_GUARD` | 認可チェックが弱い可能性 |
| `MISSING_SERVER_VALIDATION` | リクエストボディの検証が不足している可能性 |
| `UNTESTED_CRITICAL_PATH` | 重要な入口にテストが足りない可能性 |
| `TRY_CATCH_SWALLOW` | エラーを握りつぶしている可能性 |
| `RAW_SQL` | SQL 文字列を危険な形で組み立てている可能性 |
| `ENV_DIRECT_ACCESS` | 環境変数を直接読んでいる箇所 |
| `UNSAFE_DELETE` | 安全確認が弱い削除処理 |
| `LARGE_MODULE` | 大きすぎるモジュール |

## ポリシー例

```yaml
version: ctg/v1alpha1
name: strict
blocking:
  severities:
    - critical
  categories:
    - payment
  rules:
    - CLIENT_TRUSTED_PRICE
readiness:
  criticalFindingStatus: blocked_input
```

この例では、重大な payment 系 finding や `CLIENT_TRUSTED_PRICE` がある場合に、リリース準備状態をクリアにしません。

## GitHub Actions 例

```yaml
name: code-to-gate PR Analysis

on: [pull_request]

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm install -g @quality-harness/code-to-gate
      - run: code-to-gate scan . --out .qh
      - run: code-to-gate analyze . --emit all --out .qh
      - run: code-to-gate export sarif --from .qh --out results.sarif
      - uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: results.sarif
```

## 関連ドキュメント

| ドキュメント | 内容 |
|--------------|------|
| [docs/quickstart.md](docs/quickstart.md) | 初回実行ガイド |
| [docs/cli-reference.md](docs/cli-reference.md) | CLI の詳しい使い方 |
| [docs/integrations.md](docs/integrations.md) | 他ツールとの連携 |
| [docs/plugin-development.md](docs/plugin-development.md) | プラグイン開発 |
| [docs/local-llm-setup.md](docs/local-llm-setup.md) | ローカル LLM 設定 |
| [CHANGELOG.md](CHANGELOG.md) | 変更履歴 |

## 開発

```bash
npm install
npm run build
npm test
```

## ライセンス

MIT ライセンスです。[LICENSE](LICENSE) を参照してください。
