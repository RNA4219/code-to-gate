# code-to-gate Plugin Security Contract

**バージョン**: v1alpha1  
**作成日**: 2026-04-29  
**対象**: language adapter、rule plugin、importer、reporter、downstream exporter、private rulepack

---

## 1. 目的

code-to-gate は private plugin を許可するが、OSS core に company-specific rule、private source、internal analysis output を混入させない。

この文書は、plugin が触ってよい入力、返してよい出力、禁止操作、検収条件を定義する。

---

## 2. Trust Boundary

| 領域 | 信頼度 | 扱い |
|---|---|---|
| OSS core | trusted | schema validation、policy evaluation、artifact rendering の正本 |
| public plugin | limited trust | manifest と戻り値 schema を検証 |
| private plugin | limited trust | OSS core から隔離し、出力だけ schema validation |
| external tool result | untrusted input | importer で正規化し、raw をそのまま採用しない |
| LLM output | untrusted generated content | evidence binding と schema validation を通す |

---

## 3. Plugin Manifest

```yaml
apiVersion: ctg/v1alpha1
kind: rule-plugin
name: private-order-rules
version: 0.1.0
visibility: private
entry:
  command: ["node", "./dist/index.js"]
capabilities:
  - evaluate
receives:
  - normalized-repo-graph@v1
returns:
  - findings@v1
  - risk-seeds@v1
security:
  network: false
  filesystem:
    read:
      - "${repoRoot}"
    write:
      - "${workDir}/plugin-output"
  secrets:
    allow: []
```

---

## 4. 許可する操作

- `NormalizedRepoGraph` を読む。
- configured external result を読む。
- findings / risk-seeds / invariant-seeds を返す。
- plugin 専用 work directory に一時ファイルを書く。
- manifest で許可された repo path を読む。

---

## 5. 禁止する操作

- OSS core repository に company-specific rule を書き込む。
- repo root 外の任意ファイルを読む。
- secret、token、`.env` body を出力 artifact に含める。
- network access を既定で行う。
- suppression を plugin 単独で有効化する。
- release readiness status を plugin 単独で最終決定する。
- schema validation を迂回する。

---

## 6. 実行方式

v0.1 では最低限、次を満たす。

- plugin process は core process と別の child process として起動できる。
- stdin / stdout JSON か、指定 output file でやり取りする。
- timeout を設定できる。
- exit code 非 0 は `PLUGIN_FAILED` として扱う。
- plugin output は採用前に schema validation する。

v1.0 では追加で検討する。

- OS sandbox
- network deny by default
- per-plugin allowlist
- signed plugin manifest
- plugin provenance

---

## 7. Plugin Failure

| 状態 | code-to-gate の扱い |
|---|---|
| manifest invalid | plugin を読み込まず exit code `6` |
| plugin timeout | 1 回だけ retry、失敗なら `PLUGIN_FAILED` |
| output schema invalid | invalid output を隔離し exit code `7` または `6` |
| private data leak pattern detected | artifact 採用不可、`needs_review` |
| network attempt detected | policy により fail または warning |

---

## 8. 検収条件

- private plugin fixture が OSS core file を変更しない。
- plugin output が `schemas/findings.schema.json` または該当 schema を通る。
- plugin failure 時に core artifact は可能な限り残る。
- secret-like string を返す plugin output は採用されない。
- plugin 由来 finding も evidence を持つ。
