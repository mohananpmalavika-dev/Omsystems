[CmdletBinding(SupportsShouldProcess)]
param([string]$InstallPath = 'C:\Program Files\Sentinel Grid\Edge Agent')

$ErrorActionPreference = 'Stop'
$executables = @('edge-agent.exe', 'cloudflared.exe', 'mediamtx.exe', 'ffmpeg.exe', 'ffprobe.exe') |
  ForEach-Object { Join-Path $InstallPath $_ }

foreach ($executable in $executables) {
  if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) { throw "Expected component is missing: $executable" }
  $signature = Get-AuthenticodeSignature -LiteralPath $executable
  if ($signature.Status -ne 'Valid') { throw "Refusing to allow-list unsigned component: $executable ($($signature.Status))" }
}

if ($PSCmdlet.ShouldProcess($InstallPath, 'Allow signed Edge Agent applications through Controlled Folder Access')) {
  foreach ($executable in $executables) { Add-MpPreference -ControlledFolderAccessAllowedApplications $executable }
}

Write-Host 'Controlled Folder Access policy applied. Deploy through Intune/GPO; do not disable Microsoft Defender or create broad exclusions.' -ForegroundColor Green
