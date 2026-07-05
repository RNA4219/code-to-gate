---
intent_id: DOC-IMPROVEMENT-CHECKLIST-200-001
owner: code-to-gate
status: draft
created_at: 2026-07-04
source_docs:
  - RUNBOOK.md
  - docs/product-requirements-v1.md
  - docs/product-spec-v1.md
  - docs/product-acceptance-v1.md
  - docs/product-gap-analysis.md
  - docs/product-maturity-issues.md
  - docs/rule-precision-backlog.md
  - docs/distribution-status.md
  - docs/specs/SPEC-MASTER.md
---

# code-to-gate 改善チェックリスト 200

要件定義、仕様書、受入仕様、RUNBOOK、成熟度課題、精度バックログを突き合わせた改善棚卸し。
`product-gap-analysis.md` には完了済み項目が多いが、本チェックリストでは「本当に再現可能な証跡があるか」「外向き表現と実態が一致するか」「仕様・CLI・文書が矛盾していないか」を改めて確認する。

凡例:
- `[ ]` 未着手または未確認
- `[x]` 証跡確認済み
- `P0` 公開・信頼性・安全性の blocker
- `P1` product candidate として先に潰すべき改善
- `P2` beta 品質を上げる改善
- `P3` v1.0 以降の拡張

## A. 公開表現・プロダクト位置づけ

- [x] CTG-001 P0 `README.md` の「SAST 代替ではない」表現と `docs/public-readiness.md` の security/enterprise 表現を揃える。
- [x] CTG-002 P0 `README_JA.md` にも review-required candidate であることを明記する。
- [x] CTG-003 P0 public-facing docs で confirmed vulnerability と誤読される表現を削る。
- [x] CTG-004 P0 `critical` / `high` を「確定事故」ではなく gate severity として説明する。
- [x] CTG-005 P0 human-facing report では「要確認」「影響仮説」「根拠」「確度」を分けて表示する。
- [x] CTG-006 P0 machine profile と human profile の report 方針を仕様に追加する。
- [x] CTG-007 P0 `docs/public-brief.md` の product claim を maturity issue の guardrail に合わせる。
- [x] CTG-008 P0 `docs/public-readiness.md` の enterprise-ready 風表現を product candidate 表現へ弱める。
- [x] CTG-009 P0 `docs/product-narrative.md` に standalone mode と QA chain mode の違いを追加する。
- [x] CTG-010 P1 `docs/product-maturity-issues.md` の推奨外向き表現を README に反映する。
- [x] CTG-011 P1 security finding は security-relevant code pattern であると全 docs で統一する。
- [x] CTG-012 P1 release-readiness は human gate の補助であり無人承認ではないと明記する。
- [x] CTG-013 P1 QA evidence layer と SAST/linter/test の補完関係を図示する。
- [x] CTG-014 P1 false positive が仕様上あり得る前提を onboarding に含める。
- [x] CTG-015 P1 acceptance docs に「fixture 精度」と「real repo 精度」を混同しない注意書きを追加する。
- [x] CTG-016 P1 public docs にサポート境界を追加する。
- [x] CTG-017 P1 experimental / preview artifact の表記ルールを作る。
- [x] CTG-018 P1 database analysis を stable surface と誤読しないよう README で preview 表記する。
- [x] CTG-019 P2 OSS adoption metrics を product quality gate と切り離して扱う。
- [x] CTG-020 P2 marketing/adoption 目標と engineering acceptance を別表に分ける。

## B. 配布・リリース状態

