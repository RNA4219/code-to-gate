---
task_id: 20260910-11
intent_id: SEVERITY-REPORT-20260910-11
owner: code-to-gate-team
status: done
last_reviewed_at: 2026-09-10
next_review_due: 2026-10-10
---

# severity調整理由の表示

JSONのseverityResolutionをMarkdownとViewerへ反映し、元の重要度・適用後・policy・理由を確認できるようにする。
調整されていないfindingの表示とraw集計の意味を維持する。

検収: 調整あり/なし、同じseverityへの明示設定、複数行や表示記号を含む理由、HTML/Markdownの安全な表示。

## 実装

Markdownは既存のSeverityセル、Raw/Effective counts、Human Review Guideを維持し、
`severityResolution`を持つfindingがある場合だけ独立した`Severity Adjustments`表を追加する。
表にはfinding ID、original、effective、policy、reason、matched selectorsを出力する。
pipe・改行・HTMLタグ・Markdownリンク記法をセル値として安全に表示し、未調整findingの出力は変えない。

Viewerはfinding detail rendererで元severityから適用severityへの遷移を表示し、policy、reason、selectorは
`escapeHtml`でテキスト化する。`report-viewer`からfinding configへredaction profileを伝播し、private（既定）では
詳細を表示する。public（`allowsDetail: false`）では元severityと適用severityだけを表示し、新しいpolicy・reason・
matched selectorsの詳細を露出しない。

## 検証記録

次の限定検証はすべてexit 0だった。

- `npx vitest run src/viewer/__tests__/report-viewer.test.ts src/viewer/__tests__/viewer-expansion.test.ts --maxWorkers=1 --reporter=dot`（2 files、62 tests）
- `npx vitest run src/reporters/__tests__/severity-report.test.ts src/reporters/__tests__/markdown-reporter.test.ts --maxWorkers=1 --reporter=dot`（2 files、32 tests）
- `npx eslint src/reporters/markdown-reporter.ts src/reporters/__tests__/markdown-reporter.test.ts src/reporters/__tests__/severity-report.test.ts src/viewer/finding-viewer.ts src/viewer/report-viewer.ts src/viewer/report-scripts.ts src/viewer/__tests__/report-viewer.test.ts`

専用fixtureで、未調整・severityが同じ明示override・severity変更、複数行・pipe・HTML・リンク文字列、selector順序、
private/public profile、report-viewerからのprofile伝播を確認した。最終統合結果は
[AC-20260910-12](../acceptance/AC-20260910-12-follow-up.md) に記録する。

全体`npm run lint`は、所有外の`src/evaluation/__tests__/precision-review-source.test.ts:15`にあるself-assign
（`no-self-assign`）で一度exit 1となった。その箇所は修正され、その後の親の全体lintはexit 0となった。

追加の画面回帰として、Mermaidのraw renderer本文が閉じた`script`タグの外へ露出しないこと、3件のfinding
カードと`3 findings`の一覧件数が同じHTMLに存在すること、VM上のfilter script実行で表示カード数と一覧件数が
一致することを確認した。Viewer側のscript wrapper位置とfilter後の件数計算を修正した。
実ブラウザでも初期`3 findings`、High絞り込み後`1 findings`とカード数が一致し、理由の詳細表示が動作した。
