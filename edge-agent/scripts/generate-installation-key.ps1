# Generate Installation Keys for Branch Offices
# Run this to create installation keys for each branch

param(
    [Parameter(Mandatory=$false)]
    [string]$BranchName,
    
    [Parameter(Mandatory=$false)]
    [int]$Count = 1
)

function New-InstallationKey {
    # Generate a secure random key (32 bytes = 64 hex characters)
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    $key = [System.BitConverter]::ToString($bytes).Replace('-', '').ToLower()
    return $key
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Sentinel Grid Installation Key Generator" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if ($BranchName) {
    # Generate single key for specific branch
    $key = New-InstallationKey
    Write-Host "Installation Key for: $BranchName" -ForegroundColor Green
    Write-Host "Key: $key" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "IMPORTANT: Save this key securely!" -ForegroundColor Red
    Write-Host "Provide this key to the branch manager for installation." -ForegroundColor Yellow
    
    # Save to file
    $timestamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
    $filename = "installation-keys-$timestamp.txt"
    $content = @"
Sentinel Grid Edge Agent - Installation Key
============================================

Branch Name: $branchName
Installation Key: $key
Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

DISTRIBUTION INSTRUCTIONS:
1. Send this key securely to the branch manager
2. Do NOT share publicly or via unsecured channels
3. Each key should be used for one branch only

INSTALLATION STEPS FOR BRANCH:
1. Download SentinelGridEdgeAgentInstaller.exe
2. Double-click to run the installer
3. Enter branch name: $BranchName
4. Enter this installation key
5. Click Install

For support: Contact IT Administrator
"@
    Set-Content -Path $filename -Value $content -Encoding UTF8
    Write-Host "Key saved to: $filename" -ForegroundColor Green
    
} else {
    # Generate multiple keys
    Write-Host "Generating $Count installation key(s)..." -ForegroundColor Yellow
    Write-Host ""
    
    $keys = @()
    for ($i = 1; $i -le $Count; $i++) {
        $key = New-InstallationKey
        $keys += [PSCustomObject]@{
            Number = $i
            Key = $key
            Generated = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        }
        Write-Host "Key $i : $key" -ForegroundColor Green
    }
    
    # Save to file
    $timestamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
    $filename = "installation-keys-batch-$timestamp.txt"
    $content = @"
Sentinel Grid Edge Agent - Installation Keys
============================================

Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
Total Keys: $Count

KEYS:
-----
"@
    
    foreach ($keyObj in $keys) {
        $content += "`nKey $($keyObj.Number):`n$($keyObj.Key)`n"
    }
    
    $content += @"

DISTRIBUTION INSTRUCTIONS:
1. Assign each key to a specific branch
2. Keep a record of which key goes to which branch
3. Send keys securely to branch managers
4. Do NOT share publicly or via unsecured channels

INSTALLATION STEPS FOR BRANCHES:
1. Download SentinelGridEdgeAgentInstaller.exe
2. Double-click to run the installer
3. Enter branch name (e.g., "Downtown Branch")
4. Enter the assigned installation key
5. Click Install

For support: Contact IT Administrator
"@
    
    Set-Content -Path $filename -Value $content -Encoding UTF8
    Write-Host ""
    Write-Host "Keys saved to: $filename" -ForegroundColor Green
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Example usage
Write-Host "USAGE EXAMPLES:" -ForegroundColor Yellow
Write-Host "  Generate 1 key for specific branch:" -ForegroundColor Gray
Write-Host "    .\generate-installation-key.ps1 -BranchName 'Downtown Branch'" -ForegroundColor Gray
Write-Host ""
Write-Host "  Generate 10 keys for multiple branches:" -ForegroundColor Gray
Write-Host "    .\generate-installation-key.ps1 -Count 10" -ForegroundColor Gray
Write-Host ""
