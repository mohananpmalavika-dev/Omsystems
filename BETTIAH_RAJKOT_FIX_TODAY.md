# Bettiah & Rajkot Helmet Alert Issue - October 8, 2026

**Date:** October 8, 2026  
**Time:** 10:07 AM - 10:09 AM IST  
**Locations:** Bettiah (Channel 2 & 5), Rajkot  
**Issue:** Person entered with helmet, recording shows it, but NO ALERT generated

---

## 🔴 CRITICAL: System-Wide Issue Detected

This is **NOT** an isolated camera problem. Same issue happening at:
- ❌ **Local Pilot** (Channel 8 & 9) - October 6-7
- ❌ **Bettiah** (Channel 2 & 5) - October 8, 10:07 AM
- ❌ **Rajkot** - October 8 (today)

**Pattern:** Recording working ✅ but helmet alerts NOT generating ❌

---

## 🎯 Root Cause: ONNX Runtime Session Failure

### What Happened

The analytics engine's ONNX model sessions have crashed:

```
Error: "Session already disposed"
Location: onnxruntime-node/dist/backend.js:117
Impact: ALL frames being rejected with HTTP 500 errors
Status: Service-wide failure affecting multiple locations
```

### Why This Happens

- ONNX runtime sessions can become corrupted over time
- Memory issues or model inference failures
- Session disposal without proper cleanup
- Affects ALL cameras, not specific locations

### Why Recording Works But Alerts Don't

```
DVR Recording → Works independently ✅
    ↓
Frame sent to Analytics Engine → REJECTED ❌
    ↓
Helmet Detection → NEVER RUNS ❌
    ↓
Alert Generation → CANNOT HAPPEN ❌
```

---

## ✅ Solution: Restart Analytics Engine

### **IMMEDIATE ACTION REQUIRED**

The analytics engine service needs to be restarted to reload ONNX model sessions.

### Option 1: PowerShell Script (Easiest)
```powershell
.\restart-analytics-engine.ps1
```

### Option 2: Docker (If Running in Container)
```bash
docker restart analytics-engine

# Or restart docker-compose
cd analytics-engine
docker-compose restart
```

### Option 3: Node.js Process (If Running Directly)
```bash
cd analytics-engine

# Stop
npm run stop
# Or: pm2 stop analytics-engine
# Or: kill the process

# Rebuild
npm run build

# Start
npm start
# Or: pm2 start analytics-engine
```

### Option 4: Kubernetes (If Production Deployment)
```bash
kubectl rollout restart deployment/analytics-engine -n sentinel

# Or delete pod to force restart
kubectl delete pod -l app=analytics-engine -n sentinel
```

---

## 🔍 How to Verify Fix

### Step 1: Check Service Health (2 minutes after restart)
```bash
curl http://localhost:8092/health
```

**Expected Output:**
```json
{
  "aiState": "AI_OPERATIONAL",
  "pipeline": {
    "detectors": {
      "helmet": {
        "status": "healthy",
        "version": "1.3.2"
      }
    }
  }
}
```

### Step 2: Check Logs (Should NOT see errors)
```bash
tail -f analytics-engine/logs/analytics-engine.log
```

**Should NOT see:**
- ❌ "Session already disposed"
- ❌ HTTP 500 errors
- ❌ "Session not initialized"

**Should see:**
- ✅ Frame processing messages
- ✅ Detection results
- ✅ Event submissions

### Step 3: Live Test at Any Location
1. Person with helmet enters camera view
2. Person stands stationary for 45-60 seconds
3. Person should be 3-5 meters from camera
4. **Alert should appear within 4-6 seconds**

---

## 📊 Incident Timeline

| Time | Location | Issue | Status |
|------|----------|-------|--------|
| Oct 6, 10 PM | Local Pilot CH8 | No alerts, "Session disposed" | Diagnosed ✅ |
| Oct 7, 6 PM | Local Pilot CH9 | No alerts | Diagnosed ✅ |
| **Oct 8, 10:07 AM** | **Bettiah CH2 & CH5** | **No alerts** | **NEW** 🔴 |
| **Oct 8, Today** | **Rajkot** | **No alerts** | **NEW** 🔴 |

**Conclusion:** System-wide ONNX session failure affecting ALL locations since October 6.

---

## 🎯 Why This Wasn't Caught Earlier

1. **Recording Independence**: DVRs work independently, so recordings exist
2. **Silent Failure**: Service reports "healthy" but sessions are disposed
3. **No Automatic Recovery**: ONNX sessions don't self-heal
4. **Multiple Locations**: Issue spread across multiple branches
5. **Delayed Discovery**: Only noticed when user reviews footage

---

## 🔧 Detailed Technical Explanation

