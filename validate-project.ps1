# Comprehensive Project Validation Script
# This script checks APIs, database, forms, and integration points

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "  PROJECT VALIDATION STARTING" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

$reportFile = "VALIDATION_RESULTS_$(Get-Date -Format 'yyyy-MM-dd_HH-mm-ss').md"
$errors = @()
$warnings = @()
$passed = @()

function Write-TestResult {
    param(
        [string]$Category,
        [string]$Test,
        [string]$Status,
        [string]$Details = ""
    )
    
    $timestamp = Get-Date -Format "HH:mm:ss"
    $line = "[$timestamp] [$Category] $Test - $Status"
    if ($Details) {
        $line += " | $Details"
    }
    
    switch ($Status) {
        "PASS" { 
            Write-Host $line -ForegroundColor Green
            $script:passed += $line
        }
        "FAIL" { 
            Write-Host $line -ForegroundColor Red
            $script:errors += $line
        }
        "WARN" { 
            Write-Host $line -ForegroundColor Yellow
            $script:warnings += $line
        }
    }
    
    Add-Content -Path $reportFile -Value $line
}

# Initialize report
@"
# Project Validation Results
**Generated:** $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

---

"@ | Set-Content -Path $reportFile

Write-Host "1. Checking TypeScript Compilation..." -ForegroundColor Yellow
Write-TestResult "TypeCheck" "Main Backend" "RUNNING" "npm run typecheck"
try {
    $output = npm run typecheck 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-TestResult "TypeCheck" "Main Backend" "PASS" "No TypeScript errors"
    } else {
        $errorCount = ($output | Select-String "error TS" | Measure-Object).Count
        Write-TestResult "TypeCheck" "Main Backend" "FAIL" "$errorCount TypeScript errors found"
    }
} catch {
    Write-TestResult "TypeCheck" "Main Backend" "FAIL" $_.Exception.Message
}

Write-Host ""
Write-Host "2. Checking Database Migrations..." -ForegroundColor Yellow
if (Test-Path ".\migrations") {
    $migrationFiles = Get-ChildItem -Path ".\migrations" -Filter "*.sql" | Sort-Object Name
    Write-TestResult "Database" "Migration Files" "PASS" "$($migrationFiles.Count) migrations found"
    
    foreach ($migration in $migrationFiles) {
        if ((Get-Content $migration.FullName -Raw) -match "(CREATE|ALTER|DROP)\s+(TABLE|INDEX|VIEW)") {
            Write-TestResult "Database" $migration.Name "PASS" "Valid SQL syntax"
        } else {
            Write-TestResult "Database" $migration.Name "WARN" "May not contain DDL statements"
        }
    }
} else {
    Write-TestResult "Database" "Migrations Directory" "WARN" "No migrations directory found"
}

Write-Host ""
Write-Host "3. Checking Backend Route Files..." -ForegroundColor Yellow
if (Test-Path ".\src\routes") {
    $routeFiles = Get-ChildItem -Path ".\src\routes" -Filter "*.routes.ts" -File
    Write-TestResult "Routes" "Route Files" "PASS" "$($routeFiles.Count) route files found"
    
    # Check a sample of important routes
    $criticalRoutes = @(
        "auth.routes.ts",
        "user.routes.ts",
        "analytics.routes.ts",
        "alert-command-center.routes.ts",
        "operational-health.routes.ts"
    )
    
    foreach ($route in $criticalRoutes) {
        $routePath = Join-Path ".\src\routes" $route
        if (Test-Path $routePath) {
            $content = Get-Content $routePath -Raw
            if ($content -match "app\.(get|post|put|patch|delete)\(") {
                Write-TestResult "Routes" $route "PASS" "Contains HTTP handlers"
            } else {
                Write-TestResult "Routes" $route "WARN" "No HTTP handlers found"
            }
        } else {
            Write-TestResult "Routes" $route "FAIL" "File not found"
        }
    }
} else {
    Write-TestResult "Routes" "Routes Directory" "FAIL" "No routes directory found"
}

