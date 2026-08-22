# Banking Analytics System

Complete event-driven banking analytics system for cash van monitoring and compliance tracking.

## Architecture

```
Cameras / DVR / Access Control
          │
          ▼
┌─────────────────────────────┐
│ Existing Detectors          │
│ • Vehicle detector          │
│ • ANPR                      │
│ • Person tracker            │
│ • Face recognition          │
│ • Zone engine               │
│ • Access control            │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│ Banking Event Bus           │
│ (Normalized Events)         │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│ Cash Van Workflow Engine    │
│ • State machine             │
│ • Event handlers            │
│ • Session management        │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│ Rule Engine                 │
│ • 9 banking rules           │
│ • Pass/fail/unknown         │
│ • Evidence collection       │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│ Sessions & Violations       │
│ • Persistent state          │
│ • Evidence packages         │
│ • Forensic replay           │
└─────────────────────────────┘
```

## Key Features

### Event-Driven Architecture
- Normalized event types for vehicle, person, ANPR, zone, access, object
- Pub/sub event bus with deduplication
- Detectors produce facts; banking analytics interprets sequences

### Stateful Workflow Engine
- Cash van sessions persist across cameras and time windows
- State machine: vehicle_detected → vehicle_verified → personnel_verification → escort_verified → unloading → secure_zone_entry → transfer_complete → departed
- Automatic state transitions based on evidence

### Rule-Based Compliance
9 banking rules with pass/fail/unknown semantics:
1. **Authorized Vehicle** - ANPR verification against whitelist
2. **Scheduled Arrival** - Time window validation
3. **Minimum Personnel** - Count validation with stable tracking
4. **Escort Verification** - Identity and role checking
5. **Unloading Duration** - Timeout detection
6. **Transfer Route** - Zone sequence compliance
7. **Access Correlation** - Door access correlation
8. **Object Escort** - Unattended object detection
9. **Departure Completion** - Completion before departure

### Evidence Collection
- Video clips around violations
- Frame snapshots at key moments
- Forensic replay frame-by-frame
- Complete investigation packages

## Quick Start

### 1. Initialize Service

```typescript
import { getBankingAnalyticsService } from './banking-analytics.service';

const service = getBankingAnalyticsService();
await service.initialize();
```

### 2. Configure Monitor

```typescript
import { getCashVanMonitorRepository } from './repositories';

const monitorRepo = getCashVanMonitorRepository();

const monitor = await monitorRepo.create({
  tenantId: 'acme-bank',
  branchId: 'main-branch',
  name: 'Main Branch Cash Van',
  arrivalZoneId: 'zone_loading_bay',
  unloadingZoneId: 'zone_unloading',
  secureEntryZoneId: 'zone_vault_entrance',
});

// Add authorized vehicle
await monitorRepo.addVehicleRule(monitor.id, {
  plate: 'XYZ789',
  enabled: true,
});
```

### 3. Publish Events

```typescript
import { getBankingIntegrationManager } from './integration';

const integration = getBankingIntegrationManager();

// From vehicle detector
await integration.vehicle.publishVehicleDetection({
  tenantId: 'acme-bank',
  branchId: 'main-branch',
  cameraId: 'cam_01',
  trackId: 'veh_123',
  vehicleClass: 'van',
  bbox: { x: 100, y: 100, width: 200, height: 150 },
  confidence: 0.95,
  zoneId: 'zone_loading_bay',
  timestamp: new Date(),
});

// From ANPR
await integration.anpr.publishPlateRecognition({
  tenantId: 'acme-bank',
  branchId: 'main-branch',
  cameraId: 'cam_01',
  vehicleTrackId: 'veh_123',
  plate: 'XYZ789',
  confidence: 0.92,
  timestamp: new Date(),
});
```

### 4. Query Sessions

```typescript
// Get active sessions
const sessions = await service.getSessions('acme-bank', 'main-branch', {
  activeOnly: true,
});

// Get summary
const summary = await service.getSummary('acme-bank', 'main-branch');
console.log(`Active: ${summary.activeSessions}`);
console.log(`Violations: ${summary.totalViolations}`);
```

### 5. Generate Evidence

