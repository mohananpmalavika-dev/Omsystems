# Security Evidence System

## Overview

This directory contains the **provenance-based security evidence system** that fixes the critical security bug where missing evidence was converted to "secure" status.

## The Problem We Solved

**Original Bug (src/routes/security-dashboard.routes.ts:90-92):**

```typescript
collectors: {
  secureBoot: true, // Placeholder ❌
  ransomware: true, // Placeholder ❌
  tamper: true, // Placeholder ❌
}
```

This pattern was **dangerously optimistic** because it converted:

```
no evidence → placeholder → true → "secure" status
```

The dashboard would show "secure" even when:
- No TPM was available
- No EDR agent was installed
- No tamper sensors existed
- Collectors had never run
- All evidence collection had failed

## The Solution

We implemented a **type-safe evidence system** that makes it **impossible** to return naked booleans from security collectors.

### Core Principle

```
missing evidence ≠ healthy
missing evidence = UNKNOWN
```

## Architecture

### Type System

**Three-state discriminated union:**

```typescript
type SecurityEvidence<T> =
  | HealthyEvidence<T>   // MUST have live data + proof
  | UnhealthyEvidence<T> // MUST have live data + failure proof
  | UnknownEvidence;     // MUST NOT have proof data
```

**Factory functions prevent invalid states:**

```typescript
// ✅ Valid
healthyEvidence(attestationData, new Date(), 1.0);
unhealthyEvidence(failureData, new Date(), 0.9);
unknownEvidence('NOT_CONFIGURED');

// ❌ TypeScript compile error
return true;  // Type 'boolean' is not assignable to type 'SecurityEvidence'
```

### Safety Layers

1. **Compile-time:** Type system rejects boolean returns
2. **Collection-time:** Failures convert to UNKNOWN
3. **Validation-time:** Runtime validator catches invalid states
4. **Aggregation-time:** Three-valued logic preserves uncertainty
5. **Environment-time:** Simulated data rejected in production
6. **Temporal-time:** Stale evidence downgraded to UNKNOWN

## Directory Structure

```
src/security/evidence/
├── security-evidence-types.ts          # Core type system and factories
├── evidence-validator.ts               # Runtime validation
├── evidence-persistence.ts             # Database persistence layer
├── security-capability-integration.ts  # Capability catalog integration
├── startup-validation.ts               # Startup validation system
├── .eslintrc.security.json            # Linting rules to prevent regressions
├── migrations/
│   └── 001_security_evidence_tables.sql  # Database schema
├── __tests__/
│   └── security-evidence.test.ts       # Comprehensive test suite
├── README.md                           # This file
├── SECURITY_EVIDENCE_IMPLEMENTATION.md # Detailed implementation guide
├── FRONTEND_INTEGRATION_GUIDE.md       # Frontend integration patterns
└── STARTUP_INTEGRATION_EXAMPLE.md      # Startup validation examples
```

## Key Files

### Core Types (`security-evidence-types.ts`)

Exports:
- `SecurityEvidence<T>` - Discriminated union type
- `healthyEvidence()` - Create healthy evidence
- `unhealthyEvidence()` - Create failure evidence
- `unknownEvidence()` - Create unknown evidence
- `enforceFreshness()` - Apply staleness policies
- `evaluateEvidenceSource()` - Validate environment constraints
- `aggregateSecurityState()` - Three-valued aggregation
- `calculateEvidenceCoverage()` - Coverage metrics

### Collectors

Located in `src/security/collectors/`:
- `secure-boot-evidence.collector.ts` - TPM attestation
- `ransomware-evidence.collector.ts` - EDR status
- `tamper-evidence.collector.ts` - Tamper detection

Each implements:
```typescript
interface SecurityCollector<T> {
  collect(context: SecurityCollectionContext): Promise<SecurityEvidence<T>>;
  getHealth(): Promise<{ available: boolean; ... }>;
}
```

### Service Layer (`src/security/services/security-posture.service.ts`)

Aggregates evidence from collectors with:
- Failure-closed collection (errors → UNKNOWN)
- Freshness enforcement
- Environment validation
- Three-valued aggregation

