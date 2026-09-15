# Quick Start Guide

**KryptoVision Sentinel Grid - Get Started in 15 Minutes**  
Version 1.0.0-rc.2 | Last Updated: September 15, 2026

---

## Welcome to KryptoVision!

This guide will get you up and running quickly. For detailed information, see the [Admin User Guide](./ADMIN_GUIDE.md) or [Operator Manual](./OPERATOR_MANUAL.md).

---

## For System Administrators

**Time Required:** 15 minutes  
**Goal:** Set up your first branch with cameras and start monitoring

### Step 1: First Login (2 minutes)

1. **Open your browser:** `https://your-company-vms.com`
2. **Login with super admin credentials** (provided during installation)
3. **Change your password immediately:**
   - Click your name (top right) → **Profile** → **Security** → **Change Password**
   - Use strong password (12+ characters, mixed case, numbers, special characters)
4. **Enable Two-Factor Authentication (Recommended):**
   - Same page → **Two-Factor Authentication** → **Enable**
   - Scan QR code with Google Authenticator or Authy

### Step 2: Create Your Organization (3 minutes)

1. **Navigate to:** Settings → Organizations → **Add Organization**
2. **Fill in:**
   ```
   Organization Name: ACME Corporation
   Slug: acme-corp
   Industry: [Your Industry]
   Country: [Your Country]
   Time Zone: [Your Time Zone]
   ```
3. **Click** "Create Organization"
4. **Upload logo** (optional): Click organization → Settings → Upload Logo

### Step 3: Create Your First Branch (3 minutes)

1. **Navigate to:** Branches → **Add Branch**
2. **Fill in:**
   ```
   Branch Name: Main Office
   Branch Code: HQ-001
   Address: [Your address]
   Time Zone: [Same as organization]
   ```
3. **Network Mode:** Select "Edge Agent" (recommended)
4. **Business Hours:**
   ```
   Monday-Friday: 09:00 - 18:00
   Saturday: Closed
   Sunday: Closed
   ```
5. **Click** "Create Branch"

### Step 4: Install Edge Agent (4 minutes)

**On a Windows PC/Server at your branch:**

1. **Download installer:**
   - In KryptoVision: Go to your branch → **Edge Agent** tab
   - Click **Download Windows Installer**
   - Copy the **Activation Code** shown

2. **Run installer:**
   - Double-click `kryptovision-edge-agent-setup.exe`
   - Run as Administrator when prompted
   - Paste activation code when requested
   - Click "Install"

3. **Verify connection:**
   - Dashboard should show: ✅ **Edge Agent: Connected**
   - Status: "Online, Last Seen: Just now"

