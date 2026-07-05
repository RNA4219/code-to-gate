# code-to-gate fixtures

These fixtures are synthetic repositories for the v0.1 acceptance flow.

## Fixtures

- `demo-shop-ts`: checkout/order risks, including client-trusted price and weak request validation.
- `demo-auth-js`: mixed public/protected/admin routes with weak admin authorization and swallowed audit errors.
- `demo-ci-imports`: external ESLint, Semgrep, TypeScript diagnostic, and coverage outputs for import normalization.
- `demo-github-actions-ts`: GitHub Actions integration testing fixture with PR comment and Checks patterns.
- `demo-multilang`: multi-language fixture for Go / Rust / Java / PHP / C# / C++ adapter coverage.

All examples are intentionally small and artificial. They must not include private source code, private analysis output, or company-specific rules.

## Fixture Classes

Fixtures are used in two distinct ways:

- Precision fixtures: controlled examples for measuring TP/FP/Uncertain behavior. Results must be recorded as fixture precision, not real repository precision.
- Regression fixtures: minimal examples that lock a previously fixed detector behavior in CI.

When adding a rule fixture, name the test or evaluation record so it is clear whether it is precision evidence or regression evidence. Do not use a seeded vulnerable fixture as proof that false positives are controlled unless it also contains an accepted-design negative case.
