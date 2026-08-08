# Event Bus Integration Guide

## Overview

The Sentinel Grid Event Bus provides a scalable, Redis-backed pub/sub system for decoupling services and enabling event-driven architecture.

## Architecture

```
┌─────────────────┐
│  Control Plane  │───┐
└─────────────────┘   │
                      │
┌─────────────────┐   │     ┌──────────────┐
│  Edge Agents    │───┼────►│  Event Bus   │
└─────────────────┘   │     │   (Redis)    │
                      │     └──────────────┘
┌─────────────────┐   │            │
│  Media Gateway  │───┤            │
└─────────────────┘   │            ▼
                      │     ┌──────────────┐
┌─────────────────┐   │     │ Subscribers  │
│  Analytics      │───┤     │ - Alerts     │
└─────────────────┘   │     │ - Recording  │
                      │     │ - Analytics  │
┌─────────────────┐   │     │ - Federation │
│  Recording      │───┘     │ - Reporting  │
└─────────────────┘         └──────────────┘
```

## Event Schema

All events follow a standardized structure:

```typescript
{
  eventId: string;           // Unique event ID
  eventType: string;         // e.g., "sentinel.camera.status.changed"
  schemaVersion: number;     // Schema version for evolution
  tenantId: string;          // Multi-tenant isolation
  branchId?: string;         // Optional branch context
  deviceId?: string;         // Optional device context
  timestamp: string;         // ISO 8601 timestamp
  source: string;            // Service that emitted the event
  correlationId?: string;    // For tracing related events
  causationId?: string;      // Event that caused this event
  userId?: string;           // User who triggered the event
  metadata?: {               // Optional metadata
    traceId?: string;
    spanId?: string;
  };
  payload: T;                // Event-specific payload
}
```

## Setup

### 1. Initialize Event Bus

In your main application entry point:

```typescript
import { getEventBus } from './infrastructure/event-bus/index.js';
import config from './config.js';

// Initialize event bus
const eventBus = getEventBus({
  redisUrl: config.REDIS_URL,
  serviceName: 'control-plane',
  enablePersistence: true,
  defaultRetries: 3,
  enableDeadLetterQueue: true,
});

// Connect to Redis
await eventBus.connect();

// Add to your app shutdown handler
process.on('SIGTERM', async () => {
  await eventBus.disconnect();
  process.exit(0);
});
```

### 2. Use Event Emitters

```typescript
import { EventEmitters } from './infrastructure/event-bus/index.js';
import { getEventBus } from './infrastructure/event-bus/index.js';

const eventBus = getEventBus();
const events = new EventEmitters(eventBus);

// Emit camera status change
await events.camera.statusChanged(
  tenantId,
  cameraId,
  'offline',
  'online',
  {
    branchId: branchId,
    reason: 'recovered_from_reboot',
    details: { uptime: 120 }
  }
);

// Emit recording gap detected
await events.recording.gapDetected(
  tenantId,
  cameraId,
  '2024-01-15T10:00:00Z',
  '2024-01-15T10:05:00Z',
  300, // 5 minutes
  {
    branchId: branchId,
    reason: 'camera_offline'
  }
);

// Emit storage warning
await events.storage.warning(
  tenantId,
  deviceId,
  1000000000000, // 1TB
  850000000000,  // 850GB used
  150000000000,  // 150GB available
  85,            // 85% usage
  {
    branchId: branchId,
    threshold: 'warning',
    affectedCameras: [camera1, camera2]
  }
);
```

### 3. Subscribe to Events

