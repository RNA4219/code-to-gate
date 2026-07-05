# code-to-gate Feature Enhancement Specifications - Master Index

**Version**: v1.0
**Created**: 2026-05-04
**Status**: active index; individual specs may remain draft/partial/done
**Total Specs**: 29
**Purpose**: Comprehensive specification documents for all feature enhancement items

---

## Overview

This document serves as the master index for all code-to-gate feature enhancement specifications. Each specification follows a standardized template and is designed for acceptance review.

## Status Recheck (2026-07-04)

The original `draft` marker in SPEC-01 through SPEC-28 is retained inside
individual spec files until each document is fully rewritten. The implementation
status below is the current routing table for planning and public claims.

| Spec range | Current implementation status | Evidence / boundary |
|---|---|---|
| SPEC-01, SPEC-04 | partial | lint/coverage gates exist, but full coverage gate is not green in current local evidence |
| SPEC-02 | partial | tree-sitter adapters and fallback paths exist; WASM compatibility remains environment-dependent |
| SPEC-03, SPEC-09, SPEC-10, SPEC-12 | implemented core baseline | rule implementations and tests exist for new rule families |
| SPEC-05 | implemented | PR annotations, Checks, SARIF responsibilities documented and wired in workflows |
| SPEC-06, SPEC-07, SPEC-08 | partial / guarded | LLM trust, prompt trace, schema invalid isolation exist; auto-tuning/calibration claims require real repo evidence |
| SPEC-11, SPEC-13, SPEC-14, SPEC-15, SPEC-16, SPEC-17 | future / draft | not part of current public release surface |
| SPEC-18, SPEC-20 | implemented local baseline | large-repo/local streaming evidence exists; remote distributed runtime and explicit heap CLI remain future scope |
| SPEC-19 | implemented baseline | baseline/historical comparison exists |
| SPEC-21, SPEC-23 | implemented static viewer baseline | filters, timeline diff, and large-artifact cap are implemented in static HTML viewer |
| SPEC-22 | future / draft | VS Code extension is not implemented |
| SPEC-24 | implemented dataflow-lite baseline | full proof-grade cross-file taint remains future scope |
| SPEC-25 | partial | generic/framework patterns exist; framework-specific precision requires more real repo evidence |
| SPEC-26 | partial | policy severity thresholds exist; per-rule custom severity tuning remains future scope |
| SPEC-27, SPEC-28 | partial | regex fallback baseline exists; full tree-sitter Java/C++ adapters remain future scope |
| SPEC-29 | done | `docs/acceptance/QA-SPEC-29-20260614.md`, `docs/acceptance/AC-20260611-01.md` |

---

## Specification Categories

### A. Code Quality & Fixes (5 specs)

| Spec ID | Title | Priority | Est. Time | Status |
|---|---|:---:|:---:|:---:|
| [SPEC-01](SPEC-01-eslint-warnings.md) | ESLint Warnings Fix | P1 | 15 min | draft |
| [SPEC-02](SPEC-02-tree-sitter-wasm.md) | tree-sitter WASM Compatibility | P2 | 30 min | draft |
| [SPEC-03](SPEC-03-new-rules.md) | New Detection Rules | P1 | 60 min | draft |
| [SPEC-04](SPEC-04-coverage-80.md) | Coverage 80% Achievement | P1 | 45 min | draft |
| [SPEC-05](SPEC-05-pr-annotations.md) | GitHub PR Annotations | P2 | 30 min | draft |

### B. AI/LLM Enhancement (3 specs)

| Spec ID | Title | Priority | Est. Time | Status |
|---|---|:---:|:---:|:---:|
| [SPEC-06](SPEC-06-llm-auto-tuning.md) | LLM Auto-tuning | P2 | 1 week | draft |
| [SPEC-07](SPEC-07-prompt-template.md) | Prompt Template Library | P2 | 3 days | draft |
| [SPEC-08](SPEC-08-confidence-calibration.md) | LLM Confidence Calibration | P2 | 2 days | draft |

### C. New Detection Rules (5 specs)

| Spec ID | Title | Priority | Est. Time | Status |
|---|---|:---:|:---:|:---:|
| [SPEC-09](SPEC-09-deprecated-api.md) | DEPRECATED_API_USAGE Rule | P1 | 2 hours | draft |
| [SPEC-10](SPEC-10-circular-dependency.md) | CIRCULAR_DEPENDENCY Rule | P1 | 2 hours | draft |
| [SPEC-11](SPEC-11-error-handling.md) | INCONSISTENT_ERROR_HANDLING Rule | P2 | 2 hours | draft |
| [SPEC-12](SPEC-12-input-sanitization.md) | MISSING_INPUT_SANITIZATION Rule | P1 | 2 hours | draft |
| [SPEC-13](SPEC-13-internal-endpoint.md) | EXPOSED_INTERNAL_ENDPOINT Rule | P2 | 2 hours | draft |

### D. CI/CD Integration (4 specs)

