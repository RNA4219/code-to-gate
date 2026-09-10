# PR #20 のCI統合修正（2026-09-10）

状態: CIで判明した阻害事項を修正。更新commitはGitHub CI成功後にマージする。

[PR #20](https://github.com/RNA4219/code-to-gate/pull/20) の初回CIでは、coverage、package smoke、lint/typecheck、契約検証、3 OSの決定性検証が成功した一方、analyzeと依存監査が失敗した。

## 修正内容

- CIのdiffへreadiness専用設定も含むpolicyを渡していたため、厳密な入力検証で停止した。`.github/ctg-diff-policy.yaml`へ対応項目を分離し、最終readinessは従来のpolicyを引き続き使用する。回帰テストでblocking、confidence、partialの解釈とworkflowの接続を照合する。
- PATH入力判定が`requestedStem`内の`req`へ反応していた。入力識別子の単語境界を確認し、本来のrequest入力の検出を維持する。新規suppressionやゲート閾値の変更は行っていない。
- Birdseyeの参照先について実pathが指定root内に収まることを確認する。root外へのsource/test directoryリンクを対象から外し、root自身とroot内のリンクの利用を維持する。
- js-yamlを4.3.2、Vitestとcoverage-v8を4.1.11へ更新した。依存監査のhigh 1件・moderate 3件を解消し、更新後は全重大度で0件となった。
- 更新後CIでは、UTF-8コード取得のファイルbytes上限テストがLinuxだけで失敗した。subprocessの`maxBuffer`指定に加え、取得成功後の実bytes数も検査して上限超過を拒否する。

## 検証

依存更新・policy・Birdseye修正後（`f05f3f5`）の検証結果:

- build、lint、typecheck: exit 0。
- CI policyとPATH判定の対象回帰: 2 files / 55 passed。
- `npm test`: 通常系194 files / 3,736 passed + 既存4 skipped、Tree-sitter系6 files / 63 passed、maintenance 15 passed。合計3,814 passed、exit 0。
- `npm ls --all --json`: exit 0、更新後の依存ツリーに整合性エラーなし。
- `npm audit --audit-level=high --json`: exit 0、脆弱性0件。
- CIと同じdiffから従来policyでreadinessを評価し、`passed`、failed conditions 0件を確認した。diff単体の既存検出を含む終了コードと、suppression適用後の最終判定は区別する。
- `npm run test:coverage`: 113 files / 1,859 passed + 既存4 skipped、140.68秒、exit 0。Statements 88.82%、Branches 80.66%、Functions 94.69%、Lines 89.80%で4指標80%基準を維持した。
- `npm run test:package`: fresh build、615 filesのpackと隔離install、CLI/SDK/agent再利用、precision-review、diff policyの検証に成功。一時ファイルのcleanupも完了した。
- spec-driftとschema検証: exit 0。QEOSは12/12 done、needsEvidence 0件でschema検証も成功した。

後続のUTF-8上限修正はsource対象6 tests、build、lint、typecheckに成功した。
成功したGit取得結果についても、上限ちょうどは表示可能、1 byte超過は本文なしで拒否する境界を検証した。
更新commitのcoverageはローカルとCIで再確認し、結果をPRで追跡する。

文書確定後、Birdseye生成/check、文書参照、distribution、厳密なroadmap drift、stage済み差分の検査をコミット前に実施する。

ログは `C:/Users/ryo-n/Codex_dev/code-to-gate-work-20260910-next/ci-*.log` と `ci-audit.json` に保存する。
初回失敗の証跡は [PR Analysis](https://github.com/RNA4219/code-to-gate/actions/runs/34426143693)、[Security](https://github.com/RNA4219/code-to-gate/actions/runs/34426143691) に保持する。
`f05f3f5`の [PR Analysis](https://github.com/RNA4219/code-to-gate/actions/runs/34428341886) ではanalyzeとQEGを含む各検証が成功し、coverage内のUTF-8上限テスト1件だけが失敗した。[Security](https://github.com/RNA4219/code-to-gate/actions/runs/34428341876) は成功した。
更新commitの全CI成功を確認してからマージし、その結果はPRで追跡する。
