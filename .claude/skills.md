# code-to-gate Skills

## /analyze-self

Run code-to-gate analysis on the current project itself.

**Usage**: `/analyze-self`

**What it does**:
- Scans the code-to-gate source code
- Runs full quality analysis
- Generates findings.json with detected issues
- Creates risk-register.yaml and analysis-report.md

**Output**: `.qh-review/` directory with all artifacts

**Example**:
```
> /analyze-self
Analyzing code-to-gate source...
101 findings detected (18 critical, 24 high, 59 medium)
Output: .qh-review/findings.json
```

---

## /check-release

Run release readiness check for the current project.

**Usage**: `/check-release [--policy <path>]`

**What it does**:
- Builds the project
- Runs smoke tests
- Analyzes with strict policy
- Evaluates release readiness
- Reports Go/No-Go status

**Default policy**: `fixtures/policies/strict.yaml`

**Example**:
```
> /check-release
Build: OK
Smoke tests: 53 passed
Analysis: 16 findings (10 critical)
Readiness: blocked_input
Result: No-Go - Address critical findings before release
```

---

## /add-rule

Guide for adding a new detection rule.

**Usage**: `/add-rule <rule-name>`

**What it does**:
- Creates rule file template
- Adds rule to registry
- Creates test file template
- Provides implementation guidance

**Example**:
```
> /add-rule missing-error-logging
Created: src/rules/missing-error-logging.ts
Created: src/rules/__tests__/missing-error-logging.test.ts
Added to registry: src/rules/index.ts
Next: Implement detect() function with AST pattern matching
```

---

## /run-smoke

Quick smoke test execution.

**Usage**: `/run-smoke`

**What it does**:
- Runs smoke tests only (fast)
- Reports pass/fail status
- Shows any failures

**Example**:
```
> /run-smoke
Smoke tests: 3 files, 53 tests passed
Duration: 7.07s
```

---

## /validate-schema

Validate generated artifacts against JSON schemas.

**Usage**: `/validate-schema <artifact-path>`

**What it does**:
- Loads artifact JSON
- Validates against corresponding schema
- Reports validation errors

**Example**:
```
> /validate-schema .qh/findings.json
Schema: schemas/findings.schema.json
Validation: PASSED
```

---

## /policy-check

Check policy configuration and show parsed values.

**Usage**: `/policy-check <policy-path>`

**What it does**:
- Parses policy YAML
- Shows blocking conditions
- Shows readiness settings
- Validates policy structure

**Example**:
```
> /policy-check fixtures/policies/strict.yaml
Policy: strict
Blocking severities: critical
Blocking categories: payment
Blocking rules: CLIENT_TRUSTED_PRICE, WEAK_AUTH_GUARD
Readiness: criticalFindingStatus=blocked_input
```

---

## /export-sarif

Export findings to SARIF format for GitHub Code Scanning.

**Usage**: `/export-sarif [--from <dir>] [--out <file>]`

**What it does**:
- Loads findings.json
- Converts to SARIF v2.1.0
- Writes output file

**Example**:
```
> /export-sarif --from .qh --out results.sarif
Exported: results.sarif (16 findings)
Ready for github/codeql-action/upload-sarif@v4
```

---

## /fix-yaml-parser

Debug and fix YAML parsing issues in policy-loader.

**Usage**: `/fix-yaml-parser <yaml-file>`

**What it does**:
- Parses YAML file with current parser
- Shows parsed values vs expected
- Identifies parsing bugs
- Suggests fixes

**Example**:
```
> /fix-yaml-parser fixtures/policies/strict.yaml
Parsed blocking.categories: [] (expected: ["payment"])
Issue: Section transition not handled
Fix: Add check for blocking_* → blocking reset
```

---

## /test-readiness

Test readiness command with custom findings.

**Usage**: `/test-readiness <findings-count> <severity>`

**What it does**:
- Creates test findings artifact
- Runs readiness evaluation
- Shows status and failed conditions

**Example**:
```
> /test-readiness 5 critical
Created: 5 critical findings
Readiness status: blocked_input
Failed conditions: BLOCKING_SEVERITY_CRITICAL (5 findings)
```