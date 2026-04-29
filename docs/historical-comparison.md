# Historical Comparison

The historical comparison feature enables tracking of quality metrics across multiple runs of code-to-gate, helping teams understand how their code quality evolves over time and detect regressions early.

## Overview

Historical comparison provides:

- **Finding Comparison**: Identify new, resolved, unchanged, and modified findings between runs
- **Regression Detection**: Automatically detect findings that were resolved but reappeared
- **Risk Trend Analysis**: Track how risk scores and severity distributions change over time
- **Readiness Comparison**: Compare release readiness status between runs

## CLI Usage

### Basic Comparison

Compare findings between two runs:

```bash
code-to-gate historical --current .qh --previous .qh-prev
```

### Output to File

Save comparison report to a specific file:

```bash
code-to-gate historical --current run-2024-01-15 --previous baseline --out comparison.json
```

### With Trend History

Include historical trend analysis from multiple previous runs:

```bash
code-to-gate historical --current .qh --previous .qh-prev --history ./runs-history
```

## CLI Options

| Option | Description | Required |
|--------|-------------|----------|
| `--current <dir>` | Current run artifact directory | Yes |
| `--previous <dir>` | Previous run artifact directory | Yes |
| `--out <file>` | Output file for comparison report | No (default: current-dir/historical-comparison.json) |
| `--history <dir>` | Directory containing historical runs for trend analysis | No |

## Output Artifact

The historical comparison generates a `historical-comparison.json` artifact with the following structure:

```json
{
  "version": "ctg/v1alpha1",
  "generated_at": "2024-01-15T10:30:00Z",
  "run_id": "historical-20240115103000",
  "artifact": "historical-comparison",
  "schema": "historical-comparison@v1",
  "currentRun": {
    "run_id": "ctg-20240115100000",
    "generated_at": "2024-01-15T10:00:00Z",
    "artifact_dir": "./.qh"
  },
  "previousRun": {
    "run_id": "ctg-20240114100000",
    "generated_at": "2024-01-14T10:00:00Z",
    "artifact_dir": "./.qh-prev"
  },
  "findingsComparison": {
    "new": [],
    "resolved": [],
    "unchanged": [],
    "modified": [],
    "regressions": [],
    "summary": {
      "totalCurrent": 10,
      "totalPrevious": 12,
      "newCount": 2,
      "resolvedCount": 4,
      "unchangedCount": 8,
      "modifiedCount": 0,
      "regressionCount": 0,
      "bySeverity": {
        "critical": { "new": 0, "resolved": 1, "unchanged": 0 },
        "high": { "new": 1, "resolved": 2, "unchanged": 3 },
        "medium": { "new": 1, "resolved": 1, "unchanged": 3 },
        "low": { "new": 0, "resolved": 0, "unchanged": 2 }
      },
      "byCategory": {
        "security": { "new": 1, "resolved": 2, "unchanged": 3 },
        "auth": { "new": 0, "resolved": 1, "unchanged": 1 },
        "maintainability": { "new": 1, "resolved": 1, "unchanged": 4 }
      }
    }
  },
  "riskTrends": {
    "trendDirection": "improving",
    "trendScore": 0.25,
    "criticalTrend": "decreasing",
    "highTrend": "decreasing",
    "riskScoreChange": -15
  },
  "recommendations": [
    "Quality trend is improving. Continue monitoring quality metrics."
  ]
}
```

## Finding Comparison

### Status Types

Each finding is classified with one of these statuses:

| Status | Description |
|--------|-------------|
| `new` | Finding exists in current run but not in previous |
| `resolved` | Finding existed in previous but not in current |
| `unchanged` | Finding exists in both runs with same attributes |
| `modified` | Finding exists in both but attributes changed (severity, confidence) |

### Matching Strategy

Findings are matched between runs using:

1. **ruleId + path**: Primary matching - same rule triggered on same file path
2. **ruleId + symbol**: Secondary matching - same rule triggered on same symbol
3. **Fuzzy match**: Title/category similarity for unmatched findings

## Regression Detection

### What is a Regression?

A regression is detected when:

1. A finding with the same `ruleId` on the same `path` was previously resolved but appears again
2. An unchanged finding's severity increased (e.g., medium -> high)
3. A finding matches specific regression rules configured by the team

### Severity Threshold

By default, regressions are only flagged for `medium` severity and above. This can be configured:

```typescript
const regressionConfig = {
  detectRegressions: true,
  severityThreshold: "high",  // Only high/critical count as regressions
  regressionRules: ["CRITICAL_SECURITY_RULE"],
  pathMatchRequired: true,
  allowResolvedThenReintroduced: true
};
```

### Regression Risk Score

Regressions are weighted more heavily than new findings:

| Severity | Regression Weight | New Finding Weight |
|----------|------------------|-------------------|
| critical | 20 | 10 |
| high | 10 | 5 |
| medium | 5 | 2 |
| low | 2 | 1 |

## Trend Analysis

### Trend Direction

The trend direction is calculated based on the ratio of resolved to new findings:

| Direction | Condition |
|-----------|-----------|
| `improving` | More findings resolved than added (trendScore > 0.1) |
| `degrading` | More findings added than resolved (trendScore < -0.1) |
| `stable` | Similar counts of new and resolved |

