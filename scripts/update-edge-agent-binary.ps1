$ErrorActionPreference = 'Stop'
$install = "C:\Program Files\Sentinel Grid\Edge Agent"
$exe = Join-Path $install "edge-agent.exe"
$config = Join-Path $install "config\edge-agent.env"
$source = "C:\Omsystems\Omsystems\edge-agent\release\edge-agent.exe"
$backupExe = Join-Path $install "edge-agent.exe.bak-hls-fix"

Get-Process -Name "edge-agent" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

Copy-Item -LiteralPath $exe -Destination $backupExe -Force
Copy-Item -LiteralPath $source -Destination $exe -Force

Start-Process -FilePath $exe -ArgumentList @("--run", "--config", "`"$config`"") -WorkingDirectory $install -WindowStyle Hidden
