[CmdletBinding()]
param(
  [Parameter(Mandatory)] [string[]]$Path,
  [string]$CertificateThumbprint = $env:WINDOWS_SIGNING_CERT_THUMBPRINT,
  [string]$TimestampServer = 'http://timestamp.digicert.com'
)

$ErrorActionPreference = 'Stop'
if (-not $CertificateThumbprint) { throw 'Set WINDOWS_SIGNING_CERT_THUMBPRINT or pass -CertificateThumbprint.' }
$signtool = Get-Command signtool.exe -ErrorAction SilentlyContinue
if (-not $signtool) { throw 'signtool.exe was not found. Install the Windows SDK on the release runner.' }

foreach ($artifact in $Path) {
  if (-not (Test-Path -LiteralPath $artifact -PathType Leaf)) { throw "Release artifact was not found: $artifact" }
  & $signtool.Source sign /sha1 $CertificateThumbprint /fd SHA256 /tr $TimestampServer /td SHA256 /v $artifact
  if ($LASTEXITCODE -ne 0) { throw "Authenticode signing failed with exit code $LASTEXITCODE." }
  $signature = Get-AuthenticodeSignature -LiteralPath $artifact
  if ($signature.Status -ne 'Valid') { throw "Signature verification failed: $($signature.Status) $($signature.StatusMessage)" }
  Write-Host "Signed and verified: $artifact" -ForegroundColor Green
}
