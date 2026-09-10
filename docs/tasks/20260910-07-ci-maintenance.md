---
task_id: 20260910-07
intent_id: CI-MAINTENANCE-20260910-07
owner: code-to-gate-team
status: done
last_reviewed_at: 2026-09-10
next_review_due: 2026-10-10
---

# CI maintenance checks

PR の必須 `coverage` job と Release の必須 `analyze` jobに、Build直後の保守確認を接続した。
各経路で次を順に実行する。

- `npm run test:maintenance`（maintenance Node tests 13件）
- `node scripts/birdseye.mjs check`
- `node scripts/check-roadmap-completion-drift.mjs --fail`
- `npm run docs:lint-refs`

CIではBirdseyeの`generate`を実行せず、checkout済みの生成物とsourceの不一致を`check`で失敗させる。
Birdseyeはsource読み込み時にCRLF/CRをLFへ正規化してからgraph・caps・generation hashを計算する。
`.gitattributes` の `eol=lf` と合わせ、checkout前後の改行差でhashが変わらないことをfixtureで確認する。
sourceの実内容変更は引き続き`check`で検出する。

## 検証境界

workflow YAMLのparse、両workflowでBuild後に4つのmaintenance stepが存在すること、maintenance Node tests、
及びCRLF/LF fixture境界を確認した。GitHub hosted runnerでの実行は未実施。
実repoのBirdseye再生成と最終統合結果は [AC-20260910-12](../acceptance/AC-20260910-12-follow-up.md) に記録する。