### Persistence (`evidence-persistence.ts`)

Stores:
- Evidence snapshots for audit trails
- State transitions for incident investigation
- Historical data for compliance reporting

### Validation (`evidence-validator.ts`)

Runtime checks for:
- Structural validity
- Semantic correctness
- Production constraints
- Invalid state combinations

### Startup Validation (`startup-validation.ts`)

Pre-deployment checks:
- Collector configuration
- Environment variables
- Production constraints
- Required capabilities
- Coverage thresholds

## Usage

### Basic Collector Implementation

```typescript
import {
  SecurityCollector,
  SecurityEvidence,
  SecureBootEvidenceData,
  healthyEvidence,
  unhealthyEvidence,
  unknownEvidence,
} from '../evidence/security-evidence-types.js';

export class MySecurityCollector implements SecurityCollector<MyEvidenceData> {
  async collect(context: SecurityCollectionContext): Promise<SecurityEvidence<MyEvidenceData>> {
    try {
      const data = await this.collectData();
      
      if (!data) {
        return unknownEvidence('NO_EVIDENCE');
      }

      if (data.isHealthy) {
        return healthyEvidence(data, new Date(), 1.0);
      }

      return unhealthyEvidence(data, new Date(), 0.9);
    } catch (error) {
      return unknownEvidence('COLLECTOR_UNAVAILABLE');
    }
  }

  async getHealth() {
    return {
      available: true,
      lastCollection: this.lastCollection,
      errorCount: this.errorCount,
      lastError: this.lastError,
    };
  }

  private async collectData(): Promise<MyEvidenceData | null> {
    // Your collection logic here
    return null;
  }
}
```

### Service Integration

```typescript
import { SecurityPostureService } from '../services/security-posture.service.js';

const service = new SecurityPostureService(
  { environment: 'production', enforceStrictness: true },
  secureBootCollector,
  ransomwareCollector,
  tamperProtectionCollector,
  tamperConditionCollector,
);

// Get device posture
const posture = await service.getDevicePosture({ timestamp: new Date() });

// Get summary
const summary = await service.getPostureSummary({ timestamp: new Date() });
```

### API Response

```typescript
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
      }
    }
  }
}
```

## Configuration

### Environment Variables

```bash
# Ransomware protection
EDR_API_ENDPOINT=https://edr-console.company.com
THREAT_DETECTION_API=https://threat-api.company.com

# Tamper detection
EDGE_AGENT_API=https://edge-agents.company.com
TAMPER_SENSOR_API=https://sensors.company.com

# Environment
NODE_ENV=production  # Enforces strict validation
```

### Freshness Policies

Edit `FRESHNESS_POLICY` in `security-evidence-types.ts`:

```typescript
export const FRESHNESS_POLICY = {
  secureBoot: 24 * 60 * 60 * 1000,           // 24 hours
  ransomwareProtection: 5 * 60 * 1000,       // 5 minutes
  tamperProtection: 60 * 1000,               // 1 minute
  tamperCondition: 60 * 1000,                // 1 minute
};
```

## Testing

### Run Tests

```bash
# Run evidence type tests
npm test src/security/evidence/__tests__/security-evidence.test.ts

# Run posture service tests
npm test src/security/services/__tests__/security-posture.test.ts

# Run all security tests
npm test -- --testPathPattern=security
```

### Validate Startup

```bash
# Development
npm run validate:security

# Production
NODE_ENV=production npm run validate:security
```

## Deployment

### Pre-Deployment Checklist

- [ ] No `return true` in security collectors
- [ ] All collectors return `SecurityEvidence<T>`
- [ ] Simulated evidence properly flagged
- [ ] Environment variables configured
- [ ] Database migration applied
- [ ] Startup validation passes
- [ ] ESLint rules active

### Startup Validation

Add to `src/index.ts`:

```typescript
import { validateSecurityOnStartup } from './security/evidence/startup-validation.js';

async function main() {
  // CRITICAL: Validate before starting server
  await validateSecurityOnStartup({
    environment: process.env.NODE_ENV as any,
    strictMode: process.env.NODE_ENV === 'production',
    failOnError: true,
  });

  // Start server...
}
```

