[CmdletBinding()]
param(
  [string]$Path,
  [string]$CertificateThumbprint = "492444B636DC7C2F1FC7FE6E30F80DE06EE6282F",
  [string]$TimestampServer = "http://timestamp.digicert.com"
)

$ErrorActionPreference = "Stop"

if (-not $Path) {
  $Path = Join-Path $PSScriptRoot "..\release\edge-agent.exe"
}

if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
  throw "Target binary to sign does not exist: $Path"
}

# Locate signtool.exe
$signtoolPaths = @(
  (Get-Command signtool.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source),
  "C:\Program Files (x86)\Windows Kits\10\bin\x64\signtool.exe",
  "C:\Program Files (x86)\Windows Kits\10\bin\10.0.22621.0\x64\signtool.exe",
  "C:\Program Files (x86)\Windows Kits\10\bin\10.0.19041.0\x64\signtool.exe"
)
$signtool = $signtoolPaths | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $signtool) {
  throw "signtool.exe not found in Windows Kits. Please install the Windows SDK."
}

# Find certificate in store
$cert = @(
  Get-ChildItem -Path "Cert:\CurrentUser\My", "Cert:\LocalMachine\My" -ErrorAction SilentlyContinue |
    Where-Object { $_.Thumbprint -eq ($CertificateThumbprint -replace '\s', '') }
) | Select-Object -First 1

if (-not $cert) {
  throw "Code-signing certificate with thumbprint $CertificateThumbprint was not found."
}

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Signing binary: $Path" -ForegroundColor Cyan
Write-Host "Signer: $($cert.Subject)" -ForegroundColor Cyan
Write-Host "Thumbprint: $($cert.Thumbprint)" -ForegroundColor Cyan
Write-Host "Signtool: $signtool" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# Sign with Authenticode SHA256 and RFC3161 Timestamp
& $signtool sign /sha1 $cert.Thumbprint /fd SHA256 /tr $TimestampServer /td SHA256 /d "KryptoVision Edge Agent" /v $Path
if ($LASTEXITCODE -ne 0) {
  # Fallback without timestamp if network/timestamp server is temporarily unreachable
  Write-Host "[!] Timestamp server timed out or failed. Signing without timestamp..." -ForegroundColor Yellow
  & $signtool sign /sha1 $cert.Thumbprint /fd SHA256 /d "KryptoVision Edge Agent" /v $Path
  if ($LASTEXITCODE -ne 0) {
    throw "Signtool failed with exit code $LASTEXITCODE"
  }
}

# Verify Authenticode Signature
$signature = Get-AuthenticodeSignature -LiteralPath $Path
Write-Host ""
Write-Host "Authenticode Signature Result:" -ForegroundColor Green
$statusColor = if ($signature.Status -eq 'Valid') { 'Green' } else { 'Yellow' }
Write-Host "  Status:        $($signature.Status)" -ForegroundColor $statusColor
Write-Host "  StatusMessage: $($signature.StatusMessage)"
Write-Host "  Signer:        $($signature.SignerCertificate.Subject)"
Write-Host "  Algorithm:     $($signature.SignerCertificate.SignatureAlgorithm.FriendlyName)"
Write-Host "  Expires:       $($signature.SignerCertificate.NotAfter)"
Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "SUCCESS: Executable is signed with Authenticode!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
