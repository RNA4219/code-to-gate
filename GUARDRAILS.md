---
intent_id: INT-001
owner: code-to-gate-team
status: active
last_reviewed_at: 2025-05-31
next_review_due: 2025-06-31
---

# Guardrails & 行動指針

code-to-gate運用時に守るべき原則と振る舞いを体系化する。

## 目的

- リポジトリ内の既存ルール（TypeScript strict, ESLint, Vitest, coverage 80%, ESM 方針）を自動検出し、厳密に遵守する。
- 変更は最小差分で行い、Public API を破壊しない。不可避の場合のみ短い移行メモを添付する。
- 応答は簡潔で実務に直結させ、冗長な説明や代替案の羅列は避ける。
- 実装時はテスト駆動開発を基本とし、テストを先に記述する。

## スコープとドキュメント

1. 目的を一文で定義し、誰のどの課題をなぜ今扱うかを明示する。
2. Scope を固定し、In/Out の境界を先に決めて記録する。
3. I/O 契約（入力/出力の型・例）を `CLAUDE.md` に整理する。
4. Acceptance Criteria（検収条件）を `CHECKLISTS.md` に列挙する。
5. 最小フロー（準備→実行→確認）を `CLAUDE.md` の Key Commands に記す。
6. 完了済みタスクは `CHANGELOG.md` へ移し、履歴を更新する。
7. テスト/型/lint/CI の実行結果を確認し、`CHECKLISTS.md` でリリース可否を判断する。

## 実装原則

- 型安全：TypeScript `--strict` モード。新規・変更シグネチャには必ず型を付与し、Optional/Union は必要最小限に抑える。
- 例外設計：既存 errors 階層に合わせ、再試行可否を区別する。
- 後方互換：CLI/JSON 出力は互換性を維持し、破壊的変更は明示的フラグで段階移行する。Schema version `ctg/v1` を遵守。
- インポート順序：Node.js標準→npm依存→内部モジュールの順で空行区切りとする。
- 副作用の隔離：`src/core/`, `src/rules/`, `src/adapters/` のレイヤ分離を尊重する。
- スコープ上限：1 回の変更は合計 100 行または 2 ファイルまで。本ループでは最優先の塊のみ対応する。単一ファイルが 400 行を超える場合は機能単位で分割を検討する。
- 細かな ESLint エラーはスコープ上限の例外とし、重大なルール逸脱のみを是正する。
- 公開 API や CLI を変更した場合のみ、差分に簡潔な Docstring/Usage 例を添付する。

## プロセスと自己検証

- 競合解消時は双方の意図を最小限で統合し、判断を `ノート→` に 1 行で記す。
- 差分提示前に `npm run lint` / `npm run build` / `npm run test:smoke` をメンタルで実行し、グリーン想定の変更のみ提出する。
- 実行コストやレイテンシへの影響は ±5% 以内を目標とし、超過見込みの場合は `ノート→` に代替策を 1 行で示す。
- セキュリティ上、秘密情報は扱わず、必要な場合は `.env` や fixtures 参照に限定する。
- 外部bundleの展開は全entryを事前検証し、出力root外のパスを一件でも含む場合は書き込み前に拒否する。
- Docker/外部process起動はargv配列と `shell: false` を使い、文字列連結したshell commandを禁止する。
- pluginの直接実行は明示指定時のみ許可し、timeout時はprocess tree終了後にだけretryする。

## 例外処理

- スコープ上限を超える作業が必要な場合は、作業を分割してタスク化を提案する。
- ドキュメント更新（例：`*.md`）については、ファイル数上限を例外的に適用せず、必要に応じて超過を許可する。
- 破壊的変更が不可避な場合は、移行期間やフラグ運用を明記したメモを添付する。

## リマインダー

- 変更は常にテストから着手し、最小の成功条件を先に満たす。
- 全ての関係者が同じ期待値を共有できるよう、上記ドキュメントを更新し続ける。

## Birdseye / Minimal Context Intake Guardrails（鳥観図×最小読込）

**目的**：コンテキストは有限である。LLM/エージェントに「1枚で全体像→必要箇所だけ深掘り」の二段読みを強制し、**最小トークンで仕組みを把握**させる。

### 運用の前提（Dual Stack互換）

- 本リポは **デュアルスタック**（A: ネイティブFunction Calling／B: ツールなしJSON封筒）を想定する。
- ツールが **ある環境**：関数呼び出しを優先。
- ツールが **ない環境**：本文に ```tool_request``` JSON を**ミラー出力**し、外部オーケストレータが拾う。

---

### 配置ポリシー（3層で最小読込）

