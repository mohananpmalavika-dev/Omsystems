[CmdletBinding()]
param(
  [string]$OutputPath = "",
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$releaseVersion = "0.1.18"
$packageSource = Join-Path $repositoryRoot "reports\edge-agent-fleet-rollout-$releaseVersion"
$edgeExecutable = Join-Path $repositoryRoot "edge-agent\release\edge-agent.exe"

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  $OutputPath = Join-Path $repositoryRoot "reports\edge-agent-fleet-rollout-$releaseVersion.zip"
}
$resolvedOutput = [IO.Path]::GetFullPath($OutputPath)

foreach ($requiredFile in @(
  "README.txt",
  "Run-Sentinel-Edge-Repair.cmd",
  "repair-installed-edge-agent.ps1",
  "run-edge-agent-repair.ps1"
)) {
  if (-not (Test-Path -LiteralPath (Join-Path $packageSource $requiredFile) -PathType Leaf)) {
    throw "Fleet rollout source file is missing: $requiredFile"
  }
}

if (-not $SkipBuild) {
  Push-Location $repositoryRoot
  try {
    & npm run build:exe
    if ($LASTEXITCODE -ne 0) { throw "Edge Agent build failed with exit code $LASTEXITCODE." }
  } finally {
    Pop-Location
  }
}

if (-not (Test-Path -LiteralPath $edgeExecutable -PathType Leaf)) {
  throw "Edge Agent executable is missing. Run without -SkipBuild to create it."
}
$versionOutput = @(& $edgeExecutable --version 2>&1)
if ($LASTEXITCODE -ne 0 -or ($versionOutput -join " ") -notmatch "Edge Agent 0\.1\.18") {
  throw "The executable did not pass the v$releaseVersion version check."
}

$outputDirectory = Split-Path -Parent $resolvedOutput
if ($outputDirectory) { New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null }
$stageRoot = Join-Path ([IO.Path]::GetTempPath()) "sentinel-grid-fleet-rollout-$PID"
$stagePackage = Join-Path $stageRoot "edge-agent-fleet-rollout-$releaseVersion"

try {
  New-Item -ItemType Directory -Path $stagePackage -Force | Out-Null
  Copy-Item -LiteralPath $edgeExecutable -Destination (Join-Path $stagePackage "edge-agent.exe")
  foreach ($requiredFile in @(
    "README.txt",
    "Run-Sentinel-Edge-Repair.cmd",
    "repair-installed-edge-agent.ps1",
    "run-edge-agent-repair.ps1"
  )) {
    Copy-Item -LiteralPath (Join-Path $packageSource $requiredFile) -Destination (Join-Path $stagePackage $requiredFile)
  }

  if (Test-Path -LiteralPath $resolvedOutput -PathType Leaf) {
    Remove-Item -LiteralPath $resolvedOutput -Force
  }
  Compress-Archive -Path $stagePackage -DestinationPath $resolvedOutput -CompressionLevel Optimal
  $archive = Get-Item -LiteralPath $resolvedOutput
  $hash = (Get-FileHash -LiteralPath $resolvedOutput -Algorithm SHA256).Hash.ToLowerInvariant()
  Write-Host "Created fleet rollout archive: $($archive.FullName)" -ForegroundColor Green
  Write-Host "Size: $($archive.Length) bytes" -ForegroundColor Green
  Write-Host "SHA256: $hash" -ForegroundColor Green
} finally {
  Remove-Item -LiteralPath $stageRoot -Recurse -Force -ErrorAction SilentlyContinue
}
