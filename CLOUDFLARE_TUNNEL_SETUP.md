# 🚀 Cloudflare Tunnel Setup for Edge Agent (24/7 Operation)

## Overview

This guide will help you:
1. Install Cloudflare Tunnel (cloudflared)
2. Create a tunnel that exposes your local edge agent to the internet
3. Configure edge agent to run as a Windows service (24/7)
4. Make live streaming work from anywhere

## Architecture

```
Internet → Cloudflare Tunnel → Your PC (Edge Agent :8090) → Local Cameras
                ↓
    https://your-tunnel.trycloudflare.com
```

---

## Step 1: Install Cloudflare Tunnel

### Option A: Download Pre-built Binary (Easiest)

1. **Download cloudflared for Windows:**
   - Go to: https://github.com/cloudflare/cloudflared/releases/latest
   - Download: `cloudflared-windows-amd64.exe`
   - Or use this direct link: https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe

2. **Move to edge agent directory:**
   ```powershell
   # Download to Downloads folder first, then:
   Move-Item "$env:USERPROFILE\Downloads\cloudflared-windows-amd64.exe" "c:\Omsystems\edge-agent\cloudflared.exe"
   ```

3. **Verify installation:**
   ```bash
   cd c:\Omsystems\edge-agent
   .\cloudflared.exe --version
   ```

### Option B: Install via Package Manager

If you have Chocolatey or Scoop:

```powershell
# Using Chocolatey
choco install cloudflared

# Using Scoop
scoop install cloudflared
```

---

## Step 2: Create a Quick Tunnel (Test First)

Before setting up a permanent tunnel, let's test with a quick tunnel:

```bash
cd c:\Omsystems\edge-agent
.\cloudflared.exe tunnel --url http://localhost:8090
```

**You should see:**
```
Your quick Tunnel has been created! Visit it at:
https://random-words-123.trycloudflare.com
```

**Copy that URL!** That's your public edge agent URL.

**Test it:**
- Open browser: `https://random-words-123.trycloudflare.com/health`
- You should see: `{"status":"ok"}`

**Keep this terminal open for now.**

---

## Step 3: Create a Permanent Named Tunnel

Quick tunnels work but the URL changes every time. Let's create a permanent one.

### 3.1 Login to Cloudflare

```bash
cd c:\Omsystems\edge-agent
.\cloudflared.exe tunnel login
```

This will:
1. Open your browser
2. Ask you to select a Cloudflare zone (domain)
3. Download a certificate

**Note:** You need a domain added to Cloudflare (can be free).

### 3.2 Create Named Tunnel

```bash
.\cloudflared.exe tunnel create sentinel-edge-agent
```

**You'll get:**
```
Created tunnel sentinel-edge-agent with id: abc123-def456-ghi789
```

**Save this tunnel ID!**

### 3.3 Create Tunnel Configuration

Create file: `c:\Omsystems\edge-agent\cloudflared-config.yml`

```yaml
tunnel: abc123-def456-ghi789  # Your tunnel ID from previous step
credentials-file: C:\Users\YourUsername\.cloudflared\abc123-def456-ghi789.json

ingress:
  # Route all traffic to local edge agent
  - hostname: edge.yourdomain.com  # Replace with your domain
    service: http://localhost:8090
  
  # Catch-all rule (required)
  - service: http_status:404
```

### 3.4 Create DNS Record

```bash
.\cloudflared.exe tunnel route dns sentinel-edge-agent edge.yourdomain.com
```

This creates a CNAME record pointing `edge.yourdomain.com` to your tunnel.

### 3.5 Test the Tunnel

```bash
.\cloudflared.exe tunnel run sentinel-edge-agent
```

**Test it:**
- Open browser: `https://edge.yourdomain.com/health`
- Should see: `{"status":"ok"}`

---

## Step 4: Install Edge Agent as Windows Service

Now let's make both the edge agent AND cloudflare tunnel run automatically on startup.

### 4.1 Install Edge Agent Service

We'll use NSSM (Non-Sucking Service Manager) to run the edge agent as a service.

**Download NSSM:**
```powershell
# Download from: https://nssm.cc/download
# Extract to c:\Omsystems\edge-agent\nssm.exe
```

**Or use the existing installer:**

Actually, you already have an Inno Setup installer! Let's use that instead. But first, let me create a better service installation script.

### 4.2 Create Service Installation Script

Create: `c:\Omsystems\edge-agent\INSTALL_SERVICE.bat`

