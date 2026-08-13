# Device Capability Registry - Implementation Guide

This document provides a comprehensive guide to implementing and integrating the Device Capability Registry into your VMS platform.

## Overview

The Device Capability Registry transforms your platform from assumption-based to evidence-based device management. Instead of discovering capabilities through runtime errors, the system proactively discovers, verifies, and tracks what each device can actually do.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Application Layer                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   UI Layer   │  │  Backend Ops │  │ Digital Twin │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                  │                   │
└─────────┼─────────────────┼──────────────────┼───────────────────┘
          │                 │                  │
┌─────────┼─────────────────┼──────────────────┼───────────────────┐
│         ▼                 ▼                  ▼                    │
│  ┌──────────────────────────────────────────────────────┐       │
│  │         Device Capability Registry Service            │       │
│  └───────────────────┬──────────────────────────────────┘       │
│                      │                                           │
│     ┌────────────────┼────────────────┐                         │
│     ▼                ▼                ▼                          │
│  Discovery      Resolution        Repository                    │
│  Service        Service            Layer                         │
│     │                                                            │
│     ▼                                                            │
│  Capability Probes:                                              │
│  • Model Database (DECLARED)                                     │
│  • ONVIF (DISCOVERED)                                            │
│  • RTSP (VERIFIED)                                               │
│  • Vendor APIs (DISCOVERED/VERIFIED)                             │
│  • Edge Agent (OBSERVED)                                         │
└──────────────────────────────────────────────────────────────────┘
```

## Implementation Steps

### Phase 1: Core Registry (Week 1)

#### 1.1 Database Setup

Create the necessary database tables:

```sql
-- Device capabilities (current state)
CREATE TABLE device_capabilities (
  tenant_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  capability_key TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('SUPPORTED', 'UNSUPPORTED', 'UNKNOWN', 'UNAVAILABLE', 'DEGRADED', 'MISCONFIGURED')),
  available BOOLEAN NOT NULL,
  verification_level TEXT NOT NULL CHECK (verification_level IN ('DECLARED', 'DISCOVERED', 'VERIFIED')),
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  value_json TEXT,
  discovered_at TIMESTAMP,
  verified_at TIMESTAMP,
  last_updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, device_id, capability_key)
);

CREATE INDEX idx_device_capabilities_device 
  ON device_capabilities(tenant_id, device_id);

CREATE INDEX idx_device_capabilities_state 
  ON device_capabilities(state, available);

-- Evidence supporting capabilities
CREATE TABLE device_capability_evidence (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  capability_key TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('ONVIF', 'VENDOR_API', 'SNMP', 'RTSP', 'DEVICE_PROBE', 'MODEL_DATABASE', 'MANUAL', 'EDGE_AGENT', 'INFERRED')),
  observed_at TIMESTAMP NOT NULL,
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  verified BOOLEAN NOT NULL,
  evidence_type TEXT,
  raw_reference TEXT,
  reason TEXT,
  expires_at TIMESTAMP,
  freshness TEXT CHECK (freshness IN ('FRESH', 'STALE', 'EXPIRED')),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id, device_id, capability_key)
    REFERENCES device_capabilities(tenant_id, device_id, capability_key)
    ON DELETE CASCADE
);

CREATE INDEX idx_capability_evidence_device 
  ON device_capability_evidence(tenant_id, device_id, capability_key);

CREATE INDEX idx_capability_evidence_source 
  ON device_capability_evidence(source, observed_at);

