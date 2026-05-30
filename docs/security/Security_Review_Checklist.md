# Security Review Checklist

本チェックリストは、`code-to-gate` を利用するプロダクトでリリース前セキュリティ審査を行う際の最小セットです。各フェーズで該当項目を完了させ、証跡を残してください。

## 準備フェーズ

- [ ] アクセス制御ポリシーの適用範囲と権限モデルを整理する
  - 完了条件: 対象システムのユーザ／サービスアカウントごとに必要最小権限を定義し、レビュー用ドキュメントへ反映している
  - 参照: [GUARDRAILS 行動指針](../../GUARDRAILS.md#実装原則)
- [ ] 依存コンポーネントの脆弱性監査計画を確定する
  - 完了条件: `npm audit` と実行タイミングを決定し、CI/ローカルの運用手順へ組み込んでいる
  - 参照: [Dependency Governance](./Dependency_Governance.md)
- [ ] GitHub Security 設定の恒常運用を確認する
  - 完了条件:
    vulnerability alerts、Dependabot security updates、secret scanning、
    push protection が有効であり、CI workflow が通る
  - 参照: [CHECKLISTS Daily](../../CHECKLISTS.md#daily)
- [ ] データ保護要件（PII/秘密情報）の分類と保護方針を合意する
  - 完了条件: 取り扱うデータ分類と保護メカニズム（暗号化、マスキング、保管場所）を記述し、レビュー参加者に共有済み
  - 参照: [GUARDRAILS 例外処理](../../GUARDRAILS.md#例外処理)

## 実装フェーズ

- [ ] アクセス制御・認可実装のコードレビュー結果を記録する
  - 完了条件:権限チェックが主要エントリーポイントに実装され、レビューコメントで承認済み（証跡 URL を残す）
  - 参照: [GUARDRAILS 型安全](../../GUARDRAILS.md#実装原則)
- [ ] 依存監査ツールの実行ログを保存する
  - 完了条件: `npm audit` で重大脆弱性が検出されない or 対応計画が記載されたレポートをリポジトリに保管
  - 参照: [Dependency Governance](./Dependency_Governance.md)
- [ ] データ保護メカニズムを実装し検証する
  - 完了条件: 保存時暗号化・マスキング・転送経路保護などの実装をテストで確認し、テスト結果を記録
  - 参照: [CHECKLISTS Development](../../CHECKLISTS.md#development)
- [ ] Guardrails の遵守状況を確認する
  - 完了条件: [`GUARDRAILS.md`](../../GUARDRAILS.md) に定義された型安全・スコープ上限・禁止パスの要件について、影響コンポーネントのコード／設定が準拠していることを証跡化
  - 参照: [GUARDRAILS 実装原則](../../GUARDRAILS.md#実装原則)

## レビューフェーズ

- [ ] セキュリティ審査会議でリリース判定を記録する
  - 完了条件: 審査会議の議事録に各準備・実装項目のステータスとリスク評価を記入し、承認者がサインオフしている
  - 参照: [CHECKLISTS Release](../../CHECKLISTS.md#release)
- [ ] セキュリティゲート（SAST/Secrets/依存）結果を確認する
  - 完了条件: `npm run lint`、`npm audit`、code-to-gate analyze が成功し、例外が必要な場合はリスク受容文書を添付して承認済み
  - 参照: [CHECKLISTS Hygiene](../../CHECKLISTS.md#hygiene)
- [ ] release 記録と security posture の整合を確認する
  - 完了条件: `npm run release:validate` が通り、release note / tag / docs / security setting の整合が取れている
  - 参照: [CHECKLISTS Release](../../CHECKLISTS.md#release)
- [ ] リリース後の監査・運用計画を更新する
  - 完了条件: インシデント対応手順・監査ログ保管・定期見直しサイクルを CHECKLISTS Ops へ反映し、次回レビュー期限を設定
  - 参照: [CHECKLISTS Ops / Incident](../../CHECKLISTS.md#ops--incident)

各項目の証跡は、PR テンプレートやリリースノートにリンクし、後続レビューで追跡できるようにしてください。

## インシデント対応

- [ ] インシデント初動対応を記録する
  - 完了条件: インシデント発見時刻、影響範囲、初動措置を `docs/acceptance/INCIDENT-*.md` に記録
- [ ] 根因分析と再発防止策を文書化する
  - 完了条件: 根因、修正内容、再発防止策を `docs/tasks/` に起票
- [ ] セキュリティパッチ適用を追跡する
  - 完了条件: `npm audit fix` 実行結果、依存更新履歴を CHANGELOG に記録