# Troubleshooting Guide

**KryptoVision Sentinel Grid - Common Issues and Solutions**  
Version 1.0.0-rc.2 | Last Updated: September 15, 2026

---

## Table of Contents

1. [Login Issues](#login-issues)
2. [Video and Camera Issues](#video-and-camera-issues)
3. [Alert Issues](#alert-issues)
4. [Recording Issues](#recording-issues)
5. [Playback Issues](#playback-issues)
6. [Performance Issues](#performance-issues)
7. [Network and Connectivity](#network-and-connectivity)
8. [Mobile App Issues](#mobile-app-issues)
9. [Export and Evidence Issues](#export-and-evidence-issues)
10. [Getting Help](#getting-help)

---

## Login Issues

### Cannot Login - "Invalid Credentials"

**Symptoms:**
- Error message: "Invalid email or password"
- Login button doesn't work
- Password doesn't seem to work

**Solutions:**

**1. Check Caps Lock**
- Passwords are case-sensitive
- Ensure Caps Lock is OFF
- Try typing password in a text editor first to verify

**2. Reset Password**
- Click "Forgot Password" on login screen
- Enter your email address
- Check email for reset link (may take 2-3 minutes)
- Check spam/junk folder if not received
- Password reset link expires after 1 hour

**3. Account Locked**
- After 5 failed login attempts, account locks for 30 minutes
- Wait 30 minutes and try again
- Or contact administrator to unlock immediately

**4. Account Deactivated**
- If recently left company or changed roles, account may be deactivated
- Contact IT department or system administrator

**5. Browser Issues**
- Clear browser cookies: `Ctrl + Shift + Del` → Clear cookies
- Try incognito/private browsing mode
- Try different browser (Chrome, Firefox, Edge)

### Face Login Not Working (Face Already Enrolled)

**Symptoms:**
- Face login fails with "Face not recognized"
- Face verification fails despite being enrolled
- Works sometimes but not consistently
- Error: "No enrolled employee faces found"

**Solutions:**

**1. Lighting and Image Quality (Most Common)**
```
Problem: Poor lighting or camera conditions preventing face detection
Solutions:
  ✓ Face camera directly - no side angles
  ✓ Ensure good lighting (avoid backlighting from windows)
  ✓ Remove glasses or sunglasses if possible
  ✓ Remove masks, scarves, or face coverings
  ✓ Keep face steady for 2-3 seconds during scan
  ✓ Clean webcam lens
  ✓ Avoid extreme shadows (direct overhead lighting)
  ✓ Distance: 1-3 feet from camera works best
  ✓ Look directly at camera (not screen)
```

**2. Multi-Pose Enrollment vs Single-Pose**
```
Check enrollment method:
  - New enrollments: Require 3+ poses (front, left, right)
  - Old enrollments: May have only 1 photo
  
Solution:
  - Re-enroll with multiple poses: Profile → Security → Face Enrollment
  - Capture 3-5 different head positions:
    * Front view (mandatory)
    * 30° left turn
    * 30° right turn
    * Slightly up/down if using glasses
  - Wait 10 seconds between each capture
```

**3. Match Threshold Too Strict**
```
Problem: Similarity score below threshold (default 0.70 = 70%)
Understanding scores:
  - 0.85-1.00: Genuine user (typical range)
  - 0.70-0.84: Borderline (may be rejected if strict threshold)
  - Below 0.70: Likely different person or poor image quality
  
Solutions:
  - Contact admin to check your current threshold setting
  - Admin path: Users → [Your Name] → Biometric Settings → Match Threshold
  - Production default: 0.70 (balanced)
  - Strict mode: 0.85 (very secure but may reject genuine users)
  - If threshold at 0.85 and failing: Re-enroll with better photos
```

**4. Template Data Corruption**
```
Problem: Stored face template corrupted or invalid
Check:
  - Admin can verify: Users → [Your Name] → Preferences → faceVerification
  - Should show "version: 2" and "templates: [array]"
  
Solution:
  - Re-enroll face completely:
    1. Profile → Security → Face Enrollment
    2. Delete existing enrollment
    3. Capture new multi-pose enrollment (3+ photos)
    4. Test immediately after enrollment
```

**5. Browser/Camera Permission Issues**
```
Problem: Browser blocking webcam access
Check:
  - Look for camera icon in address bar (Chrome/Firefox)
  - May show red "X" or blocked icon
  
Solutions:
  - Chrome: Click camera icon → Always allow
  - Firefox: Click camera icon → Allow
  - Settings → Privacy → Camera → Allow for KryptoVision domain
  - Try different browser (Chrome recommended)
  - Check system camera permissions:
    * Windows: Settings → Privacy → Camera → Allow apps
    * Mac: System Preferences → Security → Privacy → Camera
```

**6. Face Template Not Found in Database**
```
Problem: Database query not finding your enrolled face
Check if you appear in enrolled users:
  - Admin query: SQL check for preferences->'faceVerification'
  
Symptoms:
  - Error: "No enrolled employee faces found"
  - Even though you completed enrollment
  
Solutions:
  - Verify enrollment saved: Profile → Security → Face Enrollment Status
  - Should show "✓ Enrolled" with date
  - If shows "Not enrolled": Re-enroll
  - Contact admin if enrollment shows saved but login still fails
  - Admin can check database: 
    SELECT username, (preferences->'faceVerification'->'version') as version
    FROM users WHERE id='your-user-id';
```

**7. Tenant/Branch Isolation Issue**
```
Problem: Enrolled under different tenant than login attempt
Check:
  - Are you using correct company/tenant URL?
  - Multi-tenant system may have separate enrollments
  
Solution:
  - Verify tenant slug in URL matches enrollment tenant
  - Contact admin to verify your tenant association
  - May need separate enrollment per tenant
```

**8. Scale/Distance Variation**
```
Problem: Face distance during login differs from enrollment
Understanding:
  - System generates multi-scale templates (85%, 100%, 115%)
  - But extreme differences still cause issues
  
Solutions:
  - Match enrollment distance during login
  - If enrolled with laptop camera: Use laptop camera for login
  - If enrolled with external webcam: Use same webcam for login
  - Stay 1-3 feet from camera (same as enrollment)
```

**9. Appearance Changed Significantly**
```
Problem: Major appearance change since enrollment
Examples:
  - Grew/shaved beard
  - Significant weight change
  - New glasses (especially thick frames)
  - Different hairstyle covering face
  
Solution:
  - Re-enroll with current appearance
  - System learns new appearance while keeping verification secure
  - Consider periodic re-enrollment (every 6-12 months)
```

**10. System Configuration Check (Admin Only)**
```
Admin troubleshooting steps:

A. Verify face login endpoint enabled:
   - Check auth.routes.ts: /v1/auth/face-login endpoint active
   - Verify findUsersWithFaceTemplates() function available

B. Check database query:
   SQL: SELECT * FROM users 
        WHERE status='active' 
        AND preferences->'faceVerification'->>'data' IS NOT NULL;
   - Should return enrolled users including failing user

C. Check threshold configuration:
   - Default: PRODUCTION_FACE_MATCH_THRESHOLD = 0.70
   - Strict: STRICT_FACE_MATCH_THRESHOLD = 0.85
   - Verify per-user overrides in preferences

D. Review logs for actual similarity scores:
   - Check application logs for: [FaceLogin] Evaluation complete
   - Shows: candidateCount, matchedUser, score
   - Score tells you how close match was (below threshold = failure)

E. Test with known-good image:
   - Use original enrollment photo for login test
   - If that fails: Template corruption issue
   - If succeeds: Live image quality issue

F. Verify face template structure:
   - Query user preferences JSON
   - Should have:
     {
       "faceVerification": {
         "version": 2,
         "templates": [array of templates],
         "enrolledAt": "ISO date",
         "method": "multi-pose-normalized-face-template"
       }
     }
   - Legacy version 1 still supported but less robust
```

**11. Testing & Validation Steps**
```
For users experiencing persistent issues:

Step 1: Test with enrollment photo
  - Take screenshot during enrollment process
  - Use that exact image for login attempt
  - Should succeed (proves template valid)

Step 2: Test with similar conditions
  - Same lighting as enrollment
  - Same distance from camera
  - Same head position (straight on)
  - Should succeed (proves matching works)

Step 3: Gradually vary conditions
  - Slight head tilt (±15°)
  - Different lighting
  - Different distance
  - Identifies which factor causes failure

Step 4: Compare similarity scores
  - Admin: Enable debug logging
  - Check score for each attempt
  - Scores 0.60-0.69: Just below threshold (increase threshold or improve image)
  - Scores 0.40-0.59: Significant mismatch (re-enroll recommended)
  - Scores <0.40: Wrong person or no face detected
```

**12. Common Error Messages & Meanings**

| Error Message | Meaning | Solution |
|--------------|---------|----------|
| "No enrolled employee faces found" | System can't find any enrolled users in database | Verify enrollment completed, check tenant slug |
| "Face not recognized" | Face detected but similarity score below threshold | Improve lighting, face camera directly, or re-enroll |
| "Facial scan must be JPEG, PNG, or WEBP" | Invalid image format | Check browser/camera compatibility |
| "Facial scan is empty or too large" | Image size issue | Check camera resolution settings |
| "Face not detected / insufficient contrast" | No clear face in image | Improve lighting, remove obstructions, face camera |
| "Session creation failed" | Backend error after successful match | Contact admin - database/session issue |

**13. Best Practices for Reliable Face Login**

**During Enrollment:**
- ✓ Use good quality webcam (720p minimum, 1080p recommended)
- ✓ Capture in well-lit environment (natural daylight best)
- ✓ Face camera directly for all poses
- ✓ Keep face steady during capture (2-3 seconds)
- ✓ Capture 3-5 different poses
- ✓ Test login immediately after enrollment

**During Login:**
- ✓ Use same device/camera as enrollment when possible
- ✓ Match lighting conditions from enrollment
- ✓ Face camera directly, stay centered
- ✓ Remove glasses if you didn't wear them during enrollment
- ✓ Keep face steady for 2-3 seconds
- ✓ Don't move during capture

**Periodic Maintenance:**
- ✓ Re-enroll every 6-12 months
- ✓ Re-enroll after significant appearance changes
- ✓ Keep backup authentication method (password) active
- ✓ Test face login periodically even if not primary method

**14. Fallback Options**

If face login continues to fail:
- **Immediate:** Use password login (username + password)
- **Short-term:** Disable face verification requirement (admin can toggle)
- **Long-term:** Re-enroll with better quality images
- **Alternative:** Enable multi-factor with app or SMS instead of face

**15. Security Considerations**

**Why threshold matters:**
- Too low (0.50-0.60): Security risk - may accept wrong people
- Balanced (0.70): Production default - good security vs convenience
- Too high (0.90+): Usability issue - rejects genuine users frequently

**Current production settings:**
- Default threshold: 0.70 (70% similarity required)
- Strict threshold: 0.85 (85% similarity for high-security areas)
- Template size: 48x48 pixels (normalized grayscale)
- Matching algorithm: Multi-scale with gradient correlation
- Mirror invariance: Handles selfie vs external camera differences

### Two-Factor Authentication Not Working

**Symptoms:**
- 2FA code doesn't work
- "Invalid code" error
- Code expired

**Solutions:**

**1. Time Sync Issue (Most Common)**
```
Problem: Authenticator app clock doesn't match server time
Solution:
  - iPhone: Settings → General → Date & Time → Set Automatically (ON)
  - Android: Settings → System → Date & Time → Automatic (ON)
  - Wait 30 seconds and generate new code
```

**2. Using Old Code**
- 2FA codes expire after 30 seconds
- Generate fresh code and enter immediately
- Don't copy-paste (may include spaces)
- Type code manually: 6 digits, no spaces

**3. Backup Codes**
- If you saved backup codes during 2FA setup, use one
- Each backup code works once only
- Contact IT if no backup codes available

**4. Reset 2FA**
- Contact system administrator
- They can temporarily disable 2FA for your account
- You'll need to re-setup 2FA after logging in

### Session Expired / Keep Getting Logged Out

**Symptoms:**
- "Session expired" message frequently
- Logged out every few minutes
- Have to login repeatedly

**Solutions:**

**1. Session Timeout Setting**
```
Default: 30 minutes of inactivity
Solution:
  - Contact administrator to increase your session timeout
  - Or click "Remember me" at login (extends to 7 days on trusted device)
```

**2. Multiple Devices/Browsers**
```
Problem: Logged in on multiple devices, reaching concurrent session limit
Solution:
  - Log out from other devices/browsers
  - Or contact admin to increase concurrent session limit
```

**3. IP Address Changes**
```
Problem: VPN or network changing your IP address
Solution:
  - Use stable network connection
  - If using VPN, connect before logging in
  - Contact admin to disable IP binding for your account
```

**4. Browser Cookies Blocked**
```
Problem: Browser settings blocking cookies
Solution:
  - Chrome: Settings → Privacy → Cookies → Allow all cookies (or add exception)
  - Firefox: Settings → Privacy → Custom → Allow cookies from KryptoVision domain
```

---

## Video and Camera Issues

### Camera Shows "Offline" or "No Video"

**Symptoms:**
- Black screen instead of video
- "Camera offline" message
- Camera icon shows red/offline status

**Solutions:**

**1. Camera Actually Offline**
```
Check:
  - Is camera powered on? (Look for LED lights)
  - Is network cable connected?
  - Can you ping camera? Open cmd/terminal:
    ping 192.168.1.100  (use your camera's IP)
  
If no response:
  - Check physical connections
  - Check PoE switch (if using PoE cameras)
  - Check camera power supply
  - Restart camera (power cycle)
```

**2. Network Issues**
```
Check:
  - Can branch server/edge agent reach camera?
  - Firewall blocking camera ports (usually 554 for RTSP)?
  - VLAN configuration correct?
  - IP address conflict?

Solutions:
  - Verify camera is on same network/VLAN
  - Check firewall rules
  - Ping from edge agent server: ping 192.168.1.100
  - Check camera web interface (open camera IP in browser)
```

**3. Camera Credentials Changed**
```
Problem: Camera password changed but not updated in KryptoVision
Solution:
  - Navigate to: Cameras → [Camera Name] → Settings → Credentials
  - Update username/password
  - Click "Test Connection"
  - If successful, click "Save"
```

**4. Camera Firmware Issue**
```
Problem: Camera firmware crashed or corrupted
Solution:
  - Reboot camera (power cycle or via web interface)
  - If problem persists, update camera firmware
  - Check with camera vendor for known issues
```

**5. Stream URL Changed**
```
Problem: Camera stream URL/path changed after firmware update
Solution:
  - Check camera manual or web interface for current stream URL
  - Update in KryptoVision: Cameras → [Camera] → Streams → Update URL
  - Common paths:
    /stream1 or /ch01/stream1 or /Streaming/Channels/101
```

### Poor Video Quality / Pixelated Video

**Symptoms:**
- Blurry or pixelated video
- Video looks compressed
- Can't read text or see faces clearly

**Solutions:**

**1. Bandwidth Limitation**
```
Check:
  - Network speed adequate? (Need 2-4 Mbps per camera for 1080p)
  - Other heavy network usage? (downloads, backups running?)
  
Solutions:
  - During live view: Right-click camera → Quality → High
  - Close other bandwidth-heavy applications
  - Upgrade network if consistently inadequate
```

**2. Camera Settings**
```
Check camera settings:
  - Resolution: Should be 1920x1080 (1080p) or higher
  - Bitrate: 2-4 Mbps for 1080p, 4-8 Mbps for 4K
  - Frame Rate: 15-30 FPS (higher is smoother)
  - Codec: H.265 (better compression) or H.264
  
Solution:
  - Access camera web interface
  - Navigate to Video Settings
  - Increase bitrate and resolution
  - Save and restart stream
```

**3. Lighting Issues**
```
Check:
  - Is area too dark or too bright?
  - Backlit scenes (bright window behind subject)?
  - Direct sunlight on camera lens?
  
Solutions:
  - Adjust camera exposure settings (via web interface)
  - Enable WDR (Wide Dynamic Range) for backlit scenes
  - Reposition camera or add lighting
```

**4. Dirty Lens**
```
Check:
  - Dust, dirt, spider webs on lens?
  - Water droplets/condensation?
  - Scratched lens?
  
Solution:
  - Clean lens with microfiber cloth
  - For outdoor cameras: Check weatherproof housing seal
  - Use lens cleaning solution (not harsh chemicals)
```

**5. Network Packet Loss**
```
Check:
  - Video has artifacts (green blocks, freezing)?
  - Video stutters?
  
Test:
  - Ping camera with large packets:
    ping 192.168.1.100 -l 1400 -n 100
  - Check for packet loss (should be 0%)
  
Solutions:
  - Replace faulty network cable
  - Check switch port (try different port)
  - Reduce distance if using long cable runs (max 100m for Ethernet)
```

### Video Lagging / Delayed

**Symptoms:**
- Video is 5-30 seconds behind real-time
- Movements are delayed
- Controls (PTZ) slow to respond

**Solutions:**

**1. Expected Latency**
```
Normal latency:
  - Local network: 1-3 seconds
  - Over internet/VPN: 3-10 seconds
  - High quality/resolution: +1-2 seconds
  
This is normal and inherent to video streaming.
```

**2. Reduce Latency Settings**
```
Solution:
  - Right-click camera → Streaming → Low Latency Mode
  - Trade-off: Slightly lower quality for faster response
  - Best for PTZ cameras where immediate control needed
```

**3. Network Congestion**
```
Check:
  - Other users streaming same cameras?
  - Heavy downloads/uploads on network?
  - Network utilization > 80%?
  
Solutions:
  - Reduce number of cameras being viewed simultaneously
  - Lower video quality: Right-click → Quality → Medium/Low
  - Schedule bandwidth-heavy tasks (backups) for off-hours
  - Implement QoS (Quality of Service) on network switches
```

**4. Computer Performance**
```
Check:
  - CPU usage > 80%? (Check Task Manager / Activity Monitor)
  - RAM usage > 90%?
  - Too many cameras open?
  
Solutions:
  - Close other applications
  - Reduce camera grid size (4x4 → 2x2)
  - Lower video quality
  - Upgrade computer if consistently overloaded
```

### PTZ Camera Not Responding

**Symptoms:**
- PTZ controls don't work
- Camera doesn't move when commanded
- Presets don't work

**Solutions:**

**1. Check PTZ Protocol**
```
Problem: Wrong PTZ protocol configured
Solution:
  - Navigate to: Cameras → [Camera] → PTZ Settings
  - Verify protocol matches camera model:
    - ONVIF (most modern cameras)
    - Pelco-D (older cameras)
    - Pelco-P (older cameras)
    - Vendor-specific (check camera manual)
  - Save and test
```

**2. PTZ Locked by Another User**
```
Problem: Another operator is controlling same PTZ camera
Solution:
  - Check "PTZ Lock Status" indicator
  - Wait for other user to release control
  - Or: Admin can force-unlock: Cameras → [Camera] → PTZ → Force Unlock
```

**3. PTZ Tour Active**
```
Problem: Camera is on automatic tour/patrol
Solution:
  - Click "Stop Tour" button
  - Manual control will be restored
```

**4. Camera Configuration**
```
Problem: PTZ RS-485 connection not working
Check:
  - RS-485 wiring correct? (A, B, Ground)
  - Termination resistor if required?
  - PTZ address correct? (usually 1-255)
  
Solution:
  - Access camera web interface
  - Verify PTZ settings
  - Test PTZ from camera's web interface first
  - If works there but not in KryptoVision, check protocol settings
```

**5. Firmware/Hardware Issue**
```
Problem: PTZ motor or encoder failure
Check:
  - Does PTZ work from camera web interface?
  - Unusual sounds when attempting to move?
  - Camera stuck in one position?
  
Solution:
  - Reboot camera
  - Update camera firmware
  - If still failing: Hardware repair needed (contact vendor)
```

---

## Alert Issues

### Not Receiving Alerts

**Symptoms:**
- No alert notifications
- Alerts not appearing in Alert Center
- Email/SMS alerts not received

**Solutions:**

**1. Alert Rules Disabled**
```
Check:
  - Navigate to: AI Analytics → Rules
  - Ensure rule has green "Enabled" status
  - Check schedule: Rule may be scheduled for specific hours only
  
Solution:
  - Click rule → Enable
  - Adjust schedule if needed
```

**2. Notification Settings**
```
Check:
  - Profile → Notifications → Email/SMS enabled?
  - Correct email address/phone number?
  - Priority filter: Set to receive P1-P3 (not just P1)?
  
Solution:
  - Enable desired notification channels
  - Verify contact information
  - Set appropriate priority filters
```

**3. Email in Spam Folder**
```
Check:
  - Email spam/junk folder
  - Email provider blocking sender
  
Solution:
  - Whitelist sender: alerts@your-kryptovision-domain.com
  - Add to contacts
  - Check with IT about email filtering
```

**4. SMS Provider Issue**
```
Check:
  - Admin: Settings → System → SMS Configuration → Test SMS
  - SMS quota exceeded? (daily limit reached?)
  - Phone number format correct? (+1-555-123-4567)
  
Solution:
  - Verify phone number includes country code
  - Check SMS quota/balance
  - Contact admin if provider issue
```

**5. Browser Notifications Blocked**
```
Check:
  - Browser notification permission denied?
  - Chrome: Look for 🔔 icon in address bar
  
Solution:
  - Click 🔔 icon → Always allow
  - Or: Settings → Privacy → Site Settings → Notifications → Allow
  - Refresh page
```

**6. Status Set to "Do Not Disturb"**
```
Check:
  - Your status (top right corner)
  - Set to 🔴 Do Not Disturb?
  
Solution:
  - Change status to 🟢 Available
```

### Too Many False Alarms

**Symptoms:**
- Constant alerts for non-events
- Motion detection triggering on shadows, trees, etc.
- Alert fatigue

**Solutions:**

**1. Adjust Detection Zone**
```
Problem: Detection zone includes areas with frequent false triggers
Solution:
  - Edit rule → Zone Configuration
  - Exclude problem areas:
    - Trees/bushes moving in wind
    - Busy roads with passing vehicles
    - Reflective surfaces (glass, water)
    - Flags or signs that move
  - Redraw zone to exclude these areas
```

**2. Increase Confidence Threshold**
```
Problem: Detection confidence too low
Solution:
  - Edit rule → Settings
  - Increase "Minimum Confidence" from 75% to 85-90%
  - Trade-off: May miss some real events but fewer false alarms
  - Test and adjust based on results
```

**3. Increase Minimum Duration**
```
Problem: Brief movements triggering alerts
Solution:
  - Edit rule → Settings
  - Increase "Minimum Duration" from 2s to 5s
  - Filters out quick movements (birds flying by, etc.)
  - Real incidents usually last longer
```

**4. Increase Cooldown Period**
```
Problem: Same event triggering multiple alerts
Solution:
  - Edit rule → Settings
  - Increase "Cooldown" from 60s to 300s (5 minutes)
  - Prevents alert spam from single incident
```

**5. Schedule-Based Rules**
```
Problem: Alerts firing during business hours when activity is normal
Solution:
  - Edit rule → Schedule
  - Set rule active only for:
    - After-hours: 18:00 - 08:00
    - Weekends: Saturday-Sunday all day
    - Holidays: Use exception dates
```

**6. Environmental Conditions**
```
Check:
  - Shadows at certain times of day?
  - Rain/snow causing motion detection?
  - Spider webs on camera?
  - Camera shake from wind?
  
Solutions:
  - Enable "Advanced Motion Detection" (ignores gradual changes)
  - Clean camera lens
  - Secure camera mount (reduce vibration)
  - Add sun shield if direct sunlight
```

### Alert Sound Not Working

**Symptoms:**
- No sound when alert arrives
- Notification appears but no audio

**Solutions:**

**1. Sound Muted**
```
Check:
  - Click 🔇/🔊 icon (top right)
  - System volume muted?
  - Browser tab muted?
  
Solution:
  - Unmute KryptoVision
  - Right-click browser tab → Unmute
  - Check system volume
```

**2. Browser Autoplay Policy**
```
Problem: Browser blocks sound without user interaction
Solution:
  - Interact with page first (click anywhere)
  - Chrome: Settings → Privacy → Site Settings → Sound → Allow
  - Or add KryptoVision to allowed sites
```

**3. Wrong Audio Output Device**
```
Check:
  - Sound playing on headphones but headphones not connected?
  - Multiple audio devices?
  
Solution:
  - Check system sound settings
  - Set correct output device (speakers, headphones, etc.)
  - Test with system sounds
```

---

## Recording Issues

### Recording Gaps / Missing Video

**Symptoms:**
- Gaps in timeline
- "No recording available" for certain times
- White gaps in playback timeline

**Solutions:**

**1. Camera Was Offline**
```
Check:
  - Was camera offline during gap period?
  - Navigate to: Cameras → [Camera] → Health History
  - Look for offline periods matching recording gap
  
Solution:
  - If camera offline: No fix, recording can't exist
  - Prevent future gaps: Enable "Storage Backup" for critical cameras
  - Set up camera health alerts
```

**2. Motion-Only Recording**
```
Check:
  - Recording mode set to "Motion" instead of "Continuous"?
  - Gaps = no motion detected during those times
  
Solution:
  - If critical camera: Change to Continuous recording
  - Navigate to: Cameras → [Camera] → Recording → Mode → Continuous
```

**3. Storage Full**
```
Check:
  - Storage health: Dashboard → Storage → Usage
  - If storage 100% full: Oldest recordings auto-deleted
  
Solution:
  - Expand storage capacity
  - Reduce retention period for non-critical cameras
  - Enable tiered storage (move old footage to cheaper storage)
  - Mark critical footage as "Evidence" (protected from deletion)
```

**4. Recording Paused/Disabled**
```
Check:
  - Recording accidentally disabled?
  - Navigate to: Cameras → [Camera] → Recording Status
  
Solution:
  - Enable recording
  - Check who disabled it: Audit Logs → Recording Events
```

**5. Network Interruption**
```
Check:
  - Network issue during gap period?
  - Check network uptime logs
  
Solution:
  - Enable local recording backup (edge agent records locally)
  - When network restored, recordings sync to central storage
  - Configure: Branch → Edge Agent → Local Recording Backup → Enable
```

**6. Edge Agent Failure**
```
Check:
  - Edge agent crashed or offline during gap?
  - Check: Branch → Edge Agent → Health History
  
Solution:
  - Restart edge agent
  - Update edge agent to latest version
  - Review system logs for crash cause
```

### Recording Quality Poor

**Symptoms:**
- Recorded video lower quality than live view
- Can't read license plates or faces in playback
- Video looks compressed

**Solutions:**

**1. Recording Profile Settings**
```
Check:
  - Recording using sub-stream instead of main stream?
  - Navigate to: Cameras → [Camera] → Recording → Stream Profile
  
Solution:
  - Change to "Main Stream" (highest quality)
  - Verify main stream is 1080p or higher
  - Trade-off: Uses more storage
```

**2. Bitrate Limit**
```
Check:
  - Max bitrate setting too low?
  - Navigate to: Cameras → [Camera] → Recording → Max Bitrate
  
Solution:
  - Increase from 2 Mbps to 4-6 Mbps for 1080p
  - For 4K: 8-12 Mbps
  - Trade-off: Uses more storage
```

**3. Camera Original Quality**
```
Check:
  - Is camera itself recording low quality?
  - Access camera web interface → Video Settings
  
Solution:
  - Increase camera's recording quality/bitrate
  - Camera settings take precedence
```

---

## Playback Issues

### Playback Won't Load / Black Screen

**Symptoms:**
- Black screen in playback
- "Loading..." never finishes
- Error message in playback

**Solutions:**

**1. No Recording Exists**
```
Check:
  - Does timeline show green bars for that time period?
  - If all white/gray: No recording available
  
Reasons:
  - Camera was offline
  - Recording disabled
  - Motion-only recording (no motion detected)
  - Storage full (old footage deleted)
```

**2. Date/Time Incorrect**
```
Check:
  - Selected correct date?
  - Time zone correct?
  - If viewing "yesterday" and it's early morning, might still be today's recording
  
Solution:
  - Verify date selection
  - Check time zone: Profile → Preferences → Time Zone
```

**3. No Permission to View**
```
Check:
  - Your role has playback permissions?
  - Error: "Insufficient permissions"
  
Solution:
  - Contact administrator to grant playback permissions
  - May be restricted by branch or camera group
```

**4. Storage Backend Issue**
```
Problem: Storage server offline or inaccessible
Check:
  - Dashboard → Storage → Health shows error?
  - Admin: Recent storage alerts?
  
Solution:
  - Contact IT/administrator
  - Storage system may need restart
```

**5. Browser Codec Support**
```
Problem: Browser can't decode video codec
Solution:
  - Try different browser (Chrome recommended)
  - Update browser to latest version
  - Clear browser cache
  - If using H.265 codec, try converting to H.264 (more compatible)
```

### Playback Video Stuttering / Choppy

**Symptoms:**
- Video skips frames
- Playback not smooth
- Freezes periodically

**Solutions:**

**1. Network Speed**
```
Check:
  - Downloading other files?
  - Network slow?
  - Wi-Fi signal weak?
  
Solutions:
  - Pause other downloads
  - Move closer to Wi-Fi router or use wired connection
  - Reduce playback quality: Playback controls → Quality → Low
```

**2. Computer Performance**
```
Check:
  - CPU usage high? (Open Task Manager)
  - Too many applications running?
  
Solutions:
  - Close unnecessary applications
  - Close other browser tabs
  - Restart browser
  - Upgrade computer if consistently slow
```

**3. Playback Speed**
```
Check:
  - Playing at 4x or 8x speed?
  - Fast forward may stutter
  
Solution:
  - Reduce speed to 1x or 2x for smoother playback
```

**4. Video File Corruption**
```
Check:
  - Only specific video/time stuttering?
  - Other videos play fine?
  
Solution:
  - Storage corruption during recording
  - Check storage health
  - If critical footage: Contact administrator for recovery attempt
```

### Export Taking Forever

**Symptoms:**
- Export stuck at "Processing..."
- Export never completes
- Very slow export

**Solutions:**

**1. Large Export**
```
Check:
  - Duration: Hours of footage take time to process
  - Estimate: ~1 minute processing per 10 minutes of video
  
Solution:
  - Be patient for large exports
  - Export smaller segments if possible
  - Export can run in background (navigate away and come back later)
```

**2. Server Load**
```
Problem: Many exports queued or server busy
Solution:
  - Check export queue: Profile → My Exports → Queue Position
  - Schedule large exports for off-hours
  - Priority exports available (contact admin)
```

**3. Storage Performance**
```
Problem: Storage system slow (HDD vs SSD)
Solution:
  - Can't fix immediately (hardware limitation)
  - Schedule exports for less busy times
  - Contact admin about storage upgrade
```

**4. Export Stuck**
```
Problem: Export truly stuck (not progressing after 30+ minutes)
Solution:
  - Cancel export: My Exports → [Export] → Cancel
  - Wait 5 minutes
  - Try again with smaller time range
  - If still fails: Contact IT (may be server issue)
```

---

## Performance Issues

### Application Slow / Laggy

**Symptoms:**
- Slow page loading
- Buttons slow to respond
- Interface feels sluggish

**Solutions:**

**1. Browser Cache**
```
Solution:
  - Clear browser cache and cookies
  - Chrome: Ctrl + Shift + Del
  - Select "Cached images" and "Cookies"
  - Time range: All time
  - Clear data
  - Refresh page (F5)
```

**2. Too Many Browser Tabs/Windows**
```
Check:
  - 10+ tabs open?
  - Multiple KryptoVision windows?
  
Solution:
  - Close unnecessary tabs
  - Use bookmarks instead of keeping tabs open
  - One KryptoVision window at a time recommended
```

**3. Browser Extensions**
```
Problem: Ad blockers or security extensions interfering
Solution:
  - Try incognito/private mode (disables most extensions)
  - If faster: Disable extensions one-by-one to find culprit
  - Whitelist KryptoVision domain in extensions
```

**4. Computer Resources**
```
Check:
  - Task Manager (Windows) or Activity Monitor (Mac)
  - CPU > 80%?
  - RAM > 90%?
  
Solutions:
  - Close memory-heavy applications
  - Restart computer (clears memory)
  - Reduce camera grid size
  - Upgrade computer if consistently slow
```

**5. Network Latency**
```
Check:
  - High ping to server?
  - Test: Open cmd/terminal, type: ping your-vms-server.com
  - Latency > 200ms = slow
  
Solutions:
  - Use wired connection instead of Wi-Fi
  - Move closer to Wi-Fi router
  - Check with ISP if internet slow
  - Close bandwidth-heavy applications (video streaming, downloads)
```

### High CPU Usage

**Symptoms:**
- Computer fans loud
- Computer hot
- CPU usage 80-100%
- Other applications slow

**Solutions:**

**1. Too Many Cameras**
```
Problem: Displaying 16+ cameras simultaneously
Solution:
  - Reduce camera grid: 4x4 → 2x2
  - View fewer cameras at once
  - Use camera rotation (auto-switch every 30 seconds)
```

**2. High Video Quality**
```
Problem: All cameras set to "High" quality
Solution:
  - Right-click cameras → Quality → Auto or Medium
  - Reserve "High" quality for 1-2 critical cameras only
```

**3. Hardware Acceleration Disabled**
```
Problem: CPU doing video decoding instead of GPU
Solution:
  - Chrome: Settings → Advanced → System → Use hardware acceleration (ON)
  - Restart browser
  - Requires compatible graphics card
```

**4. Background Processes**
```
Check:
  - Other applications using CPU? (Task Manager)
  - Windows Update running?
  - Antivirus scan running?
  
Solution:
  - Close CPU-heavy applications
  - Schedule Windows Updates for off-hours
  - Schedule antivirus scans for off-hours
```

---

## Network and Connectivity

### "Connection Lost" Messages

**Symptoms:**
- Frequent "Reconnecting..." messages
- Live feeds freeze
- Dashboard shows "Offline"

**Solutions:**

**1. Internet Connection**
```
Check:
  - Other websites loading?
  - Ping test: ping google.com
  - If no response: Internet down
  
Solutions:
  - Check modem/router
  - Restart modem: Unplug 30 seconds, plug back in
  - Contact ISP if internet down
```

**2. Firewall Blocking**
```
Check:
  - Corporate firewall blocking KryptoVision?
  - VPN disconnecting?
  
Solutions:
  - Add KryptoVision to firewall exceptions
  - Ensure VPN stable (reconnect if dropped)
  - Contact IT about firewall rules
```

**3. Session Timeout**
```
Problem: Away from computer too long
Solution:
  - Normal behavior after 30 minutes inactivity
  - Just log in again
  - Or: Click "Remember me" at login for extended sessions
```

**4. Server Maintenance**
```
Check:
  - Scheduled maintenance window?
  - System status page: status.your-kryptovision-domain.com
  
Solution:
  - Wait for maintenance to complete (usually 15-30 minutes)
  - Check email for maintenance notifications
```

### Cannot Access from Home/Remote Location

**Symptoms:**
- Works in office but not from home
- "Server not found" error
- Connection timeout

**Solutions:**

**1. VPN Required**
```
Check:
  - Does your organization require VPN for remote access?
  - VPN connected?
  
Solution:
  - Connect to company VPN first
  - Then access KryptoVision
  - Contact IT for VPN credentials/setup
```

**2. IP Whitelist**
```
Check:
  - System configured for office IP only?
  - Your role restricted to office access?
  
Solution:
  - Contact administrator to add your home IP to whitelist
  - Or: Use VPN (see above)
  - Or: Enable "Allow Access from Anywhere" for your account (less secure)
```

**3. Firewall at Home**
```
Check:
  - Home router firewall blocking?
  - ISP blocking certain ports?
  
Solution:
  - Try from different network (mobile hotspot) to test
  - If works on mobile: Home network issue
  - Contact ISP or check router settings
```

---

## Mobile App Issues

### Mobile App Won't Connect

**Symptoms:**
- "Cannot connect to server" error
- App stuck on loading screen
- Login fails on mobile but works on desktop

**Solutions:**

**1. Wrong Server URL**
```
Check:
  - Company URL entered correctly?
  - https:// included?
  - No typos?
  
Example:
  Correct: https://your-company-vms.com
  Wrong: your-company-vms.com (missing https://)
  Wrong: your-company-vms (missing domain)
```

**2. App Outdated**
```
Check:
  - App version up to date?
  - App Store / Google Play: Check for updates
  
Solution:
  - Update to latest version
  - If using enterprise app: Contact IT for updated install file
```

**3. Mobile Network Issue**
```
Check:
  - Using mobile data or Wi-Fi?
  - Cell signal weak?
  - Try switching: Mobile data ↔ Wi-Fi
  
Solution:
  - Move to area with better signal
  - Switch networks and test
```

**4. VPN Required**
```
Check:
  - Organization requires VPN for mobile access?
  
Solution:
  - Connect to company VPN on mobile first
  - Then open KryptoVision app
  - VPN apps: Cisco AnyConnect, OpenVPN, etc.
```

**5. Certificate Error**
```
Problem: SSL certificate untrusted on mobile
Solution:
  - iOS: Install company certificate profile
  - Android: Settings → Security → Install certificate
  - Contact IT for certificate file
```

### Push Notifications Not Working

**Symptoms:**
- No alert notifications on phone
- Notifications work on desktop but not mobile
- Badge count not updating

**Solutions:**

**1. Notifications Disabled**
```
iOS:
  Settings → KryptoVision → Notifications → Allow Notifications (ON)
  
Android:
  Settings → Apps → KryptoVision → Notifications → Allow (ON)
```

**2. Do Not Disturb Mode**
```
Check:
  - Phone in Do Not Disturb / Silent mode?
  
Solution:
  - iOS: Settings → Do Not Disturb → Add KryptoVision to exceptions
  - Android: Settings → Sound → Do Not Disturb → Allow from KryptoVision
```

**3. Background App Refresh Disabled**
```
iOS:
  Settings → General → Background App Refresh → KryptoVision (ON)
  
Android:
  Settings → Apps → KryptoVision → Mobile data → Background data (ON)
```

**4. Battery Optimization**
```
Android Only:
  Problem: Android killing app in background to save battery
  Solution:
    Settings → Battery → Battery Optimization → KryptoVision → Don't optimize
```

**5. Notification Settings in App**
```
Check:
  - Open KryptoVision app → Settings → Notifications
  - Push Notifications enabled?
  - Priority filters set correctly? (P1, P2, P3?)
  
Solution:
  - Enable push notifications
  - Select desired priority levels
```

### Mobile App Crashes / Freezes

**Symptoms:**
- App closes unexpectedly
- App freezes on certain screens
- Can't open app at all

**Solutions:**

**1. Force Close and Restart**
```
iOS:
  - Swipe up from bottom (or double-click home button)
  - Swipe KryptoVision up to close
  - Reopen app
  
Android:
  - Settings → Apps → KryptoVision → Force Stop
  - Reopen app
```

**2. Clear App Cache**
```
Android:
  - Settings → Apps → KryptoVision → Storage → Clear Cache
  - Note: Doesn't delete your data/login
  
iOS:
  - Delete and reinstall app (cache cleared automatically)
```

**3. Update App**
```
Check:
  - App Store / Google Play: Updates available?
  - Older versions may have bugs fixed in updates
  
Solution:
  - Update to latest version
```

**4. Low Storage**
```
Check:
  - Phone storage > 90% full?
  - Settings → Storage
  
Solution:
  - Delete unused apps
  - Delete old photos/videos
  - Free up at least 1GB space
```

**5. Reinstall App**
```
If all else fails:
  1. Delete app (long-press icon → Delete/Uninstall)
  2. Restart phone
  3. Reinstall from App Store / Google Play
  4. Login again
```

---

## Export and Evidence Issues

### Evidence Export Fails

**Symptoms:**
- Export starts but fails partway through
- "Export failed" error
- Downloaded file is corrupted

**Solutions:**

**1. Network Interrupted**
```
Problem: Connection lost during large export download
Solution:
  - Use stable wired connection for large exports
  - Don't close browser until download completes
  - Resume download if browser supports (Chrome, Firefox)
  - Or: Request IT to provide export via secure file transfer
```

**2. Browser Download Limit**
```
Problem: Browser blocking large file download (>2GB)
Solution:
  - Export in smaller segments (e.g., 30-minute chunks)
  - Use download manager extension (IDM, FDM)
  - Contact IT for direct server access for very large exports
```

**3. Storage Space on Computer**
```
Check:
  - Enough free space on your computer?
  - Export 1 hour of 1080p ≈ 3-4GB
  
Solution:
  - Free up disk space
  - Download to external drive
  - Check available space before exporting
```

**4. Export Quota Exceeded**
```
Problem: Daily/monthly export limit reached
Solution:
  - Wait until quota resets (usually midnight)
  - Contact administrator for increased quota
  - Prioritize most important exports
```

**5. File Format Issue**
```
Problem: Export completes but file won't play
Solution:
  - Try different format: MP4 (most compatible)
  - Install VLC Media Player (plays all formats)
  - Verify file size (if 0 KB, export actually failed)
  - Re-export if file corrupted
```

### Cannot Verify Evidence Hash

**Symptoms:**
- Hash verification fails
- "Hashes don't match" error
- Tamper detection warning

**Solutions:**

**1. Wrong Hash Algorithm**
```
Check:
  - Using SHA-256? (Not MD5, SHA-1, etc.)
  - Command:
    Windows: certutil -hashfile video.mp4 SHA256
    Linux/Mac: sha256sum video.mp4
```

**2. Wrong File**
```
Check:
  - Verifying correct file?
  - File renamed? Must verify with exact original filename
  - Comparing hash from correct export package?
```

**3. File Actually Modified**
```
Problem: File genuinely tampered with
Check:
  - File size matches documentation?
  - When was file downloaded?
  - Who had access?
  
Action:
  - DO NOT USE TAMPERED EVIDENCE
  - Report to administrator immediately
  - Re-export from source
  - Investigation may be needed
```

**4. Transfer Corruption**
```
Problem: File corrupted during transfer (email, USB, etc.)
Solution:
  - Download fresh copy from KryptoVision
  - Use secure file transfer methods
  - Verify immediately after download
  - Store evidence on read-only media (CD/DVD) for long-term
```

---

## Getting Help

### Before Contacting Support

**Gather this information:**

**1. Your Details**
- Your name and email
- Your role (Admin, Operator, Viewer, etc.)
- Branch/department you're monitoring

**2. Problem Details**
- What were you trying to do?
- What happened instead?
- Error message (exact text or screenshot)
- When did problem start?
- Does it happen every time or intermittently?

**3. System Details**
- Browser: Chrome, Firefox, Edge? (version?)
- Operating System: Windows 10, Mac OS, etc.
- Desktop or Mobile?
- Network: Office, Home, VPN?

**4. Screenshots**
- Take screenshot of error (Windows: `Win + Shift + S`, Mac: `Cmd + Shift + 4`)
- Include full screen (not just error message)

### Quick Fixes to Try First

Before contacting support, try these:

- [ ] Refresh page (`F5` or `Ctrl + R`)
- [ ] Clear browser cache (`Ctrl + Shift + Del`)
- [ ] Try incognito/private browsing mode
- [ ] Try different browser
- [ ] Restart computer
- [ ] Check internet connection
- [ ] Wait 5 minutes and try again (temporary server issue?)

### Contact Support

**Email Support**
- Email: support@kryptonlogic.com
- Include:
  - Subject line: Brief description of issue
  - All information from "Before Contacting Support" above
  - Screenshots
  - Any troubleshooting you've already tried
- Response time: 4 business hours (P3), 2 hours (P2), 30 minutes (P1)

**Phone Support**
- Phone: 1-800-KRYPTON (1-800-579-7866)
- Hours: 24/7 for P1 critical issues
- Hours: Mon-Fri 9 AM - 6 PM EST for other issues
- Have your computer nearby so support can guide you

**Emergency Support (Critical Issues Only)**
- P1 Issues: System down, cameras offline, critical security incident
- Emergency Hotline: 1-800-URGENT-VMS
- Email: emergency@kryptonlogic.com
- Response Time: <15 minutes

**Online Resources**
- Knowledge Base: https://support.kryptonlogic.com/kb
- Video Tutorials: https://academy.kryptonlogic.com
- Community Forum: https://community.kryptonlogic.com
- System Status: https://status.kryptonlogic.com

### Escalation Path

If your issue isn't resolved:

1. **Level 1 Support** (Front-line support)
   - Handles common issues
   - Access to knowledge base
   - Can escalate to Level 2

2. **Level 2 Support** (Technical support)
   - Handles complex technical issues
   - Can access your system remotely (with permission)
   - Can escalate to Engineering

3. **Level 3 Support** (Engineering)
   - Software bugs
   - Advanced troubleshooting
   - Feature requests

4. **Account Manager**
   - Service level issues
   - Contract questions
   - Escalations beyond technical support

**To escalate:**
- Ask support agent: "I need to escalate this issue"
- Or email: escalations@kryptonlogic.com
- Include ticket number and reason for escalation

### Creating Effective Support Tickets

**Good Ticket Example:**
```
Subject: Camera 47 shows offline but is powered and connected (Branch #103)

Description:
Camera 47 (Model: Hikvision DS-2CD2185) at Airport Branch #103 shows as 
"offline" in KryptoVision since 2:30 PM today (Sept 15).

Troubleshooting already done:
- Verified camera has power (LED lights on)
- Pinged camera: 192.168.1.147 responds
- Accessed camera web interface successfully (http://192.168.1.147)
- Verified RTSP stream works in VLC: rtsp://192.168.1.147:554/stream1
- Restarted camera (power cycled)
- Verified network connectivity from edge agent to camera

Other cameras at same branch working fine.

Screenshots attached:
1. Camera status showing "offline"
2. Ping result showing camera responds
3. Camera web interface accessible

Browser: Chrome 119.0.6045.105
OS: Windows 10 Pro
Network: Office LAN, no VPN

Request: Please investigate why KryptoVision shows camera offline when 
camera is clearly online and streaming.

Contact: John Smith, john.smith@company.com, +1-555-123-4567
Branch: Airport #103
Camera: Camera-047
Priority: P2 (High) - Security camera not recording
```

**Poor Ticket Example:**
```
Subject: Camera not working

Description:
Camera broken, please fix

Contact: John
```

---

## Preventive Maintenance

### Weekly Checks

**Operators:**
- [ ] Verify all cameras show "online"
- [ ] Check storage usage < 80%
- [ ] Review any unacknowledged alerts
- [ ] Test alert sounds working
- [ ] Verify your notification settings still correct

**Administrators:**
- [ ] Review camera uptime reports
- [ ] Check storage health (SMART status)
- [ ] Review false alarm rates (adjust rules if > 20%)
- [ ] Verify backups completed successfully
- [ ] Review user access logs for suspicious activity

### Monthly Checks

**Operators:**
- [ ] Test export functionality
- [ ] Verify mobile app still working
- [ ] Review shift reports for recurring issues

**Administrators:**
- [ ] Update cameras to latest firmware (test on 1-2 cameras first)
- [ ] Review and update AI rule thresholds
- [ ] Check edge agent versions (update if behind)
- [ ] Review audit logs
- [ ] Test disaster recovery procedures
- [ ] Review storage capacity forecast (plan expansion if needed)

### Annual Maintenance

**Administrators:**
- [ ] Physical inspection of all cameras (clean lenses, check mounts)
- [ ] Replace cameras >5 years old (plan budget)
- [ ] Review storage hardware (replace drives showing SMART warnings)
- [ ] Security audit (penetration testing, vulnerability scan)
- [ ] Review and update privacy policies
- [ ] User training refresh
- [ ] Review and update disaster recovery plan
- [ ] Backup verification test (full restore)

---

## Glossary

**Bitrate** - Amount of data used to encode video per second (Mbps). Higher = better quality, more storage.

**Chain-of-Custody** - Documented record of who handled evidence and when. Legal requirement.

**Cooldown** - Time between alerts for same event to prevent alert spam.

**Edge Agent** - Software installed at branch to manage local cameras and provide remote access.

**FPS** - Frames Per Second. Video frame rate (15-30 typical for security cameras).

**H.264 / H.265** - Video compression standards. H.265 (HEVC) provides better compression.

**Hash** - Cryptographic fingerprint of file (SHA-256). Changes if file modified.

**Latency** - Delay between real-world event and seeing it on screen (typically 1-10 seconds).

**Main Stream** - High-quality video from camera (used for recording).

**ONVIF** - Camera compatibility standard allowing different brands to work together.

**PTZ** - Pan-Tilt-Zoom camera with remote movement control.

**RTSP** - Real Time Streaming Protocol, standard for video streaming.

**Sub Stream** - Lower-quality video from camera (used for live viewing to save bandwidth).

**Temporal Confirmation** - Requiring detection across multiple frames to confirm event (reduces false alarms).

**VPN** - Virtual Private Network, secure connection over internet.

---

**Document Version:** 1.0.0  
**Last Updated:** September 15, 2026

© 2026 KryptonLogic. All rights reserved.
