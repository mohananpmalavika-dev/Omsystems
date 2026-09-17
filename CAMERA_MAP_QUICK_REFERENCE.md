# Camera Location Map - Quick Reference Card

## 🚀 Quick Access

```
URL: /maintenance/camera-map
Menu: Fleet Maintenance → Camera Location Map
Icon: 🌍 Globe2
```

## ⚡ 30-Second Quickstart

1. Open sidebar menu
2. Click **"Camera Location Map"** (Fleet Maintenance section)
3. Enable **"Use IP Location"** checkbox (already on by default)
4. See cameras on map! 🎉

## 📍 Location Sources (Priority Order)

```
1st → 📝 Camera Metadata (Manual GPS)
2nd → 🌐 IP Geolocation (Automatic) ⭐
3rd → 🏢 Branch Location (Fallback)
```

## 🎨 Status Colors

```
🟢 Green  = Healthy/Online
🟡 Yellow = Warning/Degraded
🔴 Red    = Critical
⚫ Gray   = Offline
```

## 🔧 Controls

```
[📹 Cameras] [🏢 Branches]    ← Toggle view mode
[☑ Show Offline]              ← Include offline cameras
[☑ Use IP Location]           ← Enable IP geolocation ⭐
[🔄 Refresh]                  ← Reload latest data
```

## 📊 IP Address Rules

### ✅ Works (Public IPs)
```
203.x.x.x, 115.x.x.x, 43.x.x.x
→ Automatic GPS detection
→ Shows City & Country
```

### ❌ Skipped (Private IPs)
```
192.168.x.x, 10.x.x.x, 172.16-31.x.x
→ Uses branch location
→ No geolocation needed
```

## 🗺️ Map Actions

```
Zoom: Mouse scroll wheel
Pan: Click and drag
Details: Click any marker
Filter: Use status buttons
Switch: Cameras ↔ Branches
```

## 🔍 Finding Cameras

### By Status
```
1. Click status filter (Healthy/Warning/Offline)
2. Map shows only those cameras
```

### By Branch
```
1. Switch to "Branch Clusters" view
2. Click branch marker
3. See camera breakdown
```

### By Location
```
1. Zoom into map area
2. Click camera marker
3. View full details
```

## 📱 Marker Popup Info

```
┌──────────────────────────┐
│ Camera Name              │
│ Status: Online           │
│ Branch: Downtown         │
│ Location: Bangalore, IN  │ ⭐ NEW!
│ Source: IP Geolocation   │ ⭐ NEW!
│ IP: 203.x.x.x           │ ⭐ NEW!
│ Last Seen: 2 mins ago    │
│ Uptime: 99.5%            │
└──────────────────────────┘
```

## 🎯 Common Tasks

### Find Offline Cameras
```
Filter → Offline → See locations on map
Time: 5 seconds
```

### Check Branch Health
```
Switch to Branch Clusters → See health breakdown
Time: 10 seconds
```

### Verify Coverage
```
Zoom to area → See all camera distribution
Time: 15 seconds
```

### Plan Maintenance
```
Filter offline → Note GPS coordinates → Dispatch
Time: 1 minute
```

## 📞 API Endpoints

```
GET /api/control/v1/camera-locations
  ?useIpGeolocation=true     ← Enable IP location
  &includeOffline=true       ← Include offline cameras
  &status=online             ← Filter by status
  &branchId=branch-123       ← Filter by branch

GET /api/control/v1/camera-locations/branches
  → Branch clusters with stats

GET /api/control/v1/camera-locations/:cameraId
  → Specific camera details
```

## 🛠️ Configuration

### Per-Camera GPS (Optional)
```sql
UPDATE cameras 
SET metadata = '{"location": {"latitude": 12.9716, "longitude": 77.5946}}'
WHERE id = 'cam-001';
```