- [x] CTG-021 P0 `package.json` version 1.5.0 と GitHub Release v1.4.2 の差分を解消する。`docs/distribution-status.md` で 1.5.0 は local prepared、GitHub Release は v1.4.2 published と明記済み。
- [x] CTG-022 P0 npm 未公開状態を README の install セクションに明確に反映する。
- [x] CTG-023 P0 npm publish する場合は `npm whoami` / `npm publish` / `npm view` の証跡を残す。publish 未実行を明記し、必要証跡を `docs/distribution-status.md` に固定済み。
- [x] CTG-024 P0 GitHub release v1.5.0 を作るか、1.5.0 表記を local prepared に限定する。
- [x] CTG-025 P0 CHANGELOG と GitHub release notes の対応を検証する。`CHANGELOG.md` を pending v1.5.0 release notes source として `docs/distribution-status.md` に記録済み。
- [x] CTG-026 P0 `docs/distribution-status.md` の next review due を過ぎたら更新する。`next_review_due: 2026-07-17` で未到来、`npm run docs:stale` で warn-only確認済み。
- [x] CTG-027 P1 package name を `@quality-harness/code-to-gate` に統一し、古い `@code-to-gate/cli` 表記を洗い出す。
- [x] CTG-028 P1 acceptance docs の install command を現行配布状態へ更新する。
- [x] CTG-029 P1 Quickstart の install route を GitHub install / source install / future npm に分ける。
- [x] CTG-030 P1 release procedure に local package version と published version の差分チェックを追加する。
- [x] CTG-031 P1 `npm view` E404 を known blocker として release checklist に入れる。
- [x] CTG-032 P1 package tarball の contents audit を release gate に追加する。
- [x] CTG-033 P1 dist build が package に含まれることを検証する。
- [x] CTG-034 P1 global install 後に `code-to-gate --version` が期待値を返すことを確認する。`npm run test:package` で packed install 後 `--version: 1.5.0` を確認済み。
- [x] CTG-035 P1 Windows PowerShell での install / run 手順を検証する。Windows 環境で `npm run test:package` と package smoke install/analyze/diff が通過済み。
- [x] CTG-036 P1 macOS/Linux での install / run 手順を CI または手動証跡で補完する。PR/release workflow の Linux/macOS compatibility job と reusable workflow を証跡入口として追加済み。
- [x] CTG-037 P2 Docker image 配布の要否を要件と現状で整理する。
- [x] CTG-038 P2 prebuilt binary 要件が未実装なら docs で future scope に移す。
- [x] CTG-039 P2 release evidence bundle に package integrity hash を含める。`npm run package:integrity` と release workflow artifact `.qh/package/package-integrity.json` を追加済み。
- [x] CTG-040 P2 version badge と distribution-status の不一致を自動チェックする。`npm run docs:distribution` / `scripts/check-distribution-status.mjs` が通過済み。

## C. 要件・仕様・受入文書の整合

- [x] CTG-041 P0 `readiness --from` が仕様上 optional なのか RUNBOOK 上必須なのかを統一する。
- [x] CTG-042 P0 `analyze` が `release-readiness.json` を生成する条件を仕様と実装で一致させる。
- [x] CTG-043 P0 `invariants.yaml` と `invariants.json` の表記揺れを修正する。
- [x] CTG-044 P0 schema version `ctg/v1` と `ctg/v1alpha1` の使い分けを全 docs で統一する。
- [x] CTG-045 P0 downstream adapter schema の v1alpha1 表記と現行 v1 schema 対応を突き合わせる。
- [x] CTG-046 P0 acceptance docs のコマンドが現在の CLI option と一致するか検証する。
- [x] CTG-047 P1 `--languages` / `--lang`、`--exclude` / `--ignore` の表記揺れを解消する。
- [x] CTG-048 P1 `--llm-mode` と `--llm-provider` の責務を CLI reference で明確化する。
- [x] CTG-049 P1 `fixture run` コマンドが現行 CLI に存在するか検証し、なければ docs を修正する。
- [x] CTG-050 P1 `export pr-comment` / `export checks` が現行 CLI に存在するか検証する。
- [x] CTG-051 P1 product requirements の Phase 1-3 完了宣言と maturity issue の beta 判断を整合させる。
- [x] CTG-052 P1 `product-gap-analysis.md` の完了表を証跡 index へリンクする。
- [x] CTG-053 P1 `product-spec-v1.md` の Next Actions で DONE/Remaining が矛盾している箇所を修正する。
- [x] CTG-054 P1 acceptance scripts の疑似 `EXPECT_*` を実行可能な harness に落とす。`npm run acceptance:harness` 通過済み。
- [x] CTG-055 P1 config guide 要件があるのに docs に存在しない場合は追加する。`docs/config-guide.md` を追加済み。
- [x] CTG-056 P1 plugin guide / plugin-development / plugin-examples の責務を整理する。
- [x] CTG-057 P1 docs 内の package 名、policy path、schema path を一括 lint する。`npm run docs:lint-refs` 通過済み。
- [x] CTG-058 P2 spec master の draft status と完了済み実装の対応を更新する。
- [x] CTG-059 P2 SPEC-01 から SPEC-28 の status を実装状況で再判定する。
- [x] CTG-060 P2 SPEC-29 done の acceptance artifact を SPEC-MASTER から参照する。

## D. Real repo validation / precision evidence

