# Severity tuning 運用ガイド

Severity tuning は `policy.yaml` の optional な `severity_overrides` で設定する。配列は順序が意味を持ち、最初に一致した override が採用される。

```yaml
severity_overrides:
  - rule_id: MISSING_SERVER_VALIDATION
    path: src/api/**
    severity: critical
    reason: 外部入力を受ける API 境界
  - category: maintainability
    severity: low
    reason: 今回のリリースでは警告扱い
```

`rule_id`、`path`、`category` は少なくとも一つ必要で、複数指定時はすべて一致する必要がある。`path` は repo 相対パスの minimatch glob として扱い、Windows の `\\` は `/` に正規化する。`severity` は `critical` / `high` / `medium` / `low`、`reason` は必須の説明文字列である。入力互換のため `ruleId` と `severityOverrides` も受け付けるが、snake/camel の同時指定は使わない。

調整結果は effective `findings.json` と downstream の評価へ反映される。`raw-findings.json` は検出結果の重大度を記録するため、調整前後を比較できる。調整された finding には `originalSeverity` と `severityResolution` が付き、policy id、理由、一致 selector を確認できる。

この調整を適用するCLIは `analyze`、`readiness`、明示的に `--policy` を指定した `diff` である。

policy を変更して再評価する場合も、前回の調整後重大度をさらに下げたり上げたりせず、`originalSeverity` から一度だけ解決する。readiness の baseline も current と同一 policy で解決されるため、policy の変更だけで baseline が worsened になることを避けられる。無効な override、version、DSL条件、数値設定などの検証エラーがあれば、policy IDが存在しても警告として続行せず、`analyze` / `readiness` が `POLICY_FAILED` を返す。

件数閾値は0以上の整数、confidenceは有限な0〜1の値を指定する。`blocking.category`の正規キー`release-risk`は内部のreleaseRisk判定へ反映される。引用符やコロンを含む`policy_id`もYAMLの文字列として保持する。

実行例:

```bash
code-to-gate analyze ./repo --policy ./policy.yaml --out ./.qh
code-to-gate readiness ./repo --policy ./policy.yaml --from ./.qh --out ./.qh
code-to-gate diff ./repo --base main --head HEAD --policy ./diff-policy.yaml --out ./.qh-diff
```

`analysis-report.md` は調整がある場合に `Severity Adjustments` 表を追加し、finding ID、元の重大度、適用後、policy、reason、一致selectorを表示する。明示設定によって同じ重大度になった場合も理由を残す。既存の重大度セルとraw/effective件数はそのまま維持する。

HTML Viewerのfinding詳細にも元の値と適用後の値を表示する。既定のprivate profileではpolicy・reason・selectorを表示し、public profileではこの追加情報を省いて重大度の値だけを表示する。JSON artifactと合わせて設定をレビューし、必要ならselector、順序、reasonを編集して再実行する。

## diffでの適用範囲

`diff --policy` はカレントディレクトリを基準にpolicyファイルを読み込む。対応する項目は `version`、`policy_id`、`severity_overrides`（または `severityOverrides`）、`blocking`、`confidence`、`partial`、`dsl` である。DSLのbaseline条件とmanual evidence条件には対応しない。suppression、baseline、llm、exit、rule_optionsなどの未対応項目は、無視せず `POLICY_FAILED`（5）で拒否する。analyze/readiness用のpolicyを流用する場合は対応項目だけのファイルに分ける。

policyはGit差分の取得前に検証する。不正なpolicyと不正なGit refが同時に指定された場合はpolicyエラーを先に返し、成果物を生成しない。policyが有効でGit取得に失敗した場合は `SCAN_FAILED`（3）となる。

coreとDBの差分findingを統合した後、元の重大度を `raw-findings.json` に保持して調整する。`findings.json`、標準出力の件数・policy判定、`audit.json`、終了コードは同じ評価結果を使う。差分が空でも、policy指定時はcompleteな空findings/raw-findingsとauditを出力する。policy未指定時は従来どおりの検出・終了判定を使い、空差分では `diff-analysis.json` のみを出力する。
