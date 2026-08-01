# 🚀 Installer Quick Reference Card

## ⚡ TL;DR - I Just Want the Installer!

**Short Answer:** You need to build it first (takes 10 minutes)

```powershell
# 1. Install Inno Setup: https://jrsoftware.org/isdl.php

# 2. Build installer
cd C:\Omsystems\edge-agent\installer\windows
.\build-installer.ps1

# 3. Get installer
cd output
# File: SentinelGridInstaller-v0.1.0-windows.exe
```

---

## 📍 Current Status

```
Your Project Status:
├── ✅ Installer scripts created
├── ✅ Configuration automation ready
├── ✅ API integration ready
├── ⚠️  Inno Setup needs installation
├── ⚠️  Installer needs to be built
└── ⚠️  No download link yet (need to host it)
```

---

## 🎯 Three-Step Process

### **Step 1: Build the Installer** (10 min)

```powershell
# Install Inno Setup first (one-time)
# Download: https://jrsoftware.org/isdl.php

# Then build
cd edge-agent/installer/windows
.\build-installer.ps1
```

**Creates:** `output/SentinelGridInstaller-v0.1.0-windows.exe`

### **Step 2: Upload Somewhere** (5 min)

Choose one:
- **Google Drive:** Upload → Get shareable link
- **Dropbox:** Upload → Share link
- **Your Server:** Upload to web server
- **GitHub Releases:** Create release → Attach file

### **Step 3: Share the Link** (1 min)

Send to branches:
```
Download: https://drive.google.com/your-file-link
Install: Double-click → Enter branch name → Done!
```

---

## 📥 Distribution Options

### **Option A: Google Drive** (Easiest)
```
1. Upload installer to Drive
2. Right-click → Share → Get link
3. Set to "Anyone with link can view"
4. Share URL with branches
```

### **Option B: Dropbox**
```
1. Upload to Dropbox
2. Right-click → Share → Copy link
3. Share with branches
```

### **Option C: Your Web Server**
```
1. Upload to: https://yourcompany.com/downloads/
2. Share: https://yourcompany.com/downloads/installer.exe
```

### **Option D: GitHub Releases**
```bash
git tag v0.1.0
git push origin v0.1.0
# Go to GitHub → Releases → Create Release → Upload .exe
```

---

## 🏗️ Build Requirements

### What You Need:

1. **Inno Setup** (free download)
   - https://jrsoftware.org/isdl.php
   - Takes 2 minutes to install

2. **Node.js** (you already have this)
   - To build edge-agent.exe

3. **Runtime Files** (you already have these)
   - In `edge-agent/release/runtime/`

---

## 📋 Complete Build Commands

```powershell
# From project root (C:\Omsystems)

# 1. Build edge agent (if not already)
cd edge-agent
npm install
npm run build:exe

# 2. Build installer
cd installer\windows
.\build-installer.ps1

# 3. Find installer
cd output
dir
# You'll see: SentinelGridInstaller-v0.1.0-windows.exe

# 4. Test it (optional)
# Copy to clean VM and run

# 5. Upload to hosting
# Use method from "Distribution Options" above
```

---

## 🎯 What Branches Will Do

Once you share the link:

```
1. Click download link
2. Save installer (70 MB)
3. Run as Administrator
4. Enter branch name: "Mumbai Office"
5. Click Install
6. Wait 2-3 minutes
7. ✅ Done! Gateway online
```

**They don't need:**
- Technical knowledge
- Command line skills
- Manual configuration
- Docker, Node.js, etc.

**It just works!**

---

## 📧 Email Template for Branches

```
Subject: Sentinel Grid - Download & Install

Hi [Branch Name],

Download Sentinel Grid Installer:
👉 [YOUR DOWNLOAD LINK HERE]

Installation (3 minutes):
1. Download the file
2. Run as Administrator
3. Enter your branch name
4. Wait for installation
5. Done!

View your cameras:
https://dashboard.yourcompany.com

Questions? Reply to this email.

- IT Team
```

---

## 🔧 Troubleshooting

### **"I don't have Inno Setup"**
```
Download: https://jrsoftware.org/isdl.php
Install it (takes 2 minutes)
```

### **"Build script doesn't work"**
```powershell
# Use manual method:
cd edge-agent/installer/windows
& "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" sentinel-grid.iss
```

### **"edge-agent.exe not found"**
```powershell
# Build it:
cd edge-agent
npm run build:exe
```

### **"Where do I upload it?"**
```
Easiest: Google Drive (free, simple)
Professional: Your company website
Best: GitHub Releases (if open source)
```

---

## 📊 File Sizes

```
Installer size: ~70-80 MB
  ├── edge-agent.exe (5 MB)
  ├── mediamtx (15 MB)
  ├── ffmpeg (45 MB)
  └── other files (10 MB)
```

---

## ⏱️ Time Estimates

```
First Time Setup:
├── Install Inno Setup: 5 min
├── Build edge-agent: 2 min
├── Build installer: 2 min
├── Upload to hosting: 5 min
└── Total: ~15 minutes

Subsequent Builds:
└── Just run build script: 2 min
```

---

## 🎉 Success Checklist

- [ ] Inno Setup installed
- [ ] Installer builds without errors
- [ ] Tested on clean Windows VM
- [ ] Uploaded to hosting (Drive/Dropbox/Server)
- [ ] Got download link
- [ ] Sent link to first test branch
- [ ] Gateway shows online in dashboard
- [ ] Ready to roll out to all branches

---

## 💡 Quick Tips

**Versioning:**
Update version in `sentinel-grid.iss` line 3:
```ini
AppVersion=0.1.0
```

**Branding:**
Add your logo to:
```
edge-agent/installer/windows/assets/logo.ico
```

**Testing:**
Always test on clean VM before distributing!

**Support:**
Create FAQ document for common issues

---

## 📞 Still Stuck?

If you need help:

1. Check `BUILD_INSTALLER_GUIDE.md` (detailed guide)
2. Check `IMPLEMENTATION_COMPLETE.md` (overview)
3. Review installer scripts in `edge-agent/installer/windows/`
4. Check GitHub issues/discussions

---

## 🚀 Next Action

**Right now, do this:**

```powershell
# Step 1: Install Inno Setup
# Visit: https://jrsoftware.org/isdl.php

# Step 2: Build installer
cd C:\Omsystems\edge-agent\installer\windows
.\build-installer.ps1

# Step 3: You're done!
# File is in: output/SentinelGridInstaller-v0.1.0-windows.exe
```

**Then upload it somewhere and share the link!**

---

## 📸 What It Looks Like

### Download Page:
```
┌─────────────────────────────────────┐
│  🛡️ Sentinel Grid                   │
│  Edge Agent Installer                │
│                                      │
│  [Download for Windows]              │
│  Version 0.1.0 • 70 MB              │
│                                      │
│  ✓ Automatic setup                  │
│  ✓ Zero configuration               │
│  ✓ Works immediately                │
└─────────────────────────────────────┘
```

### Installer Wizard:
```
┌─────────────────────────────────────┐
│  Sentinel Grid Setup                 │
│  ───────────────────────────────────│
│  Branch Name:                        │
│  [Mumbai Office_____________]        │
│                                      │
│  [Next]                             │
└─────────────────────────────────────┘
```

---

**Bottom Line:** 
Build it once (10 min) → Upload somewhere (5 min) → Share link → Branches install in 3 minutes!

