# 🚨 Edge Agent Not Working - Quick Fix

## Problem Diagnosed ✅

Your edge agent has an **authentication error**:
- Error: `invalid_or_revoked_gateway_identity`
- Cause: The activation code is expired or revoked
- Impact: Edge agent cannot connect to control plane

---

## 🎯 Quick Fix (3 Steps)

### Step 1: Get New Activation Code

1. Open dashboard: **http://3.7.216.169:8080**
2. Login → Go to **Edge Agents** section
3. Click **"Register New Scanner"**
4. Enter name: `KryptonLogic Central Scanner`
5. Click **"Generate Code"**
6. **COPY the activation code** (starts with `sgact_`)

### Step 2: Update Configuration

**EASY WAY** (Automated):
```powershell
cd edge-agent
.\update-activation-code.ps1
# Paste your new activation code when prompted
```

**MANUAL WAY**:
1. Open `edge-agent\.env`
2. Find: `EDGE_ACTIVATION_CODE=...`
3. Replace with your new code
4. Save file

### Step 3: Restart Edge Agent

```batch
cd edge-agent
.\START_SCANNER_SIMPLE.bat
```

---

## ✅ Verification

After restart, check logs:
```powershell
Get-Content edge-agent\logs\edge-agent.log -Tail 20
```

You should see:
- ✅ `Successfully registered with control plane`
- ✅ `Synchronized N camera(s)`
- ❌ NO `invalid_or_revoked_gateway_identity`

---

## 📚 Additional Resources

- **Detailed Guide**: `EDGE_AGENT_FIX_GUIDE.md`
- **Diagnostic Tool**: `fix-registration.mjs`
- **Activation Updater**: `update-activation-code.ps1`
- **Status Checker**: `check-edge-agent.mjs`

---

## 🆘 Still Not Working?

1. Check control plane is running: `curl http://3.7.216.169:8080/health`
2. Verify activation code copied correctly (no spaces/line breaks)
3. Check detailed guide: `EDGE_AGENT_FIX_GUIDE.md`
4. Run diagnostic: `node fix-registration.mjs`

---

**TL;DR**: Get new activation code from dashboard → Update `.env` → Restart edge agent
