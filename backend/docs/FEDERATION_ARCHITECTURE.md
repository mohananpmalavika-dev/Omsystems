# Federation Architecture

## Multi-Control-Center Event-Driven Synchronization

This document describes the robust, production-ready federation architecture for OM Systems' distributed surveillance platform.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Federation Bus                            │
│          (Event Sourcing + Outbox/Inbox Pattern)            │
└─────────────────────────────────────────────────────────────┘
                          ▲    │    ▼
        ┌─────────────────┼────┼────┼─────────────────┐
        │                 │    │    │                 │
        │                 │    │    │                 │
┌───────▼───────┐  ┌──────▼────▼────▼──────┐  ┌──────▼────────┐
│ Control       │  │  Global Command       │  │  Control      │
│ Center A      │  │  Center               │  │  Center C     │
│ (Regional)    │  │  (Coordinator)        │  │  (Regional)   │
│               │  │                       │  │               │
│ • Cameras     │  │  • Federation Mgr     │  │  • Cameras    │
│ • Events      │  │  • Event Log          │  │  • Events     │
│ • Storage     │  │  • Routing            │  │  • Storage    │
└───────────────┘  └───────────────────────┘  └───────────────┘
```

## Core Components

### 1. Federation Bus (`federation-bus.service.ts`)

The central nervous system of the federation. Implements:

- **Event Sourcing**: All changes captured as immutable events
- **Outbox Pattern**: Guaranteed event delivery to remote servers
- **Inbox Pattern**: Idempotent event reception and deduplication
- **Sequence Numbers**: Monotonic ordering per origin server
- **Checksums**: Integrity verification (SHA-256)

### 2. Event Structure

Every federation event contains:

```typescript
{
  event_id: string;           // Globally unique
  origin_server: string;       // Source server ID
  sequence_number: bigint;     // Monotonic per-server
  tenant_id: string;           // Multi-tenancy isolation
  timestamp: Date;             // Event creation time
  event_type: string;          // e.g., "camera.created"
  aggregate_type: string;      // e.g., "camera"
  aggregate_id: string;        // Entity ID
  schema_version: string;      // Event schema version
  payload: Record<string, any>; // Event data
  checksum: string;            // SHA-256 integrity check
  correlation_id?: string;     // For tracing workflows
  causation_id?: string;       // For causality tracking
}
```

### 3. Federation Manager (`federation-manager.service.ts`)

Responsibilities:
- Server registration and health monitoring
- Routing decisions based on resource ownership
- Failover and circuit breaker patterns
- Heartbeat monitoring (15s intervals)
- Health scoring and server ranking

### 4. Federation Gateway (`federation-gateway.service.ts`)

Responsibilities:
- Request routing to appropriate regional servers
- Broadcast operations (search, aggregation)
- Circuit breaker for failed servers
- Request caching (30s TTL)
- Response aggregation

### 5. Federation Sync (`federation-sync.service.ts`)

Responsibilities:
- Event-driven entity synchronization
- Full/incremental sync jobs
- Subscription to local entity events
- Automatic event publishing to federation bus

### 6. Federation Search (`federation-search.service.ts`)

Responsibilities:
- Cross-server search aggregation
- Journey reconstruction (vehicle/person tracking)
- Coordinated activity detection
- Result caching (5min TTL)

### 7. Federation Playback (`federation-playback.service.ts`)

Responsibilities:
- Cross-server video timeline construction
- Multi-camera synchronized playback
- Gap detection and reporting
- Segment URL generation

## Event Flow

### Publishing Events (Outbox Pattern)

```
1. Local Entity Change
   └─> Event Created (with sequence number, checksum)
       └─> Appended to Event Log (immutable)
           └─> Added to Outbox (target servers)
               └─> Background Processor
                   └─> HTTP POST to Remote Servers
                       └─> Mark as Completed/Retry
```

### Receiving Events (Inbox Pattern)

```
1. HTTP POST /v1/federation/events/receive
   └─> Verify Checksum
       └─> Check Idempotency Key (origin:event_id:seq)
           └─> Insert to Inbox (status: received)
               └─> Background Processor
                   └─> Apply to Local Database
                       └─> Emit to Local Subscribers
                           └─> Mark as Applied
