# 🚀 Deploy Audio Fix NOW - Quick Start

## ⚡ 30-Second Deployment

### Windows (PowerShell as Administrator)
```powershell
# Run this single command:
.\Deploy-AudioFix.ps1
```

### Linux/Mac (Bash)
```bash
# Run this single command:
chmod +x deploy-audio-fix.sh && ./deploy-audio-fix.sh
```

---

## 📋 Pre-Flight Check (1 minute)

### Step 1: Check FFmpeg
```bash
ffmpeg -version
```
✅ **Should show:** FFmpeg version info  
❌ **If error:** Install FFmpeg first (see below)

### Step 2: Check Services Running
```bash
# Docker
docker ps | grep -E "media-gateway|edge-agent|dashboard"

# OR systemctl  
systemctl status mediamtx sentinel-edge sentinel-dashboard
```
✅ **Should show:** Services running  
❌ **If not running:** Start them first

---

## 🔧 Install FFmpeg (if needed)

### Windows
1. Download: https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip
2. Extract to: `C:\ffmpeg`
3. Add to PATH: `C:\ffmpeg\bin`
4. Restart PowerShell

### Ubuntu/Debian
```bash
sudo apt-get update && sudo apt-get install -y ffmpeg
```

### CentOS/RHEL
```bash
sudo yum install -y epel-release && sudo yum install -y ffmpeg
```

### macOS
```bash
brew install ffmpeg
```

---

## 🚀 Deploy Steps (30 seconds)

### Automatic Deploy (Recommended)

**Windows:**
```powershell
.\Deploy-AudioFix.ps1
```

**Linux/Mac:**
```bash
./deploy-audio-fix.sh
```

### Manual Deploy (if script fails)

**Step 1: Build**
```bash
cd edge-agent && npm run build && cd ..
cd dashboard && npm run build && cd ..
```

**Step 2: Restart Services**
```bash
# Docker
docker restart media-gateway edge-agent dashboard

# OR systemctl
sudo systemctl restart mediamtx sentinel-edge sentinel-dashboard
```

---

## ✅ Test (1 minute)

### Test 1: Open Browser
1. Go to: `http://your-server/live`
2. Click any camera
3. **Audio should play automatically!** 🔊

### Test 2: Check FFmpeg Running
```bash
# When viewing camera, check FFmpeg process:
ps aux | grep ffmpeg
# OR Windows:
Get-Process | Where-Object {$_.Name -like '*ffmpeg*'}
```
✅ **Should show:** FFmpeg process running

### Test 3: Browser Console
1. Press **F12** (open DevTools)
2. Go to **Console** tab
3. Look for errors

✅ **Should show:** No audio errors  
❌ **If errors:** See troubleshooting below

---

## 🎯 Expected Results

| What | Before Fix | After Fix |
|------|-----------|-----------|
| **Audio in Browser** | ❌ No audio | ✅ Audio works |
| **Mute Button** | 🔇 Muted by default | 🔊 Unmuted by default |
| **Camera Audio** | G.711 (incompatible) | AAC (compatible) |
| **FFmpeg Process** | Not running | Running when viewing |
| **CPU Usage** | Normal | +5-10% per stream |

---

## 🔥 Troubleshooting

### Problem: "FFmpeg not found"
**Solution:** Install FFmpeg (see install section above)

### Problem: "No audio in browser"
**Check 1:** Is FFmpeg running when viewing camera?
```bash
ps aux | grep ffmpeg
```
If NO → Check logs: `docker logs media-gateway -f`

**Check 2:** Does camera have audio?
```bash
ffprobe rtsp://CAMERA_IP:554/stream1 2>&1 | grep Audio
```
If NO → Enable audio on camera

### Problem: "Audio out of sync"
**Solution:** Add to `mediamtx.yml`:
```yaml
runOnReady: ffmpeg ... -async 1 -c:a aac ...
```

### Problem: High CPU usage
**Solution:** Lower audio quality in `mediamtx.yml`:
```yaml
-c:a aac -b:a 64k  # Instead of 128k
```

---

## 📞 Quick Support

**Check deployment status:**
```bash
# MediaMTX logs
docker logs media-gateway --tail 50

# Edge agent logs  
docker logs edge-agent --tail 50

# Check FFmpeg processes
ps aux | grep ffmpeg
```

**Verify audio codec:**
```bash
# Should show AAC in output
curl http://media-gateway:8888/CAMERA_ID/index.m3u8
```

---

## ✨ Success Checklist

After deployment, verify:

- [ ] FFmpeg installed and in PATH
- [ ] Services restarted successfully
- [ ] Can view live camera in browser
- [ ] **Audio plays automatically** ✅
- [ ] Volume button shows 🔊 (unmuted)
- [ ] Mute/unmute button works
- [ ] No errors in browser console
- [ ] FFmpeg process running when viewing
- [ ] CPU usage acceptable

---

## 🎉 That's It!

**The fix is now deployed.**

Audio will automatically transcode from G.711 to AAC for all cameras.

**First view may take 5-10 seconds** while FFmpeg starts.  
**Subsequent views will be faster.**

---

## 📚 More Info

- **Full details:** `AUDIO_FIX_IMPLEMENTED.md`
- **Troubleshooting:** `AUDIO_FIX_GUIDE.md`
- **Technical details:** `edge-agent/src/streaming/edge-live-gateway.ts`

**Enjoy your working audio!** 🎵🎉
