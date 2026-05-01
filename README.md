# code-to-gate

[![npm version](https://badge.fury.io/js/@quality-harness%2Fcode-to-gate.svg)](https://badge.fury.io/js/@quality-harness/code-to-gate)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A local-first quality harness that turns repository signals into evidence-backed quality risks, test seeds, and release-readiness gate inputs.

## Status

**P0 Complete** - All core quality gates verified:
- ✓ CI/release procedure connected
- ✓ Policy evaluator unified (audit exit matches readiness)
- ✓ 3 real repos verified (express/axios/dayjs)
- ✓ FP rate <= 15% (express 0% FP)

## Documentation

| Language | Document |
|----------|----------|
| 🇬🇧 English | [README_EN.md](README_EN.md) |
| 🇯🇵 日本語 | [README_JA.md](README_JA.md) |

## Install

```bash
npm install -g @quality-harness/code-to-gate
```

## Quick Start

```bash
# Scan repository
code-to-gate scan ./my-repo --out .qh

# Analyze quality
code-to-gate analyze ./my-repo --emit all --out .qh

# Evaluate release readiness
code-to-gate readiness ./my-repo --policy policy.yaml --out .qh
```

## Built-in Rules

| Rule | Category |
|------|----------|
| CLIENT_TRUSTED_PRICE | payment |
| WEAK_AUTH_GUARD | auth |
| MISSING_SERVER_VALIDATION | validation |
| UNTESTED_CRITICAL_PATH | testing |
| TRY_CATCH_SWALLOW | maintainability |
| RAW_SQL | security |
| ENV_DIRECT_ACCESS | security |
| UNSAFE_DELETE | maintainability |
| LARGE_MODULE | maintainability |

## License

MIT License. See [LICENSE](LICENSE).