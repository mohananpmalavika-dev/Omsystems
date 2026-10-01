$env:EDGE_AGENT_HOME = "c:\Omsystems\Omsystems\edge-agent"
Set-Location "c:\Omsystems\Omsystems\edge-agent"
if (Test-Path "data\edge-agent.lock") {
    Remove-Item -Force "data\edge-agent.lock" -ErrorAction SilentlyContinue
}
& "C:\Program Files\Sentinel Grid\Edge Agent\edge-agent.exe" --run --config "c:\Omsystems\Omsystems\edge-agent\run-v38.env"