## Monitoring

### Key Metrics

- **Evidence Coverage:** Percentage of controls with live evidence
- **State Transitions:** HEALTHY → UNHEALTHY, HEALTHY → UNKNOWN, etc.
- **Collector Health:** Error counts, last collection times
- **Stale Evidence:** Controls with outdated evidence

### Alerts

```
Alert: Low Evidence Coverage
  Trigger: coverage < 0.5
  Severity: Warning
  Action: Review collector configuration

Alert: Security Degradation
  Trigger: transition_type = 'degradation'
  Severity: Critical
  Action: Immediate investigation

Alert: Telemetry Loss
  Trigger: transition_type = 'telemetry_loss'
  Severity: Warning
  Action: Check collector health
```

## ESLint Rules

The `.eslintrc.security.json` file prevents regressions by:

1. Rejecting boolean returns from security functions
2. Flagging boolean literals in security properties
3. Requiring explicit return types in collectors
4. Enforcing complexity limits

To enable:

```json
// .eslintrc.json
{
  "extends": ["./src/security/evidence/.eslintrc.security.json"]
}
```

## Migration from Old Code

### Before (Dangerous)

```typescript
// ❌ OLD CODE
secureBoot: true,
ransomware: true,
tamper: true,
```

### After (Safe)

```typescript
// ✅ NEW CODE
secureBoot: await secureBootCollector.collect(context),
ransomwareProtection: await ransomwareCollector.collect(context),
tamperProtection: await tamperCollector.collect(context),
```

## Documentation

- **[SECURITY_EVIDENCE_IMPLEMENTATION.md](./SECURITY_EVIDENCE_IMPLEMENTATION.md)** - Detailed architecture and implementation
- **[FRONTEND_INTEGRATION_GUIDE.md](./FRONTEND_INTEGRATION_GUIDE.md)** - Frontend UI patterns and integration
- **[STARTUP_INTEGRATION_EXAMPLE.md](./STARTUP_INTEGRATION_EXAMPLE.md)** - Startup validation examples
- **[../../../SECURITY_EVIDENCE_FIX_SUMMARY.md](../../../SECURITY_EVIDENCE_FIX_SUMMARY.md)** - Executive summary

## Contributing

When adding new security collectors:

1. Implement `SecurityCollector<T>` interface
2. Return `SecurityEvidence<T>`, never booleans
3. Use factory functions (`healthyEvidence`, `unhealthyEvidence`, `unknownEvidence`)
4. Add tests for all three states
5. Document evidence data structure
6. Add to capability catalog
7. Update startup validation

## Troubleshooting

### Issue: Collector Returning Boolean

**Error:**
```
Type 'boolean' is not assignable to type 'SecurityEvidence<T>'
```

**Fix:**
```typescript
// ❌ Wrong
return true;

// ✅ Correct
return unknownEvidence('NOT_CONFIGURED');
```

### Issue: Validation Fails in Production

**Check:**
1. Environment variables set?
2. Endpoints reachable?
3. Credentials valid?
4. Review startup validation logs

### Issue: Low Coverage Warning

**Actions:**
1. Review unavailable capabilities
2. Configure missing environment variables
3. Deploy required collectors
4. Update capability requirements if intentional

## References

- Original security audit findings
- TypeScript discriminated unions documentation
- Three-valued logic principles
- Evidence-based security design patterns

## Summary

This evidence system ensures:

✅ **Type safety** - Cannot return raw booleans  
✅ **Failure safety** - Errors → UNKNOWN, never HEALTHY  
✅ **Environmental safety** - Simulated data rejected in production  
✅ **Temporal safety** - Stale evidence → UNKNOWN  
✅ **Aggregation safety** - Uncertainty preserved  
✅ **Operational visibility** - Evidence coverage tracked  
✅ **Audit trails** - State transitions logged  
✅ **Startup validation** - Configuration verified  

The security dashboard can now be **trusted** because it cannot lie about missing evidence.
