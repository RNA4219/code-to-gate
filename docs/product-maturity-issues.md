---
intent_id: DOC-PRODUCT-MATURITY-ISSUES-001
owner: code-to-gate
status: active
last_reviewed_at: 2026-09-10
next_review_due: 2026-10-10
---

# Product Maturity Issues

この文書は、code-to-gate の現在地を「PoC / MVP / product candidate / public product」の観点で整理し、公開表現、精度証跡、配布、QAチェーン内での役割に残る課題を追跡する。

結論として、code-to-gate は v0.1 PoC そのものではない。CLI、schema、artifact、viewer、plugin、export、rule set、release-readiness の実装証跡はあり、QAチェーン内の品質証跡センサーとして実用候補に到達している。

一方で、単体で mature SAST / enterprise security scanner / public stable product として扱うには、実 repo の人手精度判定、配布導線、外向き文言の整理が不足している。人間向け `analysis-report.md` と Human Review Guide は実装済みだが、これは実 repo の精度保証や公開判定を置き換えない。

## 1. 現在の推奨位置づけ

| 観点 | 判断 |
|---|---|
| PoC | 既に超えている。CLI、artifact contract、schema v1、export、rule set、acceptance docs がある。 |
| OSS beta / local product candidate | 妥当。ローカル品質ゲート、QA evidence input、review-required finding generator として説明できる。 |
| 有償単体プロダクト | 可能性はあるが、現時点では人間向け要約、精度証跡、配布導線、サポート境界の整備が必要。 |
| SAST / 脆弱性診断ツール代替 | 非推奨。README の通り、linter / SAST そのものではなく、品質判断に使う証跡とゲート入力を作るレイヤーとして扱う。 |
| enterprise / IPO-grade readiness | 未達。公開表現と検証証跡の粒度がまだ揃っていない。 |

推奨する外向き表現:

> Local-first quality evidence and release-readiness gate input for developer QA workflows. Findings are review-required candidates, not confirmed vulnerabilities.

## 2. 調査ソース

| 文書 | 確認した観点 |
|---|---|
| `README.md`, `README_JA.md` | linter / SAST 代替ではなく evidence / gate input layer として説明している。 |
| `docs/distribution-status.md` | `package.json` は 1.6.0 のローカル候補、GitHub release は v1.5.1、npm registry は未公開。GitHub/source install が現行導線。 |
| `docs/public-readiness.md` | review-required evidence、SAST 代替ではないこと、automatic release approver ではないことを明記している。 |
| `docs/acceptance-review-manual-bb.md` | v0.1 MVP は GO。ただし text fallback、実 LLM provider contract、次段階 AST adapter 強化が残余リスクとして記録されている。 |
| `docs/product-gap-analysis.md` | Phase 1-5 の完了事項が多く、PoC からの進展は明確。 |
| `docs/product-acceptance-v1.md` | 本来は real repo 数、FP/FN、human review による acceptance が段階基準。 |
| `docs/assurance-precision-evaluation.md` | controlled fixture 精度であり、実 repo 全体の precision 保証ではないと明記。 |
| `docs/real-repo-validation-evidence-20260704.md` | 4 repo の実行は 4/4 pass。1,721 findings は human TP/FP 判定未実施で、全件 Uncertain と記録されている。 |
| [`docs/acceptance/AC-20260910-02-precision-review.md`](acceptance/AC-20260910-02-precision-review.md) | 別 run の 1,449 findings。FP-DM-002、FP-DM-003、FP-RS-002、FP-MIS-001 は現行検出なしの記録だが、人手精度判定は未実施。 |
| `docs/rule-precision-backlog.md` | HARDCODED_SECRET、DEBT_MARKER、RAW_SQL の既知ケースは detector 対応済み。MISSING_INPUT_SANITIZATION の accepted-design は残件として管理している。 |

## 3. 課題一覧

