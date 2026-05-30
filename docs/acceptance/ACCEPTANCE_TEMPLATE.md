---
acceptance_id: AC-YYYYMMDD-xx
task_id: YYYYMMDD-xx
intent_id: INT-___
owner: your-handle
status: draft   # draft|approved|rejected
reviewed_at: 2026-05-31
reviewed_by: your-handle
approval_type: null  # technical|security|risk_acceptance
release_approval_id: null  # RA-YYYYMMDD-XX
---

# Acceptance Record Template

## Scope

- 対象変更:
- 非対象:

## Acceptance Criteria

- [ ] 条件 1
- [ ] 条件 2

## Evidence

- 実行コマンド:
- テスト結果:
- 参照ドキュメント:
- 追加ログ / スクリーンショット:

## Verification Result

- 判定: pending
- コメント:
- フォローアップ:

## Release Mapping

- Release Approval ID: <!-- RA-YYYYMMDD-XX -->
- Release Version: <!-- vX.Y.Z -->
- Release Note: <!-- [docs/releases/vX.Y.Z.md](../releases/vX.Y.Z.md) -->

> 承認完了後、Release Approval Record（RA-XXX）と相互参照を設定する。

---

## Approval Type 分類

| Type | 説明 | 使用条件 |
| --- | --- | --- |
| technical | 技術要件達成 | 機能/性能/テスト確認完了 |
| security | セキュリティ審査完了 | Security Review Checklist完了、Security Gate成功 |
| risk_acceptance | リスク受容合意 | リスク評価記録、緩和措置合意、承認者サインオフ |