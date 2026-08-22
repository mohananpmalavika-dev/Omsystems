# Security Evidence Implementation

## Critical Security Fix

### The Problem

The security dashboard contained dangerously optimistic placeholders:

```typescript
collectors: {
  secureBoot: true, // Placeholder
  ransomware: true, // Placeholder
  tamper: true, // Placeholder
}
```

This pattern was a **security correctness bug** that converted missing evidence into false health indicators:

```
no evidence
   ↓
placeholder
   ↓
true
   ↓
dashboard says secure
```

This is the exact opposite of what a security control should do.

### The Fix

We've implemented a provenance-based security evidence system that makes it **impossible at the TypeScript level** for collectors to return naked booleans.

## Core Principle

```
missing evidence ≠ healthy
missing evidence = UNKNOWN
```

## Architecture

### 1. Type-Safe Evidence System (`security-evidence-types.ts`)

**Discriminated Union Design**

The evidence types use TypeScript discriminated unions to enforce semantic invariants:

```typescript
export type SecurityEvidence<T = unknown> =
  | HealthyEvidence<T>
  | UnhealthyEvidence<T>
  | UnknownEvidence;
```

**Each state has strict constraints:**

- `HEALTHY`: MUST have `available: true`, `source: 'LIVE'`, and actual evidence data
- `UNHEALTHY`: MUST have `available: true`, `source: 'LIVE'`, and failure proof
- `UNKNOWN`: MUST have `available: false`, CANNOT have evidence data

**This makes invalid states impossible:**

```typescript
// ❌ TypeScript compilation error
const invalid: SecurityEvidence = {
  state: 'HEALTHY',
  available: false,  // ERROR: HEALTHY requires available: true
  source: 'UNAVAILABLE',
  ...
};
```

### 2. Factory Functions

Safe constructors prevent contradictory combinations:

```typescript
// ✅ Valid healthy evidence
healthyEvidence(attestationData, new Date(), 1.0);

// ✅ Valid failure evidence
unhealthyEvidence(failureData, new Date(), 0.9);

// ✅ Valid unknown evidence
unknownEvidence('NOT_CONFIGURED');

// ❌ Cannot construct invalid state
// The type system rejects this at compile time
```

### 3. Collector Interface

Collectors MUST implement evidence-based interfaces:

```typescript
export interface SecureBootCollector {
  collectSecureBootEvidence(
    context: SecurityCollectionContext
  ): Promise<SecurityEvidence<SecureBootEvidenceData>>;
}
```

**This becomes a compile-time error:**

```typescript
// ❌ TypeScript error: Type 'boolean' is not assignable to type 'SecurityEvidence'
async collectSecureBootEvidence() {
  return true;  // REJECTED BY TYPE SYSTEM
}
```

**The developer must explicitly return:**

```typescript
// ✅ Correct: explicit unknown state
async collectSecureBootEvidence() {
  return unknownEvidence('NOT_CONFIGURED');
}
```

### 4. Safety Layers

**Freshness Enforcement**

Evidence automatically becomes UNKNOWN when stale:

```typescript
const staleEvidence = enforceFreshness(
  evidence,
  FRESHNESS_POLICY.secureBoot
);
// If too old: state → 'UNKNOWN', reason → 'STALE_EVIDENCE'
```

**Environment Validation**

Simulated data NEVER becomes production-trusted:

```typescript
const validated = evaluateEvidenceSource(
  evidence,
  'production'
);
// If source === 'SIMULATED': state → 'UNKNOWN'
```

**Failure-Closed Collection**

All collector failures convert to UNKNOWN:

```typescript
try {
  return await collector.collect();
} catch (error) {
  // NEVER return HEALTHY on failure
  return unknownEvidence('COLLECTOR_UNAVAILABLE');
}
```

### 5. Aggregation Logic

**Three-valued logic** prevents unknown states from becoming healthy:

