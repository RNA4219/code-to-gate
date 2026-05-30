---
intent_id: DOC-LEGACY
owner: code-to-gate-team
status: active
last_reviewed_at: 2025-05-31
next_review_due: 2025-06-31
---

# Birdseye リファレンス

Birdseye は、code-to-gate の知識マップを統合的に参照する仕組みです。
`index.json`・`caps/*.json`・`hot.json` を併せて読み解くことで、主要ノードの関係性と鮮度を一元確認できます。
本書は Guardrails からのフォールバック参照起点として、Edges・ホットリスト・更新手順を 1 か所に整理します。

## Edges（主要ノードの隣接関係）

`docs/birdseye/index.json` の `edges` から、Guardrails がフォールバック時に ±1 hop を推定しやすいよう主要ノードを抜粋しています。

- `README.md`
  - 主要 Edges: `GUARDRAILS.md`, `CLAUDE.md`, `CHECKLISTS.md`, `docs/birdseye/index.json`
  - 用途: 初動ガイドと Birdseye 読込順序の提示
- `CLAUDE.md`
  - 主要 Edges: `GUARDRAILS.md`, `src/cli/scan.ts`, `src/cli/analyze.ts`, `src/rules/index.ts`
  - 用途: プロジェクトコンテキストと主要モジュール参照
- `GUARDRAILS.md`
  - 主要 Edges: `CHECKLISTS.md`, `governance/policy.yaml`
  - 用途: 行動指針・鮮度管理・フォールバック手順
- `src/cli/analyze.ts`
  - 主要 Edges: `src/rules/index.ts`, `src/config/policy-loader.ts`
  - 用途: 分析エントリーポイント
- `src/cli/readiness.ts`
  - 主要 Edges: `src/config/policy-loader.ts`
  - 用途: リリース判定エントリーポイント
- `src/rules/index.ts`
  - 主要 Edges: `src/adapters/typescript.ts`
  - 用途: 検出ルール registry
- `docs/birdseye/index.json`
  - 主要 Edges: `README.md`, `GUARDRAILS.md`, `docs/birdseye/caps/`
  - 用途: Birdseye hop 計算の基盤

> 詳細なエッジリストは `docs/birdseye/index.json` を参照してください。

## Hot List（主要ノードの即時参照）

`docs/birdseye/hot.json` に定義されたホットリストの要旨です。鮮度確認や調査時の着手順に活用してください。

- `src/cli/analyze.ts`: 分析エントリーポイント、最頻出
- `src/cli/readiness.ts`: リリース判定エントリーポイント
- `src/rules/index.ts`: 検出ルール registry
- `src/config/policy-loader.ts`: ポリシー読み込み・評価
- `CLAUDE.md`: プロジェクトコンテキスト
- `GUARDRAILS.md`: 行動指針・鮮度管理ポリシー

## Birdseye 更新手順

1. 変更対象や鮮度が落ちたノードを整理し、更新対象を特定します。
2. `docs/birdseye/index.json` の `generated_at` と `mtime` を更新します。
3. 対応する `caps/*.json` ファイルを更新します。
4. `docs/birdseye/hot.json` の鮮度を確認します。
5. `npm run lint` / `npm run build` / `npm run test:smoke` で整合性確認。

## フォールバック運用

- JSON が取得できない場合、本書の Edges と Hot List を参考に読込対象を最小化します。
- `README.md` → `docs/birdseye/index.json` → `caps/*.json` の順に確認してください。
- インシデントレベルの齟齬や破損が見つかった場合は `CHECKLISTS.md#ops--incident` の手順で共有します。

> ここに記載した情報は JSON の要約であり、最新状態は常に `docs/birdseye/index.json`・`docs/birdseye/hot.json`・`docs/birdseye/caps/` を参照してください。