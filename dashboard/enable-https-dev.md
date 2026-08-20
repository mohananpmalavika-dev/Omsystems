# Enable HTTPS for Development

## Option 1: Using mkcert (Recommended)

### Install mkcert
```bash
# Using Chocolatey (Windows)
choco install mkcert

# Or download from: https://github.com/FiloSottile/mkcert/releases
```

### Generate certificates
```bash
# Install local CA
mkcert -install

# Create certificates
cd c:\Omsystems\dashboard
mkcert localhost 127.0.0.1 ::1 192.168.1.* your-local-ip
```

### Update package.json dev script
```json
"dev": "next dev --hostname 0.0.0.0 --port 3000 --experimental-https --experimental-https-key ./localhost-key.pem --experimental-https-cert ./localhost.pem"
```

### Access via HTTPS
```
https://localhost:3000
https://192.168.1.x:3000
```

---

## Option 2: Quick Test - Access via Localhost

**Easiest solution - No changes needed!**

Just access your app via:
```
http://localhost:3000
```

Browsers allow camera access on localhost even without HTTPS.

---

## Option 3: Browser Settings (Temporary for Testing)

### Chrome/Edge - Allow Insecure Origins
```
chrome://flags/#unsafely-treat-insecure-origin-as-secure
```

1. Enable the flag
2. Add your IP: `http://192.168.1.x:3000`
3. Restart browser

**⚠️ Only for development! Don't use in production!**

---

## Testing Camera Access

1. Open DevTools Console (F12)
2. Run this test:
```javascript
navigator.mediaDevices.getUserMedia({ video: true })
  .then(stream => {
    console.log('✅ Camera access granted!');
    stream.getTracks().forEach(track => track.stop());
  })
  .catch(err => console.error('❌ Camera error:', err));
```

---

## Browser-Specific Instructions

### Chrome
1. Click 🎥 icon in address bar
2. Select "Allow"
3. Refresh page

### Firefox
1. Click 🔒 icon in address bar
2. Click "Connection Secure"
3. Set "Use the Camera" to "Allow"

### Edge
1. Click 🎥 icon in address bar
2. Select "Always allow"
3. Refresh page

---

## System Permissions

### Windows
1. Settings → Privacy & Security → Camera
2. Toggle "Let apps access your camera" to ON
3. Ensure Chrome/Edge/Firefox is allowed

### Check if camera is working
1. Open Camera app (Windows)
2. If camera works there, browser should work too
3. Close Camera app before testing browser

---

## Current Setup

Your `package.json` script:
```json
"dev": "next dev --hostname 0.0.0.0 --port 3000"
```

**Recommendation:** Access via `http://localhost:3000` - no changes needed!
