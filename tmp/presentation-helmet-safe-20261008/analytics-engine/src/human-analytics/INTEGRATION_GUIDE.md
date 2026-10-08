# Human Analytics Integration Guide

## Quick Start

### 1. Database Setup

```bash
# Apply database schemas
psql -U postgres -d omsystems < src/human-analytics/database/schemas.sql
```

### 2. Initialize Pipeline

```typescript
import { HumanAnalyticsPipeline } from './human-analytics';

const pipeline = new HumanAnalyticsPipeline({
  tenantId: 'tenant-uuid',
  cameraId: 'camera-01',
  siteId: 'site-uuid',
  zoneId: 'lobby',
  gates: [
    {
      id: 'gate-01',
      cameraId: 'camera-01',
      tenantId: 'tenant-uuid',
      name: 'Main Entrance',
      lineStart: { x: 0.3, y: 0.5 },
      lineEnd: { x: 0.7, y: 0.5 },
      entrySide: 'positive',
      allowedDirection: 'both',
      minimumTrackAgeMs: 1000,
      cooldownMs: 5000
    }
  ],
  transitions: [
    {
      fromCameraId: 'camera-01',
      toCameraId: 'camera-02',
      minimumTravelSeconds: 5,
      maximumTravelSeconds: 45,
      probability: 0.8
    }
  ]
});
```

### 3. Process Frames

```typescript
import type { DetectionFrame } from './detectors/base-detector';

const frame: DetectionFrame = {
  frameId: 'frame-123',
  timestamp: new Date(),
  imageData: buffer,
  width: 1920,
  height: 1080,
  cameraId: 'camera-01'
};

const result = await pipeline.processFrame(frame);

console.log('Tracks:', result.tracks.length);
console.log('Behavior Events:', result.behaviorEvents.length);
console.log('Crossings:', result.crossingEvents.length);
console.log('Occupancy:', result.occupancy);
```

### 4. Register API Routes

```typescript
import { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { registerHumanAnalyticsRoutes } from './human-analytics';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

await registerHumanAnalyticsRoutes(app, pool);
```

## API Usage Examples

### Get Active Tracks

```bash
curl -H "x-tenant-id: tenant-uuid" \
  http://localhost:3000/api/human-analytics/tracks
```

### Get Journeys

```bash
curl -H "x-tenant-id: tenant-uuid" \
  "http://localhost:3000/api/human-analytics/journeys?status=active"
```

### Get Occupancy

```bash
curl -H "x-tenant-id: tenant-uuid" \
  http://localhost:3000/api/human-analytics/occupancy/lobby
```

### Get Behavior Events

```bash
curl -H "x-tenant-id: tenant-uuid" \
  "http://localhost:3000/api/human-analytics/behavior-events?severity=high"
```

### Review Event

```bash
curl -X PATCH \
  -H "x-tenant-id: tenant-uuid" \
  -H "x-user-id: user-123" \
  -H "Content-Type: application/json" \
  -d '{"status": "confirmed", "notes": "Verified incident"}' \
  http://localhost:3000/api/human-analytics/behavior-events/event-uuid/review
```

### Create Gate

```bash
curl -X POST \
  -H "x-tenant-id: tenant-uuid" \
  -H "Content-Type: application/json" \
  -d '{
    "cameraId": "camera-01",
    "name": "Side Door",
    "lineStart": {"x": 0.2, "y": 0.6},
    "lineEnd": {"x": 0.8, "y": 0.6},
    "entrySide": "negative",
    "allowedDirection": "both"
  }' \
  http://localhost:3000/api/human-analytics/gates
```

## Event Handling

### Subscribe to Behavior Events

```typescript
// Using EventEmitter pattern
pipeline.on('behaviorEvent', (event) => {
  console.log('New behavior event:', event.type);
  console.log('Confidence:', event.confidence);
  console.log('Severity:', event.severity);
  
  if (event.severity === 'critical') {
    // Trigger alert
    sendAlert(event);
  }
});
```

### Subscribe to Crossings

```typescript
pipeline.on('crossing', (crossing) => {
  console.log('Crossing detected:', crossing.direction);
  console.log('Gate:', crossing.gateId);
  console.log('Track:', crossing.localTrackId);
  
  // Update real-time occupancy display
  updateOccupancyDashboard();
});
```

## Configuration Best Practices

### Gate Placement

1. **Entry gates**: Place line perpendicular to entry direction
2. **Exit gates**: Separate from entry gates if possible
3. **Two-way gates**: Use `allowedDirection: "both"`
4. **Minimum track age**: 1-2 seconds to avoid false detections
5. **Cooldown**: 5-10 seconds to prevent double-counting

