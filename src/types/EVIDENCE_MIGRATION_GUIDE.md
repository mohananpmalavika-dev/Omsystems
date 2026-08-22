# Evidence Type System Migration Guide

This guide shows how to migrate existing services to use the universal `Evidence<T>` type system.

---

## Core Principle

**Never invent healthy values.** Always distinguish between:

- ✅ **VERIFIED**: Positive evidence collected and validated
- ❌ **FAILED**: Evidence collection attempted, failure confirmed  
- ❓ **UNKNOWN**: Cannot collect evidence (infrastructure unavailable)
- 🚫 **UNSUPPORTED**: Device/feature doesn't support this capability

---

## Quick Start

```typescript
import { Evidence, verified, failed, unknown, unsupported } from './evidence.types.js';

// Good: Return verified evidence
function checkCamera(): Evidence<{ online: boolean; temp: number }> {
  try {
    const response = await fetch(cameraUrl);
    const data = await response.json();
    
    return verified({
      online: true,
      temp: data.temperature
    }, {
      confidence: 1.0,
      observedAt: new Date()
    });
  } catch (error) {
    return failed('Camera unreachable: ' + error.message);
  }
}

// Bad: Return naked boolean
function checkCameraBad(): boolean {
  // What does 'false' mean?
  // - Camera offline?
  // - Network error?
  // - Camera doesn't support health checks?
  // - We haven't checked yet?
  return false; // ❌ AMBIGUOUS
}
```

---

## Migration Examples

### Example 1: Recording Verification

**Before (ambiguous):**
```typescript
interface RecordingStatus {
  recording: boolean;
  codec?: string;
  fps?: number;
}

// Problem: What does recording=false mean?
// - Not recording?
// - Failed to check?
// - Recorder doesn't exist?
```

**After (explicit):**
```typescript
import { Evidence, RecordingEvidence, verified, failed, unknown } from './evidence.types.js';

async function getRecordingStatus(cameraId: string): Promise<Evidence<RecordingEvidence>> {
  // Check if ffmpeg available
  if (!ffmpegInstalled) {
    return unknown('FFmpeg not installed');
  }
  
  try {
    const result = await ffprobe(streamUrl);
    
    if (result.exitCode !== 0) {
      return failed('Stream unreachable', {
        metadata: { exitCode: result.exitCode }
      });
    }
    
    return verified({
      codec: result.codec,
      resolution: { width: result.width, height: result.height },
      fps: result.fps,
      durationSeconds: result.duration,
    }, {
      confidence: 1.0,
      observedAt: new Date()
    });
  } catch (error) {
    return failed('Recording verification failed: ' + error.message);
  }
}
```

---

### Example 2: TPM Attestation

**Before (dangerous):**
```typescript
interface TPMStatus {
  attestationValid: boolean; // ❌ What if we haven't checked?
}

function getTPMStatus(): TPMStatus {
  // Danger: Returns false even when TPM doesn't exist
  return { attestationValid: false };
}
```

**After (safe):**
```typescript
import { Evidence, TPMAttestationEvidence, verified, failed, unknown, unsupported } from './evidence.types.js';

async function getTPMAttestation(): Promise<Evidence<TPMAttestationEvidence>> {
  // Check if TPM exists
  if (!tpmDevice.exists()) {
    return unsupported('No TPM device detected');
  }
  
  // Check if TPM commands available
  if (!tpm2ToolsInstalled()) {
    return unknown('TPM tools not installed');
  }
  
  try {
    const nonce = generateNonce();
    const quote = await tpm2Quote(nonce);
    
    const valid = await verifyQuote(quote, nonce);
    
    if (!valid) {
      return failed('TPM quote verification failed', {
        metadata: { nonce, quote }
      });
    }
    
    return verified({
      quoteValid: true,
      pcrValues: quote.pcrs,
      attestationKeyValid: true,
      nonceMatched: true,
      signatureValid: true,
    }, {
      confidence: 1.0,
      observedAt: new Date()
    });
  } catch (error) {
    return failed('TPM attestation error: ' + error.message);
  }
}
```

---

### Example 3: Security Dashboard

**Before (fake success):**
```typescript
interface SecurityPosture {
  secureBoot: boolean; // ❌ Hardcoded to true!
  ransomware: boolean; // ❌ Placeholder
  tamper: boolean;     // ❌ Not actually checked
}

function getSecurityPosture(): SecurityPosture {
  return {
    secureBoot: true, // ❌ DANGEROUS: Always returns true
    ransomware: true,
    tamper: true,
  };
}
```

