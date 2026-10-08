# Banking Analytics Integration Example

## Complete End-to-End Example

This document demonstrates how the banking analytics system integrates with existing detectors and processes real events.

## Architecture Flow

```
┌─────────────────┐
│ Video Stream    │
└────────┬────────┘
         │
         v
┌─────────────────────────────────────────────────────────────┐
│              Analytics Pipeline                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Vehicle  │  │  ANPR    │  │  Person  │  │   Face   │   │
│  │ Detector │  │ Detector │  │ Detector │  │ Detector │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘   │
└───────┼─────────────┼─────────────┼─────────────┼──────────┘
        │             │             │             │
        └─────────────┴─────────────┴─────────────┘
                      │
                      v
        ┌─────────────────────────────┐
        │ Banking Integration Manager │
        │  (Event Publishers)         │
        └─────────────┬───────────────┘
                      │
                      v
        ┌─────────────────────────────┐
        │    Banking Event Bus        │
        └─────────────┬───────────────┘
                      │
                      v
        ┌─────────────────────────────┐
        │  Banking Workflow Engine    │
        │  - State Machine            │
        │  - Rule Evaluation          │
        │  - Evidence Collection      │
        └─────────────┬───────────────┘
                      │
                      v
        ┌─────────────────────────────┐
        │  Sessions & Violations DB   │
        └─────────────────────────────┘
```

## Example Scenario: Complete Cash Van Workflow

### Scenario Setup

**Branch**: Headquarters Branch
**Authorized Vehicle**: DL01CA1234
**Expected Personnel**: 3 cash guards + 1 escort
**Scheduled Arrival**: 10:00 AM
**Loading Zone**: zone-hq-loading
**Unloading Zone**: zone-hq-vault-entrance

### Event Sequence

#### 1. Vehicle Approaches (9:58 AM)

**Detector**: Vehicle Detector
```typescript
// Vehicle detected approaching the branch
{
  detectionType: 'vehicle',
  tenantId: 'tenant-001',
  cameraId: 'cam-entrance-001',
  timestamp: '2024-08-11T09:58:00Z',
  objects: [{
    label: 'truck',
    confidence: 0.92,
    trackId: 'vehicle-track-001',
    boundingBox: { x: 0.3, y: 0.4, width: 0.3, height: 0.25 }
  }]
}
```

**Published Event**:
```typescript
// Banking Integration publishes VehicleEvent
vehiclePublisher.publishVehicleDetection({
  tenantId: 'tenant-001',
  cameraId: 'cam-entrance-001',
  timestamp: new Date('2024-08-11T09:58:00Z'),
  vehicleId: 'vehicle-track-001',
  vehicleType: 'truck',
  confidence: 0.92,
  boundingBox: { x: 0.3, y: 0.4, width: 0.3, height: 0.25 },
  attributes: {}
});
```

**Workflow Action**: 
- State: `IDLE` → `VEHICLE_APPROACHING`
- Session created with ID: `session-001`

---

#### 2. License Plate Read (9:58:15 AM)

**Detector**: ANPR Detector
```typescript
{
  detectionType: 'anpr',
  tenantId: 'tenant-001',
  cameraId: 'cam-entrance-001',
  timestamp: '2024-08-11T09:58:15Z',
  objects: [{
    label: 'license-plate',
    confidence: 0.89,
    trackId: 'vehicle-track-001',
    plateReading: {
      plateNumber: 'DL01CA1234',
      confidence: 0.89,
      country: 'IN'
    }
  }]
}
```

**Published Event**:
```typescript
anprPublisher.publishPlateReading({
  tenantId: 'tenant-001',
  cameraId: 'cam-entrance-001',
  timestamp: new Date('2024-08-11T09:58:15Z'),
  vehicleId: 'vehicle-track-001',
  plateNumber: 'DL01CA1234',
  confidence: 0.89,
  country: 'IN'
});
```

**Workflow Action**:
- State: `VEHICLE_APPROACHING` → `VEHICLE_IDENTIFIED`
- Rule: `AuthorizedVehicleRule` → **PASS** (vehicle is in authorized list)
- Rule: `ScheduledArrivalRule` → **PASS** (within 5-minute window)

