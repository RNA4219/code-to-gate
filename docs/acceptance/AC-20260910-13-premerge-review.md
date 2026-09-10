# マージ前の最終レビュー（2026-09-10）

状態: 指摘の修正と最終ローカル検証は完了。

その後PRのCIで判明した統合上の問題と依存更新は [AC-20260910-14](AC-20260910-14-ci-integration.md) に記録する。

ユーザーの依頼により、追加の阻害事項を確認したうえでコミット・プッシュし、PRのCI成功後にマージする。
旧作業ブランチはPR #17でsquash merge済みだったため、変更前treeが最新mainと一致することを確認し、
`feat/review-severity-maintenance`を最新mainから作成して未コミット変更を引き継いだ。

## 最終レビューで修正した項目

- `scripts/precision-review.mjs`: `--force`でも元findings、集計入力review、batch入力を保護する。同一reviewへの意図したupdateは維持し、正規化pathとhardlinkの回帰で入力bytesの保持を確認する。
- `src/evaluation/precision-review-source.ts`: import artifactの`repo.root: "."`を明示`--repo`に結び付ける。bound commit検証と絶対root不一致の拒否を維持する。
- `src/cli/analyze.ts` / `src/cli/readiness.ts`: policyにvalidation errorがあれば、IDの有無にかかわらず`POLICY_FAILED`で終了する。修正前のversion/DSL action/DSL categoryの3回帰は期待値と異なる終了コードとなり、指摘を確認した。
- `src/config/policy-yaml-parser.ts` / `src/config/policy-loader.ts`: policy IDの引用・コロン、数値不正、正規categoryキーの解釈を修正する。
- `src/cli/diff-policy.ts`: `blocking.category.release-risk`を受理して内部評価へ反映し、既存`releaseRisk` aliasも維持する。true/falseの実評価を検証する。
- stage後の`git diff --cached --check`で見つかったrun ID helper/testの余分なEOF空行を除去した。

Windowsの既存ファイルへのrename失敗という候補は、当環境の既存roundtripが成功しており、再現しなかったため変更しない。

## 検証と統合

前段の全体3,786 testsと検証結果は [AC-20260910-12](AC-20260910-12-follow-up.md) に保持する。
この最終修正後の結果:

- `npm run build` / `npm run lint` / `npm run typecheck`: exit 0。
- `npm run test:maintenance`: 14 passed、skippedなし。入力保護とWindows/Bash wrapperのroundtripを含む。
- `npm run test:coverage`: 113 files / 1,857 passed + 既存4 skipped。160.81秒、exit 0。Statements 88.82%、Branches 80.62%、Functions 94.69%、Lines 89.80%で既存4指標80%閾値を維持した。
- `npm run test:package`: fresh build、615 filesのpack/隔離install、既存CLI/SDK/agent再利用と追加review/diff policyの検証に成功。tgzと一時directoryはcleanup済み。
- 対象回帰の結果も各workerと親が確認した。最終のcoverage実行にはCLIのversion型・YAML構文・DSL・件数閾値・confidence不正の終了判定、相対rootのコード表示、policy root scalarの解釈、release-riskのtrue/false評価を含む。
- ログは `C:/Users/ryo-n/Codex_dev/code-to-gate-work-20260910-next/premerge-*.log` に保存した。

最終文書を含むBirdseye生成/check（113 nodes）、文書参照、distributionが成功し、roadmap driftは候補0件だった。
stage後の差分検査をコミット直前に確認する。
GitHub hosted CIの結果とマージcommitはPRで追跡し、ローカル検証で代替しない。
パッケージ公開やGitHub Releaseはこの統合の対象外。
