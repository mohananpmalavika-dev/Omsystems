# Camera Credential Extraction Guide

## Your Camera Information
- **Device ID**: 4835592944
- **Manufacturer**: TrueCloud
- **Valid Until**: 2026/08/14

## Quick Methods to Get Username & Password

### Method 1: Online QR Code Reader (FASTEST)
1. Visit one of these websites:
   - https://webqr.com
   - https://zxing.org/w/decode
   - https://www.qr-code-generator.com/qr-code-scanner/

2. Upload the QR code image

3. The decoded text will show credentials in one of these formats:
   ```json
   {"id":"4835592944","user":"admin","pwd":"yourpassword"}
   ```
   Or:
   ```
   ID:4835592944;USER:admin;PWD:yourpassword;IP:192.168.x.x
   ```

### Method 2: Try Default Credentials
TrueCloud cameras typically use these defaults:

| Username | Password Options |
|----------|------------------|
| admin    | admin            |
| admin    | 12345            |
| admin    | 592944 (last 6 digits of device ID) |
| admin    | 888888           |
| admin    | (blank/empty)    |

**Try these combinations:**
1. Username: `admin` / Password: `admin`
2. Username: `admin` / Password: `12345`
3. Username: `admin` / Password: `592944`
4. Username: `admin` / Password: `888888`

### Method 3: Use Mobile QR Scanner
1. Download any free QR scanner app:
   - iOS: Built-in camera or "QR Code Reader"
   - Android: "QR & Barcode Scanner"

2. Scan the QR code directly from the camera

3. View the decoded text to find credentials

### Method 4: Use Our Script
If you have the QR image saved on your computer:

```bash
# Install dependencies
npm install jimp qrcode-reader

# Run the extraction script
node scripts/extract-camera-credentials.mjs path/to/qr-image.jpg
```

### Method 5: Reset Camera to Factory Defaults

**Physical Reset:**
1. Locate the reset button (usually a small hole on the camera)
2. Use a paperclip or pin to press and hold the button
3. Hold for 10-15 seconds until LED blinks
4. Camera will reset to factory defaults
5. Use default credentials: `admin` / `admin` or `admin` / `12345`

**Software Reset (if you have access):**
1. Access camera web interface
2. Go to Settings → System → Reset
3. Factory reset the device

## Testing Credentials

### Test via Browser
```
http://[camera-ip]/
```
Or:
```
rtsp://admin:password@[camera-ip]:554/stream
```

### Test via ONVIF Device Manager
1. Download ONVIF Device Manager (free tool)
2. Scan network for cameras
3. Try credentials when prompted

### Test via Our System
Once you have credentials, add them to your camera configuration:

```bash
# Use the camera discovery tool
node scripts/scan-cameras.mjs

# Or manually configure in the dashboard
# Navigate to: Cameras → Add Camera
# Enter IP, username, and password
```

## Common IP Address Patterns
If the QR code doesn't include IP, cameras usually default to:
- `192.168.1.108`
- `192.168.0.108`
- Check your router's DHCP client list
- Use network scanner: `nmap -sn 192.168.1.0/24`

## Credential Format Examples

### JSON Format
```json
{
  "id": "4835592944",
  "user": "admin",
  "pwd": "yourpassword",
  "ip": "192.168.1.108",
  "port": 554,
  "mac": "00:11:22:33:44:55"
}
```

### Key-Value Format
```
ID:4835592944;USER:admin;PWD:yourpassword;IP:192.168.1.108;PORT:554
```

### URL Format
```
truecloud://device?id=4835592944&user=admin&pwd=yourpassword&ip=192.168.1.108
```

### Comma-Separated Format
```
4835592944,admin,yourpassword,192.168.1.108,554
```

## Security Best Practices

After getting access:
1. ✅ **Change default password immediately**
2. ✅ **Use strong password (8+ chars, mixed case, numbers, symbols)**
3. ✅ **Disable unnecessary services**
4. ✅ **Update camera firmware**
5. ✅ **Set up network isolation (VLAN)**
6. ✅ **Enable HTTPS/TLS for web interface**

## Troubleshooting

### Can't Decode QR Code
- Ensure image is clear and well-lit
- Try different QR reader apps
- Check if QR code is damaged
- Contact manufacturer with device ID

### Credentials Don't Work
- Verify camera is powered on
- Check network connection
- Confirm camera IP address
- Try factory reset
- Contact TrueCloud support

### Can't Find Camera on Network
```bash
# Scan for cameras on network
nmap -p 80,554,8000,8080 192.168.1.0/24

# Or use ONVIF discovery
node scripts/discover-onvif-cameras.mjs
```

## Support Contacts

**TrueCloud Support:**
- Website: Check manufacturer website
- Email: support@truecloud.com (check official site)
- Device ID to provide: **4835592944**

**Community Help:**
- CCTV forums
- IP camera communities
- Reddit: r/homesecurity, r/CCTV

## Scripts Available

```bash
# Decode QR code from image
node scripts/extract-camera-credentials.mjs qr-code.jpg

# Show credential information
node scripts/decode-camera-qr.mjs

# Discover cameras on network
node scripts/scan-cameras.mjs

# Test camera connection
node scripts/test-camera-rtsp.mjs <ip> <username> <password>
```

## Next Steps

1. **Get credentials** using one of the methods above
2. **Test connection** to verify they work
3. **Change default password** for security
4. **Add to your system** via dashboard
5. **Configure recording and analytics** as needed

---

**Need Help?** If you're still having trouble, provide:
- The decoded QR code text (with password masked)
- Camera IP address
- Network setup details
- Error messages received