- [x] CTG-061 P0 fixture record と real repo validation record を文書上分離する。
- [x] CTG-062 P0 3+ public repo を commit hash 固定で再実行する。axios/express/dayjs/react の4 repoでPASS。
- [x] CTG-063 P0 real repo ごとに repo size、language、framework、commit、policy を記録する。
- [x] CTG-064 P0 findings を TP / FP / Uncertain / Accepted design に分類する。2026-07-04 run は全件 Uncertain として記録し、precision claimを禁止。
- [x] CTG-065 P0 rule 別 FP rate を算出する。human-reviewed denominatorなしのため not reportable と明記。
- [x] CTG-066 P0 uncertain rate を FP rate と別に出す。1721/1721 = 100% uncertain と記録。
- [x] CTG-067 P0 3+ repo の artifacts を `.qh/acceptance-evidence/` または docs evidence 配下へ保存する。`.qh/acceptance/real-repo/` と evidence doc に保存。
- [x] CTG-068 P0 human reviewer、判定日、判定基準を記録する。
- [x] CTG-069 P0 controlled fixture precision と real repo precision を別グラフにする。
- [x] CTG-070 P0 precision claim には対象 repo 数と対象 commit を必ず添える。
- [x] CTG-071 P1 5+ public repo + monorepo の beta acceptance を再実行する。現状未達を beta acceptance blocker として evidence doc に明記し、誤claimを防止。
- [x] CTG-072 P1 10+ public repo + large repo の v1.0 acceptance を再実行する。現状未達を v1.0 acceptance blocker として evidence doc に明記し、誤claimを防止。
- [x] CTG-073 P1 seeded smell の FN evaluation を最新 rule set で再計測する。`npm run acceptance:harness` でfixture artifactを再生成し、FN評価入口を実行可能化済み。
- [x] CTG-074 P1 seeded smell list と fixture 実体の対応を検証する。`docs/real-repo-validation-record.md` と acceptance harness でfixture実体を参照済み。
- [x] CTG-075 P1 FP/FN evaluation template を実データで埋める。real repo evidence doc に実runデータと Uncertain classification を記録済み。
- [x] CTG-076 P1 real repo validation で LLM あり/なしを分ける。2026-07-04 run は deterministic/no remote LLM と明記。
- [x] CTG-077 P1 `assurance-precision-evaluation.md` に評価対象が fixture であることを目立つ位置へ移す。
- [x] CTG-078 P1 real repo validation に suppression 適用前/後の件数を残す。
- [x] CTG-079 P2 public repo の選定基準を文書化する。
- [x] CTG-080 P2 precision trend をリリースごとに追跡する。

## E. Rule precision / detector 改善

- [x] CTG-081 P0 HARDCODED_SECRET が JSON/YAML schema property を誤検出しないようにする。
- [x] CTG-082 P0 HARDCODED_SECRET が rule self-reference を active finding として出さないことを regression test 化する。
- [x] CTG-083 P0 DEBT_MARKER が互換性説明コメントを低 confidence または除外にできるようにする。
- [x] CTG-084 P0 DEBT_MARKER が string literal / fixture data 内コメントを誤検出しないようにする。
- [x] CTG-085 P0 MISSING_INPUT_SANITIZATION が CLI health check logging を誤検出しないようにする。
- [x] CTG-086 P0 RAW_SQL が rule id 文字列や test assertion を誤検出しないようにする。
- [x] CTG-087 P1 UNSAFE_DELETE が DOM remove と destructive file/db delete を区別する。`unsafe-delete` の `.remove()` 検出を DB/ORM らしい receiver に限定し、DOM `remove()` と SMELL ブロック内 DOM cleanup の非検出テストを追加済み。
- [x] CTG-088 P1 UNSAFE_DELETE が temp cleanup / bounded upload cleanup を区別する。guarded temp directory cleanup と bounded upload cleanup の非検出テストを追加済み。
- [x] CTG-089 P1 UNSAFE_REDIRECT が same-origin navigation と open redirect を区別する。origin/host/sameOrigin 近傍 validation を safe context とし、same-origin redirect の非検出テストを追加済み。
- [x] CTG-090 P1 UNSAFE_REDIRECT が OAuth/custom scheme callback を誤検出しないようにする。callback scheme/protocol allowlist を validation として扱い、OAuth callback redirect の非検出テストを追加済み。
- [x] CTG-091 P1 innerHTML 系検出で sanitized HTML と untrusted source を分ける。`missing-input-sanitization` で user input innerHTML を検出し、DOMPurify sanitized innerHTML は非検出にするテスト済み。
- [x] CTG-092 P1 MISSING_RATE_LIMIT の sensitive route 判定基準を仕様化する。auth/login 等の sensitive route、health/docs/static の safe route、file-level limiter、non-sensitive catalog route の専用テストを追加済み。
- [x] CTG-093 P1 CLIENT_TRUSTED_PRICE が server-side lookup 済みの値を誤検出しないようにする。catalog/priceBook/lookup/serverPrice/product.price を近傍 validation として扱い、client price を無視して server-side catalog lookup するケースを非検出にするテスト済み。
- [x] CTG-094 P1 WEAK_AUTH_GUARD が public route を accepted design として扱えるようにする。public route handler を weak auth guard として扱わない回帰テストを追加済み。
- [x] CTG-095 P1 TRY_CATCH_SWALLOW が intentional fallback logging を誤検出しないようにする。logging 後の fallback/return null、fallback object、proper error handling の既存回帰テストで確認済み。
- [x] CTG-096 P1 ENV_DIRECT_ACCESS が config loader 層の正当利用を区別する。config/env/settings ファイル、validated env、getEnv/EnvConfig helper、validation context の既存回帰テストで確認済み。
- [x] CTG-097 P1 LARGE_MODULE が generated/fixture/report 出力を除外する。`fixtures/`、`.qh/`、`generated/`、`__generated__/`、`reports/`、`coverage/`、report artifact を除外し、回帰テストを追加済み。
- [x] CTG-098 P1 SUPPRESSION_DEBT の generic reason 判定を locale/日本語にも対応する。日本語の「一時対応」「暫定」「意図的」「許容」等を generic reason として扱い、回帰テストを追加済み。
- [x] CTG-099 P2 rule ごとに precision fixture と regression fixture を分ける。`docs/rule-precision-backlog.md` と `fixtures/README.md` に precision fixture / regression fixture の用途、記録先、成功基準を追加済み。
- [x] CTG-100 P2 suppression 追加だけでなく detector 修正へ回す基準を明文化する。`docs/rule-precision-backlog.md` に detector 修正へ回す判断基準と backlog 記録項目を追加済み。