```typescript
import { getBankingEvidenceService } from './evidence';

const evidenceService = getBankingEvidenceService();

const evidence = await evidenceService.generateEvidencePackage(sessionId);
console.log(`Clips: ${evidence.totalClips}`);
console.log(`Snapshots: ${evidence.totalSnapshots}`);
```

## API Routes

### Sessions
- `GET /v1/banking/sessions` - Query sessions
- `GET /v1/banking/sessions/:id` - Get session details
- `GET /v1/banking/sessions/summary` - Get statistics
- `POST /v1/banking/sessions/:id/evidence` - Generate evidence
- `GET /v1/banking/sessions/:id/replay` - Forensic replay

### Monitors
- `GET /v1/banking/monitors` - List monitors
- `POST /v1/banking/monitors` - Create monitor
- `PATCH /v1/banking/monitors/:id` - Update monitor
- `DELETE /v1/banking/monitors/:id` - Delete monitor
- `POST /v1/banking/monitors/:id/vehicle-rules` - Add vehicle
- `POST /v1/banking/monitors/:id/schedule-rules` - Add schedule

### Visits
- `GET /v1/banking/visits` - List expected visits
- `POST /v1/banking/visits` - Schedule visit
- `PATCH /v1/banking/visits/:id` - Update visit
- `DELETE /v1/banking/visits/:id` - Cancel visit

### Personnel
- `GET /v1/banking/personnel` - List personnel
- `POST /v1/banking/personnel` - Add personnel
- `GET /v1/banking/personnel/:id` - Get personnel details

## Front-End Components

### Dashboard
```typescript
import { BankingAnalyticsDashboard } from '@/components/banking';

<BankingAnalyticsDashboard />
```

### Timeline View
```typescript
import { SessionTimelineView } from '@/components/banking';

<SessionTimelineView sessionId={sessionId} />
```

### Configuration
```typescript
import { MonitorConfigurationForm } from '@/components/banking';

<MonitorConfigurationForm 
  monitorId={monitorId}
  onSave={() => console.log('Saved')}
/>
```

## Testing

```bash
# Run all tests
npm test -- banking

# Run specific scenario
npm test -- workflow.test.ts

# Generate coverage
npm test -- --coverage banking
```

See `__tests__/README.md` for test documentation.

## Integration Examples

### Vehicle Analytics Integration
```typescript
integration.integrateVehicleAnalytics(vehicleAnalyticsService);
```

### Face Recognition Integration
```typescript
integration.integrateFaceRecognition(faceRecognitionService);
```

### Access Control Integration
```typescript
integration.integrateAccessControl(accessControlSystem);
```

## Configuration Best Practices

### Personnel Rules
- Set `minimumPersonnel` to expected crew size
- Set `minimumGuards` to required escort count
- Enable `requireIdentityVerification` when face recognition is available
- Set `minimumIdentityConfidence` to 0.75 or higher

### Unloading Rules
- Set `maxDurationSeconds` based on site-specific operations
- Set `maxEscortDistanceMeters` to 3-5 meters for proximity
- Enable `requireGuardEscort` for high-security operations

### Access Rules
- Enable `requireAccessCorrelation` for secure areas
- Set `accessCorrelationWindowMs` to 10-15 seconds
- Enable `requireAuthorizedIdentity` for identity verification

### Vehicle Authorization
- Use exact plates for known vehicles
- Use regex patterns for fleet vehicles: `^ABC\d{3}$`
- Add provider IDs for third-party services

### Schedule Rules
- Define time windows with 15-30 minute tolerance
- Set specific days of week for regular deliveries
- Create multiple rules for different schedules

## Troubleshooting

### No Sessions Created
- Verify monitor is enabled
- Check zone IDs match camera configuration
- Ensure events are being published to event bus

### Unknown Rule Results
- Check evidence availability in session
- Verify detectors are publishing events
- Review confidence thresholds

### Missing Violations
- Verify rules are registered with rule engine
- Check rule enable/disable status
- Review rule evaluation logs

## Performance

- Event bus deduplication prevents duplicate processing
- Sessions indexed by vehicle track and monitor
- Rule evaluation is incremental (not re-run from scratch)
- Evidence generation is on-demand

## License

Internal use only - Omsystems surveillance platform
