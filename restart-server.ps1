# Stop any running Node processes for this project
Write-Host "Stopping Node.js processes..." -ForegroundColor Yellow
Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*Omsystems*" } | Stop-Process -Force

Write-Host "Waiting for processes to stop..." -ForegroundColor Yellow
Start-Sleep -Seconds 2

Write-Host "Starting server..." -ForegroundColor Green
npm run dev
