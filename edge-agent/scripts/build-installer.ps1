# Build Self-Extracting Installer for Sentinel Grid Edge Agent
# This creates a single EXE that branch offices can download and run

$ErrorActionPreference = "Stop"

$ScriptDir = $PSScriptRoot
$ProjectRoot = Split-Path -Parent $ScriptDir
$ReleaseDir = Join-Path $ProjectRoot "release"
$InstallerDir = Join-Path $ProjectRoot "installer\windows"
$OutputDir = Join-Path $ProjectRoot "dist"
$TempBuildDir = Join-Path $env:TEMP "sentinel-grid-installer-$(Get-Random)"

Write-Host "Building Sentinel Grid Edge Agent Installer..." -ForegroundColor Cyan
Write-Host ""

# Check if edge-agent.exe exists  
$EdgeAgentExe = Join-Path $ReleaseDir "edge-agent.exe"
if (-not (Test-Path $EdgeAgentExe)) {
    throw "edge-agent.exe not found at $EdgeAgentExe. Please build the edge agent first."
}

# Create temporary build directory
Write-Host "Creating temporary build directory..." -ForegroundColor Yellow
New-Item -ItemType Directory -Path $TempBuildDir -Force | Out-Null

# Copy files
Write-Host "Copying installer files..." -ForegroundColor Yellow
Copy-Item -Path $EdgeAgentExe -Destination $TempBuildDir -Force
Copy-Item -Path "$InstallerDir\install-gui.ps1" -Destination $TempBuildDir -Force
Copy-Item -Path "$InstallerDir\Install Sentinel Grid.bat" -Destination $TempBuildDir -Force

# Copy any additional files
if (Test-Path "$ProjectRoot\THIRD_PARTY_NOTICES.txt") {
    Copy-Item -Path "$ProjectRoot\THIRD_PARTY_NOTICES.txt" -Destination $TempBuildDir -Force
}

# Create README
$readmeContent = @"
Sentinel Grid Edge Agent Installer
===================================

INSTALLATION INSTRUCTIONS:
-------------------------
1. Double-click "Install Sentinel Grid.bat"
2. Enter your branch name (e.g., "Downtown Branch")
3. Enter the installation key (get this from IT admin)
4. Click "Install"
5. Wait for completion

REQUIREMENTS:
-------------
- Windows 10/11 or Windows Server 2016+
- Administrator rights
- Internet connection to https://sentinel-grid-monitoring-s38w.onrender.com

GETTING THE INSTALLATION KEY:
-----------------------------
Contact your IT administrator or system administrator to get the
installation key for your branch.

TROUBLESHOOTING:
---------------
If installation fails, check:
1. You have administrator rights
2. Internet connection is working
3. Installation key is correct
4. Windows Firewall allows the connection

For support, contact: IT Support Team

© 2026 OM Systems. All rights reserved.
"@
Set-Content -Path "$TempBuildDir\README.txt" -Value $readmeContent -Encoding UTF8

# Create the self-extracting archive using 7-Zip or WinRAR if available
Write-Host "Creating self-extracting installer..." -ForegroundColor Yellow

# Check for 7-Zip
$7zipPath = @(
    "${env:ProgramFiles}\7-Zip\7z.exe",
    "${env:ProgramFiles(x86)}\7-Zip\7z.exe",
    "C:\Program Files\7-Zip\7z.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

$OutputExe = Join-Path $OutputDir "SentinelGridEdgeAgentInstaller.exe"
New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

if ($7zipPath) {
    Write-Host "Using 7-Zip to create self-extracting archive..." -ForegroundColor Green
    
    # Create 7z archive first
    $TempArchive = Join-Path $env:TEMP "installer-temp.7z"
    & $7zipPath a -t7z "$TempArchive" "$TempBuildDir\*" -mx9 | Out-Null
    
    # Create self-extracting executable
    $sfxModule = Join-Path (Split-Path $7zipPath) "7z.sfx"
    if (Test-Path $sfxModule) {
        # Create config for SFX
        $sfxConfig = @"
;!@Install@!UTF-8!
Title="Sentinel Grid Edge Agent"
BeginPrompt="This will install Sentinel Grid Edge Agent. Continue?"
RunProgram="Install Sentinel Grid.bat"
;!@InstallEnd@!
"@
        $sfxConfigFile = Join-Path $env:TEMP "installer-config.txt"
        Set-Content -Path $sfxConfigFile -Value $sfxConfig -Encoding UTF8
        
        # Combine SFX module + config + archive
        $sfxContent = [System.IO.File]::ReadAllBytes($sfxModule)
        $configContent = [System.IO.File]::ReadAllBytes($sfxConfigFile)
        $archiveContent = [System.IO.File]::ReadAllBytes($TempArchive)
        
        $stream = [System.IO.File]::Create($OutputExe)
        $stream.Write($sfxContent, 0, $sfxContent.Length)
        $stream.Write($configContent, 0, $configContent.Length)
        $stream.Write($archiveContent, 0, $archiveContent.Length)
        $stream.Close()
        
        Remove-Item $TempArchive -Force
        Remove-Item $sfxConfigFile -Force
    } else {
        Write-Warning "7z.sfx not found. Creating regular 7z archive instead."
        & $7zipPath a -t7z "$OutputExe.7z" "$TempBuildDir\*" -mx9 | Out-Null
    }
} else {
    Write-Warning "7-Zip not found. Creating ZIP archive instead."
    Write-Host "Install 7-Zip to create a self-extracting EXE." -ForegroundColor Yellow
    
    $OutputZip = Join-Path $OutputDir "SentinelGridEdgeAgentInstaller.zip"
    Compress-Archive -Path "$TempBuildDir\*" -DestinationPath $OutputZip -Force
    Write-Host ""
    Write-Host "Created ZIP archive: $OutputZip" -ForegroundColor Green
}

# Cleanup
Write-Host "Cleaning up..." -ForegroundColor Yellow
Remove-Item -Path $TempBuildDir -Recurse -Force

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Build Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Output file: $OutputExe" -ForegroundColor Cyan
Write-Host ""
Write-Host "DISTRIBUTION INSTRUCTIONS:" -ForegroundColor Yellow
Write-Host "1. Upload the installer to a file share or cloud storage"
Write-Host "2. Provide installation keys to branch managers"
Write-Host "3. Send branch managers the download link and README"
Write-Host ""
Write-Host "Users just need to:" -ForegroundColor Yellow
Write-Host "1. Download the installer"
Write-Host "2. Double-click to run"
Write-Host "3. Enter branch name and installation key"
Write-Host "4. Click Install"
Write-Host ""
