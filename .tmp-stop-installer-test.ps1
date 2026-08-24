$ErrorActionPreference = "Stop"

$expectedId = 24652
$expectedName = "powershell"
$expectedStart = [datetime]::ParseExact("2026-08-24 23:47:52", "yyyy-MM-dd HH:mm:ss", [Globalization.CultureInfo]::InvariantCulture)
$process = Get-Process -Id $expectedId -ErrorAction SilentlyContinue

if ($null -eq $process) {
    exit 0
}

if ($process.ProcessName -ne $expectedName -or [math]::Abs(($process.StartTime - $expectedStart).TotalSeconds) -gt 2) {
    throw "PID $expectedId no longer matches the installer test process; refusing to stop it."
}

Stop-Process -Id $expectedId -Force
