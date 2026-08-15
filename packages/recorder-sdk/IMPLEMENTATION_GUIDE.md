# Recorder SDK Implementation Guide

## Overview

This guide explains how to migrate existing recorder integration code to use the canonical Recorder SDK.

## Current Architecture Problems

### Before SDK

Your platform currently has **three different recorder implementations**:

1. **Edge Agent Probe** (`edge-agent/src/monitoring/recorder-probe.ts`)
   - ✅ Working Dahua/CP PLUS CGI implementation
   - ✅ Working Hikvision ISAPI implementation
   - ❌ Isolated, cannot be reused by backend
   
2. **Backend Adapters** (`backend/src/recorders/adapters/`)
   - ❌ Incomplete Dahua implementation
   - ❌ Incomplete Hikvision implementation
   - ❌ Duplicated logic from edge agent
   
3. **Provisioning** (various locations)
   - ❌ Separate vendor detection logic
   - ❌ No shared capability model

### After SDK

**One canonical implementation consumed by all systems:**

```
┌─────────────────────────────────────────┐
│         Recorder SDK Package            │
│  ┌──────────────────────────────────┐   │
│  │ DahuaCGIDriver (Dahua + CP PLUS) │   │
│  │ HikvisionISAPIDriver             │   │
│  │ ONVIFDriver (planned)            │   │
│  └──────────────────────────────────┘   │
└─────────────────────────────────────────┘
            │         │         │
    ┌───────┘         │         └───────┐
    ▼                 ▼                 ▼
Edge Agent       Backend          Digital Twin
  Health         Retention         Inventory
  Polling        Compliance        Updates
```

## Migration Path

### Phase 1: Install SDK (Completed ✅)

The SDK is already created at `packages/recorder-sdk/`.

### Phase 2: Edge Agent Integration

#### Current Code (edge-agent/src/monitoring/recorder-probe.ts)

```typescript
// OLD: Direct HTTP calls with vendor-specific logic
async function probeDahuaFamily(config, base, credentials, timeout) {
  const system = await authenticatedFetch(
    `${base}/cgi-bin/magicBox.cgi?action=getSystemInfo`,
    { method: "GET" },
    credentials,
    timeout
  );
  const text = await system.text();
  const model = key(text, "model");
  // ... more parsing
}
```

#### New Code (using SDK)

```typescript
import { DahuaCGIDriver, setupGlobalRegistry } from '@omsystems/recorder-sdk';

// Setup once at startup
setupGlobalRegistry();

class RecorderHealthCollector {
  private drivers = new Map<string, RecorderDriver>();
  
  async collect(recorder: RecorderConfig) {
    // Get or create driver
    let driver = this.drivers.get(recorder.protocol);
    if (!driver) {
      driver = globalDriverRegistry.getDriver(recorder.protocol);
      this.drivers.set(recorder.protocol, driver);
    }
    
    // Create context
    const ctx: RecorderContext = {
      tenantId: recorder.tenantId,
      branchId: recorder.branchId,
      recorderId: recorder.id,
      endpoint: {
        host: recorder.host,
        port: recorder.port || 80,
        scheme: recorder.ssl ? 'https' : 'http',
        baseUrl: `${recorder.ssl ? 'https' : 'http'}://${recorder.host}:${recorder.port || 80}`
      },
      credentialRef: {
        ref: recorder.credentialId,
        type: 'digest'
      },
      protocol: recorder.protocol
    };
    
    // Probe recorder (replaces all vendor-specific code)
    const result = await driver.probe(ctx, {
      includeStorage: true,
      includeChannels: true
    });
    
    // Return normalized health snapshot
    return {
      recorderId: recorder.id,
      status: result.status,
      model: result.identity?.model,
      firmware: result.identity?.firmwareVersion,
      channels: result.channels.length,
      onlineChannels: result.channels.filter(ch => ch.connectionState === 'ONLINE').length,
      storageState: result.storage?.state,
      storageUsagePercent: result.storage?.usagePercent,
      probedAt: result.probedAt,
      reasonCodes: result.reasonCodes
    };
  }
}
```

#### Benefits

- ✅ Removes 500+ lines of vendor-specific code
- ✅ Automatic protocol detection
- ✅ Built-in retry and error handling
- ✅ Normalized result types
- ✅ Proper UNKNOWN state handling

### Phase 3: Backend Integration

#### Current Code (backend/src/recorders/)

```typescript
// OLD: Incomplete adapter
export class DahuaRecorderAdapter {
  async getRecordingStatus(channelId: string) {
    // Incomplete implementation
    return { status: 'UNKNOWN' };
  }
}
```

#### New Code (using SDK)

```typescript
import { globalDriverRegistry } from '@omsystems/recorder-sdk';
import type { RecorderDriver, RecorderContext } from '@omsystems/recorder-sdk';

