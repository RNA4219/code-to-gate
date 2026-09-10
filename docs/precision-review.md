# precision-review@v1 運用

`precision-review@v1` は `findings.json` の生 bytes と、解析 run・repo・commit・finding の evidence を結び付ける private 運用 JSON です。`ctg/v1` の公開 artifact や公開 schema として登録しません。

## 作成と更新

build 済みの `dist` を使って実行します。

```bash
npm run build
node scripts/precision-review.mjs create --from findings.json --out review.json \
  --reviewer model-id --reviewer-kind ai --repo /path/to/repo
node scripts/precision-review.mjs update --from review.json --findings findings.json \
  --out review.json --force --finding-id finding-001 --classification FP --comment "根拠"
node scripts/precision-review.mjs summarize --from findings.json --review review.json --out summary.json
```

作成時の分類は全件 `Uncertain` です。出力先が存在する場合は `--force` がない限り上書きしません。`update --input updates.json` では、`finding_id`、`classification`、任意の `comment` を持つ配列を一括適用できます。

`--force`でも元のfindings、集計対象のreview、batch更新の入力ファイルは出力先にできません。`update`によるreview自体の上書きは可能です。

review は生 `findings.json` の SHA-256 hex digest、`run_id`、`repo.root`、revision/full SHA、finding ID・rule ID・fingerprint・evidence ref hash を保存します。入力bytesの欠落、不一致、別run/repo/commit/evidenceの混入、未知・重複・欠落したfinding IDはsummarizeで拒否します。commitが不明でも保存・集計できますが、precisionはreportableになりません。APIでsource bytesを省いたreviewを作成した場合、そのreviewは入力hashが未確定のため集計できません。

## ローカルのレビュー画面

作成済みreviewから、外部サービスを使わずに編集できるHTMLを生成します。

```bash
code-to-gate precision-review --from findings.json --review review.json \
  --out review.html --repo /path/to/repo
```

`review.html`をブラウザで開き、findingを検索・絞り込みして分類とコメントを編集します。表示件数が多い場合はページを切り替えます。変更はメモリ内に保持するため、終了前にJSONを保存してください。再開時は同じHTMLに保存したJSONを読み込みます。HTMLの生成元とrun・入力hash・repo・commit・findingの根拠が異なるJSONは取り込みません。

コード表示には明示的な `--repo` が必要です。根拠と結び付いたcommitから行番号付近のコードを取得します。dirtyな解析、commitやrepoの不一致、取得不能、取得上限では理由を表示します。repoを指定しなくてもfindingと根拠情報のレビューは可能です。

import artifactの`repo.root: "."`は、明示した`--repo`を対象rootとして扱います。実行場所がrepo外でも、結び付いたcommitを確認できればコードを表示します。

AI reviewerの分類はAIレビューとして保存します。新しい人手レビューを始める操作では画面内のreviewer名を入力し、分類を全件Uncertain、コメントを空に戻します。保存済みのhuman reviewを読み込んだ場合は、そのreviewer名と編集結果を再開できます。

既存HTMLの上書きには `--force` が必要です。入力のfindings/reviewファイル自体を出力先として上書きすることはできません。HTMLには根拠やコードを含むため、手元のレビュー用成果物として扱ってください。

画面で保存したJSONの検証・集計は既存の処理を使います。

```bash
node scripts/precision-review.mjs summarize --from findings.json \
  --review precision-review.json --out summary.json
```

## 集計と主張範囲

分類は `TP`、`FP`、`Uncertain`、`AcceptedDesign` です。FP rate は明示的に `FP / (TP + FP)` とし、`AcceptedDesign` と `Uncertain` は別カウントです。分母が 0 の場合は `null` です。`by_rule` に rule ごとの同じ集計を出します。

`precision_reportable` は、source が complete で commit binding が検証でき、reviewer が明示された human で、全 finding が確定分類され、TP+FP が正である場合だけ true です。AI review や Uncertain を含む review は、人手 precision の根拠になりません。`humanReviewed` は分類完了の状態、`precision_reportable` は精度を主張できる状態として分離しています。

既存の `fp-review.ps1` と `fp-review.sh` は主要引数を維持した thin wrapper です。`--interactive`/`-Interactive` では分類と日本語コメントを review JSON に保存し、非対話時は AI review として扱います。phase 引数は旧運用の文脈表示用で、new summary の reportability を変更しません。

実repoでの試行と判定状況は [2026-09-10の検収記録](acceptance/AC-20260910-02-precision-review.md) を参照してください。
