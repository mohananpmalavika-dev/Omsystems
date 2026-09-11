[CmdletBinding(SupportsShouldProcess)]
param([string]$InstallPath = 'C:\Program Files\Sentinel Grid\Edge Agent')

$ErrorActionPreference = 'Stop'
# Controlled Folder Access is an endpoint policy, not an anti-virus bypass.
# Permit only the signed product executable.  The agent validates and launches
# its checksum-pinned vendor tools; those vendors retain their own signatures
# (or lack of one) and must not be silently trusted by allow-listing them here.
$agentExecutable = Join-Path $InstallPath 'edge-agent.exe'
if (-not (Test-Path -LiteralPath $agentExecutable -PathType Leaf)) {
  throw "Expected Edge Agent executable is missing: $agentExecutable"
}
$signature = Get-AuthenticodeSignature -LiteralPath $agentExecutable
if ($signature.Status -ne 'Valid') {
  throw "Refusing to allow-list unsigned or invalid Edge Agent executable: $agentExecutable ($($signature.Status))"
}

if ($PSCmdlet.ShouldProcess($InstallPath, 'Allow signed Edge Agent applications through Controlled Folder Access')) {
  Add-MpPreference -ControlledFolderAccessAllowedApplications $agentExecutable
}

Write-Host 'Controlled Folder Access policy applied for the signed Edge Agent. Deploy through Intune/GPO; do not disable Microsoft Defender or create broad exclusions.' -ForegroundColor Green