```batch
@echo off

echo Installing Sentinel Edge Agent as Windows Service...
echo.

REM Check for admin privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: This script requires Administrator privileges.
    echo Please right-click and select "Run as Administrator"
    pause
    exit /b 1
)

cd /d %~dp0

REM Install edge agent service
echo Installing Edge Agent service...
nssm install SentinelEdgeAgent "%CD%\start-with-env.mjs"
nssm set SentinelEdgeAgent AppDirectory "%CD%"
nssm set SentinelEdgeAgent AppParameters ""
nssm set SentinelEdgeAgent DisplayName "Sentinel Grid Edge Agent"
nssm set SentinelEdgeAgent Description "Sentinel Grid Camera Scanner and Media Gateway"
nssm set SentinelEdgeAgent Start SERVICE_AUTO_START
nssm set SentinelEdgeAgent AppStdout "%CD%\logs\service-stdout.log"
nssm set SentinelEdgeAgent AppStderr "%CD%\logs\service-stderr.log"
nssm set SentinelEdgeAgent AppRotateFiles 1
nssm set SentinelEdgeAgent AppRotateSeconds 86400

echo.
echo Starting Edge Agent service...
nssm start SentinelEdgeAgent

echo.
echo ✓ Edge Agent installed and started as Windows service!
echo.
echo Service will start automatically on system boot.
echo.
echo To check status: sc query SentinelEdgeAgent
echo To stop:        nssm stop SentinelEdgeAgent
echo To uninstall:   nssm remove SentinelEdgeAgent
echo.
pause
```

### 4.3 Create Cloudflare Tunnel Service Installation Script

Create: `c:\Omsystems\edge-agent\INSTALL_TUNNEL_SERVICE.bat`

```batch
@echo off
echo Installing Cloudflare Tunnel as Windows Service...
echo.

REM Check for admin privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: This script requires Administrator privileges.
    echo Please right-click and select "Run as Administrator"
    pause
    exit /b 1
)

cd /d %~dp0

REM Install cloudflare tunnel service
echo Installing Cloudflare Tunnel service...
.\cloudflared.exe service install

echo.
echo Starting Cloudflare Tunnel service...
sc start cloudflared

echo.
echo ✓ Cloudflare Tunnel installed and started as Windows service!
echo.
echo Service will start automatically on system boot.
echo.
echo To check status: sc query cloudflared
echo To stop:        sc stop cloudflared
echo To uninstall:   .\cloudflared.exe service uninstall
echo.
pause
```

---

## Step 5: Alternative - Use Quick Tunnel for Testing

If you don't have a Cloudflare domain, you can use quick tunnels for testing:

### 5.1 Create Quick Tunnel Startup Script

Create: `c:\Omsystems\edge-agent\START_WITH_TUNNEL.bat`

```batch
@echo off
echo Starting Edge Agent with Cloudflare Quick Tunnel...
echo.

cd /d %~dp0

REM Start edge agent in background
start "Edge Agent" node start-with-env.mjs

REM Wait for edge agent to start
timeout /t 5 /nobreak

REM Start cloudflare tunnel
echo.
echo Starting Cloudflare Tunnel...
echo Your public URL will appear below:
echo.
.\cloudflared.exe tunnel --url http://localhost:8090

pause
```

### 5.2 Get Your Public URL

Run the script:
```bash
cd c:\Omsystems\edge-agent
START_WITH_TUNNEL.bat
```

**You'll see something like:**
```
Your quick Tunnel has been created! Visit it at:
https://abc-def-ghi.trycloudflare.com
```

**Copy that URL!** This is your public edge agent URL.

---

## Step 6: Update Edge Agent Configuration

Update the edge agent's public media URL in the database:

```sql
UPDATE edge_agents 
SET public_media_url = 'https://abc-def-ghi.trycloudflare.com'
WHERE id = '6a570d4a-2c71-415f-b59a-643cf50d55c5';
```

Or update via the edge agent .env file for it to register with this URL:

Update: `c:\Omsystems\edge-agent\.env`

```env
PUBLIC_MEDIA_GATEWAY_URL=https://abc-def-ghi.trycloudflare.com
```

---

## Step 7: Update Dashboard Configuration

### For Local Dashboard Development:

Update: `c:\Omsystems\dashboard\.env.local`

```env
# Use the Cloudflare tunnel URL instead of localhost
MEDIA_GATEWAY_INTERNAL_URL=https://abc-def-ghi.trycloudflare.com
```

### For Production Dashboard on Render:

Go to Render dashboard → sentinel-grid-monitoring1 → Environment

Update:
```
MEDIA_GATEWAY_INTERNAL_URL=https://abc-def-ghi.trycloudflare.com
```

---

## Step 8: Test End-to-End

1. **Edge Agent is running with tunnel:**
   ```bash
   cd c:\Omsystems\edge-agent
   START_WITH_TUNNEL.bat
   ```

