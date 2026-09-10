# PowerShell wrapper for precision-review@v1.
param(
    [Parameter(Mandatory=$true)][string]$Repo,
    [ValidateSet("phase1", "phase2", "phase3")][string]$Phase = "phase1",
    [string]$OutDir = ".qh/fp-review",
    [string]$Evaluator = "",
    [switch]$SkipAnalyze,
    [switch]$Interactive
)
$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot
$RepoPath = if (Test-Path -LiteralPath $Repo) { (Resolve-Path -LiteralPath $Repo).Path } else { Join-Path $ProjectRoot $Repo }
$AbsOutDir = if ([IO.Path]::IsPathRooted($OutDir)) { $OutDir } else { Join-Path $ProjectRoot $OutDir }
$ReviewScript = Join-Path $ProjectRoot "scripts/precision-review.mjs"
$FindingsPath = Join-Path $AbsOutDir "findings.json"
$ReviewPath = Join-Path $AbsOutDir "review.json"
$SummaryPath = Join-Path $AbsOutDir "summary.json"
if ($Interactive -and [string]::IsNullOrWhiteSpace($Evaluator)) { throw "-Evaluator is required for a human interactive review" }
if ([string]::IsNullOrWhiteSpace($Evaluator)) { $Evaluator = "local-ai" }
Write-Host "Legacy phase context: $Phase (precision reportability comes from review classifications)"
if (-not (Test-Path -LiteralPath $RepoPath)) { throw "Repository not found: $Repo" }
if ((Test-Path -LiteralPath $ReviewPath) -or (Test-Path -LiteralPath $SummaryPath)) { throw "Review output already exists; choose a new -OutDir" }
New-Item -ItemType Directory -Force -Path $AbsOutDir | Out-Null
if ($SkipAnalyze) {
    $ExistingFindings = Join-Path $RepoPath ".qh/findings.json"
    if (-not (Test-Path -LiteralPath $ExistingFindings)) { throw "No existing findings.json found at $ExistingFindings" }
    Copy-Item -LiteralPath $ExistingFindings -Destination $FindingsPath -Force
} else {
    & node (Join-Path $ProjectRoot "dist/cli.js") analyze $RepoPath --emit all --out $AbsOutDir --llm-provider deterministic --llm-mode local-only
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
$ReviewerKind = if ($Interactive) { "human" } else { "ai" }
& node $ReviewScript create --from $FindingsPath --out $ReviewPath --reviewer $Evaluator --reviewer-kind $ReviewerKind --repo $RepoPath
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if ($Interactive) {
    $findings = Get-Content -LiteralPath $FindingsPath -Raw | ConvertFrom-Json
    foreach ($finding in $findings.findings) {
        $answer = Read-Host "Classification for $($finding.id) (T/F/U/A)"
        $classification = switch -Regex ($answer) { "^[Tt]$" { "TP"; break } "^[Ff]$" { "FP"; break } "^[Aa]$" { "AcceptedDesign"; break } default { "Uncertain" } }
        $comment = Read-Host "Comment (optional)"
        if ($null -eq $comment) { $comment = "" }
        $update = @($ReviewScript, "update", "--from", $ReviewPath, "--findings", $FindingsPath, "--out", $ReviewPath, "--force", "--finding-id", $finding.id, "--classification", $classification)
        $update += @("--comment", $comment)
        & node @update
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
}
& node $ReviewScript summarize --from $FindingsPath --review $ReviewPath --out $SummaryPath
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "Precision review: $ReviewPath"
Write-Host "Summary: $SummaryPath"