**After (evidence-based):**
```typescript
import { Evidence, SecureBootEvidence, verified, failed, unknown } from './evidence.types.js';

interface SecurityPosture {
  secureBoot: Evidence<SecureBootEvidence>;
  ransomware: Evidence<RansomwareProtectionEvidence>;
  tamper: Evidence<{ protected: boolean; events: number }>;
}

async function getSecurityPosture(): Promise<SecurityPosture> {
  return {
    secureBoot: await checkSecureBoot(),
    ransomware: await checkRansomware(),
    tamper: await checkTamper(),
  };
}

async function checkSecureBoot(): Promise<Evidence<SecureBootEvidence>> {
  try {
    const result = await executeCommand('mokutil --sb-state');
    
    if (result.exitCode !== 0) {
      return unknown('Cannot query Secure Boot state');
    }
    
    const enabled = result.stdout.includes('SecureBoot enabled');
    
    return verified({
      enabled,
      uefiMode: true,
      bootIntegrityVerified: enabled,
      secureBootVariables: {},
    }, {
      confidence: enabled ? 1.0 : 0.9,
      observedAt: new Date()
    });
  } catch (error) {
    return failed('Secure Boot check failed: ' + error.message);
  }
}
```

---

### Example 4: Camera Health

**Before (incomplete):**
```typescript
interface CameraHealth {
  online: boolean;
  temperature?: number; // What if undefined?
}
```

**After (complete):**
```typescript
import { Evidence, CameraHealthEvidence, verified, failed, unknown } from './evidence.types.js';

async function getCameraHealth(cameraId: string): Promise<Evidence<CameraHealthEvidence>> {
  try {
    const startTime = Date.now();
    const response = await fetch(`${cameraUrl}/api/health`, {
      timeout: 5000
    });
    const responseTime = Date.now() - startTime;
    
    if (!response.ok) {
      return failed(`Camera returned ${response.status}`, {
        metadata: { statusCode: response.status }
      });
    }
    
    const data = await response.json();
    
    return verified({
      online: true,
      reachable: true,
      responseTimeMs: responseTime,
      temperature: data.temperature,
      bitrate: data.bitrate,
      frameRate: data.fps,
      resolution: data.resolution,
      errors: data.errors || [],
    }, {
      confidence: data.temperature ? 1.0 : 0.8,
      observedAt: new Date()
    });
  } catch (error) {
    if (error.code === 'ETIMEDOUT') {
      return failed('Camera timeout after 5s');
    }
    
    if (error.code === 'ECONNREFUSED') {
      return failed('Camera connection refused');
    }
    
    return failed('Camera health check failed: ' + error.message);
  }
}
```

---

## Helper Functions

### Checking Evidence State

```typescript
import { isVerified, isLive, isSimulated, isStale } from './evidence.types.js';

const evidence = await getCameraHealth(cameraId);

// Type-safe check if verified
if (isVerified(evidence)) {
  // TypeScript knows evidence.value is non-null here
  console.log('Temperature:', evidence.value.temperature);
}

// Check if from live source
if (!isLive(evidence)) {
  console.warn('Using simulated data');
}

// Check if evidence is stale (older than 5 minutes)
if (isStale(evidence, 5 * 60 * 1000)) {
  console.warn('Evidence is stale, recollecting...');
}
```

### Combining Multiple Evidence Sources

```typescript
import { combineEvidence } from './evidence.types.js';

const camera1Health = await getCameraHealth('cam1');
const camera2Health = await getCameraHealth('cam2');
const camera3Health = await getCameraHealth('cam3');

// Aggregate health (only returns VERIFIED if ALL cameras are healthy)
const overallHealth = combineEvidence(
  [camera1Health, camera2Health, camera3Health],
  (healths) => ({
    online: healths.every(h => h.online),
    avgTemp: healths.reduce((sum, h) => sum + (h.temperature || 0), 0) / healths.length,
    cameras: healths.length,
  })
);

if (isVerified(overallHealth)) {
  console.log('All cameras healthy');
} else {
  console.error('Some cameras unhealthy:', overallHealth.reason);
}
```

---

## UI Integration

### Displaying Evidence States

```typescript
function CameraStatus({ evidence }: { evidence: Evidence<CameraHealthEvidence> }) {
  switch (evidence.state) {
    case 'VERIFIED':
      return (
        <div className="status-healthy">
          <Icon name="check-circle" />
          Online • {evidence.value.temperature}°C
          {evidence.source === 'SIMULATED' && <Badge>Simulated</Badge>}
        </div>
      );
    
    case 'FAILED':
      return (
        <div className="status-failed">
          <Icon name="x-circle" />
          Offline • {evidence.reason}
          <Tooltip>Observed: {evidence.observedAt?.toLocaleString()}</Tooltip>
        </div>
      );
    
    case 'UNKNOWN':
      return (
        <div className="status-unknown">
          <Icon name="help-circle" />
          Unknown • {evidence.reason}
          {!evidence.available && <Badge>Infrastructure Unavailable</Badge>}
        </div>
      );
    
    case 'UNSUPPORTED':
      return (
        <div className="status-unsupported">
          <Icon name="minus-circle" />
          Not Supported • {evidence.reason}
        </div>
      );
  }
}
```

---

## Testing

### Unit Tests