1. **Bootstrap（超小型）**

   - 置き場所：`README.md` 冒頭100行以内に固定。
   - 役割：**読む場所の道標のみ**。下のテンプレを貼る。

   ```md
   <!-- LLM-BOOTSTRAP v1 -->
   Recommended read order:

   1. `docs/birdseye/index.json` — Node graph (lightweight)
   2. `docs/birdseye/caps/<path>.json` — Point reads for needed nodes

   Focus procedure:
   - Find node IDs for recently changed files within +/-2 hops from `index.json`
   - Read only the matching `caps/*.json` files

   <!-- /LLM-BOOTSTRAP -->
   ```

2. **Index（軽量インデックス）**

   - 置き場所：`docs/birdseye/index.json`
   - 役割：**±N hop 抽出**が即できる機械可読データ。
   - **最小スキーマ**：

   ```json
   {
     "generated_at": "00005",
     "nodes": {
       "src/cli/scan.ts": {
         "role": "entrypoint",
         "caps": "docs/birdseye/caps/src.cli.scan.ts.json",
         "mtime": "00012"
       }
     },
     "edges": [["src/cli/scan.ts", "src/adapters/typescript.ts"]]
   }
   ```

3. **Capsules（点読みパケット）**

   - 置き場所：`docs/birdseye/caps/…`（**1ノード=1 JSON**、1KB目安）。
   - **最小スキーマ**：

   ```json
   {
     "id": "src/rules/client-trusted-price.ts",
     "role": "application",
     "public_api": ["evaluate()"],
     "summary": "Client-side price calculation detection. Analyzes AST for price computation patterns...",
     "deps_out": ["src/adapters/typescript.ts"],
     "deps_in": ["src/cli/analyze.ts"],
     "risks": ["False positive on frontend demo fixtures"],
     "tests": ["src/rules/__tests__/client-trusted-price.test.ts"]
   }
   ```

   - 命名は「パスをドット連結＋拡張子置換」で衝突回避（例：`src.cli.scan.ts.json`）。

> 補助（任意）：頻出入口のホットリストを `docs/birdseye/hot.json` に置く（例：`cli.ts`, `analyze.ts`）。

---

### 推論時の読込ガードレール（MUST/SHOULD）

**MUST**（必須）

1. まず `README.md` の **LLM-BOOTSTRAP** ブロックのみ読む（100行以内）。
2. `docs/birdseye/index.json` を読み、**対象変更ファイル±2 hop** のノードID集合を得る。
3. 対応する **`docs/birdseye/caps/*.json` だけ**を読み込む。
4. `index.json.generated_at` が未更新のまま関連ファイル差分だけ進んでいる、または Birdseye 資源同士で世代番号が揃っていない場合は、**再生成を要求**する（下記"鮮度管理"参照）。
5. 生成物（`plan`/`patch`/`tests`/`commands`/`notes` 等）では、**ノードID（パス）を明示**し出典を示す。

**SHOULD**（推奨）

- 2 hop の合計が **1,200 tokens** を超えそうなら **1 hop** に縮小。
- 読み順は **cli → rules → adapters → config → core**。
- 巨大Capsuleは**120語以内 summary**に収める（Capsule側の規約）。

**MUST NOT**（禁止）

- `node_modules`, `dist`, `coverage`, `.qh`, `.test-temp` 等の**重量ディレクトリを直読み**しない。
- `BIRDSEYE.md` 全文を**常時**読まない（必要時のみ参照）。

---

### 鮮度管理（Staleness Handling）

- **条件**：`index.json.generated_at` が関連変更に対して未更新／Capsが見つからない／対象ノードが未登録／Birdseye 資源間で世代番号が不整合。
- **対応**：
  - **ツールあり環境**（Function Calling）
    - 例：`codemap.update` を呼ぶ（論理名）。
  - **ツールなし環境**
    - 本文に **ミラー封筒**を出し、外部実行を待つ。

        ```tool_request
        {"name":"codemap.update","arguments":{"targets":["src/cli/scan.ts"],"emit":"index+caps","radius":1}}
        ```

    - 実行結果が到着するまで **偽の読込結果を作らない**。
- **フォールバック**（最終手段）：
  - `docs/BIRDSEYE.md` の **Edgesセクション**があればそこから ±1 hop を暫定抽出。
  - それも無ければ「直近変更ファイルN件（例：5件）」のみ読込。

---

### セキュリティ/境界

- リポ外パス、機密格納領域への自動アクセスを禁止。
- 生成物に**不要な機密情報**（環境変数/Secrets/API keys）を含めない。

---

### 生成物に関する要求（出力契約）

- **`plan`**：読み込んだ **CapsノードID一覧** と hop、抜粋理由、未読箇所の扱い。
- **`patch`**：変更対象ファイルの相対パスを**先頭コメント**で明記。
- **`tests`**：対象ノードの `src/**/__tests__/*.test.ts` を参照して増補。存在しなければ最小サンプルを併記。
- **`commands`**：読込に使ったツール（有無/種類）と再現手順を列挙。
- **`notes`**：鮮度判断、スコープ外ファイル、既知リスク。

---

### 互換のための論理ツール名（最小セット）

- `codemap.update`: args `{targets?: string[], emit?: "index"|"caps"|"index+caps", radius?: number}`
  — Birdseye再生成。
- `web.search`: args `{q: string, recency?: number, domains?: string[]}`
  — 必要時の検索。
- `web.open`: args `{url: string}` — 詳細参照。

---

<!-- guardrails:yaml
forbidden_paths:
  - "/src/core/**"
  - "/src/rules/**"
require_human_approval:
  - "/governance/**"
  - "/schemas/**"
slo:
  lead_time_p95_hours: 24
  mttr_p95_minutes: 30
  change_failure_rate_max: 0.20
-->