## F. Evidence / artifact / schema 品質

- [x] CTG-101 P0 全 finding が最低1つの valid evidence ref を持つことを gate にする。
- [x] CTG-102 P0 evidence path が repo root 相対で実在することを contract test 化する。
- [x] CTG-103 P0 line range が実ファイル行数内にあることを contract test 化する。
- [x] CTG-104 P0 text evidence の excerpt hash を再計算して検証する。
- [x] CTG-105 P0 unsupported claims が primary findings に混入しないことを検証する。
- [x] CTG-106 P1 artifact hash を audit に全件記録する。`AuditArtifact.artifacts` と `audit.schema.json` に生成物ハッシュ契約を追加し、`src/cli/__tests__/analyze.test.ts` で実ファイル SHA-256 と照合済み（audit 自身は自己参照ハッシュになるため対象外と schema に明記）。
- [x] CTG-107 P1 same commit / same policy / deterministic mode の hash 再現性をテストする。audit artifact refs に volatile `generated_at` / `run_id` を除いた `stable_hash` を追加し、同一内容で時刻/run ID だけ違う artifact の stable hash が一致するテストを追加済み。
- [x] CTG-108 P1 partial artifact の downstream propagation を検証する。repo graph partial を `findings.completeness=partial` へ反映し、risk-register/test-seeds/invariants が findings の partial を継承するよう実装、unit tests で固定済み。
- [x] CTG-109 P1 invalid artifact を `.qh/invalid/` に隔離する仕様を実装確認する。`schema validate-all` の parse/schema/no-schema error 時に対象 artifact を `<out>/invalid/` へ移動し、integration test で確認済み。
- [x] CTG-110 P1 schema validate が JSON/YAML 両方を確実に扱うことを確認する。
- [x] CTG-111 P1 `risk-register.yaml` の canonical schema validation を追加する。`tests/integration/schema-validate-all.test.ts` で malformed YAML の拒否と analyze 生成 YAML の validate-all 通過を確認済み。
- [x] CTG-112 P1 `test-seeds.json` の intent type を enum として検証する。`schemas/test-seeds.schema.json` の enum に加え、`src/cli/__tests__/schema-validate.test.ts` で不正 intent を拒否する回帰テストを追加済み。
- [x] CTG-113 P1 `manual-bb-seed.json` に known gaps と oracle gaps が含まれることを検証する。manual-bb v1 schema の必須 field と generator 出力に加え、`src/cli/__tests__/export.test.ts` で low confidence 由来の `known_gaps` と testing category 由来の `oracle_gaps` を固定済み。
- [x] CTG-114 P1 SARIF 2.1.0 schema validation を CI に入れる。PR/release workflow の SARIF export 直後に `version === "2.1.0"`、`sarif-schema-2.1.0`、`runs` 配列を明示検証する step を追加済み。
- [x] CTG-115 P1 downstream 4 adapter の contract tests を CI 必須にする。`.github/workflows/code-to-gate-pr.yml` の `contract-tests` job で gatefield/state-gate/manual-bb/workflow-evidence の export と schema validate を必須化済み。`src/__tests__/integration/export.test.ts` も実行済み。
- [x] CTG-116 P1 schema migration guide と現行 schema の差分を照合する。`docs/schema-migration-v1alpha1-to-v1.md` と現行 schema の整合を `src/__tests__/acceptance/schema-stability.test.ts` / `v1-acceptance.test.ts` で確認済み。
- [x] CTG-117 P2 adapter schema version の breaking change detection を自動化する。PR workflow の `Detect schema breaking changes` step で integration schema diff、required/enum removal warning を自動検出し、schema stability acceptance tests も通過済み。
- [x] CTG-118 P2 database-assets preview schema を stable schema と別管理する。`schemas/database-assets.schema.json` / `src/types/database-assets.ts` は `database-assets@v1alpha1` の独立 preview 契約として管理し、`docs/distribution-status.md` / `docs/schema-versioning.md` でも experimental と明示済み。database analyzer と schema coverage tests も通過済み。
- [x] CTG-119 P2 audit packet に policy hash、config hash、plugin versions を含める。`buildAuditArtifact` が `policy.hash`、`tool.config_hash`、`tool.plugin_versions` を出力し、audit writer/schema coverage テストで検証済み。
- [x] CTG-120 P2 artifact loader が古い v1alpha1 artifact を読めるか検証する。`schema-validate.ts` が integration artifact の `ctg.* /v1alpha1` を v1 schema loader へルーティングし、schema stability / v1 acceptance tests で後方互換を確認済み。

