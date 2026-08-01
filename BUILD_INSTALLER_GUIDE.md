# 🚀 How to Build and Download the One-Click Installer

## Quick Answer

**The installer doesn't exist yet - you need to build it first!**

Here's how to create the installer that you can then distribute to branches.

---

## 📋 Prerequisites (One-Time Setup)

### 1. Install Inno Setup (5 minutes)

**Download:**
```
https://jrsoftware.org/isdl.php
```

**Installation:**
1. Download `innosetup-6.x.x.exe`
2. Run the installer
3. Click Next → Next → Install
4. ✅ Done!

**Verify Installation:**
```powershell
# Check if installed
Test-Path "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
# Should return: True
```

### 2. Build Edge Agent Executable

```powershell
cd edge-agent
npm install
npm run build:exe
```

This creates: `edge-agent/release/edge-agent.exe`

### 3. Prepare Runtime Files

You already have these in:
```
edge-agent/release/runtime/
├── mediamtx.exe
├── ffmpeg/
└── cloudflared.exe (optional)
```

---

## 🔨 Building the Installer

### **Method 1: Automated Build (Recommended)**

```powershell
# Navigate to installer directory
cd edge-agent/installer/windows

# Run build script
.\build-installer.ps1
```

**Output:**
```
✅ Installer built: output\SentinelGridInstaller-v0.1.0-windows.exe
```

### **Method 2: Manual Build**

```powershell
# Navigate to installer directory
cd edge-agent/installer/windows

# Build with Inno Setup
& "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" sentinel-grid.iss
```

---

## 📦 Where is the Installer?

After building, you'll find it here:

```
edge-agent/installer/windows/output/SentinelGridInstaller-v0.1.0-windows.exe
```

**File size:** ~70-80 MB (includes everything needed)

---

## 📤 Distributing the Installer

### **Option 1: Direct Download (Simple)**

1. **Upload to file hosting:**
   - Google Drive
   - Dropbox
   - OneDrive
   - AWS S3
   - Azure Blob Storage

2. **Share link with branches:**
   ```
   https://drive.google.com/file/d/xyz/SentinelGridInstaller.exe
   ```

### **Option 2: Internal Server (Professional)**

1. **Host on your web server:**
   ```
   https://downloads.yourcompany.com/sentinel-grid/latest/installer.exe
   ```

2. **Add to your website:**
   ```html
   <a href="/downloads/SentinelGridInstaller.exe">
     Download Sentinel Grid Installer
   </a>
   ```

### **Option 3: GitHub Releases (Recommended for Open Source)**

1. **Create a release on GitHub:**
   ```bash
   # Tag the release
   git tag v0.1.0
   git push origin v0.1.0
   ```

2. **Upload installer as release asset**
3. **Share link:**
   ```
   https://github.com/yourcompany/Omsystems/releases/latest
   ```

### **Option 4: Company Portal**

1. **Add to internal downloads page**
2. **Require authentication**
3. **Track who downloads it**

---

## 🎯 Complete Build & Deploy Workflow

### **Step-by-Step Process:**

```powershell
# 1. Navigate to project root
cd C:\Omsystems

# 2. Build edge agent
cd edge-agent
npm run build:exe

# 3. Verify executable exists
Test-Path "release\edge-agent.exe"
# Should return: True

# 4. Build installer
cd installer\windows
.\build-installer.ps1

# 5. Find installer
cd output
dir *.exe
# You should see: SentinelGridInstaller-v0.1.0-windows.exe

# 6. Test installer (optional but recommended)
# Copy to a clean VM and run it

# 7. Upload to hosting
# Use your preferred method from above
```

---

## 🧪 Testing the Installer

### **Before Distribution:**

1. **Test on Clean VM:**
   ```
   - Copy installer to fresh Windows VM
   - Run as Administrator
   - Follow installation wizard
   - Verify service starts
   - Check dashboard shows gateway
   ```

2. **Verify Components:**
   ```powershell
   # Check service
   Get-Service SentinelGridEdgeAgent
   
   # Check files
   Test-Path "C:\Program Files\Sentinel Grid\Edge Agent\edge-agent.exe"
   
   # Check logs
   Get-Content "C:\Program Files\Sentinel Grid\Edge Agent\logs\edge-agent.log"
   ```