### Camera Transitions

1. **Travel time**: Measure actual travel time, add 20% buffer
2. **Probability**: Start with 0.5, adjust based on observed data
3. **Gate associations**: Link exit/entry gates for better matching
4. **Validation**: Test with known person movements

### Panic Detection

1. **Baseline period**: Collect 1-4 weeks of normal behavior
2. **Thresholds**: Start conservative (0.8), adjust based on false positives
3. **Persistence**: Require 2-3 seconds of sustained anomaly
4. **Correlation**: Integrate with access control, fire panel signals

## Monitoring

### Key Metrics to Track

```typescript
const stats = pipeline.getStatistics();

console.log('Frame count:', stats.frameCount);
console.log('Active tracks:', stats.tracking.confirmed);
console.log('Lost tracks:', stats.tracking.lost);
console.log('Fight candidates:', stats.fights.candidates);
console.log('Confirmed fights:', stats.fights.confirmed);
console.log('Total crossings:', stats.crossings?.totalCrossings);
console.log('Current occupancy:', stats.occupancy?.currentOccupancy);
```

### Health Checks

```typescript
import { getCapabilityRegistry } from './human-analytics';

const registry = getCapabilityRegistry();
const summary = registry.getHealthSummary();

console.log('Total capabilities:', summary.total);
console.log('Ready:', summary.ready);
console.log('Unavailable:', summary.unavailable);

// Check specific capability
const poseCheck = registry.checkCapability('pose_estimation');
if (!poseCheck.available) {
  console.warn('Pose estimation unavailable:', poseCheck.reason);
}
```

## Troubleshooting

### No Tracks Detected

1. Check person detection is working
2. Verify minimum confidence threshold
3. Check tracking timeout settings
4. Review frame rate (need consistent frames)

### Crossings Not Detected

1. Verify gate line coordinates
2. Check track status (must be confirmed)
3. Verify minimum track age
4. Check line intersection calculation
5. Review cooldown settings

### Occupancy Drift

1. Add manual reconciliation periodically
2. Check for unmonitored entrances
3. Review gate coverage
4. Correlate with access control events
5. Monitor track lifecycle (lost vs completed)

### Journey Matching Errors

1. Verify camera transitions configured
2. Check travel time bounds
3. Review appearance embedding quality
4. Check pgvector index created
5. Verify tenant isolation

### High False Positive Rate

1. Increase confidence thresholds
2. Add manual review workflow
3. Calibrate with validation dataset
4. Check lighting conditions
5. Review camera placement

## Performance Optimization

### Memory Management

```typescript
// Automatic cleanup every 10 seconds
// Manual cleanup can be triggered:
pipeline.performCleanup(new Date());
```

### Sampling Rates

```typescript
// Adjust in pipeline config:
const pipeline = new HumanAnalyticsPipeline({
  ...config,
  poseSampleRate: 5, // Every 5 frames
  cleanupIntervalMs: 15000 // 15 seconds
});
```

### Database Optimization

```sql
-- Add additional indexes if needed
CREATE INDEX idx_crossings_camera_date 
ON crossing_events(camera_id, crossed_at);

CREATE INDEX idx_behavior_camera_severity 
ON behavior_events(camera_id, severity, started_at);

-- Analyze tables periodically
ANALYZE camera_appearances;
ANALYZE behavior_events;
ANALYZE crossing_events;
```

## Security Considerations

### Tenant Isolation

Always include tenant_id in database queries:

```sql
WHERE tenant_id = $1 AND ...
```

### Audit Trail

All high-severity events are logged with:
- Model versions
- Configuration versions
- Evidence references
- Review status

### Data Retention

Configure retention policies:

```sql
-- Delete old appearances
DELETE FROM camera_appearances 
WHERE created_at < NOW() - INTERVAL '30 days';

-- Delete old crossings
DELETE FROM crossing_events 
WHERE crossed_at < NOW() - INTERVAL '90 days';
```

### Access Control

Implement permission checks:

```typescript
// Example middleware
async function checkJourneyAccess(request, reply) {
  const hasPermission = await checkPermission(
    request.headers['x-user-id'],
    'journey:read'
  );
  
  if (!hasPermission) {
    return reply.code(403).send({ error: 'Forbidden' });
  }
}
```

## Next Steps

1. **Model Integration**: Add YOLO, pose estimation, and ReID models
2. **Frontend UI**: Build React components for visualization
3. **Testing**: Create validation dataset and run integration tests
4. **Calibration**: Tune thresholds based on production data
5. **Monitoring**: Set up dashboards and alerting
6. **Documentation**: Add user guides and training materials
