---
intent_id: DOC-PRODUCT-MATURITY-ISSUES-001
owner: code-to-gate
status: active
last_reviewed_at: 2026-07-04
next_review_due: 2026-08-04
---

# Product Maturity Issues

この文書は、code-to-gate の現在地を「PoC / MVP / product candidate / public product」の観点で整理し、公開表現、精度証跡、配布、QAチェーン内での役割に残る課題を追跡する。

結論として、code-to-gate は v0.1 PoC そのものではない。CLI、schema、artifact、viewer、plugin、export、rule set、release-readiness の実装証跡はあり、QAチェーン内の品質証跡センサーとして実用候補に到達している。

一方で、単体で mature SAST / enterprise security scanner / public stable product として扱うには、精度検証、配布、外向き文言、human-facing report の整理が不足している。

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
| `docs/distribution-status.md` | `package.json` は 1.5.0、GitHub release は v1.4.2、npm registry は未公開。 |
| `docs/public-readiness.md` | security scanning、enterprise organizations など、外向き表現が強い。 |
| `docs/acceptance-review-manual-bb.md` | v0.1 MVP は GO。ただし text fallback、実 LLM provider contract、次段階 AST adapter 強化が残余リスクとして記録されている。 |
| `docs/product-gap-analysis.md` | Phase 1-5 の完了事項が多く、PoC からの進展は明確。 |
| `docs/product-acceptance-v1.md` | 本来は real repo 数、FP/FN、human review による acceptance が段階基準。 |
| `docs/assurance-precision-evaluation.md` | controlled fixture 精度であり、実 repo 全体の precision 保証ではないと明記。 |
| `docs/real-repo-validation-record.md` | Real repo validation としつつ、記録内容は fixture 実行中心に見える。 |
| `docs/rule-precision-backlog.md` | 既知の false positive / detector precision 改善候補が残っている。 |

## 3. 課題一覧

| ID | 優先度 | 課題 | 根拠 | 影響 | 対応方針 |
|---|---|---|---|---|---|
| MT-01 | P0 | 外向き表現が実証済み精度より強い | `public-readiness.md` は security scanning / enterprise を前面に出す一方、README は SAST 代替ではないと説明している。 | 利用者が確定脆弱性診断や enterprise scanner と誤解する。false positive が製品不良として受け取られやすい。 | public docs を「QA evidence」「review-required candidates」「release-readiness input」に寄せる。security は補助観点として扱う。 |
| MT-02 | P0 | npm 未公開で配布状態が public stable と一致しない | `docs/distribution-status.md` は npm registry 未公開、GitHub release v1.4.2、local package 1.5.0 と記録している。 | 導入再現性、サポート、外部検証の信頼性が弱い。 | v1.5.0 を GitHub release / npm publish するか、README と public docs を GitHub install 前提へ明確化する。 |
| MT-03 | P0 | real repo precision evidence が不足・混線している | `assurance-precision-evaluation.md` は controlled fixture 限定と明記。`real-repo-validation-record.md` は 4 fixtures を real repo 動作として PASS 扱いしている。 | FP/FN 目標を外部へ説明しづらい。実運用時の検出精度が読み切れない。 | 3+ / 5+ / 10+ の実 repo acceptance を再実行し、artifact、human TP/FP/Uncertain 判定、対象 commit を保存する。fixture 証跡とは分離する。 |
| MT-04 | P0 | finding severity / category が人間向け報告には粗い | QA観点では広く拾えているが、`critical` / `high` が「確定事故」ではなく「確認候補」として混在する。 | チームへそのまま渡すと、誤検知よりも表現の強さが摩擦になる。 | report profile を分ける。machine profile は広め、human profile は「要確認」「根拠」「影響仮説」「確度」を明示する。 |
| MT-05 | P1 | detector precision backlog が残っている | `docs/rule-precision-backlog.md` に HARDCODED_SECRET、DEBT_MARKER、MISSING_INPUT_SANITIZATION、RAW_SQL の改善候補がある。 | 自己解析や大規模 repo でノイズが増え、suppression 依存が強くなる。 | backlog item ごとに rule regression test を追加し、suppression ではなく detector 側で削る。 |
| MT-06 | P1 | product acceptance と完了記録の粒度が揃っていない | `product-acceptance-v1.md` は段階基準を定義するが、完了記録・RUNBOOK・個別 evidence の対応が散らばっている。 | 第三者が「何が本当に通ったか」を追跡しにくい。 | acceptance evidence index を作り、各基準に対して command、artifact path、対象 commit、判定者、日付を結ぶ。 |
| MT-07 | P1 | database analysis は preview 契約が残る | `docs/distribution-status.md` は `database-assets@v1alpha1` を experimental artifact として扱う。 | DB解析を stable surface と誤認されると、破壊的変更時に互換性期待を壊す。 | DB analysis は preview / experimental と明示し、stable 化前に schema review と migration guide を追加する。 |
| MT-08 | P1 | QAチェーン内の役割が public docs で弱い | five-tool chain では Code-to-gate は広めに候補を拾い、HATE / manual-bb / QEG へ渡す前段センサーとして機能する。 | 単体ツールとして過剰評価されるか、逆に false positive だけで過小評価される。 | README / public brief に「standalone mode」と「QA chain mode」の違いを追加する。 |
| MT-09 | P2 | confidence / evidence model が report 上で不足する | finding が source / sink / sanitizer / trust boundary / test evidence absence のどれに基づくかが、report だけでは読み取りづらい。 | LLM 後段や人間レビューで文脈復元コストが高い。 | finding schema/report に `confidence`, `evidenceKind`, `contractAssumption`, `reviewHint` を追加する。 |
| MT-10 | P2 | RUNBOOK review 日付と一部 status が古い | RUNBOOK front matter の `next_review_due` が 2026-05-15 のまま。 | 現在の製品判断と運用入口の鮮度がズレる。 | RUNBOOK の定期レビューで front matter と既知負債 section を更新する。 |

