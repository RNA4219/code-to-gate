# Acceptance Evidence Index

**Status**: active  
**Owner**: code-to-gate maintainers  
**Last reviewed**: 2026-07-04  

This index maps release criteria to the command, artifact, commit, and reviewer evidence required before a public release.

| Criterion | Command | Required artifact | Commit / run evidence | Reviewer |
|---|---|---|---|---|
| TypeScript build passes | `npm run build` | terminal log / CI job | release workflow run id | maintainer |
| Unit and integration smoke passes | `npm run test:smoke` | CI test log | release workflow run id | maintainer |
| Coverage gate passes | `npm run test:coverage` | `coverage/coverage-summary.json` | release workflow artifact | maintainer |
| Package smoke passes | `npm run test:package` | package smoke log | release workflow run id | maintainer |
| Architecture tests pass | `npm run test:architecture` | architecture test log | release workflow run id | maintainer |
| Self-analysis artifacts generated | `node ./dist/cli.js analyze . --policy .github/ctg-policy.yaml --emit all --out .qh --llm-provider deterministic` | `.qh/findings.json`, `.qh/audit.json`, `.qh/self-analysis-debt.json` | release workflow artifact | maintainer |
| Release readiness evaluated | `node ./dist/cli.js readiness . --policy .github/ctg-policy.yaml --from .qh --out .qh` | `.qh/release-readiness.json` | release workflow artifact | maintainer |
| Schema validation passes | `node ./dist/cli.js schema validate-all .qh --strict` | schema validation log | release workflow run id | maintainer |
| SARIF export/upload verified | `node ./dist/cli.js export sarif --from .qh --out .qh/results.sarif` | `.qh/results.sarif`, Code Scanning upload | release workflow artifact | maintainer |
| QEG evidence input generated | `node ./dist/cli.js export qeg-code-to-gate --from .qh --out .qh/qeg-code-to-gate.json` | `.qh/qeg-code-to-gate.json` | PR/release/reusable workflow artifact | maintainer; final verdict owned by QEG |
| QEG evidence schema valid | `node ./dist/cli.js schema validate .qh/qeg-code-to-gate.json` | schema validation log | PR/release/reusable workflow run id | maintainer |
| Package integrity recorded | `npm run package:integrity` | `.qh/package/package-integrity.json` | release workflow artifact | maintainer |
| Real repo execution evidence | `.\scripts\real-repo-test.ps1 -Repo all -Phase phase1` | `.qh/acceptance/real-repo/`, `docs/real-repo-validation-evidence-20260704.md` | repo commit hashes in evidence doc | maintainer + human reviewer for precision |
| Real repo precision evidence | human TP/FP/Uncertain adjudication | reviewed classification table | reviewer/date per repo | human reviewer |
| Suppression debt visible | release workflow `Summarize suppression debt` step | GitHub Step Summary | release workflow run id | maintainer |
| Expired suppressions blocked | release workflow `Summarize suppression debt` step | failed gate when expired count > 0 | release workflow run id | maintainer |
| Distribution status reviewed | manual doc review | `docs/distribution-status.md` | release PR commit | maintainer |
| Public docs claims reviewed | manual doc review | README / quickstart / CLI reference diff | release PR commit | maintainer |

Evidence retention: release workflow artifacts are retained for 90 days. Long-lived evidence belongs in `docs/completion-record.md`, `docs/distribution-status.md`, and release notes.
