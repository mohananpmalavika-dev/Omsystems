# Event Bus Integration

Real-time event ingestion system using NATS messaging for Security Commander. Enables pub/sub architecture for distributed security event processing.

---

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────────┐
│   Cameras   │────▶│              │────▶│                     │
├─────────────┤     │              │     │  Event Ingestion    │
│ Access Ctrl │────▶│     NATS     │────▶│      Service        │
├─────────────┤     │   Event Bus  │     │                     │
│  Network    │────▶│              │────▶│  ┌───────────────┐  │
├─────────────┤     │              │     │  │   Normalizer  │  │
│   Storage   │────▶│              │     │  └───────────────┘  │
├─────────────┤     └──────────────┘     │  ┌───────────────┐  │
│  AI Engine  │                          │  │    Anomaly    │  │
└─────────────┘                          │  │   Detection   │  │
                                         │  └───────────────┘  │
                                         │  ┌───────────────┐  │
                                         │  │  Correlation  │  │
                                         │  │    Engine     │  │
                                         │  └───────────────┘  │
                                         └─────────────────────┘
                                                    │
                                         ┌──────────▼──────────┐
                                         │    PostgreSQL       │
                                         │   (Events, Inc.)    │
                                         └─────────────────────┘
```

---

## Features

- **Real-time ingestion** - Events processed as they occur
- **Scalable** - Queue groups for load balancing across instances
- **Reliable** - Message acknowledgment and dead letter queue
- **Type-safe** - Full TypeScript support with payload validation
- **Automatic processing** - Normalization, anomaly detection, correlation
- **Pub/sub patterns** - Publish investigation/incident events
- **Statistics** - Track message throughput and processing times

---

## NATS Subject Structure

### Security Event Subjects

```
security.camera.>           All camera events
security.camera.offline     Camera offline
security.camera.tamper      Camera tampering

security.access.>           All access control events
security.access.granted     Access granted
security.access.denied      Access denied
security.access.unauthorized Unauthorized access

security.network.>          All network events
security.network.down       Network device down
security.network.degraded   Network degraded

security.storage.>          All storage events
security.storage.full       Storage full
security.storage.failure    Storage failure

security.ai.>               All AI detection events
security.ai.fire            Fire detected
security.ai.smoke           Smoke detected
security.ai.person          Person detected
security.ai.weapon          Weapon detected

security.recorder.>         All recorder events
security.recorder.offline   Recorder offline
security.recorder.error     Recorder error
```

### Commander Output Subjects

```
commander.investigation.created    New investigation
commander.incident.created         New incident
commander.evidence.collected       Evidence collected
```

---

## Installation

### Prerequisites

```bash
# Install NATS server
# macOS
brew install nats-server

# Linux
wget https://github.com/nats-io/nats-server/releases/download/v2.10.5/nats-server-v2.10.5-linux-amd64.zip
unzip nats-server-v2.10.5-linux-amd64.zip
sudo mv nats-server /usr/local/bin/

# Windows (using Scoop)
scoop install nats-server
```

### Start NATS Server

```bash
# Basic start
nats-server

# With configuration
nats-server -c nats-server.conf

# With JetStream (for persistence)
nats-server -js
```

### Install Dependencies

```bash
npm install nats
```

---

## Quick Start

### 1. Start Event Bus Service

```typescript
import { EventBusService } from './security-commander/event-bus';
import { EventIngestionService } from './security-commander/services';
import { NormalizerRegistry } from './security-commander/normalizers';

// Initialize dependencies (see event-bus-integration.example.ts)
const eventIngestionService = new EventIngestionService(/* ... */);
const normalizerRegistry = new NormalizerRegistry();

// Create and start event bus
const eventBus = new EventBusService({
  natsServers: ['nats://localhost:4222'],
  eventIngestionService,
  normalizerRegistry,
});

