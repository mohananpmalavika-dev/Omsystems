# Render Deployment Initialization Script
# Run this after successful Render deployment to initialize CCTV infrastructure

param(
    [Parameter(Mandatory=$true)]
    [string]$ApiUrl,
    
    [Parameter(Mandatory=$false)]
    [string]$UserId = "user-global-admin"
)

# Colors for output
function Write-Success { Write-Host "✅ $args" -ForegroundColor Green }
function Write-Error { Write-Host "❌ $args" -ForegroundColor Red }
function Write-Info { Write-Host "ℹ️  $args" -ForegroundColor Blue }
function Write-Warning { Write-Host "⚠️  $args" -ForegroundColor Yellow }

Write-Host ""
Write-Host "🚀 Sentinel Grid - Render Deployment Initialization" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host ""

# Ensure URL doesn't end with slash
$ApiUrl = $ApiUrl.TrimEnd('/')

Write-Info "API URL: $ApiUrl"
Write-Info "User ID: $UserId"
Write-Host ""

# Test API connectivity
Write-Info "Testing API connectivity..."
try {
    $health = Invoke-RestMethod -Uri "$ApiUrl/health" -Method Get
    if ($health.status -eq "ok") {
        Write-Success "API is healthy"
    } else {
        Write-Error "API health check failed"
        exit 1
    }
} catch {
    Write-Error "Cannot connect to API: $_"
    Write-Warning "Make sure the API service is running and the URL is correct"
    exit 1
}

# Get all branches
Write-Host ""
Write-Info "Fetching branches..."
try {
    $headers = @{ "x-user-id" = $UserId }
    $response = Invoke-RestMethod -Uri "$ApiUrl/v1/branches" -Method Get -Headers $headers
    $branches = $response.data
    
    if ($branches.Count -eq 0) {
        Write-Warning "No branches found. You need to create branches first."
        Write-Info "Use the API or dashboard to create branches, then run this script again."
        exit 0
    }
    
    Write-Success "Found $($branches.Count) branch(es)"
} catch {
    Write-Error "Failed to fetch branches: $_"
    exit 1
}

# Initialize camera requirements for each branch
Write-Host ""
Write-Info "Initializing camera requirements for all branches..."
Write-Host ""

$successCount = 0
$failCount = 0

foreach ($branch in $branches) {
    $branchId = $branch.id
    $branchName = $branch.name
    
    Write-Host "   Processing: $branchName" -ForegroundColor Gray -NoNewline
    
    try {
        $initUrl = "$ApiUrl/v1/branches/$branchId/camera-requirements/initialize"
        $null = Invoke-RestMethod -Uri $initUrl -Method Post -Headers $headers
        Write-Host " ✅" -ForegroundColor Green
        $successCount++
    } catch {
        Write-Host " ❌" -ForegroundColor Red
        Write-Warning "Failed to initialize $branchName : $_"
        $failCount++
    }
    
    Start-Sleep -Milliseconds 100  # Be nice to the API
}

# Summary
Write-Host ""
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "Summary" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan
Write-Success "$successCount branch(es) initialized successfully"
if ($failCount -gt 0) {
    Write-Warning "$failCount branch(es) failed to initialize"
}

# Verify requirements were created
Write-Host ""
Write-Info "Verifying camera requirements..."

try {
    $firstBranch = $branches[0]
    $reqUrl = "$ApiUrl/v1/branches/$($firstBranch.id)/camera-requirements"
    $requirements = Invoke-RestMethod -Uri $reqUrl -Method Get -Headers $headers
    
    if ($requirements.data.Count -gt 0) {
        Write-Success "Camera requirements verified (found $($requirements.data.Count) location types)"
        
        Write-Host ""
        Write-Info "Sample requirements for $($firstBranch.name):"
        $requirements.data | Select-Object -First 5 | ForEach-Object {
            Write-Host "   - $($_.locationType): $($_.requiredCount) camera(s) required (Priority: $($_.priority))" -ForegroundColor Gray
        }
    } else {
        Write-Warning "No requirements found. Initialization may have failed."
    }
} catch {
    Write-Warning "Could not verify requirements: $_"
}

# Check for coverage gaps
Write-Host ""
Write-Info "Checking coverage gaps..."

try {
    $firstBranch = $branches[0]
    $gapsUrl = "$ApiUrl/v1/branches/$($firstBranch.id)/coverage-gaps"
    $gaps = Invoke-RestMethod -Uri $gapsUrl -Method Get -Headers $headers
    
    if ($gaps.data.Count -gt 0) {
        Write-Warning "Found $($gaps.data.Count) coverage gap(s) in $($firstBranch.name)"
        
        Write-Host ""
        Write-Info "Top coverage gaps (priority 1-2):"
        $gaps.data | Where-Object { $_.priority -le 2 } | Select-Object -First 5 | ForEach-Object {
            Write-Host "   - $($_.locationType): Need $($_.gapCount) camera(s) [Priority $($_.priority)]" -ForegroundColor Yellow
        }
    } else {
        Write-Success "No coverage gaps found in $($firstBranch.name)"
    }
} catch {
    Write-Warning "Could not check coverage gaps: $_"
}

# Next steps
Write-Host ""
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "Next Steps" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Add cameras to branches using the camera discovery workflow"
Write-Host "2. Set camera location types and physical types"
Write-Host "3. Add camera specifications (resolution, frame rate, etc.)"
Write-Host "4. Record compliance status for each camera"
Write-Host "5. Monitor coverage gaps: $ApiUrl/v1/branches/{id}/coverage-gaps"
Write-Host "6. Generate compliance reports: $ApiUrl/v1/branches/{id}/compliance-summary"
Write-Host ""
Write-Success "Initialization complete! 🎉"
Write-Host ""

# Documentation links
Write-Info "Documentation:"
Write-Host "   - API Reference: CCTV_INFRASTRUCTURE_INTEGRATION.md"
Write-Host "   - Quick Reference: CCTV_QUICK_REFERENCE.md"
Write-Host "   - Standards Guide: docs/cctv-infrastructure-standards.md"
Write-Host ""
