# P0 Security & Architecture Fixes - Implementation Plan

## Overview
This document tracks the implementation of critical P0 fixes identified in the comprehensive security audit.

## Status Legend
- 🔴 **NOT STARTED** - Issue identified, work not yet begun
- 🟡 **IN PROGRESS** - Active development underway
- 🟢 **COMPLETED** - Implementation done and verified

---

## P0.1: Remove Fake Security Posture Values ⏳

### Current Issues
- **Hardcoded compliance score**: `score: 85` in `scoreCompliance()`
- **No real evidence collection**: Scores calculated from database queries without source tracking
- **Missing freshness indicators**: No timestamp validation for evidence
- **No confidence scoring**: All metrics treated as equally reliable

### Implementation Plan

#### Phase 1: Evidence Framework (🟡 IN PROGRESS)
1. Create `SecurityEvidence` type with required fields:
   - `source`: where data came from
   - `collectedAt`: when it was collected
   - `freshness`: age of the evidence
   - `confidence`: reliability score (0-100)
   - `collectorType`: which collector gathered it
   - `raw Data`: original telemetry

2. Create evidence collectors:
   - `CertificateCollector` - real certificate scanning
   - `SecretVaultCollector` - vault health metrics
   - `TPMCollector` - actual TPM attestation
   - `PasswordRotationCollector` - rotation compliance
   - `DeviceIdentityCollector` - device trust scores

#### Phase 2: Real Metric Calculation (🔴 NOT STARTED)
1. Replace hardcoded scores with evidence-based calculation
2. Add evidence freshness validation (reject stale data)
3. Implement confidence-weighted scoring
4. Add metric degradation for missing collectors

#### Phase 3: API Enhancement (🔴 NOT STARTED)
1. Update `/v1/security/posture` to return:
   - Evidence sources for each score
   - Collector status
   - Freshness warnings
   - Confidence levels
2. Add `/v1/security/evidence/:metric` endpoint
3. Mark unavailable metrics with `provenance: 'UNAVAILABLE'`

### Files to Modify
- `src/security/services/security-posture.service.ts` - core scoring logic
- `src/security/types.ts` - add evidence types
- `src/security/collectors/` - NEW directory for collectors
- `src/routes/security-dashboard.routes.ts` - enhance API responses

---

## P0.2: Unify Duplicate Security Architectures 🔴

### Current Issues
Three separate security route implementations:
1. `src/routes/security-dashboard.routes.ts` (Fastify)
2. `backend/src/routes/security.routes.ts` (Express)
3. `src/security/api/security-dashboard.routes.ts` (Express)

Two separate service layers:
1. `SecurityServicesFactory` (src/security)
2. Individual service imports (backend/src/services)

### Implementation Plan

#### Phase 1: Service Layer Consolidation (🔴 NOT STARTED)
1. Audit all security services, identify duplicates
2. Choose canonical location: `src/security/services/`
3. Migrate/merge duplicate implementations
4. Update all imports to use unified services

#### Phase 2: Route Consolidation (🔴 NOT STARTED)
1. Choose Fastify routes as canonical (more complete)
2. Migrate Express-only endpoints to Fastify
3. Delete duplicate route files
4. Update main app registration

#### Phase 3: Schema Consolidation (🔴 NOT STARTED)
1. Merge duplicate type definitions
2. Create single source of truth for security types
3. Update all imports

### Files to Modify
- **Keep**: `src/routes/security-dashboard.routes.ts` (Fastify)
- **Remove**: `backend/src/routes/security.routes.ts`
- **Remove**: `src/security/api/security-dashboard.routes.ts`
- **Audit**: All service files for duplication

---

## P0.3: Secure Plaintext Secret Endpoint 🔴

### Current Issues
```typescript
// CURRENT - INSECURE
router.get('/secrets/:id', async (req, res) => {
  const secret = await secretVault.getSecret(req.params.id);
  const decrypted = await secretVault.decrypt(secret.value);
  res.json({ ...secret, value: decrypted }); // ❌ EXPOSES PLAINTEXT
});
```

### Security Requirements
1. **Authentication** ✅ (assumed present)
2. **Authorization** ❌ (missing secret-specific permissions)
3. **Audit Logging** ❌ (no audit trail)
4. **Rate Limiting** ❌ (no protection against brute force)
5. **Justification** ❌ (no reason required)

### Implementation Plan

#### Phase 1: Authorization Layer (🔴 NOT STARTED)
1. Add `secret:read` permission check
2. Implement secret-specific ACLs
3. Add owner validation
4. Implement role-based access (admin, operator, viewer)

#### Phase 2: Audit & Compliance (🔴 NOT STARTED)
1. Log every secret access attempt (success + failure)
2. Record: who, what, when, why, from where
3. Add audit trail to secret object
4. Implement tamper-proof audit log

#### Phase 3: Enhanced Security (🔴 NOT STARTED)
1. Add rate limiting (max 10 reads/hour per user)
2. Require access justification (optional, configurable)
3. Add time-limited access tokens
4. Consider removing plaintext endpoint entirely

