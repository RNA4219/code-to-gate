# real-repo-test.ps1 - PowerShell Real Repository Test Script for code-to-gate
#
# Tests code-to-gate against public repositories to validate:
# - scan/analyze/readiness execution
# - exit code correctness (0 or 1)
# - schema validation for generated artifacts
#
# Usage:
#   ./scripts/real-repo-test.ps1 [-Clean] [-Repo <name>] [-Phase phase1]
#
# Requirements from docs/product-acceptance-v1.md:
#   - 3+ public repos (backend, frontend, library)
#   - scan/analyze/readiness execution
#   - exit code 0 or 1
#   - schema validation pass

param(
    [switch]$Clean,

    [ValidateSet("express", "nextjs", "typescript", "all")]
    [string]$Repo = "all",

    [ValidateSet("phase1", "phase2", "phase3")]
    [string]$Phase = "phase1"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot | Split-Path
$TempDir = Join-Path $ProjectRoot ".real-repo-temp"
$ResultsDir = Join-Path $ProjectRoot ".qh/acceptance/real-repo"
$CTG_CLI = Join-Path $ProjectRoot "dist/cli.js"

# Test repositories configuration
$REPOS = @{
    "express" = @{
        Url = "https://github.com/expressjs/express.git"
        Type = "backend"
        Description = "expressjs/express"
        ExpectedExit = "0_or_1"
        FileTarget = "100-300"
    }
    "nextjs" = @{
        Url = "https://github.com/vercel/next.js.git"
        Type = "frontend"
        Description = "vercel/next.js (examples only)"
        ExpectedExit = "0_or_1"
        FileTarget = "200-400"
        SubDir = "examples"
    }
    "typescript" = @{
        Url = "https://github.com/microsoft/TypeScript.git"
        Type = "library"
        Description = "microsoft/TypeScript"
        ExpectedExit = "0"
        FileTarget = "50-150"
    }
}

# Helper functions
function LogInfo { Write-Host "[INFO] $args" -ForegroundColor Blue }
function LogPass { Write-Host "[PASS] $args" -ForegroundColor Green }
function LogFail { Write-Host "[FAIL] $args" -ForegroundColor Red }
function LogWarn { Write-Host "[WARN] $args" -ForegroundColor Yellow }

function CountFiles($Dir) {
    $count = (Get-ChildItem -Path $Dir -Include *.ts,*.js,*.tsx,*.jsx -Recurse -File -ErrorAction SilentlyContinue).Count
    return $count
}

function ValidateExitCode($Actual, $Expected, $RepoName) {
    if ($Expected -eq "0_or_1") {
        if ($Actual -in @(0, 1)) {
            LogPass "Exit code $Actual matches expected (0 or 1) for $RepoName"
            return $true
        } else {
            LogFail "Exit code $Actual does not match expected (0 or 1) for $RepoName"
            return $false
        }
    } else {
        if ($Actual -eq [int]$Expected) {
            LogPass "Exit code $Actual matches expected $Expected for $RepoName"
            return $true
        } else {
            LogFail "Exit code $Actual does not match expected $Expected for $RepoName"
            return $false
        }
    }
}

function RunSchemaValidation($OutputDir, $RepoName) {
    $failures = 0
    LogInfo "Running schema validation for $RepoName..."

    $artifacts = @("repo-graph.json", "findings.json", "audit.json")
    foreach ($artifact in $artifacts) {
        $artifactPath = Join-Path $OutputDir $artifact
        if (Test-Path $artifactPath) {
            $result = & node $CTG_CLI schema validate $artifactPath 2>&1
            if ($LASTEXITCODE -eq 0) {
                LogPass "Schema validation: $artifact"
            } else {
                LogFail "Schema validation: $artifact (exit code $LASTEXITCODE)"
                $failures++
            }
        } else {
            LogWarn "Artifact not found: $artifact"
        }
    }
    return $failures
}

function CloneRepo($RepoName, $RepoUrl, $TargetDir) {
    LogInfo "Cloning $RepoName..."

    if (Test-Path $TargetDir) {
        LogInfo "Repository already cloned at $TargetDir"
        return $true
    }

    # Clone with depth 1 for faster download
    & git clone --depth 1 $RepoUrl $TargetDir 2>&1 | Out-Null

    if ($LASTEXITCODE -eq 0) {
        LogPass "Cloned $RepoName successfully"
        return $true
    } else {
        LogFail "Failed to clone $RepoName"
        return $false
    }
}

function RunRepoTest($RepoName, $RepoConfig) {
    $RepoDir = Join-Path $TempDir $RepoName
    $OutputDir = Join-Path $ResultsDir $RepoName
    $StartTime = Get-Date

    # Create results directory
    New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

    # Clone repo
    if (-not (CloneRepo $RepoName $RepoConfig.Url $RepoDir)) {
        return @{
            Status = "fail"
            Reason = "clone_failed"
        }
    }

    # Determine test directory (for nextjs, use examples only)
    $TestDir = $RepoDir
    if ($RepoConfig.SubDir) {
        $SubDirPath = Join-Path $RepoDir $RepoConfig.SubDir
        if (Test-Path $SubDirPath) {
            LogInfo "Using $($RepoConfig.SubDir) directory only for $RepoName"
            $TestDir = $SubDirPath
        }
    }

    # Count files
    $FileCount = CountFiles $TestDir
    LogInfo "File count for ${RepoName}: ${FileCount} (target: $($RepoConfig.FileTarget))"

    # Initialize result
    $result = @{
        Repo = $RepoName
        Type = $RepoConfig.Type
        Description = $RepoConfig.Description
        FileCount = $FileCount
        StartTime = $StartTime
        Tests = @{}
    }

    # Run scan
    LogInfo "Running scan on $RepoName..."
    $scanOutput = Join-Path $OutputDir "scan"
    New-Item -ItemType Directory -Force -Path $scanOutput | Out-Null

    $scanResult = & node $CTG_CLI scan $TestDir --out $scanOutput 2>&1
    $scanExit = $LASTEXITCODE
    $scanTime = ((Get-Date) - $StartTime).TotalSeconds

    $result.Tests.Scan = @{
        ExitCode = $scanExit
        DurationSeconds = $scanTime
        OutputDir = $scanOutput
    }

    if (-not (ValidateExitCode $scanExit $RepoConfig.ExpectedExit $RepoName)) {
        $result.Tests.Scan.Status = "fail"
    } else {
        $result.Tests.Scan.Status = "pass"
    }

    # Run analyze
    LogInfo "Running analyze on $RepoName..."
    $analyzeStartTime = Get-Date
    $analyzeOutput = Join-Path $OutputDir "analyze"
    New-Item -ItemType Directory -Force -Path $analyzeOutput | Out-Null

    $analyzeResult = & node $CTG_CLI analyze $TestDir --out $analyzeOutput 2>&1
    $analyzeExit = $LASTEXITCODE
    $analyzeTime = ((Get-Date) - $analyzeStartTime).TotalSeconds

    $result.Tests.Analyze = @{
        ExitCode = $analyzeExit
        DurationSeconds = $analyzeTime
        OutputDir = $analyzeOutput
    }

    if (-not (ValidateExitCode $analyzeExit $RepoConfig.ExpectedExit $RepoName)) {
        $result.Tests.Analyze.Status = "fail"
    } else {
        $result.Tests.Analyze.Status = "pass"
    }

    # Run readiness (with findings from analyze)
    LogInfo "Running readiness on $RepoName..."
    $readinessStartTime = Get-Date
    $readinessOutput = Join-Path $OutputDir "readiness"
    New-Item -ItemType Directory -Force -Path $readinessOutput | Out-Null

    # Create a simple policy for testing
    $policyContent = @"
version: ctg/v1alpha1
policy_id: real-repo-test-$RepoName
blocking:
  severity:
    critical: true
    high: true
  category:
    auth: true
    payment: true
    security: true
confidence:
  min_confidence: 0.6
"@
    $policyPath = Join-Path $OutputDir "policy.yaml"
    $policyContent | Out-File -FilePath $policyPath -Encoding utf8

    $readinessResult = & node $CTG_CLI readiness $TestDir --policy $policyPath --from $analyzeOutput --out $readinessOutput 2>&1
    $readinessExit = $LASTEXITCODE
    $readinessTime = ((Get-Date) - $readinessStartTime).TotalSeconds

    $result.Tests.Readiness = @{
        ExitCode = $readinessExit
        DurationSeconds = $readinessTime
        OutputDir = $readinessOutput
    }

    if (-not (ValidateExitCode $readinessExit $RepoConfig.ExpectedExit $RepoName)) {
        $result.Tests.Readiness.Status = "fail"
    } else {
        $result.Tests.Readiness.Status = "pass"
    }

    # Run schema validation
    $schemaFailures = RunSchemaValidation $analyzeOutput $RepoName
    $result.Tests.SchemaValidation = @{
        Failures = $schemaFailures
        Status = if ($schemaFailures -eq 0) { "pass" } else { "fail" }
    }

    # Calculate totals
    $totalTime = ((Get-Date) - $StartTime).TotalSeconds
    $result.TotalDurationSeconds = $totalTime
    $result.EndTime = Get-Date

    # Determine overall status
    $allPassed = ($result.Tests.Scan.Status -eq "pass") -and
                 ($result.Tests.Analyze.Status -eq "pass") -and
                 ($result.Tests.Readiness.Status -eq "pass") -and
                 ($result.Tests.SchemaValidation.Status -eq "pass")

    $result.Status = if ($allPassed) { "pass" } else { "fail" }

    # Write result to file
    $resultPath = Join-Path $OutputDir "result.yaml"
    $yamlContent = @"
# Real Repo Acceptance Test Result
repo: $RepoName
type: $($RepoConfig.Type)
description: $($RepoConfig.Description)
file_count: $FileCount
status: $($result.Status)
start_time: $($StartTime.ToString('yyyy-MM-ddTHH:mm:ss'))
end_time: $($result.EndTime.ToString('yyyy-MM-ddTHH:mm:ss'))
total_duration_seconds: $totalTime

tests:
  scan:
    exit_code: $scanExit
    duration_seconds: $scanTime
    status: $($result.Tests.Scan.Status)
  analyze:
    exit_code: $analyzeExit
    duration_seconds: $analyzeTime
    status: $($result.Tests.Analyze.Status)
  readiness:
    exit_code: $readinessExit
    duration_seconds: $readinessTime
    status: $($result.Tests.Readiness.Status)
  schema_validation:
    failures: $schemaFailures
    status: $($result.Tests.SchemaValidation.Status)
"@
    $yamlContent | Out-File -FilePath $resultPath -Encoding utf8

    return $result
}

# Main execution
LogInfo "Starting real repo acceptance tests for Phase: $Phase"
LogInfo "Project root: $ProjectRoot"
LogInfo "CLI: $CTGCLI"

# Check CLI exists
if (-not (Test-Path $CTG_CLI)) {
    LogFail "CLI not found at $CTG_CLI"
    LogInfo "Run 'npm run build' first"
    exit 1
}

# Create directories
New-Item -ItemType Directory -Force -Path $TempDir | Out-Null
New-Item -ItemType Directory -Force -Path $ResultsDir | Out-Null

# Determine repos to test
$reposToTest = if ($Repo -eq "all") { $REPOS.Keys } else { @($Repo) }

$allResults = @{}
$passCount = 0
$failCount = 0

foreach ($repoName in $reposToTest) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  Testing: $repoName" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""

    $repoConfig = $REPOS[$repoName]
    $result = RunRepoTest $repoName $repoConfig
    $allResults[$repoName] = $result

    if ($result.Status -eq "pass") {
        $passCount++
        LogPass "${repoName}: PASS"
    } else {
        $failCount++
        LogFail "${repoName}: FAIL"
    }

    # Clean up if requested
    if ($Clean) {
        $repoDir = Join-Path $TempDir $repoName
        if (Test-Path $repoDir) {
            Remove-Item -Recurse -Force $repoDir
            LogInfo "Cleaned up $repoName"
        }
    }
}

# Summary
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Total repos tested: $($reposToTest.Count)"
Write-Host "Passed: $passCount" -ForegroundColor Green
Write-Host "Failed: $failCount" -ForegroundColor Red
Write-Host ""

# Write overall summary
$summaryPath = Join-Path $ResultsDir "summary.yaml"
$summaryContent = @"
# Real Repo Acceptance Test Summary
phase: $Phase
date: $(Get-Date -Format 'yyyy-MM-dd')
repos_tested: $($reposToTest.Count)
passed: $passCount
failed: $failCount
status: $(if ($failCount -eq 0) { 'pass' } else { 'fail' })

repos:
"@
foreach ($key in $allResults.Keys) {
    $r = $allResults[$key]
    $keyName = $key
    $summaryContent += @"
  ${keyName}:
    status: $($r.Status)
    file_count: $($r.FileCount)
    type: $($r.Type)
"@
}
$summaryContent | Out-File -FilePath $summaryPath -Encoding utf8
LogInfo "Summary saved: $summaryPath"

# Exit with appropriate code
if ($failCount -gt 0) {
    exit 1
} else {
    LogPass "All real repo tests passed"
    exit 0
}