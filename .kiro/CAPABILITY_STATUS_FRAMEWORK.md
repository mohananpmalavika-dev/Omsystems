# Sentinel Grid — Canonical Capability Truth System

**Status**: ✅ CONSOLIDATED & AUTHORITATIVE  
**Priority**: P0  
**Canonical Contracts**: `packages/contracts/src/capabilities/capability-types.ts`  
**Master Matrix**: `config/capabilities/platform-capabilities.ts`  
**API Endpoints**: `/v1/capabilities`, `/api/v1/capabilities`  
**Admin UI**: `/admin/platform/capabilities`  

---

## 1. Authoritative Separation of Concerns

The Sentinel Grid Capability Truth System cleanly decouples three independent concepts:

1. **Product Maturity** (`CapabilityMaturity`):
   - `PRODUCTION`: Fully implemented backend, persistence, verified APIs, automated test coverage.
   - `BETA`: Coded and functional core path, active refinement or partial test automation.
   - `EXPERIMENTAL`: Early research, prototype models, guarded behind opt-in flags.
   - `NOT_IMPLEMENTED`: Architectural stub or planned feature; zero production execution paths.

2. **Runtime State** (`CapabilityRuntimeState`):
   - `HEALTHY` | `DEGRADED` | `DOWN` | `NOT_CONFIGURED` | `DISABLED` | `UNKNOWN`

3. **Device Support** (`DeviceCapabilityState`):
   - `SUPPORTED` | `UNSUPPORTED` | `DEGRADED` | `UNKNOWN`

---

## 2. Fail-Closed Release Invariant

- **Fail-Closed Rule**: Whenever evidence is ambiguous, incomplete, or unverified: **DOWNGRADE, DO NOT UPGRADE**.
- **No Deceptive Placeholders**: Features marked `NOT_IMPLEMENTED` fail closed (404 / disabled) and never simulate mock production success.


```
CapabilityRegistry
    ↓
SYSTEM_CAPABILITIES (definitions)
    ↓
Health Checks
    ↓
API Endpoints
    ↓
Frontend UI Badges
```

---

## Capability Definitions

### Total: 57 Capabilities

**By Tier:**
- **REAL**: 23 capabilities (40.4% implementation rate)
- **READY**: 4 capabilities
- **PLANNED**: 30 capabilities
- **Readiness Rate**: 47.4% (REAL + READY)

**By Category:**
- **Security**: 11 capabilities (3 REAL, 8 PLANNED)
- **Analytics**: 12 capabilities (3 REAL, 1 READY, 8 PLANNED)
- **Infrastructure**: 10 capabilities (8 REAL, 1 READY, 1 PLANNED)
- **Operations**: 10 capabilities (4 REAL, 2 READY, 4 PLANNED)
- **Integration**: 14 capabilities (5 REAL, 9 PLANNED)

---

## REAL Capabilities (Fully Operational)

### Security (3)
1. ✅ Certificate Monitoring
2. ✅ Password Rotation Tracking
3. ✅ MFA Compliance Monitoring
4. ✅ Secret Vault with Access Control
5. ✅ Comprehensive Audit Logging
6. ✅ Role-Based Access Control (RBAC)

### Analytics (3)
7. ✅ Person Detection
8. ✅ Motion Detection
9. ✅ Camera Health Monitoring

### Infrastructure (8)
10. ✅ ONVIF Camera Discovery
11. ✅ DVR/NVR Integration
12. ✅ Recording Management
13. ✅ HLS Live Streaming
14. ✅ Storage Health Monitoring
15. ✅ Distributed Event Bus (Redis)
16. ✅ Edge Agent Deployment
17. ✅ Multi-Tenant Architecture

### Operations (4)
18. ✅ Alert Management System
19. ✅ Multi-Channel Notification
20. ✅ Backend Alert Counters (with Redis caching)
21. ✅ Evidence Capture System

### Integration (5)
22. ✅ Webhook Integration
23. ✅ Comprehensive REST API
24. ✅ Server-Sent Events (SSE)

---

## READY Capabilities (Code Complete, Configuration Pending)

### Analytics (1)
25. 🟡 Generic Object Detection

### Infrastructure (1)
26. 🟡 High Availability Deployment

### Operations (2)
27. 🟡 Alert Correlation Engine
28. 🟡 Incident Management

---

## PLANNED Capabilities (UI Exists, Backend Mock/Incomplete)

### Security (8)
- 🔴 TPM Device Attestation
- 🔴 Physical Tamper Detection
- 🔴 Ransomware Detection
- 🔴 Firmware Integrity Verification
- 🔴 SIEM Integration

### Analytics (8)
- 🔴 Face Recognition
- 🔴 License Plate Recognition (ANPR)
- 🔴 Crowd Density Analysis
- 🔴 Behavioral Analysis
- 🔴 Fall Detection
- 🔴 PPE/Helmet Detection
- 🔴 Activity Heatmap Generation
- 🔴 Person Re-Identification

