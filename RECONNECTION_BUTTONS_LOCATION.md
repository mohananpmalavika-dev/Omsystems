# Where to Find the Reconnection Buttons

## Branch Onboarding Page (Your Current View)

**Location:** `/admin/branch-onboarding`

When an Edge Agent (Branch Gateway) shows as **offline**, you'll now see **two red buttons** instead of the disabled action buttons:

### Visual Layout:
```
┌─ Branch Gateway status ────────────────────────────────────┐
│                                                              │
│  ⚫ Sentinel Branch Gateway                                  │
│     Offline · central action required · v2.1                │
│                                                              │
│     [🔄 Reconnect]  [🔄 + Cameras]                   abc12345│
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Button Actions:

1. **🔄 Reconnect** (Red button)
   - Reconnects the Edge Agent only
   - Quick recovery for agent connectivity issues
   - Cameras remain in their current state

2. **🔄 + Cameras** (Darker red button)
   - Reconnects the Edge Agent
   - PLUS automatically restores all offline cameras
   - Full recovery solution

### When Offline Gateway is Detected:
- Status shows: "Offline · central action required"
- The gateway status indicator (●) appears red
- Normal action buttons (Rediscover, Collect logs, Restart media) are **replaced** with reconnection buttons
- Success message appears after clicking: "Reconnection initiated for Edge Agent and X camera(s)"

---

## Branch Gateway Fleet Page

**Location:** `/operations/gateway-fleet` or similar operations view

Inline reconnection buttons appear in each gateway row when status is offline:

```
Main Office                      [Offline]          ⚫ 0/3 cameras    [🔄] [🔄📷]
North Branch                     [Live-ready]       ⚫ 12/12 cameras   →
```

---

## Branch Detail / Operations View

**Location:** `/operations/branches/{branchId}`

### Edge Agent Health Card
Shows detailed agent status with prominent offline alert:

```
┌─ Edge Agent Health Card ─────────────────────────────┐
│  🖥️ Main Office Gateway                    [Offline] │
│  Branch-001 • v2.1.0                                  │
│                                                       │
│  CPU:    ▓░░░░░  --                                  │
│  Memory: ▓░░░░░  --                                  │
│  Disk:   ▓░░░░░  --                                  │
│                                                       │
│  ┌────────────────────────────────────────────────┐  │
│  │  ⚠️ Edge Agent Offline                         │  │
│  │  Last seen 2 hours ago                         │  │
│  │                                                 │  │
│  │  [   🔋 Reconnect Agent   ]                    │  │
│  │  [   🔋 Reconnect + Cameras   ]                │  │
│  └────────────────────────────────────────────────┘  │
│                                                       │
│  Heartbeat: 2 hours ago              [Details →]     │
└───────────────────────────────────────────────────────┘
```

---

## Offline Cameras Panel

**Location:** Available as standalone component or in Branch Recovery Dashboard

Shows all offline cameras with individual and bulk actions:

```
┌─ Offline Cameras (8) ────────────────────────────────────┐
│  ☑️ Select all cameras          [🔋 Reconnect All]        │
├───────────────────────────────────────────────────────────┤
│  ☑️ 📷 Front Entrance           [Offline]  [🔋 Reconnect] │
│       Main Office • 192.168.1.100                         │
│                                                            │
│  ☑️ 📷 Parking Lot              [Offline]  [🔋 Reconnect] │
│       Main Office • 192.168.1.101                         │
│                                                            │
│  ☐ 📷 Back Door                [Offline]  [🔋 Reconnect] │
│       Main Office • 192.168.1.102                         │
│                                                            │
│  ... (5 more cameras)                                     │
│                                                            │
│  [🔋 Reconnect Selected (2)]                              │
└───────────────────────────────────────────────────────────┘
```

---

## Branch Recovery Dashboard

**Location:** Dedicated recovery interface (can be added to menu)

Comprehensive view with all recovery options:

```
┌─ Branch Recovery: Main Office ──────────────────────────┐
│                                      [🔄 Refresh Status] │
│                                                           │
│  📊 Summary Statistics                                   │
│  ┌─────────┬─────────┬─────────┬──────────────┐        │
│  │ Total   │ Online  │ Offline │ Offline Cams │        │
│  │ Agents  │ Agents  │ Agents  │              │        │
│  │    3    │    2    │    1    │      8       │        │
│  └─────────┴─────────┴─────────┴──────────────┘        │
│                                                           │
│  ⚠️ Offline Edge Agents (1)                              │
│  [Edge Agent Card with reconnection buttons]             │
│                                                           │
│  📷 Offline Cameras                                       │
│  [Offline Cameras Panel]                                 │
└───────────────────────────────────────────────────────────┘
```

---

## Reconnection Flow

### 1. User Clicks Reconnection Button
```
[🔄 Reconnect] or [🔄 + Cameras]
       ↓
   Loading...
