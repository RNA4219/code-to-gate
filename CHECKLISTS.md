---
intent_id: INT-001
owner: code-to-gate-team
status: active
last_reviewed_at: 2026-05-31
next_review_due: 2026-06-30
---

# Checklists

code-to-gate運用時のチェックリスト集。

## Development

- `docs/tasks/` に Task Seed を起票・更新し、[docs/TASKS.md](docs/TASKS.md) の運用ルールに沿ってスコープとフォローアップを同期
- 着手前に [CLAUDE.md](CLAUDE.md) と [`GUARDRAILS.md`](GUARDRAILS.md) を読み合わせ、最小差分と既存ガードレールへ整合
- テストを先行させ、TDD フロー（vitest）を完了
- 単体テストと結合テストの対象を分けて記載し、coverage 80% を目標ではなく必須ゲートとして扱う
- 例外や設定変更は [docs/security/Security_Review_Checklist.md](docs/security/Security_Review_Checklist.md) の該当フェーズで可否を確認
- 検収が必要な作業は `docs/acceptance/AC-YYYYMMDD-xx.md` を作成し、判定・証跡・残課題を記録

## Pull Request / Review

- 失敗させたテストが緑化する最小コミット単位を維持し、差分を可視化
- PR / 検収記録から unit / integration / coverage の結果が追跡できるようにする
- `CHANGELOG.md` の `[Unreleased](CHANGELOG.md#unreleased)` に Task Seed 番号付きで成果を追記
- PR 説明欄から [docs/TASKS.md](docs/TASKS.md)・[CLAUDE.md](CLAUDE.md) 等の参照先へ遷移できるようリンクを付す
- PR 本文の `Acceptance Record` から `docs/acceptance/AC-*.md` へ遷移できるようにする
- レビュー観点は [docs/security/Security_Review_Checklist.md](docs/security/Security_Review_Checklist.md) と [`GUARDRAILS.md`](GUARDRAILS.md) を再確認

## Ops / Incident

- インシデント初動は [CLAUDE.md](CLAUDE.md) の該当コマンドを実行し、必要な通知経路を確保
- セキュリティ対応は [docs/security/Security_Review_Checklist.md](docs/security/Security_Review_Checklist.md) のインシデント項目を完了
- 復旧後の再発防止策を `docs/tasks/` に起票

## Daily

- 入力到着の確認
- 失敗通知の有無
- `npm run lint` が通ること
- `npm run build` が通ること
- `npm run test:smoke` が通ること
- `node ./dist/cli.js llm-health --all` で LLM provider status が正常
- Birdseye freshness check（`docs/birdseye/index.json` の `generated_at` が最新）

## Release

- 実装・レビューの完了条件は「Development」「Pull Request / Review」を満たしていることを前提に進行
- [docs/Release_Checklist.md](docs/Release_Checklist.md) を参照して全体手順を確認
- `.github/workflows/code-to-gate-pr.yml` の全ジョブが成功していること
- coverage 80% 以上（`npm run test:coverage` が通る）
- 変更点の要約
- リリースノート（`CHANGELOG.md`）へ必要最小の項目を追記
- 未反映の Task Seed が残っていないか確認
- Schema version `ctg/v1` の整合性確認（`node ./dist/cli.js schema validate-all .qh`）
- 新規 ADR を含むリリースでは [docs/ADR/README.md](docs/ADR/README.md) の索引更新
- 受け入れ基準に対するエビデンス（`docs/acceptance/AC-*.md`）
- PR に `type:*` および `semver:*` ラベルを付与済み
- Security Review Checklist に沿って準備→実装→レビューの各フェーズを完了
- `npm run release:validate` が通ること（build + smoke + pack dry-run）
- 配布物へ `LICENSE` を同梱済み
- Release Approval Record（`docs/releases/RA-YYYYMMDD-XX.md`）を作成済み
- ロールバック準備完了（前回安定版確認、戻し先Gitタグ特定）

## Hygiene

- 命名・ディレクトリ整備
- ドキュメント差分反映
- `npm run lint` が通ること
- `npm run lint:fix` で修正可能なエラーを解消
- `npx tsc --noEmit` が通ること
- `npm run test:coverage` が通ること（coverage 80%）
- CI / Governance を変更した場合は `.github/workflows/`、`.github/ctg-policy.yaml`、`governance/policy.yaml` の同期を確認
- Birdseye を更新した場合は `docs/birdseye/index.json` / `caps/*` の差分と `generated_at` を確認
- 旧呼称の混入チェック（例: `grep "<旧ブランド名>"` で現行ブランド以外の名称が残存していないか確認）

---

## Quick Reference

| Check | Command |
|-------|---------|
| Lint | `npm run lint` |
| Build | `npm run build` |
| Type check | `npx tsc --noEmit` |
| Smoke tests | `npm run test:smoke` |
| Full tests | `npm test` |
| Coverage | `npm run test:coverage` |
| Release validate | `npm run release:validate` |
| Schema validate | `node ./dist/cli.js schema validate-all .qh` |
| LLM health | `node ./dist/cli.js llm-health --all` |