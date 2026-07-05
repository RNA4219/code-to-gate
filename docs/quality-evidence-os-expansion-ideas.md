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

