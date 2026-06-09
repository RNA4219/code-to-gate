---
task_id: 20260608-14
intent_id: INT-ASSURANCE-SMELL-DETECTOR-001
owner: code-to-gate-team
status: done
last_reviewed_at: 2026-06-09
---
# Task Seed: Diff CLI Integration

`assurance inspect`へ任意の`--base/--head` diff inspectionを配線する。

## 完了条件
- [x] 両optionの同時指定を要求
- [x] CLIがGit adapterをcompositionする
- [x] artifact-only既定挙動を維持
