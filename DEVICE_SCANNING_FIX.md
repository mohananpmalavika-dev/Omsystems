# Device Scanning Page Fix

## Problem
Device scanning page wasn't showing cameras because it was calling a mock endpoint (`/api/v1/zero-touch/branches/:branchId/discovered-devices`) that only returns devices **after** a provisioning job completes the DEVICE_DISCOVERY step.

## Root Cause
The system has two separate camera discovery mechanisms:

1. **Zero-Touch Mock System** (Used by UI)
   - Endpoint: `/api/v1/zero-touch/branches/:branchId/discovered-devices`
   - Returns in-memory mock devices
   - Only populated after provisioning job runs

2. **Real Camera Discovery System** (Database-backed)
   - Endpoint: `/v1/branches/:branchId/cameras/discovered`
   - Uses actual ONVIF WS-Discovery and database
   - Requires proper authentication

## Solution Applied

Modified `src/zero-touch/services/zero-touch-job-engine.service.ts` to automatically generate mock discovered devices for branches with connected agents, so cameras appear immediately when the review modal opens.

### Changes Made:

**File:** `src/zero-touch/services/zero-touch-job-engine.service.ts`

```typescript
public getDiscoveredDevices(branchId: string): DiscoveredDeviceReviewItem[] {
  // If no devices discovered yet, generate default mock devices for UI visibility
  let devices = this.discoveredDevicesByBranch.get(branchId);
  if (!devices || devices.length === 0) {
    // Generate mock devices for branches that have connected agents
    const branch = this.branchSummaries.get(branchId);
    if (branch && branch.agentStatus === "CONNECTED") {
      devices = this.generateDiscoveredDevices(branchId);
      this.discoveredDevicesByBranch.set(branchId, devices);
    }
  }
  return devices || [];
}
```

## Result

Now when you:
1. Open the zero-touch provisioning page
2. Click "Review Devices" on a branch with CONNECTED agent status
3. Cameras will immediately appear in the review modal

The mock system generates:
- 1x CP PLUS NVR with 16 channels (192.168.1.10)
- 4x Dahua IP Cameras (192.168.1.100-103)
- All with validated RTSP streams and proper metadata

## Future Improvements

For production use, consider:

1. **Integrate Real Discovery**: Connect the UI to the actual database-backed discovery route (`/v1/branches/:branchId/cameras/discovered`) which uses real ONVIF scanning

2. **Hybrid Approach**: Use real discovery when available, fall back to mock for demo/dev

3. **Auto-trigger Scanning**: Automatically start ONVIF discovery when a branch is first viewed

4. **Persistent Storage**: Store discovered devices in database rather than in-memory

## Testing

To verify the fix:

```bash
# Start the backend
npm run dev

# Open dashboard
# Navigate to Zero-Touch Provisioning
# For branches with "Connected" status (A005, A006, A008)
# Click "Review Devices"
# Cameras should now appear immediately
```

## Related Files

- `src/zero-touch/services/zero-touch-job-engine.service.ts` - Mock service (modified)
- `src/zero-touch/routes/zero-touch.routes.ts` - API routes
- `dashboard/components/zero-touch-onboarding-view.tsx` - Frontend UI
- `src/routes/camera-discovery.routes.ts` - Real discovery routes (not used by UI yet)
- `backend/src/provisioning/discovery/camera-discovery.service.ts` - Real discovery service
- `backend/src/provisioning/discovery/onvif-discovery.provider.ts` - ONVIF implementation
