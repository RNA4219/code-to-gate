---
intent_id: INT-ASSURANCE-SMELL-DETECTOR-001
owner: code-to-gate-team
status: implemented
last_reviewed_at: 2026-06-09
---

# Assurance Diff Semantic Specification

## 目的

Git diffから保証上の弱化候補を抽出する。候補はreview-required evidenceであり、bug、脆弱性、release blockを断定しない。

## 契約

- CLI: `code-to-gate assurance inspect <repo> --from <artifact-dir> --base <ref> --head <ref>`
- `--base`と`--head`は同時指定する。
- application層は`DiffAccess`契約だけに依存し、CLIが`GitDiffAccess`を注入する。
- Git実行は`spawnSync`の引数配列を使い、shell文字列を使わない。
- 変更ファイル上限は500件、file/diff上限は1 MiB。
- repo外path、絶対path、親directory参照、NULを拒否する。
- test、fixture、generated roleは候補対象から除外する。

## Rules

| Rule | Candidate signal | Required refutation |
|---|---|---|
| `GUARD_WEAKENED` | guard call/branch削除 | 変更後の同等guard |
| `VALIDATION_REMOVED` | validation/sanitization削除 | 変更後の代替validation |
| `ERROR_PATH_SUCCESS_FALLBACK` | error pathがsuccess/default/emptyへ変化 | explicit error handling |
| `BUSINESS_RULE_LOCALIZED` | shared rule call削除とlocal branch追加 | sibling caller不在またはshared rule維持 |

regex/text fallbackのconfidenceは保守的に扱う。取得不能・上限超過は可能な範囲でunsupported claimとして記録する。

## Acceptance

- 4 rulesのpositive/refutation fixtureが通過する。
- precision fixtureのFP rateがPhase 1目標15%以下である。
- outputは既存`findings@v1`互換でdecision fieldを含まない。
- lint、typecheck、smoke、architecture、package gateが通過する。
