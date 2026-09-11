[CmdletBinding()]
param(
  [Parameter(Mandatory)] [string[]]$Path,
  [string]$CertificateThumbprint = $env:WINDOWS_SIGNING_CERT_THUMBPRINT,
  [string]$TimestampServer = 'http://timestamp.digicert.com'
)

$ErrorActionPreference = 'Stop'
if (-not $CertificateThumbprint) { throw 'Set WINDOWS_SIGNING_CERT_THUMBPRINT or pass -CertificateThumbprint.' }
$CertificateThumbprint = $CertificateThumbprint -replace '\s', ''
$certificate = @(
  Get-ChildItem -Path 'Cert:\CurrentUser\My', 'Cert:\LocalMachine\My' -ErrorAction SilentlyContinue |
    Where-Object { $_.Thumbprint -eq $CertificateThumbprint }
) | Select-Object -First 1
if (-not $certificate) { throw "Code-signing certificate $CertificateThumbprint was not found in CurrentUser\My or LocalMachine\My." }
if (-not $certificate.HasPrivateKey) { throw "Code-signing certificate $CertificateThumbprint has no accessible private key." }
if ($certificate.NotAfter -le (Get-Date)) { throw "Code-signing certificate $CertificateThumbprint expired on $($certificate.NotAfter)." }
$signtool = Get-Command signtool.exe -ErrorAction SilentlyContinue
if (-not $signtool) {
  $sdkRoot = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'
  $sdkCandidates = if (Test-Path -LiteralPath $sdkRoot) {
    Get-ChildItem -LiteralPath $sdkRoot -Recurse -Filter signtool.exe -File -ErrorAction SilentlyContinue |
      Sort-Object @{ Expression = { if ($_.FullName -match '\\x64\\') { 0 } else { 1 } } }, FullName
  } else { @() }
  $signtool = $sdkCandidates | Select-Object -First 1
}
if (-not $signtool) { throw 'signtool.exe was not found. Install the Windows SDK on the release runner.' }

foreach ($artifact in $Path) {
  if (-not (Test-Path -LiteralPath $artifact -PathType Leaf)) { throw "Release artifact was not found: $artifact" }
  $signtoolPath = if ($signtool.Source) { $signtool.Source } else { $signtool.FullName }
  & $signtoolPath sign /sha1 $CertificateThumbprint /fd SHA256 /tr $TimestampServer /td SHA256 /v $artifact
  if ($LASTEXITCODE -ne 0) { throw "Authenticode signing failed with exit code $LASTEXITCODE." }
  $signature = Get-AuthenticodeSignature -LiteralPath $artifact
  if ($signature.Status -ne 'Valid') { throw "Signature verification failed: $($signature.Status) $($signature.StatusMessage)" }
  Write-Host "Signed and verified: $artifact" -ForegroundColor Green
}
