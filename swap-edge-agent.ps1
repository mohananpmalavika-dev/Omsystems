#Requires -RunAsAdministrator
# Stops the running edge-agent + children, backs up the old binary,
# installs the freshly-built one, and restarts it.
$ErrorActionPreference = 'Stop'

$install = "C:\Program Files\Sentinel Grid\Edge Agent"
$src     = "C:\Omsystems\Omsystems\edge-agent\release\edge-agent.exe"
$stamp   = (Get-Date -Format 'yyyyMMddTHHmmssZ')
$backup  = "$install\edge-agent.backup-$stamp.exe"
$config  = "$install\config\edge-agent.env"

Write-Host "[1/5] Stopping running edge-agent, mediamtx, and cloudflared..."
& schtasks.exe /End /TN "Sentinel Grid Edge Agent" 2>$null
Stop-Process -Name "edge-agent" -Force -ErrorAction SilentlyContinue
Stop-Process -Name "cloudflared" -Force -ErrorAction SilentlyContinue
Stop-Process -Name "mediamtx"    -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

Write-Host "[2/5] Backing up old binary -> $backup"
if (Test-Path "$install\edge-agent.exe") {
    Copy-Item "$install\edge-agent.exe" $backup -Force
}

Write-Host "[3/5] Cleaning old runtime configuration..."
if (Test-Path "$install\runtime\mediamtx.yml") {
    Remove-Item "$install\runtime\mediamtx.yml" -Force -ErrorAction SilentlyContinue
}

Write-Host "[4/5] Installing new binary from $src"
Copy-Item $src "$install\edge-agent.exe" -Force

Write-Host "[5/5] Starting updated edge-agent..."
$taskStarted = $false
try {
    $res = & schtasks.exe /Run /TN "Sentinel Grid Edge Agent" 2>&1
    if ($LASTEXITCODE -eq 0) {
        $taskStarted = $true
        Write-Host "Started via Scheduled Task: Sentinel Grid Edge Agent"
    }
} catch {}

if (-not $taskStarted) {
    Write-Host "Starting directly via Start-Process with config $config"
    $proc = Start-Process -FilePath "$install\edge-agent.exe" `
        -ArgumentList "--run", "--config", "`"$config`"" `
        -WorkingDirectory $install -PassThru -WindowStyle Hidden
}

Start-Sleep -Seconds 6

$runningAgent = Get-Process -Name "edge-agent" -ErrorAction SilentlyContinue
if ($runningAgent) {
    Write-Host "SUCCESS - edge-agent running (PID: $($runningAgent.Id -join ', '))" -ForegroundColor Green
} else {
    Write-Host "WARNING - edge-agent is not running; check logs at $install\logs\edge-agent.log" -ForegroundColor Yellow
}

$runningMtx = Get-Process -Name "mediamtx" -ErrorAction SilentlyContinue
if ($runningMtx) {
    Write-Host "SUCCESS - MediaMTX is running (PID: $($runningMtx.Id -join ', '))" -ForegroundColor Green
} else {
    Write-Host "NOTE: MediaMTX is managed by edge-agent. Checking log in a few seconds..." -ForegroundColor Cyan
}
