# fp-review.ps1 - PowerShell FP Review Script for code-to-gate
#
# Usage:
#   ./scripts/fp-review.ps1 -Repo <path> [-Phase phase1|phase2|phase3] [-OutDir <dir>]
#
# Based on docs/product-acceptance-v1.md FP evaluation requirements:
# - Phase 1: FP rate <= 15%
# - Phase 2: FP rate <= 10%
# - Phase 3: FP rate <= 5%

param(
    [Parameter(Mandatory=$true)]
    [string]$Repo,

    [ValidateSet("phase1", "phase2", "phase3")]
    [string]$Phase = "phase1",

    [string]$OutDir = ".qh/fp-review",

    [string]$Evaluator = $env:USERNAME,

    [switch]$SkipAnalyze,

    [switch]$Interactive
)

$ErrorActionPreference = "Stop"

# FP Rate Targets
$FP_TARGETS = @{
    "phase1" = 15
    "phase2" = 10
    "phase3" = 5
}

$Target = $FP_TARGETS[$Phase]
Write-Host "Target FP rate for $Phase: <= $Target%"

# Resolve paths
$ProjectRoot = $PSScriptRoot | Split-Path
$RepoPath = if (Test-Path $Repo) { $Repo } else { Join-Path $ProjectRoot $Repo }
$AbsOutDir = Join-Path $ProjectRoot $OutDir

if (-not (Test-Path $RepoPath)) {
    Write-Error "Repository not found: $Repo"
    exit 2
}

# Create output directory
New-Item -ItemType Directory -Force -Path $AbsOutDir | Out-Null
Write-Host "Output directory: $AbsOutDir"

$FindingsPath = Join-Path $AbsOutDir "findings.json"

# Run analysis if needed
if (-not $SkipAnalyze) {
    Write-Host "Running code-to-gate analyze on $Repo..."
    & node "$ProjectRoot/dist/cli.js" analyze $RepoPath --emit all --out $AbsOutDir 2>&1 | Out-Null
    Write-Host "Analysis complete"
} else {
    $ExistingFindings = Join-Path $RepoPath ".qh/findings.json"
    if (Test-Path $ExistingFindings) {
        Copy-Item $ExistingFindings $FindingsPath
        Write-Host "Using existing findings: $ExistingFindings"
    } else {
        Write-Error "No existing findings.json found at $ExistingFindings"
        exit 3
    }
}

# Check findings
if (-not (Test-Path $FindingsPath)) {
    Write-Error "findings.json not found at $FindingsPath"
    exit 3
}

$Findings = Get-Content $FindingsPath | ConvertFrom-Json
$FindingsCount = $Findings.findings.Count
Write-Host "Total findings: $FindingsCount"

if ($FindingsCount -eq 0) {
    Write-Host "FP rate: 0% (no findings)"
    exit 0
}

# Generate evaluation template
$EvalId = "fp-eval-$Phase-$(Get-Date -Format 'yyyyMMddHHmmss')"
$EvalDate = Get-Date -Format 'yyyy-MM-dd'
$TemplatePath = Join-Path $AbsOutDir "fp-evaluation-template.yaml"

Write-Host "Generating FP evaluation template..."

$YamlContent = @"
# FP Evaluation Template
# Fill in classification (TP/FP/Uncertain) for each finding
# TP = True Positive (correct finding)
# FP = False Positive (incorrect finding)
# Uncertain = Needs further investigation

evaluation_id: $EvalId
repo: $Repo
evaluator: $Evaluator
date: $EvalDate
phase: $Phase

findings:
"@

foreach ($Finding in $Findings.findings) {
    $YamlContent += @"

  - finding_id: $($Finding.id)
    rule_id: $($Finding.ruleId)
    severity: $($Finding.severity)
    category: $($Finding.category)
    title: $($Finding.title)
    classification: ""  # TP, FP, or Uncertain
    comment: ""  # Optional explanation
"@
}