#### Phase 4: Alternative Approaches (🔴 NOT STARTED)
- Option A: Return temporary access token instead of plaintext
- Option B: Require challenge-response authentication
- Option C: Only decrypt on edge devices, never expose to API

### Files to Modify
- `src/security/api/security-dashboard.routes.ts` - secure endpoint
- `src/security/services/secret-vault.service.ts` - add authorization
- `src/services/audit.service.ts` - add secret access logging
- Add new middleware: `requireSecretPermission()`

---

## P0.4: Distributed Event Bus 🔴

### Current Issues
```typescript
// In-memory event bus (single process only)
private listeners = new Map<string, Set<(event: any) => void>>();
```

### Problems
- Doesn't work across multiple backend instances
- SSE connections tied to single process
- No event persistence
- No replay capability

### Implementation Plan

#### Phase 1: Redis Pub/Sub (🔴 NOT STARTED)
1. Add Redis dependency
2. Create `RedisEventBus` class
3. Implement pub/sub for alert events
4. Maintain backward compatibility with `EventEmitter`

#### Phase 2: Migration Strategy (🔴 NOT STARTED)
1. Create abstraction layer: `IEventBus`
2. Implement both Redis and in-memory versions
3. Use environment variable to toggle: `EVENT_BUS=redis|memory`
4. Add connection health monitoring

#### Phase 3: SSE Multi-Instance Support (🔴 NOT STARTED)
1. Subscribe to Redis channels for SSE
2. Add connection pooling
3. Implement automatic failover
4. Add message deduplication

### Files to Create
- `src/events/event-bus.interface.ts` - abstraction
- `src/events/redis-event-bus.ts` - Redis implementation
- `src/events/memory-event-bus.ts` - current impl (refactored)
- `src/events/event-bus-factory.ts` - factory pattern

### Files to Modify
- `src/services/*.service.ts` - use IEventBus instead of EventEmitter
- `src/routes/alerts.routes.ts` - SSE with Redis
- `.env.example` - add EVENT_BUS config

---

## P0.5: Real Backend Alert Counters 🔴

### Current Issues
Frontend does counting:
```typescript
// ❌ BAD - Frontend counting
alerts.filter(a => a.severity === 'P1').length
```

### Problems
- N+1 query problem
- Inefficient for large datasets
- No caching
- Repeated computation

### Implementation Plan

#### Phase 1: Database Aggregation (🔴 NOT STARTED)
1. Add SQL COUNT queries by severity
2. Add GROUP BY queries for status
3. Implement efficient JOINs
4. Add database indices

#### Phase 2: Caching Layer (🔴 NOT STARTED)
1. Cache counters in Redis (TTL: 30s)
2. Invalidate on alert create/update/delete
3. Add cache warming on startup
4. Implement cache-aside pattern

#### Phase 3: Real-time Updates (🔴 NOT STARTED)
1. Emit counter updates via SSE
2. Increment/decrement counters (no full recount)
3. Periodic reconciliation (every 5 minutes)

### Files to Modify
- `backend/src/services/alert.service.ts` - add aggregation methods
- `backend/src/routes/alert.routes.ts` - new counter endpoints
- `dashboard/src/api/alerts.ts` - use new endpoints
- `dashboard/src/hooks/useAlertSummary.ts` - consume SSE updates

---

## P0.6: Fix Alert Command Center N+1 Queries 🔴

### Current Issues
```typescript
// ❌ N+1 PROBLEM
for (const alert of alerts) {
  alert.notifications = await getNotifications(alert.id);
  alert.evidence = await getEvidence(alert.id);
}
```

### Problems
- 1 query for alerts + N queries for notifications
- Slow with 100+ alerts
- Database connection pool exhaustion
- High latency

### Implementation Plan

#### Phase 1: Eager Loading (🔴 NOT STARTED)
1. Use LEFT JOIN to fetch alerts + notifications in single query
2. Use LEFT JOIN for evidence
3. Use JSON aggregation functions (PostgreSQL)
4. Reduce 101 queries to 1 query

#### Phase 2: Query Optimization (🔴 NOT STARTED)
1. Add database indexes:
   - `notifications(alert_id)`
   - `alert_evidence(alert_id)`
2. Add query explain plans
3. Optimize JOIN order

#### Phase 3: Pagination (🔴 NOT STARTED)
1. Implement cursor-based pagination
2. Limit default page size (50 alerts)
3. Add `include` query parameter for related data

### Files to Modify
- `backend/src/repositories/alert.repository.ts` - optimize queries
- `backend/src/routes/alert-command-center.routes.ts` - add includes
- Database: add indices

---

## P0.7: Define Capability Status Framework 🔴

### Current Issues
- UI shows capabilities that aren't actually running
- No distinction between REAL, READY, and PLANNED
- Confusing for users/customers

### Capability Tiers

#### Tier 1: REAL
- Code exists ✅
- Tests exist ✅
- Deployed ✅
- Connected to actual data sources ✅
- **Verified operational** ✅

