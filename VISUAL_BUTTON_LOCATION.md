# Visual Guide: Where Are the Reconnection Buttons?

## Your Current Page: Branch Onboarding

Based on your screenshot, here's exactly where the buttons will appear:

```
┌──────────────────────────────────────────────────────────────────────┐
│  Sentinel Grid - Branch onboarding                                   │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ⚠️ EDGE AGENT OFFLINE                                               │
│  No provision edge agent is currently online...                      │
│                                                                       │
│  ⚠️ TIME SHIFT EXCEEDED                                              │
│  2 device(s) reported clock-drift...                                 │
│                                                                       │
│  ─────────────────────────────────────────────────────────────────   │
│                                                                       │
│  ▼ Advanced connection setup                                         │
│                                                                       │
│  Branch Gateway status                                               │
│  3 appliances enrolled                                               │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  ⚫ Local Camera Pilot Scanner       [OFFLINE STATUS]        │    │
│  │     Offline · central action required · v2.1                 │    │
│  │                                                              │    │
│  │     ┌──────────────┐  ┌─────────────────┐          abc1234 │    │
│  │     │ 🔄 Reconnect │  │ 🔄 + Cameras    │                   │    │
│  │     └──────────────┘  └─────────────────┘                   │    │
│  │        ↑                      ↑                              │    │
│  │        │                      │                              │    │
│  │     [NEW BUTTON]         [NEW BUTTON]                        │    │
│  │   Reconnect Agent    Reconnect Agent + All Cameras           │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  ⚫ Local Camera Pilot Scanner       [OFFLINE STATUS]        │    │
│  │     Offline · central action required · v2.1                 │    │
│  │                                                              │    │
│  │     ┌──────────────┐  ┌─────────────────┐          xyz5678 │    │
│  │     │ 🔄 Reconnect │  │ 🔄 + Cameras    │                   │    │
│  │     └──────────────┘  └─────────────────┘                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  🟢 Local Camera Pilot Scanner       [ONLINE STATUS]        │    │
│  │     Online · camera and recorder monitoring active · v2.1    │    │
│  │                                                              │    │
│  │     [🔍] [📋] [🔄]                               def9012    │    │
│  │   (Normal action buttons remain for online agents)           │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                       │
│  Camera inventory                                                    │
│  4 devices                                                           │
│  ...                                                                 │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

## Key Changes:

### BEFORE (Current State):
```
⚫ Gateway Name                     [Offline]
   Offline · central action required · v2.1

   [🔍] [📋] [🔄]  (All disabled/greyed out)     abc123
```

### AFTER (With Reconnection Feature):
```
⚫ Gateway Name                     [Offline]
   Offline · central action required · v2.1

   [🔄 Reconnect]  [🔄 + Cameras]               abc123
   (Red buttons, clickable)
