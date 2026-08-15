# Recorder SDK

Canonical recorder driver SDK for unified DVR/NVR integration across OmSystems platform.

## Overview

This SDK consolidates fragmented recorder integration logic from edge-agent and backend into a single, tested, maintainable driver system.

### Key Features

- **Unified Interface**: Single `RecorderDriver` interface for all vendors
- **Vendor Separation**: Distinguishes vendor from protocol (e.g., CP PLUS uses Dahua CGI)
- **Automatic Detection**: Identifies recorder protocol through HTTP fingerprinting
- **Real Evidence**: Never fabricates timestamps or health data - returns `UNKNOWN` when cannot verify
- **Normalized Models**: All vendor responses map to canonical types
- **Transport Layer**: Built-in authentication (Basic/Digest), retry logic, connection pooling

### Supported Recorders

| Vendor | Protocol | Status | Notes |
|--------|----------|--------|-------|
| Dahua | dahua-cgi | ✅ Complete | Full CGI API support |
| CP PLUS | dahua-cgi | ✅ Complete | Dahua OEM - automatically detected |
| Hikvision | hikvision-isapi | ✅ Complete | Full ISAPI 2.0 support |
| ONVIF | onvif | 🚧 Planned | Generic ONVIF support |
| Uniview | uniview-api | 📋 Planned | Uniview proprietary API |

## Installation

```bash
npm install @omsystems/recorder-sdk
```

## Quick Start

### Automatic Detection

```typescript
import { setupGlobalRegistry, detectAndCreateDriver } from '@omsystems/recorder-sdk';

// Setup global registry (once at startup)
setupGlobalRegistry();

// Detect and create driver
const { driver, detection } = await detectAndCreateDriver(
  {
    host: '192.168.1.100',
    port: 80,
    scheme: 'http'
  },
  {
    username: 'admin',
    password: 'password'
  }
);

console.log(`Detected: ${detection.protocol} (${detection.vendor})`);
console.log(`Confidence: ${detection.confidence}`);
```

### Direct Driver Usage

```typescript
import { DahuaCGIDriver, HikvisionISAPIDriver } from '@omsystems/recorder-sdk';

// Use Dahua/CP PLUS driver
const driver = new DahuaCGIDriver();

// Create context
const ctx = {
  tenantId: 'tenant-123',
  branchId: 'branch-456',
  recorderId: 'recorder-789',
  endpoint: {
    host: '192.168.1.100',
    port: 80,
    scheme: 'http' as const,
    baseUrl: 'http://192.168.1.100:80'
  },
  credentialRef: {
    ref: 'cred-001',
    type: 'digest' as const
  },
  protocol: 'dahua-cgi' as const
};

// Probe recorder
const result = await driver.probe(ctx, {
  includeStorage: true,
  includeChannels: true
});

console.log(`Recorder: ${result.status}`);
console.log(`Channels: ${result.channels.length}`);
console.log(`Storage: ${result.storage?.usagePercent}%`);
```

### Get Device Information

```typescript
const deviceInfo = await driver.getDeviceInfo(ctx);

console.log(`Vendor: ${deviceInfo.vendor}`);
console.log(`Model: ${deviceInfo.model}`);
console.log(`Firmware: ${deviceInfo.firmwareVersion}`);
console.log(`Serial: ${deviceInfo.serialNumber}`);
```

### Check Recording Status

```typescript
// Get all channels
const channels = await driver.getChannels(ctx);

// Check recording on specific channel
const recordingStatus = await driver.getRecordingStatus(ctx, '0');

console.log(`State: ${recordingStatus.state}`);
console.log(`Actively Writing: ${recordingStatus.activelyWriting}`);
console.log(`Latest Recording: ${recordingStatus.latestRecordingAt}`);
```

### Search Archive

```typescript
const now = new Date();
const yesterday = new Date(now.getTime() - 86400000);

const searchResult = await driver.searchRecordings(ctx, {
  channelId: '0',
  from: yesterday,
  to: now,
  order: 'DESC',
  limit: 100
});

console.log(`Found ${searchResult.totalCount} segments`);

for (const segment of searchResult.segments) {
  console.log(`  ${segment.startTime} - ${segment.endTime}`);
  console.log(`  Duration: ${segment.durationSeconds}s`);
}
```

