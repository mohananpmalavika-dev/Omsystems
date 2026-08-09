[CmdletBinding()]
param()

$ErrorActionPreference = "Continue"
$scannerExecutable = "C:\Program Files\Sentinel Grid\Edge Agent\edge-agent.exe"
$scannerConfig = "C:\Program Files\Sentinel Grid\Edge Agent\config\edge-agent.env"
$consoleLog = "C:\Omsystems\.scanner-runtime\installed-scanner-console.log"

"[$(Get-Date -Format o)] Starting installed scanner diagnostic run" | Set-Content -LiteralPath $consoleLog
& $scannerExecutable --run --config $scannerConfig *>> $consoleLog
$exitCode = $LASTEXITCODE
"[$(Get-Date -Format o)] Scanner exited with code $exitCode" | Add-Content -LiteralPath $consoleLog
exit $exitCode
