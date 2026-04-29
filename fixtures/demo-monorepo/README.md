# Demo Monorepo

A sample monorepo structure for testing package boundary detection and cross-package imports.

## Structure

```
demo-monorepo/
├── package.json          # Root package with workspaces
├── packages/
│   ├── core/            # Shared business logic
│   ├── api/             # REST API server
│   └── web/             # Frontend utilities
└── shared/               # Common utilities
```

## Package Boundaries

- **@demo/monorepo-core**: Core business logic (User, Product services)
- **@demo/monorepo-api**: REST API using Express
- **@demo/monorepo-web**: Frontend utilities
- **@demo/monorepo-shared**: Common utilities (Logger, Result types)

## Cross-Package Imports

- `core` imports from `shared`
- `api` imports from `core` and `shared`
- `web` imports from `core` and `shared`

## Testing Scenarios

This fixture tests:
1. Workspace detection via root package.json
2. Package boundary identification
3. Cross-package import analysis
4. Dependency graph construction