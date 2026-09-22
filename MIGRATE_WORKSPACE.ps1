# SENTINEL GRID - WORKSPACE MIGRATION SCRIPT
# Migrates workspace to C:\Omsystems\Omsystems

param(
    [switch]$DryRun = $true,
    [switch]$Force = $false
)

$ErrorActionPreference = "Stop"

Write-Host "=== SENTINEL GRID WORKSPACE MIGRATION ===" -ForegroundColor Cyan
Write-Host ""

$parentPath = "C:\Omsystems"
$targetPath = "C:\Omsystems\Omsystems"
$backupPath = "C:\Omsystems_BACKUP_$(Get-Date -Format 'yyyyMMdd_HHmmss')"

# Verify target exists
if (-not (Test-Path $targetPath)) {
    Write-Host "ERROR: Target path does not exist: $targetPath" -ForegroundColor Red
    exit 1
}

Write-Host "Source (Parent):  $parentPath" -ForegroundColor Yellow
Write-Host "Target (Subdirectory): $targetPath" -ForegroundColor Green
Write-Host "Backup will be created at: $backupPath" -ForegroundColor Cyan
Write-Host ""

if ($DryRun) {
    Write-Host "=== DRY RUN MODE (No changes will be made) ===" -ForegroundColor Yellow
    Write-Host ""
}

# Step 1: Check Git status
Write-Host "[1/8] Checking Git repositories..." -ForegroundColor Cyan

$parentGitStatus = git -C $parentPath status --porcelain 2>&1
$targetGitStatus = git -C $targetPath status --porcelain 2>&1

if ($parentGitStatus) {
    Write-Host "  WARNING: Parent repository has uncommitted changes:" -ForegroundColor Yellow
    Write-Host "  $parentGitStatus" -ForegroundColor Yellow
    Write-Host ""
    if (-not $Force) {
        Write-Host "  Run with -Force to proceed anyway, or commit changes first." -ForegroundColor Red
        exit 1
    }
}

if ($targetGitStatus) {
    Write-Host "  WARNING: Target repository has uncommitted changes:" -ForegroundColor Yellow
    Write-Host "  $targetGitStatus" -ForegroundColor Yellow
    Write-Host ""
    if (-not $Force) {
        Write-Host "  Run with -Force to proceed anyway, or commit changes first." -ForegroundColor Red
        exit 1
    }
}

Write-Host "  ✓ Git status checked" -ForegroundColor Green
Write-Host ""

# Step 2: Check for unique files in parent
Write-Host "[2/8] Identifying unique files in parent directory..." -ForegroundColor Cyan

$uniqueFiles = @()
$parentItems = Get-ChildItem $parentPath -Force | Where-Object { $_.Name -ne "Omsystems" -and $_.Name -ne "node_modules" }

foreach ($item in $parentItems) {
    $targetItem = Join-Path $targetPath $item.Name
    
    if (-not (Test-Path $targetItem)) {
        $uniqueFiles += $item.FullName
        Write-Host "  UNIQUE: $($item.Name)" -ForegroundColor Yellow
    }
}

if ($uniqueFiles.Count -eq 0) {
    Write-Host "  ✓ No unique files found in parent (all exist in subdirectory)" -ForegroundColor Green
} else {
    Write-Host "  ! Found $($uniqueFiles.Count) unique items in parent" -ForegroundColor Yellow
}
Write-Host ""

# Step 3: Check the docs folder (our audit reports)
Write-Host "[3/8] Checking documentation files..." -ForegroundColor Cyan

$parentDocs = Join-Path $parentPath "docs"
$targetDocs = Join-Path $targetPath "docs"