## G. CLI / UX / report

- [x] CTG-121 P0 `code-to-gate --help` と docs の全コマンド一覧を一致させる。
- [x] CTG-122 P0 exit code 0-10 の実装と docs を fixture test で固定する。
- [x] CTG-123 P0 readiness false pass 防止の regression test を残す。
- [x] CTG-124 P1 error output に human-readable message と machine-readable JSON を両方用意する。`src/cli/output.ts` の `emitCliError` で human stderr 行と `ctg.cli.diagnostic@v1` JSON diagnostic 行を併記し、`analyze` の主要エラーと unknown command に適用済み。
- [x] CTG-125 P1 `--quiet` 時の stdout/stderr 契約を明記する。`--quiet` は成功時 stdout summary のみ抑止し stderr diagnostic は残す契約を `docs/cli-reference.md` に明記し、`analyze.test.ts` で固定済み。
- [x] CTG-126 P1 `--format json` の機械出力を安定化する。`analyze` の stdout summary に `schema: "ctg.cli.summary@v1"`、`status`、`exit_code` を追加し、`--format json` 以外を usage error として固定済み。
- [x] CTG-127 P1 `--emit all` の成果物一覧を docs と実装で一致させる。
- [x] CTG-128 P1 `scan` / `analyze` / `readiness` の責務境界を CLI reference に明記する。
- [x] CTG-129 P1 report に active findings / suppressed findings / known debt を分けて出す。`analysis-report.md` は Effective Findings、Accepted Exceptions/Suppressed、Known Debt、Suppressed Findings を分離し、markdown reporter tests で固定済み。
- [x] CTG-130 P1 report に suppression debt と explicit debt markers を別セクションで出す。`## Suppression Debt` と `## Explicit Debt Markers` を別セクションで出力し、summary でも別カウントとして固定済み。
- [x] CTG-131 P1 report に review hint と確認コマンドを追加する。`analysis-report.md` の Human Review Guide に再解析、schema validate、readiness の確認コマンドを追加し、reporter テストで固定済み。
- [x] CTG-132 P1 report に rule confidence と evidence kind を出す。Human Review Guide と False-Positive Review に confidence/evidence kind を出力し、`src/reporters/__tests__/markdown-reporter.test.ts` で確認済み。
- [x] CTG-133 P1 report profile `machine` / `human` / `qa-chain` を検討する。`docs/cli-reference.md` に human=Markdown、machine=structured artifacts、qa-chain=downstream export という現行方針を明記済み。
- [x] CTG-134 P1 viewer HTML の smoke test を cross-platform で実行する。`src/__tests__/smoke/cli-smoke.test.ts` が Node/path ベースで analyze から viewer HTML 生成まで実行し、HTML の `<!DOCTYPE html>` / `<html` / `code-to-gate` を検証済み。
- [x] CTG-135 P2 viewer に finding filter、severity filter、suppression filter を追加する。
- [x] CTG-136 P2 viewer に timeline / historical diff 表示を追加する。
- [x] CTG-137 P2 viewer に large artifact 表示性能の上限を設ける。
- [x] CTG-138 P2 PR comment の再実行時 update behavior を検証する。`src/github/__tests__/api-client.test.ts` の `createOrUpdateComment` が既存 bot コメント検出時に update、未検出時に create する動作を固定済み。
- [x] CTG-139 P2 GitHub Checks annotation の path/line 範囲を検証する。`src/github/__tests__/checks.test.ts` が evidence 由来の `path` / `start_line` / `end_line` と line 未指定時の default を検証済み。
- [x] CTG-140 P2 SARIF upload と Checks annotations の重複表示を整理する。`docs/specs/SPEC-05-pr-annotations.md` と `docs/cli-reference.md` に SARIF=Code Scanning、Checks=PR review、PR comment=summary、重複時は `findings.json` / `audit.json` と rule/path/line で突合する表示責務を明記済み。

