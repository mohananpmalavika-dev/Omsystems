# Edge Agent Authentication Fix Guide

## 🔴 Problem Identified

Your edge agent has **two issues**:

1. **Authentication Error**: `invalid_or_revoked_gateway_identity`
   - The activation code is no longer valid
   - The edge agent cannot authenticate with the control plane

2. **Media Tunnel Unavailable**: `public media tunnel unavailable`
   - Live video streaming is not working remotely
   - Camera monitoring still works, but video won't stream

---

## ✅ Solution: Re-Register Edge Agent

### Step 1: Generate New Activation Code (Dashboard)

1. **Open your control plane dashboard**:
   ```
   http://3.7.216.169:8080
   ```

2. **Login** with your credentials

3. **Navigate to Edge Agent Registration**:
   - Option A: Go to **Settings** → **Edge Agents/Scanners**
   - Option B: Go to your **Branch** page → **Edge Scanner** section

4. **Create New Activation**:
   - Click **"Add Edge Agent"** or **"Register New Scanner"**
   - Enter Agent Name: `KryptonLogic Central Scanner`
   - Set TTL: `60 minutes` (or as needed)
   - Click **"Generate Activation Code"**

5. **COPY the activation code**:
   - It will start with `sgact_` followed by random characters
   - Example: `sgact_c9W_NnmC-EtoxdlGtLGdiBeGkIBLkMGTBxGyU_IZFEA`
   - ⚠️ **IMPORTANT**: Copy this immediately - you won't see it again!

---

### Step 2: Update Edge Agent Configuration

1. **Open the `.env` file** in the `edge-agent` folder:
   ```
   edge-agent\.env
   ```

2. **Find the line**:
   ```env
   EDGE_ACTIVATION_CODE=sgact_c9W_NnmC-EtoxdlGtLGdiBeGkIBLkMGTBxGyU_IZFEA
   ```

3. **Replace** with your NEW activation code:
   ```env
   EDGE_ACTIVATION_CODE=<paste-your-new-code-here>
   ```

4. **Save the file**

---

### Step 3: Restart Edge Agent

1. **Stop the current edge agent**:
   - If running as service: Stop the Windows service
   - If running in terminal: Press `Ctrl+C` to stop

2. **Restart the edge agent**:
   ```batch
   cd edge-agent
   .\START_SCANNER_SIMPLE.bat
   ```

3. **Verify startup**:
   - You should see: `✓ Successfully registered with control plane`
   - No more `invalid_or_revoked_gateway_identity` errors

---

## 🔍 Verification

### Check Edge Agent Status

Run the diagnostic script:
```bash
node check-edge-agent.mjs
```

You should see:
- ✅ Edge agent process running (port 8090)
- ✅ Health check passing
- ✅ Control plane connectivity OK
- ✅ Authentication valid

### Check Recent Logs

```bash
cd edge-agent
Get-Content logs\edge-agent.log -Tail 20
```

Look for:
- ✅ `Successfully registered with control plane`
- ✅ `Synchronized N camera(s) for heartbeat monitoring`
- ❌ NO `invalid_or_revoked_gateway_identity` errors

---

## 📡 Media Tunnel Issue (Optional Fix)

The **"public media tunnel unavailable"** error means:
- ✅ Camera discovery works
- ✅ Camera monitoring works
- ✅ Analytics work
- ❌ Remote video streaming doesn't work

### Why This Happens:
- Your edge agent machine is behind a router/firewall
- No public IP address or tunnel is configured
- Remote clients cannot connect directly to stream video

### Quick Fixes:

#### Option 1: Use ngrok (Easiest)
```bash
# Install ngrok
# Download from: https://ngrok.com/download

# Run ngrok tunnel
ngrok tcp 8090
```
Copy the forwarding URL (e.g., `tcp://0.tcp.ngrok.io:12345`) and update in dashboard.

#### Option 2: Port Forwarding
1. Configure your router to forward port `8090` to edge agent machine
2. Set up dynamic DNS if your ISP IP changes
3. Update public URL in dashboard settings

#### Option 3: VPN/Cloudflare Tunnel
- Use Cloudflare Tunnel for secure access
- Configure VPN to access edge agent network

### ⚠️ Important:
If you don't need remote video streaming (only local network access), you can **ignore this error** - it's not critical for basic functionality.

---

## 🛠 Troubleshooting

### Problem: Can't access dashboard
**Solution**: 
- Check if control plane is running: `curl http://3.7.216.169:8080/health`
- Verify network connectivity
- Check firewall rules

### Problem: Activation code expired
**Symptoms**: `activation_expired` error

**Solution**:
- Activation codes have a TTL (usually 60 minutes)
- Generate a new code if expired
- Complete registration within the TTL window

### Problem: Still getting auth errors after new code
**Solution**:
1. Verify you copied the ENTIRE activation code
2. Check for extra spaces or line breaks
3. Ensure `.env` file saved properly
4. Restart edge agent completely (not just reload)

### Problem: Cameras not showing up
**Solution**:
- Check camera credentials in dashboard
- Verify network connectivity to cameras
- Check logs for specific camera errors
- Run camera discovery: edge agent will scan network

---

## 📞 Need Help?

If you're still experiencing issues:

1. **Gather diagnostic info**:
   ```bash
   node check-edge-agent.mjs > diagnostics.txt
   ```

2. **Check recent logs**:
   ```bash
   Get-Content edge-agent\logs\edge-agent.log -Tail 50 > error-logs.txt
   ```

3. **Contact support** with these files

---

## 🎯 Quick Reference

| Issue | Status | Action Required |
|-------|--------|----------------|
| Authentication | 🔴 CRITICAL | Re-register edge agent (Steps 1-3) |
| Media Tunnel | 🟡 WARNING | Optional - only if remote streaming needed |
| Camera Discovery | ✅ WORKING | No action needed |
| Control Plane | ✅ WORKING | No action needed |

---

**Last Updated**: 2026-09-23  
**Edge Agent Version**: 0.1.27  
**Control Plane**: http://3.7.216.169:8080
