---
intent_id: DOC-LEGACY
owner: code-to-gate-team
status: active
last_reviewed_at: 2026-05-31
next_review_due: 2026-06-30
---

# リリースチェックリスト

code-to-gate の標準手順を土台に、リポジトリ固有の要件へ合わせて整備したチェックリストです。リリースの都度、以下を確認してください。

## 1. バージョンとタグ

- パッケージバージョンを `package.json` で更新し、`git tag` が最新コミットへ付与されていることを確認する。
- タグをリモートへ `git push --tags` 済みであることを確認する。
- Schema version `ctg/v1` の整合性確認（`node ./dist/cli.js schema validate-all .qh`）。

## 2. 証跡と記録

- QA / セキュリティ / 品質ゲートの証跡を PR またはリリースチケットへ添付する。
- 運用メトリクスの基準値は [`governance/metrics.yaml`](../governance/metrics.yaml) を参照する。
- リリースノート（`CHANGELOG.md`）へ今回の変更点と既知の制約を追記する。

## 3. 依存ドキュメントの同期

- `CHECKLISTS.md#release` の要件と整合するように関連ドキュメントの参照先が最新バージョンへ更新されているかを確認する。
- サンプルコマンドや設定ファイルがバージョン更新に追随しているかを確認する。

## 4. 配布物の整合性

- `npm pack --dry-run` で配布物内容を確認する。
- 配布物へ `LICENSE` を同梱したことを確認する。
- `npm run release:validate` が通ること（build + smoke + pack dry-run）。

## 5. リリース後のフォローアップ

- デプロイ後の監視ポイントとロールバック手順が CHECKLISTS Ops で最新化されているかを確認する。
- 既知のフォローアップタスクがあれば `docs/tasks/` へ記録し、所有者を割り当てる。

## 6. 承認記録

- [ ] Release Approval Record（`docs/releases/RA-YYYYMMDD-XX.md`）を作成済み
- [ ] Approval Summary に承認者/承認日時を記録
- [ ] Approval Type（technical|security|risk_acceptance）を設定
- [ ] Evidence Links（PR URL, QA結果, Security Gate）を添付
- [ ] Approval Checklist 全項目完了
- [ ] Acceptance Record（`docs/acceptance/AC-*.md`）と相互参照設定
- [ ] `docs/releases/INDEX.md` に Approval Mapping を追加

## 7. ロールバック準備

- [ ] 前回安定版バージョン（`CHANGELOG.md`）を確認
- [ ] 戻し先Gitタグを特定
- [ ] ロールバック判定基準（KPI閾値/Security Gate）を確認
- [ ] ロールバック証跡記録様式を理解

## Quick Reference

| Check | Command |
|-------|---------|
| Build | `npm run build` |
| Smoke tests | `npm run test:smoke` |
| Coverage | `npm run test:coverage` |
| Release validate | `npm run release:validate` |
| Schema validate | `node ./dist/cli.js schema validate-all .qh` |
| Pack dry-run | `npm pack --dry-run` |