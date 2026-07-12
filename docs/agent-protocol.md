# Agent protocol

`code-to-gate agent` is the machine-readable execution surface. It does not prompt, emits one JSON response on stdout, and stores a run manifest under `.qh/runs/<run-id>/`.

## Discovery

```bash
code-to-gate agent capabilities --profile compact
code-to-gate agent capabilities --profile full
```

The response contains supported protocol versions, typed operations, limits, availability, and schema digests. The full profile includes the JSON Schemas.

## Run

```json
{
  "schema": "ctg-agent-request@v1",
  "request_id": "build-2026-07-12",
  "accept": {
    "protocols": ["ctg-agent/1.0"],
    "schema_majors": {"ctg-run-manifest@v1": [1]}
  },
  "action": "doctor",
  "input": {"out": ".qh"},
  "execution": {
    "timeout_ms": 300000,
    "retry": {"max_attempts": 2, "backoff_ms": 500},
    "partial": "allow"
  }
}
```

```bash
code-to-gate agent run --request request.json
code-to-gate agent status --run <run-id>
code-to-gate agent resume --request resume.json
```

A repeated request with the same fingerprint returns `status: "reused"`. Reusing a `request_id` with different input fails with `RESUME_CONFLICT` (15).

## Query

```json
{
  "schema": "ctg-agent-query@v1",
  "request_id": "summary-1",
  "run_id": "<run-id>",
  "view": "summary",
  "limit": 20,
  "max_bytes": 8192
}
```

Views are `summary`, `actions`, `artifacts`, `evidence`, and `diagnostics`. Artifact responses use references and digests by default; full content is never returned implicitly.

## Exit codes

The response always contains both `exit.code` and `exit.reason_code`. Agent-specific codes are:

- `12 PARTIAL_SUCCESS`
- `13 EXECUTION_TIMEOUT`
- `14 RETRY_EXHAUSTED`
- `15 RESUME_CONFLICT`
- `16 PROTOCOL_UNSUPPORTED`
- `17 RUN_BUSY`
- `18 EXECUTION_CANCELLED`
## Deterministic CI

PR CIはNode/npmを固定し、Ubuntu・Windows・macOSで同じcompact capability projectionを生成します。各runnerの`capabilities_digest_sha256`が一致しない場合は`status-check`が失敗します。workflowの外部Actionは40桁のcommit SHAで固定されています。
## Timeout and retry boundary

Action executorはshellを介さない子プロセスとして起動されます。timeout時はWindowsでは`taskkill /T /F`、POSIXではプロセスグループへのTERM後KILLを実行し、closeを待ってからmanifestを確定します。retryは前attemptの終了後にのみ開始されます。