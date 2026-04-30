# code-to-gate

[![npm version](https://badge.fury.io/js/@quality-harness%2Fcode-to-gate.svg)](https://badge.fury.io/js/@quality-harness%2Fcode-to-gate)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**[English](README_EN.md)** | **日本語**

リポジトリ信号をエビデンス付き品質リスク、テスト種、リリース準備状態ゲート入力に変換するローカルファースト品質ハーネス。

## v1.0.0 リリース

**スキーマ安定化** - 全スキーマがv1となり、後方互換性を保証。

### 機能

| カテゴリ | 機能 |
|----------|------|
| **言語** | TypeScript, JavaScript, Python |
| **分析** | 9つの決定性ルール、AST解析、エビデンス付きfindings |
| **性能** | インクリメンタルキャッシュ、並列処理、大規模リポ向けストリーミング |
| **LLM** | ローカル専用（ollama, llama.cpp）、秘匿化、unsupported_claims分離 |
| **CI/CD** | GitHub Actions、PRコメント、Checks注釈、SARIF出力 |
| **プラグイン** | プラグインSDK、Dockerサンドボックス、カスタムルール対応 |
| **履歴** | ベースライン比較、回帰検出 |
| **報告** | JSON, YAML, Markdown, HTML, SARIF v2.1.0, エビデンスバンドル |

## インストール

```bash
# グローバルインストール
npm install -g @quality-harness/code-to-gate

# ローカルインストール
npm install --save-dev @quality-harness/code-to-gate
```

### 前提条件

| 要件 | バージョン |
|------|------------|
| Node.js | 20以上 |
| Git | 2.x（`diff`コマンド用） |

## クイックスタート

```bash
# リポジトリ構造をスキャン
code-to-gate scan ./my-repo --out .qh

# 全品質分析を実行
code-to-gate analyze ./my-repo --emit all --out .qh

# ポリシー付きリリース準備状態チェック
code-to-gate readiness ./my-repo --policy policy.yaml --out .qh

# GitHub Code Scanning用SARIF出力
code-to-gate export sarif --from .qh --out results.sarif
```

## CLIコマンド

| コマンド | 説明 |
|----------|------|
| `scan` | リポジトリからNormalizedRepoGraph生成 |
| `analyze` | findings、リスク、テスト種を含む全品質評価 |
| `diff` | Git参照比較と影響範囲分析 |
| `import` | 外部ツール結果インポート（ESLint, Semgrep, tsc, coverage） |
| `readiness` | ポリシー付きリリース準備状態評価 |
| `export` | 下流形式へ出力（SARIF, gatefield等） |
| `historical` | 現在実行とベースライン比較 |
| `viewer` | HTMLアーティファクトビューア起動 |
| `llm-health` | ローカルLLMプロバイダ健康状態チェック |
| `evidence` | リリースエビデンスバンドル作成 |
| `schema validate` | アーティファクトのスキーマ検証 |

## 性能オプション

```bash
# インクリメンタルキャッシュ有効化
code-to-gate scan ./repo --cache enabled

# 並列処理（4ワーカー）
code-to-gate scan ./repo --parallel 4

# 詳細進捗出力
code-to-gate scan ./repo --verbose
```

## 組み込みルール

| ルールID | カテゴリ | 説明 |
|----------|----------|------|
| CLIENT_TRUSTED_PRICE | payment | 検証なしのクライアント提供価格 |
| WEAK_AUTH_GUARD | auth | 認証ガードの脆弱性 |
| MISSING_SERVER_VALIDATION | validation | 未検証のリクエストボディ |
| UNTESTED_CRITICAL_PATH | testing | エントリポイントのテスト欠損 |
| TRY_CATCH_SWALLOW | maintainability | エラー握りつぶし |
| RAW_SQL | security | 生SQLクエリ構築 |
| ENV_DIRECT_ACCESS | security | 環境変数直接アクセス |
| UNSAFE_DELETE | maintainability | 安全性のない削除操作 |
| LARGE_MODULE | maintainability | 巨大モジュール |

## アーティファクト生成

全アーティファクトは安定v1スキーマ:

| アーティファクト | 用途 |
|------------------|------|
| `repo-graph.json` | 正規化リポジトリ構造 |
| `findings.json` | エビデンス付き品質findings |
| `risk-register.yaml` | リスク評価 |
| `invariants.yaml` | ビジネス/セキュリティ不変条件 |
| `test-seeds.json` | テスト設計推奨 |
| `release-readiness.json` | リリース状態 |
| `audit.json` | 実行メタデータ |
| `analysis-report.md` | 人間可読サマリー |
| `results.sarif` | GitHub用SARIF v2.1.0 |

## 下流連携

エコシステムツール向けペイロード出力:

- `gatefield-static-result.json` - agent-gatefield
- `state-gate-evidence.json` - agent-state-gate
- `manual-bb-seed.json` - manual-bb-test-harness
- `workflow-evidence.json` - workflow-cookbook

## GitHub Actions連携

```yaml
# .github/workflows/code-to-gate-pr.yml
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

## ポリシー評価

`readiness`コマンドはポリシー設定に基づいてリリース可否を判定:

```yaml
# policy.yaml 例
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

ポリシー条件に合致するfindingがある場合、`status`は`blocked_input`となり、exit codeは1（`READINESS_NOT_CLEAR`）を返します。

## プラグイン開発

カスタム分析ルール作成:

```bash
# プラグイン構造
my-plugin/
  manifest.json     # プラグインメタデータ
  index.js          # ルール実装
```

詳細は[docs/plugin-development.md](docs/plugin-development.md)を参照。

## ローカルLLM設定

```bash
# ollama健康状態チェック
code-to-gate llm-health --provider ollama

# ローカルLLM分析
code-to-gate analyze ./repo --llm-provider ollama --llm-model llama3
```

設定手順は[docs/local-llm-setup.md](docs/local-llm-setup.md)を参照。

## ドキュメント

| ドキュメント | 用途 |
|--------------|------|
| [CLAUDE.md](CLAUDE.md) | Claude Code用プロジェクトコンテキスト |
| [.claude/skills.md](.claude/skills.md) | Claude Codeスキル/コマンド |
| [CHANGELOG.md](CHANGELOG.md) | バージョン履歴 |

## リポジトリ構成

| パス | 内容 |
|------|------|
| `src/cli/` | CLIコマンド |
| `src/adapters/` | TS/JS/Pythonパーサー |
| `src/rules/` | 検出ルール |
| `src/cache/` | インクリメンタルキャッシュ |
| `src/parallel/` | 並列処理 |
| `src/plugin/` | プラグインSDK、サンドボックス |
| `src/config/` | ポリシー読み込み・評価 |
| `src/llm/` | ローカルLLMプロバイダ |
| `src/historical/` | ベースライン比較 |
| `src/viewer/` | HTMLビューア |
| `src/evidence/` | エビデンスバンドル |
| `schemas/` | JSONスキーマ（v1） |
| `fixtures/` | テストフィクスチャ |

## テストカバレッジ

全モジュールで約3000+テスト:

| モジュール | テスト数 |
|------------|----------|
| コアパーサー | 150+ |
| ルール | 200+ |
| CLIコマンド | 300+ |
| キャッシュ/並列 | 50+ |
| プラグインSDK | 50+ |
| LLMプロバイダ | 70+ |
| 履歴比較 | 60+ |
| ビューア | 80+ |
| エビデンス | 50+ |
| 受入テスト | 150+ |

## ビルド・テスト

```bash
npm install
npm run build
npm test

# スモークテスト
npm run test:smoke

# カバレッジ
npm run test:coverage
```

## スコープ

- リポジトリグラフ / 依存抽出
- TS/JS/PythonスキャンとAST解析
- エビデンス付きfindings
- コード由来リスクレジスタ
- 不変条件とテスト種アーティファクト
- リリース準備状態評価
- 外部ツールインポート（ESLint, Semgrep, tsc）
- 下流ゲート/QA種出力
- ローカルファースト監査と再現性

## 非目標

- AIアーティファクトゲートエンジン（agent-gatefield）
- アーティファクト承認/鮮度キュー（agent-state-gate）
- 手動ブラックボックステスト最終設計（manual-bb-test-harness）
- ワークフロー統治（workflow-cookbook）
- 企業固有ビジネスルール（OSSコア）
- 機密ソースコード（フィクスチャ）
- 最終本番リリース承認

## フィクスチャ

| フィクスチャ | 用途 |
|--------------|------|
| `demo-shop-ts` |Checkout/paymentリスク、クライアント提供価格 |
| `demo-auth-js` | 認証ガード、try/catch握りつぶし |
| `demo-ci-imports` | 外部ツールインポート例 |
| `demo-suppressions-ts` | 抑制動作 |
| `demo-github-actions-ts` | GitHub Actionsワークフロー |
| `demo-python` | Pythonパーサー例 |
| `demo-monorepo` | モノリポパッケージ境界 |

全フィクスチャは合成データ。機密コード不含。

## ライセンス

MITライセンス。[LICENSE](LICENSE)を参照。

## 起源ポリシー

本プロジェクトは独自実装。機密ソースコード、企業固有ルール、内部分析結果を一切含みません。