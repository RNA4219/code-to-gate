# 精度評価の実リポジトリ試行（2026-09-10）

この記録は新しい評価手順の試行であり、製品全体の精度合格判定ではない。
解析は基準 HEAD `53897b912b390914dda145c98dd72d8147ab6b0e` から build した
version 1.5.1 で実行した。今回のseverity変更後の解析結果とは区別する。

## 対象と結果

| repo | 固定したfull SHA | findings | 判定状況 |
|---|---|---:|---|
| axios | `e435384f36bdd310ae784d652e97a0383d1c52a7` | 10 | AI案: TP 4 / FP 1 / AcceptedDesign 5 |
| dayjs | `98364bcebc047529345cc8c2bbcc44a6a8c18e79` | 3 | Uncertain 3 |
| express | `18e5985b8a9d5e8423db0a9121f22bdaecd5b120` | 20 | Uncertain 20 |
| react | `e71a6393e66b0d2add46ba2b2c5db563a0563828` | 1416 | Uncertain 1416 |

合計1449件。全repoの解析はexit 0 / completeness complete、analyze profileの
strict schema validationは必須7 artifactすべて成功した。
全reviewで `humanReviewed: false`、`precision_reportable: false` を確認した。
7月4日の1721件とは別runであり、件数差を精度改善率とは扱わない。

## 再実行手順

各repoのHEADを確認し、次のコマンドをrepoごとに実行した。

```text
node dist/cli.js analyze <repo> --llm-provider deterministic --llm-mode local-only --cache disabled --emit all --out <out>
node dist/cli.js schema validate-all <out> --strict --profile analyze
node scripts/precision-review.mjs create --from <out>/findings.json --out <out>/review.json --reviewer luna-assisted-local-review --reviewer-kind ai --repo <repo>
node scripts/precision-review.mjs update --from <out>/review.json --findings <out>/findings.json --out <out>/review.json --force --input <axios-ai-proposed-updates.json>
node scripts/precision-review.mjs summarize --from <out>/findings.json --review <out>/review.json --out <out>/summary.json
```

updateはaxiosだけに適用した。他のrepoは未判定を維持した。

## 証跡の所在

ローカル証跡root:
`C:/Users/ryo-n/Codex_dev/code-to-gate-work-20260910/real-repo/`。
`manifest.json` に各repoのfull SHA、run ID、source tool、分類件数と
findings/review/summaryのSHA-256を保存した。各repoのサブディレクトリに
artifact本体と解析ログがある。AI案は一つ上の `axios-ai-proposed-updates.json`。

run IDは分単位で複数repo間で一致する場合があるため、単独の識別子には使わない。
入力生bytesのSHA-256、repo root、revision/full SHA、finding IDとevidence hashを
組み合わせて混入を拒否する。

## 残る判定

AI案の確認を含め、人間による判定は未実施。人手精度の採否を記録する場合は
実際のreviewerと判定根拠が必要であり、この試行をhumanに変更して代用しない。
実装の統合テスト結果は `AC-20260910-06-maintenance.md` に記録する。