### Infrastructure (1)
- 🔴 Disaster Recovery

### Operations (4)
- 🔴 On-Call Management
- 🔴 SLA Tracking and Enforcement
- 🔴 Operator Workload Balancing
- 🔴 Maintenance Windows

### Integration (9)
- 🔴 SAML Single Sign-On
- 🔴 OpenID Connect (OIDC)
- 🔴 LDAP/Active Directory
- 🔴 SCIM User Provisioning
- 🔴 GraphQL API

---

## API Endpoints

All endpoints return:
```json
{
  "success": true,
  "data": { ... },
  "timestamp": "2024-08-10T12:00:00.000Z"
}
```

### 1. GET `/v1/capabilities`
Get all capabilities with current status and health checks.

**Response:**
```json
{
  "capabilities": [
    {
      "id": "security.certificate_monitoring",
      "name": "Certificate Monitoring",
      "category": "security",
      "tier": "REAL",
      "status": "active",
      "description": "Real-time TLS certificate expiry monitoring",
      "metadata": {
        "version": "1.0.0",
        "confidence": 100
      },
      "check": {
        "capabilityId": "security.certificate_monitoring",
        "tier": "REAL",
        "status": "active",
        "available": true,
        "checkedAt": "2024-08-10T12:00:00.000Z"
      }
    }
  ],
  "summary": {
    "total": 57,
    "byTier": { "REAL": 23, "READY": 4, "PLANNED": 30 },
    "byStatus": { "active": 23, "inactive": 4, "unavailable": 30 },
    "available": 23,
    "unavailable": 34
  }
}
```

### 2. GET `/v1/capabilities/summary`
Get summary statistics only.

**Response:**
```json
{
  "total": 57,
  "byTier": { "REAL": 23, "READY": 4, "PLANNED": 30 },
  "byStatus": { "active": 23, "inactive": 4, "unavailable": 30 },
  "available": 23,
  "unavailable": 34,
  "stats": {
    "total": 57,
    "real": 23,
    "ready": 4,
    "planned": 30,
    "implementationRate": "40.4%",
    "readinessRate": "47.4%"
  }
}
```

### 3. GET `/v1/capabilities/tier/:tier`
Get capabilities by tier (REAL, READY, or PLANNED).

**Example:** `GET /v1/capabilities/tier/REAL`

**Response:**
```json
{
  "tier": "REAL",
  "count": 23,
  "capabilities": [ ... ]
}
```

### 4. GET `/v1/capabilities/category/:category`
Get capabilities by category (security, analytics, infrastructure, operations, integration).

**Example:** `GET /v1/capabilities/category/security`

**Response:**
```json
{
  "category": "security",
  "count": 11,
  "capabilities": [ ... ]
}
```

### 5. GET `/v1/capabilities/:id`
Get specific capability with health check.

**Example:** `GET /v1/capabilities/security.certificate_monitoring`

**Response:**
```json
{
  "id": "security.certificate_monitoring",
  "name": "Certificate Monitoring",
  "tier": "REAL",
  "status": "active",
  "check": {
    "available": true,
    "checkedAt": "2024-08-10T12:00:00.000Z"
  }
}
```

### 6. POST `/v1/capabilities/check`
Force health check on all capabilities.

**Response:**
```json
{
  "summary": { ... },
  "checksPerformed": 57,
  "results": [ ... ]
}
```

### 7. GET `/v1/capabilities/stats`
Get implementation statistics.

**Response:**
```json
{
  "total": 57,
  "real": 23,
  "ready": 4,
  "planned": 30,
  "implementationRate": "40.4%",
  "readinessRate": "47.4%"
}
```

---

## Health Checking

Each capability can define a health check function:

```typescript
{
  id: 'security.certificate_monitoring',
  tier: CapabilityTier.REAL,
  healthCheck: async () => {
    // Check if certificate collector is running
    const collector = registry.getCollector('certificate');
    return collector?.isHealthy() ?? false;
  }
}
```

Health checks verify:
- Required services are initialized
- Required collectors are active
- Required configuration is present
- Dependencies are available
- Actual runtime health

---

## Frontend Integration

### Display Capability Badges

```typescript
// Fetch capabilities
const response = await fetch('/v1/capabilities');
const { capabilities } = await response.json();

// Display badge based on tier
function getCapabilityBadge(capability) {
  if (capability.tier === 'REAL' && capability.check.available) {
    return <Badge color="green">Live</Badge>;
  }
  if (capability.tier === 'READY') {
    return <Badge color="yellow">Ready</Badge>;
  }
  if (capability.tier === 'PLANNED') {
    return <Badge color="gray">Planned</Badge>;
  }
  return <Badge color="red">Unavailable</Badge>;
}
```