export class RecorderService {
  private credentialResolver: CredentialResolver;
  
  constructor(credentialResolver: CredentialResolver) {
    this.credentialResolver = credentialResolver;
  }
  
  /**
   * Create recorder context from database entity
   */
  private async createContext(recorder: Recorder): Promise<RecorderContext> {
    return {
      tenantId: recorder.tenantId,
      branchId: recorder.branchId,
      recorderId: recorder.id,
      endpoint: {
        host: recorder.host,
        port: recorder.port,
        scheme: recorder.useTls ? 'https' : 'http',
        baseUrl: `${recorder.useTls ? 'https' : 'http'}://${recorder.host}:${recorder.port}`
      },
      credentialRef: {
        ref: recorder.credentialId,
        type: recorder.authType as any
      },
      protocol: recorder.protocol
    };
  }
  
  /**
   * Verify retention compliance
   */
  async verifyRetention(
    recorder: Recorder,
    camera: Camera,
    requiredRetentionDays: number
  ): Promise<RetentionStatus> {
    const driver = globalDriverRegistry.getDriver(recorder.protocol);
    const ctx = await this.createContext(recorder);
    
    const now = new Date();
    const retentionWindowStart = new Date(
      now.getTime() - requiredRetentionDays * 86400000
    );
    
    // Search for oldest recording
    const result = await driver.searchRecordings(ctx, {
      channelId: camera.channelId,
      from: retentionWindowStart,
      to: now,
      order: 'ASC',
      limit: 1
    });
    
    if (!result.success || result.segments.length === 0) {
      return {
        status: 'VIOLATION',
        reason: 'No recordings found in retention window',
        availableDays: 0,
        requiredDays: requiredRetentionDays
      };
    }
    
    const oldestRecording = result.segments[0].startTime;
    const availableDays = Math.floor(
      (now.getTime() - oldestRecording.getTime()) / 86400000
    );
    
    return {
      status: availableDays >= requiredRetentionDays ? 'COMPLIANT' : 'VIOLATION',
      reason: availableDays >= requiredRetentionDays 
        ? undefined 
        : `Only ${availableDays} days available`,
      availableDays,
      requiredDays: requiredRetentionDays,
      oldestRecording
    };
  }
  
  /**
   * Get live stream URI
   */
  async getStreamUri(
    recorder: Recorder,
    camera: Camera,
    profile: 'MAIN' | 'SUBSTREAM' = 'MAIN'
  ): Promise<string> {
    const driver = globalDriverRegistry.getDriver(recorder.protocol);
    const ctx = await this.createContext(recorder);
    
    const stream = await driver.getStreamUri(ctx, {
      channelId: camera.channelId,
      profile
    });
    
    return stream.uri;
  }
  
  /**
   * Check if camera is recording
   */
  async isRecording(
    recorder: Recorder,
    camera: Camera
  ): Promise<boolean> {
    const driver = globalDriverRegistry.getDriver(recorder.protocol);
    const ctx = await this.createContext(recorder);
    
    const status = await driver.getRecordingStatus(ctx, camera.channelId);
    
    return status.state === 'RECORDING' && status.activelyWriting;
  }
}
```

#### Benefits

- ✅ Complete implementation (no more stubs)
- ✅ Real recording verification
- ✅ Archive search for retention
- ✅ Shared code with edge agent
- ✅ Consistent error handling

### Phase 4: Digital Twin Integration

```typescript
import { globalDriverRegistry } from '@omsystems/recorder-sdk';

export class RecorderDigitalTwinCollector {
  async updateRecorderInventory(recorder: Recorder) {
    const driver = globalDriverRegistry.getDriver(recorder.protocol);
    const ctx = await this.createContext(recorder);
    
    // Get device information
    const deviceInfo = await driver.getDeviceInfo(ctx);
    const channels = await driver.getChannels(ctx);
    const storage = await driver.getStorageStatus(ctx);
    
    // Update digital twin
    await this.digitalTwin.updateDevice({
      id: recorder.id,
      type: 'recorder',
      manufacturer: deviceInfo.manufacturer,
      model: deviceInfo.model,
      firmwareVersion: deviceInfo.firmwareVersion,
      serialNumber: deviceInfo.serialNumber,
      
      // Relationships
      channels: channels.map(ch => ({
        id: `${recorder.id}:channel:${ch.id}`,
        name: ch.name,
        sourceType: ch.sourceType,
        enabled: ch.enabled
      })),
      
      storage: storage.volumes.map(vol => ({
        id: `${recorder.id}:storage:${vol.id}`,
        type: vol.type,
        state: vol.state,
        capacityBytes: vol.capacityBytes,
        freeBytes: vol.freeBytes
      }))
    });
  }
}
```

### Phase 5: Provisioning Integration

```typescript
import { detectAndCreateDriver } from '@omsystems/recorder-sdk';

