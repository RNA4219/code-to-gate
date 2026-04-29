# Demo GitHub Actions Fixture

This fixture is designed for testing GitHub Actions integration with code-to-gate.

## Purpose

Demonstrates patterns that code-to-gate should detect in a GitHub Actions workflow context:

- `CLIENT_TRUSTED_PRICE`: Accepting prices/amounts from client requests without server validation
- `WEAK_AUTH_GUARD`: Weak authorization checks (role-based without proper verification)
- `MISSING_SERVER_VALIDATION`: Missing input validation for critical fields
- `TRY_CATCH_SWALLOW`: Error handling that swallows exceptions without proper handling
- `UNSAFE_DELETE`: Delete operations without verification or audit logging
- `ENV_DIRECT_ACCESS`: Direct access to environment variables without validation

## Structure

```
demo-github-actions-ts/
├── src/
│   ├── index.ts              # Express API endpoints with security issues
│   ├── auth/
│   │   └── middleware.ts     # Authentication/authorization with weak guards
│   └── db/
│   ├── orders.ts             # Order persistence with CLIENT_TRUSTED_PRICE
│   └── payments.ts           # Payment processing with validation issues
├── tests/
│   └── orders.test.ts        # Unit tests
├── package.json
└── tsconfig.json
```

## Expected Findings

When code-to-gate analyzes this fixture, it should detect:

1. **CLIENT_TRUSTED_PRICE** (critical):
   - `src/index.ts:28` - Order creation accepts `total` from request body
   - `src/index.ts:70` - Payment processing accepts `amount` from request body
   - `src/db/orders.ts:32` - `createOrder` trusts caller-provided total

2. **WEAK_AUTH_GUARD** (high):
   - `src/auth/middleware.ts:23` - Token verification is basic, no signature check
   - `src/auth/middleware.ts:45` - Role check is string-based only
   - `src/auth/middleware.ts:63` - Token decoder stub is insecure

3. **MISSING_SERVER_VALIDATION** (high):
   - `src/index.ts:30` - No validation of item IDs, quantities, prices
   - `src/db/payments.ts:32` - No validation of payment details

4. **TRY_CATCH_SWALLOW** (medium):
   - `src/index.ts:38` - Error logged but not properly handled
   - `src/index.ts:59` - Error handling is insufficient

5. **UNSAFE_DELETE** (high):
   - `src/index.ts:53` - Delete without verification or audit
   - `src/db/orders.ts:62` - Delete without existence check

6. **ENV_DIRECT_ACCESS** (medium):
   - `src/auth/middleware.ts:75` - Direct env access without validation

## GitHub Actions Integration Testing

This fixture is used to test:

- PR comment generation with finding summaries
- GitHub Checks creation with annotations
- API client authentication (PAT and GitHub App)
- Comment update on re-run

## Usage

```bash
# Run tests
npm test

# Type check
npm run typecheck

# Lint (with ESLint)
npm run lint
```

## Notes

- This is a synthetic fixture for testing purposes
- No actual database connections or payment processing
- Patterns are intentionally insecure for detection testing