### Filter by Tier

```typescript
// Show only REAL capabilities
const realCapabilities = await fetch('/v1/capabilities/tier/REAL');

// Show only operational capabilities
const operational = capabilities.filter(c => 
  c.tier === 'REAL' && c.check.available
);
```

### Display Implementation Progress

```typescript
const stats = await fetch('/v1/capabilities/stats');

// Show progress bar
<ProgressBar 
  value={stats.implementationRate} 
  label={`${stats.real} of ${stats.total} capabilities operational`}
/>
```

---

## File Structure

```
src/capabilities/
├── index.ts                      # Module exports
├── capability-registry.ts        # Core registry class
└── capability-definitions.ts     # All 57 system capabilities

src/routes/
└── capabilities.routes.ts        # Fastify API routes

src/app.ts                        # Route registration
```

---

## Usage Examples

### Check if capability is available

```typescript
import { getCapabilityRegistry } from './capabilities';

const registry = getCapabilityRegistry();
const check = await registry.checkCapability('analytics.face_recognition');

if (check.available) {
  // Use face recognition
} else {
  console.log(`Not available: ${check.reason}`);
  console.log(`Missing: ${check.missingRequirements}`);
}
```

### Add new capability

```typescript
import { getCapabilityRegistry, CapabilityTier, CapabilityStatus } from './capabilities';

const registry = getCapabilityRegistry();

registry.register({
  id: 'analytics.smoke_detection',
  name: 'Smoke Detection',
  category: 'analytics',
  tier: CapabilityTier.PLANNED,
  status: CapabilityStatus.UNAVAILABLE,
  description: 'Detect smoke in camera feeds',
  requiredServices: ['ai-inference-engine', 'smoke-model'],
  metadata: {
    confidence: 0,
  },
});
```

### Get implementation progress

```typescript
import { getCapabilityStats } from './capabilities';

const stats = getCapabilityStats();

console.log(`Implementation: ${stats.implementationRate}`);
console.log(`Readiness: ${stats.readinessRate}`);
console.log(`${stats.real} REAL, ${stats.ready} READY, ${stats.planned} PLANNED`);
```

---

## Testing

### Unit Tests

```typescript
import { CapabilityRegistry, CapabilityTier, CapabilityStatus } from './capabilities';

describe('CapabilityRegistry', () => {
  it('should register capabilities', () => {
    const registry = new CapabilityRegistry();
    
    registry.register({
      id: 'test.capability',
      name: 'Test',
      category: 'security',
      tier: CapabilityTier.REAL,
      status: CapabilityStatus.ACTIVE,
      description: 'Test capability',
    });

    const cap = registry.get('test.capability');
    expect(cap).toBeDefined();
    expect(cap?.tier).toBe(CapabilityTier.REAL);
  });

  it('should check capability health', async () => {
    const registry = new CapabilityRegistry();
    
    registry.register({
      id: 'test.healthy',
      name: 'Healthy',
      category: 'security',
      tier: CapabilityTier.REAL,
      status: CapabilityStatus.ACTIVE,
      description: 'Test',
      healthCheck: async () => true,
    });

    const check = await registry.checkCapability('test.healthy');
    expect(check.available).toBe(true);
    expect(check.status).toBe(CapabilityStatus.ACTIVE);
  });

  it('should detect missing configuration', async () => {
    const registry = new CapabilityRegistry();
    
    registry.register({
      id: 'test.needs_config',
      name: 'Needs Config',
      category: 'security',
      tier: CapabilityTier.READY,
      status: CapabilityStatus.INACTIVE,
      description: 'Test',
      requiredConfig: ['MISSING_ENV_VAR'],
    });

    const check = await registry.checkCapability('test.needs_config');
    expect(check.available).toBe(false);
    expect(check.status).toBe(CapabilityStatus.NOT_CONFIGURED);
    expect(check.missingRequirements).toContain('env:MISSING_ENV_VAR');
  });
});
```

### Integration Tests

```typescript
import { FastifyInstance } from 'fastify';

describe('Capabilities API', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it('GET /v1/capabilities should return all capabilities', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/capabilities',
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.payload);
    expect(data.success).toBe(true);
    expect(data.data.capabilities).toBeInstanceOf(Array);
    expect(data.data.summary.total).toBeGreaterThan(0);
  });

  it('GET /v1/capabilities/tier/REAL should return only REAL capabilities', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/capabilities/tier/REAL',
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.payload);
    expect(data.data.capabilities.every(c => c.tier === 'REAL')).toBe(true);
  });

  it('GET /v1/capabilities/stats should return statistics', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/capabilities/stats',
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.payload);
    expect(data.data.implementationRate).toMatch(/\d+\.\d+%/);
  });
});
```

---

## Migration Guide

### For Frontend Developers

