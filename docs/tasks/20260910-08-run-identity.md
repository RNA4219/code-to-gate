---
task_id: 20260910-08
intent_id: RUN-IDENTITY-20260910-08
owner: code-to-gate-team
status: done
last_reviewed_at: 2026-09-10
next_review_due: 2026-10-10
---

# 独立実行の識別

解析のrun IDが分または秒単位の時刻に依存し、連続・並列実行を区別できない場合がある。
実行ID生成を共通化し、agentのrequest/fingerprintによる冪等再利用と過去artifactの読込互換を維持する。

検収: 同時計時・別プロセスで衝突しないこと、同じ実行の成果物でIDが一致すること、agentの再利用が維持されること。

## 実装範囲

`src/utils/run-id.ts` に、prefix・UTC時刻・`crypto.randomUUID()`から成る独立実行ID生成を追加した。
repo graph、node clock、diff、database fallback、baseline ledger、drift budgetを起点に、
provenance、review queue、query、QEOS、test plan、historical、spec drift、rule quality、ownership、
viewer、doctor、marketplace、quality pack、schema migration、PR review、release pack、bundle builder、
plugin runnerの時刻由来fallbackへ適用した。同一実行内で既存入力artifactの`run_id`がある場合は継承する。
graph cache hitでは解析内容のcloneを返しつつ、cacheを利用した新しい解析ごとに`generated_at`と独立`run_id`を再付与する。

既存の`generateRunId(timestamp)`はpure helperと既存出力を維持した。`src/agent/engine.ts`のfingerprint由来
run ID、request単位の冪等性、過去manifestの読込契約は変更していない。時刻計測、duration、cache・一時名、
container名など識別子ではない値も対象外とした。

## 実行済み検証

次のコマンドはすべてexit 0だった。

- `npx vitest run src/utils/__tests__/run-id.test.ts --reporter=dot`（3 tests）
- `npx vitest run src/utils/__tests__/run-id.test.ts src/core/__tests__/config-utils.test.ts src/cli/__tests__/baseline-ledger.test.ts src/cli/__tests__/drift-budget.test.ts --maxWorkers=2 --reporter=dot`（4 files、61 tests）
- `npx vitest run src/cli/__tests__/diff.test.ts -t "run_id matches across artifacts" --maxWorkers=1 --reporter=dot`（1 test）
- `npx vitest run src/plugin/__tests__/plugin-runner.test.ts -t "createPluginRunner|execution context|run" --maxWorkers=1 --reporter=dot`（4 tests）
- `npx vitest run src/cli/__tests__/query.test.ts src/cli/__tests__/viewer.test.ts src/cli/__tests__/historical.test.ts src/cli/__tests__/schema-validate.test.ts --maxWorkers=2 --reporter=dot`（4 files、77 tests）
- `npx vitest run src/cli/__tests__/review-queue.test.ts src/cli/__tests__/qeos-matrix.test.ts src/cli/__tests__/test-plan.test.ts src/cli/__tests__/doctor.test.ts --maxWorkers=2 --reporter=dot`（4 files、10 tests）
- `npx vitest run src/evidence/__tests__/provenance-index.test.ts src/evidence/__tests__/bundle-builder.test.ts src/historical/__tests__/comparison.test.ts src/ownership/__tests__/ownership-risk.test.ts src/plugin/__tests__/marketplace.test.ts --maxWorkers=2 --reporter=dot`（5 files、67 tests）
- `npx vitest run src/cli/__tests__/spec-drift.test.ts src/cli/__tests__/release-pack.test.ts src/cli/__tests__/pr-review.test.ts src/cli/__tests__/pr-review-publish.test.ts --maxWorkers=2 --reporter=dot`（4 files、12 tests）
- `npx vitest run src/cli/__tests__/ownership.test.ts src/cli/__tests__/plugin-marketplace.test.ts src/pr-review/__tests__/pr-review.test.ts src/viewer/__tests__/viewer-expansion.test.ts src/viewer/__tests__/report-viewer.test.ts --maxWorkers=2 --reporter=dot`（5 files、67 tests）
- `npx vitest run src/utils/__tests__/run-id.test.ts src/utils/__tests__/run-id-integration.test.ts src/core/__tests__/repo-graph-builder.test.ts --maxWorkers=2 --reporter=dot`（3 files、10 tests、cache hit回帰を含む）
- `npm run typecheck`
- `npm run build`
- `npm run lint`
- `git diff --check`（改行形式の既存警告のみ）

build後のdist helperを同一固定時刻で2つの子プロセスから呼び出し、`proc-20260910000000000-...`形式の異なる
IDが得られることを確認した。複数実行のテスト件数は重複し得るため、総数をunique件数とは扱わない。

最初に実行した広範なVitest一括コマンドは30秒上限で完了exitを回収できなかったため、検収証跡には採用しない。
親の全体テストは3,786 passed、既存4 skippedで成功した。インストール済みパッケージのsmokeでも
同一実行artifactのID一致とagentのmanifest/reuse契約が成功した。
最終統合結果は [AC-20260910-12](../acceptance/AC-20260910-12-follow-up.md) に記録する。