| ID | 優先度 | 課題 | 根拠 | 影響 | 対応方針 |
|---|---|---|---|---|---|
| MT-01 | monitor | 外向き表現の同期を維持する | `public-readiness.md` と README は review-required evidence、SAST 代替ではないこと、automatic release approver ではないことを明記している。 | 古い文書が残ると、利用者が確定脆弱性診断や enterprise scanner と誤解する。 | 公開文書のレビュー時に「QA evidence」「review-required candidates」「release-readiness input」の表現を維持する。 |
| MT-02 | P0 | npm 未公開で配布状態が public stable と一致しない | `docs/distribution-status.md` は local package 1.6.0、GitHub release v1.5.1、npm registry 未公開と記録している。 | 導入再現性、サポート、外部検証の信頼性が弱い。 | npm 公開までは README と public docs を GitHub/source install 前提に保ち、公開時に registry evidence を追加する。 |
| MT-03 | P0 | real repo precision evidence が不足している | `docs/real-repo-validation-evidence-20260704.md` は 4 repo の実行成功を記録するが、1,721 findings の human TP/FP adjudication は未実施。 | FP/FN 目標を外部へ説明しづらい。実運用時の検出精度が読み切れない。 | 対象 commit、artifact、human TP/FP/Uncertain 判定を別証跡で保存する。現時点では real repo precision を主張しない。 |
| MT-04 | P0 | 人間向け報告の確認導線は実装済みだが、精度保証とは別 | `src/reporters/markdown-reporter.ts` と `docs/cli-reference.md` に Human Review Guide、影響仮説、evidence、confidence、確認コマンドがある。 | ガイドの存在だけでは実 repo の判定や公開可否を確定できない。 | `analysis-report.md` は review-required candidates として運用し、machine artifact と人手判定を別に保持する。 |
| MT-05 | P1 | detector precision backlog に残件がある | `docs/rule-precision-backlog.md` では HS-001/002、DM-001、RS-001 の HEAD 実装を記録する一方、self-reference は suppression 継続、DM-002/003、RS-002、MISSING_INPUT_SANITIZATION は根拠不足または accepted-design として残る。 | 自己解析や大規模 repo で未判定ノイズが残る。 | 残件ごとに detector 改修または accepted-design の根拠を追加し、今回の完了範囲を越えて一括完了にしない。 |
| MT-06 | P1 | product acceptance と完了記録の粒度が揃っていない | `docs/acceptance-evidence-index.md` は存在するが、real repo の人手判定は未記入で、QEOS-031..042 は実装記録と受入証跡を分けて扱う必要がある。 | 第三者が「何が本当に通ったか」を追跡しにくい。 | command、artifact path、対象 commit、判定者、日付を受入時に追記する。 |
| MT-07 | P1 | database analysis は preview 契約が残る | `docs/distribution-status.md` は `database-assets@v1alpha1` を experimental artifact として扱う。 | DB解析を stable surface と誤認されると、破壊的変更時に互換性期待を壊す。 | DB analysis は preview / experimental と明示し、stable 化前に schema review と migration guide を追加する。 |
| MT-08 | P1 | QAチェーン内の役割を継続して明示する必要がある | `docs/five-tool-validation-chain.md`、CLI export、QEOS-031..042 の実装記録で、Code-to-gate は HATE / manual-bb / QEG へ渡す前段センサーと整理されている。 | 単体ツールの精度保証や最終リリース判定と誤解される余地がある。 | public docs では standalone と QA-chain の役割、QEG が最終 gate owner である境界を維持する。 |
| MT-09 | P2 | confidence / evidence model の残る項目が report 上で不足する | `analysis-report.md` は confidence、evidence kind、review hint を表示する。`contractAssumption` など finding schema 側の残る項目は未整理。 | LLM 後段や人間レビューで文脈復元コストが高い。 | 既存表示を維持し、schema/report の未反映項目だけを追加検討する。 |
| MT-10 | P2 | RUNBOOK review 日付と一部 status が古い | RUNBOOK front matter の `next_review_due` は 2026-08-04 で、現行レビュー時点を過ぎている。 | 現在の製品判断と運用入口の鮮度がズレる。 | RUNBOOK の定期レビューで front matter と既知負債 section を更新する。 |

## 4. 次に実施する改善パッケージ

### 4.1 P0: public positioning alignment

目的: 実態と外向き表現を揃える。

現状: README と `docs/public-readiness.md` の review-required evidence 表現は同期済み。継続監視とする。

Done 条件:
- `README.md`, `README_JA.md`, `docs/public-readiness.md`, `docs/public-brief.md` が同じ位置づけを説明する。
- 「SAST / vulnerability scanner replacement ではない」「review-required candidates である」を明記する。
- security wording は「quality and security-relevant code patterns」程度に抑える。
- human-facing report の severity 表現を、gate blocking と人間心理上の危険度で分離する。