```

### 2. Command Sent to Backend
```
POST /v1/operations/health/edge-agents/{id}/reconnect
Body: { reconnectCameras: true/false }
```

### 3. Success Message Displayed
```
✅ Reconnection initiated for Edge Agent and 12 camera(s).
   Status will update automatically.
```

### 4. Status Updates Automatically
- Dashboard auto-refreshes every 30 seconds
- Manual refresh available via Refresh button
- Agent status changes: offline → pending → online
- Camera status changes: offline → pending → online

---

## Button States

### Active (Clickable)
```css
Background: #dc2626 (red-600)
Text: White
Hover: #b91c1c (red-700)
```

### Disabled (During Operation)
```css
Background: #dc2626 (red-600)
Opacity: 50%
Cursor: not-allowed
```

### Success State
```css
Icon: ✅ CheckCircle
Background: Green
Duration: 3 seconds
```

---

## Error Handling

If reconnection fails, an error message appears:

```
❌ Edge Agent not found or access denied

[Try Again]
```

Common error scenarios:
- **Edge Agent not found** - Invalid agent ID
- **Access denied** - Insufficient permissions
- **Network timeout** - API unreachable
- **Already reconnecting** - Operation in progress

---

## Quick Access Menu

To make reconnection even easier, you can add these shortcuts:

1. **Alert-based action** in the "TIME SHIFT EXCEEDED" alert
2. **Quick action menu** in the top navigation
3. **Context menu** on gateway status indicators
4. **Dashboard widget** showing offline count with direct action

---

## Keyboard Shortcuts (Future Enhancement)

Potential keyboard shortcuts:
- `Ctrl+R` - Reconnect selected agent
- `Ctrl+Shift+R` - Reconnect agent + cameras
- `Ctrl+A` then `Ctrl+R` - Select all cameras and reconnect

---

## Mobile View

On mobile devices, buttons stack vertically:

```
┌─────────────────────────┐
│ 🔄 Reconnect Agent      │
├─────────────────────────┤
│ 🔄 Reconnect + Cameras  │
└─────────────────────────┘
```

---

## Integration Points Summary

| Location | Component | Button Visibility |
|----------|-----------|-------------------|
| Branch Onboarding | `device-manager.tsx` | ✅ When gateway offline |
| Gateway Fleet | `branch-gateway-fleet.tsx` | ✅ Inline in rows |
| Branch Detail | `edge-agent-card.tsx` | ✅ In offline alert |
| Recovery Dashboard | `branch-recovery-dashboard.tsx` | ✅ Multiple locations |
| Cameras Panel | `offline-cameras-panel.tsx` | ✅ Individual & bulk |

---

## Testing the Feature

1. Navigate to `/admin/branch-onboarding`
2. Select a branch with an offline Edge Agent
3. Look for the "Branch Gateway status" section
4. You should see **red reconnection buttons** instead of the greyed-out action buttons
5. Click **"🔄 Reconnect"** or **"🔄 + Cameras"**
6. Watch for the success message
7. Status updates automatically within 30 seconds

**Note:** If you don't see the buttons, ensure:
- The Edge Agent status is showing as "offline"
- You have `device:configure` permissions for the branch
- The page has fully loaded
- Your browser cache is cleared (Ctrl+F5)
