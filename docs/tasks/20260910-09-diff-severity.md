---
task_id: 20260910-09
intent_id: DIFF-SEVERITY-20260910-09
owner: code-to-gate-team
status: done
last_reviewed_at: 2026-09-10
next_review_due: 2026-10-10
---

# diffへのseverity policy適用

`analyze` / `readiness`に加え、`diff --policy`で任意のseverity調整を適用する。
元severityと理由を保持し、JSON・件数・audit・終了判定を調整後の値に揃える。
policy無指定時の検出・終了判定を維持し、不正policyは明示的に失敗させる。

## diffで対応するpolicy範囲

`version`、`policy_id`、`severity_overrides`（camel case aliasを含む）、
`blocking`、`confidence`、`partial`、およびbaseline/manual-evidence条件を含まない`dsl`を受け付ける。
`suppression`、`baseline`、`llm`、`exit`、`rule_options`、未知のtop-level項目、
baseline/manual-evidenceを使うDSLはdiffの入力コンテキスト外なので`POLICY_FAILED`とする。

policy指定時はraw-findings.jsonへ検出時severityを保存し、findings.json・console summary・
audit.json・終了コードはeffective severityと共有policy評価結果を使う。policyはGit取得および
空差分分岐より前に検証するため、不正policyを空差分で成功扱いしない。validな空差分は
completeな0件artifactとして成功する。Git失敗は従来どおり`SCAN_FAILED`で、artifactを書かない。
policy未指定時も検出と戻り値は維持し、auditの終了コードだけは実際の戻り値と一致させる。

検収: raw/effective severity、policy評価、未対応項目の拒否、空差分、Git失敗、既存diff testを確認。
`src/cli/__tests__/diff-policy.test.ts`は27 tests passed、既存diff testとの合計は69 tests passed。
変更対象lintと`npm run typecheck`は成功。
