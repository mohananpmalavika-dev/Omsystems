# Device Capability Registry

The Device Capability Registry provides evidence-based capability detection and verification for cameras, recorders, and other surveillance devices.

## Overview

Instead of assuming device capabilities or discovering them at runtime through errors, the capability registry proactively discovers, verifies, and tracks what each device can actually do.

### Key Principles

1. **Capabilities are NOT booleans** - They have states: SUPPORTED, UNSUPPORTED, UNKNOWN, UNAVAILABLE, DEGRADED, MISCONFIGURED
2. **Evidence-based** - Every capability determination is backed by evidence from multiple sources
3. **Verification levels** - DECLARED (specs) → DISCOVERED (advertised) → VERIFIED (runtime tested)
4. **Precedence rules** - Runtime verification > Vendor API > ONVIF > Model database
5. **Historical tracking** - Capability changes are logged for drift detection

## Architecture

```
Device
  ↓
Discovery Service
  ↓
Multiple Probes (ONVIF, RTSP, Vendor API, Model DB)
  ↓
Evidence Collection
  ↓
Resolution Service (precedence + confidence)
  ↓
Capability Registry (storage + events)
  ↓
Applications (UI, Backend operations, Digital Twin)
```

## Capability Model

### Capability States

- **SUPPORTED**: Device has this capability and it's working
- **UNSUPPORTED**: Device definitively does not have this capability
- **UNKNOWN**: Cannot determine if device has this capability
- **UNAVAILABLE**: Device has capability but it's currently inaccessible
- **DEGRADED**: Device has capability but with limited functionality
- **MISCONFIGURED**: Device has capability but configuration is invalid

### Verification Levels

- **DECLARED**: Vendor documentation or model database claims support
- **DISCOVERED**: Device advertises capability (ONVIF GetCapabilities, RTSP DESCRIBE)
- **VERIFIED**: Capability successfully executed at runtime

### Capability Domains

Capabilities are organized hierarchically:

- **video**: Live video, codecs, streams, profiles
- **recording**: Recording, playback, search, export
- **audio**: Audio input/output, codecs
- **ptz**: Pan, tilt, zoom, presets, tours
- **events**: Motion, line crossing, intrusion
- **analytics**: Person/vehicle detection, metadata
- **storage**: On-board storage, telemetry
- **network**: RTSP, ONVIF profiles, SNMP
- **security**: HTTPS, secure boot, firmware signing
- **management**: Firmware upgrade, reboot, diagnostics

## Usage

### Basic Query

```typescript
import { createCapabilityRegistry } from "./device-capabilities/index.js";

const registry = createCapabilityRegistry();

// Get all capabilities
const capabilities = await registry.getCapabilities(tenantId, deviceId);

// Check specific capability
const ptz = await registry.getCapability(tenantId, deviceId, "ptz.ptz");
console.log(ptz.state); // "SUPPORTED" | "UNSUPPORTED" | ...
console.log(ptz.available); // true | false
console.log(ptz.confidence); // 0.0 - 1.0
console.log(ptz.verificationLevel); // "VERIFIED" | "DISCOVERED" | "DECLARED"

// Convenience check
const supportsPtz = await registry.supports(tenantId, deviceId, "ptz.ptz");
```

### Refresh Capabilities

```typescript
// Force refresh from device
const updated = await registry.refreshCapabilities(tenantId, deviceId);
```

### Active Verification

```typescript
// Actively verify a capability (performs runtime test)
const verified = await registry.verifyCapability(
  tenantId,
  deviceId,
  "ptz.continuousMove",
  { timeout: 5000 }
);
```

### Capability History

```typescript
// Get capability change history
const history = await registry.getCapabilityHistory(
  tenantId,
  deviceId,
  "recording.recordingSearch",
  new Date("2024-01-01")
);

for (const entry of history) {
  console.log(`${entry.changedAt}: ${entry.previousState} → ${entry.newState}`);
}
```

### Listen for Changes

```typescript
// Subscribe to capability change events
const unsubscribe = registry.onCapabilityChanged((event) => {
  console.log(`Device ${event.deviceId} capability ${event.capability} changed`);
  console.log(`  ${event.previousState} → ${event.newState}`);
  console.log(`  Available: ${event.previousAvailable} → ${event.newAvailable}`);
});
```

## Capability Probes

### Built-in Probes

1. **Model Database Probe** (priority: 50)
   - Provides DECLARED capabilities from vendor specifications
   - Always runs as baseline

2. **ONVIF Probe** (priority: 75)
   - Discovers capabilities via ONVIF GetCapabilities
   - Checks Profile S/T/G support
   - Identifies PTZ, events, analytics

3. **RTSP Probe** (priority: 85)
   - Verifies streaming with RTSP DESCRIBE
   - Extracts codec information from SDP
   - Runtime verification of live video

4. **Vendor API Probes** (priority: 80)
   - Hikvision ISAPI
   - Dahua API
   - Device-specific capabilities

### Custom Probes

```typescript
import type { CapabilityProbe } from "./device-capabilities/index.js";

class CustomProbe implements CapabilityProbe {
  readonly id = "my-probe";
  readonly priority = 70;

  supports(device: DeviceIdentity): boolean {
    return device.vendor === "my-vendor";
  }

  async probe(context: CapabilityProbeContext): Promise<CapabilityObservation[]> {
    return [
      {
        capabilityPath: "video.liveVideo",
        evidence: {
          source: "VENDOR_API",
          observedAt: new Date(),
          confidence: 1.0,
          verified: true,
          evidenceType: "API Check",
        },
      },
    ];
  }
}

// Register custom probe
const registry = createCapabilityRegistry({
  probes: [
    new ModelDatabaseProbe(),
    new OnvifCapabilityProbe(),
    new CustomProbe(),
  ],
});
```