if (Test-Path $parentDocs) {
    $parentDocFiles = Get-ChildItem $parentDocs -File | Select-Object -ExpandProperty Name
    Write-Host "  Parent docs: $($parentDocFiles -join ', ')" -ForegroundColor Yellow
    
    if (Test-Path $targetDocs) {
        $targetDocFiles = Get-ChildItem $targetDocs -File | Select-Object -ExpandProperty Name
        Write-Host "  Target docs: $($targetDocFiles -join ', ')" -ForegroundColor Cyan
        
        # Check for our audit reports
        $auditFiles = @("PRODUCTION_AUDIT.md", "FEATURE_MATRIX.json", "CRITICAL_IMPLEMENTATION_PLAN.md", "PRODUCTION_READINESS_SUMMARY.md")
        $missingInTarget = $auditFiles | Where-Object { $_ -notin $targetDocFiles }
        
        if ($missingInTarget) {
            Write-Host "  ! Audit reports missing in target:" -ForegroundColor Yellow
            $missingInTarget | ForEach-Object { Write-Host "    - $_" -ForegroundColor Yellow }
            Write-Host "  → These will be copied to target" -ForegroundColor Cyan
        } else {
            Write-Host "  ✓ Audit reports already in target" -ForegroundColor Green
        }
    } else {
        Write-Host "  ! Target docs folder does not exist" -ForegroundColor Yellow
        Write-Host "  → Will create and copy docs" -ForegroundColor Cyan
    }
}
Write-Host ""

# Step 4: Check for path references
Write-Host "[4/8] Scanning for hardcoded path references..." -ForegroundColor Cyan

$configFiles = @(
    ".env",
    ".env.production",
    "docker-compose.production.yml",
    "docker-compose.distributed.yml",
    "tsconfig.json",
    "package.json"
)

$pathReferences = @()

foreach ($file in $configFiles) {
    $filePath = Join-Path $targetPath $file
    if (Test-Path $filePath) {
        $content = Get-Content $filePath -Raw
        if ($content -match "C:\\Omsystems[^\\]" -or $content -match "C:/Omsystems[^/]") {
            $pathReferences += $file
            Write-Host "  FOUND: Path reference in $file" -ForegroundColor Yellow
        }
    }
}

if ($pathReferences.Count -gt 0) {
    Write-Host "  ! Found path references in $($pathReferences.Count) file(s)" -ForegroundColor Yellow
    Write-Host "  → These will need manual review after migration" -ForegroundColor Cyan
} else {
    Write-Host "  ✓ No hardcoded path references found" -ForegroundColor Green
}
Write-Host ""

# Step 5: Test target workspace
Write-Host "[5/8] Testing target workspace..." -ForegroundColor Cyan

Push-Location $targetPath

try {
    # Check if node_modules exists
    if (Test-Path "node_modules") {
        Write-Host "  ✓ node_modules exists" -ForegroundColor Green
    } else {
        Write-Host "  ! node_modules missing (run npm install after migration)" -ForegroundColor Yellow
    }
    
    # Check if package.json exists
    if (Test-Path "package.json") {
        Write-Host "  ✓ package.json exists" -ForegroundColor Green
    } else {
        Write-Host "  ERROR: package.json missing!" -ForegroundColor Red
        exit 1
    }
    
    # Check if tsconfig.json exists
    if (Test-Path "tsconfig.json") {
        Write-Host "  ✓ tsconfig.json exists" -ForegroundColor Green
    } else {
        Write-Host "  WARNING: tsconfig.json missing" -ForegroundColor Yellow
    }
} finally {
    Pop-Location
}

Write-Host ""

# Step 6: Create backup (if not dry run)
Write-Host "[6/8] Creating backup..." -ForegroundColor Cyan