---

## 📋 Distribution Checklist

Before sharing installer with branches:

- [ ] Installer builds successfully
- [ ] Tested on clean Windows machine
- [ ] Gateway registers with cloud
- [ ] Service starts automatically
- [ ] Cameras discovered successfully
- [ ] Created installation guide for branches
- [ ] Decided on distribution method
- [ ] Uploaded installer to hosting
- [ ] Shared download link
- [ ] Provided support contact

---

## 📖 What to Send to Branches

### **Email Template:**

```
Subject: Sentinel Grid Installation - Download Link

Dear Branch Manager,

You can now install Sentinel Grid with a simple one-click installer.

📥 Download Installer:
https://your-hosting.com/SentinelGridInstaller.exe

📋 Installation Instructions:

1. Download the installer (70 MB)
2. Run as Administrator
3. Enter your branch name when prompted
4. Wait 2-3 minutes
5. Done! System is online

The installer will:
✅ Install all required software
✅ Configure everything automatically
✅ Register with central server
✅ Start monitoring cameras
✅ Run as Windows service (auto-starts on boot)

🔗 View Your Branch:
https://dashboard.yourcompany.com/admin/system

Need help? Contact: support@yourcompany.com

Best regards,
IT Department
```

---

## 🚀 Quick Start (If You're Ready Now)

```powershell
# Complete build in 3 commands:

# 1. Install Inno Setup (if not already)
# Download from: https://jrsoftware.org/isdl.php

# 2. Build everything
cd C:\Omsystems\edge-agent
npm run build:exe
cd installer\windows
.\build-installer.ps1

# 3. Find your installer
cd output
# File: SentinelGridInstaller-v0.1.0-windows.exe
```

---

## ⚠️ Current Status

Based on your project structure:

```
✅ Installer scripts created
✅ Configuration automation ready
✅ Service installation ready
✅ Registration scripts ready
⚠️  Inno Setup needs to be installed
⚠️  Edge agent exe needs to be built
⚠️  Installer needs to be compiled
⚠️  Upload location needs to be chosen
```

---

## 💡 Pro Tips

### **Versioning**
Update version in `sentinel-grid.iss`:
```ini
AppVersion=0.1.0
OutputBaseFilename=SentinelGridInstaller-v0.1.0-windows
```

### **Branding**
Add your company logo:
```
edge-agent/installer/windows/assets/logo.ico
```

### **Auto-Updates**
Create a version check system:
```
https://api.yourcompany.com/version/latest
```

### **Multiple Versions**
Keep different versions available:
```
SentinelGridInstaller-v0.1.0-windows.exe
SentinelGridInstaller-v0.2.0-windows.exe
```

---

## 🆘 Troubleshooting

### **"Build script not found"**
```powershell
# Make sure you're in the right directory
cd C:\Omsystems\edge-agent\installer\windows
```

### **"Inno Setup not found"**
```powershell
# Install from: https://jrsoftware.org/isdl.php
# Or use manual path:
& "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" sentinel-grid.iss
```

### **"edge-agent.exe not found"**
```powershell
# Build it first:
cd C:\Omsystems\edge-agent
npm install
npm run build:exe
```

### **"Runtime files missing"**
```powershell
# Check if they exist:
cd edge-agent/release/runtime
dir
# Should see: mediamtx.exe, ffmpeg folder, etc.
```

---

## 📞 Next Steps

1. **Install Inno Setup** (if not already)
2. **Build the installer** using commands above
3. **Test on VM** to ensure it works
4. **Choose distribution method** (Drive, Server, etc.)
5. **Upload installer** to chosen location
6. **Share with branches** using template above

---

## 🎉 Success Looks Like

```
Branch Personnel:
1. Downloads: SentinelGridInstaller.exe
2. Runs installer
3. Enters branch name
4. Waits 2 minutes
5. ✅ System online!

You See:
- New gateway in dashboard
- Cameras being discovered
- Telemetry flowing
- Zero support calls
```

---

**Ready to build? Start here:**
```powershell
cd C:\Omsystems\edge-agent\installer\windows
.\build-installer.ps1
```
