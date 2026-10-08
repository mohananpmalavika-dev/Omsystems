# Local Pilot Camera - Alert Varunnilla (No Alert) - Fix Guide

**Status:** 🔴 **2 Issues Found**  
**Camera:** Local Pilot Channel 8 & 9

---

## 🔴 Problem Summary

Local Pilot camera-il helmet alert vannitilla (not coming) because:

1. **Channel 8**: Analytics engine-il ONNX session crash aayi (crashed)
2. **Channel 9**: Person camera-kku valarey doorath aanu (too far from camera)

---

## ✅ Quick Fix - Immediately Do This

### 🚨 **CRITICAL: Restart Analytics Engine**

Channel 8 work aakan service restart cheyyende (need to restart service):

```bash
# If running in Docker
docker restart analytics-engine

# If running as Node process
cd analytics-engine
npm run stop
npm start

# Or if using PM2
pm2 restart analytics-engine
```

**Why?** ONNX model session disposed aayi, restart cheythaal fix aavum (session crashed, restart will fix it).

---

## 🎯 Main Issues Explained

### Issue 1: Channel 8 - Service Crashed
```
Error: "Session already disposed"
Location: onnxruntime-node
Impact: All frames rejected (HTTP 500 error)
Solution: Restart service
```

### Issue 2: Channel 9 - Person Too Far
```
Current person confidence: 0.40-0.45
Required: 0.80+
Problem: Person camera-kku valarey doorath aanu
Solution: Person closer aakkanam (bring person closer)
```

---

## 📏 Person Detection Requirements

Analytics engine-nu person detect cheyyaan ithrem venam (needs these to detect):

| Requirement | Value | Malayalam |
|------------|--------|-----------|
| **Person Distance** | 3-5 meters | Camera-yude 3-5 meter akathey |
| **Person Height in Frame** | >72 pixels (20% of 360) | Frame-nte 20% vyaapthi venam |
| **Head Size** | ≥20x20 pixels | Tala nannayi kaanaanam |
| **Confidence** | ≥0.80 | 80% confidence venam |
| **Duration** | 45-60 seconds | 45 second ninnakanaam |

---

## 🔧 Step-by-Step Fix

### **STEP 1: Restart Analytics Engine** ⚡
```bash
cd analytics-engine
npm run build
npm start
```

**Check if working:**
```bash
curl http://localhost:8092/health
```

Should show: `"aiState": "AI_OPERATIONAL"`

---

### **STEP 2: Test with Proper Position** 👤

Person helmet-umayi ingane nikanam (person with helmet should stand like this):

✅ **Distance**: 3-5 meter camera-yude munbil (in front of camera)  
✅ **Position**: Nannayi camera-yude center-il (clearly in center)  
✅ **Duration**: 45-60 second angottu ninnakanam (stay still)  
✅ **Lighting**: Nalla velicham venam (good lighting needed)  
✅ **Face Camera**: Mukham camera-yude thazhottaakkanam (face towards camera)

❌ **Avoid**:
- 8-10 meter doorath (too far away)
- Side-il or corner-il (at side or corner)
- Vegam nadakkunnathu (walking too fast)
- Back-lit (velicham pinbil)

---

### **STEP 3: Enable HD Capture (Optional)** 📷

Doore ninnu detect cheyyaan (to detect from far distance):

Edit `analytics-engine/.env`:
```bash
# Add these camera IDs for HD capture
HELMET_HD_CAPTURE_CAMERAS=e66e3498-1c13-4f59-91d7-5a3386d269d2,26b22c59-b492-434a-aa89-163fff620af1
```

Then restart:
```bash
npm run build
npm start
```

**Benefit**: Distant person-ine koodi detect cheyyum (will detect distant persons too)

---

### **STEP 4: Increase Frame Rate** 🎞️

Edge gateway settings-il frame rate koottukanam (increase frame rate in edge gateway):

**Current**: ~30-40 seconds per frame (too slow)  
**Target**: 1-2 frames per second (better)