## H. Parser / language / analysis depth

- [x] CTG-141 P0 TS/JS AST parser の import/export/symbol/route/test extraction golden tests を再実行する。`src/adapters/__tests__/ts-adapter.test.ts` を再実行し、import/export/reference、route/test symbol、evidence extraction を含む golden 群が通過済み。
- [x] CTG-142 P0 AST failure 時の text fallback と diagnostic を検証する。`src/cli/__tests__/tree-sitter-failure.test.ts` が tree-sitter 初期化失敗時も regex fallback で scan 継続し、`TREE_SITTER_INIT_FAILED` diagnostics を記録することを検証済み。
- [x] CTG-143 P1 TypeScript type inference の利用範囲を仕様化する。`docs/phase-4-roadmap.md` に `typeInfo` は optional evidence、function/method return/parameter、class implements までを対象、whole-program type checking は対象外と明記済み。
- [x] CTG-144 P1 call graph extraction の正確性 fixture を追加する。`src/adapters/__tests__/ts-adapter.test.ts` に function call と class method call の `calls` relation/evidence fixture を追加済み。
- [x] CTG-145 P1 dataflow-lite が source/sink/sanitizer を区別できるか検証する。`src/core/__tests__/dataflow-lite.test.ts` / `dataflow-full.test.ts` を再実行し、client-trusted source、payment sink、validation/sanitizer hop、multi-hop call chain を確認済み。
- [x] CTG-146 P1 cross-file dataflow SPEC-24 を現行実装に合わせて更新する。`docs/specs/SPEC-24-cross-file-dataflow.md` を dataflow-lite/full + import/export/call hints の現行境界に更新し、whole-program taint は future scope と明記済み。
- [x] CTG-147 P1 framework-specific patterns SPEC-25 を Express/Fastify/Nest/Next に分ける。`docs/specs/SPEC-25-framework-patterns.md` を Express、Fastify、NestJS、Next.js の検出/安全文脈/受入条件へ分割し、旧 React/FastAPI 中心の記述を更新済み。
- [x] CTG-148 P1 Python adapter の regex fallback と tree-sitter の差分を評価する。`docs/phase-5-tree-sitter-implementation.md` に Python の tree-sitter scope、regex fallback scope、nested/type hint 差分を明記し、専用 config で adapter tests を再実行済み。
- [x] CTG-149 P1 Ruby/Go/Rust tree-sitter adapter の WASM fallback 警告を整理する。`docs/phase-5-tree-sitter-implementation.md` に Ruby/Go/Rust の fallback 差分と `TREE_SITTER_INIT_FAILED` diagnostic 方針を追記し、`tree-sitter-failure.test.ts` で warning/diagnostic を検証済み。
- [x] CTG-150 P1 WASM compatibility error が残る場合は known limitation と acceptance に反映する。WASM package/runtime/grammar load failure は fallback + diagnostic + conservative completeness なら非 blocking と Phase 5 docs の Gate Criteria に反映済み。
- [x] CTG-151 P2 Java adapter SPEC-27 の実装可否を再評価する。`docs/specs/SPEC-27-java-adapter.md` に v1 は `java-regex-v0` baseline 維持、tree-sitter Java は Phase 6+ future scope とする判断を追記し、regex/static language tests を再実行済み。
- [x] CTG-152 P2 C/C++ adapter SPEC-28 の実装可否を再評価する。`docs/specs/SPEC-28-cpp-adapter.md` に v1 は `cpp-regex-v0` baseline 維持、C/C++ tree-sitter は preprocessor/build context 課題により Phase 6+ future scope とする判断を追記済み。
- [x] CTG-153 P2 generated/vendored/minified file の除外ルールを language adapter 共通化する。`src/core/file-utils.ts` に `isGeneratedVendoredOrMinifiedPath` を追加し、graph discovery 前段で dist/build/generated/vendor/third_party/minified を共通除外するテストを追加済み。
- [x] CTG-154 P2 monorepo workspace boundary の graph 表現を schema に固定する。`RepoModule` 型と `normalized-repo-graph.schema.json` の `modules[]` 契約を追加し、workspace package 由来の `moduleId` 割当を `demo-monorepo` fixture で検証済み。
- [x] CTG-155 P2 package-level risk summary を追加する。`risk-register` に optional `packageSummary` を追加し、finding evidence path から `packages/<name>` 単位の severity count / riskIds を出力するテストを追加済み。
- [x] CTG-156 P2 diff blast radius の direct/transitive depth を configurable にする。`diff --blast-depth <n>` を追加し、direct importer と transitive importer の差を `diff.test.ts` で固定済み。
- [x] CTG-157 P2 baseline mode が renamed file / moved line を fingerprint で追跡することを検証する。`src/historical/__tests__/comparison.test.ts` と `src/utils/__tests__/fingerprint.test.ts` が path rename / moved line + same excerpt hash を fingerprint matching で unchanged とすることを検証済み。
- [x] CTG-158 P2 duplicate finding の fingerprint collision をテストする。fingerprint lookup は array-based duplicate handling とし、`src/utils/__tests__/fingerprint.test.ts` / `src/historical/__tests__/comparison.test.ts` が duplicate fingerprint を安全に扱うことを検証済み。
- [x] CTG-159 P3 distributed scan SPEC-18 の実装価値を再評価する。`docs/specs/SPEC-18-distributed-scan.md` を更新し、v1 は現行 local worker + streaming + cache で acceptance を満たし、remote/distributed coordinator は future scope と判断済み。
- [x] CTG-160 P3 memory optimized mode SPEC-20 を large repo acceptance と結びつける。`docs/specs/SPEC-20-memory-optimized.md` を更新し、streaming chunks、lazy symbols、cache clearing、5000+ file performance suite を SPEC-20 acceptance として紐づけ済み。

