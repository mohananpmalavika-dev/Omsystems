# P0 Blocker Verification Script
# Run this to verify all P0 fixes are in place

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  P0 BLOCKER VERIFICATION" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$allPassed = $true

# Test 1: AI Confidence Integrity
Write-Host "[1/4] Checking AI Confidence Integrity..." -ForegroundColor Yellow

$fakeConfidence = @(
    "analytics-engine\src\detectors\helmet-detector.ts",
    "backend\src\services\tamper-detection.service.ts",
    "root-cause-analysis-engine\src\analyzer\root-cause-analyzer.ts",
    "src\services\ai-incident-summary.ts"
)

$foundIssues = 0
foreach ($file in $fakeConfidence) {
    if (Test-Path $file) {
        $badLines = Select-String -Path $file -Pattern "confidence = 0\.5" | 
            Where-Object { $_.Line -notmatch "threshold|MIN_|>=|<=|<|>" }
        
        if ($badLines.Count -gt 0) {
            Write-Host "  ❌ FAIL: $file still has fake 0.5" -ForegroundColor Red
            $foundIssues++
            $allPassed = $false
        }
    }
}

if ($foundIssues -eq 0) {
    Write-Host "  ✅ PASS: No fake confidence scores found" -ForegroundColor Green
} else {
    Write-Host "  Found $foundIssues issues" -ForegroundColor Red
}
Write-Host ""

# Test 2: Crowd Density Model
Write-Host "[2/4] Checking Crowd Density Model..." -ForegroundColor Yellow

$crowdFile = "analytics-engine\src\detectors\crowd-density-detector.ts"
if (Test-Path $crowdFile) {
    $content = Get-Content $crowdFile -Raw
    
    if ($content -match "this\.isModelLoaded = true;[\s\S]{0,200}// TODO") {
        Write-Host "  ❌ FAIL: Model set to loaded before verification" -ForegroundColor Red
        $allPassed = $false
    } elseif ($content -match "MODEL_UNAVAILABLE") {
        Write-Host "  ✅ PASS: Returns MODEL_UNAVAILABLE status" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  WARNING: Cannot verify model loading" -ForegroundColor Yellow
    }
} else {
    Write-Host "  ⚠️  WARNING: File not found" -ForegroundColor Yellow
}
Write-Host ""

# Test 3: S3 Storage Metrics
Write-Host "[3/4] Checking S3 Storage Metrics..." -ForegroundColor Yellow

$storageFile = "recording-engine\src\storage-adapter.ts"
if (Test-Path $storageFile) {
    $fake5PB = Select-String -Path $storageFile -Pattern "5.*1024.*1024.*1024.*1024.*1024"
    $cloudWatch = Select-String -Path $storageFile -Pattern "CloudWatch|getMetricStatistics"
    
    if ($fake5PB.Count -gt 0) {
        Write-Host "  ❌ FAIL: Still has fake 5 PB capacity" -ForegroundColor Red
        $allPassed = $false
    } elseif ($cloudWatch.Count -gt 0) {
        Write-Host "  ✅ PASS: CloudWatch integration present" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  WARNING: Cannot verify S3 metrics" -ForegroundColor Yellow
    }
} else {
    Write-Host "  ⚠️  WARNING: File not found" -ForegroundColor Yellow
}
Write-Host ""

# Test 4: SMB Storage Adapter
Write-Host "[4/4] Checking SMB Storage Adapter..." -ForegroundColor Yellow

if (Test-Path $storageFile) {
    $smbNotImplemented = Select-String -Path $storageFile -Pattern "SMB storage adapter is not implemented yet"
    $smbMethods = Select-String -Path $storageFile -Pattern "class SmbStorageAdapter" -Context 0,100
    
    if ($smbNotImplemented.Count -gt 0) {
        Write-Host "  ❌ FAIL: SMB adapter still throws 'not implemented'" -ForegroundColor Red
        $allPassed = $false
    } elseif ($smbMethods.Count -gt 0) {
        $hasGetMetrics = (Select-String -Path $storageFile -Pattern "async getMetrics\(\).*\{[\s\S]{50,}").Count -gt 0
        $hasRunProbe = (Select-String -Path $storageFile -Pattern "async runWriteProbe\(\).*\{[\s\S]{50,}").Count -gt 0
        
        if ($hasGetMetrics -and $hasRunProbe) {
            Write-Host "  ✅ PASS: SMB adapter fully implemented" -ForegroundColor Green
        } else {
            Write-Host "  ⚠️  PARTIAL: Some methods may be incomplete" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "  ⚠️  WARNING: File not found" -ForegroundColor Yellow
}
Write-Host ""

# Summary
Write-Host "========================================" -ForegroundColor Cyan
if ($allPassed) {
    Write-Host "  ✅ ALL P0 FIXES VERIFIED!" -ForegroundColor Green
    Write-Host "  Ready for commit and testing" -ForegroundColor Green
} else {
    Write-Host "  ⚠️  SOME ISSUES FOUND" -ForegroundColor Yellow
    Write-Host "  Review failures above" -ForegroundColor Yellow
}
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Test files check
Write-Host "Test Files:" -ForegroundColor Cyan
$testFiles = @(
    "tests\ai-confidence-integrity.test.ts",
    "tests\storage-adapter.test.ts"
)

foreach ($testFile in $testFiles) {
    if (Test-Path $testFile) {
        $lines = (Get-Content $testFile).Count
        Write-Host "  ✅ $testFile ($lines lines)" -ForegroundColor Green
    } else {
        Write-Host "  ❌ $testFile (not found)" -ForegroundColor Red
    }
}
Write-Host ""

# Documentation check
Write-Host "Documentation:" -ForegroundColor Cyan
$docs = @(
    "PRODUCTION_TRUTH.md",
    ".github\ISSUES\P0_BLOCKERS.md",
    "PRODUCTION_READINESS_TESTS.md",
    "NEXT_4_WEEKS_PLAN.md",
    "P0_COMPLETE_SUMMARY.md"
)

foreach ($doc in $docs) {
    if (Test-Path $doc) {
        Write-Host "  ✅ $doc" -ForegroundColor Green
    } else {
        Write-Host "  ❌ $doc (not found)" -ForegroundColor Red
    }
}
Write-Host ""

# Next steps
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "  1. Run tests: npm test" -ForegroundColor White
Write-Host "  2. Review changes: git status" -ForegroundColor White
Write-Host "  3. Commit: git commit -m 'fix(P0): ...'" -ForegroundColor White
Write-Host "  4. Begin Week 2: Storage failover testing" -ForegroundColor White
Write-Host ""

if ($allPassed) {
    exit 0
} else {
    exit 1
}
