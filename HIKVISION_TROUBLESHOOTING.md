# 🔧 Hikvision Camera Missing - Troubleshooting Guide

## Quick Tests

### Test 1: Run Enhanced Hikvision Scanner
```bash
node find-hikvision-camera.js
```

This will:
- ✅ Use Hikvision SADP protocol
- ✅ Scan ALL common Hikvision ports
- ✅ Test multiple network ranges
- ✅ Retry failed connections

### Test 2: Test Specific IP
If you know your camera's IP:
```bash
node test-camera-ip.js 192.168.1.64
```

This will test ALL ports and protocols on that specific IP.

---

## Common Issues & Solutions

### ❌ Issue 1: Camera Not Found in Scan

**Solution 1: Check Camera IP Settings**
1. Download Hikvision SADP tool (official)
2. Run SADP to see actual camera IP
3. Camera might be on different subnet (e.g., 192.168.0.x instead of 192.168.1.x)

**Solution 2: Update Network Range**
Edit `find-hikvision-camera.js` line 16-21:
```javascript
const NETWORK_RANGES = [
  '192.168.1.0/24',  // Change these
  '192.168.0.0/24',  // to match
  '10.0.0.0/24',     // your network
];
```

**Solution 3: Run with Admin Privileges**
```bash
# Windows (Run as Administrator)
node find-hikvision-camera.js

# Linux/Mac
sudo node find-hikvision-camera.js
```

### ❌ Issue 2: Ports Blocked

**Check Firewall:**
```bash
# Windows - Allow Node.js
# Go to: Windows Defender Firewall > Allow an app

# Linux - Allow ports
sudo ufw allow 80,443,554,8000,8080/tcp
```

**Common Hikvision Ports:**
- `80` - HTTP Web Interface
- `443` - HTTPS
- `554` - RTSP Stream
- `8000` - SDK Port (very common)
- `8080` - Alternative HTTP
- `65001` - Device Communication

### ❌ Issue 3: Camera on Different Subnet

**Test:**
```bash
# Ping camera if you know IP
ping 192.168.1.64

# Check your computer's IP
ipconfig        # Windows
ifconfig        # Linux/Mac
ip addr show    # Linux
```

**Solution:**
If your PC is on 192.168.0.x but camera is on 192.168.1.x:
- Change network range in scanner
- Or change your PC's IP to same subnet

### ❌ Issue 4: Camera in Inactive State

**Solution:**
1. Power cycle the camera
2. Wait 2-3 minutes for full boot
3. Run scanner again

### ❌ Issue 5: DHCP Changed Camera IP

**Solution:**
1. Check router's DHCP lease table
2. Look for "Hikvision" or MAC address starting with:
   - `BC:AD:28:xx:xx:xx`
   - `44:19:B6:xx:xx:xx`
   - `C0:56:E3:xx:xx:xx`

---

## Advanced Diagnostics

### Check Camera with Curl
```bash
# Test HTTP
curl -v http://192.168.1.64

# Test with auth
curl -u admin:password http://192.168.1.64
```

### Check RTSP with FFmpeg
```bash
ffmpeg -i rtsp://192.168.1.64:554/Streaming/Channels/101 -frames:v 1 test.jpg
```

### Network Scan
```bash
# Linux/Mac - Find all devices
nmap -sP 192.168.1.0/24

# Windows - Use Advanced IP Scanner
# Download from: https://www.advanced-ip-scanner.com/
```

---

## Hikvision Default Settings

**Default IP:** `192.168.1.64`
**Default HTTP Port:** `80`
**Default RTSP Port:** `554`
**Default Username:** `admin`
**Default Password:** Set during first activation

**Common RTSP URLs:**
```
rtsp://IP:554/Streaming/Channels/101  (Main Stream)
rtsp://IP:554/Streaming/Channels/102  (Sub Stream)
rtsp://IP:554/Streaming/Channels/1
```

---

## Step-by-Step Debug Process

1. **Find Camera IP:**
   ```bash
   node find-hikvision-camera.js
   ```

2. **Test Specific IP:**
   ```bash
   node test-camera-ip.js 192.168.1.64
   ```

3. **Check Open Ports:**
   - Look for which ports respond
   - HTTP should be on 80 or 8000
   - RTSP should be on 554

4. **Test Web Interface:**
   - Open `http://CAMERA_IP` in browser
   - Should show Hikvision login page

5. **Test RTSP Stream:**
   - Use VLC: Media > Open Network Stream
   - Enter: `rtsp://CAMERA_IP:554/Streaming/Channels/101`
   - Add username/password if needed

---

## Quick Recovery

### Reset Camera to Default IP
1. Hold reset button for 30 seconds
2. Camera will reset to `192.168.1.64`
3. Set your PC to `192.168.1.x` temporarily
4. Access camera at `http://192.168.1.64`
5. Reconfigure network settings

### Use Hikvision SADP Tool
1. Download from Hikvision website
2. Run SADP
3. It will show ALL Hikvision devices
4. Shows IP, MAC, status
5. Can change IP from SADP

---

## Malayalam (മലയാളം)

### Camera കണ്ടെത്താൻ:
```bash
node find-hikvision-camera.js
```

### Specific IP test ചെയ്യാൻ:
```bash
node test-camera-ip.js 192.168.1.64
```

### പ്രധാന കാര്യങ്ങൾ:
1. Camera power on ആണോ എന്ന് check ചെയ്യുക
2. Same network ൽ ആണോ എന്ന് ഉറപ്പാക്കുക
3. IP range correct ആണോ എന്ന് നോക്കുക
4. Firewall block ചെയ്യുന്നുണ്ടോ എന്ന് പരിശോധിക്കുക

---

## Contact & Support

If camera still not found after all steps:
1. Note down camera model number
2. Check camera's physical network LED (should be blinking)
3. Try factory reset
4. Contact Hikvision support with model number
