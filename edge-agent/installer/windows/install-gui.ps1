# Sentinel Grid Edge Agent - Simple GUI Installer
# For non-technical users at branch offices

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"

# Configuration
$CONTROL_PLANE_URL = "https://sentinel-grid-control-plane1.onrender.com"
$INSTALL_DIR = "C:\Program Files\Sentinel Grid\Edge Agent"

# Check if running as Administrator
function Test-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Administrator)) {
    # Restart as Administrator
    $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    Start-Process powershell.exe -Verb RunAs -ArgumentList $arguments
    exit
}

# Create the main form
$form = New-Object System.Windows.Forms.Form
$form.Text = 'Sentinel Grid Edge Agent Installer'
$form.Size = New-Object System.Drawing.Size(600, 500)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.BackColor = [System.Drawing.Color]::White

# Logo/Title
$titleLabel = New-Object System.Windows.Forms.Label
$titleLabel.Location = New-Object System.Drawing.Point(20, 20)
$titleLabel.Size = New-Object System.Drawing.Size(560, 40)
$titleLabel.Text = '🛡️ Sentinel Grid Edge Agent'
$titleLabel.Font = New-Object System.Drawing.Font("Segoe UI", 18, [System.Drawing.FontStyle]::Bold)
$titleLabel.ForeColor = [System.Drawing.Color]::FromArgb(37, 99, 235)
$form.Controls.Add($titleLabel)

# Description
$descLabel = New-Object System.Windows.Forms.Label
$descLabel.Location = New-Object System.Drawing.Point(20, 70)
$descLabel.Size = New-Object System.Drawing.Size(560, 40)
$descLabel.Text = 'This will install the camera monitoring agent on this computer.'
$descLabel.Font = New-Object System.Drawing.Font("Segoe UI", 10)
$form.Controls.Add($descLabel)

# Branch Name
$branchLabel = New-Object System.Windows.Forms.Label
$branchLabel.Location = New-Object System.Drawing.Point(20, 130)
$branchLabel.Size = New-Object System.Drawing.Size(200, 20)
$branchLabel.Text = 'Branch Name:'
$branchLabel.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$form.Controls.Add($branchLabel)

$branchTextBox = New-Object System.Windows.Forms.TextBox
$branchTextBox.Location = New-Object System.Drawing.Point(20, 155)
$branchTextBox.Size = New-Object System.Drawing.Size(540, 25)
$branchTextBox.Font = New-Object System.Drawing.Font("Segoe UI", 10)
$branchTextBox.Text = "Branch-$(Get-Random -Minimum 100 -Maximum 999)"
$form.Controls.Add($branchTextBox)

# Branch Key
$keyLabel = New-Object System.Windows.Forms.Label
$keyLabel.Location = New-Object System.Drawing.Point(20, 200)
$keyLabel.Size = New-Object System.Drawing.Size(200, 20)
$keyLabel.Text = 'Installation Key:'
$keyLabel.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$form.Controls.Add($keyLabel)

$keyHelpLabel = New-Object System.Windows.Forms.Label
$keyHelpLabel.Location = New-Object System.Drawing.Point(220, 200)
$keyHelpLabel.Size = New-Object System.Drawing.Size(340, 20)
$keyHelpLabel.Text = '(Get this from your IT administrator)'
$keyHelpLabel.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Italic)
$keyHelpLabel.ForeColor = [System.Drawing.Color]::Gray
$form.Controls.Add($keyHelpLabel)

$keyTextBox = New-Object System.Windows.Forms.TextBox
$keyTextBox.Location = New-Object System.Drawing.Point(20, 225)
$keyTextBox.Size = New-Object System.Drawing.Size(540, 25)
$keyTextBox.Font = New-Object System.Drawing.Font("Segoe UI", 10)
$keyTextBox.UseSystemPasswordChar = $true
$form.Controls.Add($keyTextBox)

# Progress
$progressLabel = New-Object System.Windows.Forms.Label
$progressLabel.Location = New-Object System.Drawing.Point(20, 280)
$progressLabel.Size = New-Object System.Drawing.Size(540, 20)
$progressLabel.Text = 'Ready to install'
$progressLabel.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$progressLabel.ForeColor = [System.Drawing.Color]::Green
$form.Controls.Add($progressLabel)

$progressBar = New-Object System.Windows.Forms.ProgressBar
$progressBar.Location = New-Object System.Drawing.Point(20, 305)
$progressBar.Size = New-Object System.Drawing.Size(540, 25)
$progressBar.Style = 'Continuous'
$form.Controls.Add($progressBar)

# Log TextBox
$logBox = New-Object System.Windows.Forms.TextBox
$logBox.Location = New-Object System.Drawing.Point(20, 340)
$logBox.Size = New-Object System.Drawing.Size(540, 60)
$logBox.Multiline = $true
$logBox.ScrollBars = 'Vertical'
$logBox.ReadOnly = $true
$logBox.Font = New-Object System.Drawing.Font("Consolas", 8)
$form.Controls.Add($logBox)

# Install Button
$installButton = New-Object System.Windows.Forms.Button
$installButton.Location = New-Object System.Drawing.Point(360, 415)
$installButton.Size = New-Object System.Drawing.Size(100, 35)
$installButton.Text = 'Install'
$installButton.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$installButton.BackColor = [System.Drawing.Color]::FromArgb(37, 99, 235)
$installButton.ForeColor = [System.Drawing.Color]::White
$installButton.FlatStyle = 'Flat'
$form.Controls.Add($installButton)

# Cancel Button
$cancelButton = New-Object System.Windows.Forms.Button
$cancelButton.Location = New-Object System.Drawing.Point(470, 415)
$cancelButton.Size = New-Object System.Drawing.Size(90, 35)
$cancelButton.Text = 'Cancel'
$cancelButton.Font = New-Object System.Drawing.Font("Segoe UI", 10)
$form.Controls.Add($cancelButton)

