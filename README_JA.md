# code-to-gate

**PRやリリース前に、コードの確認箇所と追加テストの候補を整理するCLI。**

`code-to-gate` はリポジトリをローカルで解析し、finding、risk、test seed、
SARIF、release-readiness evidence を生成します。linter / SAST そのものではなく、
品質判断に使う証跡とゲート入力を作るレイヤーです。

finding は **review-required candidate** であり、確定済み脆弱性や自動リリース承認ではありません。
`critical` / `high` は人間レビューを優先するための gate severity であり、最終判断は人間または downstream approval gate が行います。

**日本語** | **[English](README.md)**

## こんな時に使う

| 場面 | やりたいこと | 使う機能と確認するもの |
|------|--------------|------------------------|
| PRを出す・レビューする前 | 変更に関連するリスクや確認箇所を拾いたい | `analyze`で全体を確認。Gitの変更差分を見る場合は`diff`。レポートと指摘の根拠を読む |
| QA・追加テストを考える時 | コードから確認観点を得たい | `analyze`の`test-seeds.json`を読み、仕様に照らしてテストケースを作る |
| リリース前 | チームの品質基準を満たすか、判断材料を残したい | `analyze`の後に`readiness`でpolicyを評価し、`release-readiness.json`の理由を確認する |
| CIの解析結果をまとめたい時 | ESLintやSemgrepなどの結果を同じ形式でレビューしたい | 各ツールで出した結果を`import`し、レポートやSARIFへまとめる |

例えば注文APIを変更した時、指摘の根拠行を確認し、仕様上必要な入力チェックやテストがあるかをレビューする用途に使えます。
指摘が妥当なら修正・追加テストへ進み、誤検知や意図した設計なら理由を記録します。
外部解析ツールの結果を取り込む場合、そのツールの実行は別途必要です。

既存のSARIFを取り込む場合は、importとanalyzeに同じ出力先を指定します。analyzeがimport manifestを検証してfindingsへ統合した後、exportします。

```bash
code-to-gate import sarif ./external-results.sarif --repo-root ./my-repo --out .qh
code-to-gate analyze ./my-repo --from-imports --emit all --out .qh
code-to-gate export sarif --from .qh --out results.sarif
```

## 公開状態

| チャネル | 状態 |
|----------|------|
| `package.json` | `1.6.0` GitHub公開版の対象 |
| GitHub Release | `v1.6.0` 公開済み（2026-09-10） |
| npm registry | 未公開 |