### Trend Score

The trend score ranges from -1 to 1:

- **Positive values**: Quality improving
- **Negative values**: Quality degrading
- **Near zero**: Quality stable

Critical and high severity findings are weighted more heavily in the trend calculation.

## Baseline Management

### Setting a Baseline

Establish a quality baseline from a known good run:

```typescript
import { initializeBaseline, saveBaselineFindings } from "@quality-harness/code-to-gate/historical";

// Initialize baseline from a run
const baselineDir = ".qh-baseline";
initializeBaseline(baselineDir, {
  run_id: "ctg-20240101-good-run",
  generated_at: "2024-01-01T10:00:00Z",
  artifact_dir: "./.qh"
});

// Save baseline artifacts
saveBaselineFindings(baselineDir, currentFindings);
```

### Comparing Against Baseline

```bash
code-to-gate historical --current .qh --previous .qh-baseline
```

### Locking Baseline

Lock a baseline to prevent automatic updates:

```typescript
import { lockBaseline } from "@quality-harness/code-to-gate/historical";

lockBaseline(".qh-baseline", "ctg-20240101-good-run");
```

## Programmatic Usage

### Compare Findings

```typescript
import { compareFindings, loadFindings } from "@quality-harness/code-to-gate/historical";

const current = loadFindings("./.qh");
const previous = loadFindings("./.qh-prev");

const comparison = compareFindings(current, previous);

console.log(`New findings: ${comparison.summary.newCount}`);
console.log(`Resolved findings: ${comparison.summary.resolvedCount}`);
console.log(`Regressions: ${comparison.summary.regressionCount}`);
```

### Generate Historical Report

```typescript
import {
  generateHistoricalReport,
  compareFindings,
  compareRisks,
  analyzeRiskTrends
} from "@quality-harness/code-to-gate/historical";

const report = generateHistoricalReport(
  currentRun,
  previousRun,
  findingsComparison,
  risksComparison,
  readinessComparison
);

console.log(`Trend: ${report.riskTrends.trendDirection}`);
console.log(`Recommendations: ${report.recommendations}`);
```

### Check for Blocking Regressions

```typescript
import { hasBlockingRegressions } from "@quality-harness/code-to-gate/historical";

if (hasBlockingRegressions(comparison.regressions, "high")) {
  console.error("Blocking regressions detected - release not recommended");
  process.exit(1);
}
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Quality Gate with Historical Comparison

on:
  push:
    branches: [main]

jobs:
  quality-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # For historical runs

      - name: Run analysis
        run: |
          npm run build
          node ./dist/cli.js analyze . --out .qh

      - name: Download previous run
        uses: actions/download-artifact@v4
        with:
          name: qh-run-${{ github.sha }}
          path: .qh-prev
        continue-on-error: true

      - name: Historical comparison
        run: |
          node ./dist/cli.js historical --current .qh --previous .qh-prev --out historical.json

      - name: Check for regressions
        run: |
          if grep -q '"regressionCount": [1-9]' historical.json; then
            echo "Regressions detected!"
            exit 1
          fi

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: qh-run-${{ github.sha }}
          path: .qh/
```

### Jenkins Pipeline Example

```groovy
pipeline {
  agent any
  stages {
    stage('Analyze') {
      steps {
        sh 'node ./dist/cli.js analyze . --out .qh'
      }
    }
    stage('Compare') {
      steps {
        // Load baseline from previous successful build
        copyArtifacts projectName: env.JOB_NAME,
                     selector: specific(env.prevBuildId ?: 'lastSuccessful'),
                     target: '.qh-prev',
                     optional: true

        sh 'node ./dist/cli.js historical --current .qh --previous .qh-prev'
      }
    }
    stage('Gate') {
      steps {
        script {
          def historical = readJSON file: 'historical.json'
          if (historical.findingsComparison.regressions.length > 0) {
            error "Regressions detected - build blocked"
          }
        }
      }
    }
  }
}
```

## Recommendations

The historical comparison generates actionable recommendations based on:

1. **Regressions**: Recommendations to address reintroduced findings
2. **New Critical Findings**: Prioritize investigation before release
3. **Trend Direction**: Alert when quality is degrading
4. **Status Degradation**: Notify when readiness status changes

## Best Practices

1. **Establish Baseline**: Set a baseline from a known good state before major releases
2. **Regular Comparison**: Run historical comparison in CI to catch regressions early
3. **Trend Monitoring**: Track trend scores over time to identify systemic issues
4. **Regression Priority**: Address regressions before new findings - they indicate quality process gaps
5. **Historical Depth**: Keep multiple historical runs to enable trend analysis

## Exit Codes

| Code | Condition |
|------|-----------|
| 0 | No regressions, comparison successful |
| 1 | Critical regressions detected |
| 2 | Usage error (missing arguments) |
| 10 | Internal error (failed to load artifacts) |

## Related Documentation

- [Artifact Contracts](./artifact-contracts.md) - Artifact schema definitions
- [CLI Reference](./cli-reference.md) - Full CLI command documentation
- [Readiness Evaluation](./quickstart.md) - Release readiness evaluation