#Requires -Version 5.1
<#
.SYNOPSIS
    Delete cameras and edge agents from the database.

.DESCRIPTION
    Safely deletes all cameras, edge agents, and related data from the database.
    Supports tenant filtering and provides confirmation prompts.

.PARAMETER TenantId
    Optional tenant ID to filter deletion. If not provided, deletes from all tenants.

.PARAMETER Force
    Skip confirmation prompts.

.PARAMETER WhatIf
    Show what would be deleted without actually deleting.

.EXAMPLE
    .\Delete-Cameras.ps1
    Delete all cameras and edge agents (prompts for confirmation)

.EXAMPLE
    .\Delete-Cameras.ps1 -TenantId "123e4567-e89b-12d3-a456-426614174000"
    Delete cameras for specific tenant

.EXAMPLE
    .\Delete-Cameras.ps1 -Force
    Delete without confirmation prompts

.EXAMPLE
    .\Delete-Cameras.ps1 -WhatIf
    Preview what would be deleted
#>

[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory=$false)]
    [string]$TenantId,
    
    [Parameter(Mandatory=$false)]
    [switch]$Force,
    
    [Parameter(Mandatory=$false)]
    [switch]$WhatIf
)

# Database connection parameters
$DbHost = $env:DB_HOST ?? "localhost"
$DbPort = $env:DB_PORT ?? "5432"
$DbName = $env:DB_NAME ?? "omsystems"
$DbUser = $env:DB_USER ?? "postgres"
$DbPassword = $env:DB_PASSWORD ?? "postgres"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "DELETE CAMERAS AND EDGE AGENTS" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

if ($WhatIf) {
    Write-Host "🔍 PREVIEW MODE - No data will be deleted" -ForegroundColor Yellow
    Write-Host ""
}

if ($TenantId) {
    Write-Host "🎯 Tenant Filter: $TenantId" -ForegroundColor Green
} else {
    Write-Host "⚠️  Scope: ALL TENANTS" -ForegroundColor Yellow
}

Write-Host ""

# Build PostgreSQL connection string
$env:PGPASSWORD = $DbPassword
$PsqlArgs = @(
    "-h", $DbHost,
    "-p", $DbPort,
    "-U", $DbUser,
    "-d", $DbName,
    "-t",  # Tuples only
    "-A"   # Unaligned output
)

# Check if psql is available
try {
    $null = Get-Command psql -ErrorAction Stop
} catch {
    Write-Host "❌ Error: PostgreSQL client (psql) not found in PATH" -ForegroundColor Red
    Write-Host ""
    Write-Host "Install PostgreSQL client or add it to PATH." -ForegroundColor Yellow
    exit 1
}

# Build tenant filter
$TenantFilter = if ($TenantId) { "WHERE rn.tenant_id = '$TenantId'" } else { "" }
$EdgeTenantFilter = if ($TenantId) { "WHERE tenant_id = '$TenantId'" } else { "" }

# Get preview counts
Write-Host "📊 Analyzing database..." -ForegroundColor Cyan
Write-Host ""

$CountQuery = @"
SELECT
  (SELECT COUNT(*) FROM cameras c 
   JOIN resource_nodes rn ON c.resource_node_id = rn.id
   $TenantFilter) as cameras,
  (SELECT COUNT(*) FROM edge_agents
   $EdgeTenantFilter) as edge_agents,
  (SELECT COUNT(*) FROM camera_discoveries
   $EdgeTenantFilter) as discoveries,
  (SELECT COUNT(*) FROM live_sessions ls
   JOIN cameras c ON ls.camera_id = c.id
   JOIN resource_nodes rn ON c.resource_node_id = rn.id
   $TenantFilter) as live_sessions,
  (SELECT COUNT(*) FROM resource_nodes
   WHERE node_type = 'camera'
   $(if ($TenantId) { "AND tenant_id = '$TenantId'" })) as resource_nodes;
"@

$Counts = psql @PsqlArgs -c $CountQuery 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Error: Failed to connect to database" -ForegroundColor Red
    exit 1
}

