---
intent_id: INT-001
owner: code-to-gate-team
status: active
last_reviewed_at: 2026-05-31
next_review_due: 2026-06-30
---

# Checklists

code-to-gate運用時のチェックリスト集。

## Development

- `docs/tasks/` に Task Seed を起票・更新し、[docs/TASKS.md](docs/TASKS.md) の運用ルールに沿ってスコープとフォローアップを同期
- 着手前に [CLAUDE.md](CLAUDE.md) と [`GUARDRAILS.md`](GUARDRAILS.md) を読み合わせ、最小差分と既存ガードレールへ整合
- テストを先行させ、TDD フロー（vitest）を完了
- 単体テストと結合テストの対象を分けて記載し、coverage 80% を目標ではなく必須ゲートとして扱う
- 例外や設定変更は [docs/security/Security_Review_Checklist.md](docs/security/Security_Review_Checklist.md) の該当フェーズで可否を確認
- 検収が必要な作業は `docs/acceptance/AC-YYYYMMDD-xx.md` を作成し、判定・証跡・残課題を記録

## Quality Evidence OS Expansion

- [docs/quality-evidence-os-requirements.md](docs/quality-evidence-os-requirements.md) の要求IDを実装・テスト・docsに紐付ける
- [docs/quality-evidence-os-spec.md](docs/quality-evidence-os-spec.md) のI/O契約とschema互換性を確認する
- [orchestration/quality-evidence-os-implementation.md](orchestration/quality-evidence-os-implementation.md) の Task Seed 単位で差分を小さく進める
- P0は Baseline/Ratchet Gate、LLM Trust Boundary 接続、`ctg doctor` 仕様化を優先する
- P1以降の追加案は [docs/quality-evidence-os-expansion-ideas.md](docs/quality-evidence-os-expansion-ideas.md) に追記し、要件化する前に受入条件を確認する
- 新規 artifact field は optional を基本とし、`ctg/v1` consumer を壊さない
- baseline/ratchet では既存負債を可視化しつつ、新規・悪化分だけを gate 対象にする

## Pull Request / Review

### 2026-09-10 改修の検収

- 精度reviewは入力bytes・repo・commit・finding IDとevidenceを照合し、AI/未判定を人手精度合格にしない
- severity override未設定時の互換性、first-matchの優先順、元severityと変更理由、analyze/readiness/baselineの一致を検証する
- `node scripts/birdseye.mjs generate` 後に `node scripts/birdseye.mjs check` を実行し、sourceとcapsuleの鮮度を確認する
- `npm run build`、`npm run lint`、`npm test`、`npm run test:coverage`、package smokeを実行し、80%閾値を維持する
- package 1.6.0候補と公開v1.5.1を区別し、検収結果と公開承認を別に記録する
- CIのmaintenance・台帳・文書・Birdseye checkが既存必須jobで失敗を伝播することを確認する
- 文書のみ・指摘0件の正常なdiffがcompleteとなり、走査上限や読み取り失敗によるpartialと重大findingは厳格policyで引き続きブロックされることを確認する
- readinessは不正入力をexit 7で拒否し、公開版の正常artifact、重大指摘、baseline/severity調整の動作を維持することを確認する
- 不完全入力は指摘0件でも条件ID・summary・再解析の推奨操作を持ち、partial許可時もpassed_with_riskとして理由を表示することを確認する
- partialの1行・複数行YAMLは同じ判定となり、不正な型・範囲はexit 5、省略・空mapは既定値を維持することを確認する
- 固定base/headのdiffはcheckout・未コミット編集によらず同じfinding/evidence・影響範囲となり、元の作業ツリーを変更しないことを確認する
- 未参照ソースの削除だけのdiffはcompleteとなり、残存importerの影響範囲と未対応ソース混在時のpartial判定を維持することを確認する
- 独立run IDの同時計時衝突防止とagentの冪等再利用を別々に検証する
- diffの任意policy設定でraw/effective・終了判定・出力が一致することを確認する
- 精度レビュー画面のJSON保存・再開・入力照合・AI/人手区別を実ブラウザで確認する
- severity調整の元値・適用値・理由をMarkdown/Viewerでも確認し、表示文字をescapeする

