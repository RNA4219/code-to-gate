# Task: SPEC-26 severity tuning

状態: done（最終full test済み。人手精度判定と公開判断は別残件）

## 目的

policy に順序付き severity override を追加し、検出時 severity と effective severity を明確に分離する。

## 完了条件

- `severity_overrides` と `severityOverrides` をロード・正規化し、selector の AND と first-match-wins を実装する。
- 不正な selector、glob、category、severity、reason、YAML を fail closed にする。
- resolver は元 severity を保存し、再適用で累積しない。
- raw findings は検出時値を保ち、effective findings と policy evaluator / DSL / count threshold が同じ値を使う。
- readiness の current/baseline が同じ policy で正規化される。
- policy schema、artifact 型、単体テスト、運用ドキュメントを更新する。
- `src/core/**` と `src/rules/**` は変更しない。

## 検証

専用 Vitest（`src/config/__tests__/severity-tuning-regression.test.ts`を含む）、severity tuning regression、
analyze/readiness/baseline、schema、DSL/count threshold、path/category、alias/error境界、及び
リポジトリ全体の最終full testは検証済み。結果は `docs/acceptance/AC-20260910-06-maintenance.md`へ追記する。