```typescript
import { EventType, type TypedEvent } from './infrastructure/event-bus/index.js';
import { getEventBus } from './infrastructure/event-bus/index.js';

const eventBus = getEventBus();

// Subscribe to specific event type
await eventBus.subscribe(
  EventType.CAMERA_STATUS_CHANGED,
  async (event: TypedEvent<EventType.CAMERA_STATUS_CHANGED>) => {
    console.log('Camera status changed:', event.payload);
    
    // Handle the event
    if (event.payload.newStatus === 'offline') {
      // Trigger alert
      await createCameraOfflineAlert(event.payload.cameraId);
    }
  },
  {
    tenantId: 'tenant-123', // Optional: filter by tenant
    retryOnFailure: true,
    maxRetries: 3
  }
);

// Subscribe to pattern (all camera events)
await eventBus.subscribePattern(
  'sentinel.camera.*',
  async (event) => {
    console.log('Camera event received:', event.eventType);
    // Update camera health metrics
    await updateCameraMetrics(event.payload);
  }
);

// Subscribe to multiple event types
const alertEventTypes = [
  EventType.ALERT_CREATED,
  EventType.ALERT_ACKNOWLEDGED,
  EventType.ALERT_RESOLVED,
];

for (const eventType of alertEventTypes) {
  await eventBus.subscribe(eventType, handleAlertEvent);
}
```

## Integration Examples

### Control Plane → Alert System

**Control Plane** emits camera status changes:

```typescript
// In camera status monitoring service
import { EventEmitters } from './infrastructure/event-bus/index.js';
import { getEventBus } from './infrastructure/event-bus/index.js';

const events = new EventEmitters(getEventBus());

async function checkCameraHealth(camera: Camera) {
  const previousStatus = camera.status;
  const newStatus = await pingCamera(camera);
  
  if (previousStatus !== newStatus) {
    // Emit event instead of direct database write or API call
    await events.camera.statusChanged(
      camera.tenantId,
      camera.id,
      previousStatus,
      newStatus,
      {
        branchId: camera.branchId,
        reason: 'health_check',
      }
    );
  }
}
```

**Alert System** subscribes and creates alerts:

```typescript
// In alert service initialization
import { EventType } from './infrastructure/event-bus/index.js';
import { getEventBus } from './infrastructure/event-bus/index.js';

const eventBus = getEventBus();

await eventBus.subscribe(
  EventType.CAMERA_STATUS_CHANGED,
  async (event) => {
    const { cameraId, newStatus } = event.payload;
    
    if (newStatus === 'offline') {
      // Create alert
      const alertId = await createAlert({
        tenantId: event.tenantId,
        type: 'camera_offline',
        severity: 'high',
        cameraId: cameraId,
        branchId: event.branchId,
      });
      
      // Emit alert created event for other services
      await events.alert.created(
        event.tenantId,
        alertId,
        'camera_offline',
        'high',
        'Camera Offline',
        `Camera ${cameraId} is offline`,
        {
          branchId: event.branchId,
          deviceId: cameraId,
          sourceEventId: event.eventId,
        }
      );
    }
  }
);
```

### Analytics → Incident Management

**Analytics Engine** emits AI detections:

```typescript
// In analytics processing
import { EventEmitters } from './infrastructure/event-bus/index.js';
import { getEventBus } from './infrastructure/event-bus/index.js';

const events = new EventEmitters(getEventBus());

async function processFrame(frame: VideoFrame, camera: Camera) {
  const detections = await runAIModel(frame);
  
  for (const detection of detections) {
    if (detection.type === 'person' && detection.confidence > 0.9) {
      await events.ai.detectionCreated(
        camera.tenantId,
        detection.id,
        'person',
        camera.id,
        detection.confidence,
        frame.timestamp,
        {
          branchId: camera.branchId,
          boundingBox: detection.bbox,
          snapshotUrl: await saveSnapshot(frame, detection),
        }
      );
    }
  }
}
```

**Incident Management** subscribes and correlates:

```typescript
// In incident correlation service
import { EventType } from './infrastructure/event-bus/index.js';
import { getEventBus } from './infrastructure/event-bus/index.js';

const eventBus = getEventBus();

await eventBus.subscribe(
  EventType.AI_DETECTION_CREATED,
  async (event) => {
    // Correlate detections into incidents
    const incident = await correlateDetection(event.payload);
    
    if (incident.shouldCreate) {
      await events.incident.created(
        event.tenantId,
        incident.id,
        incident.type,
        incident.severity,
        incident.title,
        incident.description,
        true,
        {
          branchId: event.branchId,
          sourceDetectionIds: [event.payload.detectionId],
          affectedCameras: [event.payload.cameraId],
        }
      );
    }
  }
);
```

