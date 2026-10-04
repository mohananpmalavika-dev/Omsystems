[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$install = [IO.Path]::GetFullPath((Join-Path $env:ProgramFiles 'Sentinel Grid\Edge Agent'))
$exe = Join-Path $install 'edge-agent.exe'
$config = Join-Path $install 'config\edge-agent.env'
$installInfo = Join-Path $install 'install-info.txt'
$source = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\edge-agent\release\edge-agent.exe'))
$taskName = 'Sentinel Grid Edge Agent'
$stamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')
$backupExe = Join-Path $install "edge-agent.exe.before-0.1.48.$stamp.bak"
$backupConfig = Join-Path $install "config\edge-agent.env.before-0.1.48.$stamp.bak"

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Administrator privileges are required to update the installed Edge Agent.'
}

if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) {
    throw "Installed edge agent not found at $exe"
}
if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
    throw "Source edge agent not found at $source"
}

Write-Host "Backing up current installed executable..." -ForegroundColor Cyan
Copy-Item -LiteralPath $exe -Destination $backupExe -Force
if (Test-Path -LiteralPath $config -PathType Leaf) {
    Copy-Item -LiteralPath $config -Destination $backupConfig -Force
}

# Stop any running edge agent instances
$instances = @(Get-Process -Name 'edge-agent' -ErrorAction SilentlyContinue)
foreach ($instance in $instances) {
    Write-Host "Stopping running process $($instance.Id)..." -ForegroundColor Yellow
    Stop-Process -Id $instance.Id -Force -ErrorAction SilentlyContinue
    Wait-Process -Id $instance.Id -Timeout 15 -ErrorAction SilentlyContinue
}

Write-Host "Installing v0.1.48 executable..." -ForegroundColor Cyan
Copy-Item -LiteralPath $source -Destination $exe -Force

if (Test-Path -LiteralPath $config -PathType Leaf) {
    Write-Host "Updating edge-agent.env configuration..." -ForegroundColor Cyan
    $content = [IO.File]::ReadAllText($config)
    if ($content -match '(?m)^EDGE_AGENT_VERSION=') {
        $content = [regex]::Replace($content, '(?m)^EDGE_AGENT_VERSION=.*$', 'EDGE_AGENT_VERSION="0.1.48"')
    } else {
        $content += "`r`nEDGE_AGENT_VERSION=`"0.1.48`"`r`n"
    }
    [IO.File]::WriteAllText($config, $content, [Text.UTF8Encoding]::new($false))
}

$infoContent = "Installation Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')`r`nInstallation Path: $install`r`nVersion: 0.1.48`r`nInstaller: Native Windows`r`n"
[IO.File]::WriteAllText($installInfo, $infoContent, [Text.UTF8Encoding]::new($false))

Write-Host "SUCCESS: Edge Agent updated to v0.1.48 in $install" -ForegroundColor Green