$CountValues = $Counts -split '\|'
$CameraCount = [int]$CountValues[0]
$EdgeAgentCount = [int]$CountValues[1]
$DiscoveryCount = [int]$CountValues[2]
$LiveSessionCount = [int]$CountValues[3]
$ResourceNodeCount = [int]$CountValues[4]

Write-Host "Records to be deleted:" -ForegroundColor White
Write-Host "  Cameras:            $CameraCount"
Write-Host "  Edge Agents:        $EdgeAgentCount"
Write-Host "  Camera Discoveries: $DiscoveryCount"
Write-Host "  Live Sessions:      $LiveSessionCount"
Write-Host "  Resource Nodes:     $ResourceNodeCount"
Write-Host ""

$TotalRecords = $CameraCount + $EdgeAgentCount + $DiscoveryCount + $LiveSessionCount + $ResourceNodeCount

if ($TotalRecords -eq 0) {
    Write-Host "✓ No records to delete." -ForegroundColor Green
    exit 0
}

if ($WhatIf) {
    Write-Host "✓ Preview complete. No data was deleted." -ForegroundColor Green
    exit 0
}

# Confirm deletion
if (-not $Force) {
    Write-Host "⚠️  WARNING: This operation is IRREVERSIBLE!" -ForegroundColor Red
    Write-Host "⚠️  Data will be permanently deleted!" -ForegroundColor Red
    Write-Host ""
    
    $Confirm = Read-Host "Type 'DELETE' to confirm"
    
    if ($Confirm -ne "DELETE") {
        Write-Host ""
        Write-Host "❌ Deletion cancelled." -ForegroundColor Yellow
        exit 0
    }
}

Write-Host ""
Write-Host "🗑️  Deleting data..." -ForegroundColor Cyan

# Build deletion SQL
$TenantDeleteFilter = if ($TenantId) { "AND rn.tenant_id = '$TenantId'" } else { "" }
$EdgeDeleteFilter = if ($TenantId) { "AND tenant_id = '$TenantId'" } else { "" }

$DeleteSQL = @"
BEGIN;

-- Delete live sessions
DELETE FROM live_sessions
WHERE camera_id IN (
  SELECT c.id FROM cameras c
  JOIN resource_nodes rn ON c.resource_node_id = rn.id
  WHERE 1=1 $TenantDeleteFilter
);

-- Delete incident_cameras (if exists)
DO \$\$
BEGIN
  DELETE FROM incident_cameras
  WHERE camera_id IN (
    SELECT c.id FROM cameras c
    JOIN resource_nodes rn ON c.resource_node_id = rn.id
    WHERE 1=1 $TenantDeleteFilter
  );
EXCEPTION
  WHEN undefined_table THEN NULL;
END \$\$;

-- Delete camera discoveries
DELETE FROM camera_discoveries
WHERE 1=1 $EdgeDeleteFilter;

-- Delete cameras
DELETE FROM cameras
WHERE id IN (
  SELECT c.id FROM cameras c
  JOIN resource_nodes rn ON c.resource_node_id = rn.id
  WHERE 1=1 $TenantDeleteFilter
);

-- Delete camera resource nodes
DELETE FROM resource_nodes
WHERE node_type = 'camera'
$(if ($TenantId) { "AND tenant_id = '$TenantId'" });

-- Delete edge agents
DELETE FROM edge_agents
WHERE 1=1 $EdgeDeleteFilter;

COMMIT;
"@

# Execute deletion
psql @PsqlArgs -c $DeleteSQL 2>$null

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "❌ Error: Deletion failed" -ForegroundColor Red
    Write-Host "Transaction was rolled back. No data was deleted." -ForegroundColor Yellow
    exit 1
}

# Get final counts
$FinalCounts = psql @PsqlArgs -c $CountQuery 2>$null
$FinalValues = $FinalCounts -split '\|'
$RemainingCameras = [int]$FinalValues[0]
$RemainingEdgeAgents = [int]$FinalValues[1]

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "✓ DELETION COMPLETE" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Remaining records:" -ForegroundColor White
Write-Host "  Cameras:     $RemainingCameras"
Write-Host "  Edge Agents: $RemainingEdgeAgents"
Write-Host ""
Write-Host "✓ Database updated successfully." -ForegroundColor Green
Write-Host ""
