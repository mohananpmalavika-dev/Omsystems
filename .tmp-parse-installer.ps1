$tokens = $null
$errors = $null
[System.Management.Automation.Language.Parser]::ParseFile(
  (Resolve-Path (Join-Path $PSScriptRoot "edge-agent\installer\windows\install-edge-agent.ps1")).Path,
  [ref]$tokens,
  [ref]$errors
) | Out-Null
if ($errors.Count -gt 0) {
  $errors | ForEach-Object { Write-Error $_.Message }
  exit 1
}
Write-Output "PowerShell syntax valid"
