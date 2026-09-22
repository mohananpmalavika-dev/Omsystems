# Edge Agent Activation Code Update Script
# This script updates the activation code in .env file

param(
    [Parameter(Mandatory=$false)]
    [string]$ActivationCode
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Edge Agent Activation Code Updater" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Check if .env file exists
$envFile = ".env"
if (-not (Test-Path $envFile)) {
    Write-Host "❌ Error: .env file not found in current directory" -ForegroundColor Red
    Write-Host "   Make sure you're in the edge-agent folder" -ForegroundColor Yellow
    exit 1
}

# Prompt for activation code if not provided
if (-not $ActivationCode) {
    Write-Host "📋 Please paste your NEW activation code" -ForegroundColor Yellow
    Write-Host "   (starts with 'sgact_')" -ForegroundColor Gray
    Write-Host ""
    $ActivationCode = Read-Host "Activation Code"
}

# Validate activation code format
if (-not $ActivationCode.StartsWith("sgact_")) {
    Write-Host "❌ Error: Invalid activation code format" -ForegroundColor Red
    Write-Host "   Activation codes must start with 'sgact_'" -ForegroundColor Yellow
    exit 1
}

if ($ActivationCode.Length -lt 40) {
    Write-Host "❌ Error: Activation code too short" -ForegroundColor Red
    Write-Host "   Expected at least 40 characters, got $($ActivationCode.Length)" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "🔄 Updating .env file..." -ForegroundColor Cyan

# Read .env file
$envContent = Get-Content $envFile -Raw

# Backup original .env
$backupFile = ".env.backup.$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Copy-Item $envFile $backupFile
Write-Host "✓ Created backup: $backupFile" -ForegroundColor Green

# Update activation code
$pattern = 'EDGE_ACTIVATION_CODE=.*'
$replacement = "EDGE_ACTIVATION_CODE=$ActivationCode"

if ($envContent -match $pattern) {
    $newContent = $envContent -replace $pattern, $replacement
    Set-Content -Path $envFile -Value $newContent -NoNewline
    Write-Host "✓ Updated EDGE_ACTIVATION_CODE in .env" -ForegroundColor Green
} else {
    # Add if not found
    Add-Content -Path $envFile -Value "`nEDGE_ACTIVATION_CODE=$ActivationCode"
    Write-Host "✓ Added EDGE_ACTIVATION_CODE to .env" -ForegroundColor Green
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "✅ Activation Code Updated Successfully!" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

Write-Host "📋 Next Steps:" -ForegroundColor Yellow
Write-Host "  1. If edge agent is running, STOP it (Ctrl+C)" -ForegroundColor White
Write-Host "  2. Restart edge agent: .\START_SCANNER_SIMPLE.bat" -ForegroundColor White
Write-Host "  3. Verify: node check-edge-agent.mjs" -ForegroundColor White
Write-Host ""

$restart = Read-Host "Do you want to restart the edge agent now? (Y/N)"
if ($restart -eq "Y" -or $restart -eq "y") {
    Write-Host ""
    Write-Host "🚀 Starting edge agent..." -ForegroundColor Cyan
    Write-Host ""
    & ".\START_SCANNER_SIMPLE.bat"
} else {
    Write-Host ""
    Write-Host "⏸️  Remember to restart the edge agent manually!" -ForegroundColor Yellow
    Write-Host ""
}
