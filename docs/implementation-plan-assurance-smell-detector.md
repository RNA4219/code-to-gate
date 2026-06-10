---
intent_id: INT-ASSURANCE-SMELL-DETECTOR-001
owner: code-to-gate-team
status: active
last_reviewed_at: 2026-06-08
next_review_due: 2026-06-22
---

# Implementation Plan: Assurance Smell Detector

## Summary

Assurance Smell Detectorを段階実装する。workflow-cookbookのBlueprint・Guardrails・Task Seed・Acceptance Record様式に従い、変更単位は原則0.5日以内、100行または2ファイル程度。

## 正本仕様

- `docs/assurance-smell-detector-spec.md`

## 開発方式

- テスト先行（TDD）
- Waveごとに受入確認
- CI変更・新規runtime依存・QEGによる判定・通常解析への自動組込みは行わない
- 既存終了コードとの競合を避け、検出器実行失敗には `ASSURANCE_FAILED: 11` を使用

## Task Seed Ledger

| Wave | Task Seed | 実装内容 | Status | Acceptance |
|---|---|---|---|---|
| 0 | `20260608-01` | 仕様書の終了コード修正、実装計画・Task Seed台帳作成 | done | `AC-20260608-01` |
| 1 | `20260608-02` | 10ルールのID・タグ・`review-required`語彙を型として固定 | done | `AC-20260608-02` |
| 1 | `20260608-03` | 安定ID、タグ、Evidence、unsupported claimを生成する純粋Finding factory | done | `AC-20260608-03` |
| 1 | `20260608-04` | 読み取り専用`AssuranceGraph`と入力正規化 | done | `AC-20260608-04` |
| 2 | `20260608-05` | `EVIDENCE_MISSING`ルール | done | `AC-20260608-05` |
| 2 | `20260608-06` | `RISK_WITHOUT_TEST`、`INVARIANT_UNMAPPED`ルール | done | `AC-20260608-06` |
| 2 | `20260608-07` | `REQUIREMENT_LINK_MISSING`、`INTENT_NOT_RECOVERABLE`ルール | done | `AC-20260608-07` |
| 2 | `20260608-08` | `RELEASE_DECISION_UNSUPPORTED`ルール | done | `AC-20260608-08` |
| 2 | `20260608-09` | 純粋な検出オーケストレーター、上限500件、決定的ソート | done | `AC-20260608-09` |
| 2 | `20260608-10` | CLI用artifact loader/writer、Schema検証 | done | `AC-20260608-10` |
| 2 | `20260608-11` | `assurance inspect`コマンドと終了コード | done | `AC-20260608-11` |
| 3 | `20260608-12` | `DiffAccess`契約とNode Git adapter、差分fixture | planned | `AC-20260608-12` |
| 3 | `20260608-13` | `GUARD_WEAKENED`、`VALIDATION_REMOVED`ルール | planned | `AC-20260608-13` |
| 3 | `20260608-14` | `ERROR_PATH_SUCCESS_FALLBACK`、`BUSINESS_RULE_LOCALIZED`ルール | planned | `AC-20260608-14` |
| 4 | `20260608-15` | QEG evidence-only連携 | planned | `AC-20260608-15` |
| 4 | `20260608-16` | 精度・性能受入、README・CHANGELOG・完了記録 | planned | `AC-20260608-16` |

## Key Interfaces

```
code-to-gate assurance inspect <repo> --from <artifact-dir> [--out <path>] [--base <ref>] [--head <ref>]
```

- 出力は既存`findings@v1`互換の`assurance-findings.json`
- 通常の`findings.json`、risk register、test seeds、invariants、readinessは変更しない
- 候補検出時も終了コードは`0`
- 不正引数は`2`、不正artifactは`7`、検出器実行失敗は`11`

## Architecture Layers

```
src/types/assurance-findings.ts              # 公開語彙（innermost、no imports）
src/application/assurance/
  assurance-detector.ts                      # orchestration
  assurance-graph.ts                         # artifact正規化
  artifact-rules.ts                          # 横断rule
  diff-rules.ts                              # semantic diff rule
  finding-factory.ts                         # Finding正規化
  coverage.ts                                # skip/coverage集計
src/adapters/
  git-diff-access.ts                         # base/head contentとhunk取得
src/cli/assurance.ts                         # composition root
```

## Dependency Rules

- application detectorはNode APIを直接importしない
- git操作は小さな`DiffAccess` contract越しに注入する
- ruleはread-only inputを受け、file writeやprocess exitを行わない
- CLIだけがartifact load/write、git adapter、exit codeを配線する
- 新しいruntime dependencyは追加しない

## Tests Strategy

各ルールについて最低3fixtureを用意する：

- Positive: 候補を検出する
- Refutation: 十分な反証・リンクがあり検出しない
- Insufficient input: 推測せず`unsupported_claims`へ記録する

追加受入条件：

- 全候補に`assurance-smell`、ルール固有タグ、`review-required`が付く
- 同一入力から安定したIDと順序を生成する
- `assurance inspect`前後で既存artifactのハッシュが変化しない
- `assurance-findings.json`が既存Schemaで検証可能
- QEG exportに`decision`が含まれない
- artifact-only解析は5秒以内
- 変更100ファイルのdiff解析は30秒以内

## Commands

各Wave完了時:

```powershell
npm run lint -- --max-warnings 0
npm run typecheck
npm run test:architecture
```

最終受入:

```powershell
npm test
npm run test:coverage
npm run test:package
npm run release:validate
node ./dist/cli.js assurance inspect . --from .qh-release --out .qh-release/assurance-findings.json
node ./dist/cli.js schema validate .qh-release/assurance-findings.json
```

## Output Contract

各Task Seed完了報告は次の形式に統一する：

- `plan`: 対象Task Seed、Intent、受入条件
- `patch`: 実装差分と境界への影響
- `tests`: 追加・更新したテストと結果
- `commands`: 実行コマンドと終了結果
- `notes`: 既知課題、unsupported claims、次Taskへの依存

## Assumptions

- Detectorは初期リリースでは明示実行のみとし、`analyze`や`release:validate`へ自動追加しない
- 新規artifact schemaは作成せず、既存`findings@v1`を利用する
- 既存diffコマンド全体のリファクタリングは行わない
- Assurance Findingはバグ断定ではなく、レビュー対象のassurance gapとして表現する
- Wave単位で受入完了後に次Waveへ進み、共有型・CLI登録箇所の並行編集は避ける

## 現在地

- Artifact-only MVP（Task 20260608-08〜11）: 完了
- 次の仕様書: `docs/specs/assurance-diff-semantic-spec.md`
- 次の実装順: Task 20260608-12 `DiffAccess` → Task 13 → Task 14

---

更新日: 2026-06-09