**Alternative (Linux/Docker):** See [Admin Guide](./ADMIN_GUIDE.md#edge-agent-installation)

### Step 5: Add Cameras (3 minutes)

**Option A: Automatic Discovery (Recommended)**

1. **Navigate to:** Your Branch → Cameras → **Discover Cameras**
2. **Click** "Start Discovery"
3. **Wait** 30-60 seconds for scan to complete
4. **Review discovered cameras** - system finds ONVIF cameras on network
5. **Enter credentials** (if required):
   ```
   Default usernames: admin, root
   Default passwords: admin, 12345, [camera brand default]
   ```
6. **Select cameras** you want to add (check boxes)
7. **Click** "Add Selected Cameras"

**Option B: Manual Add**

1. **Navigate to:** Your Branch → Cameras → **Add Camera**
2. **Fill in:**
   ```
   Camera Name: Front Entrance
   IP Address: 192.168.1.100
   Port: 554
   Protocol: RTSP
   Username: admin
   Password: [camera password]
   ```
3. **Click** "Test Connection" - should show ✅ Connected
4. **Click** "Save"

### You're Ready!

🎉 **Congratulations!** You now have:
- ✅ Organization created
- ✅ Branch set up
- ✅ Edge agent connected
- ✅ Cameras monitoring

**Next Steps:**
1. ✅ [Add more cameras](./ADMIN_GUIDE.md#adding-cameras)
2. ✅ [Create user accounts](./ADMIN_GUIDE.md#creating-users) for your team
3. ✅ [Configure AI analytics](./ADMIN_GUIDE.md#ai-analytics-configuration)
4. ✅ [Set up alerts](./ADMIN_GUIDE.md#alert-configuration)

---

## For Security Operators

**Time Required:** 10 minutes  
**Goal:** Learn the interface and start monitoring

### Step 1: First Login (2 minutes)

1. **Open your browser:** `https://your-company-vms.com`
2. **Login with credentials** (provided by your administrator)
3. **If prompted for 2FA:**
   - Enter 6-digit code from authenticator app
   - Or click link in SMS
4. **Set your status:**
   - Top right corner → Click your name
   - Set to 🟢 **Available**

### Step 2: Explore the Dashboard (2 minutes)

**Main Dashboard:**
```
┌────────────────────────────────────────────────┐
│  System Health                                 │
│  ✅ Healthy | 48/50 cameras online           │
├────────────────────────────────────────────────┤
│  Active Alerts: 3                              │
│  🔴 P1: 0  🟡 P2: 1  🟢 P3: 2               │
├────────────────────────────────────────────────┤
│  Today's Activity                              │
│  Alerts: 47  |  Incidents: 3  |  Exports: 5  │
└────────────────────────────────────────────────┘
```

**Key Areas:**
- **Top Navigation:** Dashboard, Live View, Alerts, Search
- **Main Area:** Widgets showing system status
- **Side Panel:** Quick actions and branch list

### Step 3: View Live Cameras (2 minutes)

1. **Click** "Live View" (or press `Alt + 2`)
2. **Select layout:** 2x2, 3x3, or 4x4 grid
3. **Add cameras:**
   - Click "Add Cameras" button
   - Search or browse by branch
   - Click cameras to add to grid
4. **Camera controls** (hover over any camera):
   - 📸 **Snapshot** - Capture still image
   - 🔊 **Audio** - Enable audio (if supported)
   - 🎯 **PTZ** - Pan-Tilt-Zoom controls (if PTZ camera)
   - ⬆️ **Fullscreen** - Expand to full screen

**Pro Tip:** Save your favorite camera layouts by clicking "Save View" button.

### Step 4: Respond to an Alert (2 minutes)

1. **Navigate to:** Alerts (or press `Alt + 4`)
2. **Find an alert** in the Active Alerts list
3. **Click** the alert to open details
4. **Review:**
   - What happened (description)
   - When it happened (timestamp)
   - Where it happened (branch, camera)
   - Video preview
5. **Take action:**
   - Click **"Acknowledge"** - You're taking responsibility
   - Click **"View Live"** - See current camera feed
   - Add notes: "Verified on camera, false alarm - shadow movement"
   - Click **"Resolve"** or **"Escalate"**

**Common Alert Types:**
- 🔴 **P1 (Critical):** Respond immediately (<5 min)
- 🟡 **P2 (High):** Respond urgently (<15 min)
- 🟢 **P3 (Normal):** Respond within 1 hour

### Step 5: Review Recorded Video (2 minutes)

1. **Navigate to:** Playback (or press `Alt + 3`)
2. **Select camera** from dropdown
3. **Select date** you want to review
4. **Timeline shows:**
   - Green bars = Continuous recording
   - Red marks = Alerts/events
   - Yellow marks = Motion detected
5. **Navigate:**
   - Click timeline to jump to time
   - Use ⏪ ⏩ buttons to scan
   - Press `Space` to play/pause
   - Press `,` or `.` for frame-by-frame
6. **Speed controls:** 1x, 2x, 4x, 8x speed

### You're Ready to Monitor!

🎉 **You can now:**
- ✅ View live camera feeds
- ✅ Respond to alerts
- ✅ Review recorded video
- ✅ Export evidence (see [Operator Manual](./OPERATOR_MANUAL.md#evidence-export))

**Next Steps:**
1. ✅ Learn about [incident investigation](./OPERATOR_MANUAL.md#incident-investigation)
2. ✅ Set up [mobile app](./OPERATOR_MANUAL.md#mobile-operations)
3. ✅ Review [best practices](./OPERATOR_MANUAL.md#best-practices)

---

## Common First-Day Questions

### Q: How do I add more users?

**A:** (Admins only)
1. Settings → Users → Add User
2. Fill in details: name, email, role
3. Assign branches they can access
4. Click "Send Welcome Email"
5. User receives email with temporary password

### Q: How do I change my password?

**A:**
1. Click your name (top right) → Profile
2. Security tab → Change Password
3. Enter current password
4. Enter new password (twice)
5. Click "Change Password"

### Q: Camera shows "Offline" - what do I do?

**A:**
1. Check if camera has power (LED lights on?)
2. Check network cable connected
3. Try pinging camera: `ping 192.168.1.100` (use your camera IP)
4. If no response: Check physical connections, restart camera
5. If still offline: Contact IT or see [Troubleshooting Guide](./TROUBLESHOOTING.md#camera-shows-offline-or-no-video)

### Q: How do I export video evidence?

**A:**
1. Go to Playback
2. Find the incident time
3. Mark start: Press `[` or click "Mark Start"
4. Mark end: Press `]` or click "Mark End"
5. Press `Ctrl + E` or click "Export"
6. Fill in export details (purpose, case number, recipient)
7. Click "Export"
8. Download file when ready

See detailed instructions: [Operator Manual - Evidence Export](./OPERATOR_MANUAL.md#evidence-export)

### Q: How do I set up email alerts?

**A:** (Admins only)
1. Settings → System → Email Configuration
2. Enter SMTP server details:
   ```
   Server: smtp.gmail.com
   Port: 587
   Username: alerts@yourcompany.com
   Password: [App password]
   ```
3. Click "Test Email"
4. If successful, click "Save"
5. Then: Settings → Alerts → Notification Channels
6. Configure who receives emails for which alert types

### Q: How do I enable AI analytics?

**A:** (Admins only)
1. AI Analytics → Configuration
2. Click "Enable AI Analytics"
3. Select modules to enable (e.g., Intrusion, PPE, Fire Detection)
4. System downloads AI models (5-15 minutes)
5. Wait for status: ✅ Models Loaded
6. Create rules: Cameras → [Camera] → AI Rules → Add Rule

See: [Admin Guide - AI Analytics Configuration](./ADMIN_GUIDE.md#ai-analytics-configuration)

### Q: Can I access from my phone?

**A:** Yes!
1. Download "KryptoVision" app from App Store or Google Play
2. Enter company URL: `your-company-vms.com`
3. Login with same credentials as desktop
4. Enable push notifications when prompted

See: [Operator Manual - Mobile Operations](./OPERATOR_MANUAL.md#mobile-operations)

### Q: How do I create an incident report?

**A:**
1. Incidents → Create Incident (or create from alert)
2. Fill in details:
   - Title, type, severity
   - Description of what happened
   - Cameras involved
3. Attach evidence (videos, snapshots)
4. Assign to investigator
5. Click "Create"

See: [Operator Manual - Incident Investigation](./OPERATOR_MANUAL.md#incident-investigation)

### Q: Video quality is poor - how do I improve it?

**A:**
1. **For live view:**
   - Right-click camera → Quality → High
2. **For recording:**
   - Admin: Cameras → [Camera] → Recording → Stream Profile → Main Stream
3. **Check camera settings:**
   - Access camera web interface (http://camera-ip)
   - Video Settings → Increase bitrate to 4-6 Mbps for 1080p
4. **Check lighting:**
   - Adjust camera exposure settings if too dark/bright
   - Enable WDR (Wide Dynamic Range) for backlit scenes

See: [Troubleshooting - Poor Video Quality](./TROUBLESHOOTING.md#poor-video-quality--pixelated-video)

---

## Keyboard Shortcuts Cheat Sheet

Print this for your desk!

```
┌─────────────────────────────────────────────────┐
│         KRYPTOVISION KEYBOARD SHORTCUTS         │
├─────────────────────────────────────────────────┤
│ NAVIGATION                                      │
│  Alt + 1        Dashboard                       │
│  Alt + 2        Live View                       │
│  Alt + 3        Playback                        │
│  Alt + 4        Alerts                          │
│  Ctrl + K       Search                          │
│  ?              Help                            │
├─────────────────────────────────────────────────┤
│ LIVE VIEW                                       │
│  F              Fullscreen                      │
│  → or N         Next camera                     │
│  ← or P         Previous camera                 │
│  S              Snapshot                        │
│  1              1x1 layout                      │
│  4              2x2 layout                      │
│  9              3x3 layout                      │
├─────────────────────────────────────────────────┤
│ PLAYBACK                                        │
│  Space          Play / Pause                    │
│  1              Normal speed (1x)               │
│  2              2x speed                        │
│  4              4x speed                        │
│  J              Jump back 10 seconds            │
│  L              Jump forward 10 seconds         │
│  ,              Previous frame                  │
│  .              Next frame                      │
│  [              Mark start (for export)         │
│  ]              Mark end (for export)           │
│  Ctrl + E       Export video                    │
├─────────────────────────────────────────────────┤
│ GENERAL                                         │
│  F5             Refresh page                    │
│  Ctrl + Shift+L Logout                          │
│  Esc            Close dialog / Exit fullscreen  │
└─────────────────────────────────────────────────┘
```

---

## 5-Minute Video Walkthroughs

**Can't read? Watch instead!**

Video tutorials available at: [https://academy.kryptonlogic.com](https://academy.kryptonlogic.com)

1. **Getting Started (5 min)** - First login and interface tour
2. **Adding Cameras (8 min)** - Automatic discovery and manual setup
3. **Monitoring Alerts (6 min)** - Responding to security alerts
4. **Playback and Export (10 min)** - Finding and exporting evidence
5. **AI Analytics Setup (12 min)** - Configuring smart detection rules

---

## Quick Reference Card

**Emergency Procedures**

| Situation | Action |
|-----------|--------|
| 🔥 **Fire** | 1. Call 911<br>2. Verify on camera<br>3. Activate fire alarm<br>4. Monitor evacuation |
| 🚨 **Intrusion** | 1. Acknowledge alert<br>2. Verify on video<br>3. Call security team<br>4. Keep recording |
| 🚑 **Medical** | 1. Call 911<br>2. Dispatch first aid<br>3. Monitor on camera<br>4. Guide responders |
| 🔫 **Active Threat** | 1. Call 911 immediately<br>2. Activate lockdown<br>3. Track on cameras<br>4. **DO NOT CONFRONT** |

**Support Contacts**

- **Technical Support:** support@kryptonlogic.com | 1-800-KRYPTON
- **Emergency (P1 Issues):** emergency@kryptonlogic.com | 1-800-URGENT-VMS
- **Hours:** 24/7 for critical issues, Mon-Fri 9-6 EST for general

---

## What to Learn Next

**Week 1:**
- [ ] Complete this Quick Start Guide
- [ ] Set up your favorite camera views
- [ ] Practice responding to alerts
- [ ] Learn evidence export process

**Week 2:**
- [ ] Read relevant sections of [Operator Manual](./OPERATOR_MANUAL.md)
- [ ] Set up mobile app
- [ ] Practice playback and investigation
- [ ] Create your first incident report

**Month 1:**
- [ ] Master all common operations
- [ ] Learn advanced search techniques
- [ ] Understand AI analytics rules (if applicable)
- [ ] Complete online training: [https://academy.kryptonlogic.com](https://academy.kryptonlogic.com)

**Ongoing:**
- [ ] Stay updated with new features (monthly release notes)
- [ ] Share tips with team
- [ ] Provide feedback to improve the system
- [ ] Attend quarterly webinars

---

## Troubleshooting Quick Fixes

**Problem → Solution**

| Problem | Quick Fix |
|---------|-----------|
| **Can't login** | Reset password (Forgot Password link) |
| **No video** | Refresh page (F5), check camera online |
| **Slow performance** | Clear browser cache (Ctrl+Shift+Del) |
| **Alert not working** | Check notification settings in Profile |
| **Export fails** | Try smaller time range, check internet |
| **Mobile app won't connect** | Verify company URL has https:// |

For detailed solutions, see [Troubleshooting Guide](./TROUBLESHOOTING.md)

---

## Congratulations!

You've completed the Quick Start Guide. You now have the basics to use KryptoVision effectively.

**Remember:**
- ✅ Dashboard shows overall health
- ✅ Live View for real-time monitoring
- ✅ Alerts require acknowledgment and response
- ✅ Playback for reviewing past events
- ✅ Export evidence with chain-of-custody

**Need more help?**
- 📖 [Full Operator Manual](./OPERATOR_MANUAL.md)
- 📖 [Admin User Guide](./ADMIN_GUIDE.md)
- 🛠️ [Troubleshooting Guide](./TROUBLESHOOTING.md)
- ❓ [FAQ](./FAQ.md)
- 📧 support@kryptonlogic.com
- 📞 1-800-KRYPTON

**Welcome to the KryptoVision family!** 🎉

---

**Document Version:** 1.0.0  
**Last Updated:** September 15, 2026

© 2026 KryptonLogic. All rights reserved.
