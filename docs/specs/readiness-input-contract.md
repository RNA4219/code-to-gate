---
intent_id: INT-MANUAL-BB-FIXES
owner: code-to-gate-team
status: active
last_reviewed_at: 2026-09-11
next_review_due: 2026-10-11
---

# Readiness入力・警告・実行識別の仕様

対象は `ctg/v1` / `findings@v1` / `release-readiness@v1`。manual-bbのPART-004と失敗ケースで確認した契約を定義する。修正は1.6.1に含み、公開済みv1.6.0の動作保証へ遡及しない。

## 完全性とpartial設定

`findings.completeness`の`complete` / `partial`を入力完全性の根拠とする。指摘0件、baselineで新規0件、抑制後0件でもpartialは解消しない。`unsupported_claims`は原因説明であり、欠落割合の分子や母数にはしない。

`partial.allow_partial`はboolean、省略時false。以下は他にblocking/hold/低confidence条件がなく、`exit.warn_only`を指定しない場合の判定である。

| 入力 | allow_partial | status | 条件・説明 | exit |
|---|---|---|---|---:|
| complete | false / true | passed | INCOMPLETE_INPUTなし | 0 |
| partial | false / 省略 | blocked_input | INCOMPLETE_INPUT・partialの理由・再解析の推奨操作 | 1 |
| partial | true | passed_with_risk | INCOMPLETE_INPUT・partial許可の理由・再解析の推奨操作 | 0 |

severity等の独立したblocking条件はpartialを許可しても有効。baselineは新規・悪化したfindingを絞るが、入力完全性は現在のartifact全体に適用する。

## partial_warning_thresholdの確定した扱い

**v1では将来互換用の予約設定で、警告の有無・status・終了コードを変更しない。** 数値かつ有限、0以上1以下を受け付ける。省略時の内部既定値は0.2。文字列・null・負数・1を超える値はpolicyエラー（5）。

v1のfindings artifactには「解析すべき全入力数」と「欠落した入力数」の契約がないため、割合に基づく判定は提供しない。finding件数、unsupported claim件数、対象ファイルの単純比から欠落割合を推測しない。利用者は現在の許可判断にallow_partialを使う。

将来この予約値を実効化する場合は、対象入力の母数、欠落数、上限打切り時の扱い、境界の比較演算、出力先を別途定義し、既存v1利用者へ挙動変更を明示する。この文書はその将来機能を実装済みとしない。

PART-004の検収: complete/partial × allow_partial=false/true × threshold=0/0.2/1の12通りを実行する。同じ入力とallow_partialでは、閾値を変えてもstatus、INCOMPLETE_INPUT、終了コードが上表と一致する。値域・型の拒否はPOL-014のケースで検証する。

## warn_onlyと失敗の境界

`exit.warn_only: true`は、正常に入力を検証してreadiness artifactを生成できたときの品質判定による終了コード1を0へ変更する。artifactとstdoutのstatus、failedConditions、completeness、理由は実際の判定を保持する。警告運用はリリース承認と同義ではない。

必須引数の欠落、不正policy、入力artifactのschema違反、読み書き失敗は警告運用でも成功に変更しない。`warn_only`省略/falseのときは従来どおりpassed/passed_with_riskが0、それ以外の品質判定は1。

## confidence filterと抑制入力

`confidence.filter_low: false`は、min_confidence未満のfindingも通常のseverity/category判定へ渡す。trueまたは省略時は従来どおり閾値未満を判定対象から除外する。falseで通常判定に含めたfindingを、同時に低confidenceによる除外件数へ加算しない。

抑制YAMLは引用符、末尾コメント、flow形式を同じ値として解析する。構文エラーのあるファイルの先頭部分だけを採用しない。不正な日付や実在しない日付の抑制は適用しない。readinessは不正期限を推奨操作へ明示する。日付のみの期限はUTC 00:00:00を表し、その時刻を超えると期限切れになる。

## baselineの参照優先

readiness artifactをbaselineとして指定し、`artifactRefs.findings`がある場合は、その明示参照先を使用する。同階層の別findingsへ置き換えない。明示参照先を利用できない場合は設定エラーにし、暗黙の別baselineで合格にしない。参照を持たない旧readiness artifactの同階層findings、および直接findings/ディレクトリ指定は引き続き対応する。

## 独立readiness実行のID

各readiness呼出しは新しいpolicy評価として一意のrun_idを生成する。同時刻の独立実行でも重複しない。同じ呼出しが生成するrelease-readinessとself-analysis-debtは同じrun_idを持つ。入力findingsのrun_idは変更しない。agent requestによる同じ実行の冪等再利用は独立した再評価と区別する。

## diff renameのv1表現

`diff-analysis.changed_files`は新しいpathと`status: renamed`でrenameを表現する。旧pathを持つpreviousPathフィールドや新旧対の出力はv1の要求に含めない。削除と追加・変更の区別、指定commit snapshot、blast radiusの契約は維持する。旧pathが必要な連携は別の契約追加として扱う。

## 根拠・関連文書

- [Policy Guide](../policy-guide.md)
- [CLI reference](../cli-reference.md)
- [実行ID](../run-identity.md)
- [findings schema](../../schemas/findings.schema.json)
- [diff schema](../../schemas/diff-analysis.schema.json)
- [Task Seed](../tasks/20260911-05-manual-bb-fixes.md)
