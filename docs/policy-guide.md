---
intent_id: DOC-POLICY-GUIDE-001
owner: code-to-gate-team
status: active
last_reviewed_at: 2026-08-25
next_review_due: 2026-09-25
---

# Policy Guide

`code-to-gate` policies are YAML files that decide how findings affect release
readiness. Policies are evaluated by `analyze` and `readiness`; they do not send
code or findings to any external service.

## Minimal Policy

```yaml
version: ctg/v1
blocking:
  severity:
    critical: true
    high: true
  category:
    auth: true
    payment: true
    data: true
```

policyのversionは`ctg/v1`を使う。`ctg/v1alpha1`はpolicy loaderでは受け付けない。

## YAMLの書式と設定名

Unreleasedでは既知のpolicy節を解析済みYAMLオブジェクトから読み取る。同じ値なら1行形式、複数行形式、末尾コメント、引用key、インデントの違いで判定は変わらない。不正な型はpolicyエラーとなる。公開済みv1.6.0にはこの修正は含まれない。

```yaml
policy_id: team-quality
confidence: { min_confidence: 0.9, filter_low: true }
blocking:
  rules:
    DEBT_MARKER: true # 品質レビュー対象
  count_threshold:
    high_max: 10
suppression:
  file: 'C:/work/project/.ctg/suppressions.yaml'
```

真偽値や数値を文字列として引用しない。パスは文字列として保持され、コロンや空白も含めて指定できる。Windowsのバックスラッシュを使う場合は単一引用符で囲むか、YAMLのエスケープ規則に従う。

同梱policyは`policy_id`、`count_threshold`、`high_max`等の正式なキーを使う。`policyId`や`blocking.count.highMax`は対応する設定項目ではない。coverageの閾値はCIの検証設定で管理する。

## Blocking Controls

| Key | Meaning |
|-----|---------|
| `blocking.severity.<level>` | Blocks when an effective finding has the selected severity. |
| `blocking.category.<category>` | Blocks when an effective finding belongs to the selected category. |
| `blocking.rules.<RULE_ID>` | Blocks on specific rules such as `DB_DROP_TABLE`. |
| `blocking.count_threshold.<level>_max` | Blocks when effective findings exceed an explicitly configured limit for a blocking severity. |

Supported blocking severities are `critical`, `high`, `medium`, and `low`.
Common categories include `auth`, `payment`, `data`, `security`,
`validation`, `testing`, and `maintainability`.

Count thresholds are optional in an explicit policy. They are not inherited from
the built-in default policy when `count_threshold` is omitted, and a threshold is
ignored when the matching `blocking.severity` value is `false`. Suppressed and
baseline-carried findings do not consume the count budget.

## Rule Analysis Options

Use `rule_options` to tune supported analysis rules without changing their
defaults for other repositories. `LARGE_MODULE` supports all three size limits:

```yaml
rule_options:
  LARGE_MODULE:
    max_lines: 1500
    max_functions: 60
    max_size_kb: 150
```

Omitted values retain the defaults of 500 lines, 20 functions, and 50 KB.

## Policy DSL

Use `dsl.rules` when a release rule depends on context rather than a plain
severity/category threshold. Initial DSL conditions support severity, category,
rule ID, baseline ratchet state, and manual evidence.

```yaml
version: ctg/v1
policy_id: dsl-release

dsl:
  rules:
    - id: critical-always-block
      when:
        severity: critical
      action: block
      reason: Critical findings always block release.
    - id: new-security-block
      when:
        baseline: new_or_worsened
        category: security
      action: block
      reason: New or worsened security findings must be fixed.
    - id: manual-evidence-hold
      when:
        manual_evidence: present
      action: hold
      reason: Manual BB evidence exists; hold for human review.
```

Actions:

| Action | Readiness effect |
|--------|------------------|
| `block` | Adds a DSL failed condition and forces `blocked_input`. |
| `hold` | Adds a DSL failed condition and forces at least `needs_review`. |
| `allow` | Suppresses later DSL `block`/`hold` matches for the same finding. |

`baseline: new_or_worsened` matches findings evaluated by the baseline ratchet
gate. `manual_evidence` is populated by `readiness --manual-evidence <file>`
and accepts `manual-bb.json` or `manual-bb-seed.json`.

## Readiness Status

readinessの状態はblocking、partial、DSL等の評価結果から導出する。`readiness.criticalFindingStatus`という設定で切り替える機能は実装していない。

| Value | Meaning |
|-------|---------|
| `passed` | Policy conditions are met with complete input. |
| `passed_with_risk` | Policy permits the identified risks or partial input. |
| `blocked_input` | A blocking condition or incomplete input prevents release. |
| `needs_review` | A hold condition or unresolved review condition requires human review. |

## Database Analysis Rules

When `--database-analysis` is enabled, database migration findings can also be
gated by rule ID or category:

```yaml
version: ctg/v1
blocking:
  category:
    data: true
  rules:
    DB_DROP_TABLE: true
    DB_DROP_COLUMN: true
    DB_RISKY_TYPE_CHANGE: true
```

## Run With A Policy

```bash
code-to-gate analyze ./my-repo --policy ./policy.yaml --emit all --out .qh
code-to-gate readiness ./my-repo --policy ./policy.yaml --from .qh --out .qh
code-to-gate readiness ./my-repo --policy ./policy.yaml --from .qh --out .qh \
  --baseline .qh/baseline-findings.json --manual-evidence .qh/manual-bb.json
```

## Related Docs

- [CLI Reference](cli-reference.md)
- [Quickstart](quickstart.md)
- [Distribution Status](distribution-status.md)