if (-not $DryRun) {
    Write-Host "  Creating backup at: $backupPath" -ForegroundColor Yellow
    
    # Only backup parent-level unique files (not the entire parent)
    New-Item -ItemType Directory -Path $backupPath -Force | Out-Null
    
    foreach ($uniqueFile in $uniqueFiles) {
        $relativePath = $uniqueFile.Replace($parentPath + "\", "")
        $backupFile = Join-Path $backupPath $relativePath
        $backupDir = Split-Path $backupFile -Parent
        
        if (-not (Test-Path $backupDir)) {
            New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
        }
        
        Copy-Item $uniqueFile $backupFile -Recurse -Force
    }
    
    Write-Host "  ✓ Backup created" -ForegroundColor Green
} else {
    Write-Host "  [DRY RUN] Would create backup at: $backupPath" -ForegroundColor Yellow
}

Write-Host ""

# Step 7: Copy unique files to target
Write-Host "[7/8] Copying unique files to target..." -ForegroundColor Cyan

if ($uniqueFiles.Count -gt 0) {
    foreach ($uniqueFile in $uniqueFiles) {
        $itemName = Split-Path $uniqueFile -Leaf
        $targetItem = Join-Path $targetPath $itemName
        
        if (-not $DryRun) {
            Write-Host "  Copying: $itemName" -ForegroundColor Yellow
            Copy-Item $uniqueFile $targetItem -Recurse -Force
            Write-Host "  ✓ Copied: $itemName" -ForegroundColor Green
        } else {
            Write-Host "  [DRY RUN] Would copy: $itemName" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "  ✓ No unique files to copy" -ForegroundColor Green
}

Write-Host ""

# Step 8: Copy audit reports
Write-Host "[8/8] Ensuring audit reports are in target..." -ForegroundColor Cyan

$auditFiles = @(
    "PRODUCTION_AUDIT.md",
    "FEATURE_MATRIX.json", 
    "CRITICAL_IMPLEMENTATION_PLAN.md",
    "PRODUCTION_READINESS_SUMMARY.md",
    "WORKSPACE_MIGRATION_PLAN.md"
)

$targetDocsPath = Join-Path $targetPath "docs"

if (-not (Test-Path $targetDocsPath) -and -not $DryRun) {
    New-Item -ItemType Directory -Path $targetDocsPath -Force | Out-Null
}

foreach ($file in $auditFiles) {
    $sourceFile = Join-Path $parentDocs $file
    $targetFile = Join-Path $targetDocsPath $file
    
    if ((Test-Path $sourceFile) -and -not (Test-Path $targetFile)) {
        if (-not $DryRun) {
            Copy-Item $sourceFile $targetFile -Force
            Write-Host "  ✓ Copied: $file" -ForegroundColor Green
        } else {
            Write-Host "  [DRY RUN] Would copy: $file" -ForegroundColor Yellow
        }
    }
}

Write-Host ""

# Summary
Write-Host "=== MIGRATION SUMMARY ===" -ForegroundColor Cyan
Write-Host ""

if ($DryRun) {
    Write-Host "DRY RUN COMPLETE - No changes were made" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To perform the actual migration, run:" -ForegroundColor Cyan
    Write-Host "  .\MIGRATE_WORKSPACE.ps1 -DryRun:`$false" -ForegroundColor White
    Write-Host ""
    Write-Host "To proceed despite uncommitted changes:" -ForegroundColor Cyan
    Write-Host "  .\MIGRATE_WORKSPACE.ps1 -DryRun:`$false -Force" -ForegroundColor White
} else {
    Write-Host "✓ Migration completed successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "  1. Close and reopen your IDE/terminal" -ForegroundColor White
    Write-Host "  2. Navigate to: cd C:\Omsystems\Omsystems" -ForegroundColor White
    Write-Host "  3. Run: npm install" -ForegroundColor White
    Write-Host "  4. Run: npm run typecheck:all" -ForegroundColor White
    Write-Host "  5. Run: npm run test:smoke" -ForegroundColor White
    Write-Host ""
    Write-Host "Backup location: $backupPath" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Once verified working, you can safely delete:" -ForegroundColor Yellow
    Write-Host "  - Parent-level duplicate files in C:\Omsystems" -ForegroundColor White
    Write-Host "  (Keep C:\Omsystems\Omsystems as your workspace)" -ForegroundColor White
}

Write-Host ""
Write-Host "=== END ===" -ForegroundColor Cyan