export class RecorderProvisioningService {
  /**
   * Auto-detect recorder during onboarding
   */
  async discoverRecorder(
    ipAddress: string,
    credentials: { username: string; password: string }
  ): Promise<DiscoveredRecorder> {
    // Automatic protocol detection
    const { driver, detection } = await detectAndCreateDriver(
      {
        host: ipAddress,
        port: 80,
        scheme: 'http'
      },
      credentials,
      { timeoutMs: 10000 }
    );
    
    console.log(`Detected: ${detection.protocol} (${detection.vendor})`);
    console.log(`Confidence: ${(detection.confidence * 100).toFixed(0)}%`);
    
    // Get device details
    const ctx = this.createContext(ipAddress, credentials, detection.protocol);
    const deviceInfo = await driver.getDeviceInfo(ctx);
    const capabilities = await driver.getCapabilities(ctx);
    const channels = await driver.getChannels(ctx);
    
    return {
      protocol: detection.protocol,
      vendor: detection.vendor,
      model: deviceInfo.model,
      firmware: deviceInfo.firmwareVersion,
      serialNumber: deviceInfo.serialNumber,
      channelCount: channels.length,
      capabilities: {
        recordingSearch: capabilities.recordingSearch.supported,
        storageMonitoring: capabilities.storageTelemetry.supported,
        liveStreaming: capabilities.liveVideo.supported
      },
      detectionEvidence: detection.evidence
    };
  }
}
```

## Key Migration Patterns

### 1. Replace Direct HTTP Calls

```typescript
// ❌ OLD: Direct fetch with manual parsing
const response = await fetch('/cgi-bin/magicBox.cgi?action=getSystemInfo');
const text = await response.text();
const model = text.match(/model=([^\r\n]+)/)?.[1];

// ✅ NEW: Use driver
const deviceInfo = await driver.getDeviceInfo(ctx);
const model = deviceInfo.model;
```

### 2. Replace Vendor Switch Statements

```typescript
// ❌ OLD: Vendor-specific branching everywhere
if (recorder.vendor === 'dahua' || recorder.vendor === 'cp-plus') {
  await probeDahuaCGI(recorder);
} else if (recorder.vendor === 'hikvision') {
  await probeHikvisionISAPI(recorder);
}

// ✅ NEW: Protocol-driven dispatch
const driver = globalDriverRegistry.getDriver(recorder.protocol);
const result = await driver.probe(ctx);
```

### 3. Replace Recording Config Checks

```typescript
// ❌ OLD: Trust configuration (produces false positives)
const config = await getRecordingSchedule(camera);
return { recording: config.enabled };

// ✅ NEW: Verify from archive
const status = await driver.getRecordingStatus(ctx, camera.channelId);
return { 
  recording: status.activelyWriting,
  lastRecordedAt: status.latestRecordingAt
};
```

### 4. Handle Unknown States

```typescript
// ❌ OLD: Fabricate data when unsure
if (!canVerify) {
  return { storage: 'OK', capacity: 100 };
}

// ✅ NEW: Return UNKNOWN
const storage = await driver.getStorageStatus(ctx);
if (storage.state === 'UNKNOWN') {
  return { 
    storage: 'UNKNOWN',
    reason: 'Storage query not supported by this recorder'
  };
}
```

## Testing Strategy

### Unit Tests

Test with fixtures (already created):

```typescript
import { DahuaCGIDriver } from '@omsystems/recorder-sdk';
import fs from 'fs';

describe('DahuaCGIDriver', () => {
  it('parses CP PLUS system info', () => {
    const fixture = fs.readFileSync(
      'packages/recorder-sdk/src/testing/fixtures/cp-plus/system-info.txt',
      'utf-8'
    );
    
    const driver = new DahuaCGIDriver();
    const info = driver['extractKey'](fixture, ['model']);
    
    expect(info).toBe('CP-UNR-4K4162');
  });
});
```

### Contract Tests

Ensure all drivers behave consistently:

```typescript
import { runDriverContractTests } from '@omsystems/recorder-sdk/testing';
import { DahuaCGIDriver } from '@omsystems/recorder-sdk';

