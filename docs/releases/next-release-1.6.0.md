---
release_version: 1.6.0
release_tag: null
release_date: null
status: candidate
publication: unpublished
approval_record: null
last_reviewed_at: 2026-09-10
---

# 次期リリース候補: 1.6.0

`1.6.0` はローカルで準備中の候補版です。公開済み GitHub release の最新は
`v1.5.1`（2026-07-22）です。npm package の未公開判定は E404 とローカル認証状態を
確認した2026-07-12の記録に基づき、今回の更新では npm API を再確認していません。

## 候補範囲

- Roadmap completion check に action/task table の契約と、完了IDの厳密な証跡照合を追加。
- [精度レビュー証跡](../acceptance/AC-20260910-02-precision-review.md)を準備。1,449件の別 run と4件の現行非再現記録を含むが、人手判定前のため製品全体の精度主張には使わない。
- optional per-rule severity は実装・対象検証済み。任意 policy 設定として含めるが、公開版機能とはまだ扱わない。
- Birdseye index/cap repair は実装・対象検証済み。前段5件の検収時は103 nodes / 122 edges / 103 capsで通過した。追加改修後の最終再生成結果はAC-20260910-12で管理する。
- CIのmaintenance検証接続、独立実行IDの衝突防止、diff policy対応、精度レビュー画面、Markdown/Viewerのseverity理由表示を追加。
- root `fast-uri` は `3.1.7`、demo fixture `qs` は `6.16.0` に準備。その他の依存更新はこの準備に含めない。

## 必須の最終ゲート

- 追加5件（CI接続・実行ID・diff policy・精度レビュー画面・severity理由表示）の最終結果は [AC-20260910-12](../acceptance/AC-20260910-12-follow-up.md) で管理する。
- 親による依存インストールとlockfile整合性確認は完了。
- 前段5件の結果は `docs/acceptance/AC-20260910-06-maintenance.md` に保持する。追加改修後もbuild、lint、typecheck、全体3,786 tests、coverage（4指標80%閾値）、package smoke、実ブラウザ操作を確認した。
- optional severity の analyze/readiness/baseline 横断テストと Birdseye の再生成・参照検証は対象検証済み。
- 候補範囲と公開根拠の最終レビュー。

Task Seed は
[20260910-01](../tasks/20260910-01-ledger-sync.md)、
[20260910-02](../tasks/20260910-02-precision-review.md)、
[20260910-03](../tasks/20260910-03-release-prep.md)、
[20260910-04](../tasks/20260910-04-birdseye.md)、
[20260910-05](../tasks/20260910-05-severity-tuning.md)、追加5件の
[実行記録](../../orchestration/follow-up-20260910.md)で追跡します。

候補版のローカル検収時点では tag、GitHub release、npm publish、merge、commit、承認記録は未作成です。
後続のPR統合はパッケージ公開とは区別して追跡します。
