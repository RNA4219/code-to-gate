# Security Gate

`.github/workflows/security-gate.yml` runs on pull requests, pushes to
`main`, and manual dispatch. The job has only `contents: read` permission.

## Blocking checks

- Semgrep 1.164.0 from an OCI digest-pinned image, with local rules and no
  container network
- Gitleaks 8.30.1 from the official release archive, verified by both the
  locked archive SHA-256 and the locked official checksum-file SHA-256
- `npm audit --audit-level=high`
- CycloneDX SBOM generation and structural validation
- Golden regression fixtures that must be detected by both Semgrep and
  Gitleaks

The workflow uploads JSON reports, exit-code evidence, the SBOM, golden
reports, and `security/toolchain-lock.json` for 90 days. Scanner findings,
audit vulnerabilities, missing reports, checksum failures, or golden misses
fail the final gate.

## Updating tools

1. Review the upstream immutable release and its checksum or OCI digest.
2. Update `security/toolchain-lock.json`.
3. Run `npm run security:toolchain:verify`.
4. Review the security workflow contract test.
5. Do not replace a digest with a mutable tag or remove archive verification.

The lock validator intentionally accepts only the official Semgrep Docker Hub
endpoint and official Gitleaks GitHub release URLs.

## Local verification

```bash
npm run security:toolchain:verify
npm run audit:deps
npm run typecheck
npm run test:smoke
npx vitest run src/__tests__/contract/security-toolchain.test.ts
```

The complete Semgrep/Gitleaks golden run requires a Linux Docker environment
and is executed by the security workflow. Configure the repository branch
protection rule to require the `security-gate` job before merge.
