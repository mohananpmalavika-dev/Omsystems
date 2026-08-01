# Sentinel Grid Windows Installer

This directory contains the one-click installer for deploying Sentinel Grid Edge Agent to branch locations.

## Quick Start

### Build the Installer

```powershell
cd edge-agent/installer/windows
.\build-installer.ps1
```

Output: `output/SentinelGridInstaller-v0.1.0-windows.exe`

### Distribute to Branches

1. Upload installer to a download location
2. Send link to branch personnel
3. They download and double-click to install
4. Branch automatically appears in dashboard

## Prerequisites

### On Build Machine

1. **Node.js** (for building edge agent)
2. **Inno Setup 6** (for creating installer)
   - Download: https://jrsoftware.org/isdl.php
   - Install with default options

### On Branch Machines

- **Windows 10/11** (64-bit)
- **Administrator privileges** (for service installation)
- **Internet connection** (for cloud registration)
- **Open firewall** (HTTPS outbound)

## Build Process

### 1. Build Edge Agent

```powershell
cd edge-agent
npm install
npm run build:exe
```

This creates `edge-agent/release/edge-agent.exe`

### 2. Extract Runtime Dependencies

```powershell
# Extract MediaMTX
Expand-Archive vendor/windows/mediamtx.zip -DestinationPath release/runtime

# Extract FFmpeg
Expand-Archive vendor/windows/ffmpeg.zip -DestinationPath release/runtime
```

### 3. Build Installer

```powershell
cd installer/windows
.\build-installer.ps1
```

## What Gets Installed

### Files
```
C:\Program Files\Sentinel Grid\Edge Agent\
├── edge-agent.exe              # Main executable
├── runtime\
│   ├── mediamtx.exe           # Media streaming server
│   ├── mediamtx.yml           # Media server config
│   └── ffmpeg-*/              # Video processing tools
├── vendor\
│   └── cloudflared.exe        # Tunnel client
├── scripts\                   # Installation scripts
├── config\
│   └── edge-agent.env         # Auto-generated config
├── data\                      # Stream secrets, cache
└── logs\                      # Application logs
```

### Windows Service
- **Name:** SentinelGridEdgeAgent
- **Display Name:** Sentinel Grid Edge Agent
- **Startup:** Automatic
- **Recovery:** Auto-restart on failure

## Installation Flow

1. User downloads installer
2. Runs as Administrator
3. Installer prompts for:
   - Branch name
   - Activation code (optional)
4. Installer:
   - Copies all files
   - Registers with cloud
   - Generates configuration
   - Installs Windows service
   - Starts service
5. Branch appears in dashboard immediately

## User Experience

### Installation (Branch Personnel)
1. Download `SentinelGridInstaller-v0.1.0-windows.exe`
2. Double-click to run
3. Click "Next"
4. Enter branch name (e.g., "Mumbai Office")
5. Click "Install"
6. Wait 2-3 minutes
7. Done!

**No technical knowledge required.**

## Configuration

### Auto-Generated Config

The installer automatically creates `config/edge-agent.env` with:
- Unique edge agent ID
- Branch name
- Cloud connection details
- Camera discovery settings
- Media streaming configuration
- Logging paths

**Branch personnel never edit configuration files.**

## Customization

### Before Building

Edit `sentinel-grid.iss`:

```inno
AppVersion=0.1.0              # Your version
AppPublisher=Your Company     # Your company
ControlPlaneUrl=https://...   # Your control plane URL
```

### Branding

Replace `assets/logo.ico` with your company logo (256x256 icon file).

### Default Settings

Edit `scripts/register-branch.ps1`:
- Control plane URL
- Default branch ID
- Camera credentials
- Feature flags

## Testing

### Test on Clean Machine

1. Use a fresh Windows VM or test PC
2. Install: `SentinelGridInstaller-v0.1.0-windows.exe`
3. Verify:
   ```powershell
   Get-Service SentinelGridEdgeAgent
   Get-Content "C:\Program Files\Sentinel Grid\Edge Agent\logs\edge-agent.log" -Tail 20
   ```
4. Check dashboard for new branch

### Uninstall Test

1. Go to "Add or Remove Programs"
2. Find "Sentinel Grid Edge Agent"
3. Click "Uninstall"
4. Verify service is removed:
   ```powershell
   Get-Service SentinelGridEdgeAgent  # Should fail
   ```

## Troubleshooting

### Build Fails

**Issue:** "Edge agent not found"  
**Solution:** Build edge agent first with `npm run build:exe`

**Issue:** "Inno Setup not found"  
**Solution:** Install from https://jrsoftware.org/isdl.php

**Issue:** "MediaMTX not found"  
**Solution:** Extract `vendor/windows/mediamtx.zip` to `release/runtime/`

### Installation Fails

**Issue:** "Registration failed"  
**Solution:** 
- Check internet connection
- Verify control plane URL is accessible
- Check firewall allows HTTPS outbound

**Issue:** "Service won't start"  
**Solution:**
- Check logs at: `C:\Program Files\Sentinel Grid\Edge Agent\logs\`
- Verify all runtime files are present
- Check Windows Event Viewer

## Distribution

### Internal Network

Host on internal web server:
```
http://downloads.company.com/sentinel-grid/SentinelGridInstaller-v0.1.0-windows.exe
```

### Cloud Storage

Upload to:
- Google Drive
- Dropbox
- AWS S3
- Azure Blob Storage

### USB Drive

Copy installer to USB drive for offline branches.

## Updates

### Creating Update Installer

1. Update version in `sentinel-grid.iss`
2. Build new installer
3. Distribute to branches

### Automatic Updates (Future)

The installer includes foundation for automatic updates:
- Edge agent checks for new versions
- Downloads and installs automatically
- Restarts service

See `CONVERSION_ROADMAP.md` for implementation details.

## Security

### What's Included

- ✅ Unique credentials per branch
- ✅ TLS encrypted communication
- ✅ Secure tunnel support (Cloudflare)
- ✅ Local credential storage
- ✅ No hardcoded passwords

### What Branch Personnel Never See

- Bridge shared keys
- API credentials
- Internal URLs
- Database connections

All sensitive data is auto-generated and stored securely.

## Support

### For Branch Personnel

**Installation Help:**
- Run installer as Administrator
- Check internet connection
- Disable antivirus temporarily during install

**After Installation:**
- View logs: Desktop shortcut "Sentinel Grid Logs"
- Restart service: Services → Sentinel Grid Edge Agent → Restart
- Check status: https://dashboard.yourcompany.com

### For Administrators

**Build Issues:**
- Verify all prerequisites installed
- Check file paths in scripts
- Review build script output

**Deployment Issues:**
- Check control plane is accessible
- Verify registration API is working
- Review branch logs in dashboard

## Next Steps

1. **Build Your First Installer**
   ```powershell
   .\build-installer.ps1
   ```

2. **Test Locally**
   - Install on test machine
   - Verify in dashboard

3. **Deploy to First Branch**
   - Share installer file
   - Monitor installation
   - Collect feedback

4. **Scale to All Branches**
   - Document any issues
   - Refine installer
   - Roll out company-wide

## Additional Resources

- Main docs: `../../README.md`
- Architecture: `/ARCHITECTURE_ASSESSMENT.md`
- Roadmap: `/CONVERSION_ROADMAP.md`
- Quick start: `/START_HERE.md`

---

**Ready to build?** Run `.\build-installer.ps1` now!
