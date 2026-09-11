---
intent_id: INT-MANUAL-BB-FIXES
owner: code-to-gate-team
status: active
last_reviewed_at: 2026-09-11
next_review_due: 2026-10-11
---

# manual-bb失敗修正の検収

[Task Seed](../tasks/20260911-05-manual-bb-fixes.md)のローカル検収を完了した。**同じ105ケースを再実行し、105成功・失敗0・保留0。manual-bb native standard GateはGo。** PRのCI・main反映は対応PRで追跡する。変更はUnreleased、公開versionは1.6.0のままとする。

## 修正と仕様

修正前はmain `2fe6b2e0ec7a8d255cd5f29f6454580eb9664fdb`で95成功・9失敗・1保留。既知5件と新規5件（表示不整合を含む）の不具合を確認していた。

- baseline: 明示されたfindings参照を優先し、参照先がない場合は別の隣接ファイルへ置換しない。参照を持たない旧形式は互換を維持。
- suppression: YAMLの引用・コメント・flow形式を統一。不正構文の部分採用を廃止し、不正期限と実在しない日付は適用しない。
- policy: 空ID・version、不正な数値の型・値域・整数条件を検証。filter_low=falseの閾値未満findingも通常評価へ渡す。
- readiness: 同時刻の独立実行IDを分離。warn_onlyは品質判定の終了コードだけを0にし、blocked status・条件・入力エラーを維持。
- CLI/Viewer: 不正emitの拒否、SARIF生成、公開コマンドの共通help、artifact由来のversion表示を修正。
- [Readiness入力仕様](../specs/readiness-input-contract.md): partial_warning_thresholdはv1では予約値。欠落割合の分子・母数がないため推定せず、completenessとallow_partialで判定する。PART-004で12組合せを検証。renameのv1表現とREADMEのimport→analyze→exportも同期。

元の10件に加え、関連するfilter_low=falseの不一致1件を解消した。既存POL-017へ対照を追加したため、ケース数は105を維持した。

## 公開経路の再検収

| 対象 | 成功/全数 |
|---|---:|
| 基本CLI・Viewer（実ブラウザを含む） | 32/32 |
| 既知不具合の再現・対照 | 5/5 |
| policy・抑制・baseline・partial・artifact | 41/41 |
| diff・import・export・agent連携 | 27/27 |

条件IDだけでなく終了コードとstatusを検証する。未対応拡張子のdiffではcompleteness=partialとauditのブロック理由を照合した。PART-004はcomplete/partial × allow_partial=false/true × threshold=0/0.2/1を実行した。

Chromeで初期表示とヘッダー・フッターのv1.6.0を確認し、実ブラウザの検索0件/1件、finding詳細、Graph、Test Seedsを操作した。スクリーンショットも保存・目視確認した。localhost補助サーバーのfavicon 404以外にconsole errorはなかった。

## 自動検証とGate

- build・lint・typecheck: 成功。
- 通常テスト: 3,859成功、既存skip 4。Tree-sitter: 63成功。保守: 15成功。
- 通常coverage: 1,970成功、既存skip 4。Statements 88.74%、Branches 80.60%、Functions 94.86%、Lines 89.66%。4項目とも80%条件を満たした。
- 変更行coverage: 185/205行、90.24%。変更されたruntimeの実行行をIstanbul statement startsと差分で照合した。コメント・削除行は除外し、通常coverageの全体率を転用していない。追加対象1,049成功、skip 1。
- package smoke: fresh buildしたtgzを隔離先へインストールし、CLI・SDK・agent・analyze・Viewer・precision-review・diffを検証して成功。初回の依存取得待ちを停止し、ネットワーク許可下で再実行した。
- native standard Gate: Go。P0 15/15、P1 27/27、必須観点100%。未解決不具合0、waiverなし。runtime schemaによる114 artifactの検証エラー0。
- 文書参照・配布状態・roadmap drift・Birdseye再生成/check・git diff --checkを確認。

## 証跡と適用範囲

証跡は同一workspaceの`code-to-gate-manual-bb-fix-20260911/`に保存。`report.md`、`cases.md`、`defects.json`、`artifacts/`、`environment.json`、`changed-line-coverage.json`、各実行のargv/cwd/stdout/stderrと成果物を含む。修正前の`code-to-gate-manual-bb-20260911/`は上書きしていない。

Build ID: `ctg-bb-f902a0135a79ee77117a`。ソースSHA256は外部`environment.json`に固定し、再検収・変更行coverage・package検証後もソースとcompiled CLIの不変を照合した。Node v24.11.0 / Windowsで実行。

これはagentによる公開CLI・ブラウザの検収で、人間によるUX承認とは区別する。対象はWindowsローカル・非LLMの主要フローであり、全OS・全言語の検出精度を保証するものではない。
