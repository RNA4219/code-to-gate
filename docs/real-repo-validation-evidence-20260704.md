---
intent_id: DOC-REAL-REPO-EVIDENCE-20260704
owner: code-to-gate-team
status: active
last_reviewed_at: 2026-07-04
next_review_due: 2026-08-04
---

# Real Repo Validation Evidence - 2026-07-04

Command:

```powershell
.\scripts\real-repo-test.ps1 -Repo all -Phase phase1
```

Result: 4/4 repositories passed scan, analyze, readiness exit-code contract, and schema validation for `repo-graph.json`, `findings.json`, and `audit.json`.

## Repository Matrix

| repo | URL | commit | type | language/framework | files | policy | status | artifacts |
|---|---|---|---|---|---:|---|---|---|
| axios | `https://github.com/axios/axios.git` | `e435384f36bdd310ae784d652e97a0383d1c52a7` | backend/library | TS/JS HTTP client | 206 | `.qh/acceptance/real-repo/axios/policy.yaml` | pass | `.qh/acceptance/real-repo/axios/` |
| express | `https://github.com/expressjs/express.git` | `18e5985b8a9d5e8423db0a9121f22bdaecd5b120` | backend | JS Express framework | 141 | `.qh/acceptance/real-repo/express/policy.yaml` | pass | `.qh/acceptance/real-repo/express/` |
| dayjs | `https://github.com/iamkun/dayjs.git` | `98364bcebc047529345cc8c2bbcc44a6a8c18e79` | library | JS date library | 326 | `.qh/acceptance/real-repo/dayjs/policy.yaml` | pass | `.qh/acceptance/real-repo/dayjs/` |
| react | `https://github.com/facebook/react.git` | `e71a6393e66b0d2add46ba2b2c5db563a0563828` | frontend/large | JS/TS React repository | 4474 | `.qh/acceptance/real-repo/react/policy.yaml` | pass | `.qh/acceptance/real-repo/react/` |

## Findings Summary

| repo | findings after suppression | raw findings before suppression | suppression delta | primary rules |
|---|---:|---:|---:|---|
| axios | 24 | 24 | 0 | DEPRECATED_API_USAGE 7, LARGE_MODULE 10, MISSING_RATE_LIMIT 2, TRY_CATCH_SWALLOW 3 |
| express | 23 | 23 | 0 | LARGE_MODULE 4, MISSING_RATE_LIMIT 18, TRY_CATCH_SWALLOW 1 |
| dayjs | 3 | 3 | 0 | DEBT_MARKER 3 |
| react | 1671 | 1671 | 0 | DEBT_MARKER 1101, LARGE_MODULE 375, DEPRECATED_API_USAGE 71, TRY_CATCH_SWALLOW 47 |

## Review Classification

No human TP/FP adjudication was completed during this run. The correct precision
classification for this evidence pack is therefore:

| class | count |
|---|---:|
| True positive | 0 |
| False positive | 0 |
| Accepted design | 0 |
| Uncertain / needs human review | 1721 |

Precision metrics:

| metric | value | interpretation |
|---|---:|---|
| Rule FP rate | not reportable | denominator has no human-reviewed TP/FP/accepted-design records |
| Uncertain rate | 100% | all findings require human adjudication before precision claims |
| Controlled fixture precision | tracked separately | see `docs/real-repo-validation-record.md` |
| Real repo precision | not claimed | this document proves execution and artifact generation, not analyzer correctness |

## Reviewer Record

| field | value |
|---|---|
| reviewer | Codex automated run; human adjudication pending |
| run date | 2026-07-04 |
| criteria | scan/analyze/readiness exit code 0 or 1, schema validation pass, artifact retention |
| LLM mode | deterministic / no remote LLM review |

## Selection Criteria

Public repo candidates are selected to cover:

- 100-500 file backend/framework codebase for alpha validation.
- Library repository with TS/JS source and tests.
- Frontend or large repository for scale behavior.
- Stable public GitHub URL and fixed commit hash.
- No private code, credentials, or proprietary fixtures.

## Trend Tracking

| release | date | repos | commits recorded | execution status | real precision status |
|---|---|---:|---:|---|---|
| 1.5.0 local evidence | 2026-07-04 | 4 | 4 | pass | not reportable; 100% uncertain |

Beta acceptance still requires 5+ public repositories plus monorepo evidence.
v1.0 acceptance still requires 10+ public repositories plus large-repo evidence
and human precision adjudication.