-- Capability change history
CREATE TABLE device_capability_history (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  capability_key TEXT NOT NULL,
  previous_state TEXT NOT NULL,
  new_state TEXT NOT NULL,
  previous_value TEXT,
  new_value TEXT,
  reason TEXT,
  changed_at TIMESTAMP NOT NULL,
  changed_by TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_capability_history_device
  ON device_capability_history(tenant_id, device_id, changed_at DESC);

CREATE INDEX idx_capability_history_capability
  ON device_capability_history(capability_key, changed_at DESC);
```

#### 1.2 Repository Implementation

Replace `InMemoryCapabilityRepository` with a database-backed implementation:

```typescript
import type { Database } from "./database.js";

export class DatabaseCapabilityRepository implements CapabilityRepository {
  constructor(private readonly db: Database) {}

  async getDeviceCapabilities(
    tenantId: string,
    deviceId: string,
  ): Promise<DeviceCapabilitySet | null> {
    // Query all capabilities for device
    const rows = await this.db.query(
      `SELECT * FROM device_capabilities 
       WHERE tenant_id = ? AND device_id = ?`,
      [tenantId, deviceId]
    );

    if (rows.length === 0) return null;

    // Reconstruct capability set from flat rows
    return this.reconstructCapabilitySet(rows, tenantId, deviceId);
  }

  async saveDeviceCapabilities(capabilities: DeviceCapabilitySet): Promise<void> {
    // Flatten capability set into rows
    const rows = this.flattenCapabilitySet(capabilities);

    // Batch upsert
    await this.db.transaction(async (tx) => {
      for (const row of rows) {
        await tx.query(
          `INSERT INTO device_capabilities (
            tenant_id, device_id, capability_key, state, available,
            verification_level, confidence, value_json, discovered_at,
            verified_at, last_updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (tenant_id, device_id, capability_key) 
          DO UPDATE SET
            state = excluded.state,
            available = excluded.available,
            verification_level = excluded.verification_level,
            confidence = excluded.confidence,
            value_json = excluded.value_json,
            verified_at = excluded.verified_at,
            last_updated_at = excluded.last_updated_at`,
          [
            row.tenantId,
            row.deviceId,
            row.capabilityKey,
            row.state,
            row.available,
            row.verificationLevel,
            row.confidence,
            row.valueJson,
            row.discoveredAt,
            row.verifiedAt,
            new Date().toISOString(),
          ]
        );
      }
    });
  }

  // Implement other methods...
}
```

#### 1.3 Initialize Registry

Create a registry singleton:

```typescript
// src/services/capability-registry.instance.ts
import { createCapabilityRegistry } from "../device-capabilities/index.js";
import { DatabaseCapabilityRepository } from "../repositories/capability.repository.js";
import { database } from "./database.js";

export const capabilityRegistry = createCapabilityRegistry({
  repository: new DatabaseCapabilityRepository(database),
});
```

### Phase 2: Provisioning Integration (Week 1-2)

#### 2.1 Update Camera Provisioning

The provisioning integration is already implemented in `src/services/camera-auto-provision.ts`. To enable it:

```typescript
import { capabilityRegistry } from "./capability-registry.instance.js";

const result = await autoProvisionVerifiedCameras(
  store,
  branchId,
  {
    enableAnalytics: true,
    enableAlerts: true,
    capabilityRegistry,      // Pass registry
    discoverCapabilities: true, // Enable discovery
  }
);

// Check provisioning results
for (const camera of result.results) {
  if (camera.capabilities) {
    console.log(`Camera ${camera.cameraId} capabilities:`, {
      discovered: camera.capabilities.discovered,
      verified: camera.capabilities.verified,
      supported: camera.capabilities.supported,
    });
  }
}
```

#### 2.2 Manual Capability Refresh

Add API endpoint for manual refresh:

```typescript
// src/routes/device-capabilities.routes.ts
import { Router } from "express";
import { capabilityRegistry } from "../services/capability-registry.instance.js";

const router = Router();

router.post("/devices/:deviceId/capabilities/refresh", async (req, res) => {
  const { deviceId } = req.params;
  const { tenantId } = req.query;

  try {
    const capabilities = await capabilityRegistry.refreshCapabilities(
      tenantId as string,
      deviceId
    );

    res.json(capabilities);
  } catch (error) {
    res.status(500).json({
      error: "capability_refresh_failed",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
```

### Phase 3: UI Integration (Week 2)

#### 3.1 Add Capability Panel to Camera Page

```tsx
// dashboard/pages/cameras/[id].tsx
import { DeviceCapabilitiesPanel } from "../../components/capability/DeviceCapabilitiesPanel";

export function CameraDetailPage() {
  const { cameraId } = useParams();
  const { tenantId } = useAuth();

  return (
    <div>
      <CameraHeader />
      
      <Tabs>
        <Tab label="Live">
          <LiveView cameraId={cameraId} />
        </Tab>
        
        <Tab label="Capabilities">
          <DeviceCapabilitiesPanel
            deviceId={cameraId}
            tenantId={tenantId}
            showVerification
          />
        </Tab>
        
        {/* Other tabs */}
      </Tabs>
    </div>
  );
}
```

#### 3.2 Capability-Driven Controls

Update PTZ controls to use `CapabilityGate`:

```tsx
// dashboard/components/camera/PtzControls.tsx
import { CapabilityGate } from "../capability/CapabilityGate";

export function PtzControls({ cameraId, tenantId }) {
  return (
    <CapabilityGate
      deviceId={cameraId}
      tenantId={tenantId}
      capability="ptz.ptz"
      unsupportedContent={
        <div className="text-gray-500">
          <span>PTZ not supported</span>
        </div>
      }
      unavailableContent={
        <div className="text-yellow-600">
          <span>PTZ temporarily unavailable</span>
          <button onClick={checkStatus}>Check Status</button>
        </div>
      }
    >
      <div className="ptz-controls">
        <button onClick={panLeft}>◀ Pan Left</button>
        <button onClick={panRight}>Pan Right ▶</button>
        <button onClick={tiltUp}>▲ Tilt Up</button>
        <button onClick={tiltDown}>▼ Tilt Down</button>
        <button onClick={zoomIn}>🔍 Zoom In</button>
        <button onClick={zoomOut}>Zoom Out 🔍</button>
      </div>
    </CapabilityGate>
  );
}
```

### Phase 4: Backend Operation Protection (Week 2-3)

#### 4.1 Add Capability Middleware

```typescript
// src/routes/ptz.routes.ts
import { Router } from "express";
import { createCapabilityPolicy } from "../middleware/capability-policy.middleware.js";
import { capabilityRegistry } from "../services/capability-registry.instance.js";

const router = Router();

const { requireCapability } = createCapabilityPolicy({
  registry: capabilityRegistry,
});

// Protect PTZ operations
router.post(
  "/cameras/:cameraId/ptz/move",
  requireCapability("ptz.continuousMove"),
  async (req, res) => {
    // Operation only executes if capability is supported and available
    const result = await ptzService.moveCamera(req.params.cameraId, req.body);
    res.json(result);
  }
);

router.post(
  "/cameras/:cameraId/ptz/preset/:presetId",
  requireCapability({
    capability: "ptz.presets",
    errorMessage: "This camera does not support PTZ presets",
  }),
  async (req, res) => {
    const result = await ptzService.goToPreset(
      req.params.cameraId,
      req.params.presetId
    );
    res.json(result);
  }
);
```

#### 4.2 Programmatic Checks

For operations without middleware:

```typescript
import { checkCapability } from "../middleware/capability-policy.middleware.js";
import { capabilityRegistry } from "../services/capability-registry.instance.js";

async function exportRecording(cameraId: string, range: TimeRange) {
  // Check if camera supports export
  const check = await checkCapability(
    capabilityRegistry,
    tenantId,
    cameraId,
    "recording.export"
  );

  if (!check.allowed) {
    throw new Error(`Export not available: ${check.reason}`);
  }

  // Proceed with export
  return performExport(cameraId, range);
}
```

### Phase 5: Digital Twin Integration (Week 3-4)

#### 5.1 Enhance Twin Nodes with Capabilities

```typescript
// src/digital-twin/service.ts
import { capabilityRegistry } from "../services/capability-registry.instance.js";
import {
  deriveTwinNodeState,
  enhanceTwinStatusWithCapabilities,
} from "./capability-integration.js";

export class DigitalTwinService {
  async getTwinObjectWithCapabilities(
    objectId: string,
    tenantId: string
  ): Promise<TwinNodeWithCapabilities> {
    const twinObject = await this.state.getTwinObject(objectId);

    if (twinObject.binding?.deviceId) {
      // Get capabilities
      const capabilities = await capabilityRegistry.getCapabilities(
        tenantId,
        twinObject.binding.deviceId
      );

      // Derive enhanced state
      const enhancedStatus = enhanceTwinStatusWithCapabilities(
        twinObject.currentStatus,
        capabilities
      );

      return {
        ...twinObject,
        capabilities,
        currentStatus: enhancedStatus,
      };
    }

    return twinObject;
  }
}
```

#### 5.2 Capability-Based Health Indicators

```typescript
// Update twin status calculation
function calculateTwinStatus(
  device: Device,
  capabilities?: DeviceCapabilitySet
): TwinObjectStatus {
  const state = deriveTwinNodeState(capabilities, {
    status: device.status,
  });

  return {
    state: state.operational,
    color: getColorForState(state.operational),
    label: getLabelForState(state),
    online: state.connectivity === "ONLINE",
    recording: isCapabilityAvailable(capabilities?.recording?.recording),
    analyticsActive: isCapabilityAvailable(capabilities?.analytics?.personDetection),
    observedAt: state.observedAt.toISOString(),
    source: "capability-registry",
    details: {
      confidence: state.confidence,
      reasons: state.reasons,
    },
  };
}
```

### Phase 6: Event System and Monitoring (Week 4)

#### 6.1 Subscribe to Capability Events

```typescript
// src/services/capability-monitor.ts
import { capabilityEvents } from "../device-capabilities/index.js";

// Monitor critical capabilities
capabilityEvents.subscribe(
  "capability.unavailable",
  async (event) => {
    console.warn(`Capability unavailable: ${event.capability} on ${event.deviceId}`);

    // Create incident for critical capabilities
    if (isCriticalCapability(event.capability)) {
      await incidentService.createIncident({
        title: `Critical capability unavailable: ${event.capability}`,
        deviceId: event.deviceId,
        severity: "P1",
        detectedAt: event.timestamp,
      });
    }
  },
  { tenantId: "your-tenant-id" }
);

// Monitor drift patterns
capabilityEvents.subscribe("capability.drift", async (event) => {
  console.log(`Capability drift detected:`, event.metadata);

  // Log for analysis
  await auditLog.record({
    action: "capability_drift",
    deviceId: event.deviceId,
    details: event.metadata,
  });
});
```

#### 6.2 Alerting Integration

```typescript
// Send alerts for capability changes
capabilityEvents.subscribe("capability.removed", async (event) => {
  await alertService.sendAlert({
    severity: "warning",
    title: "Device Capability Lost",
    message: `Device ${event.deviceId} no longer supports ${event.capability}`,
    category: "device-configuration",
    metadata: event.metadata,
  });
});
```

## Best Practices

### 1. Refresh Strategy

- **On provisioning**: Always refresh capabilities
- **On firmware upgrade**: Refresh immediately after
- **Periodic refresh**: Every 24 hours for active devices
- **On-demand**: When user suspects capability changed

```typescript
// Scheduled refresh
cron.schedule("0 2 * * *", async () => {
  const activeDevices = await getActiveDevices();

  for (const device of activeDevices) {
    try {
      await capabilityRegistry.refreshCapabilities(
        device.tenantId,
        device.id
      );
    } catch (error) {
      console.error(`Failed to refresh capabilities for ${device.id}:`, error);
    }
  }
});
```

### 2. Error Handling

Always handle capability errors gracefully:

```typescript
try {
  const result = await ptzService.moveCamera(cameraId, command);
} catch (error) {
  if (error instanceof CapabilityNotSupportedError) {
    return res.status(400).json({
      error: "ptz_not_supported",
      message: "This camera does not support PTZ",
      helpText: "Consider upgrading to a PTZ-enabled camera",
    });
  }

  if (error instanceof CapabilityUnavailableError) {
    return res.status(503).json({
      error: "ptz_unavailable",
      message: "PTZ is temporarily unavailable",
      reason: error.reason,
      helpText: "Please try again in a few minutes or contact support",
    });
  }

  throw error;
}
```

### 3. Caching

The registry includes built-in caching (5 minutes default). Configure per your needs:

```typescript
// Short cache for critical operations
const capability = await registry.getCapability(
  tenantId,
  deviceId,
  "recording.recording",
  { maxAge: 60 } // 1 minute
);

// Long cache for stable capabilities
const onvifSupport = await registry.getCapability(
  tenantId,
  deviceId,
  "network.onvif.profileS",
  { maxAge: 3600 } // 1 hour
);

// Force refresh
const fresh = await registry.getCapability(
  tenantId,
  deviceId,
  "ptz.ptz",
  { forceRefresh: true }
);
```

### 4. Monitoring and Observability

Log capability operations:

```typescript
capabilityEvents.subscribe("*", async (event) => {
  await metricsService.record({
    metric: "capability.event",
    type: event.type,
    deviceId: event.deviceId,
    capability: event.capability,
    timestamp: event.timestamp,
  });
});
```

## Troubleshooting

### Issue: Capabilities showing as UNKNOWN

**Cause**: No probes can reach the device or probes are misconfigured.

**Solution**:
1. Verify device connectivity
2. Check probe configurations
3. Enable debug logging:

```typescript
const { observations, results } = await discoveryService.discoverWithResults(
  device
);

console.log("Probe results:", results);
```

### Issue: Capabilities not updating after firmware upgrade

**Cause**: Cache not invalidated.

**Solution**: Force refresh after firmware upgrade:

```typescript
await capabilityRegistry.refreshCapabilities(tenantId, deviceId);
```

### Issue: False positive unavailable capabilities

**Cause**: Evidence TTL too short.

**Solution**: Adjust TTL in resolution service or manually override:

```typescript
// Override with manual evidence
await capabilityRepository.addEvidence(tenantId, deviceId, "ptz.ptz", {
  source: "MANUAL",
  confidence: 1.0,
  verified: true,
  reason: "Verified by technician on-site",
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
});
```

## Migration Strategy

### Step 1: Shadow Mode (Week 1)
- Deploy capability registry
- Discover capabilities in background
- Log differences between assumptions and reality
- **Do not enforce** capabilities yet

### Step 2: Soft Enforcement (Week 2-3)
- Enable capability checks
- Log errors but allow operations to proceed
- Monitor error rates and false positives
- Tune probe configurations

### Step 3: Hard Enforcement (Week 4+)
- Block operations without capabilities
- Full UI integration
- Digital twin integration
- Event monitoring active

## Performance Considerations

- **Database**: Index on `(tenant_id, device_id)` and `(capability_key, state)`
- **Caching**: Use Redis for multi-instance deployments
- **Probing**: Rate-limit device probes (max 1 per device per minute)
- **Batch operations**: Refresh capabilities in batches of 10-20 devices

## Security Considerations

- **Evidence authenticity**: Verify probe sources
- **Manual overrides**: Require admin role and audit trail
- **Capability escalation**: Alert on unexpected capability additions
- **Access control**: Enforce tenant isolation in all queries

## Conclusion

The Device Capability Registry transforms your VMS from reactive ("let's try and see if it works") to proactive ("we know what's available"). This eliminates entire classes of runtime errors and provides deep operational intelligence about your surveillance infrastructure.

For support, see `src/device-capabilities/README.md` or contact the platform team.
