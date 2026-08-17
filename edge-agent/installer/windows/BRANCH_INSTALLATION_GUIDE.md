# Sentinel Grid Edge Agent - Branch Installation Guide

## For IT Administrators

### Step 1: Build the Installer

```powershell
cd C:\Omsystems\edge-agent
.\scripts\build-installer.ps1
```

This creates: `dist\SentinelGridEdgeAgentInstaller.exe`

### Step 2: Generate Installation Keys

Generate a key for each branch:

```powershell
# For a specific branch
.\scripts\generate-installation-key.ps1 -BranchName "Downtown Branch"

# Generate multiple keys
.\scripts\generate-installation-key.ps1 -Count 10
```

Save the generated keys securely and provide them to branch managers.

### Step 3: Distribute the Installer

1. Upload `SentinelGridEdgeAgentInstaller.exe` to:
   - Company file share
   - Cloud storage (OneDrive, Google Drive, etc.)
   - Company intranet

2. Send branch managers:
   - Download link for the installer
   - Their unique installation key
   - The instructions below

---

## For Branch Users (Non-Technical)

### What is this?

This is the Sentinel Grid camera monitoring software. It needs to be installed on one computer at your branch to monitor all security cameras.

### Requirements

- **Computer:** Windows 10/11 or Windows Server
- **Rights:** Administrator access (IT can provide)
- **Internet:** Active internet connection
- **Key:** Installation key from IT department

### Installation Steps

1. **Download the installer**
   - Get `SentinelGridEdgeAgentInstaller.exe` from the link provided by IT

2. **Run the installer**
   - Double-click the downloaded file
   - If Windows shows a security warning, click "More info" then "Run anyway"
   - Click "Yes" when asked for administrator permission

3. **Fill in the form**
   - **Branch Name:** Enter your branch name (e.g., "Downtown Branch")
   - **Installation Key:** Paste the key provided by IT (it's a long string)

4. **Click Install**
   - Wait for the installation to complete (usually 30-60 seconds)
   - You'll see a green success message when done

5. **Done!**
   - The software is now running
   - It will automatically start when the computer boots
   - No further action needed

### Troubleshooting

**Problem:** "Need administrator rights"
- **Solution:** Ask IT to run the installer for you

**Problem:** "Installation key invalid"
- **Solution:** Check with IT that you have the correct key
- Make sure there are no extra spaces when pasting

**Problem:** "Cannot connect to server"
- **Solution:** Check your internet connection
- Ask IT to verify firewall settings

**Problem:** Installation fails
- **Solution:** Contact IT support with the error message

### What Happens After Installation?

- The edge agent runs in the background
- It discovers and monitors cameras on your network
- Camera feeds are securely sent to the central monitoring dashboard
- You don't need to do anything else

### Support

For help, contact:
- **IT Support:** [Your IT contact email/phone]
- **System Administrator:** [Your admin contact]

---

## Technical Details (For IT)

### What the Installer Does

1. Creates installation directory: `C:\Program Files\Sentinel Grid\Edge Agent`
2. Copies `edge-agent.exe` 
3. Creates configuration file with:
   - Control plane URL: `https://sentinel-grid-control-plane-ocn1.onrender.com`
   - Installation key (used as bridge key)
   - Branch name
4. Creates scheduled task to run on system startup
5. Starts the edge agent immediately

### Files Installed

```
C:\Program Files\Sentinel Grid\Edge Agent\
├── edge-agent.exe          # Main executable
├── config\
│   └── edge-agent.env      # Configuration (secured)
├── logs\
│   └── edge-agent.log      # Runtime logs
└── data\                    # Local cache
```

### Scheduled Task

- **Name:** Sentinel Grid Edge Agent
- **Runs as:** SYSTEM
- **Trigger:** At system startup
- **Auto-restart:** Yes (every 1 minute if fails)

### Uninstallation

To uninstall:

```powershell
# Stop the scheduled task
Unregister-ScheduledTask -TaskName "Sentinel Grid Edge Agent" -Confirm:$false

# Remove files
Remove-Item "C:\Program Files\Sentinel Grid\Edge Agent" -Recurse -Force
```

### Security

- Configuration file contains the installation key
- File permissions restricted to SYSTEM and Administrators only
- Communication with control plane uses HTTPS
- Installation key acts as authentication token

---

© 2026 OM Systems. All rights reserved.
