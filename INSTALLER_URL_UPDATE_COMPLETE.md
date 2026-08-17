# Edge Agent Installer URL Configuration - COMPLETE ✅

## Issue
You reported that the edge agent installer downloaded from the dashboard was not working properly - cameras not showing live video after installation.

## Root Cause
The `.env` file contained **old Render URLs** that were being embedded into the downloaded installer. When users ran the installer, it was trying to connect to the wrong control plane URL.

## Solution Applied
Updated all Render service URLs in `.env` to use your current production URLs:

### Updated URLs in `.env`

```env
# Analytics Engine
ANALYTICS_ENGINE_URL=https://sentinel-grid-analytics-engine-j0py.onrender.com

# Media Gateway  
MEDIA_GATEWAY_INTERNAL_URL=https://sentinel-grid-media-gateway-04ae.onrender.com

# Control Plane
CONTROL_PLANE_INTERNAL_URL=https://sentinel-grid-control-plane-ocn1.onrender.com
CONTROL_PLANE_PUBLIC_URL=https://sentinel-grid-control-plane-ocn1.onrender.com
```

### Key Addition
Added `CONTROL_PLANE_PUBLIC_URL` which is **critical** for the installer. This URL gets embedded into every downloaded installer so the edge agent knows where to connect.

## How the Installer Gets Its Configuration

1. **Dashboard UI** (`https://sentinel-grid-monitoring-vhid.onrender.com`)
   - User navigates to Branch Onboarding Wizard
   - Clicks "Install scanner" button

2. **API Call**
   - Dashboard calls: `POST /v1/branches/{branchId}/edge-agent-installer`
   - Control plane at: `https://sentinel-grid-control-plane-ocn1.onrender.com`

3. **Installer Generation** (`src/routes/edge-agent-package.routes.ts`)
   - Reads `edge-agent.exe` from `edge-agent/release/` directory
   - Creates embedded configuration from `.env` values
   - **Embeds `CONTROL_PLANE_URL`** from `CONTROL_PLANE_PUBLIC_URL`
   - Appends config to exe as footer
   - Sends `{branch-name}-scanner-setup.exe` to browser

4. **Installer Execution** (`edge-agent/installer/windows/install-edge-agent.ps1`)
   - User runs downloaded `.exe` on their Windows PC
   - Installer extracts embedded configuration
   - Copies to: `C:\Program Files\Sentinel Grid\Edge Agent\config\edge-agent.env`
   - Edge agent connects to the **embedded CONTROL_PLANE_URL**

## What This Fixes

✅ **Installers now contain correct control plane URL**
   - Old: `https://sentinel-grid-control-plane-nqc0.onrender.com` (wrong)
   - New: `https://sentinel-grid-control-plane-ocn1.onrender.com` (correct)

✅ **Analytics engine URL updated**
   - Old: `https://sentinel-grid-analytics-engine.onrender.com` (wrong)
   - New: `https://sentinel-grid-analytics-engine-j0py.onrender.com` (correct)

✅ **Media gateway URL updated**
   - Old: `https://apnic-deserve-evans-yarn.trycloudflare.com` (Cloudflare tunnel, wrong)
   - New: `https://sentinel-grid-media-gateway-04ae.onrender.com` (correct)

## Next Steps to Test

### 1. Restart Control Plane
The control plane server needs to restart to load the new `.env` configuration:

```bash
# On Render dashboard:
# Go to: https://dashboard.render.com/
# Select: sentinel-grid-control-plane-ocn1
# Click: "Manual Deploy" > "Clear build cache & deploy"
```

OR if you're running locally:
```bash
npm run dev
```

### 2. Download Fresh Installer
1. Go to: `https://sentinel-grid-monitoring-vhid.onrender.com/admin/branch-onboarding`
2. Select your test branch
3. Click "Install scanner"
4. Download the new installer

### 3. Verify Embedded Configuration (Optional)
To verify the installer has correct URLs, you can extract and check the embedded config:

```powershell
# Run this on the downloaded installer
$exe = "path\to\your-branch-scanner-setup.exe"
$bytes = [System.IO.File]::ReadAllBytes($exe)
$marker = [Text.Encoding]::ASCII.GetBytes("SENTINEL_EDGE_CONFIG_V1")

# Find the marker and extract config
$index = -1
for ($i = 0; $i -lt $bytes.Length - $marker.Length; $i++) {
    $match = $true
    for ($j = 0; $j -lt $marker.Length; $j++) {
        if ($bytes[$i + $j] -ne $marker[$j]) {
            $match = $false
            break
        }
    }
    if ($match) {
        $index = $i
        break
    }
}

if ($index -gt 0) {
    # Extract the 4-byte length before the marker
    $lengthIndex = $index - 4
    $length = [BitConverter]::ToUInt32($bytes, $lengthIndex)
    $configStart = $lengthIndex - $length
    $config = [Text.Encoding]::UTF8.GetString($bytes, $configStart, $length)
    $config
}
```

Look for this line in the output:
```
CONTROL_PLANE_URL="https://sentinel-grid-control-plane-ocn1.onrender.com"
```

### 4. Install and Test
1. Run the downloaded installer **as Administrator**
2. Provide activation code when prompted
3. Installer should complete successfully
4. Check logs: `C:\Program Files\Sentinel Grid\Edge Agent\logs\edge-agent.log`
5. Should see: `[info] Connected to control plane` (not connection errors)
6. Cameras should appear in dashboard within 2-3 minutes

### 5. Approve Cameras in Dashboard
After installation completes and cameras are discovered:
1. Go to Branch Onboarding Wizard
2. You'll see discovered cameras (status: "discovered")
3. **Click each camera and change status to "active"**
4. This is when live video becomes available

## Files Updated

1. **`.env`** - Main configuration file with all Render URLs
2. **Created: `INSTALLER_URL_UPDATE_COMPLETE.md`** - This documentation

## Technical Details

### Configuration Flow
```
.env file
  ↓
src/config.ts (loadConfig)
  ↓
src/index.ts (buildApp options)
  ↓
src/app.ts (registerEdgeAgentPackageRoutes)
  ↓
src/routes/edge-agent-package.routes.ts (branchConfiguration)
  ↓
Embedded in edge-agent.exe
  ↓
edge-agent/installer/windows/install-edge-agent.ps1
  ↓
C:\Program Files\Sentinel Grid\Edge Agent\config\edge-agent.env
```

### Environment Variables Used
- `CONTROL_PLANE_PUBLIC_URL` → Edge agent connection URL
- `ANALYTICS_ENGINE_URL` → AI analytics frame processing
- `MEDIA_GATEWAY_INTERNAL_URL` → Live video streaming
- `EDGE_BRIDGE_SHARED_KEY` → Edge agent authentication

### Important Notes
1. **No changes needed to edge-agent source code** - it reads configuration from embedded config
2. **No changes needed to installer scripts** - they extract and use embedded config
3. **Only `.env` needed updating** - control plane embeds these values automatically
4. **Control plane restart required** - to load new environment variables

## Troubleshooting

### If installer still connects to wrong URL:
1. Verify control plane restarted after `.env` update
2. Clear browser cache and re-download installer
3. Extract and verify embedded config (script above)

### If cameras still not showing:
1. Check edge-agent.log for "Connected to control plane"
2. Verify cameras status changed from "discovered" to "active" in dashboard
3. Check analytics engine is not returning 429 errors (acceptable but means free tier is overloaded)

### If you see old URLs in logs:
1. Means you're running an old installer
2. Download fresh installer after control plane restart
3. Uninstall old agent before installing new one

## Verification Checklist

- ✅ `.env` updated with correct URLs
- ✅ `CONTROL_PLANE_PUBLIC_URL` added
- ⏳ Control plane restarted (YOU NEED TO DO THIS)
- ⏳ Fresh installer downloaded (YOU NEED TO DO THIS)
- ⏳ Installer tested on Windows PC (YOU NEED TO DO THIS)
- ⏳ Cameras approved in dashboard (YOU NEED TO DO THIS)

## Questions?

If you encounter any issues:
1. Check the edge-agent.log file location in install output
2. Look for connection errors or wrong URL references
3. Verify the embedded config in the installer (using script above)
4. Confirm control plane environment matches `.env` file

---

**Summary:** Your `.env` file now has all the correct Render URLs. After restarting the control plane, all new installers downloaded from the dashboard will connect to the right services. Old installers will still try to connect to old URLs, so always download fresh after any URL changes.