### Monitor Storage

```typescript
const storage = await driver.getStorageStatus(ctx);

console.log(`Overall State: ${storage.state}`);
console.log(`Usage: ${storage.usagePercent?.toFixed(1)}%`);

for (const volume of storage.volumes) {
  console.log(`  ${volume.id}: ${volume.state}`);
  console.log(`  Capacity: ${(volume.capacityBytes! / 1024 / 1024 / 1024).toFixed(1)} GB`);
}
```

## Architecture

### Core Concepts

1. **RecorderDriver Interface**: All vendors implement this interface
2. **RecorderContext**: Contains tenant, branch, recorder IDs and endpoint config
3. **Normalized Types**: Vendor responses map to canonical models (StorageVolume, RecorderChannel, etc.)
4. **Health States**: HEALTHY, DEGRADED, FAILED, UNKNOWN (never fabricate data)
5. **Capabilities**: Each driver declares what it can verify

### Vendor vs Protocol

The SDK separates vendor identity from protocol family:

```typescript
{
  vendor: "cp-plus",           // Who made it
  protocolFamily: "dahua-cgi"  // What protocol it speaks
}
```

This handles OEM scenarios where CP PLUS uses Dahua firmware.

### Transport Layer

The HTTP transport provides:

- **Authentication**: Basic, Digest (with challenge/response)
- **Retries**: Exponential backoff for transient failures
- **Timeouts**: Configurable per-request and per-operation
- **Connection Pooling**: Keep-alive connections
- **TLS**: Certificate validation (configurable)
- **Error Normalization**: Vendor errors → canonical error types

### Driver Detection

The detector tries multiple strategies in parallel:

1. **Hikvision ISAPI**: Probe `/ISAPI/System/deviceInfo`
2. **Dahua CGI**: Probe `/cgi-bin/magicBox.cgi?action=getSystemInfo`
3. **ONVIF**: Probe `/onvif/device_service` with SOAP

Returns confidence-scored results with evidence.

## Recording Verification

**CRITICAL**: Recording status is verified from actual archive, not configuration.

```typescript
// ❌ WRONG: Trust recorder config
const config = await getRecordingConfig();
return config.enabled ? "RECORDING" : "NOT_RECORDING";

// ✅ CORRECT: Query actual archive
const segments = await driver.searchRecordings(ctx, {
  channelId: '0',
  from: fiveMinutesAgo,
  to: now,
  limit: 1
});

const latest = segments.segments[0]?.endTime;
const ageSeconds = latest ? (now - latest) / 1000 : Infinity;
return ageSeconds < 120 ? "RECORDING" : "NOT_RECORDING";
```

## Unknown States

The SDK explicitly represents unknown states rather than fabricating data:

```typescript
// ❌ WRONG: Fabricate data when unsure
if (cannotVerifyRecording) {
  return { recording: true, timestamp: new Date() };
}

// ✅ CORRECT: Return UNKNOWN
if (cannotVerifyRecording) {
  return {
    state: "UNKNOWN",
    activelyWriting: false,
    reason: "Archive search unavailable"
  };
}
```

This prevents false positives in compliance monitoring.

## Error Handling

All errors map to canonical types:

```typescript
try {
  const result = await driver.probe(ctx);
} catch (error) {
  if (error instanceof RecorderConnectionError) {
    // Network unreachable
  } else if (error instanceof RecorderAuthenticationError) {
    // Invalid credentials
  } else if (error instanceof RecorderTimeoutError) {
    // Operation timed out
  } else if (error instanceof UnsupportedCapabilityError) {
    // Feature not supported by this vendor
  }
}
```

Errors include:
- **code**: Canonical error code
- **retryable**: Should this be retried?
- **cause**: Original error for debugging

## Integration

### Edge Agent