await eventBus.start();
console.log('Event bus started');
```

### 2. Publish Events

```typescript
import { NatsClient } from './security-commander/event-bus';

const client = new NatsClient(['nats://localhost:4222']);
await client.connect();

// Publish camera event
await client.publish('security.camera.offline', {
  cameraId: 'camera_entrance_01',
  eventType: 'camera_offline',
  timestamp: new Date(),
  severity: 75,
  description: 'Camera lost connection',
  metadata: {
    location: 'Main Entrance',
    zone: 'perimeter',
  },
});

await client.disconnect();
```

### 3. Subscribe to Investigation Events

```typescript
import { NatsClient } from './security-commander/event-bus';

const client = new NatsClient(['nats://localhost:4222']);
await client.connect();

await client.subscribe(
  { subject: 'commander.investigation.created' },
  async (message) => {
    console.log('New investigation:', message.data);
    // Send notification, webhook, etc.
  }
);
```

---

## Usage Examples

### Camera Offline Event

```typescript
await natsClient.publish('security.camera.offline', {
  cameraId: 'camera_lobby_main',
  eventType: 'camera_offline',
  timestamp: new Date(),
  severity: 75,
  description: 'Camera lost connection',
  metadata: {
    location: 'Main Lobby',
    zone: 'entrance',
    lastSeen: '2024-01-15T10:30:00Z',
  },
});
```

### Unauthorized Access Event

```typescript
await natsClient.publish('security.access.unauthorized', {
  doorId: 'door_server_room',
  userId: 'unknown',
  badgeId: 'badge_12345',
  eventType: 'unauthorized_access',
  timestamp: new Date(),
  allowed: false,
  reason: 'Badge not authorized for this door',
  metadata: {
    location: 'Server Room',
    attemptCount: 3,
  },
});
```

### AI Fire Detection Event

```typescript
await natsClient.publish('security.ai.fire', {
  detectionId: 'det_fire_001',
  cameraId: 'camera_warehouse_01',
  detectionType: 'fire',
  timestamp: new Date(),
  confidence: 0.95,
  boundingBox: {
    x: 150,
    y: 200,
    width: 100,
    height: 120,
  },
  metadata: {
    modelVersion: '2.1.0',
    frameNumber: 12345,
  },
});
```

### Network Switch Down Event

```typescript
await natsClient.publish('security.network.down', {
  deviceId: 'switch_floor3',
  deviceType: 'switch',
  eventType: 'switch_down',
  timestamp: new Date(),
  status: 'down',
  metadata: {
    ipAddress: '192.168.3.1',
    affectedDevices: ['camera_301', 'camera_302', 'camera_303'],
  },
});
```

---

## Configuration

### Environment Variables

```env
# NATS server URL
NATS_URL=nats://localhost:4222

# Multiple servers for clustering
NATS_SERVERS=nats://server1:4222,nats://server2:4222,nats://server3:4222

# Connection options
NATS_MAX_RECONNECT_ATTEMPTS=-1  # -1 for infinite
NATS_RECONNECT_TIME_WAIT=2000   # milliseconds
NATS_CLIENT_NAME=security-commander
```

### NatsClient Options

```typescript
const client = new NatsClient(
  ['nats://localhost:4222'], // servers
  {
    maxReconnectAttempts: -1,    // -1 = infinite
    reconnectTimeWait: 2000,     // ms
    name: 'security-commander',  // client identifier
  }
);
```

### Subscription Options

```typescript
await client.subscribe(
  {
    subject: 'security.camera.>',  // Subject pattern
    queue: 'security-commander',   // Queue group (load balancing)
    durable: true,                 // Durable subscription
    ackWait: 30000,               // Acknowledgment timeout (ms)
    maxDeliver: 3,                // Max delivery attempts
  },
  handler
);
```

---

## Queue Groups

Queue groups enable **load balancing** - only one subscriber in the group receives each message.

```typescript
// Instance 1
await client1.subscribe(
  { subject: 'security.camera.>', queue: 'security-commander' },
  handler
);

