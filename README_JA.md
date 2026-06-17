# code-to-gate

**ローカル実行前提の release readiness 品質ゲート CLI。**

`code-to-gate` はリポジトリをローカルで解析し、finding、risk、test seed、
SARIF、release-readiness evidence を生成します。linter / SAST そのものではなく、
品質判断に使う証跡とゲート入力を作るレイヤーです。

**日本語** | **[English](README.md)**

## 公開状態

| チャネル | 状態 |
|----------|------|
| `package.json` | `1.5.0` |
| GitHub Release | 公開済み最新は `v1.4.2` |
| npm registry | 未公開 |

詳細は [Distribution Status](docs/distribution-status.md) を正本にします。

## インストール

```bash
npm install -g github:RNA4219/code-to-gate
```

source から使う場合:

```bash
npm install
npm run build
npm link
```

npm package 名は `@quality-harness/code-to-gate` ですが、registry publish はまだ完了していません。

## 基本の使い方

```bash
code-to-gate scan ./my-repo --out .qh
code-to-gate analyze ./my-repo --emit all --out .qh
code-to-gate readiness ./my-repo --policy policy.yaml --from .qh --out .qh
code-to-gate export sarif --from .qh --out results.sarif
```

DB migration 解析を含める場合:

```bash
code-to-gate analyze ./my-repo --database-analysis --emit all --out .qh
```

## 出力

| ファイル | 内容 |
|----------|------|
| `repo-graph.json` | リポジトリ構造 |
| `database-assets.json` | `--database-analysis` 有効時の DB assets / DDL 操作 |
| `findings.json` | 証拠付き finding |
| `risk-register.yaml` | 確認すべきリスク |
| `test-seeds.json` | 追加テスト候補 |
| `release-readiness.json` | policy 評価結果 |
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
readiness:
  criticalFindingStatus: blocked_input
```

`ctg/v1alpha1` は後方互換として受け付けますが、新しい例は `ctg/v1` を使います。

## ドキュメント

| ドキュメント | 内容 |
|--------------|------|
| [docs/quickstart.md](docs/quickstart.md) | 初回実行ガイド |
| [docs/distribution-status.md](docs/distribution-status.md) | package / GitHub release / npm 公開状態 |
| [docs/cli-reference.md](docs/cli-reference.md) | CLI 詳細 |
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

MIT License. See [LICENSE](LICENSE).
