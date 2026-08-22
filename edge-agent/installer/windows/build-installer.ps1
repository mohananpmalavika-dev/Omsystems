# Build Sentinel Grid Installer
# This script builds the complete installer package

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "======================================"
Write-Host "  Building Sentinel Grid Installer"
Write-Host "======================================"
Write-Host ""

# Check if running from correct directory
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

# Step 1: Check if edge agent is built
Write-Host "Step 1: Checking edge agent build..."
$edgeAgentExe = "..\..\release\edge-agent.exe"

if (-not (Test-Path $edgeAgentExe)) {
    Write-Host "❌ Edge agent not found at: $edgeAgentExe"
    Write-Host ""
    Write-Host "Please build the edge agent first:"
    Write-Host "   cd ..\..\\"
    Write-Host "   npm run build:exe"
    Write-Host ""
    exit 1
}

Write-Host "✅ Edge agent found: $edgeAgentExe"
$exeInfo = Get-Item $edgeAgentExe
Write-Host "   Size: $([math]::Round($exeInfo.Length / 1MB, 2)) MB"
Write-Host "   Modified: $($exeInfo.LastWriteTime)"

# Step 2: Check runtime files
Write-Host ""
Write-Host "Step 2: Checking runtime dependencies..."
$runtimePath = "..\..\release\runtime"

if (-not (Test-Path $runtimePath)) {
    Write-Host "❌ Runtime folder not found: $runtimePath"
    exit 1
}

$mediaMTX = Join-Path $runtimePath "mediamtx.exe"
if (-not (Test-Path $mediaMTX)) {
    Write-Host "❌ MediaMTX not found. Please extract from vendor\windows\mediamtx.zip"
    exit 1
}

$ffmpegDir = Get-ChildItem -Path $runtimePath -Filter "ffmpeg-*" -Directory | Select-Object -First 1
if (-not $ffmpegDir) {
    Write-Host "❌ FFmpeg not found. Please extract from vendor\windows\ffmpeg.zip"
    exit 1
}

Write-Host "✅ Runtime dependencies found"
Write-Host "   MediaMTX: Present"
Write-Host "   FFmpeg: $($ffmpegDir.Name)"

# Step 3: Check Inno Setup
Write-Host ""
Write-Host "Step 3: Checking for Inno Setup..."
$innoSetupPaths = @(
    "C:\Program Files (x86)\Inno Setup 7\ISCC.exe",
    "C:\Program Files\Inno Setup 7\ISCC.exe",
    "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
    "C:\Program Files\Inno Setup 6\ISCC.exe",
    "C:\Program Files (x86)\Inno Setup 5\ISCC.exe",
    "C:\Program Files\Inno Setup 5\ISCC.exe"
)

$iscc = $null
foreach ($path in $innoSetupPaths) {
    if (Test-Path $path) {
        $iscc = $path
        break
    }
}

if (-not $iscc) {
    Write-Host "❌ Inno Setup not found!"
    Write-Host ""
    Write-Host "Please install Inno Setup from:"
    Write-Host "   https://jrsoftware.org/isdl.php"
    Write-Host ""
    Write-Host "After installing, run this script again."
    exit 1
}

Write-Host "✅ Inno Setup found: $iscc"

# Step 4: Create placeholder logo if it doesn't exist
Write-Host ""
Write-Host "Step 4: Checking assets..."
$logoPath = "assets\logo.ico"

if (-not (Test-Path $logoPath)) {
    Write-Host "⚠️  Logo not found, creating placeholder..."
    # For now, we'll just note this. In a real build, you'd create or copy a logo
    Write-Host "   Note: Using default icon"
}

# Step 5: Build installer
Write-Host ""
Write-Host "Step 5: Building installer with Inno Setup..."
Write-Host "   Script: sentinel-grid.iss"
Write-Host "   Compiler: $iscc"
Write-Host ""

try {
    & $iscc "sentinel-grid.iss"
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "======================================"
        Write-Host "  ✅ Build Successful!"
        Write-Host "======================================"
        Write-Host ""
        
        $outputFile = "output\KryptonVisionInstaller-v0.1.0-windows.exe"
        if (Test-Path $outputFile) {
            $installerInfo = Get-Item $outputFile
            Write-Host "Installer created:"
            Write-Host "   File: $outputFile"
            Write-Host "   Size: $([math]::Round($installerInfo.Length / 1MB, 2)) MB"
            Write-Host "   Location: $($installerInfo.FullName)"
            Write-Host ""
            Write-Host "You can now distribute this installer to branch locations!"
            Write-Host ""
        }
    } else {
        throw "Inno Setup returned error code: $LASTEXITCODE"
    }
    
} catch {
    Write-Host ""
    Write-Host "======================================"
    Write-Host "  ❌ Build Failed"
    Write-Host "======================================"
    Write-Host ""
    Write-Host "Error: $($_.Exception.Message)"
    Write-Host ""
    exit 1
}