## 4. 次に実施する改善パッケージ

### 4.1 P0: public positioning alignment

目的: 実態と外向き表現を揃える。

Done 条件:
- `README.md`, `README_JA.md`, `docs/public-readiness.md`, `docs/public-brief.md` が同じ位置づけを説明する。
- 「SAST / vulnerability scanner replacement ではない」「review-required candidates である」を明記する。
- security wording は「quality and security-relevant code patterns」程度に抑える。
- human-facing report の severity 表現を、gate blocking と人間心理上の危険度で分離する。

### 4.2 P0: real repo precision evidence

目的: fixture 精度と実 repo 精度を分離し、外部に説明できる形にする。

Done 条件:
- 3+ public repo の scan/analyze/readiness を対象 commit 固定で再実行する。
- findings を TP / FP / Uncertain / Accepted design に分類する。
- FP rate と Uncertain rate を rule 別に出す。
- `docs/real-repo-validation-record.md` を fixture record と real repo record に分割する。

### 4.3 P1: report profile split

目的: machine-first output と team-facing output を分ける。

Done 条件:
- `--report-profile machine` は現行に近い広め検出を維持する。
- `--report-profile human` は断定調を避け、影響仮説、確認手順、確度を出す。
- `critical` / `high` は gate severity と review severity を分けて表示する。
- manual-bb / QEG へ渡す JSON は情報量を落とさない。

### 4.4 P1: classifier precision backlog

目的: 広く拾う設計を残しつつ、明らかなノイズを減らす。

Done 条件:
- `HARDCODED_SECRET` が HTML password field、schema property、self-reference を誤検出しない。
- `UNSAFE_DELETE` が DOM remove / localStorage remove / temp file cleanup / bounded upload cleanup を区別する。
- `UNSAFE_REDIRECT` が same-origin navigation、custom scheme callback、user-controlled open redirect を区別する。
- `innerHTML` 系 rule が stored sanitized HTML、trusted render contract、untrusted source を分ける。

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
- `docs/real-repo-validation-record.md`
- `docs/rule-precision-backlog.md`
