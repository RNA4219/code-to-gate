---
task_id: 20260911-05
intent_id: INT-MANUAL-BB-FIXES
owner: code-to-gate-team
status: done
last_reviewed_at: 2026-09-11
next_review_due: 2026-10-11
---

# manual-bbの失敗修正と未確定仕様の確定

## 背景・ゴール

main 2fe6b2eの公開CLI・ブラウザ検収は105ケース中95成功、9失敗、1保留。既知5件と新規5件（表示不整合を含む）を検出した。利用者の「未確定は仕様書を書き、失敗を直す」という指示に基づき、修正と同じケースによる再検収を完了する。

## スコープと分割

通常の小さな変更単位を守るため、以下の独立した修正単位へ分割し、rootが統合する。各単位は回帰テストから着手する。src/core、src/rules、governance、schemas、workflowは変更対象に含めない。

1. BUG-01: src/historical/ratchet-gate.ts と対応テストで明示baseline参照を優先。
2. BUG-02/03: src/suppression のYAML・期限処理と対応テストを順に修正。
3. BUG-04: src/config/policy-yaml-parser.ts / policy-loader.ts の明示入力検証と対応テスト。
4. BUG-05/06: src/cli/readiness.ts と対応テストで独立ID・warn_only終了コードを修正。
5. BUG-07/08: src/cli.ts / src/cli/analyze.ts のemit検証・SARIF生成と対応テスト。
6. BUG-09/10: src/cli.ts のglobal help、src/viewerのversion表示と対応テスト。
7. PART-004: v1の入力が持たない欠落割合をfinding件数から作らない。partial_warning_thresholdは型・値域だけを検証する予約設定、完全性とallow_partialによる判定は常時有効、と仕様書で確定する。閾値の変化で判定が変わらないことを公開CLIで検収する。
8. READMEのimport→同一outでanalyze --from-imports→exportを同期。renameのv1公開表現も仕様へ明記。

## TDD / 検証

既存の失敗証跡を保存したまま、各修正の回帰テスト、build/lint/typecheck、全テスト、coverage、package smokeを実行する。manual-bbの105ケースを新しい証跡directoryへ再実行し、PART-004も確定した仕様をoracleにして実行する。変更行coverageを全体coverageと区別し、native standard Gateを再評価する。

## 完了条件

- 10件の不具合が同じ入力条件と正常対照で解消。
- PART-004の仕様・oracle・実行結果が一致。
- 既存公開artifactのschema互換性、agentの冪等性を維持。
- Birdseye生成/check、適切な自動検証、BB検収結果を検収文書に記録。

## 検収記録

[検収記録](../acceptance/AC-20260911-05-manual-bb-fixes.md): 105/105成功、失敗0、保留0、native standard GateはGo。変更行coverageは185/205行（90.24%）。元の10不具合に加え、filter_low=falseの関連不一致も対照テストで修正した。

全体3,859件、Tree-sitter 63件、保守15件、coverage対象1,970件、追加coverage対象1,049件が成功。既存skipは通常/coverage 4件、追加coverage 1件。build/lint/typecheck、package smoke、文書参照・配布状態・roadmap・Birdseyeを検証した。PRのCIとmainへの反映は対応PRで追跡する。

旧証跡: ../code-to-gate-manual-bb-20260911/report.md。修正後証跡: ../code-to-gate-manual-bb-fix-20260911/report.md（いずれもrepo外の同一workspace）。
