#Requires -RunAsAdministrator
# Stops the running edge-agent + children, backs up the old binary,
# installs the freshly-built one, and restarts it.
$ErrorActionPreference = 'Stop'

$install = "C:\Program Files\Sentinel Grid\Edge Agent"
$src     = "C:\Omsystems\Omsystems\edge-agent\release\edge-agent.exe"
$stamp   = (Get-Date -Format 'yyyyMMddTHHmmssZ')
$backup  = "$install\edge-agent.backup-$stamp.exe"

Write-Host "[1/4] Stopping running edge-agent (and children cloudflared/mediamtx)..."
@(23808, 28892, 31752) | ForEach-Object {
    Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
}
# Also catch any stragglers by name
Stop-Process -Name "edge-agent" -Force -ErrorAction SilentlyContinue
Stop-Process -Name "cloudflared" -Force -ErrorAction SilentlyContinue
Stop-Process -Name "mediamtx"    -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3

Write-Host "[2/4] Backing up old binary -> $backup"
Copy-Item "$install\edge-agent.exe" $backup -Force

Write-Host "[3/4] Installing new binary from $src"
Copy-Item $src "$install\edge-agent.exe" -Force

Write-Host "[4/4] Starting updated edge-agent..."
$proc = Start-Process -FilePath "$install\edge-agent.exe" `
    -WorkingDirectory $install -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 5

if (Get-Process -Id $proc.Id -ErrorAction SilentlyContinue) {
    Write-Host "SUCCESS - edge-agent running as PID $($proc.Id)" -ForegroundColor Green
} else {
    Write-Host "WARNING - edge-agent process ended immediately; check logs at $install\logs\" -ForegroundColor Yellow
}