```

## Database Schema

### Event Log (Append-Only)
```sql
CREATE TABLE federation_event_log (
  id BIGSERIAL PRIMARY KEY,
  event_id TEXT UNIQUE,
  origin_server TEXT NOT NULL,
  sequence_number BIGINT NOT NULL,
  tenant_id UUID NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  schema_version TEXT NOT NULL,
  checksum TEXT NOT NULL,
  event_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_fed_event_log_origin_seq_unique 
  ON federation_event_log(origin_server, sequence_number);
```

### Outbox
```sql
CREATE TABLE federation_event_outbox (
  id UUID PRIMARY KEY,
  event_id TEXT REFERENCES federation_event_log(event_id),
  event_data JSONB NOT NULL,
  target_servers TEXT[] NOT NULL,
  status TEXT CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  retry_count INT DEFAULT 0,
  max_retries INT DEFAULT 5,
  next_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ
);
```

### Inbox
```sql
CREATE TABLE federation_event_inbox (
  id UUID PRIMARY KEY,
  event_id TEXT NOT NULL,
  source_server TEXT NOT NULL,
  event_data JSONB NOT NULL,
  idempotency_key TEXT UNIQUE NOT NULL,
  status TEXT CHECK (status IN ('received', 'processing', 'applied', 'duplicate', 'failed')),
  received_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ
);
```

### Sync State
```sql
CREATE TABLE federation_sync_state (
  local_server_id TEXT,
  remote_server_id TEXT,
  last_received_sequence BIGINT DEFAULT 0,
  last_sent_sequence BIGINT DEFAULT 0,
  last_sync_at TIMESTAMPTZ DEFAULT now(),
  sync_lag_seconds INT,
  is_healthy BOOLEAN DEFAULT true,
  PRIMARY KEY (local_server_id, remote_server_id)
);
```

## Guarantees

### 1. Exactly-Once Processing
- Idempotency keys prevent duplicate application
- Outbox ensures every event is published
- Inbox ensures every event is processed once

### 2. Ordered Delivery (per origin)
- Sequence numbers maintain order from each server
- Events processed in sequence order per origin
- Cross-server ordering is eventual

### 3. Data Integrity
- SHA-256 checksums verify event integrity
- Schema versioning for forward/backward compatibility
- Immutable event log for audit trail

### 4. Fault Tolerance
- Automatic retry with exponential backoff
- Circuit breakers prevent cascade failures
- Health monitoring and automatic failover

### 5. Observability
- Event metrics (throughput, latency, failures)
- Sync lag monitoring per server pair
- Outbox/inbox processing statistics

## Configuration

### Server Registration

```typescript
const server = await federationManager.registerServer({
  externalId: 'control-center-west',
  tenantId: '...',
  name: 'West Coast Control Center',
  role: 'regional_control_center',
  countryCode: 'US',
  region: 'us-west',
  timezone: 'America/Los_Angeles',
  baseUrl: 'https://west.example.com',
  apiUrl: 'https://west.example.com/api',
  sharedSecret: '...',
  metadata: {
    location: 'San Francisco, CA',
    capacity: 1000
  }
});
```

### Publishing Events

```typescript
const event = await federationBus.publishEvent(
  tenantId,
  'camera.created',
  'camera',
  cameraId,
  {
    cameraName: 'Front Door',
    branchId: '...',
    metadata: { ... }
  },
  {
    targetServers: ['server-id-1', 'server-id-2'], // Optional
    correlationId: 'workflow-123'
  }
);
```

### Subscribing to Events

```typescript
federationBus.subscribe(
  'camera-sync-handler',
  ['camera.created', 'camera.updated', 'camera.deleted'],
  async (event) => {
    // Handle camera synchronization
    await syncCameraToLocalDatabase(event.payload);
  }
);
```

## API Endpoints

### Receive Events (Inbox)
```
POST /v1/federation/events/receive
Headers:
  X-Source-Server-Id: <origin-server-id>
  Content-Type: application/json

Body: FederationEvent

Response: 200 OK | 400 Bad Request | 409 Conflict (duplicate)
```

### Query Events
```
POST /v1/federation/events
Headers:
  X-Local-Server-Id: <requesting-server-id>

Body: {
  fromSequence: "12345",
  limit: 1000
}

Response: {
  events: FederationEvent[]
}
```

### Health Check
```
GET /v1/federation/health

Response: {
  serverId: "...",
  status: "healthy",
  sequence: "67890",
  lag: {
    "remote-server-1": 2,
    "remote-server-2": 0
  }
}
```

## Operational Procedures

### Initial Sync

1. Register new server with federation manager
2. Get current sequence position from remote servers
3. Pull all events since sequence 0
4. Apply events to local database
5. Start real-time event subscriptions

### Recovery from Downtime

```typescript
// When coming back online
for (const remoteServer of remoteServers) {
  const lastSeq = await federationBus.getLastReceivedSequence(remoteServer.id);
  await federationBus.syncFromServer(
    remoteServer.id,
    remoteServer.apiUrl,
    lastSeq
  );
}
```

### Monitoring Sync Lag

```sql
SELECT * FROM federation_sync_lag_monitor
WHERE health_status = 'critical'
ORDER BY sync_lag_seconds DESC;
```

### Cleanup Old Events

```sql
-- Daily cleanup (automated)
SELECT cleanup_federation_outbox(7);  -- Remove completed outbox entries > 7 days
SELECT cleanup_federation_inbox(7);   -- Remove applied inbox entries > 7 days

-- Monthly archival (automated)
SELECT archive_federation_events(90); -- Archive events > 90 days
```

## Performance Characteristics

- **Event Publishing**: < 5ms (local write + outbox insert)
- **Event Distribution**: 2s average (outbox processor interval)
- **Event Application**: 1s average (inbox processor interval)
- **Full Sync**: 1000 events/second
- **Search Aggregation**: 100-500ms (depends on server count)

## Security Considerations

1. **Authentication**: Shared secrets between servers (SHA-256 hashed)
2. **Authorization**: Tenant-based isolation in event log
3. **Transport**: HTTPS for all inter-server communication
4. **Integrity**: SHA-256 checksums on all events
5. **Audit**: Immutable event log with full history

## Future Enhancements

1. **Conflict Resolution**: CRDT-based automatic conflict resolution
2. **Event Compaction**: Snapshot + delta events for large aggregates
3. **Schema Evolution**: Automated schema migration across servers
4. **Geo-Replication**: Multi-region with latency-aware routing
5. **Event Replay**: Temporal queries and point-in-time recovery
6. **Stream Processing**: Real-time analytics on federation event stream

## References

- [Event Sourcing Pattern](https://martinfowler.com/eaaDev/EventSourcing.html)
- [Transactional Outbox Pattern](https://microservices.io/patterns/data/transactional-outbox.html)
- [Saga Pattern for Distributed Transactions](https://microservices.io/patterns/data/saga.html)