2. **Dashboard is running:**
   ```bash
   cd c:\Omsystems\dashboard
   npm run dev
   ```

3. **Open browser:**
   - Go to: `http://localhost:3000/control-room`
   - Click a camera
   - Live video should play!

4. **Test from another device:**
   - Open: `https://sentinel-grid-monitoring1.onrender.com/control-room`
   - Live video should work from anywhere!

---

## Recommended Setup for 24/7 Production

### Option 1: Quick Tunnel (No Domain Required)

**Pros:**
- ✅ No domain needed
- ✅ Free
- ✅ Easy setup

**Cons:**
- ⚠️ URL changes on restart
- ⚠️ Need to update database each time

**Best for:** Testing and development

### Option 2: Named Tunnel (Requires Domain)

**Pros:**
- ✅ Permanent URL (e.g., `edge.yourdomain.com`)
- ✅ Professional
- ✅ Automatic reconnection

**Cons:**
- ⚠️ Requires a domain in Cloudflare

**Best for:** Production use

### Option 3: Hybrid Approach

Use quick tunnel but create a script that auto-updates the database:

Create: `c:\Omsystems\edge-agent\start-and-register-tunnel.mjs`

```javascript
import { spawn } from "child_process";
import { readFileSync } from "fs";

const EDGE_AGENT_ID = "6a570d4a-2c71-415f-b59a-643cf50d55c5";
const CONTROL_PLANE_URL = "https://sentinel-grid-control-plane1.onrender.com";
const EDGE_BRIDGE_KEY = "WBRrQzol9gGTuIEAVd08kvMFP5pfyNDj1m32qZ7YsShOcxHa";

console.log("Starting edge agent with Cloudflare tunnel...\n");

// Start edge agent
console.log("1. Starting edge agent...");
const edgeAgent = spawn("node", ["start-with-env.mjs"], {
  stdio: "inherit",
  detached: true,
});

// Wait for edge agent to start
await new Promise((resolve) => setTimeout(resolve, 5000));

// Start cloudflare tunnel
console.log("\n2. Starting Cloudflare tunnel...");
const tunnel = spawn(".\\cloudflared.exe", ["tunnel", "--url", "http://localhost:8090"]);

let tunnelUrl = null;

tunnel.stdout.on("data", async (data) => {
  const output = data.toString();
  console.log(output);
  
  // Extract tunnel URL
  const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (match && !tunnelUrl) {
    tunnelUrl = match[0];
    console.log(`\n✅ Tunnel URL: ${tunnelUrl}`);
    
    // Update edge agent in database
    console.log("\n3. Registering tunnel URL in control plane...");
    try {
      const response = await fetch(
        `${CONTROL_PLANE_URL}/v1/edge-agents/${EDGE_AGENT_ID}/heartbeat`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-edge-bridge-key": EDGE_BRIDGE_KEY,
          },
          body: JSON.stringify({
            version: "0.1.0",
            publicMediaUrl: tunnelUrl,
          }),
        }
      );
      
      if (response.ok) {
        console.log("✅ Tunnel URL registered successfully!");
        console.log(`\n🎉 Edge agent is now accessible at: ${tunnelUrl}`);
        console.log("\nYou can now use live streaming from anywhere!");
      } else {
        console.error("❌ Failed to register tunnel URL");
      }
    } catch (error) {
      console.error("❌ Error:", error.message);
    }
  }
});

tunnel.stderr.on("data", (data) => {
  console.error(data.toString());
});

// Keep process alive
process.on("SIGINT", () => {
  console.log("\nShutting down...");
  tunnel.kill();
  edgeAgent.kill();
  process.exit(0);
});
```

---

## Summary

### Quick Start (No Domain)

1. Download cloudflared: https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
2. Rename to `cloudflared.exe` and place in `c:\Omsystems\edge-agent\`
3. Run: `START_WITH_TUNNEL.bat`
4. Copy the tunnel URL shown
5. Update dashboard env: `MEDIA_GATEWAY_INTERNAL_URL=<your-tunnel-url>`
6. Restart dashboard

### Production Setup (With Domain)

1. Install cloudflared
2. Login: `.\cloudflared.exe tunnel login`
3. Create tunnel: `.\cloudflared.exe tunnel create sentinel-edge-agent`
4. Configure: Create `cloudflared-config.yml`
5. Route DNS: `.\cloudflared.exe tunnel route dns sentinel-edge-agent edge.yourdomain.com`
6. Install service: `.\cloudflared.exe service install`
7. Update dashboard: `MEDIA_GATEWAY_INTERNAL_URL=https://edge.yourdomain.com`

---

**Next Steps:** Which option would you like to use? I can help you set it up!
