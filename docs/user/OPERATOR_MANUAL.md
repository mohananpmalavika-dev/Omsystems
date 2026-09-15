# Operator Manual

**KryptoVision Sentinel Grid - Security Operator Guide**  
Version 1.0.0-rc.2 | Last Updated: September 15, 2026

---

## Table of Contents

1. [Introduction](#introduction)
2. [Getting Started](#getting-started)
3. [Dashboard Overview](#dashboard-overview)
4. [Live Monitoring](#live-monitoring)
5. [Alert Management](#alert-management)
6. [Incident Investigation](#incident-investigation)
7. [Playback and Review](#playback-and-review)
8. [Evidence Export](#evidence-export)
9. [Reporting](#reporting)
10. [Mobile Operations](#mobile-operations)
11. [Best Practices](#best-practices)

---

## Introduction

### Who This Guide Is For

This manual is for **Security Operators** who:
- Monitor live video feeds
- Respond to security alerts
- Investigate incidents
- Export evidence for investigations
- Create operational reports

### Your Role

As a Security Operator, you are the eyes and ears of your organization's security infrastructure. Your responsibilities include:

✅ **Monitoring** - Watch live feeds and identify security events  
✅ **Responding** - Acknowledge and respond to alerts promptly  
✅ **Investigating** - Review incidents and gather evidence  
✅ **Reporting** - Document incidents and create reports  
✅ **Coordinating** - Work with field teams and management

### What You'll Learn

- Navigate the KryptoVision interface efficiently
- Monitor multiple branches simultaneously
- Respond to different types of alerts
- Conduct investigations using playback and AI search
- Export video evidence with chain-of-custody
- Generate operational reports

---

## Getting Started

### Logging In

1. **Open your browser**
   - Supported: Chrome, Firefox, Edge (latest versions)
   - Navigate to: `https://your-company-vms.com`

2. **Enter credentials**
   ```
   Email: your.email@company.com
   Password: ********
   ```

3. **Two-Factor Authentication (if enabled)**
   - Enter 6-digit code from authenticator app
   - Or click link in SMS message

4. **Select your workspace**
   - Choose your assigned SOC/branch
   - Click "Start Monitoring"

### First-Time Setup

#### Customize Your Dashboard

1. Click **Profile** (top right) → **Preferences**
2. Configure:
   - **Default View:** Dashboard | Live View | Alert Center
   - **Theme:** Light | Dark | Auto (follows system)
   - **Notifications:** Desktop | Sound | Both | None
   - **Default Cameras:** Your most-watched cameras
   - **Alert Sound:** Choose alert tone

#### Set Your Status

Top right corner → Click your name → Set status:
- 🟢 **Available** - Ready to respond to alerts
- 🟡 **Busy** - Working on incident, route low-priority alerts
- 🔴 **Do Not Disturb** - Critical incident, route all alerts to backup
- ⚪ **Away** - On break, route to next operator

### Understanding Your Screen

```
┌─────────────────────────────────────────────────────────────┐
│  [🏠 Dashboard] [📹 Live] [🚨 Alerts] [🔍 Search] [👤 Profile] │ Navigation
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────┐  ┌──────────────────┐               │
│  │   Branch Health  │  │  Active Alerts   │               │ Widgets
│  │   ✅ ✅ ✅ ⚠️     │  │     3 P1        │               │
│  └──────────────────┘  └──────────────────┘               │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │          Camera Grid (4x4)                          │  │ Main Area
│  │  [Camera 1] [Camera 2] [Camera 3] [Camera 4]       │  │
│  │  [Camera 5] [Camera 6] [Camera 7] [Camera 8]       │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  📊 Status: Online | 🎥 48/50 Cameras | 💾 Storage: 67%   │ Status Bar
└─────────────────────────────────────────────────────────────┘
```

---

## Dashboard Overview

### Main Dashboard

Navigate to: **Dashboard** (Home icon or `Alt + 1`)

#### Key Metrics

**System Health**
- **Overall Status:** ✅ Healthy | ⚠️ Degraded | ❌ Critical
- **Branches Online:** 12/12
- **Cameras Online:** 147/150 (98%)
- **Recording:** All active
- **Storage:** 3.2TB used of 10TB (32%)

**Today's Activity**
- **Alerts Generated:** 47 (↓ 12% vs yesterday)
- **P1 Critical Alerts:** 2
- **P2 High Alerts:** 8
- **Incidents Created:** 3
- **Average Response Time:** 4.2 minutes

**Branch Status Overview**

| Branch | Cameras | Status | Alerts | Last Check |
|--------|---------|--------|--------|------------|
| Downtown #101 | 25/25 | ✅ Healthy | 5 | 30s ago |
| Mall #102 | 32/32 | ✅ Healthy | 12 | 1m ago |
| Airport #103 | 48/50 | ⚠️ Degraded | 3 | 45s ago |
| Warehouse #104 | 20/20 | ✅ Healthy | 2 | 1m ago |

**Recent Alerts**

```
🔴 P1 | 2:47 PM | Downtown #101 | Intrusion in Vault Area
   Status: ACKNOWLEDGED by John S. | Investigating

🟡 P2 | 2:35 PM | Mall #102 | PPE Violation - No Helmet
   Status: ACKNOWLEDGED by Sarah M. | Resolved

🟢 P3 | 2:15 PM | Airport #103 | Queue Length Exceeded
   Status: AUTO-RESOLVED | Queue normalized
```

#### Quick Actions

Right side panel:
- **🎥 Open Live View** - Jump to multi-camera view
- **🔍 Search** - Find person, vehicle, incident
- **📤 Export Evidence** - Quick evidence export
- **📊 Generate Report** - Create shift report
- **🔧 Camera Control** - Quick camera access

---

## Live Monitoring

Navigate to: **Live View** (or `Alt + 2`)

### Camera Grid Layouts

Choose your layout:
- **1x1** - Single camera (fullscreen)
- **2x2** - 4 cameras
- **3x3** - 9 cameras
- **4x4** - 16 cameras (recommended for SOC)
- **5x5** - 25 cameras
- **Custom** - Create your own layout

**Keyboard Shortcuts:**
- `1` - Switch to 1x1
- `4` - Switch to 2x2
- `9` - Switch to 3x3
- `F` - Fullscreen current camera

### Selecting Cameras

**Method 1: Branch View**
1. Left sidebar → Click **Branch** name
2. All branch cameras load automatically
3. Drag to reorder cameras in grid

**Method 2: Custom Selection**
1. Click **Custom View** button
2. Search or browse cameras
3. Click **+** to add to grid
4. Save as "Favorite View"

**Method 3: Saved Views**
1. Click **Views** dropdown
2. Select from:
   - My Saved Views
   - Branch Standard Views
   - Incident Response Views
   - Team Views

### Camera Controls

**Per-Camera Controls** (hover over camera):

```
┌─────────────────────────────────┐
│  Camera 1 - Front Entrance      │ ← Camera name
│                                 │
│         [Live Video]            │
│                                 │
│  ⚫ REC  |  🔊 Audio  |  🎯 PTZ │ ← Control bar
│  📸 Snap |  ⏪ Rewind |  ⬆️ Full │
└─────────────────────────────────┘
```

**Control Buttons:**
- **⚫ REC** - Manual recording start/stop
- **🔊 Audio** - Enable/disable audio (if camera supports)
- **🎯 PTZ** - Pan-Tilt-Zoom controls (if PTZ camera)
- **📸 Snapshot** - Capture still image
- **⏪ Rewind** - Go to playback mode
- **⬆️ Fullscreen** - Expand camera to full screen

### PTZ Camera Operation

For cameras with Pan-Tilt-Zoom:

**Controls:**
- **Arrow Keys** or **Click + Drag** - Pan/Tilt
- **Mouse Wheel** or **+/- Buttons** - Zoom
- **Preset Buttons** - Jump to saved positions

**PTZ Control Panel:**
```
        ⬆️ Up
    ⬅️ Left   Right ➡️
        ⬇️ Down

  [−] Zoom Out  [+] Zoom In
  
  Presets:
  [1] Main Entrance
  [2] Parking Lot
  [3] Loading Dock
  [4] Back Exit
```

**PTZ Tours:**
- Click **Start Tour** - Auto-patrol preset positions
- Click **Stop Tour** - Return control to operator
- Set tour speed: Slow | Medium | Fast

**⚠️ PTZ Best Practices:**
- Don't leave camera pointing at irrelevant area
- Return to default position after use
- Coordinate with other operators (avoid conflicts)
- Respect privacy zones (no residential windows, etc.)

### Audio Monitoring

For cameras with audio:

1. Click **🔊 Audio** button on camera
2. Volume slider appears
3. Adjust volume (0-100%)
4. Click **🔇** to mute

**Audio Alerts:**
- Glass breaking
- Screaming/shouting
- Gunshots
- Explosion sounds
- Alarm sirens

**⚠️ Audio Privacy:**
- Audio recording may require additional consent
- Check local laws and company policy
- Audio icon 🔴 indicates active recording

### Video Quality

**Adjusting Quality:**

Right-click camera → **Quality Settings**

- **Auto** (Recommended) - Adapts to network
- **High** - 1080p, high bitrate (slow networks may lag)
- **Medium** - 720p, balanced
- **Low** - 480p, low bandwidth
- **Minimum** - 360p, very slow connections only

**Network Status Indicator:**
- 🟢 **Excellent** (>10 Mbps) - High quality
- 🟡 **Good** (5-10 Mbps) - Medium quality
- 🟠 **Fair** (2-5 Mbps) - Low quality recommended
- 🔴 **Poor** (<2 Mbps) - Connection issues

### Digital Zoom

On any camera:
1. **Double-click** area to zoom
2. **Scroll wheel** to zoom in/out
3. **Right-click** → **Reset Zoom**

**Note:** This is digital zoom (enlarges pixels). PTZ cameras have optical zoom (better quality).

### Motion Detection Overlay

Enable to see motion areas:
1. Right-click camera → **Overlays**
2. Check **☑ Motion Detection**
3. Moving objects highlighted in red

Use for:
- Verifying motion detection is working
- Identifying areas with frequent false alerts
- Training new operators on camera coverage

---

## Alert Management

Navigate to: **Alert Center** (or `Alt + 4`)

### Alert Inbox

Your alert view shows:

```
┌──────────────────────────────────────────────────────────┐
│ 🚨 Active Alerts (3)                                     │
├──────────────────────────────────────────────────────────┤
│ 🔴 P1 | 2:47 PM | Downtown #101 | Intrusion Detection   │
│    Status: UNACKNOWLEDGED | Camera: Vault Area          │
│    [▶️ View Live] [🔍 Investigate] [✓ Acknowledge]       │
├──────────────────────────────────────────────────────────┤
│ 🟡 P2 | 2:35 PM | Mall #102 | PPE Violation             │
│    Status: ACKNOWLEDGED by Sarah M. | Investigating      │
│    [▶️ View Live] [🔍 Investigate] [✓ Resolve]           │
├──────────────────────────────────────────────────────────┤
│ 🟢 P3 | 2:15 PM | Airport #103 | High Queue Count       │
│    Status: ACKNOWLEDGED by You | In Progress             │
│    [▶️ View Live] [🔍 Investigate] [✓ Resolve]           │
└──────────────────────────────────────────────────────────┘
```

**Alert Filters:**
- **All Alerts** | **My Alerts** | **Unassigned**
- **P1** | **P2** | **P3** | **P4** | **P5**
- **Branch:** [Select from list]
- **Type:** Intrusion | Fire | PPE | Motion | etc.
- **Time:** Last hour | Today | Last 7 days | Custom

### Understanding Alert Priorities

| Priority | Color | Response Time | Action Required |
|----------|-------|---------------|-----------------|
| **P1 - Critical** | 🔴 Red | Immediate (<5 min) | Call security team, verify video |
| **P2 - High** | 🟡 Yellow | Urgent (<15 min) | Investigate and document |
| **P3 - Normal** | 🟢 Green | Standard (<1 hour) | Review and resolve |
| **P4 - Low** | 🔵 Blue | Next day | Monitor, no immediate action |
| **P5 - Info** | ⚪ White | No response needed | Information only |

### Responding to Alerts

#### Step 1: Acknowledge Alert

Click **Acknowledge** on the alert.

This tells the system and other operators:
- You've seen the alert
- You're taking responsibility
- No one else needs to respond

**Auto-Escalation:**
If you don't acknowledge within the response time, alert escalates to:
1. Your supervisor
2. Backup operator
3. Security manager

#### Step 2: Verify the Situation

Click **View Live** to see real-time video.

**Assess:**
- Is this a real incident or false alarm?
- Is anyone in danger?
- Is immediate action needed?
- What resources are required?

#### Step 3: Take Action

**For Real Incidents:**

1. **Create Incident** (button in alert)
   - System pre-fills details from alert
   - Add your observations
   - Assign severity

2. **Notify Appropriate Teams**
   - On-site security
   - Local police (if criminal)
   - Fire department (if fire/safety)
   - Management (if high-priority)

3. **Start Evidence Collection**
   - System automatically saves 30s before and after
   - Add additional clips if needed
   - Add snapshots
   - Annotate video with notes

**For False Alarms:**

1. Click **Resolve as False Alarm**
2. Select reason:
   - Environmental (shadows, reflections, weather)
   - Animal movement
   - Authorized personnel (forgot to disable alert)
   - Equipment malfunction
   - Other (specify)
3. Add notes explaining the false alarm
4. System learns and may auto-tune detection

#### Step 4: Document

Add notes to the alert:
- What you observed
- Actions taken
- People contacted
- Outcome

**Good Example:**
```
2:48 PM - Alert acknowledged. Verified video - person visible in vault area.
2:49 PM - Called on-site security (Mike). Dispatched to vault.
2:52 PM - Mike confirmed authorized manager, forgot to disable alarm.
2:53 PM - Resolved as false alarm. Reminded manager of procedure.
```

**Poor Example:**
```
False alarm
```

#### Step 5: Resolve or Escalate

**Resolve:**
- Click **Resolve**
- Select outcome: Resolved | False Alarm | Escalated
- Add final notes
- Alert moves to history

**Escalate:**
- Click **Escalate**
- Select escalation reason
- Choose who to escalate to
- Alert reassigned with higher priority

### Common Alert Types

#### 1. Intrusion Detection

**What it is:** Person detected in restricted area

**Response Procedure:**
1. ✅ Acknowledge immediately
2. 🎥 Verify on live video
3. 📞 Call on-site security if person present
4. 📝 Document person description (clothing, direction)
5. 🚔 Call police if unauthorized and security unavailable
6. 💾 Ensure video is recording (auto-enabled)

**Resolution:**
- Authorized person (disable alert during activity)
- Unauthorized person (create incident, involve police)
- False alarm (shadows, animals)

#### 2. Fire/Smoke Detection

**What it is:** Fire or smoke detected by AI

**Response Procedure:**
1. ✅ Acknowledge immediately
2. 🎥 Verify on live video - confirm smoke/fire visible
3. 🚨 **If confirmed:** Activate fire alarm immediately
4. 🚒 Call fire department (911 or local)
5. 📞 Notify branch manager
6. 📢 Initiate evacuation if people present
7. 💾 Keep recording and monitoring

**⚠️ NEVER DELAY:**
Even if unsure, treat as real fire until proven false.

**Resolution:**
- Real fire → Follow emergency procedures
- False alarm (steam, dust, fog) → Document and resolve

#### 3. PPE Violation

**What it is:** Worker not wearing required safety equipment

**Response Procedure:**
1. ✅ Acknowledge within 15 minutes
2. 🎥 Verify on video
3. 📞 Notify site supervisor
4. 📝 Document:
   - Time and location
   - Type of violation (no helmet, no vest, etc.)
   - Worker description (if identifiable)
5. 📊 Create safety report

**Resolution:**
- Worker corrected → Resolve with warning
- Repeat offender → Escalate to safety manager
- Emergency situation (unsafe equipment) → Immediate action

#### 4. Vehicle ANPR Alert

**What it is:** License plate recognized (watchlist match)

**Response Procedure:**

**VIP Vehicle:**
1. ✅ Acknowledge
2. 📝 Log entry time
3. 📞 Notify reception (if configured)
4. ✅ Resolve

**Blacklisted Vehicle:**
1. ✅ Acknowledge immediately
2. 🎥 Verify vehicle on video
3. 📞 Notify security team
4. 🚫 Prevent entry if possible
5. 🚔 Call police if threat level high
6. 💾 Capture vehicle photos

**Unknown Vehicle (After Hours):**
1. ✅ Acknowledge
2. 🎥 Monitor vehicle movement
3. 📞 Challenge driver (intercom if available)
4. 📝 Document plate, make, model, color
5. ✅ Resolve if authorized, escalate if suspicious

#### 5. Loitering

**What it is:** Person remaining in area too long

**Response Procedure:**
1. ✅ Acknowledge within 30 minutes
2. 🎥 Review video timeline - confirm loitering
3. 📝 Assess situation:
   - Homeless person seeking shelter?
   - Surveillance/casing location?
   - Lost/confused person?
   - Authorized person (employee on break)?
4. 📞 Dispatch security to investigate
5. 📝 Document outcome

**Resolution:**
- Authorized → Resolve
- Homeless/Lost → Security assists, resolve
- Suspicious → Create incident, monitor

### Alert Sounds and Notifications

**Desktop Notifications:**
Pop-ups appear for P1-P2 alerts even if you're in another tab.

**Sound Alerts:**
- **P1:** 🔊 Urgent siren (loud, repeating)
- **P2:** 🔔 Alert chime (moderate, single)
- **P3:** 🔔 Soft notification tone

**Disable Sounds:**
Click 🔇 icon (top right) to mute for 1 hour.

**⚠️ Warning:** Ensure you won't miss critical alerts if muted!

---

## Incident Investigation

Navigate to: **Incidents** (Dashboard → **Incidents** widget)

### What is an Incident?

An **incident** is a documented security event that requires:
- Investigation
- Evidence collection
- Formal documentation
- Potential legal/compliance action

**Alerts vs Incidents:**
- **Alert:** Real-time notification (may or may not be real)
- **Incident:** Confirmed event requiring documentation

### Creating an Incident

**Method 1: From Alert**
1. Open alert
2. Click **Create Incident**
3. Details pre-filled from alert
4. Add additional information
5. Click **Save**

**Method 2: Manual Creation**
1. Navigate to **Incidents** → **Create Incident**
2. Fill in details
3. Attach evidence
4. Assign to investigator
5. Click **Save**

### Incident Form

**Required Information:**
```
Incident Title: Unauthorized Access to Vault Area
Incident Type: Intrusion | Theft | Vandalism | Safety | Other
Branch: Downtown #101
Date/Time: 2026-09-15 14:47:00
Severity: P1 - Critical
Status: Under Investigation

Description:
Motion detected in vault area during closed hours. Person visible on camera entering through rear door. Door alarm did not trigger, suggesting authorized key/code used. Person spent 8 minutes in vault before leaving.

Involved Cameras:
- Vault Interior (Camera-045)
- Rear Door (Camera-012)
- Hallway (Camera-013)

People Involved:
- Unknown male, approximately 30-40 years old
- Wearing: Black jacket, blue jeans, baseball cap
- No visible identification

Initial Actions Taken:
- On-site security dispatched (2:48 PM)
- Vault checked - no obvious items missing
- Door access logs reviewed - no entry recorded
- Video evidence captured and preserved
- Local police notified (Case #2026-09-15-0847)

Assigned To: Detective Johnson (external) & Security Manager Smith

Next Steps:
- Review door access logs in detail
- Check if master key is missing
- Interview staff with vault access
- Provide video evidence to police
```

### Attaching Evidence

Click **Add Evidence** in incident:

**Video Clips:**
1. Click **Add Video Evidence**
2. Select camera
3. Mark start and end time (or use pre-roll/post-roll)
4. Add description
5. Click **Attach**

System automatically:
- Creates forensically sound copy
- Generates SHA-256 hash (tamper detection)
- Logs chain-of-custody
- Preserves against retention deletion

**Snapshots:**
1. Click **Add Snapshot**
2. Select image
3. Add annotations (arrows, boxes, text)
4. Add description
5. Click **Attach**

**Documents:**
- Police reports
- Witness statements
- Access logs
- Email correspondence

### Incident Timeline

View chronological events:
```
📅 Incident Timeline

2:47:35 PM - Motion detected in vault (AI alert)
2:47:40 PM - Person enters frame (Vault Interior camera)
2:48:10 PM - Alert acknowledged by operator
2:48:45 PM - Security dispatched
2:52:30 PM - Security arrives at vault
2:53:15 PM - Vault checked, no items missing
2:55:48 PM - Person identified from access logs
3:10:00 PM - Incident created
3:15:00 PM - Police notified
3:30:00 PM - Police arrive
4:15:00 PM - Evidence package prepared for police
```

### Investigation Workflow

**Status Progression:**
1. **Reported** - Incident created, needs assignment
2. **Under Investigation** - Actively being investigated
3. **Pending Information** - Waiting for external input
4. **Resolved** - Investigation complete
5. **Closed** - Formally closed, no further action

**Updating Status:**
1. Open incident
2. Click **Update Status**
3. Select new status
4. Add update notes
5. Click **Save**

### Collaboration

**Adding Investigators:**
1. Open incident
2. Click **Assign Investigators**
3. Search and select users
4. Each investigator gets notification
5. All can add evidence and notes

**Internal Notes vs Public Notes:**
- **Internal Notes:** Only visible to investigators (sensitive details)
- **Public Notes:** Visible to anyone with incident access (general updates)

**Comments:**
Investigators can discuss in comment thread:
```
John Smith • 3:15 PM
Police report filed. Case number: 2026-09-15-0847

Sarah Williams • 3:45 PM
Reviewed access logs. Entry was logged but under different employee ID. Suggests code sharing or stolen credential.

Mike Johnson • 4:20 PM
@Sarah - Good catch. Pull access history for that employee ID. Let's review last 30 days.
```

### Exporting Incident Reports

1. Open incident
2. Click **Export Report**
3. Select format:
   - **PDF** - Formal report with evidence thumbnails
   - **Word** - Editable document
   - **Excel** - Data export with timeline
4. Include:
   - ☑ Incident details
   - ☑ Timeline
   - ☑ Evidence list (with thumbnails)
   - ☑ Investigation notes
   - ☑ Chain-of-custody log
5. Click **Generate Report**

---

## Playback and Review

Navigate to: **Playback** (or `Alt + 3`)

### Playback Interface

```
┌────────────────────────────────────────────────────────────┐
│ [Camera: Front Entrance ▼] [Date: 09/15/2026 ▼]          │ Controls
├────────────────────────────────────────────────────────────┤
│                                                            │
│               [Main Video Player]                          │ Video
│                                                            │
├────────────────────────────────────────────────────────────┤
│ |◀ ⏮  ⏪  ▶️  ⏩  ⏭ ▶|  [Speed: 1x ▼]  [🔊]            │ Player
├────────────────────────────────────────────────────────────┤
│ ├────█───────────────────────────────────────────┤       │ Timeline
│ 00:00:00                    14:47:35           24:00:00   │
└────────────────────────────────────────────────────────────┘
```

### Timeline Navigation

**Timeline Features:**
- **Green bars** - Continuous recording
- **Red marks** - Alerts/events
- **Yellow marks** - Motion detection
- **Blue marks** - Bookmarks you created
- **White gaps** - No recording (camera offline or motion-only recording)

**Navigation:**
- **Click** anywhere on timeline → Jump to that time
- **Drag** scrubber → Scan through video
- **Scroll wheel** on timeline → Zoom in/out
- **Click + Drag timeline** → Pan left/right

### Playback Controls

**Speed Control:**
- `1` - Normal speed (1x)
- `2` - 2x speed
- `4` - 4x speed
- `8` - 8x speed
- `Space` - Play/Pause

**Frame-by-Frame:**
- `,` (comma) - Previous frame
- `.` (period) - Next frame

**Jump:**
- `J` - Jump back 10 seconds
- `L` - Jump forward 10 seconds
- `Shift + J` - Jump back 1 minute
- `Shift + L` - Jump forward 1 minute

**Export:**
- `Ctrl + E` - Export current view as clip

### Multi-Camera Playback

View multiple cameras at once in sync:

1. Click **Add Camera** button
2. Select additional cameras
3. All cameras play synchronized
4. Useful for tracking person/vehicle across cameras

**Layout Options:**
- 1x1 (single)
- 2x1 (two side-by-side)
- 2x2 (four cameras)
- 1+3 (one large, three small)

### Searching for Events

**Method 1: Jump to Alerts**

1. Click **Events** button (timeline)
2. See list of all alerts for selected date
3. Click any alert → Jump to that time

**Method 2: Motion Search**

1. Click **Motion Search** button
2. Draw area on video (where to look for motion)
3. Select time range
4. Click **Search**
5. Results show all motion events in that area
6. Click any result → Jump to that time

**Method 3: AI Object Search**

1. Click **AI Search** button
2. Select object type: Person | Vehicle | Object
3. Optionally draw search area
4. Select time range
5. Click **Search**
6. Results show all detections
7. Click any result → Jump to that time

**Method 4: Smart Search (Advanced)**

Search by attributes:
```
Object Type: Person
Clothing Color: Red
Direction: Left to Right
Time Range: 09/15/2026 12:00 - 18:00
Confidence: >75%
```

Results show all persons wearing red, moving left-to-right in that timeframe.

### Bookmarks

Mark important moments for later:

1. Pause at interesting moment
2. Click **Bookmark** (or press `B`)
3. Add note: "Person enters vault"
4. Bookmark saved with thumbnail

**View Bookmarks:**
- Click **Bookmarks** tab
- See all bookmarks for this camera/date
- Click to jump to bookmarked time

### Exporting Clips

See [Evidence Export](#evidence-export) section for detailed instructions.

Quick export:
1. Mark **Start Time** (press `[`)
2. Mark **End Time** (press `]`)
3. Press `Ctrl + E`
4. Enter export details
5. Click **Export**

---

## Evidence Export

Navigate to: **Playback** → **Export** (or `Ctrl + E` in playback)

### Why Chain-of-Custody Matters

For evidence to be admissible in court:
- ✅ Must be proven authentic (not tampered with)
- ✅ Must have documented chain-of-custody
- ✅ Must be properly preserved

KryptoVision automatically:
- Creates forensically sound copies
- Generates cryptographic hashes (SHA-256)
- Logs every access to evidence
- Signs evidence packages with digital signatures
- Creates tamper-evident evidence files

### Export Procedure

#### Step 1: Select Video Range

In playback:
1. Navigate to start of incident
2. Click **Mark Start** (or press `[`)
3. Navigate to end of incident
4. Click **Mark End** (or press `]`)

**Tips:**
- Include 30-60 seconds before incident (context)
- Include until incident fully resolved
- Don't cut too early (may miss important details)

#### Step 2: Export Dialog

Click **Export** button:

```
┌─────────────────────────────────────────────────────┐
│ Export Evidence                                     │
├─────────────────────────────────────────────────────┤
│ Camera: Front Entrance                              │
│ Start: 09/15/2026 14:45:00                         │
│ End: 09/15/2026 14:55:00                           │
│ Duration: 10 minutes                                │
│                                                      │
│ Export Purpose:                                      │
│ ○ Investigation                                     │
│ ● Legal/Law Enforcement                            │
│ ○ Insurance Claim                                   │
│ ○ Training                                          │
│ ○ Other: _______________                           │
│                                                      │
│ Case/Incident Number:                               │
│ [2026-09-15-0847]                                  │
│                                                      │
│ Requesting Person:                                   │
│ [Detective Johnson, Metro PD]                      │
│                                                      │
│ Your Badge/Employee ID:                             │
│ [SEC-1234]                                          │
│                                                      │
│ Format:                                              │
│ ● Native (Original codec - H.265)                  │
│ ○ MP4 (Universal compatibility)                    │
│ ○ AVI (Legacy systems)                             │
│                                                      │
│ Include:                                             │
│ ☑ Timestamp overlay                                │
│ ☑ Camera name overlay                              │
│ ☑ Chain-of-custody certificate (PDF)              │
│ ☑ SHA-256 hash verification file                  │
│                                                      │
│ [Cancel]  [Export] ←                               │
└─────────────────────────────────────────────────────┘
```

#### Step 3: Export Processing

```
Exporting Evidence...

1. Copying video segments ████████████ 100%
2. Generating thumbnails ████████████ 100%
3. Creating hash (SHA-256) ████████████ 100%
4. Signing evidence package ████████████ 100%
5. Generating certificate ████████████ 100%

Export Complete!
```

#### Step 4: Download Evidence Package

```
Your evidence export is ready:

📦 Evidence Package: evidence-2026-09-15-0847.zip (1.2 GB)

Contents:
  📹 video-evidence.mp4 (1.15 GB)
  📄 chain-of-custody.pdf
  🔐 video-evidence.sha256 (hash file)
  🖼️ thumbnails/ (30 images)
  📋 metadata.json

Chain of Custody Certificate:
  Export ID: EVD-2026-09-15-1447-0001
  Exported by: John Smith (SEC-1234)
  Export time: 2026-09-15 14:47:35 UTC
  Purpose: Legal/Law Enforcement
  Case: 2026-09-15-0847
  Recipient: Detective Johnson, Metro PD
  SHA-256: 8f4e2a7b9c1d3e5f6a8b0c2d4e6f8a0b1c3d5e7f9a1b3c5d7e9f1a3b5c7d9e1f
  Digital Signature: [RSA-4096 signature]

[📥 Download Package]  [📧 Email to Recipient]
```

### Verifying Evidence Integrity

**For Recipients:**

1. Download the evidence package
2. Extract the .zip file
3. Open command prompt/terminal
4. Verify hash:

**Windows:**
```cmd
certutil -hashfile video-evidence.mp4 SHA256
```

**Linux/Mac:**
```bash
sha256sum video-evidence.mp4
```

5. Compare output with hash in `video-evidence.sha256` file
6. If hashes match: ✅ Evidence has not been tampered with
7. If hashes don't match: ❌ Evidence may be corrupted/tampered

### Evidence Audit Trail

Every evidence export is logged:

Navigate to: **Audit** → **Evidence Access Log**

```
┌──────────────────────────────────────────────────────────┐
│ Evidence Access Audit Log                                │
├──────────────────────────────────────────────────────────┤
│ 09/15/26 14:47 | John Smith (SEC-1234)                  │
│   Action: EXPORTED                                        │
│   Camera: Front Entrance                                  │
│   Time Range: 14:45:00 - 14:55:00                        │
│   Purpose: Legal/Law Enforcement                          │
│   Case: 2026-09-15-0847                                  │
│   Recipient: Detective Johnson, Metro PD                  │
│   Hash: 8f4e2a7b...9e1f                                  │
├──────────────────────────────────────────────────────────┤
│ 09/15/26 14:50 | John Smith (SEC-1234)                  │
│   Action: DOWNLOADED                                      │
│   Export ID: EVD-2026-09-15-1447-0001                    │
│   Downloaded to: workstation-soc-01                       │
├──────────────────────────────────────────────────────────┤
│ 09/15/26 15:15 | Detective Johnson (EXTERNAL)            │
│   Action: EMAIL DELIVERED                                 │
│   Export ID: EVD-2026-09-15-1447-0001                    │
│   Email: d.johnson@metropd.gov                           │
└──────────────────────────────────────────────────────────┘
```

**This audit trail:**
- Cannot be deleted or modified
- Proves who accessed evidence and when
- Satisfies legal chain-of-custody requirements
- Admissible in court

---

## Reporting

Navigate to: **Reports** (Dashboard → **Reports**)

### Report Types

**Operational Reports:**
- **Shift Report** - Activity during your shift
- **Daily Summary** - 24-hour activity summary
- **Weekly Summary** - 7-day trends and statistics
- **Monthly Report** - Comprehensive monthly analysis

**Incident Reports:**
- **Incident Summary** - All incidents in period
- **Alert Report** - Alert volume and response times
- **False Alarm Report** - False alarm analysis

**Compliance Reports:**
- **Access Log Report** - Who accessed what
- **Evidence Chain-of-Custody** - Evidence handling report
- **Camera Uptime Report** - Camera availability
- **Storage Report** - Storage usage and health

### Creating a Shift Report

**When to create:** End of each shift

1. Navigate to **Reports** → **Create Report**
2. Select **Shift Report**
3. Auto-filled:
   - Your name
   - Shift start/end time
   - Branches you monitored
4. System automatically includes:
   - Alerts handled by you
   - Incidents you created/updated
   - Evidence exported
   - Camera issues encountered
5. Add your notes:
   ```
   Shift Notes:
   
   Quiet shift overall. Handled 12 alerts, 10 were routine, 2 required investigation.
   
   Notable Incidents:
   - Vault intrusion at Downtown #101 (see incident #2026-09-15-0847)
   - False fire alarm at Mall #102 (steam from cleaning)
   
   Equipment Issues:
   - Camera 47 at Airport #103 offline most of shift (IT notified)
   - PTZ Camera 12 at Warehouse #104 not responding to controls (vendor contacted)
   
   Recommendations:
   - Consider adding camera coverage to blind spot near loading dock (Airport #103)
   - Review PPE alert thresholds in warehouse - getting many false positives
   ```
6. Click **Generate Report**
7. Review PDF preview
8. Click **Submit Report**

**Report Distribution:**
- ✅ Your manager (auto-sent)
- ✅ Archived in system
- ✅ Email to: operations@company.com

### Daily Summary Report

**When to create:** Automatically generated each day at midnight, or manually

1. Navigate to **Reports** → **Daily Summary**
2. Select date
3. Report shows:
   - Total alerts by priority
   - Alert response times (average)
   - Top alert types
   - Camera health summary
   - Storage status
   - Incidents created
   - Branch health overview
4. Download as PDF or Excel

**Use for:**
- Management briefings
- Trend analysis
- Capacity planning
- Identifying problem areas

### Custom Reports

For advanced reporting:

1. Navigate to **Reports** → **Custom Report Builder**
2. Select data sources:
   - Alerts
   - Incidents
   - Camera health
   - Evidence exports
   - User activity
3. Add filters:
   - Date range
   - Branches
   - Alert types
   - Severity
4. Select columns to include
5. Choose chart types (bar, line, pie)
6. Save as template (reuse later)
7. Click **Generate Report**

---

## Mobile Operations

### KryptoVision Mobile App

**Download:**
- iOS: App Store - Search "KryptoVision"
- Android: Google Play - Search "KryptoVision"

**Features:**
- Live camera viewing
- Alert notifications
- Incident management
- Quick evidence export
- Two-way audio (if camera supports)

### Mobile Login

1. Open app
2. Enter company URL: `your-company-vms.com`
3. Enter your credentials
4. Approve 2FA if enabled
5. Click **Login**

### Mobile Dashboard

```
┌─────────────────────────────┐
│ KryptoVision                │
│ 🟢 Online | 147/150 cameras │
├─────────────────────────────┤
│ 🚨 Active Alerts (3)        │
│                             │
│ 🔴 P1 • 2:47 PM             │
│ Intrusion - Downtown #101   │
│ [View] [Acknowledge]        │
│                             │
│ 🟡 P2 • 2:35 PM             │
│ PPE Violation - Mall #102   │
│ [View] [Acknowledge]        │
├─────────────────────────────┤
│ [🏠 Dashboard]  [📹 Live]   │
│ [🚨 Alerts]  [🔍 Search]    │
└─────────────────────────────┘
```

### Mobile Live View

- Tap **Live** tab
- Select camera from list or map
- Swipe left/right for next/previous camera
- Pinch to zoom (digital zoom)
- Tap speaker icon for audio
- Tap record icon for quick recording

### Mobile Alerts

**Push Notifications:**
Receive alerts on your phone even when app is closed.

**Enable:**
1. App Settings → Notifications
2. Enable Push Notifications
3. Select which priorities: P1, P2, P3, etc.
4. Set quiet hours (optional)

**Responding:**
1. Tap notification → Opens alert
2. View live camera feed
3. Tap **Acknowledge**
4. Add notes
5. Tap **Resolve** or **Escalate**

### Mobile Limitations

**Not available on mobile:**
- Full PTZ control (limited to presets)
- Multi-camera synchronized playback
- Evidence export with chain-of-custody
- Advanced video editing
- Full incident investigation
- Report generation

**For these tasks, use desktop interface.**

---

## Best Practices

### Shift Start Checklist

**Every shift:**
- [ ] Log in 5 minutes before shift start
- [ ] Check system health dashboard
- [ ] Review unacknowledged alerts
- [ ] Read shift handoff notes from previous operator
- [ ] Verify all cameras online (or note which are offline)
- [ ] Test alert sound (ensure not muted)
- [ ] Check storage status
- [ ] Review day's schedule (expected deliveries, maintenance, VIP visits)
- [ ] Set your status to "Available"

### Monitoring Best Practices

**Attention Management:**
- Don't stare at screens continuously (causes fatigue)
- Use **alert-driven** monitoring (let AI find events)
- Scan all cameras briefly every 10-15 minutes
- Take 5-minute break every 2 hours (step away from screens)
- Adjust monitor brightness (not too bright, causes eye strain)

**What to Watch For:**
- ✅ People in unexpected areas
- ✅ Unusual behavior patterns
- ✅ Vehicles lingering too long
- ✅ Objects left unattended
- ✅ People loitering near entrances
- ✅ Unusual traffic patterns
- ✅ Weather changes (may affect cameras)
- ✅ Camera quality changes (may indicate issues)

**What NOT to Do:**
- ❌ Don't use PTZ cameras excessively (return to default view)
- ❌ Don't zoom in on privacy-sensitive areas
- ❌ Don't leave cameras pointing at irrelevant areas
- ❌ Don't ignore low-priority alerts (they accumulate)
- ❌ Don't acknowledge alerts without actually reviewing them

### Alert Response Best Practices

**Response Time Goals:**
| Priority | Target Response | Max Acceptable |
|----------|----------------|----------------|
| P1 | < 2 minutes | 5 minutes |
| P2 | < 10 minutes | 15 minutes |
| P3 | < 30 minutes | 1 hour |
| P4 | < 2 hours | Next day |

**Always:**
- ✅ Acknowledge all alerts (even false alarms)
- ✅ Add meaningful notes (not just "resolved")
- ✅ Escalate if unsure (better safe than sorry)
- ✅ Follow up on escalated alerts
- ✅ Document actions taken

**Never:**
- ❌ Ignore alerts hoping they'll go away
- ❌ Acknowledge without viewing video
- ❌ Resolve as false alarm without verifying
- ❌ Batch-acknowledge multiple unrelated alerts
- ❌ Forget to document your actions

### Communication Best Practices

**Radio Communication:**
When coordinating with field teams:
- State your position: "SOC to Unit 3"
- Be clear and concise
- Use standard terminology
- Confirm understanding: "Copy that"
- Update when situation changes

**Example (Good):**
```
SOC: "SOC to Unit 3, we have a P2 alert, possible PPE violation in Warehouse Zone B. Can you investigate?"
Unit 3: "Copy that, SOC. En route to Warehouse Zone B. ETA 3 minutes."
SOC: "Acknowledged. Camera 24 has visual. Person is near forklift area, appears to be missing safety vest."
Unit 3: "Arrived on scene. Subject is contractor, forgot vest. Escorting back to get PPE."
SOC: "Copy. Resolving alert. Thanks, Unit 3."
```

**Example (Poor):**
```
SOC: "Hey, can someone check the warehouse?"
Unit 3: "What for?"
SOC: "Some alert came up."
Unit 3: "Which warehouse? What kind of alert?"
```

### Documentation Best Practices

**Always Document:**
- Initial observations
- Actions taken
- People contacted
- Outcomes
- Lessons learned

**Good Note Example:**
```
14:47 - P1 Intrusion alert in vault area, Downtown #101
14:48 - Verified on Camera-045. Male subject, approx 40 years old, black jacket, blue jeans
14:49 - Dispatched Unit 5 (Mike Johnson) to vault
14:52 - Mike confirms authorized manager John Smith, forgot to disable alert before entering
14:53 - Verified John Smith's identity via badge on camera
14:54 - Reminded John about proper procedure (disable alert BEFORE entering)
14:55 - Resolved as false alarm (authorized entry, procedure not followed)
```

**Poor Note Example:**
```
False alarm
```

### Shift Handoff

**End of shift:**
1. Create shift report
2. Document any ongoing incidents
3. Note any equipment issues
4. Highlight anything next shift needs to know
5. Brief next operator verbally (if possible)

**Handoff Template:**
```
SHIFT HANDOFF NOTES
Date: 09/15/2026
Outgoing: John Smith (Day Shift)
Incoming: Sarah Williams (Night Shift)

ACTIVE INCIDENTS:
- Incident #2026-09-15-0847 (Vault intrusion) - Under police investigation, no action needed

EQUIPMENT ISSUES:
- Camera 47 (Airport #103) offline - IT working on it, expected back online by 8 PM
- PTZ Camera 12 (Warehouse #104) not responding - Vendor contacted, service call tomorrow morning

ALERTS:
- 2 P3 alerts in queue (low priority, can wait until morning)
- No critical alerts pending

UPCOMING EVENTS:
- Delivery expected at Warehouse #104 around 10 PM (authorized, will trigger motion alerts)
- Downtown #101 has cleaning crew 11 PM - 2 AM (will see people on cameras)

NOTES:
- Manager wants daily summary report emailed by end of week
- New operator training next Monday - please be available for questions

CONTACT:
- Mobile: 555-0123 (if urgent issue)
```

### Self-Care

**Operator Wellness:**
- 👁️ **Eye Health:** 20-20-20 rule (every 20 min, look 20 feet away for 20 sec)
- 🚶 **Movement:** Stand up and stretch every hour
- 💧 **Hydration:** Keep water at desk, stay hydrated
- 🧠 **Mental Health:** High-stress job, talk to supervisor if feeling overwhelmed
- 😴 **Sleep:** Adequate rest critical for alertness (especially for shift workers)

**Fatigue Signs:**
- Difficulty focusing on screens
- Missing alerts
- Slow response times
- Irritability
- Drowsiness

**If Fatigued:**
1. Notify supervisor immediately
2. Take break if possible
3. Hand off to backup operator if available
4. **Never operate while impaired** (safety critical role)

---

## Quick Reference

### Emergency Procedures

**Fire:**
1. Verify on camera
2. Call 911 immediately
3. Activate fire alarm
4. Notify branch manager
5. Monitor evacuation
6. Keep recording

**Medical Emergency:**
1. Call 911 immediately
2. Dispatch first aid if available
3. Monitor victim on camera
4. Guide responders to location
5. Keep recording
6. Document in incident

**Active Threat (Weapon/Violence):**
1. Call 911 immediately
2. Activate lockdown if available
3. Track threat on cameras
4. Guide police with real-time info
5. Notify all staff (PA system if available)
6. **DO NOT confront personally**
7. Keep recording

### Common Issues

**Can't see camera:**
- Check if camera is online (green indicator)
- Try refreshing (F5)
- Try different browser
- Contact IT if problem persists

**Alert won't acknowledge:**
- Ensure you have permission
- Check if already acknowledged by someone else
- Refresh page and try again
- Contact supervisor if problem persists

**Playback won't load:**
- Check date/time (no recording may exist)
- Check camera was online at that time
- Try reducing playback quality
- Clear browser cache
- Contact IT if problem persists

### Contact List

**Emergency Services:**
- 🚓 Police: 911
- 🚒 Fire: 911
- 🚑 Medical: 911

**Internal:**
- SOC Supervisor: Ext. 5001
- IT Support: Ext. 5100
- Facilities: Ext. 5200
- HR: Ext. 5300

**After Hours:**
- On-Call Manager: 555-MANAGER
- IT Helpdesk: 555-IT-HELP
- Security Director: 555-SECURITY

---

**Document Version:** 1.0.0  
**Last Updated:** September 15, 2026

© 2026 KryptonLogic. All rights reserved.