```typescript
import { verified, failed, unknown, unsupported, isVerified } from './evidence.types.js';

describe('CameraHealthCollector', () => {
  it('returns VERIFIED evidence when camera responds', async () => {
    const evidence = await getCameraHealth('cam1');
    
    expect(evidence.state).toBe('VERIFIED');
    expect(evidence.available).toBe(true);
    expect(evidence.source).toBe('LIVE');
    expect(isVerified(evidence)).toBe(true);
    
    if (isVerified(evidence)) {
      expect(evidence.value.online).toBe(true);
      expect(evidence.value.temperature).toBeGreaterThan(0);
    }
  });
  
  it('returns FAILED evidence when camera unreachable', async () => {
    mockFetch.mockRejectedValue(new Error('ETIMEDOUT'));
    
    const evidence = await getCameraHealth('cam1');
    
    expect(evidence.state).toBe('FAILED');
    expect(evidence.value).toBeNull();
    expect(evidence.reason).toContain('timeout');
  });
  
  it('returns UNKNOWN when infrastructure unavailable', async () => {
    mockNetworkAvailable.mockReturnValue(false);
    
    const evidence = await getCameraHealth('cam1');
    
    expect(evidence.state).toBe('UNKNOWN');
    expect(evidence.available).toBe(false);
  });
});
```

### Integration Tests

```typescript
describe('Security Dashboard Integration', () => {
  it('never shows healthy status without verified evidence', async () => {
    const posture = await getSecurityPosture();
    
    // Ensure we're not faking success
    if (posture.secureBoot.state === 'VERIFIED') {
      expect(posture.secureBoot.source).toBe('LIVE');
      expect(posture.secureBoot.observedAt).toBeTruthy();
    }
    
    // Simulated data not allowed in production
    if (process.env.NODE_ENV === 'production') {
      expect(posture.secureBoot.source).not.toBe('SIMULATED');
      expect(posture.ransomware.source).not.toBe('SIMULATED');
      expect(posture.tamper.source).not.toBe('SIMULATED');
    }
  });
});
```

---

## Migration Checklist

- [ ] Define domain-specific evidence types
- [ ] Replace naked values with `Evidence<T>`
- [ ] Update functions to return evidence
- [ ] Add proper error handling (failed/unknown/unsupported)
- [ ] Update UI to handle all evidence states
- [ ] Add unit tests for all evidence states
- [ ] Add integration tests
- [ ] Remove simulated() calls from production code
- [ ] Update API documentation
- [ ] Add monitoring for UNKNOWN/FAILED states

---

## Common Pitfalls

### ❌ Don't: Invent Values

```typescript
// BAD: Returning false when we haven't checked
function isSecure(): boolean {
  return false; // What does this mean?
}
```

### ✅ Do: Return Explicit State

```typescript
// GOOD: Explicit about why we can't verify
function isSecure(): Evidence<{ secure: boolean }> {
  return unknown('Security check not yet implemented');
}
```

### ❌ Don't: Silent Failures

```typescript
// BAD: Catching error and returning fake success
try {
  return await check();
} catch {
  return { online: true }; // ❌ DANGEROUS
}
```

### ✅ Do: Expose Failures

```typescript
// GOOD: Return failed evidence with reason
try {
  const result = await check();
  return verified(result);
} catch (error) {
  return failed('Check failed: ' + error.message);
}
```

---

## Production Safety

### Environment Checks

```typescript
// Prevent simulated data in production
if (process.env.NODE_ENV === 'production') {
  const evidence = await getSecurityPosture();
  
  // Assert no simulated data
  if (evidence.secureBoot.source === 'SIMULATED') {
    throw new Error('SIMULATED evidence detected in production!');
  }
}
```

### Monitoring

```typescript
// Alert on UNKNOWN states
if (evidence.state === 'UNKNOWN') {
  logger.warn('Evidence collection unavailable', {
    collector: 'SecureBootCollector',
    reason: evidence.reason,
    available: evidence.available,
  });
  
  // Increment monitoring counter
  metrics.increment('evidence.unknown', {
    collector: 'SecureBootCollector'
  });
}
```

---

## Benefits

✅ **Type Safety**: TypeScript enforces evidence structure  
✅ **Explicit Failures**: Distinguish between "checked and failed" vs "never checked"  
✅ **Testability**: Easy to mock all evidence states  
✅ **Auditability**: Full provenance tracking  
✅ **Debugging**: Clear reasons for all states  
✅ **Production Safety**: Simulated data blocked in production  

---

## Next Steps

1. Start with new features (use Evidence<T> from day 1)
2. Migrate security-critical services first (TPM, certificates, authentication)
3. Migrate health monitoring services
4. Update dashboards to display all evidence states
5. Add monitoring/alerting for UNKNOWN states
6. Deprecate old non-evidence APIs

---

For questions or migration assistance, see `src/types/evidence.types.ts` for full API documentation.
