# =================================================================
# Sentinel Grid (KryptoVision) - Automated GCP Production Deployment
# =================================================================
param (
    [string]$Zone = "asia-south1-b",
    [string]$MachineType = "e2-standard-8",
    [string]$InstanceName = "kryptovision-server",
    [int]$DiskSizeGb = 80,
    [switch]$SkipEdgeUpload
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Assert-LastNativeCommandSucceeded([string]$Operation) {
    if ($LASTEXITCODE -ne 0) {
        throw "$Operation failed with exit code $LASTEXITCODE. No deployment changes were applied."
    }
}

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
$activeAccount = (& gcloud auth list --filter="status:ACTIVE" --format="value(account)" 2>$null)
if ($activeAccount) { $activeAccount = "$activeAccount".Trim() }
if ([string]::IsNullOrWhiteSpace($activeAccount)) {
    Write-Host "No active account found. Initiating gcloud auth login..." -ForegroundColor Yellow
    & gcloud auth login
    $activeAccount = (& gcloud auth list --filter="status:ACTIVE" --format="value(account)" 2>$null)
    if ($activeAccount) { $activeAccount = "$activeAccount".Trim() }
}
Write-Host "✅ Authenticated as: $activeAccount" -ForegroundColor Green

# 3. Check Project
$currentProject = (& gcloud config get-value project 2>$null)
if ($currentProject) { $currentProject = "$currentProject".Trim() }
if ([string]::IsNullOrWhiteSpace($currentProject) -or $currentProject -eq "(unset)") {
    $defaultProject = "project-7866fc3f-5dd5-4495-804"
    Write-Host "No active GCP project selected. Setting default project: $defaultProject..." -ForegroundColor Yellow
    & gcloud config set project $defaultProject
    $currentProject = $defaultProject
}
Write-Host "✅ Target Project: $currentProject" -ForegroundColor Green

# 4. Enable Compute Engine API
Write-Host "Enabling Google Compute Engine API (this takes ~15 seconds)..." -ForegroundColor Yellow
& gcloud services enable compute.googleapis.com --project=$currentProject

# 5. Create Firewall Rules if not present
Write-Host "Configuring Google Cloud Firewall Rules..." -ForegroundColor Yellow
$existingFirewall = (& gcloud compute firewall-rules list --filter="name=allow-kryptovision" --format="value(name)" 2>$null)
if ($existingFirewall) { $existingFirewall = "$existingFirewall".Trim() }
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
Write-Host "Checking for existing VM '$InstanceName' in $currentProject..." -ForegroundColor Yellow
$foundZone = (& gcloud compute instances list --filter="name=$InstanceName" --format="value(zone)" --project=$currentProject 2>$null)
if ($foundZone) {
    $Zone = "$foundZone".Trim()
    $existingVm = $InstanceName
    Write-Host "✅ Found '$InstanceName' running in zone: $Zone" -ForegroundColor Green
} else {
    $existingVm = $null
    Write-Host "Instance '$InstanceName' not found. Will create in zone: $Zone..." -ForegroundColor Yellow
}

if ([string]::IsNullOrWhiteSpace($existingVm)) {
    Write-Host "Creating High-Performance GCE Instance (${MachineType}: 4 vCPU, 16 GB RAM in $Zone)..." -ForegroundColor Cyan
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
    Write-Host "VM '$InstanceName' already exists in $Zone. Updating startup metadata..." -ForegroundColor Yellow
    & gcloud compute instances add-metadata $InstanceName `
        --zone=$Zone `
        --metadata-from-file="startup-script=$startupScriptPath" `
        --project=$currentProject

    # Verify or upload authentic edge-agent.exe if needed
    if (-not $SkipEdgeUpload) {
        $localManifest = Join-Path $scriptDir "..\..\edge-agent\release\windows-release.json"
        $localExe = Join-Path $scriptDir "..\..\edge-agent\release\edge-agent.exe"
        if ((Test-Path $localExe) -and (Test-Path $localManifest)) {
            $manifestJson = Get-Content $localManifest -Raw | ConvertFrom-Json
            $expectedHash = $manifestJson.sha256.ToLower()
            $installerFile = "$($manifestJson.installerFile)"
            if ($installerFile -notmatch '^KryptonVisionInstaller-v[0-9A-Za-z.-]+-windows\.exe$' -or "$($manifestJson.installerSha256)" -notmatch '^[a-fA-F0-9]{64}$') {
                throw "The Windows release manifest must include a valid native installer filename and checksum."
            }
            $localInstaller = Join-Path $scriptDir "..\..\edge-agent\installer\windows\output\$installerFile"
            if (-not (Test-Path $localInstaller -PathType Leaf)) {
                throw "Missing native Windows installer: $localInstaller"
            }
            $expectedInstallerHash = "$($manifestJson.installerSha256)".ToLower()
            Write-Host "Verifying Edge Agent release integrity on $InstanceName..." -ForegroundColor Yellow
            $remoteHash = (& gcloud compute ssh $InstanceName --zone=$Zone --project=$currentProject --quiet `
                --command="sha256sum /opt/sentinel-grid/edge-agent/release/edge-agent.exe 2>/dev/null | cut -d ' ' -f 1" 2>$null)
            $remoteInstallerHash = (& gcloud compute ssh $InstanceName --zone=$Zone --project=$currentProject --quiet `
                --command="sha256sum /opt/sentinel-grid/edge-agent/installer/windows/output/$installerFile 2>/dev/null | cut -d ' ' -f 1" 2>$null)
            if ($remoteHash) { $remoteHash = "$remoteHash".Trim().ToLower() }
            if ($remoteInstallerHash) { $remoteInstallerHash = "$remoteInstallerHash".Trim().ToLower() }

            if ($remoteHash -ne $expectedHash -or $remoteInstallerHash -ne $expectedInstallerHash) {
                $installerBucket = "gs://kryptovision-installer-7866fc3f"
                Write-Host "Uploading Edge Agent release artifacts via Google Cloud Storage ($installerBucket)..." -ForegroundColor Cyan
                if ($remoteInstallerHash -ne $expectedInstallerHash) {
                    Write-Host "Uploading Windows installer to $installerBucket..." -ForegroundColor Yellow
                    & gcloud storage cp "$localInstaller" "$installerBucket/$installerFile" --project=$currentProject
                    Assert-LastNativeCommandSucceeded "Uploading the Edge Agent installer to GCS"
                }
                if ($remoteHash -ne $expectedHash) {
                    Write-Host "Uploading Edge Agent executable to $installerBucket..." -ForegroundColor Yellow
                    & gcloud storage cp "$localExe" "$installerBucket/edge-agent.exe" --project=$currentProject
                    Assert-LastNativeCommandSucceeded "Uploading the Edge Agent binary to GCS"
                }
                & gcloud storage cp "$localManifest" "$installerBucket/windows-release.json" --project=$currentProject
                Assert-LastNativeCommandSucceeded "Uploading the Windows release manifest to GCS"

                Write-Host "Installing release artifacts on $InstanceName from GCS..." -ForegroundColor Cyan
                & gcloud compute ssh $InstanceName --zone=$Zone --project=$currentProject --quiet `
                    --command="sudo install -d /opt/sentinel-grid/edge-agent/release /opt/sentinel-grid/edge-agent/installer/windows/output && sudo gcloud storage cp $installerBucket/$installerFile /opt/sentinel-grid/edge-agent/installer/windows/output/$installerFile && sudo gcloud storage cp $installerBucket/windows-release.json /opt/sentinel-grid/edge-agent/release/windows-release.json && sudo chmod 644 /opt/sentinel-grid/edge-agent/release/* /opt/sentinel-grid/edge-agent/installer/windows/output/$installerFile"
                Assert-LastNativeCommandSucceeded "Installing the Edge Agent release artifacts on the VM"
                Write-Host "✅ Edge Agent release binary and manifest uploaded and installed." -ForegroundColor Green
            } else {
                Write-Host "✅ Edge Agent release already matches signed manifest on $InstanceName." -ForegroundColor Green
            }
        }
    }

    Write-Host "Triggering live container rebuild and restart on $InstanceName ($Zone)..." -ForegroundColor Cyan
    & gcloud compute ssh $InstanceName --zone=$Zone --project=$currentProject --quiet `
        --command="sudo rm -f /tmp/deploy.log && sudo sh -c 'cd /opt/sentinel-grid && git fetch origin main && git reset --hard origin/main && nohup bash deploy/gcp/update-live.sh > /tmp/deploy.log 2>&1 &'"
    Assert-LastNativeCommandSucceeded "Triggering the live control plane rebuild"

    Write-Host "Monitoring build and restart progress on $InstanceName..." -ForegroundColor Cyan
    $completed = $false
    $timeoutSeconds = 600
    $startTime = [DateTime]::UtcNow
    while (-not $completed -and ([DateTime]::UtcNow - $startTime).TotalSeconds -lt $timeoutSeconds) {
        Start-Sleep -Seconds 4
        $logTail = (& gcloud compute ssh $InstanceName --zone=$Zone --project=$currentProject --quiet `
            --command="sudo cat /tmp/deploy.log 2>/dev/null | tail -n 12" 2>$null)
        if ($logTail -match "Update complete!") {
            $completed = $true
            Write-Host $logTail -ForegroundColor Green
            break
        }
    }
    if (-not $completed) {
        throw "Deployment timed out waiting for container rebuild. Check /tmp/deploy.log on $InstanceName."
    }
}

# 8. Fetch Public External IP
Write-Host "Retrieving Public IP address..." -ForegroundColor Yellow
$externalIp = (& gcloud compute instances describe $InstanceName --zone=$Zone --format="get(networkInterfaces[0].accessConfigs[0].natIP)" --project=$currentProject 2>$null)
if ($externalIp) { $externalIp = "$externalIp".Trim() }

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