# Functions
function Log($message) {
    $logBox.AppendText("$message`r`n")
    $logBox.SelectionStart = $logBox.Text.Length
    $logBox.ScrollToCaret()
    [System.Windows.Forms.Application]::DoEvents()
}

function UpdateProgress($percent, $message) {
    $progressBar.Value = $percent
    $progressLabel.Text = $message
    [System.Windows.Forms.Application]::DoEvents()
}

# Install Button Click
$installButton.Add_Click({
    $branchName = $branchTextBox.Text.Trim()
    $installKey = $keyTextBox.Text.Trim()
    
    if ([string]::IsNullOrWhiteSpace($branchName)) {
        [System.Windows.Forms.MessageBox]::Show("Please enter a branch name", "Error", 'OK', 'Error')
        return
    }
    
    if ([string]::IsNullOrWhiteSpace($installKey)) {
        [System.Windows.Forms.MessageBox]::Show("Please enter the installation key", "Error", 'OK', 'Error')
        return
    }
    
    $installButton.Enabled = $false
    $cancelButton.Enabled = $false
    $branchTextBox.Enabled = $false
    $keyTextBox.Enabled = $false
    
    try {
        UpdateProgress 10 "Preparing installation..."
        Log "Starting installation for branch: $branchName"
        
        # Create directories
        UpdateProgress 20 "Creating directories..."
        New-Item -ItemType Directory -Path $INSTALL_DIR, "$INSTALL_DIR\config", "$INSTALL_DIR\logs", "$INSTALL_DIR\data" -Force | Out-Null
        Log "Created installation directories"
        
        # Copy executable
        UpdateProgress 30 "Copying files..."
        $sourceExe = Join-Path $PSScriptRoot "..\..\release\edge-agent.exe"
        if (-not (Test-Path $sourceExe)) {
            throw "edge-agent.exe not found at $sourceExe"
        }
        Copy-Item -Path $sourceExe -Destination "$INSTALL_DIR\edge-agent.exe" -Force
        Log "Copied edge-agent.exe"
        
        # Create configuration
        UpdateProgress 50 "Creating configuration..."
        $configContent = @"
CONTROL_PLANE_URL="https://sentinel-grid-control-plane1.onrender.com"
EDGE_BRIDGE_SHARED_KEY="WBRrQzol9gGTuIEAVd08kvMFP5pfyNDj1m32qZ7YsShOcxHa"
BRANCH_NAME="$branchName"
LOG_LEVEL="info"
DATA_DIRECTORY="$INSTALL_DIR\data"
LOG_DIRECTORY="$INSTALL_DIR\logs"
CAMERA_DISCOVERY_ENABLED="true"
LIVE_MEDIA_ENABLED="false"
"@
        $configPath = "$INSTALL_DIR\config\edge-agent.env"
        Set-Content -Path $configPath -Value $configContent -Encoding UTF8
        Log "Created configuration file"
        
        # Set permissions
        UpdateProgress 60 "Setting permissions..."
        & icacls.exe $configPath /inheritance:r /grant:r '*S-1-5-18:(F)' '*S-1-5-32-544:(F)' | Out-Null
        Log "Secured configuration file"
        
        # Create Windows Service
        UpdateProgress 70 "Installing Windows service..."
        $serviceName = "SentinelGridEdgeAgent"
        $existingService = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
        if ($existingService) {
            Stop-Service -Name $serviceName -Force -ErrorAction SilentlyContinue
            & sc.exe delete $serviceName | Out-Null
            Start-Sleep -Seconds 2
        }
        
        # Create scheduled task instead (more reliable)
        $taskName = "Sentinel Grid Edge Agent"
        $action = New-ScheduledTaskAction -Execute "$INSTALL_DIR\edge-agent.exe" -Argument "--run --config `"$configPath`"" -WorkingDirectory $INSTALL_DIR
        $trigger = New-ScheduledTaskTrigger -AtStartup
        $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
        $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 20 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
        
        if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
            Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
        }
        Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "Sentinel Grid branch camera monitoring agent" | Out-Null
        Log "Created scheduled task"
        
        # Start the agent
        UpdateProgress 90 "Starting edge agent..."
        Start-ScheduledTask -TaskName $taskName
        Start-Sleep -Seconds 3
        Log "Edge agent started"
        
        UpdateProgress 100 "Installation complete!"
        Log ""
        Log "✅ Installation completed successfully!"
        Log "The edge agent is now running and will start automatically on boot."
        
        $progressLabel.Text = "Installation completed successfully!"
        $progressLabel.ForeColor = [System.Drawing.Color]::Green
        
        [System.Windows.Forms.MessageBox]::Show(
            "Installation completed successfully!`n`n" +
            "The Sentinel Grid Edge Agent is now running and monitoring cameras.`n`n" +
            "Branch Name: $branchName",
            "Success",
            'OK',
            'Information'
        )
        
        $form.Close()
        
    } catch {
        $errorMsg = $_.Exception.Message
        Log "❌ Error: $errorMsg"
        $progressLabel.Text = "Installation failed!"
        $progressLabel.ForeColor = [System.Drawing.Color]::Red
        [System.Windows.Forms.MessageBox]::Show("Installation failed: $errorMsg", "Error", 'OK', 'Error')
        $installButton.Enabled = $true
        $cancelButton.Enabled = $true
        $branchTextBox.Enabled = $true
        $keyTextBox.Enabled = $true
    }
})

# Cancel Button Click
$cancelButton.Add_Click({
    $form.Close()
})

# Show the form
[void]$form.ShowDialog()