**Before:**
```typescript
// UI shows face recognition feature
<AnalyticsCard title="Face Recognition" />
// User clicks, expects it to work, but it's mock data
```

**After:**
```typescript
// Check capability first
const capability = await fetch('/v1/capabilities/analytics.face_recognition');

if (capability.tier === 'REAL' && capability.check.available) {
  <AnalyticsCard title="Face Recognition" badge="Live" />
} else if (capability.tier === 'READY') {
  <AnalyticsCard title="Face Recognition" badge="Ready" disabled />
} else {
  <AnalyticsCard title="Face Recognition" badge="Planned" disabled />
}
```

### For Backend Developers

**Adding a new capability:**

1. Define capability in `capability-definitions.ts`:
```typescript
{
  id: 'analytics.smoke_detection',
  name: 'Smoke Detection',
  category: 'analytics',
  tier: CapabilityTier.PLANNED, // Start as PLANNED
  status: CapabilityStatus.UNAVAILABLE,
  description: 'Detect smoke in camera feeds',
}
```

2. Implement the feature

3. Update tier to READY when code complete:
```typescript
tier: CapabilityTier.READY,
status: CapabilityStatus.INACTIVE,
```

4. Update tier to REAL when deployed and tested:
```typescript
tier: CapabilityTier.REAL,
status: CapabilityStatus.ACTIVE,
healthCheck: async () => {
  // Verify it's actually working
  return await smokeDetector.isHealthy();
},
```

---

## Benefits

### 1. Transparency
- Users know what's operational vs planned
- No confusion about capability status
- Clear implementation progress tracking

### 2. Honest Assessment
- Evaluators can accurately assess system capabilities
- No misleading UI that suggests features exist
- Clear distinction between demo and production features

### 3. Development Tracking
- Track implementation progress: 40.4% → 50% → 60%
- Identify what's READY but not deployed
- Prioritize moving PLANNED → READY → REAL

### 4. Production Readiness
- Clear checklist of what needs to be deployed
- Health checks verify actual operational status
- Configuration validation before marking as REAL

### 5. User Experience
- Users can filter to show only operational features
- Prevent frustration from non-functional features
- Progressive disclosure of capabilities

---

## Current Status

**Implementation Rate**: 40.4% (23/57 REAL)  
**Readiness Rate**: 47.4% (27/57 REAL + READY)

### Strongest Areas
- **Infrastructure**: 80% REAL (8/10)
- **Integration**: 36% REAL (5/14) for core protocols

### Areas Needing Work
- **Advanced Analytics**: Most AI features are PLANNED
- **Enterprise Security**: TPM, tamper, ransomware detection are PLANNED
- **Enterprise Identity**: SAML, OIDC, LDAP are PLANNED
- **Operations**: On-call, SLA, workload balancing are PLANNED

---

## Next Steps

### P1 (Move READY → REAL)
1. Deploy Object Detection (configuration needed)
2. Configure HA Deployment (Redis Sentinel + Postgres replication)
3. Activate Alert Correlation Engine
4. Enable Incident Management

### P2 (Move PLANNED → READY)
5. Implement face recognition model integration
6. Implement ANPR model integration
7. Implement SAML/OIDC authentication
8. Implement on-call management system

### P3 (Improve Existing REAL)
9. Add more comprehensive health checks
10. Add performance metrics to metadata
11. Add last-verified timestamps
12. Monitor and maintain confidence scores

---

## Configuration

No special configuration needed. The framework is automatically initialized when routes are registered.

Optional environment variables for health checking:
- `REDIS_HOST` - Required for distributed event bus
- `EVENT_BUS_MODE` - Set to 'redis' for production
- `SIEM_ENDPOINT` - Required for SIEM integration
- `SAML_IDP_URL` - Required for SAML SSO
- `OIDC_ISSUER` - Required for OIDC

---

## Monitoring

### Health Check Frequency
- Automatic: On API request
- Manual: POST `/v1/capabilities/check`

### Metrics to Track
- Implementation rate over time
- Capability availability percentage
- Health check failure rate
- Configuration coverage

### Alerting
Consider alerting on:
- REAL capability becomes unavailable
- Health check failures for 5+ minutes
- Missing required configuration

---

## Conclusion

This framework solves the P0 issue of **misleading UI capabilities** by:

✅ **Classifying** all 57 capabilities into REAL/READY/PLANNED tiers  
✅ **Tracking** runtime status and health  
✅ **Exposing** capability status via 7 API endpoints  
✅ **Providing** clear statistics (40.4% implementation, 47.4% readiness)  
✅ **Enabling** frontend to display honest capability badges  
✅ **Supporting** progressive feature disclosure  
✅ **Measuring** implementation progress over time  

The system can now be evaluated accurately, and users can make informed decisions about which features are operational.

**This completes P0 Task 7 and all 7 P0 security and architecture fixes.**
