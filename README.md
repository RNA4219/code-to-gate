# code-to-gate

[![npm version](https://badge.fury.io/js/@quality-harness%2Fcode-to-gate.svg)](https://badge.fury.io/js/@quality-harness%2Fcode-to-gate)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A local-first quality harness that turns repository signals into evidence-backed quality risks, test seeds, and release-readiness gate inputs.

## Documentation

| Language | Document |
|----------|----------|
| 🇬🇧 English | [README_EN.md](README_EN.md) |
| 🇯🇵 日本語 | [README_JA.md](README_JA.md) |

## Quick Links

- [CLAUDE.md](CLAUDE.md) - Project context for Claude Code
- [CHANGELOG.md](CHANGELOG.md) - Version history
- [.claude/skills.md](.claude/skills.md) - Claude Code skills

## Install

```bash
npm install -g @quality-harness/code-to-gate
```

## Quick Start

```bash
code-to-gate scan ./my-repo --out .qh
code-to-gate analyze ./my-repo --emit all --out .qh
code-to-gate readiness ./my-repo --policy policy.yaml --out .qh
```

## License

MIT License. See [LICENSE](LICENSE).