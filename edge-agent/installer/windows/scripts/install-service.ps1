# Sentinel Grid Service Installation Script
# Installs and starts the Windows service

param(
    [string]$AppPath = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "======================================"
Write-Host "  Installing Windows Service"
Write-Host "======================================"
Write-Host ""

try {
    $serviceName = "SentinelGridEdgeAgent"
    $displayName = "Sentinel Grid Edge Agent"
    $description = "Sentinel Grid camera monitoring and AI analysis agent for branch deployment"
    
    $exePath = Join-Path $AppPath "edge-agent.exe"
    $configPath = Join-Path $AppPath "config\edge-agent.env"
    
    # Verify files exist
    if (-not (Test-Path $exePath)) {
        throw "Edge agent executable not found at: $exePath"
    }
    
    if (-not (Test-Path $configPath)) {
        throw "Configuration file not found at: $configPath"
    }
    
    Write-Host "Executable: $exePath"
    Write-Host "Config: $configPath"
    Write-Host ""
    
    # Check if service already exists
    $existingService = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
    
    if ($existingService) {
        Write-Host "⚠️  Service already exists. Removing old service..."
        
        # Stop service if running
        if ($existingService.Status -eq 'Running') {
            Write-Host "   Stopping service..."
            Stop-Service -Name $serviceName -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 2
        }
        
        # Delete service
        Write-Host "   Removing old service..."
        sc.exe delete $serviceName | Out-Null
        Start-Sleep -Seconds 2
    }
    
    Write-Host "Creating Windows service..."
    
    # Create the service using sc.exe for better compatibility
    $binPath = "`"$exePath`" --config `"$configPath`""
    
    $createResult = sc.exe create $serviceName `
        binPath= $binPath `
        start= auto `
        DisplayName= $displayName
    
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to create service. Exit code: $LASTEXITCODE"
    }
    
    Write-Host "✅ Service created successfully"
    
    # Set service description
    sc.exe description $serviceName $description | Out-Null
    
    # Configure service recovery options (restart on failure)
    Write-Host "Configuring service recovery options..."
    sc.exe failure $serviceName reset= 86400 actions= restart/60000/restart/60000/restart/60000 | Out-Null
    
    # Set service to restart after 60 seconds on failure
    sc.exe failureflag $serviceName 1 | Out-Null
    
    Write-Host "✅ Service configured"
    
    # Start the service
    Write-Host ""
    Write-Host "Starting service..."
    
    Start-Service -Name $serviceName
    
    # Wait a moment and check status
    Start-Sleep -Seconds 3
    $service = Get-Service -Name $serviceName
    
    if ($service.Status -eq 'Running') {
        Write-Host "✅ Service started successfully"
        Write-Host ""
        Write-Host "======================================"
        Write-Host "  Installation Complete!"
        Write-Host "======================================"
        Write-Host ""
        Write-Host "Service Status: Running"
        Write-Host "Service Name: $serviceName"
        Write-Host ""
        Write-Host "The Sentinel Grid Edge Agent is now monitoring"
        Write-Host "cameras at this branch location."
        Write-Host ""
        Write-Host "View your branch in the dashboard at:"
        Write-Host "https://sentinel-grid-monitoring1.omrender.com/admin"
        Write-Host ""
        Write-Host "Logs are available at:"
        Write-Host "$AppPath\logs\edge-agent.log"
        Write-Host ""
    } else {
        Write-Host "⚠️  Service is installed but not running"
        Write-Host "   Status: $($service.Status)"
        Write-Host ""
        Write-Host "You can start it manually with:"
        Write-Host "   Start-Service -Name $serviceName"
        Write-Host ""
        Write-Host "Check logs for errors at:"
        Write-Host "   $AppPath\logs\edge-agent.log"
    }
    
    # Create a desktop shortcut to logs folder
    $WshShell = New-Object -ComObject WScript.Shell
    $desktopPath = [Environment]::GetFolderPath("Desktop")
    $shortcutPath = Join-Path $desktopPath "Sentinel Grid Logs.lnk"
    $shortcut = $WshShell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = Join-Path $AppPath "logs"
    $shortcut.Description = "Sentinel Grid Edge Agent Logs"
    $shortcut.Save()

    $dashboardLauncher = Join-Path $AppPath "open-dashboard-scan.ps1"
    if (Test-Path -LiteralPath $dashboardLauncher -PathType Leaf) {
        $protocolKey = "Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Classes\sentinel-grid-scanner"
        $commandKey = Join-Path $protocolKey "shell\open\command"
        New-Item -Path $commandKey -Force | Out-Null
        Set-Item -Path $protocolKey -Value "URL:Sentinel Grid Scanner Protocol"
        New-ItemProperty -Path $protocolKey -Name "URL Protocol" -Value "" -PropertyType String -Force | Out-Null
        $powerShell = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
        $protocolCommand = "`"$powerShell`" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$dashboardLauncher`" `"%1`""
        Set-Item -Path $commandKey -Value $protocolCommand
    }
    
    Write-Host "📁 Created desktop shortcut to logs folder"
    Write-Host ""
    
} catch {
    Write-Host ""
    Write-Host "======================================"
    Write-Host "  ❌ Service Installation Failed"
    Write-Host "======================================"
    Write-Host ""
    Write-Host "Error: $($_.Exception.Message)"
    Write-Host ""
    Write-Host "Troubleshooting:"
    Write-Host "  1. Make sure you ran the installer as Administrator"
    Write-Host "  2. Check if antivirus is blocking the service"
    Write-Host "  3. Verify the edge-agent.exe file is not corrupted"
    Write-Host ""
    Write-Host "For support, contact: support@sentinel-grid.com"
    Write-Host ""
    
    # Save error log
    $errorLog = Join-Path $AppPath "logs\service-install-error.log"
    New-Item -ItemType Directory -Force -Path (Split-Path $errorLog) | Out-Null
    $_ | Out-File -FilePath $errorLog
    
    exit 1
}