```

## Button Details:

### Button 1: "🔄 Reconnect"
- **Color:** Red (#dc2626)
- **Action:** Reconnects the Edge Agent only
- **Use Case:** When you just need to restore agent connectivity
- **Click Result:** 
  ```
  ✅ Reconnection initiated for Edge Agent.
     Status will update automatically.
  ```

### Button 2: "🔄 + Cameras"  
- **Color:** Darker Red (#b91c1c)
- **Action:** Reconnects Edge Agent AND all offline cameras
- **Use Case:** When you want full recovery
- **Click Result:**
  ```
  ✅ Reconnection initiated for Edge Agent and 12 camera(s).
     Status will update automatically.
  ```

## What Happens When You Click:

1. **Immediate Feedback:**
   ```
   [🔄 Reconnect] → [⏳ Reconnecting...]
   ```

2. **Success Message (Green bar at top):**
   ```
   ✅ Reconnection initiated for Edge Agent and 12 camera(s).
      Status will update automatically.
   ```

3. **Status Updates:**
   - After ~2 seconds: Page refreshes automatically
   - Gateway status changes from "Offline" to "Pending"
   - After agent reconnects: Status shows "Online"
   - Cameras start coming online one by one

## Color Coding:

```
🔴 Red Buttons     = Offline actions (Reconnect)
🟢 Green Status    = Online/Active
🟡 Yellow Status   = Warning/Degraded
⚫ Grey Status     = Offline/Unknown
```

## Real-World Example:

**Scenario:** Your Branch Gateway went offline 2 hours ago due to network issues.

**What you see now:**
- ⚠️ EDGE AGENT OFFLINE alert at the top
- Gateway shows "Offline · central action required"
- All action buttons are disabled

**What you'll see with the feature:**
- Same offline alert
- Same status message
- **TWO RED BUTTONS** instead of disabled buttons
- Click one, get immediate feedback
- System automatically attempts reconnection

## Browser View:

The buttons will be visible on **any device**:

### Desktop (Wide Screen):
```
[🔄 Reconnect]  [🔄 + Cameras]
```

### Tablet/Mobile (Narrow Screen):
```
[🔄 Reconnect      ]
[🔄 + Cameras      ]
(Stacked vertically)
```

## First-Time Use Checklist:

1. ✅ Navigate to `/admin/branch-onboarding`
2. ✅ Select a branch with offline gateway
3. ✅ Scroll to "Branch Gateway status" section
4. ✅ Look for gateway with "Offline" status
5. ✅ Find the red buttons (replacing normal action buttons)
6. ✅ Click "Reconnect" or "+ Cameras"
7. ✅ Watch for success message
8. ✅ Wait for status to update (~30 seconds)

## If You Don't See the Buttons:

**Possible reasons:**

1. **Gateway is not offline**
   - Buttons only appear when status = "offline"
   - Online gateways show normal action buttons

2. **Page cache**
   - Press `Ctrl+F5` to hard refresh
   - Clear browser cache

3. **Code not deployed**
   - Ensure latest code is deployed to server
   - Check console for JavaScript errors

4. **Permissions issue**
   - Verify you have `device:configure` permission
   - Check you're accessing the correct tenant

## Testing Steps:

To test the feature works:

```bash
# 1. Make sure backend is running
cd backend
npm start

# 2. Make sure frontend is running  
cd dashboard
npm run dev

# 3. Open browser
http://localhost:3000/admin/branch-onboarding

# 4. Open browser console (F12) to see any errors
```

## API Call Example:

When you click the button, this happens behind the scenes:

```javascript
// Frontend makes this call:
POST /api/control/v1/operations/health/edge-agents/agent-123/reconnect
Body: { reconnectCameras: true }

// Backend processes:
1. Validates user permissions
2. Creates reconnection command
3. Updates agent status to 'pending'
4. Optionally marks cameras for recovery
5. Logs audit trail
6. Returns success response

// Frontend shows:
✅ Success message
🔄 Auto-refresh after 2 seconds
```

## Success Indicators:

You'll know it worked when:

1. ✅ Green success message appears at top
2. ✅ Gateway status updates from "Offline" to "Pending"
3. ✅ After ~30s, status shows "Online"
4. ✅ If cameras included, they start appearing as online
5. ✅ Action buttons change back to normal operations buttons

---

## Quick Reference Card:

```
┌─────────────────────────────────────────────────────┐
│  RECONNECTION QUICK REFERENCE                       │
├─────────────────────────────────────────────────────┤
│  Location: /admin/branch-onboarding                 │
│  Section: Branch Gateway status                     │
│  Condition: Gateway status = "offline"              │
│                                                      │
│  Button 1: [🔄 Reconnect]                           │
│    → Reconnects agent only                          │
│                                                      │
│  Button 2: [🔄 + Cameras]                           │
│    → Reconnects agent + all offline cameras         │
│                                                      │
│  Result: Green success message + auto-refresh       │
└─────────────────────────────────────────────────────┘
```
