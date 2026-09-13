# =================================================================
# Sentinel Grid (KryptoVision) - Automated GCP Production Deployment
# =================================================================
param (
    [string]$Zone = "asia-south1-a",
    [string]$MachineType = "e2-standard-4",
    [string]$InstanceName = "kryptovision-server",
    [int]$DiskSizeGb = 50
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "🚀 Sentinel Grid - Deploying to Google Cloud Platform" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

# 1. Check gcloud CLI
$gcloudCmd = Get-Command "gcloud" -ErrorAction SilentlyContinue
if (-not $gcloudCmd) {
    # Check default install locations
    $defaultPaths = @(
        "$env:LOCALAPPDATA\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd",
        "$env:ProgramFiles\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd",
        "${env:ProgramFiles(x86)}\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
    )
    foreach ($p in $defaultPaths) {
        if (Test-Path $p) {
            $env:PATH = "$([System.IO.Path]::GetDirectoryName($p));$env:PATH"
            $gcloudCmd = Get-Command "gcloud" -ErrorAction SilentlyContinue
            break
        }
    }
}

if (-not $gcloudCmd) {
    Write-Error "gcloud CLI is not found in PATH yet. Please restart PowerShell or complete gcloud installation."
    exit 1
}

# 2. Check Auth
Write-Host "Checking active GCP authentication..." -ForegroundColor Yellow
$activeAccount = (& gcloud auth list --filter="status:ACTIVE" --format="value(account)").Trim()
if ([string]::IsNullOrWhiteSpace($activeAccount)) {
    Write-Host "No active account found. Initiating gcloud auth login..." -ForegroundColor Yellow
    & gcloud auth login
    $activeAccount = (& gcloud auth list --filter="status:ACTIVE" --format="value(account)").Trim()
}
Write-Host "✅ Authenticated as: $activeAccount" -ForegroundColor Green

# 3. Check Project
$currentProject = (& gcloud config get-value project 2>$null).Trim()
if ([string]::IsNullOrWhiteSpace($currentProject) -or $currentProject -eq "(unset)") {
    Write-Host "No active GCP project selected. Fetching your available projects..." -ForegroundColor Yellow
    & gcloud projects list
    $projectChoice = Read-Host "Please enter your GCP Project ID"
    & gcloud config set project $projectChoice
    $currentProject = $projectChoice
}
Write-Host "✅ Target Project: $currentProject" -ForegroundColor Green

# 4. Enable Compute Engine API
Write-Host "Enabling Google Compute Engine API (this takes ~15 seconds)..." -ForegroundColor Yellow
& gcloud services enable compute.googleapis.com --project=$currentProject

# 5. Create Firewall Rules if not present
Write-Host "Configuring Google Cloud Firewall Rules..." -ForegroundColor Yellow
$existingFirewall = (& gcloud compute firewall-rules list --filter="name=allow-kryptovision" --format="value(name)" 2>$null).Trim()
if ([string]::IsNullOrWhiteSpace($existingFirewall)) {
    & gcloud compute firewall-rules create allow-kryptovision `
        --allow="tcp:80,tcp:443,tcp:8080,tcp:8090,tcp:8091,tcp:8092,tcp:8554,tcp:8888,tcp:10000,udp:8189" `
        --target-tags="kryptovision-server" `
        --description="Allow web, stream, and management traffic for Sentinel Grid" `
        --project=$currentProject
    Write-Host "✅ Firewall rules created." -ForegroundColor Green
} else {
    Write-Host "✅ Firewall rules already configured." -ForegroundColor Green
}

# 6. Prepare Startup Script
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$startupScriptPath = Join-Path $scriptDir "startup-script.sh"
if (-not (Test-Path $startupScriptPath)) {
    Write-Error "startup-script.sh not found in $scriptDir"
    exit 1
}

# 7. Check if VM exists
Write-Host "Checking if VM '$InstanceName' already exists in $Zone..." -ForegroundColor Yellow
$existingVm = (& gcloud compute instances list --filter="name=$InstanceName AND zone:($Zone)" --format="value(name)" 2>$null).Trim()

if ([string]::IsNullOrWhiteSpace($existingVm)) {
    Write-Host "Creating High-Performance GCE Instance ($MachineType: 4 vCPU, 16 GB RAM in $Zone)..." -ForegroundColor Cyan
    & gcloud compute instances create $InstanceName `
        --zone=$Zone `
        --machine-type=$MachineType `
        --image-family="ubuntu-2204-lts" `
        --image-project="ubuntu-os-cloud" `
        --boot-disk-size="${DiskSizeGb}GB" `
        --boot-disk-type="pd-balanced" `
        --tags="kryptovision-server" `
        --metadata-from-file="startup-script=$startupScriptPath" `
        --project=$currentProject
    Write-Host "✅ VM created successfully!" -ForegroundColor Green
} else {
    Write-Host "VM '$InstanceName' already exists. Updating startup metadata..." -ForegroundColor Yellow
    & gcloud compute instances add-metadata $InstanceName `
        --zone=$Zone `
        --metadata-from-file="startup-script=$startupScriptPath" `
        --project=$currentProject
}

# 8. Fetch Public External IP
Write-Host "Retrieving Public IP address..." -ForegroundColor Yellow
$externalIp = (& gcloud compute instances describe $InstanceName --zone=$Zone --format="get(networkInterfaces[0].accessConfigs[0].natIP)" --project=$currentProject).Trim()

Write-Host "========================================================" -ForegroundColor Green
Write-Host "🎉 Sentinel Grid (KryptoVision) GCP Deployment Initiated!" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Green
Write-Host "Public IP: $externalIp" -ForegroundColor Cyan
Write-Host "Web Dashboard URL: http://$externalIp" -ForegroundColor Cyan
Write-Host "Direct Dashboard Port: http://$externalIp:10000" -ForegroundColor Cyan
Write-Host "Control Plane Health: http://$externalIp/health" -ForegroundColor Cyan
Write-Host ""
Write-Host "Note: The VM startup script will take ~2-3 minutes to download Docker images and compile containers." -ForegroundColor Yellow
Write-Host "You can monitor live startup logs with:" -ForegroundColor Gray
Write-Host "gcloud compute ssh $InstanceName --zone=$Zone --command='sudo journalctl -u google-startup-scripts.service -f'" -ForegroundColor Gray
Write-Host "========================================================" -ForegroundColor Green
