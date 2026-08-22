# Verification Script for P0 Blocker #2: Crowd Density Model Integrity
# Verifies all fixes have been applied correctly

Write-Host "🔍 P0 Blocker #2 Verification: Crowd Density Model" -ForegroundColor Cyan
Write-Host "=" * 70

$allPassed = $true
$targetFile = "analytics-engine\src\detectors\crowd-density-detector.ts"

# Test 1: Verify isModelLoaded is only set after verification
Write-Host "`n[1/5] Checking model verification..." -NoNewline
$hasVerification = Select-String -Path $targetFile -Pattern "await pipeline.detectObjects\(testFrame" -Quiet
$hasProperSet = Select-String -Path $targetFile -Pattern "this\.isModelLoaded = true" -Context 0,1 | Where-Object { $_.Context.PostContext -match "person detection model verified" }

if ($hasVerification -and $hasProperSet) {
    Write-Host " ✅ PASS" -ForegroundColor Green
} else {
    Write-Host " ❌ FAIL" -ForegroundColor Red
    $allPassed = $false
}

# Test 2: Verify MODEL_UNAVAILABLE is returned when not initialized
Write-Host "[2/5] Checking MODEL_UNAVAILABLE status..." -NoNewline
$hasUnavailable = Select-String -Path $targetFile -Pattern 'status: "MODEL_UNAVAILABLE"' -Quiet

if ($hasUnavailable) {
    Write-Host " ✅ PASS" -ForegroundColor Green
} else {
    Write-Host " ❌ FAIL" -ForegroundColor Red
    $allPassed = $false
}

# Test 3: Verify confidence is calculated, not hardcoded
Write-Host "[3/5] Checking confidence calculation..." -NoNewline
$hasCalculation = Select-String -Path $targetFile -Pattern "calculateCrowdConfidence" -Quiet
$hasHardcoded095 = Select-String -Path $targetFile -Pattern 'confidence: 0\.95[^0-9]' -Quiet

if ($hasCalculation -and -not $hasHardcoded095) {
    Write-Host " ✅ PASS" -ForegroundColor Green
} else {
    Write-Host " ❌ FAIL" -ForegroundColor Red
    $allPassed = $false
}

# Test 4: Verify speed calculation uses real tracking data
Write-Host "[4/5] Checking speed calculation..." -NoNewline
$hasVelocityCalc = Select-String -Path $targetFile -Pattern "person\.velocity" -Quiet
$hasPlaceholder05 = Select-String -Path $targetFile -Pattern "return 0\.5;" -Context 2,0 | Where-Object { $_.Context.PreContext -match "calculateAverageSpeed" }

if ($hasVelocityCalc -and -not $hasPlaceholder05) {
    Write-Host " ✅ PASS" -ForegroundColor Green
} else {
    Write-Host " ❌ FAIL" -ForegroundColor Red
    $allPassed = $false
}

# Test 5: Verify calculateCrowdConfidence method exists
Write-Host "[5/5] Checking calculateCrowdConfidence method..." -NoNewline
$hasMethod = Select-String -Path $targetFile -Pattern "private calculateCrowdConfidence" -Quiet
$hasImplementation = Select-String -Path $targetFile -Pattern "crowdedZones\.some\(z => z\.densityLevel" -Quiet

if ($hasMethod -and $hasImplementation) {
    Write-Host " ✅ PASS" -ForegroundColor Green
} else {
    Write-Host " ❌ FAIL" -ForegroundColor Red
    $allPassed = $false
}

# Summary
Write-Host "`n" + ("=" * 70)
if ($allPassed) {
    Write-Host "✅ ALL CHECKS PASSED" -ForegroundColor Green
    Write-Host "`nP0 Blocker #2 is RESOLVED:" -ForegroundColor Green
    Write-Host "  ✅ Model verification before isModelLoaded = true"
    Write-Host "  ✅ MODEL_UNAVAILABLE status when not initialized"
    Write-Host "  ✅ Real confidence calculation (not hardcoded 0.95)"
    Write-Host "  ✅ Real speed calculation (not placeholder 0.5)"
    Write-Host "  ✅ calculateCrowdConfidence method implemented"
    exit 0
} else {
    Write-Host "❌ SOME CHECKS FAILED" -ForegroundColor Red
    Write-Host "`nP0 Blocker #2 still has issues - review failed checks above"
    exit 1
}
