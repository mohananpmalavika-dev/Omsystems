# Why New Edge Agent Installer Downloads Are Needed

## Your Question
"Why does a new edge agent need to be downloaded always? Are there any changes happening in the installed version?"

## Short Answer
**Yes, the installer downloads contain updated configuration** - specifically the **CONTROL_PLANE_URL** that points to your current Render services. When you update URLs in `.env`, you must download a fresh installer for those changes to be embedded.

## What Gets Updated in Each Installer Download

### 1. Embedded Configuration (`edge-agent.env`)
Each downloaded installer contains a **fresh embedded configuration** with:
- `CONTROL_PLANE_URL` - Where edge agent connects (from `.env`)
- `ANALYTICS_ENGINE_URL` - Where video frames are sent
- `MEDIA_GATEWAY_URL` - Where live streams are tunneled
- `BRANCH_ID` - Your specific branch
- `EDGE_AGENT_ID` - Unique agent identifier
- `EDGE_ACTIVATION_CODE` - One-time activation token (60-minute expiry)

### 2. Edge Agent Executable
The `edge-agent.exe` binary itself (only changes with new code releases).

### 3. Runtime Dependencies
- FFmpeg (video processing)
- MediaMTX (streaming server)
- Cloudflared (tunnel software)

## What Happens During Installation

### First Installation (Fresh Install)
```
1. Extract edge-agent.exe
2. Copy embedded config to: C:\Program Files\Sentinel Grid\Edge Agent\config\edge-agent.env
3. Create Windows scheduled task
4. Connect to control plane with activation code
5. Receive permanent identity files
6. Start discovering cameras
```

### Subsequent Installations (Update/Repair)
```
1. Stop existing scheduled task
2. Replace edge-agent.exe
3. OVERWRITE edge-agent.env with new config ⚠️
4. Archive old identity files (if new activation code)
5. Try activation with new code
6. If activation fails, restore old identity
7. Restart scheduled task
```

## What Gets Preserved vs Overwritten

### ✅ PRESERVED (Not Lost)
- **Camera credentials** (`data/camera-credentials.enc`)
- **Stream secrets** (`data/stream-secrets.json`)
- **Discovery state** (known devices)
- **Offline outbox** (pending events)
- **Old identity** (archived in `data/identity-archive/` if new activation fails)

### ⚠️ OVERWRITTEN (Always Replaced)
- **Config file** (`config/edge-agent.env`) - Contains URLs and settings
- **Executable** (`edge-agent.exe`) - The program itself
- **Windows scheduled task** - Recreated
- **Firewall rule** - Recreated

## Why Config Gets Overwritten

### From the Installer Code (Line 89):
```powershell
Copy-Item -LiteralPath $SourceConfig -Destination $ConfigPath -Force
```

The `-Force` flag means **always overwrite**, no merging, no prompts.

### Why This Design?
1. **URL Updates:** When you change Render URLs in `.env`, new installers embed the updated URLs
2. **Version Sync:** Ensures config matches the executable version
3. **Repair Scenarios:** Fixes corrupted or misconfigured settings
4. **Security:** Fresh activation codes replace potentially compromised ones

## When You Need a New Installer

### ✅ Required - Download Fresh Installer When:
1. **Render URLs change** (like we just did)
   - Old: `sentinel-grid-control-plane-ocn1.onrender.com`
   - New: `sentinel-grid-control-plane-3i3r.onrender.com`

2. **Activation code expires** (60-minute TTL)
   - Each installer has unique activation code
   - After 60 minutes, code is invalid

3. **Edge agent binary updates** (new version released)
   - Bug fixes
   - New features
   - Security patches

4. **Configuration changes** (environment variables in `.env`)
   - Analytics engine URL changes
   - Media gateway URL changes
   - Timeout adjustments

### ⛔ NOT Required - Keep Existing Installation When:
1. **Edge agent is running fine** and connecting successfully
2. **URLs haven't changed** in control plane `.env`
3. **No new version available**

## Your Current Situation

### Before URL Fix:
```env
# Old .env
CONTROL_PLANE_INTERNAL_URL=https://sentinel-grid-control-plane-ocn1.onrender.com  ❌ OLD
ANALYTICS_ENGINE_URL=https://sentinel-grid-analytics-engine-j0py.onrender.com     ❌ OLD
```

Installers downloaded had **wrong URLs embedded** → Edge agents couldn't connect.

### After URL Fix:
```env
# Updated .env
CONTROL_PLANE_PUBLIC_URL=https://sentinel-grid-control-plane-3i3r.onrender.com    ✅ CORRECT
ANALYTICS_ENGINE_URL=https://sentinel-grid-analytics-engine-6woo.onrender.com     ✅ CORRECT
```

