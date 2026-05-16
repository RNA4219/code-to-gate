---
acceptance_id: AC-20260517-01
task_id: 20260517-01
intent_id: INT-SELF-ANALYSIS-001
owner: code-to-gate
status: passed
reviewed_at: 2026-05-17
reviewed_by: Claude Code
approval_type: technical
release_approval_id: null
---

# Acceptance Record: Self-Analysis Remediation

## Scope

- 対象変更:
  - suppression classification
  - raw / effective / accepted-exception summary
  - readiness transparency
  - broad suppression review
- 非対象:
  - 全 finding の返済完了
  - tree-sitter WASM compatibility

## Acceptance Criteria

- [x] suppression entry が class を持てる
- [x] class 未指定の既存 suppression も読み込める
- [x] self-analysis artifact で raw / effective / accepted exception が分かる
- [x] `readiness` が raw critical/high と suppressed critical/high を保持する
- [x] broad suppression が review-required として列挙される
- [x] `.ctg/suppressions.yaml` の migration 方針が文書化される
- [x] `UNSAFE_DELETE` / `TRY_CATCH_SWALLOW` / `RAW_SQL` / `LARGE_MODULE` の返済候補が backlog 化される

## Evidence

- 実行コマンド:
  - `npm run build`
  - `npx vitest run src/config src/reporters src/cli --reporter=dot`
  - `node .\dist\cli.js analyze . --emit all --out .\.qh-self --llm-provider deterministic`
  - `node .\dist\cli.js readiness . --policy .\fixtures\policies\strict.yaml --from .\.qh-self --out .\.qh-self`
- テスト結果:
  - config tests: 63 passed
  - reporters tests: 23 passed
  - readiness tests: 17 passed (selfAnalysis tests added)
- 参照ドキュメント:
  - `docs/self-analysis-debt-inventory-2026-05-17.md`
  - `docs/self-analysis-remediation-requirements.md`
  - `docs/self-analysis-remediation-spec.md`
- 追加ログ / スクリーンショット:
  - `.qh-self/release-readiness.json`: selfAnalysis summary 確認済み
  - `.qh-self/self-analysis-debt.json`: raw/effective/accepted exception 確認済み
  - `broadSuppressions`: 16 detected, review-required message 出力

## Verification Result

- 判定: passed
- コメント:
  - self-analysis の gate 透明性改善が主目的。`passed` を無理に `blocked_input` へ変えること自体は目的ではない。
  - raw critical/high と suppressed critical/high が artifact 上で確認できる
  - broad suppression review が recommendedActions に出る
- フォローアップ:
  - Phase B: broad suppression 縮小
  - Phase C: 実装負債返済
  - Phase D: detector precision backlog

## Release Mapping

- Release Approval ID:
- Release Version:
- Release Note:
