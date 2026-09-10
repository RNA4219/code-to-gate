---
task_id: 20260910-10
intent_id: PRECISION-WORKBENCH-20260910-10
owner: code-to-gate-team
status: done
last_reviewed_at: 2026-09-10
next_review_due: 2026-10-10
---

# 第4段階：精度レビュー操作画面

## 目的

`precision-review` の既存 private JSON 契約を入力として、ローカルだけで精度レビューを再開・保存できる self-contained HTML を生成する。

## 実装範囲

- `precision-review --from findings.json --review review.json --out review.html [--repo path] [--force]`
- Node 側で raw findings bytes の SHA-256 と既存 `validatePrecisionReview` / `summarizePrecisionReview` を通してから HTML を生成する。
- 一覧の検索、rule/category/classification 絞り込み、進捗、ページング、finding 詳細、根拠と任意の commit コード表示を提供する。
- ブラウザの JSON import は source、run、repo、全 finding の immutable binding を照合する。分類と日本語コメントだけを編集対象とする。
- AI reviewer は AI のまま保存し、「新しい人手レビュー」を選んだ場合だけ名前を要求して全件を `Uncertain` に戻す。

## コード表示とファイル保護

`--repo` は明示されたパスだけを使い、bound full SHA の `git show` を argv / `shell:false` で取得する。dirty repo、unknown SHA、binding 不一致、安全でない evidence path、取得上限超過は理由を表示してコードを非表示にする。入力 findings/review と同じ出力は `--force` でも拒否し、既存出力は通常 `wx` で保護する。

サーバー、ネットワーク、追加依存、localStorage は使用しない。保存した review JSON は既存の summarize 処理へ渡して再検証できる。

## 対象検証

- repo内のhelperで一時Git repo・findings・reviewを生成する。作業者のQA directoryには依存しない。
- CLI/source/UIの対象テストは成功。HEADが進んだ後のbound commit、1,000行目付近のコード、160行上限と省略表示、UTF-8 byte予算、出力の未存在directoryとhardlink aliasを確認した。
- 親の独立したUIイベント回帰14 testsは成功。AI編集のexport/summarize/import、10種類の入力照合不一致時の編集保持、human review再開、101件の実ページ送りと最終行編集、空集合、表示記号の安全な埋込みを確認した。
- 実ブラウザで3件の検索・filter・編集・JSON保存・集計・再読込、人手レビュー初期化と別run拒否、1,449件の29ページの移動と最終finding検索を確認した。
- EOF付近でコードがすべて表示される場合は省略表示を付けず、実際の160行上限超過だけを示すよう修正した。sourceの回帰4 testsと実ブラウザで確認した。
- インストール済みパッケージのCLIからreview HTMLを生成できることをpackage smokeで確認した。
- 全体検証結果は [AC-20260910-12](../acceptance/AC-20260910-12-follow-up.md) に記録する。UIの合成fixtureは実repoの人手精度の根拠として扱わない。
