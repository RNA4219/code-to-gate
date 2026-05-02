---
intent_id: GR-001
owner: code-to-gate
status: active
last_reviewed_at: 2026-04-30
next_review_due: 2026-05-15
---

# code-to-gate GUARDRAILS

全メンバー必読のガードレール、行動指針。

## 1. 禁止事項

### 1.1 法務・セキュリティ

| # | 禁止 | 理由 |
|---:|---|---|
| 1 | OSS core に company-specific rule を書く | 法務リスク、職務著作境界 |
| 2 | 社内 repo 解析結果を public fixtures に含める | 機密漏洩 |
| 3 | private code / private result を OSS repo に入れる | 機密漏洩 |
| 4 | real service / real user data を fixtures に使う | 機密漏洩、GDPR/個人情報 |
| 5 | API key / token / password を artifact に含める | secret 漏洩 |
| 6 | `.env` body を LLM に送る | secret 漏洩 |
| 7 | configured company string を LLM に送る | 機密漏洩 |

### 1.2 設計・実装

| # | 禁止 | 理由 |
|---:|---|---|
| 8 | LLM を最終判定者にする | evidence なし判定のリスク |
| 9 | evidence なし finding を出力する | 再現性・説明可能性崩壊 |
| 10 | plugin 単独で suppression を有効化する | 権限昇格リスク |
| 11 | plugin 単独で gate status を決定する | 権限昇格リスク |
| 12 | schema validation を迂回する | 契約崩壊 |
| 13 | private repo 外の任意ファイルを読む | 機密漏洩 |
| 14 | network access を既定で許可する | 外部送信リスク |
| 15 | downstream repo の正本領域を再実装する | 重複・責務境界崩壊 |

### 1.3 運用

| # | 禁止 | 理由 |
|---:|---|---|
| 16 | 本番無人リリース承認の最終権限を持つ | 人間判断必須 |
| 17 | unsupported claims を primary artifact に入れる | 説明可能性崩壊 |
| 18 | invalid artifact を削除する | 監査性崩壊 |
| 19 | audit.json を省略する | 再現性・監査性崩壊 |

---

## 2. 必須事項

### 2.1 Evidence

| # | 必須 | 理由 |
|---:|---|---|
| 1 | finding は evidence >= 1 | 説明可能性 |
| 2 | evidence は repo root 相対 path | 再現性 |
| 3 | LLM 生成物は元 finding/evidence 紐付け | 説明可能性 |
| 4 | evidence なし LLM 主張は unsupported_claims 隔離 | 説明可能性 |

### 2.2 Schema

| # | 必須 | 理由 |
|---:|---|---|
| 5 | artifact は `ctg/v1` version 持つ | 互換性 |
| 6 | artifact は schema validation 通る | 契約遵守 |
| 7 | schema 破壊変更は version up | 互換性 |

### 2.3 Audit

| # | 必須 | 理由 |
|---:|---|---|
| 8 | audit.json 生成 | 監査性 |
| 9 | audit に policy_id / plugin_versions 記録 | 再現性 |
| 10 | LLM 使用時は provider/model 記録 | 再現性 |
| 11 | redaction 実行時は redaction audit 記録 | 監査性 |

### 2.4 連携

| # | 必須 | 理由 |
|---:|---|---|
| 12 | downstream export は adapter schema validation | 契約遵守 |
| 13 | 連携先 repo の正本領域を尊重 | 責務境界 |

---

## 3. 推奨事項

### 3.1 実装

| # | 推奨 | 理由 |
|---:|---|---|
| 1 | 小さく・短時間で終わる branch | rebase 追従 |
| 2 | 依存順序でタスク分解 | ブロッカー回避 |
| 3 | fixtures を本番より先に作る | 検収加速 |
| 4 | schema を最初に固定 | 全体安定 |

### 3.2 文書

| # | 推奨 | 理由 |
|---:|---|---|
| 5 | README に Scope/Non-goals 入れる | 境界明示 |
| 6 | Origin Policy を初回 commit 入れる | provenance 明示 |
| 7 | docs/*.md と schemas/*.json を一致させる | 契約整合 |

---

## 4. 失敗時挙動

| 状態 | 挙動 |
|---|---|
| LLM 失敗 | deterministic artifact 残す、status needs_review |
| parser 失敗 | partial graph 残す、diagnostic に入れる |
| import 失敗 | import 以外継続、exit code 8 |
| schema invalid | invalid artifact 隔離、exit code 7 |
| plugin crash | plugin 前 artifact 残す、exit code 6 |

---

## 5. 判断基準

### 5.1 Release Status

| status | 条件 |
|---|---|
| `passed` | policy blocking 条件なし、artifact complete |
| `passed_with_risk` | blocking なし、high risk/partial warning あり |
| `needs_review` | 人間確認必要 |
| `blocked_input` | blocking finding/threshold 超過 |
| `failed` | tool 実行失敗 |

### 5.2 LLM Confidence

| confidence | 扱い |
|---:|---|
| >= 0.80 | 通常採用 |
| 0.60-0.79 |採用 + needs_review_hint |
| 0.40-0.59 | artifact 入れる、downstream review required |
| < 0.40 | unsupported_claims 隔離 |

---

## 6. 例外処理

### 6.1 waiver

- critical finding を accepted にする場合、waiver_doc 必須
- waiver は人間承認必須

### 6.2 suppression

- suppression_reason 必須
- policy YAML で suppression_rules 定義
- plugin 単独で有効化禁止

---

## 7. 変更管理

### 7.1 schema変更

- field追加: minor compatible (version維持)
- field削除/型変更: major incompatible (version up)
- enum値追加: downstream unknown許容なら compatible
- enum値削除: incompatible (version up)

### 7.2 文書更新

- requirements.md 変更時は acceptance-v0.1.md 整合確認
- artifact-contracts.md 変更時は schemas 整合確認
- integrations.md 変更時は schemas/integrations 整合確認

---

## 8. 監査・再現

### 8.1 再現条件

- 同一 commit + 同一 policy + 同一 plugin versions = 同一 gate 結果

### 8.2 監査項目

- generated_at
- repo_revision
- policy_id
- plugin_versions
- llm.provider/model (LLM 使用時)
- artifact hash

---

## 9. 参照

- [BLUEPRINT.md](BLUEPRINT.md): 要件・制約・背景
- [docs/error-model.md](docs/error-model.md): exit code、失敗分類
- [docs/llm-trust-model.md](docs/llm-trust-model.md): LLM 信頼モデル
- [docs/plugin-security-contract.md](docs/plugin-security-contract.md): plugin 安全境界
- [RUNBOOK.md](RUNBOOK.md): 実行手順