- 失敗させたテストが緑化する最小コミット単位を維持し、差分を可視化
- PR / 検収記録から unit / integration / coverage の結果が追跡できるようにする
- `CHANGELOG.md` の `[Unreleased](CHANGELOG.md#unreleased)` に Task Seed 番号付きで成果を追記
- PR 説明欄から [docs/TASKS.md](docs/TASKS.md)・[CLAUDE.md](CLAUDE.md) 等の参照先へ遷移できるようリンクを付す
- PR 本文の `Acceptance Record` から `docs/acceptance/AC-*.md` へ遷移できるようにする
- レビュー観点は [docs/security/Security_Review_Checklist.md](docs/security/Security_Review_Checklist.md) と [`GUARDRAILS.md`](GUARDRAILS.md) を再確認

## Ops / Incident

- インシデント初動は [CLAUDE.md](CLAUDE.md) の該当コマンドを実行し、必要な通知経路を確保
- セキュリティ対応は [docs/security/Security_Review_Checklist.md](docs/security/Security_Review_Checklist.md) のインシデント項目を完了
- 復旧後の再発防止策を `docs/tasks/` に起票

## Daily

- 入力到着の確認
- 失敗通知の有無
- `npm run lint` が通ること
- `npm run build` が通ること
- `npm run test:smoke` が通ること
- `node ./dist/cli.js llm-health --all` で LLM provider status が正常
- Birdseye freshness check（`node scripts/birdseye.mjs check` でsource hashと閉じた参照を検証）

## Release

- 実装・レビューの完了条件は「Development」「Pull Request / Review」を満たしていることを前提に進行
- [docs/Release_Checklist.md](docs/Release_Checklist.md) を参照して全体手順を確認
- `.github/workflows/code-to-gate-pr.yml` の全ジョブが成功していること
- coverage 80% 以上（`npm run test:coverage` が通る）
- 変更点の要約
- リリースノート（`CHANGELOG.md`）へ必要最小の項目を追記
- 未反映の Task Seed が残っていないか確認
- Schema version `ctg/v1` の整合性確認（`node ./dist/cli.js schema validate-all .qh`）
- 新規 ADR を含むリリースでは [docs/ADR/README.md](docs/ADR/README.md) の索引更新
- 受け入れ基準に対するエビデンス（`docs/acceptance/AC-*.md`）
- PR に `type:*` および `semver:*` ラベルを付与済み
- Security Review Checklist に沿って準備→実装→レビューの各フェーズを完了
- `npm run release:validate` が通ること（build + smoke + pack dry-run）
- `npm run test:package` がfresh build→pack→隔離install→CLI/rule-sdk smokeまで通ること
- `plugin-sandbox run` がsandbox未指定/不正値をexit 2で拒否し、Docker実行がshell-free argvであること
- Evidence bundleのtraversal/absolute/UNC/重複正規化entryが書き込み前に拒否されること
- 配布物へ `LICENSE` を同梱済み
- Release Approval Record（`docs/releases/RA-YYYYMMDD-XX.md`）を作成済み
- ロールバック準備完了（前回安定版確認、戻し先Gitタグ特定）

## Hygiene

- 命名・ディレクトリ整備
- ドキュメント差分反映
- `npm run lint` が通ること
- `npm run lint:fix` で修正可能なエラーを解消
- `npx tsc --noEmit` が通ること
- `npm run test:coverage` が通ること（coverage 80%）
- CI / Governance を変更した場合は `.github/workflows/`、`.github/ctg-policy.yaml`、`governance/policy.yaml` の同期を確認
- Birdseye を更新した場合は `docs/birdseye/index.json` / `caps/*` の差分と生成IDを確認し、`node scripts/birdseye.mjs check` を通す
- 旧呼称の混入チェック（例: `grep "<旧ブランド名>"` で現行ブランド以外の名称が残存していないか確認）

---

## Quick Reference

| Check | Command |
|-------|---------|
| Lint | `npm run lint` |
| Build | `npm run build` |
| Type check | `npx tsc --noEmit` |
| Smoke tests | `npm run test:smoke` |
| Full tests | `npm test` |
| Coverage | `npm run test:coverage` |
| Release validate | `npm run release:validate` |
| Schema validate | `node ./dist/cli.js schema validate-all .qh` |
| LLM health | `node ./dist/cli.js llm-health --all` |