```typescript
function aggregateSecurityState(controls: SecurityEvidence[]): SecurityState {
  // Priority: UNHEALTHY > UNKNOWN > HEALTHY
  if (controls.some(c => c.state === 'UNHEALTHY')) return 'UNHEALTHY';
  if (controls.some(c => c.state === 'UNKNOWN')) return 'UNKNOWN';
  return 'HEALTHY';
}
```

**Result:**

- `[HEALTHY, HEALTHY, UNKNOWN]` → `UNKNOWN` (not HEALTHY)
- `[HEALTHY, UNHEALTHY, UNKNOWN]` → `UNHEALTHY`
- `[HEALTHY, HEALTHY, HEALTHY]` → `HEALTHY` (only if all verified)

### 6. Evidence Coverage Metric

Separately tracks what percentage of controls have live evidence:

```typescript
evidenceCoverage: 0.67  // 67% of controls have live data
```

This prevents scenarios where:
- Security score: 98%
- Evidence coverage: 42%  // ⚠️ Most collectors unavailable!

## Implementation Files

### Core Types
- `src/security/evidence/security-evidence-types.ts` - Type-safe evidence system

### Service Layer
- `src/security/services/security-posture.service.ts` - Evidence aggregation with safety wrappers

### Collectors
- `src/security/collectors/secure-boot-evidence.collector.ts` - Secure boot attestation
- `src/security/collectors/ransomware-evidence.collector.ts` - Ransomware protection status
- `src/security/collectors/tamper-evidence.collector.ts` - Tamper detection and conditions

### API Integration
- `src/routes/security-dashboard.routes.ts` - Evidence-based dashboard endpoint (fixed)

## API Response Format

### Before (Dangerous)

```json
{
  "collectors": {
    "secureBoot": true,
    "ransomware": true,
    "tamper": true
  }
}
```

### After (Safe)

```json
{
  "deviceSecurity": {
    "overall": {
      "state": "UNKNOWN",
      "evidenceCoverage": 0.25,
      "evaluatedAt": "2026-08-12T00:30:00.000Z"
    },
    "controls": {
      "secureBoot": {
        "state": "HEALTHY",
        "available": true,
        "source": "LIVE",
        "confidence": 1.0,
        "observedAt": "2026-08-12T00:29:47.000Z",
        "reason": "VERIFIED",
        "evidence": { /* actual attestation data */ }
      },
      "ransomwareProtection": {
        "state": "UNKNOWN",
        "available": false,
        "source": "UNAVAILABLE",
        "confidence": 0,
        "observedAt": null,
        "reason": "NOT_CONFIGURED"
      },
      "tamperProtection": {
        "state": "UNKNOWN",
        "available": false,
        "source": "UNAVAILABLE",
        "confidence": 0,
        "observedAt": null,
        "reason": "NOT_SUPPORTED"
      },
      "tamperCondition": {
        "state": "UNKNOWN",
        "available": false,
        "source": "UNAVAILABLE",
        "confidence": 0,
        "observedAt": null,
        "reason": "NOT_SUPPORTED"
      }
    },
    "summary": {
      "healthyControls": 1,
      "unhealthyControls": 0,
      "unknownControls": 3,
      "totalControls": 4
    }
  }
}
```

## UI Guidance

The frontend MUST distinguish between states:

```typescript
switch (control.state) {
  case 'HEALTHY':
    return <HealthyBadge />; // ✓ Verified
    
  case 'UNHEALTHY':
    return <UnhealthyBadge />; // ✗ Failed
    
  case 'UNKNOWN':
    return <UnknownBadge reason={control.reason} />; // ? Unknown
}
```

**Never collapse UNKNOWN into healthy:**

```typescript
// ❌ WRONG - recreates the backend bug in UI
const healthy = control.state !== 'UNHEALTHY';

// ✅ CORRECT - preserve three states
const isHealthy = control.state === 'HEALTHY';
const isUnhealthy = control.state === 'UNHEALTHY';
const isUnknown = control.state === 'UNKNOWN';
```