#### Tier 2: READY
- Code exists ✅
- Tests exist ✅
- Deployment/configuration pending ⏳
- Integration exists but not connected ⏳

#### Tier 3: PLANNED
- UI exists ✅
- API exists ✅
- Actual backend logic absent ❌
- Returns mock/simulated data ❌

### Implementation Plan

#### Phase 1: Capability Registry (🔴 NOT STARTED)
1. Create `CapabilityRegistry` service
2. Define capability metadata:
   - `id`: unique identifier
   - `name`: display name
   - `tier`: REAL | READY | PLANNED
   - `collectors`: required data sources
   - `dependencies`: required services
   - `healthCheck`: verification function

#### Phase 2: Runtime Detection (🔴 NOT STARTED)
1. Auto-detect capability status on startup
2. Check if collectors are available
3. Verify data sources are connected
4. Run health checks

#### Phase 3: UI Indicators (🔴 NOT STARTED)
1. Add badges to UI: 🟢 LIVE | 🟡 DEMO | ⚪ COMING SOON
2. Add capability status page
3. Show which collectors are active
4. Add "Why is this unavailable?" tooltips

### Files to Create
- `src/capabilities/capability-registry.ts`
- `src/capabilities/capability-status.ts`
- `src/capabilities/detectors/` - capability detection logic

### Files to Modify
- `src/routes/security-dashboard.routes.ts` - add status to responses
- `dashboard/src/components/CapabilityBadge.tsx` - NEW component
- All API responses - add `provenance` field

---

## Testing Requirements

### For Each P0 Fix
1. Unit tests for new logic
2. Integration tests for APIs
3. Load tests for performance fixes (P0.5, P0.6)
4. Security tests for P0.3

### E2E Tests
1. Test security posture with real evidence
2. Test secret access with full audit trail
3. Test alert counters under load
4. Test capability detection

---

## Deployment Strategy

### Phase 1: Backend Fixes (Week 1)
- P0.1: Security evidence framework
- P0.3: Secure secret endpoint
- P0.5: Backend alert counters
- P0.6: Query optimization

### Phase 2: Architecture (Week 2)
- P0.2: Unify security services
- P0.4: Redis event bus
- P0.7: Capability registry

### Phase 3: Migration & Cleanup (Week 3)
- Remove duplicate code
- Update all documentation
- Add migration guides
- Deploy to production

---

## Success Criteria

### P0.1 ✅ When:
- No hardcoded security scores remain
- All metrics have evidence sources
- Freshness warnings appear for stale data
- Unavailable collectors marked in UI

### P0.2 ✅ When:
- Only 1 security route file remains
- All services use SecurityServicesFactory
- No duplicate type definitions
- All tests passing

### P0.3 ✅ When:
- Secret access requires permissions
- All accesses logged to audit trail
- Rate limiting active
- Security review passed

### P0.4 ✅ When:
- Redis event bus deployed
- Multi-instance SSE working
- Backward compatibility maintained
- Monitoring dashboard shows event flow

### P0.5 ✅ When:
- Alert counters cached in Redis
- <100ms response time for counters
- Real-time SSE updates working
- Frontend polling reduced to 5min

### P0.6 ✅ When:
- Alert Command Center loads in <2s
- Query count reduced from 101 to <5
- Database indices added
- Load test passes (1000 alerts)

### P0.7 ✅ When:
- Capability status visible in UI
- Auto-detection working correctly
- No confusion between tiers
- Status page deployed

---

## Dependencies & Prerequisites

### Required Before Starting
- [x] Comprehensive audit completed
- [ ] Team agreement on priority order
- [ ] Redis instance available (for P0.4, P0.5)
- [ ] Security review scheduled (for P0.3)

### Required Tools
- Redis server (7.0+)
- PostgreSQL (14+)
- Node.js (18+)
- TypeScript (5.0+)

---

## Rollback Plan

### Per-Fix Rollback
- Feature flags for each P0 fix
- Environment variables to toggle new behavior
- Database migrations are reversible
- Keep old code paths for 1 release cycle

### Emergency Rollback
1. Revert Docker image to previous version
2. Re-enable in-memory event bus
3. Restore old security routes
4. Alert team and investigate

---

## Monitoring & Observability

### New Metrics to Track
- Secret access attempts (by user, by secret)
- Event bus throughput (events/sec)
- Alert counter cache hit rate
- Query execution time (alert command center)
- Capability detection success rate
- Security evidence freshness

### Alerts to Create
- Stale security evidence (>1 hour old)
- Secret access denied (spike)
- Redis event bus disconnected
- Alert query time >5s
- Capability detection failure

---

## Documentation Updates

### For Each Fix
- [ ] Update API documentation
- [ ] Update architecture diagrams
- [ ] Add security documentation (P0.3)
- [ ] Update deployment guide
- [ ] Add troubleshooting guide

### New Documentation
- [ ] Security evidence collection guide
- [ ] Capability tier definitions
- [ ] Event bus architecture
- [ ] Secret access policy

---

Last Updated: 2026-08-10
Status: 🟡 IN PROGRESS (P0.1 started)
