# code-to-gate

[![npm version](https://badge.fury.io/js/@quality-harness%2Fcode-to-gate.svg)](https://badge.fury.io/js/@quality-harness/code-to-gate)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

`code-to-gate` は、リポジトリをスキャンして「どこに品質リスクがありそうか」「どんなテストを追加するとよさそうか」「リリース前に止めるべき状態か」を確認するための CLI です。

## まず使う

```bash
npm install -g @quality-harness/code-to-gate

code-to-gate scan ./my-repo --out .qh
code-to-gate analyze ./my-repo --emit all --out .qh
code-to-gate readiness ./my-repo --policy policy.yaml --out .qh
```

## 何が出るか

| 出力 | 内容 |
|------|------|
| `repo-graph.json` | ファイル、依存、エントリポイントなどのリポジトリ構造 |
| `findings.json` | コード上で見つかった注意点 |
| `risk-register.yaml` | リスクとして確認したい項目 |
| `test-seeds.json` | 追加テストの候補 |
| `release-readiness.json` | ポリシーに基づくリリース可否の判断材料 |
| `analysis-report.md` | 人が読むためのサマリー |
| `results.sarif` | GitHub Code Scanning などに渡す SARIF |

## 詳細

| 言語 | ドキュメント |
|------|--------------|
| 日本語 | [README_JA.md](README_JA.md) |
| English | [README_EN.md](README_EN.md) |

## ライセンス

MIT License. See [LICENSE](LICENSE).