---

#### 3. Vehicle Enters Loading Zone (10:00:30 AM)

**Detector**: Zone Detector (line-crossing)
```typescript
{
  detectionType: 'line-crossing',
  tenantId: 'tenant-001',
  cameraId: 'cam-loading-001',
  timestamp: '2024-08-11T10:00:30Z',
  objects: [{
    label: 'truck',
    confidence: 0.94,
    trackId: 'vehicle-track-001'
  }],
  metadata: {
    zoneId: 'zone-hq-loading',
    direction: 'entry'
  }
}
```

**Published Event**:
```typescript
zonePublisher.publishZoneEvent({
  tenantId: 'tenant-001',
  cameraId: 'cam-loading-001',
  timestamp: new Date('2024-08-11T10:00:30Z'),
  zoneId: 'zone-hq-loading',
  objectId: 'vehicle-track-001',
  objectType: 'vehicle',
  eventType: 'entry',
  confidence: 0.94
});
```

**Workflow Action**:
- State: `VEHICLE_IDENTIFIED` → `VEHICLE_IN_ZONE`
- Session updated with arrival time and zone

---

#### 4. Personnel Detected (10:00:45 AM)

**Detector**: Person Detector
```typescript
{
  detectionType: 'person',
  tenantId: 'tenant-001',
  cameraId: 'cam-loading-001',
  timestamp: '2024-08-11T10:00:45Z',
  objects: [
    { label: 'person', confidence: 0.91, trackId: 'person-track-001' },
    { label: 'person', confidence: 0.88, trackId: 'person-track-002' },
    { label: 'person', confidence: 0.93, trackId: 'person-track-003' },
    { label: 'person', confidence: 0.90, trackId: 'person-track-004' }
  ]
}
```

**Published Events**:
```typescript
// For each person detected
for (const person of persons) {
  personPublisher.publishPersonDetection({
    tenantId: 'tenant-001',
    cameraId: 'cam-loading-001',
    timestamp: new Date('2024-08-11T10:00:45Z'),
    personId: person.trackId,
    confidence: person.confidence,
    boundingBox: person.boundingBox
  });
}
```

**Workflow Action**:
- State: `VEHICLE_IN_ZONE` → `PERSONNEL_DETECTED`
- Rule: `MinimumPersonnelRule` → **PASS** (4 persons detected, minimum is 3)

---

#### 5. Face Recognition (10:01:00 AM)

**Detector**: Face Detector
```typescript
{
  detectionType: 'face-recognition',
  tenantId: 'tenant-001',
  cameraId: 'cam-loading-001',
  timestamp: '2024-08-11T10:01:00Z',
  objects: [
    {
      label: 'face',
      confidence: 0.87,
      faceId: 'face-001',
      identityId: 'identity-hq-john-doe',
      recognitionConfidence: 0.95,
      trackId: 'person-track-001'
    },
    {
      label: 'face',
      confidence: 0.89,
      faceId: 'face-002',
      identityId: 'identity-hq-jane-smith',
      recognitionConfidence: 0.93,
      trackId: 'person-track-002'
    },
    {
      label: 'face',
      confidence: 0.91,
      faceId: 'face-003',
      identityId: 'identity-hq-mike-johnson',
      recognitionConfidence: 0.96,
      trackId: 'person-track-003'
    }
  ]
}
```

**Published Events**:
```typescript
for (const face of faces) {
  facePublisher.publishFaceDetection({
    tenantId: 'tenant-001',
    cameraId: 'cam-loading-001',
    timestamp: new Date('2024-08-11T10:01:00Z'),
    faceId: face.faceId,
    personId: face.trackId,
    identityId: face.identityId,
    confidence: face.confidence,
    recognitionConfidence: face.recognitionConfidence
  });
}
```

