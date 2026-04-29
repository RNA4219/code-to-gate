# code-to-gate Troubleshooting

This guide covers common issues, error messages, and solutions.

## Table of Contents

1. [Exit Code Reference](#exit-code-reference)
2. [Common Issues](#common-issues)
3. [LLM Provider Issues](#llm-provider-issues)
4. [Schema Validation Issues](#schema-validation-issues)
5. [Import Issues](#import-issues)
6. [Integration Export Issues](#integration-export-issues)
7. [Performance Issues](#performance-issues)
8. [Debugging Tips](#debugging-tips)

---

## Exit Code Reference

| Code | Name | Typical Cause |
|------|------|---------------|
| 0 | OK | Success |
| 1 | READINESS_NOT_CLEAR | Critical/high findings blocking release |
| 2 | USAGE_ERROR | Invalid arguments, missing paths |
| 3 | SCAN_FAILED | Parser failure, unsupported language |
| 4 | LLM_FAILED | API key invalid, model unavailable |
| 5 | POLICY_FAILED | Policy YAML syntax error |
| 7 | SCHEMA_FAILED | Artifact validation failed |
| 8 | IMPORT_FAILED | External tool file format error |
| 9 | INTEGRATION_EXPORT_FAILED | Missing required artifacts |
| 10 | INTERNAL_ERROR | Unexpected error (report bug) |

---

## Common Issues

### Exit Code 2: USAGE_ERROR

**Symptoms:**
```
unknown command: foo
repo does not exist: ./nonexistent
usage: code-to-gate scan <repo> --out <dir>
```

**Causes and Solutions:**

| Cause | Solution |
|-------|----------|
| Invalid command | Check available commands: `code-to-gate --help` |
| Missing required argument | Add required argument (e.g., `--out .qh`) |
| Path does not exist | Verify path exists: `ls ./my-repo` |
| Wrong path format | Use relative or absolute path correctly |

**Example Fix:**
```bash
# Wrong
code-to-gate scan

# Correct
code-to-gate scan ./my-repo --out .qh
```

---

### Exit Code 3: SCAN_FAILED

**Symptoms:**
```
SCAN_FAILED: parser encountered fatal error
SCAN_FAILED: unsupported language
```

**Causes and Solutions:**

| Cause | Solution |
|-------|----------|
| Unsupported language | Use `--lang ts,js` to limit to supported languages |
| Corrupted file | Check for binary files or encoding issues |
| Syntax error in source | Fix source file syntax errors |
| Permission denied | Check file permissions |

**Example Fix:**
```bash
# Limit to TypeScript
code-to-gate scan ./my-repo --out .qh --lang ts,tsx

# Exclude problematic files
code-to-gate scan ./my-repo --out .qh --ignore node_modules,dist,legacy
```

---

### Exit Code 1: READINESS_NOT_CLEAR / blocked_input

**Symptoms:**
```
{"status": "blocked_input", "summary": "1 critical finding(s) block release readiness"}
```

**Causes and Solutions:**

| Cause | Solution |
|-------|----------|
| Critical findings detected | Review `.qh/findings.json` and fix issues |
| Policy threshold exceeded | Adjust policy thresholds or fix findings |
| Auth/payment category findings | These categories often have zero tolerance |

**Example Fix:**
```bash
# View findings
cat .qh/findings.json | jq '.findings[] | select(.severity == "critical")'

# View recommended actions
cat .qh/release-readiness.json | jq '.recommendedActions'

# If finding is acceptable, update policy
# policies/strict.yaml
thresholds:
  severity:
    critical: 1  # Allow 1 critical
```

---

## LLM Provider Issues

### Exit Code 4: LLM_FAILED

**Symptoms:**
```
LLM_FAILED: connection refused
LLM_FAILED: API key invalid
LLM_FAILED: model not found
```

#### OpenAI Issues

| Issue | Solution |
|-------|----------|
| Invalid API key | Verify `OPENAI_API_KEY` environment variable |
| Rate limit exceeded | Wait and retry, or use smaller model |
| Model unavailable | Use valid model: `gpt-4`, `gpt-3.5-turbo` |

```bash
# Check API key
echo $OPENAI_API_KEY  # Linux/macOS
echo $env:OPENAI_API_KEY  # Windows PowerShell

# Set API key
export OPENAI_API_KEY="sk-..."  # Linux/macOS
$env:OPENAI_API_KEY = "sk-..."  # Windows PowerShell
```

#### Anthropic Issues

| Issue | Solution |
|-------|----------|
| Invalid API key | Verify `ANTHROPIC_API_KEY` |
| Model name wrong | Use: `claude-sonnet-4-6`, `claude-haiku-4-5` |

#### ollama Issues

| Issue | Solution |
|-------|----------|
| ollama not running | Start ollama: `ollama serve` |
| Model not pulled | Pull model: `ollama pull llama3` |
| Connection refused | Check port 11434 |

```bash
# Check ollama status
ollama list
curl http://localhost:11434/api/tags

# Start ollama
ollama serve
```

#### llama.cpp Issues

| Issue | Solution |
|-------|----------|
| Model file missing | Verify path to `.gguf` file |
| Server not running | Start llama.cpp server |

```bash
# Check model file
ls ./models/qwen3.gguf

# Start llama.cpp
./llama-server -m ./models/qwen3.gguf --port 8080
```

### LLM Without --require-llm

If LLM fails without `--require-llm`, deterministic artifacts are still generated:

```bash
# This succeeds even if LLM fails
code-to-gate analyze ./my-repo --emit all --out .qh

# Check audit for LLM status
cat .qh/audit.json | jq '.llm'
```

---

## Schema Validation Issues

### Exit Code 7: SCHEMA_FAILED

**Symptoms:**
```
$.findings[0]: missing required evidence
$.version: expected const ctg/v1alpha1
```

**Causes and Solutions:**

| Cause | Solution |
|-------|----------|
| Missing required field | Check artifact schema for required fields |
| Wrong version | Ensure `version: ctg/v1alpha1` |
| Invalid enum value | Check valid values in schema |
| Additional properties | Remove unexpected fields if `additionalProperties: false` |

**Example Fix:**
```bash
# Validate artifact
code-to-gate schema validate .qh/findings.json

# Check schema
cat schemas/findings.schema.json | jq '.required'

# Check artifact
cat .qh/findings.json | jq '.version'
# Should be: "ctg/v1alpha1"
```

---

## Import Issues

### Exit Code 8: IMPORT_FAILED

**Symptoms:**
```
IMPORT_FAILED: failed to parse JSON
IMPORT_FAILED: unsupported tool format
```

**Semgrep Import Issues**

| Issue | Solution |
|-------|----------|
| Wrong output format | Use `semgrep --json` |
| Missing `results` array | Ensure Semgrep output has `results` field |

```bash
# Correct Semgrep output
semgrep --config auto --json ./my-repo > semgrep-output.json
code-to-gate import semgrep ./semgrep-output.json --out .qh/imports
```

**ESLint Import Issues**

| Issue | Solution |
|-------|----------|
| Wrong formatter | Use JSON formatter |
| Missing file path | Ensure results include file paths |

```bash
# Correct ESLint output
eslint ./src --format json > eslint-output.json
code-to-gate import eslint ./eslint-output.json --out .qh/imports
```

**Coverage Import Issues**

| Issue | Solution |
|-------|----------|
| Wrong format | Use Istanbul/nyc coverage-summary.json |
| Missing coverage data | Run coverage first |

```bash
# Generate coverage summary
nyc --reporter=json-summary npm test
code-to-gate import coverage ./coverage/coverage-summary.json --out .qh/imports
```

---

## Integration Export Issues

### Exit Code 9: INTEGRATION_EXPORT_FAILED

**Symptoms:**
```
INTEGRATION_EXPORT_FAILED: missing findings.json
INTEGRATION_EXPORT_FAILED: unknown export target
```

**Causes and Solutions:**

| Cause | Solution |
|-------|----------|
| Missing artifact | Run `analyze` before `export` |
| Invalid target | Use valid target: `gatefield`, `state-gate`, `manual-bb`, `workflow-evidence` |
| Wrong from directory | Verify `.qh/` contains artifacts |

**Example Fix:**
```bash
# Run analyze first
code-to-gate analyze ./my-repo --out .qh

# Then export
code-to-gate export gatefield --from .qh --out .qh/gatefield-static-result.json

# Verify artifacts exist
ls .qh/*.json
```

---

## Performance Issues

### Scan Takes Too Long

| Cause | Solution |
|-------|----------|
| Large repository | Use `--ignore` to exclude large directories |
| Too many files | Limit languages with `--lang` |
| Binary files | Exclude non-source directories |

```bash
# Exclude unnecessary directories
code-to-gate scan ./large-repo --out .qh \
  --ignore node_modules,dist,coverage,.git,docs,assets

# Limit to specific language
code-to-gate scan ./large-repo --out .qh --lang ts
```

### Memory Issues

| Cause | Solution |
|-------|----------|
| Very large repo | Process in chunks |
| Many symbols | Increase Node.js memory limit |

```bash
# Increase Node.js memory
NODE_OPTIONS="--max-old-space-size=4096" code-to-gate analyze ./large-repo --out .qh
```

---

## Debugging Tips

### Check Audit Trail

The audit.json file contains run metadata:

```bash
cat .qh/audit.json | jq '.'

# Check version
cat .qh/audit.json | jq '.tool.version'

# Check exit status
cat .qh/audit.json | jq '.exit'

# Check inputs
cat .qh/audit.json | jq '.inputs | length'
```

### Validate All Artifacts

```bash
# Validate all artifacts
for f in .qh/*.json; do
  code-to-gate schema validate "$f"
done
```

### Check unsupported_claims

If LLM generated content without evidence:

```bash
cat .qh/findings.json | jq '.unsupported_claims'
```

Items in `unsupported_claims` indicate LLM content that failed evidence binding.

### Check Diagnostics

The repo-graph.json contains parser diagnostics:

```bash
cat .qh/repo-graph.json | jq '.diagnostics'

# Check for parser failures
cat .qh/repo-graph.json | jq '.diagnostics[] | select(.status == "PARSER_FAILED")'
```

### Redaction Warnings

If secrets-like strings are detected:

```bash
cat .qh/audit.json | jq '.llm.redaction_enabled'
```

Ensure sensitive files are excluded:

```bash
code-to-gate scan ./my-repo --out .qh --ignore .env,secrets,credentials
```

---

## Getting Help

1. Check this troubleshooting guide
2. Review [cli-reference.md](cli-reference.md) for correct usage
3. Check [RUNBOOK.md](../RUNBOOK.md) for operational procedures
4. Open an issue on GitHub with:
   - Command that failed
   - Full error output
   - Node.js version (`node --version`)
   - code-to-gate version (`code-to-gate --version`)
   - Relevant artifact contents (sanitized)