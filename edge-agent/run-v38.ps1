$env:EDGE_AGENT_HOME = "c:\Omsystems\Omsystems\edge-agent"
Set-Location "c:\Omsystems\Omsystems\edge-agent"
if (Test-Path "data\edge-agent.lock") {
    Remove-Item -Force "data\edge-agent.lock" -ErrorAction SilentlyContinue
}
node "c:\Omsystems\Omsystems\edge-agent\build\edge-agent.cjs" --run --config "c:\Omsystems\Omsystems\edge-agent\run-v38.env"