**Workflow Action**:
- State: `PERSONNEL_DETECTED` → `PERSONNEL_VERIFIED`
- Rule: `EscortVerificationRule` → **PASS** (escort 'mike-johnson' verified)
- Personnel matched: John Doe (cash_guard), Jane Smith (cash_guard), Mike Johnson (escort)

---

#### 6. Unloading Begins (10:02:00 AM)

**Detector**: Object Detector (bags/packages)
```typescript
{
  detectionType: 'object',
  tenantId: 'tenant-001',
  cameraId: 'cam-loading-001',
  timestamp: '2024-08-11T10:02:00Z',
  objects: [
    { label: 'backpack', confidence: 0.85, trackId: 'bag-001' },
    { label: 'suitcase', confidence: 0.92, trackId: 'bag-002' }
  ]
}
```

**Published Events**:
```typescript
objectPublisher.publishObjectDetection({
  tenantId: 'tenant-001',
  cameraId: 'cam-loading-001',
  timestamp: new Date('2024-08-11T10:02:00Z'),
  objectId: 'bag-001',
  objectType: 'backpack',
  confidence: 0.85,
  attributes: { status: 'carried' }
});
```

**Workflow Action**:
- State: `PERSONNEL_VERIFIED` → `UNLOADING_IN_PROGRESS`
- Unloading start time recorded

---

#### 7. Transfer to Secure Zone (10:15:00 AM)

**Detector**: Zone Detector (line-crossing to vault entrance)
```typescript
{
  detectionType: 'line-crossing',
  tenantId: 'tenant-001',
  cameraId: 'cam-vault-001',
  timestamp: '2024-08-11T10:15:00Z',
  objects: [
    { label: 'person', trackId: 'person-track-001' },
    { label: 'person', trackId: 'person-track-002' }
  ],
  metadata: {
    zoneId: 'zone-hq-vault-entrance',
    direction: 'entry'
  }
}
```

**Workflow Action**:
- State: `UNLOADING_IN_PROGRESS` → `TRANSFER_IN_PROGRESS`
- Rule: `TransferRouteRule` → **PASS** (personnel entered secure zone)
- Rule: `ObjectEscortRule` → **PASS** (cash carried by authorized personnel)

---

#### 8. Unloading Complete (10:20:00 AM)

**Detector**: Zone Detector (vehicle still in loading zone, no objects being transferred)
```typescript
// No new transfer activity detected for 2 minutes
```

**Workflow Action**:
- State: `TRANSFER_IN_PROGRESS` → `UNLOADING_COMPLETE`
- Unloading duration: 18 minutes (1080 seconds)
- Rule: `UnloadingDurationRule` → **PASS** (under 30-minute limit)

---

#### 9. Vehicle Departs (10:25:00 AM)

**Detector**: Zone Detector (line-crossing exit)
```typescript
{
  detectionType: 'line-crossing',
  tenantId: 'tenant-001',
  cameraId: 'cam-loading-001',
  timestamp: '2024-08-11T10:25:00Z',
  objects: [{
    label: 'truck',
    trackId: 'vehicle-track-001'
  }],
  metadata: {
    zoneId: 'zone-hq-loading',
    direction: 'exit'
  }
}
```

**Workflow Action**:
- State: `UNLOADING_COMPLETE` → `COMPLETED`
- Rule: `DepartureCompletionRule` → **PASS** (vehicle departed after unloading)
- Session marked as completed successfully
- **No violations detected**

---

## Complete Session Summary

