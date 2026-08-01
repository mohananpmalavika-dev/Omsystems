# 🎨 System Management UI - Complete Guide

## ✅ What's Been Implemented

A comprehensive admin interface for managing gateways, cameras, and branches directly from your dashboard!

---

## 📍 Access the UI

### Navigate to System Management:

1. **From Dashboard Home:**
   ```
   https://your-dashboard.com/admin/system
   ```

2. **From Admin Page:**
   - Click on "Organization & access" in admin menu
   - Click the blue "System Management" button in header
   
---

## 🎯 Features

### **Dashboard Overview**

Real-time statistics displayed at the top:
- ✅ **Total Gateways** - Number of edge agents
- ✅ **Total Cameras** - Number of cameras
- ✅ **Total Branches** - Number of branch locations
- ✅ **Live Sessions** - Active streaming sessions
- ✅ **Telemetry Records** - Total telemetry data points

### **Three Main Tabs**

#### 1. **Gateways Tab** 📡
View and manage all edge agent gateways:
- Gateway name
- Gateway ID (UUID)
- Status (online/offline with color badge)
- Last seen timestamp
- Created date
- Delete button (with confirmation)

**Actions:**
- ✅ View all gateways in a table
- ✅ Delete individual gateway
- ✅ Delete ALL gateways (with warning)
- ✅ Refresh list

#### 2. **Cameras Tab** 📹
View and manage all cameras:
- Camera model
- IP address
- Connected gateway name
- Status (online/offline)
- Camera ID
- Delete button (with confirmation)

**Actions:**
- ✅ View all cameras in a table
- ✅ Delete individual camera
- ✅ Delete ALL cameras (with warning)
- ✅ Refresh list

#### 3. **Branches Tab** 🏢
View and manage branch locations:
- Branch name
- Address
- Number of gateways
- Branch ID
- Delete button (with confirmation)

**Actions:**
- ✅ View all branches in a table
- ✅ Delete individual branch (deletes all its gateways too!)
- ✅ Delete ALL branches (with warning)
- ✅ Refresh list

---

## 🔒 Safety Features

### Confirmation Dialogs

**Delete Individual Item:**
- Shows item name
- Warning about what else will be deleted
- Requires clicking "Delete" to confirm
- Can cancel anytime

**Delete All:**
- Requires typing "DELETE ALL" to confirm
- Cannot be cancelled once confirmed
- Use with extreme caution!

### Cascade Deletion

When you delete a **Gateway**, it automatically deletes:
- All cameras connected to it
- All telemetry records
- All discovery records
- All scan jobs
- All live sessions

When you delete a **Branch**, it automatically deletes:
- The branch itself
- ALL gateways in that branch
- ALL cameras connected to those gateways
- All related telemetry, sessions, etc.

---

## 📸 UI Screenshots (Text Description)

### Main Dashboard
```
╔════════════════════════════════════════════════════════════╗
║ System Management                                          ║
║ Manage gateways, cameras, and branches                     ║
╠════════════════════════════════════════════════════════════╣
║                                                             ║
║ [Statistics Cards]                                          ║
║ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          ║
║ │Gateway  │ │Cameras  │ │Branches │ │Sessions │           ║
║ │   4     │ │   8     │ │   2     │ │   12    │           ║
║ └─────────┘ └─────────┘ └─────────┘ └─────────┘          ║
║                                                             ║
║ [Tabs]                                                      ║
║ ┌────────────┬────────────┬────────────┐                  ║
║ │ Gateways   │  Cameras   │  Branches  │                  ║
║ └────────────┴────────────┴────────────┘                  ║
║                                                             ║
║ [Table with data and actions]                              ║
║ ┌──────────────────────────────────────────┐              ║
║ │ Name    │ ID      │ Status │ Actions     │              ║
║ ├─────────┼─────────┼────────┼─────────────┤              ║
║ │ H1      │ 00000...│ Online │ [Delete]    │              ║
║ │ Mumbai  │ a1b2c...│ Offline│ [Delete]    │              ║
║ └──────────────────────────────────────────┘              ║
║                                                             ║
║ [Refresh] [Delete All]                                     ║
╚════════════════════════════════════════════════════════════╝
```

### Delete Confirmation Modal
```
╔════════════════════════════════════════════════════════════╗
║ ⚠️  Confirm Deletion                                        ║
╠════════════════════════════════════════════════════════════╣
║                                                             ║
║ Are you sure you want to delete Mumbai Office?             ║
║                                                             ║
║ ⚠️  This will also delete all cameras, telemetry,          ║
║    and sessions associated with this gateway.              ║
║                                                             ║
║ [Delete]  [Cancel]                                         ║
╚════════════════════════════════════════════════════════════╝
```

---

## 🚀 How to Use

### Example 1: Delete a Gateway

1. Navigate to `/admin/system`
2. Ensure you're on the "Gateways" tab
3. Find the gateway you want to delete
4. Click the red "Delete" button
5. Review the confirmation dialog
6. Click "Delete" to confirm (or "Cancel" to abort)
7. Gateway and all dependencies are deleted
8. List refreshes automatically

### Example 2: View All Cameras

1. Navigate to `/admin/system`
2. Click the "Cameras" tab
3. View table with all cameras
4. See which gateway each camera belongs to
5. Check status (online/offline)

### Example 3: Clean Up Everything (Fresh Start)

1. Navigate to `/admin/system`
2. Go to "Branches" tab
3. Click "Delete All" button
4. Type "DELETE ALL" in the prompt
5. Confirm
6. All branches, gateways, and cameras deleted
7. Database is clean

