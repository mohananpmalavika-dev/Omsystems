# Edge Agent Quick Fix Guide

## 🔴 Problem Summary

Your edge agent is **running** but **3 out of 4 cameras are failing** due to wrong credentials.

---

## ✅ What's Working
- Edge agent is connected to control plane
- Agent ID: `e89264b4-9168-4b1b-8438-d61f7029668f`
- Branch ID: `00000000-0000-4000-8000-000000000104`  
- Heartbeat every 30 seconds: **✓ Working**
- Camera discovery: **✓ Finding 4 cameras**
- **1 camera successfully added:** `IPC_NT98566_IPG-N4C-WQ2_S38`

---

## ❌ What's Broken

### Problem Cameras
| IP Address | Status | Issue |
|------------|--------|-------|
| `192.168.29.171` | ❌ Failing | Wrong credentials (26 attempts left) |
| `192.168.29.196` | ❌ Failing | Wrong credentials |
| `192.168.29.46` | ❌ Failing | Wrong credentials |

### Current Config (INCORRECT)
```bash
CAMERA_USERNAME="admin"
CAMERA_PASSWORD="admin"
```

---

## 🔧 How to Fix (3 Steps)

### Step 1: Find Correct Credentials

Try accessing camera web interface:

```
Open browser → http://192.168.29.171
Try these common combinations:
```

| Username | Password | Common For |
|----------|----------|------------|
| admin | (empty) | Hikvision |
| admin | 12345 | Hikvision |
| admin | admin | Dahua, CP Plus |
| admin | 888888 | Dahua |
| admin | cp123 | CP Plus |

**OR run the test script:**
```powershell
cd C:\Omsystems
.\test-camera-credentials.ps1 -CameraIP "192.168.29.171"
```

### Step 2: Update Configuration

Once you find the correct credentials:

```powershell
# Option 1: Edit with Notepad (as Administrator)
notepad "C:\Program Files\Sentinel Grid\Edge Agent\config\edge-agent-H1.env"

# Option 2: Use PowerShell
$configPath = "C:\Program Files\Sentinel Grid\Edge Agent\config\edge-agent-H1.env"
(Get-Content $configPath) -replace 'CAMERA_USERNAME="admin"', 'CAMERA_USERNAME="your_username"' | Set-Content $configPath
(Get-Content $configPath) -replace 'CAMERA_PASSWORD="admin"', 'CAMERA_PASSWORD="your_password"' | Set-Content $configPath
```

Update these lines:
```bash
CAMERA_USERNAME="your_actual_username"
CAMERA_PASSWORD="your_actual_password"
```

### Step 3: Restart Edge Agent

```powershell
# Restart the scheduled task
Stop-ScheduledTask -TaskName "Sentinel Grid Edge Agent"
Start-Sleep -Seconds 3
Start-ScheduledTask -TaskName "Sentinel Grid Edge Agent"

# Wait 30 seconds then check logs
Start-Sleep -Seconds 30
Get-Content "C:\Program Files\Sentinel Grid\Edge Agent\logs\edge-agent.log" -Tail 20
```

---

## 🎯 Expected Result

After fixing credentials, you should see in logs:

```
[info] Discovered 4 ONVIF endpoint(s)
[info] Submitted <Camera1> as discovery <id1>
[info] Submitted <Camera2> as discovery <id2>
[info] Submitted <Camera3> as discovery <id3>
[info] Submitted <Camera4> as discovery <id4>
```

**NO MORE** authentication errors!

---

## ⚠️ Important Notes

1. **Different cameras may need different credentials**
   - If all 3 failing cameras are the same brand, they likely use the same password
   - If they're different brands, you may need to configure them individually first

2. **Failed Attempts Counter**
   - Camera `192.168.29.171` has 26 attempts left
   - After attempts run out, camera may lock for 30 minutes or permanently
   - **Stop edge agent while testing to avoid lockout:**
     ```powershell
     Stop-ScheduledTask -TaskName "Sentinel Grid Edge Agent"
     ```

3. **Security Recommendation**
   - Change all camera passwords from defaults after getting them working
   - Use strong passwords (12+ characters)
   - Keep cameras on isolated VLAN

---

## 📊 Diagnostic Commands

Check current status:
```powershell
# View recent logs
Get-Content "C:\Program Files\Sentinel Grid\Edge Agent\logs\edge-agent.log" -Tail 50

# Check edge agent task
Get-ScheduledTask -TaskName "Sentinel Grid Edge Agent" | Select-Object State, LastRunTime

# Test camera connectivity
Test-Connection -ComputerName 192.168.29.171 -Count 2
Test-NetConnection -ComputerName 192.168.29.171 -Port 80
```

Run full diagnostic:
```powershell
cd C:\Omsystems
.\diagnose-edge-agent.ps1
```

---

## 🐛 Known Bug Fixed

**Error Message Truncation Issue:**
- Fixed in source code (`edge-agent/src/index.ts`)
- Changed error message limit from 500 to 200 characters
- Needs rebuild and redeployment to take effect

To apply fix:
```powershell
cd C:\Omsystems\edge-agent
npm run build:exe
# Then replace executable in C:\Program Files\Sentinel Grid\Edge Agent\
```

---

## 📞 Need Help?

**Full documentation:** `C:\Omsystems\EDGE_AGENT_TROUBLESHOOTING.md`

**Scripts available:**
- `diagnose-edge-agent.ps1` - Full system diagnostic
- `test-camera-credentials.ps1` - Camera credential tester
- `get-gateway-info.mjs` - Database gateway info

**Logs:**
- Edge Agent: `C:\Program Files\Sentinel Grid\Edge Agent\logs\edge-agent.log`
- Local testing: `C:\Omsystems\edge-agent\logs\edge-agent.log`

---

## ⏱️ Estimated Fix Time

- **5-10 minutes** to find correct credentials
- **2 minutes** to update config
- **1 minute** to restart
- **Total: ~15 minutes**

---

*Last Updated: 2026-08-01*
