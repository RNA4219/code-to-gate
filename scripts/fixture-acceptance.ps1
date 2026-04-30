# fixture-acceptance.ps1 - Fixture-based Acceptance Test for code-to-gate
#
# Tests code-to-gate against local fixtures to validate:
# - scan/analyze/readiness execution
# - exit code correctness
# - schema validation
#
# Usage:
#   ./scripts/fixtures-acceptance.ps1 [-OutDir <dir>]
#
# This is a faster alternative to real-repo-test.ps1 for MVP validation.

param(
    [string]$OutDir = ".qh/acceptance/fixtures"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot | Split-Path
$CTG_CLI = Join-Path $ProjectRoot "dist/cli.js"
$ResultsDir = Join-Path $ProjectRoot $OutDir

# Helper functions
function LogInfo { Write-Host "[INFO] $args" -ForegroundColor Blue }
function LogPass { Write-Host "[PASS] $args" -ForegroundColor Green }
function LogFail { Write-Host "[FAIL] $args" -ForegroundColor Red }
function LogWarn { Write-Host "[WARN] $args" -ForegroundColor Yellow }

# Fixtures to test
$Fixtures = @{
    "demo-shop-ts" = @{
        Path = "fixtures/demo-shop-ts"
        Type = "backend"
        Description = "E-commerce demo with payment/auth patterns"
        HasFindings = $true
    }
    "demo-auth-js" = @{
        Path = "fixtures/demo-auth-js"
        Type = "backend"
        Description = "Authentication patterns demo"
        HasFindings = $true
    }
    "demo-python" = @{
        Path = "fixtures/demo-python"
        Type = "backend"
        Description = "Python patterns demo"
        HasFindings = $false
    }
}

# Check CLI exists
if (-not (Test-Path $CTG_CLI)) {
    LogFail "CLI not found at $CTG_CLI"
    LogInfo "Run 'npm run build' first"
    exit 1
}

# Create results directory
New-Item -ItemType Directory -Force -Path $ResultsDir | Out-Null

$StartTime = Get-Date
$Results = @{}
$PassCount = 0
$FailCount = 0

foreach ($fixtureName in $Fixtures.Keys) {
    $fixture = $Fixtures[$fixtureName]
    $fixturePath = Join-Path $ProjectRoot $fixture.Path
    $outputDir = Join-Path $ResultsDir $fixtureName
    $fixtureStart = Get-Date

    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  Testing: $fixtureName" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""

    if (-not (Test-Path $fixturePath)) {
        LogWarn "Fixture not found: $fixturePath"
        $Results[$fixtureName] = @{ Status = "skip"; Reason = "fixture_not_found" }
        continue
    }

    New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

    $result = @{
        Fixture = $fixtureName
        Type = $fixture.Type
        Description = $fixture.Description
        StartTime = $fixtureStart
        Tests = @{}
    }

    # Run scan
    LogInfo "Running scan on $fixtureName..."
    $scanOutput = Join-Path $outputDir "scan"
    New-Item -ItemType Directory -Force -Path $scanOutput | Out-Null

    & node $CTG_CLI scan $fixturePath --out $scanOutput 2>&1 | Out-Null
    $scanExit = $LASTEXITCODE
    $scanTime = ((Get-Date) - $fixtureStart).TotalSeconds

    $result.Tests.Scan = @{
        ExitCode = $scanExit
        DurationSeconds = $scanTime
        Status = if ($scanExit -in @(0, 1)) { "pass" } else { "fail" }
    }
    LogInfo "Scan exit: $scanExit, duration: $scanTime"

    # Run analyze
    LogInfo "Running analyze on $fixtureName..."
    $analyzeStart = Get-Date
    $analyzeOutput = Join-Path $outputDir "analyze"
    New-Item -ItemType Directory -Force -Path $analyzeOutput | Out-Null

    & node $CTG_CLI analyze $fixturePath --out $analyzeOutput 2>&1 | Out-Null
    $analyzeExit = $LASTEXITCODE
    $analyzeTime = ((Get-Date) - $analyzeStart).TotalSeconds

    $result.Tests.Analyze = @{
        ExitCode = $analyzeExit
        DurationSeconds = $analyzeTime
        Status = if ($analyzeExit -in @(0, 1, 5)) { "pass" } else { "fail" }
    }

    # Check findings count
    $findingsPath = Join-Path $analyzeOutput "findings.json"
    if (Test-Path $findingsPath) {
        $findings = Get-Content $findingsPath | ConvertFrom-Json
        $result.FindingsCount = $findings.findings.Count
        LogInfo "Findings count: $($result.FindingsCount)"
    }

    # Run schema validation
    LogInfo "Running schema validation..."
    $schemaFailures = 0
    $artifacts = @("repo-graph.json", "findings.json", "audit.json")
    foreach ($artifact in $artifacts) {
        $artifactPath = Join-Path $analyzeOutput $artifact
        if (Test-Path $artifactPath) {
            & node $CTG_CLI schema validate $artifactPath 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0) {
                LogPass "Schema: $artifact"
            } else {
                LogFail "Schema: $artifact"
                $schemaFailures++
            }
        }
    }
    $result.Tests.SchemaValidation = @{
        Failures = $schemaFailures
        Status = if ($schemaFailures -eq 0) { "pass" } else { "fail" }
    }

    # Determine overall
    $result.TotalDurationSeconds = ((Get-Date) - $fixtureStart).TotalSeconds
    $result.EndTime = Get-Date

    $allPassed = ($result.Tests.Scan.Status -eq "pass") -and
                 ($result.Tests.Analyze.Status -eq "pass") -and
                 ($result.Tests.SchemaValidation.Status -eq "pass")

    $result.Status = if ($allPassed) { "pass" } else { "fail" }

    if ($result.Status -eq "pass") {
        $PassCount++
        LogPass "${fixtureName}: PASS"
    } else {
        $FailCount++
        LogFail "${fixtureName}: FAIL"
    }

    $Results[$fixtureName] = $result
}

# Summary
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Fixture Acceptance Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Total fixtures tested: $($Fixtures.Count)"
Write-Host "Passed: $PassCount" -ForegroundColor Green
Write-Host "Failed: $FailCount" -ForegroundColor Red
Write-Host "Total duration: $(((Get-Date) - $StartTime).TotalSeconds) seconds"
Write-Host ""

# Write summary YAML
$summaryPath = Join-Path $ResultsDir "summary.yaml"
$summaryContent = @"
# Fixture Acceptance Test Summary
date: $(Get-Date -Format 'yyyy-MM-ddTHH:mm:ss')
fixtures_tested: $($Fixtures.Count)
passed: $PassCount
failed: $FailCount
total_duration_seconds: $(((Get-Date) - $StartTime).TotalSeconds)
status: $(if ($FailCount -eq 0) { 'pass' } else { 'fail' })

fixtures:
"@

foreach ($key in $Results.Keys) {
    $r = $Results[$key]
    $keyName = $key
    $summaryContent += @"
  ${keyName}:
    status: $($r.Status)
    type: $($r.Type)
    findings_count: $($r.FindingsCount)
    total_duration_seconds: $($r.TotalDurationSeconds)
"@
}

$summaryContent | Out-File -FilePath $summaryPath -Encoding utf8
LogInfo "Summary saved: $summaryPath"

# Exit
if ($FailCount -gt 0) {
    exit 1
} else {
    LogPass "All fixture tests passed"
    exit 0
}