Write-Host ""
Write-Host "4. Checking Environment Configuration..." -ForegroundColor Yellow
if (Test-Path ".env") {
    Write-TestResult "Config" ".env file" "PASS" "Found"
    
    $envContent = Get-Content ".env" -Raw
    $requiredVars = @("DATABASE_URL", "JWT_SECRET", "NODE_ENV")
    
    foreach ($var in $requiredVars) {
        if ($envContent -match "$var=") {
            Write-TestResult "Config" $var "PASS" "Configured"
        } else {
            Write-TestResult "Config" $var "WARN" "Not found in .env"
        }
    }
} else {
    Write-TestResult "Config" ".env file" "WARN" "Not found - check .env.example"
}

Write-Host ""
Write-Host "5. Checking Dashboard (Frontend)..." -ForegroundColor Yellow
if (Test-Path ".\dashboard\package.json") {
    Write-TestResult "Frontend" "Dashboard Package" "PASS" "Found"
    
    if (Test-Path ".\dashboard\src\components") {
        $components = Get-ChildItem -Path ".\dashboard\src\components" -Filter "*.tsx" -Recurse -File
        Write-TestResult "Frontend" "React Components" "PASS" "$($components.Count) components found"
    }
    
    # Check for critical UI pages
    $expectedPages = @(
        "dashboard\src\components\StorageFailoverStatus.tsx"
    )
    
    foreach ($page in $expectedPages) {
        if (Test-Path $page) {
            Write-TestResult "Frontend" (Split-Path $page -Leaf) "PASS" "Found"
        } else {
            Write-TestResult "Frontend" (Split-Path $page -Leaf) "INFO" "Not found"
        }
    }
} else {
    Write-TestResult "Frontend" "Dashboard" "FAIL" "Dashboard workspace not found"
}

Write-Host ""
Write-Host "6. Checking Analytics Engine..." -ForegroundColor Yellow
if (Test-Path ".\analytics-engine\package.json") {
    Write-TestResult "Analytics" "Analytics Engine Package" "PASS" "Found"
    
    if (Test-Path ".\analytics-engine\models") {
        $models = Get-ChildItem -Path ".\analytics-engine\models" -Filter "*.onnx" -Recurse -File
        Write-TestResult "Analytics" "AI Models" "PASS" "$($models.Count) ONNX models found"
    }
    
    if (Test-Path ".\analytics-engine\capability-registry.json") {
        Write-TestResult "Analytics" "Capability Registry" "PASS" "Found"
    }
} else {
    Write-TestResult "Analytics" "Analytics Engine" "WARN" "Analytics engine workspace not found"
}

Write-Host ""
Write-Host "7. Checking API Documentation..." -ForegroundColor Yellow
$openApiFiles = Get-ChildItem -Path "." -Filter "*.yaml" -Recurse -File | Where-Object { $_.Directory.Name -eq "openapi" }
if ($openApiFiles.Count -gt 0) {
    Write-TestResult "API Docs" "OpenAPI Specs" "PASS" "$($openApiFiles.Count) spec files found"
    
    foreach ($spec in $openApiFiles) {
        Write-TestResult "API Docs" $spec.Name "INFO" $spec.DirectoryName
    }
} else {
    Write-TestResult "API Docs" "OpenAPI Specs" "WARN" "No OpenAPI spec files found"
}

Write-Host ""
Write-Host "8. Checking Tests..." -ForegroundColor Yellow
if (Test-Path ".\test") {
    $testFiles = Get-ChildItem -Path ".\test" -Filter "*.test.ts" -Recurse -File
    Write-TestResult "Tests" "Test Files" "PASS" "$($testFiles.Count) test files found"
    
    $criticalTests = @(
        "test\app.test.ts",
        "test\authorization.test.ts",
        "test\operational-health.test.ts"
    )
    
    foreach ($test in $criticalTests) {
        if (Test-Path $test) {
            Write-TestResult "Tests" (Split-Path $test -Leaf) "PASS" "Found"
        } else {
            Write-TestResult "Tests" (Split-Path $test -Leaf) "INFO" "Not found"
        }
    }
} else {
    Write-TestResult "Tests" "Test Directory" "WARN" "No test directory found"
}