$YamlContent | Out-File -FilePath $TemplatePath -Encoding utf8
Write-Host "Template generated: $TemplatePath"

# Interactive review
$ReviewPath = Join-Path $AbsOutDir "fp-evaluation.yaml"

if ($Interactive) {
    Write-Host ""
    Write-Host "========================================="
    Write-Host "  Interactive FP Review"
    Write-Host "========================================="
    Write-Host ""
    Write-Host "For each finding, enter classification:"
    Write-Host "  T = TP (True Positive - correct finding)"
    Write-Host "  F = FP (False Positive - incorrect finding)"
    Write-Host "  U = Uncertain (needs investigation)"
    Write-Host "  S = Skip (mark as uncertain)"
    Write-Host ""

    $TPCount = 0
    $FPCount = 0
    $UncertainCount = 0
    $Index = 0

    Copy-Item $TemplatePath $ReviewPath

    foreach ($Finding in $Findings.findings) {
        $Index++
        Write-Host "[$Index/$FindingsCount] Finding: $($Finding.id)"
        Write-Host "  Rule: $($Finding.ruleId)"
        Write-Host "  Severity: $($Finding.severity)"
        Write-Host "  Title: $($Finding.title)"
        Write-Host "  Summary: $($Finding.summary)"
        Write-Host ""

        $Classification = Read-Host "Classification (T/F/U/S)"

        switch -Regex ($Classification) {
            "^[Tt]$" {
                $Class = "TP"
                $TPCount++
            }
            "^[Ff]$" {
                $Class = "FP"
                $FPCount++
            }
            default {
                $Class = "Uncertain"
                $UncertainCount++
                if ($Classification -notin @("U", "u", "S", "s")) {
                    Write-Warning "Unknown input, marked as Uncertain"
                }
            }
        }

        Write-Host "  Classified as: $Class"
        Write-Host ""
        $Comment = Read-Host "Comment (optional, press Enter to skip)"
        Write-Host "----------------------------------------"
    }

    $Total = $TPCount + $FPCount + $UncertainCount
    $FPRate = if ($Total -gt 0) { [math]::Round(($FPCount / $Total) * 100, 2) } else { 0 }

    Write-Host ""
    Write-Host "========================================="
    Write-Host "  Review Complete"
    Write-Host "========================================="
    Write-Host ""
    Write-Host "Summary:"
    Write-Host "  Total findings: $Total"
    Write-Host "  TP: $TPCount"
    Write-Host "  FP: $FPCount"
    Write-Host "  Uncertain: $UncertainCount"
    Write-Host "  FP Rate: $FPRate%"
    Write-Host "  Target: <= $Target%"
    Write-Host ""

    if ($FPRate -le $Target) {
        Write-Host "PASS - FP rate within target" -ForegroundColor Green
    } elseif ($FPRate -le ($Target + 5)) {
        Write-Host "CONDITIONAL PASS - FP rate slightly exceeds target" -ForegroundColor Yellow
    } else {
        Write-Host "FAIL - FP rate exceeds target by more than 5%" -ForegroundColor Red
    }

    # Write summary
    $SummaryYaml = @"

summary:
  total: $Total
  tp: $TPCount
  fp: $FPCount
  uncertain: $UncertainCount
  fp_rate: $FPRate
  target: $Target
  pass: $($FPRate -le $Target)
"@

    Add-Content -Path $ReviewPath -Value $SummaryYaml -Encoding utf8
    Write-Host "Review saved: $ReviewPath"

} else {
    Write-Host "Non-interactive mode - template generated for manual review"
    Write-Host ""
    Write-Host "Next steps:"
    Write-Host "1. Open $TemplatePath"
    Write-Host "2. Fill in classification (TP/FP/Uncertain) for each finding"
    Write-Host "3. Save as $ReviewPath"
    Write-Host "4. Run this script with -Interactive to validate"
}

Write-Host "FP review process complete"