### 4.2 P0: real repo precision evidence

目的: fixture 精度と実 repo 精度を分離し、外部に説明できる形にする。

現状: 4 repo の実行証跡はあるが、1,721 findings の人手判定は未完了。受入待ちとして継続する。

Done 条件:
- 3+ public repo の scan/analyze/readiness を対象 commit 固定で再実行する。
- findings を TP / FP / Uncertain / Accepted design に分類する。
- FP rate と Uncertain rate を rule 別に出す。
- `docs/real-repo-validation-evidence-20260704.md` と `docs/real-repo-validation-record.md` の fixture / real repo の証跡を別記録として維持する。

### 4.3 P1: report profile split

目的: machine-first output と team-facing output を分ける。

現状: `analysis-report.md` の human review guide（review-required candidates、
impact hypothesis、evidence、confidence、confirmation commands）は実装済み。
`--report-profile machine|human` のような別 CLI profile は将来拡張として残る。

Done 条件:
- `--report-profile machine` は現行に近い広め検出を維持する。
- `--report-profile human` は断定調を避け、影響仮説、確認手順、確度を出す。
- `critical` / `high` は gate severity と review severity を分けて表示する。
- manual-bb / QEG へ渡す JSON は情報量を落とさない。

### 4.4 P1: classifier precision backlog

目的: 広く拾う設計を残しつつ、明らかなノイズを減らす。

現状: HS-001/002、DM-001、RS-001 は HEAD 実装を記録済み。その他の項目は根拠確認待ち。

Done 条件:
- `HARDCODED_SECRET` が HTML password field、schema property、self-reference を誤検出しない。
- `UNSAFE_DELETE` が DOM remove / localStorage remove / temp file cleanup / bounded upload cleanup を区別する。
- `UNSAFE_REDIRECT` が same-origin navigation、custom scheme callback、user-controlled open redirect を区別する。
- `innerHTML` 系 rule が stored sanitized HTML、trusted render contract、untrusted source を分ける。

### 4.5 現行段階の実装トラッキング

- optional per-rule severity は実装・対象検証済みであり、任意 policy 設定として SPEC-26 に記録する。統合結果は `docs/acceptance/AC-20260910-06-maintenance.md` へ導く。
- Birdseye generator/check は実装・対象検証済みで、実 repo の生成・checkも通過した。統合結果は `docs/acceptance/AC-20260910-06-maintenance.md` へ導く。
- 精度レビューは 1,449件の別 run と4件の現行非再現記録までで、人手精度は未確認のまま継続する。

## 5. product claim guardrail

外向き資料では、次の表現を避ける。

| 避ける表現 | 理由 | 推奨表現 |
|---|---|---|
| 脆弱性を検出するツール | confirmed vulnerability と誤解される。 | security-relevant code patterns を確認候補として提示する。 |
| SAST replacement | README の非目標と矛盾する。 | SAST / linter / tests の結果を補完する evidence layer。 |
| enterprise-ready | 配布・精度証跡・サポート境界が未整備。 | local-first beta / product candidate。 |
| audit-ready | 監査証跡として使えるが、監査適合性を保証しない。 | audit-supporting artifacts。 |
| zero false positives | fixture 精度であり実 repo 保証ではない。 | fixture evaluation では FP 0、real repo precision は別途測定。 |

## 6. 受け入れ基準

この文書の課題を解消扱いにするには、以下を満たす。

- public docs と README の位置づけが矛盾しない。
- fixture validation と real repo validation が別文書・別証跡で管理される。
- npm / GitHub release / local package version の差分が `docs/distribution-status.md` に反映される。
- human-facing report profile が、確定不具合ではなく review candidate として読める。
- rule precision backlog の P0/P1 項目に regression test がある。

## 7. 関連文書

- `README.md`
- `README_JA.md`
- `RUNBOOK.md`
- `docs/distribution-status.md`
- `docs/public-readiness.md`
- `docs/product-gap-analysis.md`
- `docs/product-acceptance-v1.md`
- `docs/assurance-precision-evaluation.md`
- `docs/real-repo-validation-evidence-20260704.md`
- `docs/acceptance/AC-20260910-02-precision-review.md`
- `docs/tasks/20260910-05-severity-tuning.md`
- `docs/rule-precision-backlog.md`