| Spec ID | Title | Priority | Est. Time | Status |
|---|---|:---:|:---:|:---:|
| [SPEC-14](SPEC-14-gitlab-ci.md) | GitLab CI Support | P3 | 1 week | draft |
| [SPEC-15](SPEC-15-azure-devops.md) | Azure DevOps Integration | P3 | 1 week | draft |
| [SPEC-16](SPEC-16-slack-teams.md) | Slack/Teams Notification | P2 | 3 days | draft |
| [SPEC-17](SPEC-17-auto-suppression.md) | Auto-suppression Suggestion | P2 | 3 days | draft |

### E. Performance Optimization (3 specs)

| Spec ID | Title | Priority | Est. Time | Status |
|---|---|:---:|:---:|:---:|
| [SPEC-18](SPEC-18-distributed-scan.md) | Distributed Scan | P3 | 2 weeks | draft |
| [SPEC-19](SPEC-19-incremental-rule.md) | Incremental Rule Evaluation | P2 | 1 week | draft |
| [SPEC-20](SPEC-20-memory-optimized.md) | Memory-optimized Mode | P2 | 3 days | draft |

### F. UX/Visualization (3 specs)

| Spec ID | Title | Priority | Est. Time | Status |
|---|---|:---:|:---:|:---:|
| [SPEC-21](SPEC-21-interactive-viewer.md) | Interactive HTML Viewer | P2 | 1 week | draft |
| [SPEC-22](SPEC-22-vscode-extension.md) | VS Code Extension | P2 | 2 weeks | draft |
| [SPEC-23](SPEC-23-timeline-view.md) | Finding Timeline View | P3 | 3 days | draft |

### G. Analysis Enhancement (3 specs)

| Spec ID | Title | Priority | Est. Time | Status |
|---|---|:---:|:---:|:---:|
| [SPEC-24](SPEC-24-cross-file-dataflow.md) | Cross-file Dataflow | P2 | 1 week | draft |
| [SPEC-25](SPEC-25-framework-patterns.md) | Framework-specific Patterns | P2 | 3 days | draft |
| [SPEC-26](SPEC-26-custom-severity.md) | Custom Severity Tuning | P3 | 2 days | draft |

### H. Language Support (2 specs)

| Spec ID | Title | Priority | Est. Time | Status |
|---|---|:---:|:---:|:---:|
| [SPEC-27](SPEC-27-java-adapter.md) | Java tree-sitter Adapter | P3 | 2 weeks | draft |
| [SPEC-28](SPEC-28-cpp-adapter.md) | C/C++ tree-sitter Adapter | P3 | 2 weeks | draft |

### I. Database & Data Analysis (1 spec)

| Spec ID | Title | Priority | Est. Time | Status |
|---|---|:---:|:---:|:---:|
| [SPEC-29](SPEC-29-sql-database-analysis.md) | SQL・データベース変更リスク解析 | P1 | 2026-06-11 | done |

---

## Summary Statistics

| Metric | Value |
|---|:---:|
| Total Specifications | 29 |
| P1 (High Priority) | 8 |
| P2 (Medium Priority) | 14 |
| P3 (Low Priority) | 7 |
| Estimated Total Time | ~8 weeks; SPEC-29 completed |

---

## Priority Definitions

| Priority | Definition | Implementation Timeline |
|---|---|---|
| P1 | Critical - Blocking or high-impact | Within 1 week |
| P2 | Important - Significant enhancement | Within 2-4 weeks |
| P3 | Optional - Nice-to-have | Within 1-2 months |

---

## Acceptance Review Process

### Automated Validation
- Structure Check: All 10 required sections present

### Quarterly Draft Review

All `draft` specs are reviewed quarterly. Review output must record:

| Field | Required value |
|---|---|
| review_date | YYYY-MM-DD |
| reviewed_specs | SPEC IDs reviewed |
| decision | keep draft / promote / defer / close |
| evidence | implementation link, acceptance artifact, or reason for defer |
| reviewer | maintainer handle |

Quarterly review should prioritize stale P1/P2 drafts and specs whose implementation has already landed, then update this master index and `docs/completion-record.md` when status changes.
- Link Check: Cross-references valid
- Consistency Check: No conflicting requirements
- Estimate Check: Time estimates reasonable

### Manual Review
- Technical Accuracy Review
- Feasibility Confirmation
- Integration Alignment

### Final Deliverable
- [ACCEPTANCE-REPORT.md](ACCEPTANCE-REPORT.md) - GO/NO-GO verdict

---

## Related Documents

| Document | Path | Purpose |
|---|---|---|
| Product Roadmap | `docs/product-roadmap.md` | Overall development plan |
| Product Gap Analysis | `docs/product-gap-analysis.md` | Current gaps and needs |
| Further Improvements | `docs/further-improvements-spec.md` | Initial improvement spec |
| Product Requirements | `docs/product-requirements-v1.md` | Product-level requirements |

---

## Change Log

| Date | Version | Change |
|---|---|---|
| 2026-05-04 | v1.0 | Initial creation with 28 specs |
| 2026-06-10 | v1.1 | Added SPEC-29 SQL・データベース変更リスク解析 |
