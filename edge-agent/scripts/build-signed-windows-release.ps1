[CmdletBinding()]
param(
  [string]$CertificateThumbprint = $env:WINDOWS_SIGNING_CERT_THUMBPRINT,
  [string]$TimestampServer = 'http://timestamp.digicert.com',
  [switch]$SkipAgentBuild,
  [switch]$SkipInstallerBuild
)

# This is intentionally a release-machine script. The certificate private key
# stays in the Windows certificate store (or a hardware token), never in Git.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$agentPath = Join-Path $projectRoot 'release\edge-agent.exe'
$runtimeDirectory = Join-Path $projectRoot 'release\runtime'
$vendorDirectory = Join-Path $projectRoot 'vendor\windows'
$installerBuild = Join-Path $projectRoot 'installer\windows\build-installer.ps1'
$signScript = Join-Path $PSScriptRoot 'sign-windows-release.ps1'

if (-not $CertificateThumbprint) {
  throw 'Set WINDOWS_SIGNING_CERT_THUMBPRINT or pass -CertificateThumbprint. A valid code-signing certificate with its private key is required.'
}

if (-not $SkipAgentBuild) {
  Push-Location $projectRoot
  try {
    # npm.cmd avoids the local PowerShell npm.ps1 execution-policy restriction.
    & npm.cmd run build:exe
    if ($LASTEXITCODE -ne 0) { throw "Edge-agent build failed with exit code $LASTEXITCODE." }
  } finally {
    Pop-Location
  }
}

if (-not (Test-Path -LiteralPath $agentPath -PathType Leaf)) {
  throw "Missing edge-agent executable: $agentPath"
}

# Sign before compiling the installer so the installed agent retains its
# Authenticode signature after extraction.
& $signScript -Path $agentPath -CertificateThumbprint $CertificateThumbprint -TimestampServer $TimestampServer

if (-not $SkipInstallerBuild) {
  # pkg embeds the archives for the self-installing agent, while the Inno
  # installer ships the actual runtime files beside the signed executable.
  # Prepare those files here so a release is reproducible from a clean tree.
  $ffmpegArchive = Join-Path $vendorDirectory 'ffmpeg.zip'
  $mediaMtxArchive = Join-Path $vendorDirectory 'mediamtx.zip'
  foreach ($archive in @($ffmpegArchive, $mediaMtxArchive)) {
    if (-not (Test-Path -LiteralPath $archive -PathType Leaf)) {
      throw "Missing verified Windows runtime archive: $archive. Run npm.cmd run fetch:windows-runtime first."
    }
  }
  New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
  Expand-Archive -LiteralPath $ffmpegArchive -DestinationPath $runtimeDirectory -Force
  Expand-Archive -LiteralPath $mediaMtxArchive -DestinationPath $runtimeDirectory -Force

  & $installerBuild
  if ($LASTEXITCODE -ne 0) { throw "Installer build failed with exit code $LASTEXITCODE." }
}

$installerDirectory = Join-Path $projectRoot 'installer\windows\output'
$installer = Get-ChildItem -LiteralPath $installerDirectory -Filter '*Installer*-windows.exe' -File -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTimeUtc -Descending |
  Select-Object -First 1
if (-not $installer) {
  throw "No Windows installer was found in $installerDirectory."
}

# Sign the outer installer after Inno Setup has finished. Do not re-sign
# third-party FFmpeg, MediaMTX, or cloudflared binaries: preserve the vendors'
# original signatures and distribute only checksum-pinned copies.
& $signScript -Path $installer.FullName -CertificateThumbprint $CertificateThumbprint -TimestampServer $TimestampServer

$artifacts = @($agentPath, $installer.FullName)
$hashes = $artifacts | Get-FileHash -Algorithm SHA256 |
  ForEach-Object { "{0} *{1}" -f $_.Hash, (Split-Path -Leaf $_.Path) }
$checksumPath = Join-Path (Split-Path -Parent $installer.FullName) 'SHA256SUMS.txt'
Set-Content -LiteralPath $checksumPath -Value $hashes -Encoding ascii

# The control plane validates this manifest before serving a production
# installer. It binds the shipped EXE to the file that was Authenticode-signed
# and verified on this Windows release runner.
$releaseManifestPath = Join-Path $projectRoot 'release\windows-release.json'
$releaseManifest = [ordered]@{
  sha256 = (Get-FileHash -LiteralPath $agentPath -Algorithm SHA256).Hash.ToLowerInvariant()
  signedAt = [DateTime]::UtcNow.ToString('o')
  signerThumbprint = $CertificateThumbprint
  installerSha256 = (Get-FileHash -LiteralPath $installer.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
}
$releaseManifest | ConvertTo-Json | Set-Content -LiteralPath $releaseManifestPath -Encoding utf8

Write-Host "Signed release is ready:" -ForegroundColor Green
$artifacts | ForEach-Object { Write-Host "  $_" }
Write-Host "  $checksumPath"
Write-Host "  $releaseManifestPath"