### Normal Operation Flow
```
1. Camera → Records to DVR ✅
2. Edge Gateway → Sends frame to Analytics Engine ✅
3. Analytics Engine → Loads frame into ONNX session ✅
4. ONNX Model → Detects person and helmet ✅
5. Detector → Confirms over 2-3 frames ✅
6. Alert System → Creates and sends alert ✅
```

### Current Broken Flow (Since Oct 6)
```
1. Camera → Records to DVR ✅
2. Edge Gateway → Sends frame to Analytics Engine ✅
3. Analytics Engine → Tries to load frame ❌
4. ONNX Session → "Already disposed" error ❌
5. Engine → Returns HTTP 500 to edge ❌
6. Edge Gateway → Logs error, keeps trying ❌
7. Alert System → Never reached ❌
```

---

## 📝 After Restart - Expected Behavior

### Bettiah (Channel 2 & 5)
✅ Next person with helmet → Alert in 4-6 seconds  
✅ Frames accepted and processed  
✅ Helmet detection active  
✅ Historical playback → Manual review (alerts can't be retroactive)

### Rajkot
✅ Next person with helmet → Alert in 4-6 seconds  
✅ All cameras working  
✅ Normal operation restored

### Local Pilot (Channel 8 & 9)
✅ Already should work after restart  
✅ Channel 8 fully functional  
✅ Channel 9 needs person 3-5m from camera

---

## ⚠️ Important Notes

### 1. Historical Alerts Cannot Be Generated
- Past incidents (10:07 AM today) cannot trigger alerts retroactively
- System only alerts on live frames
- Manual review required for today's footage

### 2. Recordings Are Safe
- All footage preserved in DVR
- No data loss
- Can be reviewed manually via playback

### 3. Person Detection Requirements Still Apply
Even after restart, person must be:
- **Distance**: 3-5 meters from camera (not 8-10m)
- **Duration**: Stationary for 45-60 seconds
- **Visibility**: Clear view, good lighting
- **Size**: Occupy >20% of frame height

---

## 🚨 Monitoring After Fix

### Add These Checks

**1. Health Check Every 5 Minutes**
```bash
# Add to cron or monitoring system
*/5 * * * * curl http://localhost:8092/health | grep -q "AI_OPERATIONAL" || alert-team
```

**2. Session Error Alerting**
```bash
# Monitor logs for session disposal
tail -f analytics-engine/logs/analytics-engine.log | grep -i "session.*disposed" --line-buffered | alert-team
```

**3. Frame Processing Rate**
```bash
# Check frames being processed
curl http://localhost:8092/metrics | grep "frames_processed_total"
```

---

## 📞 Quick Reference

### Restart Commands
| Environment | Command |
|------------|---------|
| PowerShell | `.\restart-analytics-engine.ps1` |
| Docker | `docker restart analytics-engine` |
| Kubernetes | `kubectl rollout restart deployment/analytics-engine` |
| PM2 | `pm2 restart analytics-engine` |
| Node | `cd analytics-engine && npm run stop && npm start` |

### Health Check
```bash
curl http://localhost:8092/health
```

### View Logs
```bash
tail -100 analytics-engine/logs/analytics-engine.log
```

### Test Helmet Detection
```bash
node analytics-engine/debug-helmet-detection.mjs --frame <path> --camera <id>
```

---

## 🎯 Action Items

### Immediate (NOW)
- [ ] Restart analytics-engine service
- [ ] Verify health shows AI_OPERATIONAL
- [ ] Check logs for no session errors
- [ ] Test with one location (live person with helmet)

### Short Term (Today)
- [ ] Verify all locations working (Bettiah, Rajkot, Local Pilot)
- [ ] Document incident for team
- [ ] Add monitoring for session disposal errors
- [ ] Add automated health checks

### Long Term (This Week)
- [ ] Investigate why ONNX sessions are getting disposed
- [ ] Add automatic session recovery mechanism
- [ ] Implement session health monitoring
- [ ] Add proactive alerting before failures
- [ ] Consider ONNX runtime upgrade

---

## 📊 Summary

### Problem
```
System-wide ONNX session disposal since October 6
Affecting: Local Pilot, Bettiah, Rajkot (and possibly others)
Symptom: Recording works, helmet detection fails
Root cause: "Session already disposed" error
```

### Solution
```
Restart analytics-engine service
Time: 2 minutes
Impact: Restores helmet detection for ALL locations
Test: Person with helmet → alert in 4-6 seconds
```

### Prevention
```
Add monitoring for session errors
Add automated health checks every 5 minutes
Add automatic restart on critical errors
Investigate root cause of session disposal
```

---

**PRIORITY:** 🔴 **CRITICAL - Restart Service Immediately**

---

**Last Updated:** October 8, 2026  
**Status:** Awaiting service restart  
**Affected Locations:** 3+ (Local Pilot, Bettiah, Rajkot)  
**Fix Time:** 2 minutes after restart