**Impact**: Faster confirmation, 4-6 second-il alert varuum (alert will come in 4-6 seconds)

---

## 🔍 How to Test

### Test 1: Check Service Running
```bash
curl http://localhost:8092/health
```

Should show:
```json
{
  "aiState": "AI_OPERATIONAL",
  "helmet": {
    "status": "healthy",
    "version": "1.3.2"
  }
}
```

### Test 2: Check Logs
```bash
tail -f analytics-engine/logs/analytics-engine.log
```

Should **NOT** see:
- "Session already disposed" ❌
- HTTP 500 errors ❌

Should see:
- Frame processing ✅
- Person detected ✅
- Helmet-worn events ✅

### Test 3: Live Frame Test
```bash
# Person standing in front of camera
# Wait 45 seconds
# Check for alert in dashboard
```

---

## 📊 Expected Results

### After Service Restart (Channel 8)
✅ No more "Session disposed" errors  
✅ Frames accepted (no HTTP 500)  
✅ Helmet detection working  
✅ Alerts generating  

### With Proper Distance (Channel 9)
✅ Person confidence >0.80  
✅ Head properly detected  
✅ 2-3 frame confirmation  
✅ Alert in 4-6 seconds  

### With HD Capture (Both)
✅ Distant person detection improved  
✅ 8-10 meter distance OK  
✅ Better in entrance scenarios  
✅ More reliable alerts  

---

## ❌ Common Mistakes

| Mistake | Problem | Solution |
|---------|---------|----------|
| Service not restarted | Channel 8 still broken | Restart analytics-engine |
| Person too far | Low confidence (0.40) | Come within 3-5m |
| Walking quickly | Not enough frames | Stand still 45s |
| Bad lighting | Detection fails | Improve lighting |
| Wrong camera angle | Side view not good | Face camera directly |
| Low frame rate | Sparse frames | Increase to 1-2 FPS |

---

## 📱 Quick Reference

### Analytics Resolution
- **Input Resolution**: 640x360 pixels
- **HD Player**: Shows higher resolution
- **Problem**: Distant persons small in 640x360
- **Solution**: HD capture or closer positioning

### Detection Gates
```typescript
PERSON_CONFIDENCE = 0.35       // Initial detection (walking)
CLASSIFIED_PERSON_CONFIDENCE = 0.9  // For helmet alerts
MIN_COMPACT_HEAD_PIXELS = 24   // Minimum head size
PENDING_HEAD_IOU = 0.2         // Tracking threshold
```

### Current Pilot Issues
```
Channel 8: ONNX session disposed → RESTART SERVICE
Channel 9: Person 0.40 confidence → BRING CLOSER
Frame gaps: 37 seconds → INCREASE RATE
```

---

## 🎯 Action Items

### Immediate (Now)
- [ ] Restart analytics-engine service
- [ ] Check health endpoint
- [ ] Verify no "Session disposed" errors

### Short Term (Today)
- [ ] Test with person 3-5m from camera
- [ ] Stand stationary for 60 seconds
- [ ] Verify alert generated

### Optional (If Needed)
- [ ] Enable HD capture for pilot cameras
- [ ] Increase frame submission rate
- [ ] Adjust camera angle/position

---

## 📞 Need Help?

Run diagnostics:
```bash
node diagnose-pilot-no-alerts.mjs
```

Check system:
```bash
node check-helmet-system.mjs
```

Verify rules:
```bash
node verify-helmet-rules.mjs
```

---

## ✅ Success Criteria

System working correctly when:
1. ✅ Health shows `AI_OPERATIONAL`
2. ✅ No "Session disposed" errors
3. ✅ Person confidence >0.80
4. ✅ Alert appears in 4-6 seconds
5. ✅ Dashboard shows helmet-worn alert

---

**Last Updated:** October 8, 2026  
**Status:** Ready to fix - restart service and test  
**Priority:** 🔴 CRITICAL - Restart immediately
