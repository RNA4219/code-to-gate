# SPEC-26: Severity Tuning

**状態**: 実装済み（任意 policy 設定）
**対象版**: `ctg/v1` policy / `findings@v1` artifacts

## 目的

ルールが検出した元の重大度を、リポジトリ固有のリスク判断に基づいて policy の順序付きルールで調整する。policy がこの設定を持たない場合は、従来の検出時重大度と挙動を維持する。

## 設定契約

```yaml
version: ctg/v1
policy_id: release-policy
severity_overrides:
  - rule_id: CLIENT_TRUSTED_PRICE
    path: src/checkout/**
    category: payment
    severity: critical
    reason: 決済経路はプロジェクトの最重要境界である
  - category: maintainability
    severity: low
    reason: 保守性の指摘はこのリリースでは警告として扱う
```

`severity_overrides` は配列で、各項目に `rule_id`、`path`、`category` のうち少なくとも一つを指定する。複数の selector は AND 条件である。重大度は `critical`、`high`、`medium`、`low` のいずれか、`reason` は空でない文字列とする。`ruleId` と `severityOverrides` も入力時の camel case alias として受け付ける。snake/camel の同時指定は拒否する。path は repo 相対の既存 minimatch glob で、否定 glob は拒否する。

配列は上から評価し、最初に一致した項目だけを適用する。一致しない finding は元の重大度を使う。設定の構文または値が不正な場合、`analyze`、`readiness`、`diff --policy` は `POLICY_FAILED` で終了する。

## artifact と評価

`raw-findings.json` はルールが検出した重大度を保持する。policy 適用後の findings、risk、test、report、policy DSL、blocking threshold、count threshold は同じ effective severity を使う。effective finding には調整時だけ次を記録する。

CLIでpolicyを適用する範囲は `analyze`、`readiness`、明示的に `--policy` を指定した `diff` である。diffはseverity overrides、blocking、confidence、partial、baseline/manual evidence条件を含まないDSLに対応する。未対応の明示設定はGit取得・空差分分岐より前に拒否する。詳細は [運用ガイド](../severity-tuning.md) を参照する。

- `originalSeverity`: 検出時の重大度
- `severityResolution`: `policyId`、`originalSeverity`、適用後 `severity`、`reason`、一致した selector

resolver は調整時に finding をコピーして返し、調整がない場合は既存 finding の参照と serialization を維持する。再適用時は既存の `originalSeverity` を基点にするため、同じ policy の再適用や policy の差し替えで調整が累積しない。調整を含まない policy を再適用すると、元の重大度とメタデータへ戻る。readiness の current/baseline 比較も、同じ policy で双方を正規化してから行う。

## 実際の利用方法

```bash
code-to-gate analyze <repo> --policy policy.yaml --out .qh
code-to-gate readiness <repo> --policy policy.yaml --from .qh --out .qh
code-to-gate diff <repo> --base main --head HEAD --policy diff-policy.yaml --out .qh-diff
```

既存の policy loader と CLI 契約を利用する。severity 専用の `policy show` コマンドや、未実装の擬似 API は提供しない。直接利用する場合は `src/config/severity-resolver.ts` の `resolveSeverity` / `resolveSeverities`、評価全体は `evaluatePolicy` を使う。

## 検証観点

- 設定なしの互換性、first-match-wins、selector の AND、path の slash 正規化
- 不正 YAML、selector、重大度、category、reason の fail closed
- resolver の idempotence と policy 変更時の元重大度復元
- policy DSL、blocking、count threshold、baseline ratchet の effective severity 一貫性
- raw artifact が検出時重大度を保持すること
- diffの昇降格・空差分・DB差分で、件数、audit、policy判定、終了コードが一致すること