// Instance 2 (same queue group)
await client2.subscribe(
  { subject: 'security.camera.>', queue: 'security-commander' },
  handler
);

// Events distributed evenly between instance1 and instance2
```

---

## Event Flow

### 1. Event Published to NATS

```typescript
Camera → NATS → security.camera.offline
```

### 2. EventBusService Receives Message

```typescript
EventBusService.handleCameraEvent()
```

### 3. Normalized to SecurityEvent

```typescript
{
  id: 'evt_123...',
  eventType: 'camera_offline',
  timestamp: Date,
  source: 'camera',
  assetId: 'camera_lobby_main',
  severity: 75,
  ...
}
```

### 4. Ingested by EventIngestionService

```typescript
eventIngestionService.ingestEvent(securityEvent)
```

### 5. Automatic Processing

```
┌─────────────────┐
│   Normalizer    │ (if raw event)
└────────┬────────┘
         │
┌────────▼────────┐
│ Anomaly Engine  │ (detect unusual patterns)
└────────┬────────┘
         │
┌────────▼────────┐
│ Event Repository│ (save to database)
└────────┬────────┘
         │
┌────────▼────────┐
│Correlation Engine│ (find related events)
└────────┬────────┘
         │
┌────────▼────────┐
│ Create Incident │ (if correlated)
└─────────────────┘
```

### 6. Publish Investigation Event

```typescript
await eventBus.publishInvestigationCreated(investigationId, metadata);
```

---

## Dead Letter Queue

Failed messages automatically published to `security.dlq`:

```typescript
await client.subscribe(
  { subject: 'security.dlq' },
  async (message) => {
    console.error('Failed message:', message.data);
    // Log to monitoring system, alert admin, etc.
  }
);
```

---

## Statistics

```typescript
const stats = eventBus.getStats();
console.log(stats);

/*
{
  messagesReceived: 1250,
  messagesProcessed: 1248,
  messagesFailed: 2,
  averageProcessingTime: 45.2, // ms
  subscriptions: [
    {
      subject: 'security.camera.>',
      queue: 'security-commander',
      messageCount: 350,
      lastMessage: Date
    },
    ...
  ]
}
*/
```

---

## Performance

### Throughput

- **Single instance**: ~500-1000 events/sec
- **Clustered (3 instances)**: ~1500-3000 events/sec
- **NATS limit**: ~10M messages/sec (depends on hardware)

### Latency

- **Network latency**: <1ms (local), 5-50ms (network)
- **Processing latency**: 20-100ms (depends on complexity)
- **End-to-end latency**: <200ms (typical)

### Optimization

```typescript
// 1. Batch processing
const events = [];
await client.subscribe({ subject: 'security.>' }, async (msg) => {
  events.push(msg.data);
  if (events.length >= 100) {
    await eventIngestionService.ingestBulk(events);
    events.length = 0;
  }
});

// 2. Multiple queue groups for horizontal scaling
// Instance 1
await client1.subscribe(
  { subject: 'security.camera.>', queue: 'group1' },
  handler
);

// Instance 2
await client2.subscribe(
  { subject: 'security.camera.>', queue: 'group1' },
  handler
);
```

---

## High Availability

### NATS Clustering

```bash
# Server 1
nats-server -p 4222 -cluster nats://0.0.0.0:6222 \
  -routes nats://server2:6222,nats://server3:6222

# Server 2
nats-server -p 4222 -cluster nats://0.0.0.0:6222 \
  -routes nats://server1:6222,nats://server3:6222

# Server 3
nats-server -p 4222 -cluster nats://0.0.0.0:6222 \
  -routes nats://server1:6222,nats://server2:6222