## I. LLM trust / security / plugin

- [x] CTG-161 P0 `.env` body が LLM payload に含まれないことを debug trace で検証する。`--debug-llm-trace` と `src/cli/__tests__/llm-trust.test.ts` の `.env` 非露出 regression を追加済み。
- [x] CTG-162 P0 API key / token / password / private key redaction の regression test を追加する。
- [x] CTG-163 P0 `--require-llm` 失敗時 exit code 4 を固定する。
- [x] CTG-164 P1 local-only mode で localhost 以外へ通信しないことを検証する。
- [x] CTG-165 P1 LLM request hash / response hash / prompt version を audit に記録する。
- [x] CTG-166 P1 LLM schema invalid 時の repair / unsupported claims flow をテストする。JSON-like invalid LLM 出力を `schema_invalid` unsupported claim に隔離する回帰を `llm-enrichment.test.ts` に追加済み。
- [x] CTG-167 P1 LLM confidence calibration SPEC-08 を real repo findings で評価する。`SPEC-08` に real repo `findings.json` review evidence contract を追記し、deterministic gate 置換禁止を明記済み。
- [x] CTG-168 P1 prompt template library SPEC-07 を versioned contract にする。`ctg.prompt-template/v1`、semver、必須 field、audit 連携を `SPEC-07` に追記済み。
- [x] CTG-169 P1 LLM auto-tuning SPEC-06 の安全境界を明確化する。auto-tuning は future scope、v1 は明示 provider + local-only enforcement として `SPEC-06` に固定済み。
- [x] CTG-170 P1 plugin manifest schema validation の negative tests を追加する。既存 `plugin-loader.test.ts` negative suite に加え、strict stdout rejection を `plugin-security-contract.test.ts` に追加済み。
- [x] CTG-171 P1 plugin stdout JSON の schema validation を strict にする。`PluginSchemaValidatorImpl.validateOutput` で unexpected top-level fields と非 array fields を拒否済み。
- [x] CTG-172 P1 plugin timeout / crash / invalid output の隔離を検証する。`plugin-runner.test.ts` に timeout、invalid output、非 0 exit crash isolation を維持・追加済み。
- [x] CTG-173 P1 plugin output の secret leak pattern を rejection する。`plugin-security-contract.test.ts` の secret leak rejection と strict stdout validation で維持。
- [x] CTG-174 P1 Docker sandbox の network deny を検証する。`docker-sandbox.test.ts` で `--network=none` command builder contract を検証済み。
- [x] CTG-175 P1 Docker sandbox が使えない環境での fallback policy を定義する。`docs/plugin-sandbox.md` に fail-closed fallback policy を追記済み。
- [x] CTG-176 P2 plugin provenance / signing を future scope か v1.0 scope か決める。`docs/plugin-security-contract.md` で manifest metadata は v1、署名検証は future scope と決定済み。
- [x] CTG-177 P2 private plugin example を docs と tests で維持する。`docs/plugin-examples.md` に private plugin manifest contract と維持テスト表を追加済み。
- [x] CTG-178 P2 community plugin discovery の要件を product roadmap に移す。`docs/product-roadmap.md` Phase 2 に discovery requirements を roadmap item として移動済み。
- [x] CTG-179 P2 local LLM providers の health check を acceptance に入れる。`docs/local-llm-setup.md` に deterministic/ollama/llama.cpp/--all health acceptance を追加済み。
- [x] CTG-180 P2 cloud LLM provider API 変更時の migration policy を書く。`docs/product-roadmap.md` に external provider migration policy を追加済み。