### Recording Engine → Storage Management

**Recording Engine** emits gap detection:

```typescript
// In recording monitor
import { EventEmitters } from './infrastructure/event-bus/index.js';
import { getEventBus } from './infrastructure/event-bus/index.js';

const events = new EventEmitters(getEventBus());

async function checkRecordingContinuity(camera: Camera) {
  const gaps = await detectRecordingGaps(camera);
  
  for (const gap of gaps) {
    await events.recording.gapDetected(
      camera.tenantId,
      camera.id,
      gap.start,
      gap.end,
      gap.duration,
      {
        branchId: camera.branchId,
        reason: gap.reason,
      }
    );
  }
}
```

**Storage Management** subscribes and adjusts retention:

```typescript
// In storage management service
import { EventType } from './infrastructure/event-bus/index.js';
import { getEventBus } from './infrastructure/event-bus/index.js';

const eventBus = getEventBus();

await eventBus.subscribe(
  EventType.RECORDING_GAP_DETECTED,
  async (event) => {
    // Track gaps for retention policy adjustments
    await recordGapMetric(event.payload);
    
    // If too many gaps, alert storage team
    const gapRate = await calculateGapRate(event.branchId);
    if (gapRate > 0.05) { // 5% gap rate
      await events.storage.warning(
        event.tenantId,
        event.branchId,
        // ... storage details
      );
    }
  }
);
```

## Event History & Replay

Query event history for debugging or auditing:

```typescript
import { getEventBus } from './infrastructure/event-bus/index.js';
import { EventType } from './infrastructure/event-bus/index.js';

const eventBus = getEventBus();

// Get recent camera events for a tenant
const events = await eventBus.getEventHistory({
  tenantId: 'tenant-123',
  eventTypes: [
    EventType.CAMERA_STATUS_CHANGED,
    EventType.CAMERA_STREAM_FAILED,
  ],
  startTime: new Date('2024-01-15T00:00:00Z'),
  endTime: new Date('2024-01-15T23:59:59Z'),
  limit: 100,
});

console.log(`Found ${events.length} camera events`);
```

## Dead Letter Queue

Failed event handlers are automatically moved to a dead letter queue:

```typescript
// Monitor dead letter queue
const dlqKey = `sentinel:dlq:${tenantId}`;
const failedEvents = await redis.lRange(dlqKey, 0, -1);

for (const entry of failedEvents) {
  const { event, error, failedAt } = JSON.parse(entry);
  console.error(`Event ${event.eventId} failed:`, error);
  
  // Retry or alert operations team
}
```

## Health Monitoring

```typescript
import { getEventBus } from './infrastructure/event-bus/index.js';

const eventBus = getEventBus();

const health = await eventBus.healthCheck();
console.log('Event Bus Health:', health);
// { connected: true, subscriptions: 15 }
```

## Best Practices

### 1. Event Naming

- Use dot notation: `sentinel.<domain>.<action>`
- Past tense for events: `.created`, `.changed`, `.detected`
- Keep names descriptive but concise

### 2. Event Granularity

- Emit fine-grained events (camera status changed)
- Let subscribers aggregate/correlate as needed
- Avoid "god events" with too much data

### 3. Idempotency

- Design event handlers to be idempotent
- Use `eventId` to deduplicate if needed
- Handle duplicate delivery gracefully

### 4. Error Handling

- Let the event bus handle retries
- Use dead letter queue for persistent failures
- Monitor DLQ and alert on accumulation

### 5. Correlation

- Use `correlationId` for related events
- Use `causationId` to link cause and effect
- Enables distributed tracing

### 6. Performance

