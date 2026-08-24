$ErrorActionPreference = "Stop"
$script = (Resolve-Path (Join-Path $PSScriptRoot ".tmp-stop-installer-test.ps1")).Path
$arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$script`""
$process = Start-Process `
    -FilePath (Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe") `
    -ArgumentList $arguments `
    -Verb RunAs `
    -WindowStyle Hidden `
    -Wait `
    -PassThru
exit $process.ExitCode
