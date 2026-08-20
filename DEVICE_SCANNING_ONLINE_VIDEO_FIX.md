# Device Scanning & Discovery Fix - Complete Solution

## പ്രശ്നം (Problem)

Batch file successfully discovered cameras ("Found 1 device. 1 verified live streams were activated") പക്ഷേ UI-ൽ "No pending discoveries" കാണിക്കുന്നു.

## Root Cause കണ്ടെത്തൽ

### Discovery Flow:
1. ✅ Auto-Setup .BAT file discovers cameras
2. ✅ Batch file POSTs to `/v1/branches/:branchId/cameras/discovered`
3. ✅ Backend calls `EdgeAgentRepository.createDiscovery()`
4. ✅ Discovery inserted into `camera_discoveries` table
5. ❌ **ISSUE**: Status set to `"approved"` instead of `"pending"` for existing cameras
6. ❌ UI calls `listDiscoveries()` which filters `WHERE status='pending'`
7. ❌ Approved cameras don't show → "No pending discoveries"

### അസ്സല് Bug:

`src/database/edge-agent-repository.ts` line 543-ൽ:

```typescript
// OLD CODE (WRONG):
identity.cameraId ? "approved" : "pending"
```

**Logic Issue:**
- If `device_identities` table-ൽ `camera_id` column-ൽ value ഉണ്ടെങ്കിൽ (previously approved camera), new discovery automatically `"approved"` status-ആയി set ആകും
- But `listDiscoveries()` query: `WHERE status='pending'`
- So approved cameras UI-ൽ കാണില്ല!

## സൊല്യൂഷൻ (Solution)

### Changed Files:
**`src/database/edge-agent-repository.ts`** - 2 changes

#### Change 1: INSERT status (line 543)
```typescript
// BEFORE:
identity.cameraId ? "approved" : "pending"

// AFTER:
"pending"
```

#### Change 2: UPDATE conflict resolution (line 526-530)
```typescript
// BEFORE:
status = CASE
  WHEN camera_discoveries.status = 'rejected' THEN camera_discoveries.status
  ELSE EXCLUDED.status
END

// AFTER:
status = CASE
  WHEN camera_discoveries.status = 'rejected' THEN camera_discoveries.status
  ELSE 'pending'::discovery_status
END
```

### Why This Fixes It:

1. ✅ **New discoveries**: Always set to `"pending"` status regardless of device identity match
2. ✅ **Re-discovered cameras**: Reset to `"pending"` status (except `"rejected"` ones stay rejected)
3. ✅ **UI compatibility**: `listDiscoveries()` returns all pending cameras
4. ✅ **Workflow preserved**: User must explicitly approve each camera before provisioning

### Behavior After Fix:

```
Scan Result → All cameras show as "Pending review" in UI
             ↓
User clicks "Approve & start live" for each camera
             ↓
Camera provisioned with recording, analytics, alerts
```

## Testing Instructions

### 1. അവസ്ഥ പരിശോധിക്കുക (Check Current State):

```sql
-- Check existing discoveries and their status
SELECT id, display_name, ip_address, status, discovered_at
FROM camera_discoveries
WHERE branch_node_id = 'your-branch-id'
ORDER BY discovered_at DESC;
```

### 2. Clear Old Discoveries (Optional):

```sql
-- If you want to start fresh, delete old discoveries
DELETE FROM camera_discoveries
WHERE branch_node_id = 'your-branch-id';
```

### 3. Restart Backend:

```bash
# Stop current backend
# Start with the fixed code
npm run dev
```

### 4. Run Auto-Setup Batch File Again:

1. Go to Branch Onboarding Wizard
2. Click "Download auto-setup package"
3. Extract and run the .BAT file as Administrator
4. Wait for "Found X device(s)" message

### 5. Verify Fix:

1. Refresh browser (F5)
2. ✅ Should see cameras in "Device discovery" section
3. ✅ Should show "Found: 1" (or number of discovered cameras)
4. ✅ Should show "Pending: 1"
5. ✅ Each camera should have "⚡ Approve & start live" button

## Future Considerations

### Duplicate Detection:
- `duplicateStatus` field already tracks if camera was seen before
- Status should always be `"pending"` for user review
- Duplicate badge can be shown in UI to inform user

### Auto-Approval (Optional Future Feature):
- Could add a branch-level setting: `autoApproveKnownCameras: boolean`
- If enabled, re-discovered cameras with `existingDeviceAssociation` could auto-approve
- For now, manual approval is safer and gives user control

## സംഗ്രഹം (Summary)

**Issue**: Cameras discovered by batch file weren't showing in UI because status was set to `"approved"` for previously known devices.

**Fix**: Always set new discoveries to `"pending"` status so they appear in UI for user review and approval.

**Files Changed**: `src/database/edge-agent-repository.ts` (2 lines)

**Testing**: Run batch file again → Cameras should now appear as "Pending review" in Device Discovery section.

---

**Fix Applied**: ✅ January 19, 2026
**Status**: Ready for testing
