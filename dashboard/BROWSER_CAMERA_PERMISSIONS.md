# Browser Camera Permissions Guide

## 🚨 Quick Fix - Use Localhost

**The easiest solution:**
```
Access your app at: http://localhost:3000
```

Browsers automatically allow camera access on localhost!

---

## Step-by-Step: Grant Camera Permission

### Google Chrome / Microsoft Edge

#### Method 1: During Camera Request
1. Click "Open Camera" button
2. Browser shows permission dialog
3. Click **"Allow"**
4. ✅ Camera activates

#### Method 2: Via Address Bar Icon
1. Look for 🎥 icon in address bar (left side)
2. Click the icon
3. Set Camera to **"Allow"**
4. Reload page

#### Method 3: Site Settings
1. Click 🔒 or 🎥 icon in address bar
2. Click **"Site settings"**
3. Find **"Camera"**
4. Change from "Ask" or "Block" to **"Allow"**
5. Go back and reload page

#### Method 4: Chrome Settings
1. Chrome Menu → Settings
2. Privacy and Security → Site Settings
3. Camera → Find your site
4. Set to **"Allow"**

---

### Mozilla Firefox

#### Method 1: During Camera Request
1. Click "Open Camera" button
2. Firefox shows permission bar at top
3. Click **"Allow"**

#### Method 2: Via Address Bar Icon
1. Click 🔒 icon in address bar
2. Click **"More Information"**
3. Go to **"Permissions"** tab
4. Find **"Use the Camera"**
5. Uncheck "Use Default" 
6. Select **"Allow"**
7. Reload page

#### Method 3: Page Info
1. Right-click on page
2. Select **"View Page Info"**
3. Go to **"Permissions"** tab
4. Find Camera permission
5. Set to **"Allow"**

---

### Safari (macOS)

#### Method 1: During Camera Request
1. Click "Open Camera" button
2. Safari shows dialog
3. Click **"Allow"**

#### Method 2: Safari Settings
1. Safari menu → Settings
2. Go to **"Websites"** tab
3. Select **"Camera"** from sidebar
4. Find your site in the list
5. Set to **"Allow"**

#### Method 3: For Current Site
1. Safari menu → Settings for This Website
2. Set Camera to **"Allow"**
3. Reload page

---

## System-Level Permissions

### Windows 10/11

1. Press **Windows + I** (Settings)
2. Go to **Privacy & Security**
3. Click **Camera** (left sidebar)
4. Toggle ON: **"Let apps access your camera"**
5. Toggle ON: **"Let desktop apps access your camera"**
6. Scroll down - ensure your browser is ON

**Quick path:**
```
Settings → Privacy → Camera → Allow
```

### macOS

1. Open **System Preferences/Settings**
2. Go to **Security & Privacy**
3. Click **Privacy** tab
4. Select **Camera** from left sidebar
5. Check the box next to your browser
6. Restart browser if needed

### Linux

Camera permissions vary by distribution:

**Ubuntu/Debian:**
```bash
# Check if camera is detected
ls -l /dev/video*

# Add user to video group
sudo usermod -a -G video $USER
```

**Check browser snap permissions:**
```bash
# For Firefox/Chrome snap
snap connect firefox:camera
snap connect chromium:camera
```

---

## Testing Camera Access

### Quick Browser Test

Open Browser Console (F12), paste this:

```javascript
// Test 1: Check if API exists
console.log('MediaDevices API:', !!navigator.mediaDevices);
console.log('getUserMedia:', !!navigator.mediaDevices?.getUserMedia);
console.log('Secure Context:', window.isSecureContext);

// Test 2: List available devices
navigator.mediaDevices.enumerateDevices()
  .then(devices => {
    const cameras = devices.filter(d => d.kind === 'videoinput');
    console.log(`Found ${cameras.length} camera(s):`, cameras);
  });

// Test 3: Request camera access
navigator.mediaDevices.getUserMedia({ video: true })
  .then(stream => {
    console.log('✅ SUCCESS! Camera access granted');
    console.log('Stream:', stream);
    // Clean up
    stream.getTracks().forEach(track => track.stop());
  })
  .catch(err => {
    console.error('❌ FAILED:', err.name, err.message);
  });
```

### Expected Results

✅ **Success:**
```
MediaDevices API: true
getUserMedia: true
Secure Context: true
Found 1 camera(s): [...]
✅ SUCCESS! Camera access granted
```

❌ **Failure Examples:**
```
NotAllowedError: Permission denied
NotFoundError: No camera device found
NotReadableError: Camera is already in use
SecurityError: Not secure context (need HTTPS/localhost)
```

---

## Common Issues & Solutions

### Issue 1: "Permission Denied"
**Solution:**
- Click camera icon in address bar → Allow
- Check system privacy settings
- Reload page after granting permission

### Issue 2: "Camera Already in Use"
**Solution:**
- Close other apps using camera (Zoom, Skype, Camera app)
- Close other browser tabs using camera
- Restart browser

### Issue 3: "No Camera Found"
**Solution:**
- Check if camera is physically connected
- Test camera in Windows Camera app or macOS Photo Booth
- Update camera drivers
- Try different USB port (if external camera)

### Issue 4: "Not Secure Context"
**Solution:**
- Use `http://localhost:3000` instead of IP address
- Or set up HTTPS (see enable-https-dev.md)

### Issue 5: "Browser Doesn't Support"
**Solution:**
- Update browser to latest version
- Use Chrome, Edge, Firefox, or Safari
- Avoid Internet Explorer (not supported)

---

## Reset All Permissions (Nuclear Option)

### Chrome/Edge
1. Settings → Privacy and Security
2. Site Settings → View permissions and data
3. Find your site
4. Click **"Clear Data"** or **"Reset Permissions"**

### Firefox
1. Settings → Privacy & Security
2. Scroll to **Permissions** → Camera
3. Click **"Settings"** button
4. Remove your site from list
5. Click **"Save Changes"**

### Safari
1. Safari → Settings → Websites
2. Camera → Remove your site
3. Close and reopen Safari

---

## Verification Checklist

- [ ] Accessing via `http://localhost:3000` or HTTPS
- [ ] System camera permissions enabled for browser
- [ ] Browser camera permission set to "Allow"
- [ ] Camera is not in use by another app
- [ ] Camera device is connected and working
- [ ] Browser is up to date
- [ ] Page is reloaded after permission changes

---

## Still Not Working?

### Check Browser Console for errors:
1. Press **F12** to open DevTools
2. Go to **Console** tab
3. Look for camera-related errors
4. Share error message for help

### Test in Another Browser:
If Chrome doesn't work, try:
- Microsoft Edge
- Firefox
- Safari (macOS)

### Check if Camera Works Elsewhere:
- Windows: Open "Camera" app
- macOS: Open "Photo Booth"
- Linux: Try `cheese` or `ffplay /dev/video0`

If camera works in these apps but not browser, it's a browser permission issue.

---

**Last Updated:** August 21, 2026
**For:** OM Systems Sentinel Dashboard