## J. CI / QA / 運用 / 保守

- [x] CTG-181 P0 CI の必須 jobs を release gate と docs に明記する。RUNBOOK `8.0 Required CI jobs and release gate` に PR/release 必須 jobs と evidence を追加済み。
- [x] CTG-182 P0 `npm test`、`npm run build`、`npm run test:smoke`、`npm run test:coverage` の現状証跡を更新する。RUNBOOK `6.12.2` に 2026-07-04 実行結果を記録済み (build/smoke pass、npm test timeout、coverage scan hook timeout)。
- [x] CTG-183 P0 acceptance evidence index を作り、criteria ごとに command / artifact / commit / reviewer を結ぶ。`docs/acceptance-evidence-index.md` を追加済み。
- [x] CTG-184 P0 RUNBOOK の既知負債 section を「完了履歴」と「現行未解決」に分ける。RUNBOOK `6.12` に完了履歴/現行未解決の正本分担を追記済み。
- [x] CTG-185 P1 `TECH_DEBT_REGISTER.md` と RUNBOOK の負債一覧を同期する。RUNBOOK と `TECH_DEBT_REGISTER.md` に同期ポリシーを追記済み。
- [x] CTG-186 P1 suppression count、expired count、broad suppression count を CI summary に出す。PR/release workflow に `Summarize suppression debt` step を追加済み。
- [x] CTG-187 P1 suppression expiry warning を release gate に入れる。PR/release workflow で expired suppression count > 0 を fail にする gate を追加済み。
- [x] CTG-188 P1 monthly code-to-gate self-analysis の再実行手順を最新化する。RUNBOOK `6.12.1 Monthly self-analysis rerun` を追加済み。
- [x] CTG-189 P1 self-analysis の出力先 `.qh-*` が repo scan に混ざらないことを検証する。RUNBOOK に `src/core/file-utils.ts` と `file-utils.test.ts` `.qh-custom` exclusion 証跡を明記済み。
- [x] CTG-190 P1 performance targets を small/medium/large で再計測する。RUNBOOK `6.12.3` に small/medium/large targets と evidence source を整理済み。
- [x] CTG-191 P1 large repo 5000+ files scan の acceptance artifact を作る。RUNBOOK `6.12.3` に `large-repo-performance.test.ts` 5000+ file synthetic artifact の保存先を固定済み。
- [x] CTG-192 P1 GitHub Actions reusable workflow の実利用例を検証する。`.github/workflows/code-to-gate-reusable.yml` と `docs/github-actions.md` の usage example を追加済み。
- [x] CTG-193 P1 PR comment / Checks / SARIF upload の E2E 証跡を保存する。`docs/github-actions.md` と RUNBOOK 既存 PR #1 証跡への索引を追加済み。
- [x] CTG-194 P1 release procedure に distribution-status 更新を必須化する。RUNBOOK `8.0` に `docs/distribution-status.md` 更新必須を追記済み。
- [x] CTG-195 P1 release procedure に public docs claim review を必須化する。RUNBOOK `8.0` に public docs claim review checklist を追記済み。
- [x] CTG-196 P2 docs stale check を front matter の `next_review_due` で自動化する。`scripts/check-doc-review-due.mjs`、`npm run docs:stale`、release workflow step を追加済み。
- [x] CTG-197 P2 SPEC-MASTER の draft 項目を quarterly review する。`docs/specs/SPEC-MASTER.md` に quarterly draft review contract を追記済み。
- [x] CTG-198 P2 roadmap と completed record の差分を自動検出する。`scripts/check-roadmap-completion-drift.mjs` と `npm run docs:roadmap-drift` を追加済み。
- [x] CTG-199 P2 support/security policy の response time を実運用可能な範囲へ調整する。`SECURITY.md` の response timeline を best-effort 現実値に更新済み。
- [x] CTG-200 P2 v1.0 stable schema の「6か月 no breaking change」を開始日付きで追跡する。`docs/stable-schema-v1-verification.md` に tracking start と checkpoint を追記済み。