```

### Client Configuration

```typescript
const client = new NatsClient([
  'nats://server1:4222',
  'nats://server2:4222',
  'nats://server3:4222',
], {
  maxReconnectAttempts: -1, // Never give up reconnecting
  reconnectTimeWait: 2000,
});
```

---

## Security

### TLS Encryption

```typescript
const client = new NatsClient(['nats://localhost:4222'], {
  tls: {
    ca: fs.readFileSync('./ca.pem'),
    cert: fs.readFileSync('./client-cert.pem'),
    key: fs.readFileSync('./client-key.pem'),
  },
});
```

### Authentication

```typescript
const client = new NatsClient(['nats://localhost:4222'], {
  user: 'security-commander',
  pass: process.env.NATS_PASSWORD,
});

// Or with token
const client = new NatsClient(['nats://localhost:4222'], {
  token: process.env.NATS_TOKEN,
});
```

---

## Monitoring

### Health Check

```typescript
app.get('/health/event-bus', (req, res) => {
  const isConnected = eventBus.isConnected();
  const stats = eventBus.getStats();
  
  res.json({
    status: isConnected ? 'healthy' : 'unhealthy',
    connected: isConnected,
    stats,
  });
});
```

### Prometheus Metrics

```typescript
import * as prometheus from 'prom-client';

const eventsReceived = new prometheus.Counter({
  name: 'security_events_received_total',
  help: 'Total security events received',
  labelNames: ['subject', 'source'],
});

const processingTime = new prometheus.Histogram({
  name: 'security_event_processing_seconds',
  help: 'Event processing time',
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
});
```

---

## Troubleshooting

### Connection Issues

```typescript
// Check NATS server is running
nats-server -V

// Test connection with CLI
nats pub test "hello"
nats sub test

// Enable debug logging
const client = new NatsClient(['nats://localhost:4222'], {
  debug: true,
});
```

### Message Not Processed

1. Check subscription is active: `eventBus.getStats()`
2. Verify subject pattern matches: `security.camera.offline` matches `security.camera.>`
3. Check for errors in handler
4. Look for messages in DLQ: subscribe to `security.dlq`

### High Latency

1. Check NATS server load
2. Monitor processing time in stats
3. Consider batch processing
4. Add more queue group instances

---

## Testing

### Unit Tests

```typescript
import { NatsClient } from './nats-client';
import { EventBusService } from './event-bus.service';

describe('EventBusService', () => {
  it('should handle camera events', async () => {
    const mockIngestion = {
      ingestEvent: jest.fn(),
    };
    
    const eventBus = new EventBusService({
      eventIngestionService: mockIngestion,
      normalizerRegistry: new NormalizerRegistry(),
    });
    
    await eventBus.start();
    
    // Publish test event
    await natsClient.publish('security.camera.offline', testPayload);
    
    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 100));
    
    expect(mockIngestion.ingestEvent).toHaveBeenCalled();
  });
});
```

### Integration Tests

```bash
# Start test NATS server
nats-server -p 4223

# Run tests
NATS_URL=nats://localhost:4223 npm test
```

---

## Docker Deployment

```yaml
# docker-compose.yml
version: '3.8'
services:
  nats:
    image: nats:2.10-alpine
    ports:
      - "4222:4222"
      - "8222:8222"  # HTTP monitoring
    command: ["--js", "--http_port", "8222"]
  
  security-commander:
    build: .
    environment:
      NATS_URL: nats://nats:4222
    depends_on:
      - nats
      - postgres
```

---

## Best Practices

1. **Use queue groups** for load balancing
2. **Handle errors gracefully** - messages go to DLQ
3. **Set appropriate timeouts** based on processing complexity
4. **Monitor statistics** regularly
5. **Use wildcard subjects** sparingly - can be slow
6. **Batch when possible** for high throughput
7. **Enable JetStream** for message persistence
8. **Use TLS in production**
9. **Implement circuit breakers** for external dependencies
10. **Log correlation IDs** for debugging

---

## License

Part of the OmSystems AI Security Commander system.