```typescript
import { DahuaCGIDriver } from '@omsystems/recorder-sdk';

const driver = new DahuaCGIDriver();
const result = await driver.probe(ctx);

// Publish to control plane
await publishRecorderHealth({
  recorderId: ctx.recorderId,
  status: result.status,
  channels: result.channels,
  storage: result.storage
});
```

### Backend

```typescript
import { globalDriverRegistry } from '@omsystems/recorder-sdk';

// Get driver for recorder
const driver = globalDriverRegistry.getDriver(recorder.protocol);

// Verify retention compliance
const oldestRecording = await driver.searchRecordings(ctx, {
  channelId: camera.channelId,
  from: ninetyDaysAgo,
  to: now,
  order: 'ASC',
  limit: 1
});

const retentionDays = differenceInDays(
  now,
  oldestRecording.segments[0]?.startTime
);

if (retentionDays < requiredRetentionDays) {
  return 'VIOLATION';
}
```

### Digital Twin

```typescript
// Update device inventory from driver
const deviceInfo = await driver.getDeviceInfo(ctx);
const channels = await driver.getChannels(ctx);
const storage = await driver.getStorageStatus(ctx);

// Update twin
await digitalTwin.updateRecorder({
  id: ctx.recorderId,
  manufacturer: deviceInfo.manufacturer,
  model: deviceInfo.model,
  firmware: deviceInfo.firmwareVersion,
  channels: channels.map(ch => ({
    id: ch.id,
    name: ch.name,
    connected: ch.connectionState === 'ONLINE'
  })),
  storage: storage.volumes.map(v => ({
    id: v.id,
    type: v.type,
    state: v.state,
    capacityGB: v.capacityBytes! / 1024 / 1024 / 1024
  }))
});
```

## Testing

### Unit Tests

Test parsers with real response fixtures:

```typescript
describe('DahuaCGIDriver', () => {
  it('parses system info', () => {
    const response = loadFixture('dahua/system-info.txt');
    const info = driver.parseSystemInfo(response);
    
    expect(info.model).toBe('DHI-NVR5832-4KS2');
    expect(info.serialNumber).toBe('1234567890');
  });
});
```

### Integration Tests

Test against real hardware:

```typescript
describe('CP PLUS Integration', () => {
  it('probes recorder successfully', async () => {
    const result = await driver.probe(ctx);
    
    expect(result.status).toBe('HEALTHY');
    expect(result.identity?.vendor).toBe('cp-plus');
    expect(result.channels.length).toBeGreaterThan(0);
  });
});
```

## Migration Guide

### From Edge Agent Probe

```typescript
// OLD: Direct HTTP calls
const response = await fetch(
  `${base}/cgi-bin/magicBox.cgi?action=getSystemInfo`,
  { headers: { Authorization: digestAuth } }
);
const text = await response.text();
const model = extractKey(text, 'model');

// NEW: Use driver
const deviceInfo = await driver.getDeviceInfo(ctx);
const model = deviceInfo.model;
```

### From Backend Adapters

```typescript
// OLD: Adapter-specific code
const adapter = new DahuaRecorderAdapter(recorder, connection);
const status = await adapter.getRecordingStatus(channelId);

// NEW: Use canonical driver
const driver = globalDriverRegistry.getDriver(recorder.protocol);
const status = await driver.getRecordingStatus(ctx, channelId);
```

## Performance Considerations

- **Connection Pooling**: HTTP client reuses connections
- **Parallel Queries**: Probe runs checks in parallel when safe
- **Credential Caching**: Digest auth caches challenges
- **Result Pagination**: Archive search supports large result sets
- **Timeout Control**: Per-operation and per-request timeouts

## Roadmap

- [x] Dahua CGI driver
- [x] CP PLUS support (Dahua OEM)
- [x] Hikvision ISAPI driver
- [x] Automatic protocol detection
- [x] Transport layer with Digest auth
- [ ] ONVIF driver
- [ ] Uniview driver
- [ ] Contract test suite
- [ ] Hardware integration tests
- [ ] Telemetry and metrics
- [ ] Driver capability discovery
- [ ] Multi-step search optimization

## License

Proprietary - OmSystems
