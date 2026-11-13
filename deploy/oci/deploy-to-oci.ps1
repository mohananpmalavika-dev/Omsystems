# ==============================================================================
# Sentinel Grid / KryptonVision - 1-Click OCI Remote Deployment (PowerShell)
# ==============================================================================
param (
    [string]$PublicIp = "",
    [string]$KeyPath = "",
    [string]$User = "ubuntu",
    [string]$Domain = ""
)

$ErrorActionPreference = "Stop"

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "  🚀 KryptonLogic / OM Systems - Oracle Cloud Remote Deployer   " -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan

if ([string]::IsNullOrWhiteSpace($PublicIp)) {
    $PublicIp = Read-Host "Enter your Oracle Cloud Instance Public IP"
}
if ([string]::IsNullOrWhiteSpace($PublicIp)) {
    Write-Error "Public IP is required."
    exit 1
}

if ([string]::IsNullOrWhiteSpace($KeyPath)) {
    $defaultKey = "$env:USERPROFILE\.ssh\id_rsa"
    if (Test-Path $defaultKey) {
        $KeyPath = $defaultKey
        Write-Host "Using default SSH key: $KeyPath" -ForegroundColor Yellow
    } else {
        $KeyPath = Read-Host "Enter path to your SSH Private Key (.key / .pem)"
    }
}

if (-not (Test-Path $KeyPath)) {
    Write-Error "SSH Key not found at '$KeyPath'."
    exit 1
}

if ([string]::IsNullOrWhiteSpace($User)) {
    $User = Read-Host "Enter SSH Username (default: ubuntu, or opc for Oracle Linux) [ubuntu]"
    if ([string]::IsNullOrWhiteSpace($User)) { $User = "ubuntu" }
}

if ([string]::IsNullOrWhiteSpace($Domain)) {
    $Domain = Read-Host "Enter custom domain (e.g. cctv.omsystemandservice.in, or press Enter for automatic sslip.io HTTPS)"
}

Write-Host "`nConnecting to Oracle Cloud VM at $User@$PublicIp..." -ForegroundColor Yellow

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$localSetupScript = Join-Path $scriptDir "setup-oci-vm.sh"
$localCompose = Join-Path $scriptDir "docker-compose.oci.yml"
$localCaddy = Join-Path $scriptDir "Caddyfile"

Write-Host "Uploading deployment manifests and setup script..." -ForegroundColor Cyan
& scp -i "$KeyPath" -o StrictHostKeyChecking=no "$localSetupScript" "$localCompose" "$localCaddy" "${User}@${PublicIp}:/tmp/"

Write-Host "Executing setup on OCI instance (this will take ~3-5 minutes)..." -ForegroundColor Cyan
& ssh -i "$KeyPath" -o StrictHostKeyChecking=no "${User}@${PublicIp}" "chmod +x /tmp/setup-oci-vm.sh && sudo /tmp/setup-oci-vm.sh '$Domain'"

Write-Host "`n✅ Oracle Cloud Deployment Completed!" -ForegroundColor Green
if (-not [string]::IsNullOrWhiteSpace($Domain)) {
    Write-Host "🌐 Live HTTPS URL: https://$Domain" -ForegroundColor Green
} else {
    $cleanIp = $PublicIp -replace '\.', '-'
    Write-Host "🌐 Live HTTPS URL: https://$cleanIp.sslip.io" -ForegroundColor Green
}
Write-Host "🔑 Default Login: krypton / 4344@RAM" -ForegroundColor Yellow