## Integration Points

### Zero-Touch Provisioning

```typescript
// During device discovery
const capabilities = await registry.refreshCapabilities(tenantId, deviceId);

// Check if device meets requirements
if (!await registry.supports(tenantId, deviceId, "recording.recording")) {
  console.warn("Device does not support recording");
}
```

### UI Components

```typescript
// Capability-driven UI
const ptzCap = await registry.getCapability(tenantId, deviceId, "ptz.ptz");

if (ptzCap.state === "SUPPORTED" && ptzCap.available) {
  // Show PTZ controls
} else if (ptzCap.state === "UNAVAILABLE") {
  // Show "PTZ unavailable" with reason
  console.log(ptzCap.limitations);
} else if (ptzCap.state === "UNSUPPORTED") {
  // Hide PTZ controls
}
```

### Backend Operations

```typescript
// Protect operations with capability checks
async function moveCamera(deviceId: string, command: PtzCommand) {
  const capability = await registry.getCapability(
    tenantId,
    deviceId,
    "ptz.continuousMove"
  );

  if (capability.state !== "SUPPORTED") {
    throw new CapabilityNotSupportedError(deviceId, "ptz.continuousMove", capability.state);
  }

  if (!capability.available) {
    throw new CapabilityUnavailableError(
      deviceId,
      "ptz.continuousMove",
      capability.limitations?.join("; ")
    );
  }

  // Execute PTZ command
  return executePtzMove(deviceId, command);
}
```

### Digital Twin Integration

```typescript
// Populate digital twin with capabilities
const capabilities = await registry.getCapabilities(tenantId, deviceId);

// Add to twin node
const twinNode = {
  id: deviceId,
  type: "CAMERA",
  capabilities: {
    liveVideo: capabilities.video?.liveVideo.state,
    recording: capabilities.recording?.recording.state,
    ptz: capabilities.ptz?.ptz.state,
  },
};
```

## Evidence Precedence

When multiple probes provide conflicting evidence, resolution follows precedence rules:

1. **MANUAL** (100) - Manual override
2. **DEVICE_PROBE** (90) - Runtime verification
3. **RTSP** (85) - Direct protocol test
4. **VENDOR_API** (80) - Vendor-specific API
5. **ONVIF** (75) - Standard protocol
6. **SNMP** (70) - Network management
7. **EDGE_AGENT** (65) - Edge agent observation
8. **MODEL_DATABASE** (50) - Vendor specs
9. **INFERRED** (10) - Inferred from other capabilities

## Evidence Freshness

Evidence has TTL based on source:

- **MANUAL**: 1 year
- **MODEL_DATABASE**: 90 days
- **ONVIF/VENDOR_API**: 1 day
- **SNMP**: 1 hour
- **RTSP/DEVICE_PROBE**: 5 minutes

Stale evidence is marked and can trigger re-verification.

## Capability Drift Detection

The registry automatically detects when capabilities change:

- **CAPABILITY_ADDED**: New capability discovered
- **CAPABILITY_REMOVED**: Capability no longer available
- **CAPABILITY_UNAVAILABLE**: Capability became unavailable
- **CAPABILITY_RECOVERED**: Capability recovered
- **CAPABILITY_DEGRADED**: Capability now degraded
- **CAPABILITY_CONFIGURATION_CHANGED**: Parameters changed

Drift events can indicate:
- Firmware upgrade/downgrade
- Configuration changes
- Device replacement
- Credential expiry
- License changes
- Hardware failure

## Database Schema

```sql
-- Device capabilities (current state)
CREATE TABLE device_capabilities (
  tenant_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  capability_key TEXT NOT NULL,
  state TEXT NOT NULL,
  available BOOLEAN NOT NULL,
  verification_level TEXT NOT NULL,
  confidence REAL NOT NULL,
  value_json TEXT,
  discovered_at TIMESTAMP,
  verified_at TIMESTAMP,
  last_updated_at TIMESTAMP NOT NULL,
  PRIMARY KEY (tenant_id, device_id, capability_key)
);

-- Evidence supporting capabilities
CREATE TABLE device_capability_evidence (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  capability_key TEXT NOT NULL,
  source TEXT NOT NULL,
  observed_at TIMESTAMP NOT NULL,
  confidence REAL NOT NULL,
  verified BOOLEAN NOT NULL,
  evidence_type TEXT,
  raw_reference TEXT,
  reason TEXT,
  expires_at TIMESTAMP,
  freshness TEXT,
  FOREIGN KEY (tenant_id, device_id, capability_key)
    REFERENCES device_capabilities(tenant_id, device_id, capability_key)
);

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
  changed_by TEXT
);

CREATE INDEX idx_capability_history_device
  ON device_capability_history(tenant_id, device_id, changed_at);
```

## Best Practices

1. **Query before operations**: Always check capabilities before attempting device operations
2. **Cache appropriately**: Use the registry's built-in caching (default 5 minutes)
3. **Handle gracefully**: Provide meaningful error messages based on capability state
4. **Monitor drift**: Subscribe to capability changes to detect configuration drift
5. **Verify actively**: Use active verification for critical capabilities before important operations
6. **Update on changes**: Refresh capabilities after firmware upgrades or configuration changes

## Future Enhancements

1. **Platform capability matrix**: Track which capabilities the platform supports
2. **Effective capabilities**: Combine device + platform + dependencies
3. **Capability-based routing**: Route operations to devices based on capabilities
4. **Health scoring**: Derive device health from capability availability
5. **Predictive refresh**: Automatically refresh capabilities before evidence expires
6. **Capability recommendations**: Suggest configuration improvements based on discovered capabilities
