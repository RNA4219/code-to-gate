---
intent_id: INT-ASSURANCE-SMELL-DETECTOR-001
owner: code-to-gate-team
status: implemented
last_reviewed_at: 2026-06-09
---

# Assurance QEG Evidence Specification

## 目的

Assurance Detectorの結果を既存QEG evidenceへ任意入力として連携する。code-to-gateはevidence producer、quality-evidence-graphはdecision ownerである。

## 契約

- export targetは既存の`qeg-code-to-gate`を使う。
- file名は`qeg-code-to-gate.json`、versionは`ctg.qeg-input/v1`を維持する。
- `assurance-findings.json`が存在する場合だけschema検証し、要約とSHA-256 hashを追加する。
- Assurance候補数はreview-required evidenceであり、`fail`やrelease blockへ変換しない。
- `quality_checks_actual.assurance_inspection`は、有効artifactがあれば`pass`、未指定なら`skipped`とする。
- decision field、release approval、CI自動実行は追加しない。

## Optional summary

`assurance_findings_summary`は`total`、`unsupported_claims`、`by_rule`を含む。artifactがない場合はfield自体を省略する。

## Acceptance

- canonical schema `schemas/integrations/qeg-code-to-gate.schema.json`に適合する。
- invalidな`assurance-findings.json`が存在する場合はintegration exportを失敗させる。
- exportにdecision fieldがない。
- artifact hashは`sha256:<64 hex>`形式を維持する。
