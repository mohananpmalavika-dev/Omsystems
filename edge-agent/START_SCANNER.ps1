# Start Camera Scanner
# This PowerShell script loads .env file and starts the scanner

Write-Host "Starting Camera Scanner..." -ForegroundColor Green
Write-Host ""
Write-Host "Loading configuration from .env file..." -ForegroundColor Yellow

# Change to edge-agent directory
Set-Location $PSScriptRoot

# Load .env file
if (Test-Path ".env") {
    Get-Content ".env" | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
            $key = $matches[1].Trim()
            $value = $matches[2].Trim()
            [Environment]::SetEnvironmentVariable($key, $value, "Process")
            Write-Host "  Loaded: $key" -ForegroundColor Gray
        }
    }
    Write-Host ""
    Write-Host "Configuration loaded successfully!" -ForegroundColor Green
} else {
    Write-Host "ERROR: .env file not found!" -ForegroundColor Red
    Write-Host "Please run SETUP_AND_START_SCANNER.bat first" -ForegroundColor Yellow
    pause
    exit 1
}

Write-Host ""
Write-Host "Starting scanner..." -ForegroundColor Green
Write-Host "Press Ctrl+C to stop" -ForegroundColor Yellow
Write-Host ""

# Start the scanner
node dist\src\index.js
