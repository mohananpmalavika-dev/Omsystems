# Sentinel Grid Edge Agent - Branch Deployment Package

## 🎉 Ready to Deploy!

Your edge agent installer is ready for distribution to branch offices. Non-technical users can install it with just a few clicks.

---

## 📦 What Was Created

### 1. **Installer Package**
Location: `C:\Omsystems\edge-agent\dist\SentinelGridEdgeAgentInstaller.zip`

Extract this ZIP and users will find:
- `Install Sentinel Grid.bat` - Double-click to install (EASY!)
- `edge-agent.exe` - The main executable
- `install-gui.ps1` - GUI installer script
- `README.txt` - Instructions

### 2. **Installation Key Generator**
Location: `C:\Omsystems\edge-agent\scripts\generate-installation-key.ps1`

Use this to create secure keys for each branch.

### 3. **Documentation**
Location: `C:\Omsystems\edge-agent\installer\windows\BRANCH_INSTALLATION_GUIDE.md`

Complete guide for IT and branch users.

---

## 🚀 Quick Start for IT Administrators

### Step 1: Generate Installation Keys

```powershell
cd C:\Omsystems\edge-agent\scripts

# For specific branches
.\generate-installation-key.ps1 -BranchName "Downtown Branch"
.\generate-installation-key.ps1 -BranchName "Airport Branch"
.\generate-installation-key.ps1 -BranchName "Mall Branch"

# Or generate multiple keys at once
.\generate-installation-key.ps1 -Count 10
```

**Sample key generated:**
```
afc191762f2a746eb4c5e08c0e8d1e24100c6caf87a180855dc78bf30696fa08
```

Save these keys securely!

### Step 2: Distribute the Installer

1. **Upload the ZIP file** to:
   - Company file share
   - OneDrive/Google Drive
   - Company intranet
   - USB drives for local installation

2. **Share with branch managers:**
   - Download link or USB drive
   - Their unique installation key
   - Simple instructions (see below)

### Step 3: Branch Installation (5 minutes)

Branch users do this:

1. **Extract the ZIP file**
2. **Double-click** `Install Sentinel Grid.bat`
3. **Enter branch name** (e.g., "Downtown Branch")
4. **Paste installation key** (the long string you gave them)
5. **Click Install**
6. **Wait 30 seconds** - Done!

---

## 📧 Email Template for Branch Managers

```
Subject: Install Sentinel Grid Camera Monitoring Software

Hi [Branch Manager Name],

Please install the Sentinel Grid camera monitoring software on one computer at your branch. This will enable centralized camera monitoring from the main office.

WHAT YOU NEED:
- Windows computer with administrator rights
- Internet connection
- 5 minutes

INSTALLATION STEPS:
1. Download the installer from: [Your link here]
2. Extract the ZIP file
3. Double-click "Install Sentinel Grid.bat"
4. Enter your branch name: [Branch Name]
5. Enter this installation key: [Installation Key]
6. Click Install and wait for completion

Your Installation Key:
afc191762f2a746eb4c5e08c0e8d1e24100c6caf87a180855dc78bf30696fa08

TROUBLESHOOTING:
- If you need administrator rights, contact IT support
- If installation fails, check your internet connection
- For help, call IT support at [Phone Number]

The software will run automatically and doesn't require any maintenance.

Thanks,
IT Department
```

---

## ✅ What the Installer Does

1. Creates installation folder: `C:\Program Files\Sentinel Grid\Edge Agent`
2. Copies the edge agent executable
3. Creates secure configuration file
4. Sets up Windows scheduled task (runs at startup)
5. Starts the edge agent immediately
6. Edge agent connects to: `https://sentinel-grid-monitoring1.onrender.com`

### After Installation

- Gateway status changes from "Pending" → "Online" in dashboard
- Cameras are automatically discovered
- Monitoring starts immediately
- No further action needed!

---

## 🎯 Testing the Installer

Before distributing, test it:

```powershell
# Extract the ZIP
cd C:\Omsystems\edge-agent\dist
Expand-Archive SentinelGridEdgeAgentInstaller.zip -DestinationPath test

# Run the installer
cd test
.\Install Sentinel Grid.bat

# Use these test values:
Branch Name: Test Branch
Installation Key: afc191762f2a746eb4c5e08c0e8d1e24100c6caf87a180855dc78bf30696fa08
```

Check the dashboard - you should see:
- Gateway "Test Branch" showing as "Online"
- Cameras being discovered

---

## 🔐 Security Notes

- Each installation key is cryptographically secure (256-bit)
- Keys should be unique per branch
- Configuration files are protected (SYSTEM + Administrators only)
- Communication uses HTTPS
- Keys act as authentication tokens

---

## 🛠️ Advanced Options

### Rebuild the Installer

If you make changes:

```powershell
cd C:\Omsystems\edge-agent
.\scripts\build-installer.ps1
```

### Create Self-Extracting EXE (Optional)

Install 7-Zip first, then rebuild:

```powershell
# Install 7-Zip from https://www.7-zip.org/
# Then rebuild
.\scripts\build-installer.ps1
```

This creates a single `.exe` file instead of `.zip`

### Uninstall (if needed)

```powershell
# Stop the service
Unregister-ScheduledTask -TaskName "Sentinel Grid Edge Agent" -Confirm:$false

# Remove files
Remove-Item "C:\Program Files\Sentinel Grid\Edge Agent" -Recurse -Force
```

---

## 📊 Monitoring Deployments

After branches install:

1. **Check Dashboard** → Admin → Branch cameras
2. **Look for gateway status**: "Online" = ✅ Working
3. **Check cameras**: Auto-discovered and monitoring

---

## 📞 Support Contacts

**For IT Administrators:**
- Installation issues: Check firewall allows HTTPS to sentinel-grid-monitoring1.onrender.com
- Gateway stays offline: Verify installation key is correct
- Logs location: `C:\Program Files\Sentinel Grid\Edge Agent\logs\edge-agent.log`

**For Branch Users:**
- Contact your IT support team
- Provide branch name and any error messages

---

## 🎉 Success!

You now have a simple, user-friendly installer that branch offices can use without technical knowledge!

**Files to distribute:**
- ✅ `SentinelGridEdgeAgentInstaller.zip`
- ✅ Installation keys (one per branch)
- ✅ Simple instructions (email template above)

**That's it!** 🚀

---

© 2026 OM Systems. All rights reserved.