```json
{
  "sessionId": "session-001",
  "tenantId": "tenant-001",
  "branchId": "branch-hq-001",
  "monitorId": "monitor-hq-001",
  "vehicleId": "vehicle-track-001",
  "plateNumber": "DL01CA1234",
  "status": "completed",
  "currentState": "COMPLETED",
  "arrivalTime": "2024-08-11T10:00:30Z",
  "departureTime": "2024-08-11T10:25:00Z",
  "unloadingStartTime": "2024-08-11T10:02:00Z",
  "unloadingEndTime": "2024-08-11T10:20:00Z",
  "totalDuration": 1470,
  "unloadingDuration": 1080,
  "personnelDetected": [
    {
      "personId": "person-track-001",
      "identityId": "identity-hq-john-doe",
      "role": "cash_guard",
      "verifiedAt": "2024-08-11T10:01:00Z"
    },
    {
      "personId": "person-track-002",
      "identityId": "identity-hq-jane-smith",
      "role": "cash_guard",
      "verifiedAt": "2024-08-11T10:01:00Z"
    },
    {
      "personId": "person-track-003",
      "identityId": "identity-hq-mike-johnson",
      "role": "escort",
      "verifiedAt": "2024-08-11T10:01:00Z"
    }
  ],
  "ruleResults": {
    "authorizedVehicle": "pass",
    "scheduledArrival": "pass",
    "minimumPersonnel": "pass",
    "escortVerification": "pass",
    "unloadingDuration": "pass",
    "transferRoute": "pass",
    "accessCorrelation": "pass",
    "objectEscort": "pass",
    "departureCompletion": "pass"
  },
  "violations": [],
  "anomalies": [],
  "evidence": {
    "videoClips": 12,
    "snapshots": 45,
    "eventCount": 89
  }
}
```

## Violation Example: Unauthorized Vehicle

If an unauthorized vehicle attempted entry:

```typescript
// ANPR reads plate: "MH99XY1234" (not in authorized list)
{
  detectionType: 'anpr',
  plateNumber: 'MH99XY1234'
}
```

**Result**:
- Rule: `AuthorizedVehicleRule` → **FAIL**
- Violation created:
```json
{
  "violationType": "unauthorized_vehicle",
  "severity": "critical",
  "message": "Vehicle MH99XY1234 is not authorized for cash operations",
  "requiresImmediate": true,
  "evidence": ["video-clip-001.mp4", "snapshot-001.jpg"]
}
```

## Testing with Mock Events

```typescript
import { MockEventGenerator } from './banking/__tests__/test-utils';

const generator = new MockEventGenerator('tenant-001', 'branch-hq-001');

// Generate complete successful workflow
const events = generator.generateCompleteWorkflow({
  vehiclePlate: 'DL01CA1234',
  personnelCount: 3,
  unloadingDuration: 1080,
});

// Process events
for (const event of events) {
  await eventBus.publish(event);
}
```

## API Monitoring

Monitor the session in real-time:

```bash
# Watch session progress
curl http://localhost:3002/v1/banking/sessions/session-001 \
  -H "x-analytics-source-key: YOUR_KEY"

# Get live timeline
curl http://localhost:3002/v1/banking/sessions/session-001/timeline \
  -H "x-analytics-source-key: YOUR_KEY"

# Check for violations
curl "http://localhost:3002/v1/banking/sessions/violations?sessionId=session-001" \
  -H "x-analytics-source-key: YOUR_KEY"
```

## Dashboard View

The operator sees:

1. **Active Session Card**
   - Vehicle: DL01CA1234
   - Status: In Progress (Unloading)
   - Duration: 18m 45s
   - Personnel: 3 verified (✓)
   - Violations: None

2. **Timeline View**
   - 09:58 AM: Vehicle approached
   - 09:58 AM: Plate identified (DL01CA1234) ✓
   - 10:00 AM: Entered loading zone ✓
   - 10:01 AM: Personnel verified (3) ✓
   - 10:02 AM: Unloading started
   - 10:15 AM: Transfer to vault ✓
   - 10:20 AM: Unloading complete ✓
   - 10:25 AM: Vehicle departed ✓

3. **Rule Status**
   - ✅ Authorized vehicle
   - ✅ Scheduled arrival
   - ✅ Minimum personnel
   - ✅ Escort verification
   - ✅ Unloading duration
   - ✅ Transfer route
   - ✅ Access correlation
   - ✅ Object escort
   - ✅ Departure completion

## Next Steps

1. Review the activation guide: `ACTIVATION_GUIDE.md`
2. Run the demo setup: `npm run setup-banking-demo`
3. Test with mock events: See `__tests__/test-utils.ts`
4. Monitor live sessions via dashboard
5. Adjust policies based on operational feedback
