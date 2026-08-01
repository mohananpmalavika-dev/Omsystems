# Repository Conversion Roadmap
## From Developer Platform → Enterprise Branch Deployment

Current Status: **80% Complete**  
Estimated Completion: **2-4 weeks** (not months - you're much closer than you think!)

---

## ✅ Phase 1: Already Complete

### Edge Agent (100% Done)
- [x] Local camera discovery
- [x] AI inference modules
- [x] Automatic registration with control plane
- [x] Health monitoring and heartbeats
- [x] Secure tunnel support (Cloudflare)
- [x] Stream management
- [x] Update mechanism foundation

### Central Management (95% Done)
- [x] Control plane API (`backend/`)
- [x] Dashboard (`dashboard/`)
- [x] Device registry (edge_agents table)
- [x] Branch management
- [x] Telemetry collection
- [x] Organization hierarchy
- [x] Role-based access control
- [ ] License verification endpoint (needs minor addition)

### Analytics (100% Done)
- [x] All AI detection modules
- [x] Telemetry pipeline
- [x] Event processing

---

## 🔧 Phase 2: Packaging & Distribution (2 Weeks)

### 2.1: Windows One-Click Installer (Week 1)
**Status:** Foundation exists, needs packaging

**Current Assets:**
- ✅ `edge-agent/release/edge-agent.exe` 
- ✅ `edge-agent/vendor/windows/` (ffmpeg, mediamtx, cloudflared)
- ✅ Batch files for installation
- ✅ PowerShell scripts

**What to Add:**

```
edge-agent/installer/windows/
├── sentinel-grid-installer.iss          # Inno Setup script
├── install-wizard.nsi                    # NSIS alternative
├── assets/
│   ├── logo.ico
│   ├── banner.bmp
│   └── license.txt
├── scripts/
│   ├── pre-install.ps1                   # Check prerequisites
│   ├── install-service.ps1               # Create Windows service
│   ├── register-branch.ps1               # Connect to cloud
│   └── post-install.ps1                  # Verify installation
└── build.ps1                             # Build installer
```

**Implementation Steps:**

1. **Choose Installer Technology**
   - Recommended: **Inno Setup** (free, powerful, widely used)
   - Alternative: NSIS, WiX

2. **Create Installation Script**
   ```inno
   [Setup]
   AppName=Sentinel Grid Edge Agent
   AppVersion=0.1.0
   DefaultDirName={pf}\Sentinel Grid\Edge Agent
   OutputBaseFilename=sentinel-grid-installer
   
   [Files]
   Source: "release\edge-agent.exe"; DestDir: "{app}"
   Source: "release\runtime\*"; DestDir: "{app}\runtime"; Flags: recursesubdirs
   Source: "vendor\windows\*"; DestDir: "{app}\vendor"; Flags: recursesubdirs
   
   [Run]
   Filename: "{app}\scripts\install-service.ps1"; Parameters: "-ExecutionPolicy Bypass"
   ```

3. **Auto-Registration Wizard**
   - Ask for: Branch Name, Activation Code (optional)
   - Generate unique branch ID
   - Register with cloud automatically
   - Store credentials securely

4. **Service Installation**
   - Install as Windows Service (automatic startup)
   - Configure firewall rules
   - Set up automatic updates

**Deliverable:** `SentinelGridInstaller-v0.1.0.exe` (50-200 MB)

---

### 2.2: Linux Installer (Week 1, Parallel)

```
edge-agent/installer/linux/
├── install.sh                            # Main installer
├── sentinel-grid.service                 # systemd service
├── build-deb.sh                          # Build .deb package
├── build-rpm.sh                          # Build .rpm package
└── assets/
    └── logo.png
```

**Implementation:**
```bash
#!/bin/bash
# Sentinel Grid Edge Agent Installer

echo "Installing Sentinel Grid Edge Agent..."

# 1. Detect OS
# 2. Install dependencies (Node.js, ffmpeg, etc.)
# 3. Copy files to /opt/sentinel-grid/
# 4. Create systemd service
# 5. Register with cloud
# 6. Start service

systemctl enable sentinel-grid-edge-agent
systemctl start sentinel-grid-edge-agent

echo "Installation complete!"
```

---

### 2.3: Activation & Registration Flow (Week 1)

**Currently:** Manual config file editing  
**Target:** Zero-config automatic registration

**Add to backend API:**
```typescript
// backend/src/routes/activation.routes.ts
POST /api/activation/register
{
  "branchName": "Mumbai Office",
  "activationCode": "SGRID-XXXX-XXXX" // Optional
}

Response:
{
  "edgeAgentId": "uuid",
  "bridgeSharedKey": "secret",
  "branchId": "uuid",
  "controlPlaneUrl": "https://...",
  "mediaSharedKey": "secret"
}
```

**Update Edge Agent:**
```typescript
// edge-agent/src/registration/auto-register.ts
async function firstTimeSetup() {
  // Show simple UI or CLI prompts
  const branchName = prompt("Branch Name:");
  const activationCode = prompt("Activation Code (optional):");
  
  const response = await fetch(CONTROL_PLANE + '/activation/register', {
    method: 'POST',
    body: JSON.stringify({ branchName, activationCode })
  });
  
  const config = await response.json();
  
  // Save to config file automatically
  writeConfigFile(config);
  
  console.log("✅ Registration complete!");
}
```

---

## 🔐 Phase 3: Security Enhancements (Week 2)

### 3.1: Per-Branch Credentials ✅ (Already Implemented)
- ✅ Unique bridge keys per edge agent
- ✅ Secure credential storage
- [ ] Add automatic key rotation (optional enhancement)

### 3.2: License Verification (3 days)

**Add License Service:**
```typescript
// backend/src/services/license.service.ts
class LicenseService {
  async verifyLicense(licenseKey: string) {
    // Check if license is valid
    // Check expiration
    // Check feature flags
    // Return allowed features
  }
  
  async checkBranchLimit(organizationId: string) {
    // Enforce max branches per license
  }
}
```

**Add to Edge Agent:**
```typescript
// edge-agent/src/license/checker.ts
async function validateLicense() {
  const response = await gateway.verifyLicense();
  
  if (!response.valid) {
    console.error("Invalid license");
    process.exit(1);
  }
  
  return response.features;
}
```

---

## 📊 Phase 4: Enhanced Monitoring (Week 2)

### 4.1: Dashboard Improvements (Already ~90% Done)
**Current:** Basic monitoring  
**Add:**
- [ ] Branch map view
- [ ] Real-time status grid
- [ ] Alert dashboard
- [ ] Bulk operations (update all, restart all)

### 4.2: Remote Configuration Push
**Currently:** Edge agents pull config periodically  
**Add:** Real-time config push via WebSocket

```typescript
// backend/src/services/config-push.service.ts
class ConfigPushService {
  async pushConfigToBranch(branchId: string, config: any) {
    // Send via WebSocket to connected edge agent
    // Edge agent applies immediately without restart
  }
}
```

---

## 🔄 Phase 5: Update Mechanism (Week 2)

### 5.1: Update Server (3 days)

```
backend/src/services/update/
├── version-manager.ts
├── release-channels.ts       # stable, beta, dev
└── staged-rollout.ts         # gradual updates
```

**API:**
```typescript
GET /api/updates/check
{
  "currentVersion": "0.1.0",
  "platform": "windows",
  "branchId": "uuid"
}

Response:
{
  "updateAvailable": true,
  "version": "0.2.0",
  "downloadUrl": "https://...",
  "signature": "sha256...",
  "changeLog": "Bug fixes..."
}
```

### 5.2: Auto-Updater in Edge Agent (2 days)

```typescript
// edge-agent/src/updater/auto-update.ts
async function checkForUpdates() {
  const update = await gateway.checkUpdates();
  
  if (update.available) {
    console.log("Downloading update...");
    await downloadUpdate(update.url);
    await verifySignature(update.signature);
    await installUpdate();
    await restartService();
  }
}

// Run every 6 hours
setInterval(checkForUpdates, 6 * 60 * 60 * 1000);
```

---

## 📝 Phase 6: Documentation & Testing (Week 2)

### 6.1: Branch Deployment Guide
```markdown
# Branch Installation Guide

## For Branch Personnel

1. Download installer from: https://sentinel-grid.com/download
2. Double-click `SentinelGridInstaller.exe`
3. Click "Next" → "Next" → "Install"
4. Enter branch name when prompted
5. Wait for installation (2-3 minutes)
6. Done! System is running.

## What Happens Automatically
- ✅ Service installed
- ✅ Connected to cloud
- ✅ Cameras will be discovered automatically
- ✅ No manual configuration needed
```

### 6.2: Administrator Guide
```markdown
# Administrator Guide

## Managing Branches
1. Log into dashboard: https://dashboard.sentinel-grid.com
2. Go to "Branches"
3. View all branches, their status, cameras

## Remote Operations
- Push configuration changes
- Restart branches remotely
- View logs
- Update software
```

---

## 🎯 Summary: What You Actually Need to Build

### Critical (Must Have)
1. **Windows Installer Package** (3-4 days)
   - Inno Setup script
   - Service installation
   - Auto-registration UI

2. **Activation API** (2 days)
   - `/activation/register` endpoint
   - Automatic config generation

3. **License Verification** (2 days)
   - Basic license check
   - Feature flags

4. **Update Server** (3 days)
   - Version check API
   - File hosting
   - Staged rollouts

5. **Auto-Updater** (2 days)
   - Check for updates
   - Download & install
   - Restart service

### Nice to Have (Can Add Later)
- Linux installer (.deb/.rpm)
- macOS installer
- Advanced license features
- Remote config push (WebSocket)
- Mobile app for monitoring
- Advanced analytics dashboard

---

## 📊 Current Architecture Assessment

### What Works Well ✅
Your architecture is **already enterprise-ready** in most respects:

```
✅ Edge Agent: Modular, self-contained
✅ Control Plane: RESTful API, scalable
✅ Dashboard: Modern React, good UX
✅ Security: Bridge authentication, TLS
✅ Monitoring: Telemetry, health checks
✅ Tunneling: Cloudflare support
✅ AI Pipeline: Production-ready modules
```

### What Needs Adjustment ⚠️

1. **Distribution Model**
   - Current: Clone repo, `npm install`, configure `.env`
   - Target: Download installer, double-click, done

2. **Configuration**
   - Current: Manual `.env` file editing
   - Target: Auto-generated during installation

3. **Updates**
   - Current: Manual `git pull` + rebuild
   - Target: Automatic background updates

4. **Registration**
   - Current: Manual edge agent ID management
   - Target: Automatic cloud registration

---

## 💡 Quick Wins (Can Do This Weekend)

### 1. Simplify Existing Installer (4 hours)
Update `edge-agent/INSTALL_AS_SERVICE.bat`:
```batch
@echo off
echo Sentinel Grid Edge Agent Installer
echo.

:: 1. Extract embedded config
:: 2. Prompt for branch name
set /p BRANCH_NAME="Enter Branch Name: "

:: 3. Register with cloud
powershell -Command "Invoke-WebRequest -Uri 'https://api.sentinel-grid.com/activation/register' -Method POST -Body '{\"branchName\":\"%BRANCH_NAME%\"}' -OutFile config.json"

:: 4. Install service
sc create SentinelGridAgent binPath= "%~dp0edge-agent.exe --config config.json" start= auto

:: 5. Start service
sc start SentinelGridAgent

echo.
echo Installation complete!
pause
```

### 2. Add Activation API Endpoint (2 hours)
```typescript
// backend/src/routes/activation.routes.ts
router.post('/activation/register', async (req, res) => {
  const { branchName, activationCode } = req.body;
  
  // 1. Create branch
  // 2. Create edge agent
  // 3. Generate credentials
  // 4. Return config
  
  res.json({
    edgeAgentId: agent.id,
    bridgeSharedKey: key,
    // ... all config needed
  });
});
```

---

## 🎉 The Good News

You're **NOT starting from scratch**. You have:
- ✅ Working edge agent
- ✅ Working control plane
- ✅ Working dashboard
- ✅ Working AI pipeline
- ✅ Working tunnel support
- ✅ Working authentication

You **only need**:
1. Package it into an installer
2. Automate the registration
3. Add update mechanism
4. Polish the UX

**Realistic Timeline:**
- **Week 1:** Windows installer + auto-registration
- **Week 2:** License system + update server
- **Week 3:** Testing + documentation
- **Week 4:** Linux installer + final polish

**Total: 3-4 weeks, not 2-4 months!**

---

## 🚀 Next Steps

1. **This Weekend:**
   - Create `edge-agent/installer/` folder
   - Download Inno Setup
   - Create basic `.iss` script
   - Test one-click installation locally

2. **Next Week:**
   - Add `/activation/register` API
   - Update edge agent to call it on first run
   - Build complete Windows installer
   - Test on clean Windows machine

3. **Week 2:**
   - Add license verification
   - Add update server
   - Add auto-updater to edge agent
   - Test update flow

4. **Week 3:**
   - Write documentation
   - Test in real branch environment
   - Fix bugs
   - Polish UX

5. **Week 4:**
   - Create Linux installer
   - Final testing
   - Prepare for deployment

---

## 📁 Recommended File Structure Changes

```
Omsystems/
├── edge-agent/
│   ├── installer/               # NEW
│   │   ├── windows/
│   │   │   ├── sentinel-grid.iss
│   │   │   ├── scripts/
│   │   │   └── assets/
│   │   └── linux/
│   │       ├── install.sh
│   │       └── sentinel-grid.service
│   ├── src/
│   └── release/
│
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   │   └── activation.routes.ts    # NEW
│   │   └── services/
│   │       ├── license.service.ts      # NEW
│   │       └── update.service.ts       # NEW
│   └── ...
│
└── docs/
    ├── branch-installation.md          # NEW
    ├── admin-guide.md                  # NEW
    └── architecture.md
```

---

## ✅ Success Criteria

When complete, a branch deployment should be:

1. **Download** installer (50-200 MB)
2. **Double-click** to run
3. **Enter** branch name
4. **Wait** 2-3 minutes
5. **Done** - system running, cameras discovered, connected to cloud

**No:**
- ❌ Manual configuration
- ❌ Command line usage
- ❌ Environment variables
- ❌ Docker knowledge
- ❌ IT expertise

**User Experience Target:**
"As easy as installing Zoom or Chrome"

---

## 🎯 Conclusion

You're **80% there**. The core platform works. You just need to wrap it in a nice installer package and add some automation around registration and updates.

This is **NOT a rewrite**. This is **packaging and polish**.

**Estimated effort:** 3-4 weeks, not months.

Let's get started! 🚀