runDriverContractTests({
  createDriver: () => new DahuaCGIDriver(),
  createMockContext: () => mockContext,
  skipIntegrationTests: true
});
```

### Integration Tests

Test against real hardware:

```typescript
describe('CP PLUS Integration', () => {
  it('verifies recording on actual recorder', async () => {
    const driver = new DahuaCGIDriver();
    const ctx = createRealContext(); // Real CP PLUS recorder
    
    const status = await driver.getRecordingStatus(ctx, '0');
    
    expect(status.state).toMatch(/RECORDING|NOT_RECORDING/);
    expect(typeof status.activelyWriting).toBe('boolean');
    
    if (status.latestRecordingAt) {
      expect(status.latestRecordingAt).toBeInstanceOf(Date);
      expect(status.latestRecordingAt.getTime()).toBeLessThan(Date.now());
    }
  });
});
```

## Deployment Checklist

### Phase 1: Package Setup
- [x] Create recorder-sdk package
- [x] Implement Dahua/CP PLUS driver
- [x] Implement Hikvision driver
- [x] Create test fixtures
- [x] Write contract tests

### Phase 2: Edge Agent Migration
- [ ] Update recorder-probe.ts to use SDK
- [ ] Replace vendor-specific probes with driver.probe()
- [ ] Update health snapshot format
- [ ] Test with real CP PLUS recorder
- [ ] Deploy to development branch

### Phase 3: Backend Migration
- [ ] Replace incomplete adapters with SDK drivers
- [ ] Update RecorderService to use SDK
- [ ] Update retention compliance checks
- [ ] Update stream URI resolution
- [ ] Test retention verification

### Phase 4: Digital Twin Integration
- [ ] Create RecorderDigitalTwinCollector
- [ ] Update device inventory from driver
- [ ] Link channels to cameras
- [ ] Link storage volumes to recorder
- [ ] Schedule periodic updates

### Phase 5: Provisioning
- [ ] Add auto-detection to onboarding flow
- [ ] Show detection confidence to user
- [ ] Pre-fill device information
- [ ] Validate capabilities before saving

## Performance Considerations

### Connection Pooling

The SDK HTTP client uses connection pooling:

```typescript
// Connections are reused automatically
const driver = new DahuaCGIDriver();

// First request creates connection
await driver.getDeviceInfo(ctx);

// Subsequent requests reuse connection
await driver.getChannels(ctx);
await driver.getStorageStatus(ctx);
```

### Parallel Operations

Probe runs safe operations in parallel:

```typescript
// These run concurrently:
const result = await driver.probe(ctx, {
  includeStorage: true,
  includeChannels: true
});
// - Device info
// - Storage status
// - Channel enumeration
```

### Credential Caching

Digest authentication caches challenges:

```typescript
// First request: 401 challenge + retry
await driver.getDeviceInfo(ctx);

// Subsequent requests: use cached challenge
await driver.getChannels(ctx); // No extra round-trip
```

## Troubleshooting

### "Unsupported protocol" error

```typescript
// Error: UnsupportedProtocolError: hikvision-isapi
setupGlobalRegistry(); // ← Missing!
```

**Fix**: Call `setupGlobalRegistry()` at startup.

### "Credentials not found" error

```typescript
// Error: Credentials not found: cred-123
```

**Fix**: Configure credential resolver:

```typescript
const resolver = new InMemoryCredentialResolver();
resolver.store('cred-123', 'tenant-1', {
  username: 'admin',
  password: 'password'
});

httpClient.setCredentialResolver(resolver);
```

### Recording status always "UNKNOWN"

**Cause**: Archive search is failing.

**Fix**: Check recorder supports recording search:

```typescript
const capabilities = await driver.getCapabilities(ctx);
if (!capabilities.recordingSearch.supported) {
  console.warn('Recorder does not support archive search');
}
```

### Storage status returns empty volumes

**Cause**: Storage endpoint might be different.

**Fix**: Some recorders use alternate paths:

```typescript
// For Dahua: try /cgi-bin/storage.cgi if default fails
```

## Next Steps

1. **Review this guide** with the team
2. **Run contract tests** against existing recorders
3. **Start with edge agent** (lowest risk)
4. **Then migrate backend** (benefits from shared code)
5. **Finally add Digital Twin** (relies on normalized data)

## Support

Questions? Check:
- SDK README: `packages/recorder-sdk/README.md`
- Contract tests: `packages/recorder-sdk/src/testing/driver-contract-tests.ts`
- Example fixtures: `packages/recorder-sdk/src/testing/fixtures/`
