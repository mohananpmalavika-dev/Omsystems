# KryptoVision Connect — Quick Start Guide

**For:** VMS Operators and Branch Staff  
**Purpose:** Get started with KryptoVision Connect calling system  
**Time to Complete:** 15 minutes

---

## 🎯 What is KryptoVision Connect?

KryptoVision Connect is a secure, production-grade communication system that lets:
- **VMS Operators** call branches and employees directly from the VMS dashboard
- **Branch Staff** call the VMS control room with one button
- **Everyone** communicate without phone numbers or external services

**Key Features:**
- ✅ Zero-login device enrollment (no passwords!)
- ✅ WebRTC audio calling with quality monitoring
- ✅ First-answer-wins (no duplicate answers)
- ✅ Persistent messaging that survives restarts
- ✅ Real-time presence indicators
- ✅ Full audit logging and telemetry

---

## 👥 User Roles

### VMS Operator (Central Control Room)
- View all branches and employees
- Call any branch (rings all branch devices)
- Call specific employees (rings employee's devices)
- See who's online/offline in real-time
- View call history
- Send messages

### Branch Staff
- Call VMS control room with one button
- Receive calls from operators
- Select which employee identity to use (if shared device)
- View recent call history

---

## 🚀 For VMS Operators

### Access the Calling Page

1. Log in to KryptoVision VMS dashboard
2. Click **Communications** in the sidebar
3. You'll see the calling page with:
   - **Left:** Branch directory with search
   - **Right:** Selected contact details
   - **Top:** Service status indicator

### Call a Branch

1. **Find the branch** in the directory (search if needed)
2. Click the branch name to select it
3. Review online device count: "X of Y devices online"
4. Click **"Call Branch"** button
5. **Accept microphone permission** when prompted
6. Wait for branch to answer
7. When connected:
   - ✅ See call duration timer
   - ✅ Use mute/unmute toggle
   - ✅ See connection quality indicator
   - ✅ End call when done

### Call a Specific Employee

1. **Select a branch** from the directory
2. Scroll down to **"Employees"** section
3. Find the employee you want to call
4. Click **"Call"** button next to their name
5. Only that employee's devices will ring

### Receive Incoming Calls

When a branch calls you:
1. **Incoming call modal appears** (even if you're on another page)
2. Shows caller info:
   - Branch name
   - Device name
   - Employee name (if they selected one)
3. Click **"Accept"** to answer
4. Click **"Decline"** to reject

**First-Answer-Wins:**
- If another operator answers first, your modal will close automatically
- You'll see a notification: "Call was answered by [Operator Name]"

### View Call History

1. Click **"Call History"** tab at the top
2. See all past calls with:
   - Timestamp
   - Branch/Employee name
   - Direction (Incoming/Outgoing)
   - Status (Connected, Missed, Rejected, etc.)
   - Duration
   - Call quality
3. Use filters to find specific calls:
   - Today / This Week / This Month
   - Specific branch
   - Incoming / Outgoing / Missed
4. Click **Refresh** to reload

### Search the Directory

Type in the search box to filter by:
- Branch name (e.g., "Kollam")
- Branch code (e.g., "KLM001")
- Employee name (e.g., "Rajesh")
- Employee role (e.g., "Manager")

### Understand Status Indicators

**Service Status (Top Right):**
- 🟢 **Service Online** — System working normally
- 🟡 **Connecting...** — Trying to connect to server
- 🔴 **Service Offline** — Cannot connect (check your internet)

**Branch/Employee Status:**
- 🟢 **Online** — At least one device is connected
- ⚕️ **Offline** — No devices connected
- 🔵 **X of Y devices** — Device count display

**Call Quality:**
- 🟢 **GOOD** — RTT < 150ms
- 🟡 **DEGRADED** — RTT 150-300ms
- 🔴 **POOR** — RTT > 300ms

---

## 🏢 For Branch Staff

### Access the Calling Page

1. Open the VMS dashboard (if device already has access)
2. Navigate to: `/communications/connect`
3. You'll see:
   - Branch name at the top
   - **"Call VMS Team"** button (large, center)
   - Connection status indicator

### Call VMS Control Room

1. Click **"Call VMS Team"** button
2. **If shared device:** Select which employee you are
   - Or select "Call as Branch" (no identity)
3. **Accept microphone permission** when prompted
4. Wait for operator to answer
5. When connected:
   - See operator name (if available)
   - See call duration
   - Use **Mute** button if needed
   - Click **End Call** when done

### Receive Incoming Calls

When an operator calls your branch:
1. **Incoming call modal appears** with large buttons
2. Shows: "Incoming call from VMS Control Room"
3. Click **"Accept"** to answer (large green button)
4. Click **"Decline"** to reject (large red button)

**Shared Devices:**
- If multiple devices are registered for your branch, the call rings on ALL of them
- First person to click "Accept" gets the call
- Other devices automatically close the incoming call modal

---

## 🔧 Device Enrollment (IT/Admin)

### For Branch Devices

**Step 1: Generate Enrollment Code (Admin)**
1. Log in to VMS as admin
2. Navigate to Communications → Devices
3. Click **"Generate Enrollment Code"**
4. Select target branch
5. Set expiration (default: 24 hours)
6. Copy the generated code (e.g., `ABCD-1234-EFGH-5678`)

**Step 2: Enroll Device (Branch)**
1. Open VMS dashboard on branch device
2. Navigate to `/communications/connect`
3. Click **"Enroll This Device"** button
4. Paste enrollment code
5. Enter device name (e.g., "Reception PC", "Security Desk")
6. Click **"Enroll"**
7. Device is now registered ✅

**Step 3: Link Employees (Optional)**
1. If device is shared, link employees:
2. Go to Communications → Devices
3. Find the device
4. Click **"Link Employee"**
5. Select employee from list
6. Repeat for all employees who use this device

**Device Model:**
- ONE DEVICE = ONE BRANCH + ZERO/ONE/MANY EMPLOYEES
- Devices can operate without employee links (calls as "Branch")
- Shared devices can have multiple employee links

---

## 🎓 Tips & Best Practices

### For Operators

✅ **DO:**
- Keep the calling page open during shifts for incoming calls
- Use "Call Branch" when you need anyone at the branch
- Use "Call Employee" when you need a specific person
- Check online status before calling
- Use call history to follow up on missed calls

❌ **DON'T:**
- Don't refresh the page during an active call (will disconnect)
- Don't deny microphone permission (calling won't work)
- Don't close incoming call modal if you want to answer

### For Branch Staff

✅ **DO:**
- Keep device connected and online during business hours
- Select correct employee identity when calling VMS
- Test audio before important calls
- End calls properly (don't just close browser)

❌ **DON'T:**
- Don't share enrollment codes with unauthorized devices
- Don't use personal devices for operational calls
- Don't revoke device access without IT approval

### For IT/Admins

✅ **DO:**
- Generate enrollment codes with appropriate expiration
- Revoke devices when they're decommissioned
- Monitor device heartbeat and presence
- Review call history for compliance
- Set up proper TURN server for production

❌ **DON'T:**
- Don't reuse enrollment codes
- Don't use public TURN servers in production
- Don't skip the database migration
- Don't expose TURN credentials publicly

---

## 🐛 Common Issues & Solutions

### "Microphone permission required"

**Problem:** Browser denied microphone access  
**Solution:**
1. Click the camera/microphone icon in address bar
2. Allow microphone access
3. Refresh the page
4. Try calling again

**Note:** WebRTC requires HTTPS in production. Local development works with HTTP.

---

### "Service Offline" status

**Problem:** Cannot connect to WebSocket server  
**Solution:**
1. Check your internet connection
2. Refresh the page
3. If problem persists, contact IT
4. Check server logs for errors

---

### "No devices available" when calling

**Problem:** Branch has no online devices  
**Solution:**
1. Verify branch has enrolled devices
2. Check device heartbeat (should send every 60 seconds)
3. Ensure device page is open on branch computer
4. Contact branch staff to check their device

---

### Call rings but no one answers

**Possible Causes:**
1. Device browser tab is closed
2. Device audio is muted
3. Staff away from computer
4. Internet connection issues at branch

**Solution:**
- Try calling again after a few minutes
- Use messaging instead
- Call another branch device if available

---

### Audio quality is poor

**Problem:** Connection quality shows "DEGRADED" or "POOR"  
**Causes:**
- High network latency (RTT > 150ms)
- Packet loss
- Low bandwidth
- TURN server not reachable

**Solutions:**
1. Check internet connection on both sides
2. Close bandwidth-heavy applications
3. Verify TURN server is configured correctly
4. Consider upgrading internet connection

---

### "Call accepted elsewhere" notification

**This is normal!** It means another operator answered the call before you.

**How First-Answer-Wins works:**
1. Call rings on ALL operator screens
2. First operator to click "Accept" gets the call
3. Other operators see "Call accepted elsewhere"
4. Only one operator can answer each call (prevents confusion)

---

## 📱 Mobile Usage

The calling page works on mobile devices!

**Mobile Layout Features:**
- ✅ Large touch-friendly buttons
- ✅ Simplified navigation
- ✅ Bottom-aligned call controls
- ✅ Incoming call modal optimized for small screens

**Known Limitations:**
- Safari iOS may require user gesture for microphone
- Some Android browsers may have audio issues
- Desktop experience is recommended for operators

---

## 🔐 Security & Privacy

### What We Log
✅ **Logged (Audit Trail):**
- Call start/end times
- Participant IDs (operator, branch, employee)
- Call duration and outcome
- Device enrollment/revocation
- Message delivery (not content!)

❌ **NOT Logged:**
- Message content (privacy-safe)
- Audio recordings (no recording feature)
- Microphone input (not captured)

### Data Retention
- **Call history:** Retained for 90 days
- **Messages:** Retained for 30 days
- **Audit logs:** Retained for 365 days
- **Device credentials:** Retained until revoked

### Permissions Required
- `communication.branch.call` — Call branches
- `communication.employee.call` — Call employees
- `communication.branch.message` — Message branches
- `communication.employee.message` — Message employees
- `communication.call.accept` — Accept calls
- `communication.call.reject` — Reject calls

---

## 📞 Support & Help

### Need Help?
- **IT Support:** Contact your IT department
- **Technical Issues:** Check server logs
- **Feature Requests:** Submit to product team
- **Documentation:** See complete guides in documentation folder

### Useful Commands (IT/Admin)

**Check device status:**
```sql
SELECT * FROM comm_devices WHERE branch_id = 'YOUR_BRANCH_ID';
```

**View recent calls:**
```sql
SELECT * FROM comm_calls 
WHERE tenant_id = 'YOUR_TENANT_ID' 
ORDER BY initiated_at DESC 
LIMIT 10;
```

**Check enrollment codes:**
```sql
SELECT * FROM comm_enrollment_codes 
WHERE status = 'active' 
AND expires_at > NOW();
```

---

## 🎉 You're Ready!

You now know how to:
- ✅ Call branches and employees
- ✅ Answer incoming calls
- ✅ Use the branch calling page
- ✅ Troubleshoot common issues
- ✅ Understand status indicators

**Start making calls and experience seamless VMS-to-branch communication!**

---

**Need More Details?**
- Full documentation: See `KRYPTOVISION_CONNECT_COMPLETE_SUMMARY.md`
- Technical architecture: See `KRYPTOVISION_CONNECT_DESIGN.md`
- Deployment guide: See `KRYPTOVISION_CONNECT_DEPLOYMENT.md`

---

**Last Updated:** December 2024  
**Status:** Production Ready ✅  
**Support:** IT Department

