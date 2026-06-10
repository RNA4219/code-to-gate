# Dependency Boundaries

- CLIはcomposition rootとしてNodeサービスとparser adapterを配線する。
- parser adapterはinfrastructureであり、coreは`ParserRegistry`契約だけに依存する。
- coreとrulesは正規化済みの内部signalを処理し、具体的なparser実装を参照しない。
- `repo-graph-builder`の旧Phase 4 Deferred例外は解消済みである。

境界はESLintの`no-restricted-imports`と`test:architecture`で検証する。