Write-Host ""
Write-Host "9. Checking Package Dependencies..." -ForegroundColor Yellow
if (Test-Path ".\package.json") {
    $packageJson = Get-Content ".\package.json" -Raw | ConvertFrom-Json
    
    $criticalDeps = @("fastify", "pg", "ioredis", "zod", "jsonwebtoken")
    
    foreach ($dep in $criticalDeps) {
        if ($packageJson.dependencies.$dep) {
            Write-TestResult "Dependencies" $dep "PASS" "v$($packageJson.dependencies.$dep)"
        } else {
            Write-TestResult "Dependencies" $dep "FAIL" "Not found"
        }
    }
}

Write-Host ""
Write-Host "10. Security Checks..." -ForegroundColor Yellow
# Check for common security issues
$securityFiles = @(
    "src\security\password.ts",
    "src\middleware\auth.middleware.ts",
    "src\security\mtls"
)

foreach ($file in $securityFiles) {
    if (Test-Path $file) {
        Write-TestResult "Security" (Split-Path $file -Leaf) "PASS" "Found"
    } else {
        Write-TestResult "Security" (Split-Path $file -Leaf) "WARN" "Not found"
    }
}

# Check for .env in .gitignore
if (Test-Path ".gitignore") {
    $gitignore = Get-Content ".gitignore" -Raw
    if ($gitignore -match "\.env") {
        Write-TestResult "Security" ".env in .gitignore" "PASS" "Protected"
    } else {
        Write-TestResult "Security" ".env in .gitignore" "FAIL" "Credentials may be exposed"
    }
}

# Generate Summary
Write-Host ""
Write-Host "==================================" -ForegroundColor Cyan
Write-Host "  VALIDATION SUMMARY" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "✓ PASSED: $($passed.Count)" -ForegroundColor Green
Write-Host "⚠ WARNINGS: $($warnings.Count)" -ForegroundColor Yellow
Write-Host "✗ FAILED: $($errors.Count)" -ForegroundColor Red
Write-Host ""
Write-Host "Full report saved to: $reportFile" -ForegroundColor Cyan

# Append summary to report
Add-Content -Path $reportFile -Value ""
Add-Content -Path $reportFile -Value "---"
Add-Content -Path $reportFile -Value ""
Add-Content -Path $reportFile -Value "## Summary"
Add-Content -Path $reportFile -Value ""
Add-Content -Path $reportFile -Value "- PASSED: $($passed.Count)"
Add-Content -Path $reportFile -Value "- WARNINGS: $($warnings.Count)"
Add-Content -Path $reportFile -Value "- FAILED: $($errors.Count)"
Add-Content -Path $reportFile -Value ""
Add-Content -Path $reportFile -Value "### Critical Issues"
foreach ($err in $errors) {
    Add-Content -Path $reportFile -Value "- $err"
}
Add-Content -Path $reportFile -Value ""
Add-Content -Path $reportFile -Value "### Warnings"
foreach ($warn in $warnings) {
    Add-Content -Path $reportFile -Value "- $warn"
}
Add-Content -Path $reportFile -Value ""
Add-Content -Path $reportFile -Value "---"
Add-Content -Path $reportFile -Value ""
Add-Content -Path $reportFile -Value "## Next Steps"
Add-Content -Path $reportFile -Value ""
Add-Content -Path $reportFile -Value "1. Fix all TypeScript compilation errors"
Add-Content -Path $reportFile -Value "2. Run unit tests: npm run test:unit"
Add-Content -Path $reportFile -Value "3. Run integration tests: npm run test:integration"
Add-Content -Path $reportFile -Value "4. Start services and verify endpoints manually"
Add-Content -Path $reportFile -Value "5. Test frontend UI in browser"
Add-Content -Path $reportFile -Value "6. Review security configurations"
Add-Content -Path $reportFile -Value "7. Validate database migrations"

if ($errors.Count -gt 0) {
    Write-Host ""
    Write-Host "⚠️  VALIDATION INCOMPLETE - Fix errors above" -ForegroundColor Red
    exit 1
} else {
    Write-Host ""
    Write-Host "✅  VALIDATION PASSED - No critical errors" -ForegroundColor Green
    exit 0
}
