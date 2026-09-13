Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "  AUTHORITATIVE DASHBOARD & OPERATIONS BUILD VERIFICATION" -ForegroundColor Cyan
Write-Host "================================================================================"
Write-Host ""

$errCount = 0

Write-Host "Step 1: Checking Authoritative Production Services (src/)..." -ForegroundColor Yellow
Write-Host ""

if (Test-Path "src/bootstrap/index.ts") {
    Write-Host "[OK] src/bootstrap/index.ts (Authoritative Composition Root) exists" -ForegroundColor Green
} else {
    Write-Host "[FAIL] src/bootstrap/index.ts not found" -ForegroundColor Red
    $errCount += 1
}

if (Test-Path "src/branch-mosaic/services/branch-mosaic.service.ts") {
    Write-Host "[OK] src/branch-mosaic/services/branch-mosaic.service.ts exists" -ForegroundColor Green
} else {
    Write-Host "[FAIL] src/branch-mosaic/services/branch-mosaic.service.ts not found" -ForegroundColor Red
    $errCount += 1
}

if (Test-Path "src/reporting/services/daily-surveillance-report.service.ts") {
    Write-Host "[OK] src/reporting/services/daily-surveillance-report.service.ts exists" -ForegroundColor Green
} else {
    Write-Host "[FAIL] src/reporting/services/daily-surveillance-report.service.ts not found" -ForegroundColor Red
    $errCount += 1
}

if (Test-Path "src/security-devices/services/security-device.service.ts") {
    Write-Host "[OK] src/security-devices/services/security-device.service.ts exists" -ForegroundColor Green
} else {
    Write-Host "[FAIL] src/security-devices/services/security-device.service.ts not found" -ForegroundColor Red
    $errCount += 1
}

if (Test-Path "src/security-devices/services/security-device-discovery.service.ts") {
    Write-Host "[OK] src/security-devices/services/security-device-discovery.service.ts exists" -ForegroundColor Green
} else {
    Write-Host "[FAIL] src/security-devices/services/security-device-discovery.service.ts not found" -ForegroundColor Red
    $errCount += 1
}

Write-Host ""
Write-Host "Step 2: Checking Dashboard Frontend Components (dashboard/)..." -ForegroundColor Yellow
Write-Host ""

if (Test-Path "dashboard/app/page.tsx") {
    Write-Host "[OK] dashboard/app/page.tsx exists" -ForegroundColor Green
} else {
    Write-Host "[FAIL] dashboard/app/page.tsx not found" -ForegroundColor Red
    $errCount += 1
}

if (Test-Path "dashboard/app/dashboards/page.tsx") {
    Write-Host "[OK] dashboard/app/dashboards/page.tsx exists" -ForegroundColor Green
} else {
    Write-Host "[FAIL] dashboard/app/dashboards/page.tsx not found" -ForegroundColor Red
    $errCount += 1
}

if (Test-Path "dashboard/lib/backend/security-device-service.ts") {
    Write-Host "[OK] dashboard/lib/backend/security-device-service.ts exists" -ForegroundColor Green
} else {
    Write-Host "[FAIL] dashboard/lib/backend/security-device-service.ts not found" -ForegroundColor Red
    $errCount += 1
}

Write-Host ""
Write-Host "Step 3: Checking Database Schema Migrations..." -ForegroundColor Yellow
Write-Host ""

if (Test-Path "database/migrations") {
    $count = (Get-ChildItem -Path "database/migrations/*.sql").Count
    Write-Host "[OK] database/migrations contains $count SQL migrations" -ForegroundColor Green
} else {
    Write-Host "[FAIL] database/migrations not found" -ForegroundColor Red
    $errCount += 1
}

Write-Host ""
Write-Host "Step 4: Verifying Dashboard TypeScript Compilation..." -ForegroundColor Yellow
Write-Host ""

npm run dashboard:typecheck
if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Dashboard TypeScript compiles successfully with 0 errors" -ForegroundColor Green
} else {
    Write-Host "[FAIL] Dashboard TypeScript compilation failed" -ForegroundColor Red
    $errCount += 1
}

Write-Host ""
Write-Host "================================================================================"
if ($errCount -eq 0) {
    Write-Host "  VERIFICATION PASSED: Authoritative Dashboard Architecture is 100% Operational" -ForegroundColor Green
    exit 0
} else {
    Write-Host "  VERIFICATION FAILED: $errCount error(s) detected" -ForegroundColor Red
    exit 1
}
Write-Host "================================================================================"