**You must download fresh installer** to get correct URLs embedded.

## How to Check Embedded Config in Downloaded Installer

### Before Running the Installer:
You can verify the embedded configuration using PowerShell:

```powershell
# Path to your downloaded installer
$installerPath = "C:\Users\YourName\Downloads\Your-Branch-scanner-setup.exe"

# Read the file as bytes
$bytes = [System.IO.File]::ReadAllBytes($installerPath)

# Look for the config marker
$marker = [Text.Encoding]::ASCII.GetBytes("SENTINEL_EDGE_CONFIG_V1")

# Find marker position
for ($i = $bytes.Length - 100; $i -gt $bytes.Length - 5000 -and $i -gt 0; $i--) {
    $match = $true
    for ($j = 0; $j -lt $marker.Length; $j++) {
        if ($bytes[$i + $j] -ne $marker[$j]) {
            $match = $false
            break
        }
    }
    
    if ($match) {
        # Extract length (4 bytes before marker)
        $lengthBytes = $bytes[($i - 4)..($i - 1)]
        $configLength = [BitConverter]::ToUInt32($lengthBytes, 0)
        
        # Extract config
        $configStart = $i - 4 - $configLength
        $configBytes = $bytes[$configStart..($configStart + $configLength - 1)]
        $config = [Text.Encoding]::UTF8.GetString($configBytes)
        
        Write-Host "=== Embedded Configuration ===" -ForegroundColor Cyan
        $config
        break
    }
}
```

Look for this line in the output:
```
CONTROL_PLANE_URL="https://sentinel-grid-control-plane-ocn1.onrender.com"
```

If you see the **old URL** (`nqc0`), you're running an old installer.

## After Installing on Windows PC

### Config File Location:
```
C:\Program Files\Sentinel Grid\Edge Agent\config\edge-agent.env
```

You can check it:
```powershell
Get-Content "C:\Program Files\Sentinel Grid\Edge Agent\config\edge-agent.env" | Select-String "CONTROL_PLANE_URL"
```

Should show:
```
CONTROL_PLANE_URL="https://sentinel-grid-control-plane-ocn1.onrender.com"
```

## Comparison: What Changes Between Installations

| Component | First Install | Second Install (Update) | Third Install (Repair) |
|-----------|--------------|------------------------|------------------------|
| `edge-agent.exe` | ✅ Created | ✅ Replaced | ✅ Replaced |
| `config/edge-agent.env` | ✅ Created | ⚠️ **Overwritten** | ⚠️ **Overwritten** |
| `data/device-identity.enc` | ⏳ Created after activation | ✅ Kept (or archived) | ✅ Kept (or archived) |
| `data/camera-credentials.enc` | ⏳ Created after discovery | ✅ **Kept** | ✅ **Kept** |
| `data/stream-secrets.json` | ⏳ Created during streaming | ✅ **Kept** | ✅ **Kept** |
| Windows Task | ✅ Created | ✅ Recreated | ✅ Recreated |
| Firewall Rule | ✅ Created | ✅ Recreated | ✅ Recreated |

### Key Insight:
**Camera credentials and streaming secrets survive reinstallation**, but **configuration URLs do not**.

## Best Practices

### ✅ DO:
1. Download fresh installer after control plane URL changes
2. Download fresh installer if activation code expired
3. Check embedded config before running (optional but recommended)
4. Keep old installer for rollback (in case new URLs don't work)

### ⛔ DON'T:
1. Reuse old installers after `.env` URL changes
2. Manually edit `C:\Program Files\...\config\edge-agent.env` (will be overwritten)
3. Run installer without Administrator privileges
4. Delete `data/` folder (contains camera credentials)

## Summary

**Why installers need re-downloading:**

1. **Embedded URLs** - Each installer has `.env` values baked in at download time
2. **Activation codes** - Expire after 60 minutes, each download generates fresh code
3. **Version updates** - New executable when agent code changes
4. **No live update** - Edge agents can't auto-update their control plane URL

**The flow:**
```
Control plane .env updated
  ↓
Control plane restarted
  ↓
Dashboard download button clicked
  ↓
New installer generated with current .env values
  ↓
Installer downloaded (has fresh embedded config)
  ↓
Run on Windows PC
  ↓
Config file overwritten with new URLs
  ↓
Edge agent connects to correct control plane ✅
```

---

**Current Action Required:**
Since we just updated the `.env` URLs, you need to:
1. ✅ Restart control plane (to load new `.env`)
2. ✅ Download **fresh installer** from dashboard
3. ✅ Run new installer (will overwrite config with correct URLs)
4. ✅ Old camera credentials will be preserved automatically