---

## 🔧 API Endpoints Created

All API routes are RESTful and follow this pattern:

### Stats
```
GET /api/admin/system/stats
Returns: { gateways, cameras, branches, live_sessions, telemetry_records }
```

### Gateways
```
GET    /api/admin/system/gateways          # List all
DELETE /api/admin/system/gateways/[id]     # Delete one
DELETE /api/admin/system/gateways/all      # Delete all
```

### Cameras
```
GET    /api/admin/system/cameras           # List all
DELETE /api/admin/system/cameras/[id]      # Delete one
DELETE /api/admin/system/cameras/all       # Delete all
```

### Branches
```
GET    /api/admin/system/branches          # List all
DELETE /api/admin/system/branches/[id]     # Delete one
DELETE /api/admin/system/branches/all      # Delete all
```

---

## 📁 Files Created

```
dashboard/
├── app/
│   ├── admin/
│   │   ├── page.tsx                                    ← Updated with link
│   │   └── system/
│   │       └── page.tsx                                ← Main UI component
│   └── api/
│       └── admin/
│           └── system/
│               ├── stats/
│               │   └── route.ts                        ← Statistics API
│               ├── gateways/
│               │   ├── route.ts                        ← List gateways
│               │   ├── [id]/
│               │   │   └── route.ts                    ← Delete gateway
│               │   └── all/
│               │       └── route.ts                    ← Delete all gateways
│               ├── cameras/
│               │   ├── route.ts                        ← List cameras
│               │   ├── [id]/
│               │   │   └── route.ts                    ← Delete camera
│               │   └── all/
│               │       └── route.ts                    ← Delete all cameras
│               └── branches/
│                   ├── route.ts                        ← List branches
│                   ├── [id]/
│                   │   └── route.ts                    ← Delete branch
│                   └── all/
│                       └── route.ts                    ← Delete all branches
```

---

## 🎨 UI/UX Features

### Responsive Design
- ✅ Works on desktop and tablet
- ✅ Tables scroll horizontally on small screens
- ✅ Touch-friendly buttons

### Visual Feedback
- ✅ Status badges with colors (green = online, red = offline)
- ✅ Loading states while fetching data
- ✅ Success/error messages
- ✅ Confirmation modals
- ✅ Hover effects on buttons

### User Experience
- ✅ Clear navigation breadcrumbs
- ✅ Tab-based organization
- ✅ Refresh button to reload data
- ✅ Statistics always visible
- ✅ Monospace font for IDs
- ✅ Timestamp formatting
- ✅ Empty states when no data

---

## 🔍 Testing the UI

### Test Scenario 1: View Statistics
```
1. Navigate to /admin/system
2. Check statistics cards show correct numbers
3. Click different tabs
4. Verify stats don't change (they're global)
```

### Test Scenario 2: Delete Gateway
```
1. Go to Gateways tab
2. Note number of gateways in stats
3. Delete one gateway
4. Confirm deletion
5. Verify:
   - Gateway removed from table
   - Stats updated
   - Related cameras also deleted
```

### Test Scenario 3: Refresh Data
```
1. Open UI in browser
2. Use CLI tool to add/remove items
3. Click Refresh button
4. Verify UI updates with latest data
```

---

## 💡 Pro Tips

### Quick Navigation
- Bookmark `/admin/system` for quick access
- Use browser back button to return to main admin

### Bulk Operations
- Use "Delete All" for testing/cleanup
- Always check stats before bulk delete
- Keep database backups!

### Integration with CLI
- CLI tools (`admin-cleanup.mjs`) work alongside UI
- Changes in CLI reflect in UI after refresh
- Use CLI for scripts, UI for manual operations

---

## 🐛 Troubleshooting

### UI Not Loading
```
Check:
- Dashboard is running
- Database connection is working
- API routes are accessible
- Browser console for errors
```

### Data Not Showing
```
Check:
- Click Refresh button
- Check browser network tab
- Verify database has data
- Check API responses
```

### Delete Not Working
```
Check:
- Browser console for errors
- API endpoint responses
- Database foreign key constraints
- Network connectivity
```

### "Branches" Shows Error
```
This is normal if branches table doesn't exist yet.
The UI handles this gracefully and shows empty state.
```

---

## 🔐 Security Considerations

### Authentication
- Add authentication middleware to API routes
- Verify user has admin permissions
- Log all deletion operations

### Rate Limiting
- Consider adding rate limits to prevent abuse
- Especially for "delete all" operations

### Audit Trail
- Log who deleted what and when
- Store deleted records in archive table
- Enable undo functionality

---

## 🚀 What's Next?

### Planned Enhancements (Optional)

1. **Bulk Selection**
   - Checkboxes to select multiple items
   - Bulk delete selected items

2. **Search & Filter**
   - Search by name/ID
   - Filter by status
   - Date range filters

3. **Export Data**
   - Export to CSV
   - Download reports

4. **Edit Capabilities**
   - Edit gateway name
   - Update camera settings
   - Modify branch info

5. **Activity Log**
   - View deletion history
   - Undo recent deletions
   - Audit trail

---

## ✅ Summary

You now have a complete UI for managing your Sentinel Grid system:

- ✅ View all gateways, cameras, and branches
- ✅ Real-time statistics dashboard
- ✅ Delete individual items safely
- ✅ Bulk delete with confirmation
- ✅ Automatic cascade deletion
- ✅ Responsive, modern interface
- ✅ Integrated with existing admin panel

**Access it now at:** `https://your-dashboard/admin/system`

🎉 Happy managing!