詳細は [Distribution Status](docs/distribution-status.md) を正本にします。
`1.6.0` は [GitHub release](https://github.com/RNA4219/code-to-gate/releases/tag/v1.6.0) として公開済みです。npm package は未公開です。

## インストール

```bash
# 公開tgz（推奨）
npm install -g https://github.com/RNA4219/code-to-gate/releases/download/v1.6.0/quality-harness-code-to-gate-1.6.0.tgz
```

Node.js 20以上が必要です。sourceから使う場合は、このリポジトリをcloneしたディレクトリで実行します。

```bash
npm install
npm run build
npm link
```

npm package 名は `@quality-harness/code-to-gate` ですが、registry publish はまだ完了していません。

## 最初の1回：解析してレポートを読む

`./my-repo`を調べたいリポジトリのパスに置き換えて実行します。LLMやAPIキーの設定は、この初回解析には必要ありません。

```bash
code-to-gate analyze ./my-repo --emit all --out .qh
```

`analyze`には構造のスキャンも含まれるため、先に`scan`を実行する必要はありません。
結果はコマンドを実行したディレクトリの`.qh`に出力されます。

1. **`.qh/analysis-report.md`をエディタで開く。** 指摘の概要と優先して確認する項目を読む。
2. **`.qh/findings.json`で根拠を確認する。** `finding`は要確認の指摘候補です。ファイル・行番号・周辺コードを見て、実際の仕様に当てはまるか判断する。
3. **`.qh/test-seeds.json`で追加テストを考える。** 候補から必要なケースを選び、自分のテスト環境で実装・実行する。

例えば気になる指摘が出たら、根拠行と既存テストを見比べ、修正が必要か、確認テストを足すか、意図した設計として扱うかを決めます。
テスト候補の生成は、テスト自体の実行や合格を意味しません。

## リリース前に品質基準を確認する

下の「Policy例」を`policy.yaml`として保存し、プロジェクトの基準に合わせてから実行します。
解析と評価で同じpolicyを使い、`.qh`には今回の解析結果を指定してください。

```bash
code-to-gate analyze ./my-repo --policy policy.yaml --emit all --out .qh
code-to-gate readiness ./my-repo --policy policy.yaml --from .qh --out .qh
```

`.qh/release-readiness.json`の`status`、説明文の`summary`、推奨アクションの`recommendedActions`を確認します。
`analyze`だけではこのファイルは生成されません。`readiness`は既存の解析結果をpolicyに照らして評価する工程です。
基準を通過しても、自動的にリリースを承認するものではありません。設定の詳細は[Policy Guide](docs/policy-guide.md)を参照してください。

## 目的に応じて追加するコマンド

以下をすべて順番に実行する必要はありません。必要な機能を選び、入力条件は[CLI詳細](docs/cli-reference.md)で確認してください。

```bash
code-to-gate ownership --from .qh --out .qh
code-to-gate spec-drift ./my-repo --out .qh
code-to-gate test-plan --from .qh --out .qh
code-to-gate pr-review --from .qh --out .qh
code-to-gate export sarif --from .qh --out results.sarif
code-to-gate export evidence-dag --from .qh --out .qh/evidence-dag.json
code-to-gate viewer --from .qh --out public/index.html --hosted
```

DB migration 解析を含める場合 preview:

```bash
code-to-gate analyze ./my-repo --database-analysis --emit all --out .qh
```

database analysis は review 用の補助 artifact を生成しますが、現時点では preview / experimental surface です。stable `ctg/v1` public contract として扱う前に、schema review と migration guide の更新が必要です。

## 使う前に知っておきたいこと

- **操作はCLIと出力ファイルが中心です。** ブラウザで読みたい場合は`viewer`でHTMLレポートを生成できます。解析から修正までをGUIだけで完結させる使い方は想定していません。
- **誤検知や見逃しがあります。** 指摘の件数だけで品質を決めず、根拠と仕様を確認してください。指摘が0件でも、不具合がないことの証明にはなりません。
- **既存のテストや専門の解析を併用します。** このツールは確認観点と判断材料を整理します。アプリを操作するテストや、リリースの最終判断は別途行います。
- **初回はレポートを読むところから始められます。** policy、外部ツール連携、LLMの設定は、必要になった段階で追加してください。

コマンドのエラー、解析時間、LLM接続などで困った場合は[Troubleshooting](docs/troubleshooting.md)を参照してください（英語）。

## 出力

| ファイル | 内容 |
|----------|------|
| `repo-graph.json` | リポジトリ構造 |
| `database-assets.json` | `--database-analysis` 有効時の DB assets / DDL 操作 |
| `findings.json` | 証拠付き finding |
| `risk-register.yaml` | 確認すべきリスク |
| `test-seeds.json` | 追加テスト候補 |
| `release-readiness.json` | policy 評価結果 |
| `evidence-dag.json` | artifact 横断の証跡グラフ |
| `spec-drift.json` | docs / schema / CLI / test の不整合検出 |
| `hosted-static-report.json` | 単一HTMLレポートの静的ホスティング用manifest |
| `schema-migration.json` | schema migration report と validation result |
| `ownership-risk.json` | CODEOWNERS reviewer 候補と module ownership risk |
| `plugin-marketplace.json` | marketplace / 配布 review 用の validated plugin registry |
| `pr-review.json` | block理由、許容理由、追加テスト、仕様差分、証跡linkを含むPR review artifact |
| `pr-review.md` | `pr-review.json` から生成する Markdown PR comment body |
| `analysis-report.md` | 人が読むサマリー |
| `results.sarif` | GitHub Code Scanning 用 SARIF |

## Policy 例

```yaml
version: ctg/v1
blocking:
  severity:
    critical: true
    high: true
  category:
    payment: true
    data: true
```

policyのversionは`ctg/v1`を使います。

## ドキュメント

| ドキュメント | 内容 |
|--------------|------|
| [docs/quickstart.md](docs/quickstart.md) | 初回実行ガイド |
| [docs/troubleshooting.md](docs/troubleshooting.md) | エラーや動作上の問題の調べ方（英語） |
| [docs/distribution-status.md](docs/distribution-status.md) | package / GitHub release / npm 公開状態 |
| [docs/cli-reference.md](docs/cli-reference.md) | CLI 詳細 |
| [docs/security-gate.md](docs/security-gate.md) | Scanner固定、SBOM、監査、CI証跡 |
| [docs/policy-guide.md](docs/policy-guide.md) | Gate policy 設定 |
| [docs/integrations.md](docs/integrations.md) | CI / 外部連携 |
| [docs/plugin-development.md](docs/plugin-development.md) | Plugin 開発 |
| [CHANGELOG.md](CHANGELOG.md) | 変更履歴 |

## 開発

```bash
npm install
npm run build
npm test
```

`npm test` は Vitest 実行後に `scripts/__tests__` の Node maintenance checks も実行します。

MIT License. See [LICENSE](LICENSE).