## Configuration

### Environment Variables

- `EDR_API_ENDPOINT` - Ransomware protection API (if not set → UNKNOWN)
- `THREAT_DETECTION_API` - Alternative threat detection API
- `EDGE_AGENT_API` - Tamper sensor API (if not set → UNKNOWN)
- `TAMPER_SENSOR_API` - Alternative tamper sensor API
- `NODE_ENV` - `production` enforces strict simulated-data rejection

### Freshness Policies

```typescript
export const FRESHNESS_POLICY = {
  secureBoot: 24 * 60 * 60 * 1000,           // 24 hours
  ransomwareProtection: 5 * 60 * 1000,       // 5 minutes
  tamperProtection: 60 * 1000,               // 1 minute
  tamperCondition: 60 * 1000,                // 1 minute
};
```

Adjust these based on operational requirements.

## Production Deployment

### Pre-Deployment Checklist

1. ✅ No `return true` in security collector code
2. ✅ All collectors return `SecurityEvidence<T>`
3. ✅ Simulated evidence flagged with `source: 'SIMULATED'`
4. ✅ Production environment validation enabled
5. ✅ Freshness policies configured
6. ✅ Frontend handles UNKNOWN state display
7. ✅ Monitoring alerts on evidence coverage drops

### Runtime Validation

The system includes runtime checks:

```typescript
// In production, simulated evidence → UNKNOWN
if (environment === 'production' && evidence.source === 'SIMULATED') {
  return unknownEvidence('SIMULATED_DATA');
}
```

### Startup Checks

Consider adding startup validation:

```typescript
if (
  config.environment === 'production' &&
  collector.isSimulated()
) {
  throw new Error(
    'Simulated security collector cannot be enabled in production'
  );
}
```

## Testing

### Unit Tests

Test the three-valued truth table:

```typescript
test('aggregation preserves UNKNOWN', () => {
  const controls = [
    healthyEvidence({}, new Date()),
    healthyEvidence({}, new Date()),
    unknownEvidence('NOT_CONFIGURED'),
  ];
  
  expect(aggregateSecurityState(controls)).toBe('UNKNOWN');
});
```

### Integration Tests

```typescript
test('collector failures return UNKNOWN, not HEALTHY', async () => {
  secureBootCollector.collect.mockRejectedValue(
    new Error('TPM unavailable')
  );

  const posture = await service.getDevicePosture(context);

  expect(posture.secureBoot.state).toBe('UNKNOWN');
  expect(posture.secureBoot.reason).toBe('COLLECTOR_UNAVAILABLE');
});
```

## Next Steps

### Phase 1: Immediate (Complete)
- ✅ Remove boolean placeholders
- ✅ Implement evidence types
- ✅ Fix security-dashboard routes
- ✅ Create evidence-based collectors

### Phase 2: Production Integration
- [ ] Integrate real TPM attestation API
- [ ] Connect to EDR/antivirus console API
- [ ] Implement edge agent tamper sensor queries
- [ ] Add evidence persistence layer

### Phase 3: Operational Maturity
- [ ] Evidence transition logging
- [ ] Alerting on evidence coverage drops
- [ ] Separate UNKNOWN telemetry alerts from UNHEALTHY security alerts
- [ ] Dashboard widgets for evidence freshness
- [ ] Compliance reporting with provenance tracking

## References

This implementation follows the security-correctness principles outlined in the original security audit, ensuring that:

1. **Type safety** prevents returning raw booleans
2. **Factory functions** prevent contradictory state combinations
3. **Discriminated unions** make invalid states impossible
4. **Failure-closed design** converts all errors to UNKNOWN
5. **Environment validation** rejects simulated production data
6. **Freshness enforcement** downgrades stale evidence
7. **Three-valued aggregation** preserves uncertainty

The result is a security dashboard that **can be trusted** because it cannot lie about missing evidence.
