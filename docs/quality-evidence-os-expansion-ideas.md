---
intent_id: QEOS-IDEAS-001
owner: code-to-gate
status: active
last_reviewed_at: 2026-07-05
next_review_due: 2026-08-05
---

# Quality Evidence OS 追加案

## 1. Evidence Query Language

`ctg query "finding where severity >= high and baseline.status = new"` のように、
artifact を横断検索する軽量 query を提供する。PR bot、viewer、release pack の
共通抽出層になる。

## 2. Evidence Redaction Profile

public OSS、private CI、regulated repo で出力できる情報量を切り替える。

- `public`: path/hash/count 中心。
- `private`: excerpt と evidence detail を含める。
- `regulated`: signer、retention、approval binding を必須化。

## 3. Gate Explainability Snapshot

「なぜ落ちたか」だけでなく、「何が変われば通るか」を機械可読にする。

例:

- remove finding ids
- lower severity after evidence review
- attach manual-bb evidence
- update baseline by approval

## 4. Community Rule Quality Score

plugin marketplace を作る前に、rule 自体の品質を測る。

- fixture coverage
- false-positive review status
- evidence completeness
- schema compatibility
- runtime cost

## 5. Self-Auditing Drift Budget

`spec-drift.json` を継続的に蓄積し、docs/schema/test/help の不整合に
「drift budget」を設定する。release branch では budget 超過を block、
通常PRでは PR comment に修正対象を列挙する。

- public schema 追加時に docs と schema coverage の更新を要求する。
- CLI target 追加時に `--help` と CLI reference の更新を要求する。
- RUNBOOK / Task Seed / CI workflow まで比較範囲を広げ、実装済み宣言と
  実装証跡のズレを status drift として扱う。

## 6. Evidence Provenance Index

PRコメント、viewer行、release-pack HTML、SARIF annotation など、人間が見る
surface から元 artifact/hash/source id へ戻れる逆引き index を独立artifact化する。
`evidence-dag` の edge を補完し、外部BotやIDE拡張も同じ索引を使えるようにする。

## 7. App-Native Review Queue

GitHub App化した PR reviewer が、単発コメントではなく repository 横断の review queue
を持つ。SLO逸脱、baseline expiry、manual oracle gap を queue item として蓄積し、
担当owner、due date、dismissal reason を管理する。

## 8. Quality Pack Golden Repository Suite

各 quality pack に sample repo と expected artifact を持たせるだけでなく、
golden repository suite として定期実行し、pack更新時に検出力と false positive を
継続測定する。Community Rule Quality Score の入力にもする。

## 9. Baseline Debt Ledger

baseline を単なる比較入力ではなく、owner、expiry、承認者、更新理由、残債金額/工数、
再発防止メモを持つ debt ledger に拡張する。期限切れ baseline は release gate と
review queue の両方に表示する。

## 10. Hosted Evidence Portal

`viewer --hosted` を単一HTMLから evidence portal へ拡張し、複数run、historical SLO、
release pack、manual-bb結果、PR review backlink を横断検索できる静的サイトとして生成する。

## 11. GitHub App Health Evidence

常設Bot化した GitHub App の installation token 取得、repository permission、
rate-limit、comment marker 更新結果を `github-app-health.json` として保存する。
`doctor` は静的 workflow 診断、health artifact は実App稼働診断を担う。

## 12. QEOS Acceptance Matrix Artifact

QEOS-021..030 のような複数surface実装では、Task Seed status、仕様acceptance、
schema、CLI、テスト、CI gate の対応を `qeos-acceptance-matrix.json`
として出力する。完了宣言前に、各要件がどの artifact / test / command で
証明されるかを機械可読にし、Workflow-cookbook の Task Seed 完了監査を自動化する。