- Keep event payloads small (< 1MB)
- Use references (IDs) instead of embedding large objects
- Consider separate channels for high-volume events

### 7. Schema Evolution

- Use `schemaVersion` for backward compatibility
- Handle old and new versions in subscribers
- Document breaking changes

## Migration Strategy

### Phase 1: Parallel Run
- Deploy event bus alongside existing code
- Emit events but don't remove existing calls
- Test subscribers in shadow mode

### Phase 2: Gradual Migration
- Start with non-critical paths (analytics, reporting)
- Replace synchronous calls with event subscriptions
- Monitor performance and reliability

### Phase 3: Full Adoption
- Remove old synchronous coupling
- All cross-service communication via events
- Deprecate direct API calls between services

## Example: Full Integration

```typescript
// app.ts - Initialize event bus
import { getEventBus, EventEmitters } from './infrastructure/event-bus/index.js';
import config from './config.js';

const eventBus = getEventBus({
  redisUrl: config.REDIS_URL,
  serviceName: 'control-plane',
});

await eventBus.connect();

const events = new EventEmitters(eventBus);

// Export for use in services
export { eventBus, events };

// camera-monitor.ts - Emit events
import { events } from './app.js';

export async function updateCameraStatus(camera: Camera, newStatus: string) {
  const oldStatus = camera.status;
  camera.status = newStatus;
  await saveCamera(camera);
  
  // Emit event
  await events.camera.statusChanged(
    camera.tenantId,
    camera.id,
    oldStatus,
    newStatus,
    { branchId: camera.branchId }
  );
}

// alert-service.ts - Subscribe to events
import { eventBus } from './app.js';
import { EventType } from './infrastructure/event-bus/index.js';

export async function initializeAlertService() {
  await eventBus.subscribe(
    EventType.CAMERA_STATUS_CHANGED,
    handleCameraStatusChange
  );
  
  await eventBus.subscribe(
    EventType.STORAGE_WARNING,
    handleStorageWarning
  );
}

async function handleCameraStatusChange(event) {
  if (event.payload.newStatus === 'offline') {
    await createAlert({
      type: 'camera_offline',
      cameraId: event.payload.cameraId,
      // ...
    });
  }
}
```

## Monitoring & Observability

Key metrics to track:

- **Event throughput**: Events published/consumed per second
- **Event latency**: Time from publish to consumption
- **Subscription health**: Active subscriptions, error rates
- **DLQ depth**: Number of failed events
- **Redis connection**: Connection status, memory usage

## Troubleshooting

### Events not being received
1. Check Redis connection: `await eventBus.healthCheck()`
2. Verify subscription is active
3. Check event type spelling
4. Review tenant/branch filters

### High latency
1. Check Redis performance
2. Review handler execution time
3. Consider scaling Redis or using Redis Cluster
4. Use patterns carefully (can be slow)

### Memory issues
1. Review event history retention (default 7 days)
2. Trim DLQ regularly
3. Monitor Redis memory usage
4. Consider separate Redis instance for events

## Production Deployment

### Redis Configuration

For production, use Redis Cluster or Sentinel for high availability:

```bash
# Redis configuration
maxmemory 2gb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000
appendonly yes
appendfsync everysec
```

### Monitoring

Set up alerts for:
- Redis connection failures
- High DLQ depth (> 100 events)
- Event latency > 1 second
- Subscription failures

### Scaling

- Run multiple instances of each service
- Each instance subscribes independently
- Redis handles load balancing automatically
- Consider message partitioning for very high throughput

## Summary

The Event Bus provides:

✅ **Decoupling** - Services communicate without direct dependencies
✅ **Scalability** - Easily add new subscribers without changing publishers
✅ **Reliability** - Built-in retries, DLQ, and persistence
✅ **Observability** - Event history, correlation IDs, distributed tracing
✅ **Flexibility** - Pattern matching, filtering, multiple subscribers

This enables the Sentinel Grid system to scale from single-server deployments to distributed multi-region architectures.
