---
task_id: 20260911-02
intent_id: READINESS-DIFF-FOLLOWUPS-20260911-02
owner: code-to-gate-team
status: done
last_reviewed_at: 2026-09-11
next_review_due: 2026-10-11
---

# 補助文書とreadiness・diffの追加修正

## 目的

補助文書を現在の仕様へ揃え、入力不備や作業ツリーの状態により品質判定が変わる問題を解消する。調査対象はmain `80977c4`。

## 実施順と所有

ユーザー指定により次の順に実装・検証する。Lunaが担当範囲を限定して修正し、親がレビュー、文書・検収同期、統合検証、Git操作を行う。

1. 補助文書: troubleshootingのpolicy例、配布状況、設定確認の案内。
2. P1: readinessの入力artifact検証。
3. P1: diffのgraph・本文を指定したheadへ統一。
4. P2: 削除差分を入力欠落と区別。
5. P2: 入力不完全時の条件ID・summary・推奨操作の説明。

各段階は関連する2ファイル以下を基本に分割する。必要なテストfixtureの契約同期は別段階で扱う。公開schema、CI定義、判定閾値、既存公開tag/assetは変更しない。

## 受入条件

- 文書のpolicy例が現行loaderに読み取られ、個別の調整と理由を保持する。
- 必須情報の欠落・不正値を入力エラーとして扱い、妥当なanalyze/diff成果物を受け入れる。
- 同じbase/head commitに対するdiff結果がcheckoutや未コミット編集に依存しない。
- 未参照ソースの削除だけでpartialにならず、実際の未処理ソースや読み取り失敗はブロックする。
- 入力不完全のブロック理由と次の操作が、条件・summary・推奨操作で一致する。
- 対象回帰、全体テスト、build/lint/typecheck、coverage、package smoke、文書/Birdseye検査を通過する。

## 証跡

[検収記録](../acceptance/AC-20260911-02-readiness-diff-followups.md)で段階ごとの結果を追跡する。

5段階の実装とローカル必須検証を完了した。追加で判明したpartial設定の1行YAML制約は検収記録へ分けて記載した。PRのCIとマージ結果はGitHub側で追跡する。
