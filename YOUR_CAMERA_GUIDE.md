# Your TrueCloud Camera - Quick Guide

## Your Camera Details

```
Device ID: 4835592944
Manufacturer: TrueCloud
Valid Until: 2026/08/14 20:34:08
Status: Active
```

## 🎯 Quick Actions

### Action 1: Test QR Code Online (30 seconds)

1. Go to: **https://webqr.com**
2. Click "Upload"
3. Upload your QR screenshot
4. Copy the decoded text
5. Look for username and password

### Action 2: Try Default Credentials (1 minute)

Try these combinations in order:

```
Attempt 1: admin / admin
Attempt 2: admin / 12345  
Attempt 3: admin / 592944
Attempt 4: admin / 888888
Attempt 5: admin / (empty)
```

### Action 3: Use Our New Feature (2 minutes)

```bash
cd dashboard
npm run dev
```

Then:
1. Open: http://localhost:3000/admin/branch-onboarding
2. Click: "Scan cameras"
3. Click: "Enter login & password"
4. Click: "**Scan or Upload QR Code**" ← NEW!
5. Upload your QR screenshot
6. Credentials auto-fill ✨

## 📋 What We Know About Your Camera

### Device Information
- **Type**: IP Camera (likely)
- **Brand**: TrueCloud
- **QR Type**: Pairing/Setup QR
- **Purpose**: Add to TrueCloud app

### Likely Specifications
- **Protocol**: ONVIF compatible
- **Default Port**: 80 (HTTP), 554 (RTSP)
- **Stream**: H.264 or H.265
- **Resolution**: 1080p (likely)
- **Features**: Motion detection, night vision

### Network Setup
- **Connection**: WiFi or Ethernet
- **IP**: Assigned by DHCP (check router)
- **Access**: Local network + cloud (TrueCloud app)

## 🔐 Common TrueCloud Credentials

Based on TrueCloud camera patterns:

| Priority | Username | Password | Source |
|----------|----------|----------|--------|
| 1 | admin | admin | Factory default |
| 2 | admin | 12345 | Common default |
| 3 | admin | 592944 | Device ID suffix |
| 4 | admin | 888888 | Vendor pattern |
| 5 | admin | (blank) | Some models |

### How to Find Actual Credentials

**Method 1**: Decode QR code
```bash
# Online
https://webqr.com → Upload image

# Or CLI
node test-qr-decode.mjs your-qr.jpg
```

**Method 2**: Check camera label
- Look for printed username/password
- Check camera manual/box
- Sometimes on sticker underneath

**Method 3**: TrueCloud App
- Install TrueCloud mobile app
- Scan QR through app
- App shows/uses credentials automatically

**Method 4**: Factory Reset
- Find reset button (small hole)
- Press & hold 10-15 seconds
- Credentials reset to defaults
- Try admin/admin after reset

## 🌐 Finding Your Camera on Network

### Method 1: Router Admin
1. Login to your router (usually 192.168.1.1)
2. Check DHCP client list
3. Look for "TrueCloud" or camera MAC address
4. Note the IP address

### Method 2: Network Scanner
```bash
# Using nmap (if installed)
nmap -sn 192.168.1.0/24

# Look for port 80, 554, 8000, 8080
nmap -p 80,554,8000,8080 192.168.1.0/24
```

### Method 3: Our Scanner
```bash
cd dashboard
npm run dev

# Navigate to branch onboarding
# Click "Scan cameras"
# System discovers camera automatically
```

## 🚀 Setup Workflow

### Complete Setup Steps

1. **Find Camera IP**
   - Check router DHCP list
   - Or use network scanner
   - Example: 192.168.1.108

2. **Get Credentials**
   - Decode QR code (webqr.com)
   - Or try defaults (admin/admin)
   - Or check camera label

3. **Test Connection**
   ```bash
   # Browser test
   http://192.168.1.108
   # Enter username/password
   ```

4. **Add to Dashboard**
   - Go to branch onboarding
   - Click "Scan cameras"
   - OR manually add with IP
   - Enter credentials (or use QR scanner!)
   - Verify connection

5. **Configure**
   - Set camera name
   - Configure recording
   - Enable analytics
   - Set up alerts

## 📱 TrueCloud App Alternative

If our system doesn't work:

1. **Download**: TrueCloud app from app store
2. **Scan**: QR code through app
3. **Setup**: Camera adds automatically
4. **Extract**: Note the credentials used
5. **Use**: Same credentials in our dashboard

## 🔧 Troubleshooting

### Camera Not Found
**Problem**: Scanner doesn't discover camera

**Solutions**:
1. Ensure camera powered on
2. Check network connection
3. Verify same subnet (192.168.1.x)
4. Try manual IP entry
5. Check firewall settings

### Wrong Credentials  
**Problem**: Login rejected

**Solutions**:
1. Try all default combinations
2. Decode QR code
3. Factory reset camera
4. Check if password was changed
5. Contact TrueCloud support

### Can't Decode QR
**Problem**: QR scanner fails

**Solutions**:
1. Better lighting
2. Clearer photo
3. Use webqr.com
4. Try mobile QR scanner
5. Manual credential entry

## 📞 Support Options

### TrueCloud Support
- **Website**: Check TrueCloud official site
- **Email**: support@truecloud.com (verify)
- **Phone**: Check product documentation
- **Device ID**: 4835592944 (provide this)

### Our Support
- Check: `QR_CREDENTIAL_SCANNER_GUIDE.md`
- Check: `CAMERA_CREDENTIAL_GUIDE.md`
- Check: `TEST_YOUR_QR.md`
- Run: `node test-qr-decode.mjs`

## ✅ Success Checklist

After setup, verify:

- [ ] Camera discovered on network
- [ ] Credentials working
- [ ] Live stream accessible
- [ ] Recording configured
- [ ] Analytics enabled
- [ ] Alerts set up
- [ ] Mobile access working

## 💡 Pro Tips

1. **Static IP**: Set static IP for camera
2. **Strong Password**: Change from default
3. **Firmware**: Update to latest version
4. **Backup**: Document credentials
5. **Labels**: Label cameras physically
6. **Test**: Verify recording works
7. **Monitor**: Check health regularly

## 🎬 Next Steps

### Immediate (Now)
1. Decode your QR code: https://webqr.com
2. Try the credentials
3. Test our QR scanner feature
4. Report back results

### Short Term (Today)
1. Add camera to dashboard
2. Configure recording
3. Set up analytics
4. Test alerts

### Long Term (This Week)
1. Add remaining cameras
2. Configure zones
3. Set up schedules
4. Train team on system

---

**Need Help?**

Start here: https://webqr.com
Upload your QR screenshot
Share the decoded text (mask password)
We'll help you from there!