### Per-Branch GPS (Fallback)
```sql
UPDATE resource_nodes 
SET metadata = '{"location": {"latitude": 12.9716, "longitude": 77.5946}}'
WHERE type = 'branch' AND name = 'Branch Name';
```

## 💡 Pro Tips

### Tip 1: Default View
```
Camera view shows individual cameras
Branch view better for large deployments (>100 cameras)
```

### Tip 2: Location Priority
```
Camera GPS > IP Geolocation > Branch GPS
Set camera GPS only when you need exact location
```

### Tip 3: IP Geolocation
```
Enable by default for automatic location
Disable if you prefer branch-based grouping
```

### Tip 4: Performance
```
Hide offline cameras to reduce clutter
Use branch view for faster rendering
```

### Tip 5: Troubleshooting
```
No cameras? → Check GPS configuration
Wrong location? → Verify IP is public
Slow loading? → Reduce camera count with filters
```

## ❓ Quick Troubleshooting

### "No cameras with GPS locations found"
```
→ Enable "Use IP Location" checkbox
→ Or configure branch GPS coordinates
```

### Camera shows wrong location
```
→ Check if IP is public (not 192.168.x.x)
→ Verify branch GPS if using fallback
→ Set camera-specific GPS if needed
```

### Map not loading
```
→ Check internet connection
→ Verify API endpoint responding
→ Check browser console for errors
```

### Markers not clickable
```
→ Ensure JavaScript enabled
→ Try different browser
→ Refresh page
```

## 📚 Documentation

```
Full Guide: docs/CAMERA_LOCATION_MAP.md
IP Geolocation: docs/IP_GEOLOCATION_FEATURE.md
Quick Start: docs/CAMERA_MAP_QUICK_START.md
Before/After: BEFORE_AFTER_COMPARISON.md
Malayalam: CAMERA_MAP_SUMMARY_ML.md
```

## 🎯 Key Shortcuts

```
Ctrl+K → Open command palette → Search "camera map"
Ctrl+F → Search on page
Esc → Close popup
```

## ✨ Feature Highlights

```
✅ IP-based automatic location detection
✅ Real-time camera status visualization
✅ Interactive filtering and controls
✅ City & Country display
✅ 3-level location priority
✅ Public/Private IP detection
✅ Batch processing for performance
✅ Graceful error handling
```

## 🌍 Supported Locations

```
🌏 India: Full support
🌏 Asia-Pacific: Full support  
🌍 Global: Full support for public IPs
🏠 Private networks: Uses branch location
```

## 📊 Stats at a Glance

```
Total Cameras: [Displayed at top]
Healthy: 🟢 [Count]
Warning: 🟡 [Count]
Critical: 🔴 [Count]
Offline: ⚫ [Count]
```

## 🎉 Success Indicators

```
✅ Cameras visible on map
✅ Status colors showing correctly
✅ Click marker opens details
✅ Location source displayed
✅ City/Country shown (if IP geo enabled)
```

## 🚦 Performance Guidelines

```
< 50 cameras: Individual camera view
50-200 cameras: Either view works
> 200 cameras: Branch cluster view recommended
> 1000 cameras: Consider pagination (future)
```

## 🔐 Permissions

```
Required: live:view permission
Respects: Tenant isolation
Respects: Branch-level access
```

## 💬 Malayalam Quick Guide

```
എവിടെ കാണാം: Fleet Maintenance → Camera Location Map
എങ്ങനെ ഉപയോഗിക്കാം: "Use IP Location" enable ചെയ്യുക
എന്താണ് കാണുക: Cameras-ന്റെ real GPS location
IP ഉപയോഗം: Public IPs automatic location detection
Private IPs: Branch location use ചെയ്യും
```

---

## 📌 Remember

```
🌐 IP Geolocation = Automatic (for public IPs)
🏢 Branch Location = Fallback (for private IPs)
📝 Camera GPS = Manual (highest priority)
```

**Print this card for quick reference!** 📋✨
