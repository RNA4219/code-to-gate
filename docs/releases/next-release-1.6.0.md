---
release_version: 1.6.0
release_tag: v1.6.0
release_date: 2026-09-10
status: released
publication: github
approval_record: RA-20260910-01
last_reviewed_at: 2026-09-10
---

# GitHubリリース: 1.6.0

`1.6.0` は [GitHub v1.6.0 tag/release](https://github.com/RNA4219/code-to-gate/releases/tag/v1.6.0)
として2026-09-10に公開済みです。タグは
`0260825379a6698c5dab4ec5303dfecc8536a014` に固定されています。npm package は未公開で、
同日の `npm view` は E404、`npm whoami` は E401 でした。これらは公開権限全体を判定する
証拠ではありません。公開承認は [RA-20260910-01](RA-20260910-01.md)、公開結果の正本は
[v1.6.0リリースノート](v1.6.0.md)、公開検収は
[AC-20260910-15](../acceptance/AC-20260910-15-release-1.6.0.md)に記録しています。

## 候補範囲

- Roadmap completion check に action/task table の契約と、完了IDの厳密な証跡照合を追加。
- [精度レビュー証跡](../acceptance/AC-20260910-02-precision-review.md)を保持。1,449件の別 run と4件の現行非再現記録を含むが、人手判定前のため製品全体の精度主張には使わない。
- optional per-rule severity は実装・対象検証済み。任意 policy 設定として公開版に含めるが、人手精度判定を主張するものではない。
- Birdseye index/cap repair は実装・対象検証済み。最終検証記録は [AC-20260910-14](../acceptance/AC-20260910-14-ci-integration.md) から参照する。
- CIのmaintenance検証接続、独立実行IDの衝突防止、diff policy対応、精度レビュー画面、Markdown/Viewerのseverity理由表示を追加。
- root `fast-uri` は `3.1.7`、demo fixture `qs` は `6.16.0` に準備。その他の依存更新はこの準備に含めない。

## 必須の最終ゲート

- 追加5件（CI接続・実行ID・diff policy・精度レビュー画面・severity理由表示）の最終結果は [AC-20260910-14](../acceptance/AC-20260910-14-ci-integration.md) で管理する。
- 親による依存インストールとlockfile整合性確認は完了。
- 前段5件の結果は `docs/acceptance/AC-20260910-06-maintenance.md` に保持する。統合後の検証結果は [AC-20260910-14](../acceptance/AC-20260910-14-ci-integration.md) に記録する。
- optional severity の analyze/readiness/baseline 横断テストと Birdseye の再生成・参照検証は対象検証済み。
- 公開tgz、manifest、summary、SHA256SUMSのdownload/local hash一致と、隔離install・CLI 1.6.0・SDK・scan・schema検証を確認。

Task Seed は
[20260910-01](../tasks/20260910-01-ledger-sync.md)、
[20260910-02](../tasks/20260910-02-precision-review.md)、
[20260910-03](../tasks/20260910-03-release-prep.md)、
[20260910-04](../tasks/20260910-04-birdseye.md)、
[20260910-05](../tasks/20260910-05-severity-tuning.md)、追加5件の
[実行記録](../../orchestration/follow-up-20260910.md)で追跡します。最終検証の結果は
[AC-20260910-14](../acceptance/AC-20260910-14-ci-integration.md)に集約します。

統合revisionは `a793d2f` です。GitHub Releaseの公開確認は完了し、npm publishは別ゲートとして追跡します。
npm、バイナリ、Docker CLIの配布はこのリリース文書では主張しません。
