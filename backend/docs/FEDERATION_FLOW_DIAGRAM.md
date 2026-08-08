# Federation Event Flow Diagrams

## Complete Event Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CONTROL CENTER A                                 │
│                                                                           │
│  1. Business Logic                                                        │
│     ┌──────────────┐                                                     │
│     │ Camera.create│                                                     │
│     └──────┬───────┘                                                     │
│            │                                                              │
│            ▼                                                              │
│  2. Local Transaction                                                    │
│     ┌──────────────────────────────────┐                                │
│     │  BEGIN                            │                                │
│     │  INSERT INTO cameras (...)        │                                │
│     │  COMMIT                           │                                │
│     └──────────────┬────────────────────┘                                │
│                    │                                                      │
│                    ▼                                                      │
│  3. Emit Event                                                           │
│     ┌──────────────────────────────────┐                                │
│     │ syncService.emit(                 │                                │
│     │   'camera:created',               │                                │
│     │   { cameraId, ... }               │                                │
│     │ )                                 │                                │
│     └──────────────┬────────────────────┘                                │
│                    │                                                      │
│                    ▼                                                      │
│  4. Federation Bus                                                       │
│     ┌──────────────────────────────────┐                                │
│     │ publishEvent()                    │                                │
│     │  • Generate event_id             │                                │
│     │  • Assign sequence_number        │                                │
│     │  • Calculate checksum            │                                │
│     └──────────────┬────────────────────┘                                │
│                    │                                                      │
│            ┌───────┴────────┐                                            │
│            │                │                                            │
│            ▼                ▼                                            │
│  5. Persist Event      6. Local Emit                                    │
│  ┌─────────────────┐  ┌──────────────┐                                 │
│  │ Event Log       │  │ Local        │                                 │
│  │ (immutable)     │  │ Subscribers  │                                 │
│  │                 │  │              │                                 │
│  │ INSERT INTO     │  │ emit(event)  │                                 │
│  │ federation_     │  └──────────────┘                                 │
│  │ event_log       │                                                    │
│  └────────┬────────┘                                                    │
│           │                                                              │
│           ▼                                                              │
│  7. Outbox                                                               │
│  ┌─────────────────────────────────┐                                    │
│  │ INSERT INTO                      │                                    │
│  │ federation_event_outbox          │                                    │
│  │   event_data = {...}             │                                    │
│  │   target_servers = [B, C]        │                                    │
│  │   status = 'pending'             │                                    │
│  └────────┬─────────────────────────┘                                    │
│           │                                                              │
│           ▼                                                              │
│  8. Background Processor (every 2s)                                     │
│  ┌─────────────────────────────────┐                                    │
│  │ SELECT * FROM outbox              │                                    │
│  │ WHERE status = 'pending'         │                                    │
│  │ LIMIT 100                        │                                    │
│  └────────┬─────────────────────────┘                                    │
│           │                                                              │
│           ▼                                                              │
│  9. HTTP POST to Remote Servers                                         │
│     ┌──────────────────────┐                                            │
│     │ POST /v1/federation/  │                                            │
│     │      events/receive   │                                            │
│     │                       │                                            │
│     │ Headers:              │                                            │
│     │   X-Source-Server-Id  │                                            │
│     │                       │                                            │
│     │ Body: event           │                                            │
│     └──────────┬────────────┘                                            │
│                │                                                          │
└────────────────┼──────────────────────────────────────────────────────┘
                 │
                 │ HTTPS (guaranteed delivery, auto-retry)
                 │
                 ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         CONTROL CENTER B                                │
│                                                                          │
│  10. Inbox Endpoint                                                     │
│      ┌──────────────────────────────────┐                              │
│      │ POST /v1/federation/              │                              │
│      │      events/receive               │                              │
│      │                                   │                              │
│      │ • Verify source server            │                              │
│      │ • Verify checksum                 │                              │
│      │ • Check idempotency_key           │                              │
│      └──────────┬────────────────────────┘                              │
│                 │                                                        │
│                 ▼                                                        │
│  11. Inbox Table                                                        │
│      ┌──────────────────────────────────┐                              │
│      │ INSERT INTO                       │                              │
│      │ federation_event_inbox            │                              │
│      │   event_data = {...}              │                              │
│      │   source_server = 'A'             │                              │
│      │   idempotency_key = 'A:evt:123'  │                              │
│      │   status = 'received'             │                              │
│      └──────────┬────────────────────────┘                              │
│                 │                                                        │
│                 ▼                                                        │
│  12. Background Processor (every 1s)                                    │
│      ┌──────────────────────────────────┐                              │
│      │ SELECT * FROM inbox               │                              │
│      │ WHERE status = 'received'         │                              │
│      │ LIMIT 100                         │                              │
│      └──────────┬────────────────────────┘                              │
│                 │                                                        │
│                 ▼                                                        │
│  13. Apply Event                                                        │
│      ┌──────────────────────────────────┐                              │
│      │ • Emit to local subscribers       │                              │
│      │ • Update local database           │                              │
│      │ • Mark as 'applied'               │                              │
│      └──────────┬────────────────────────┘                              │
│                 │                                                        │
│                 ▼                                                        │
│  14. Local Database Updated                                             │
│      ┌──────────────────────────────────┐                              │
│      │ INSERT INTO cameras (...)         │                              │
│      │ (synced from Control Center A)    │                              │
│      └───────────────────────────────────┘                              │
│                                                                          │
└──────────────────────────────────────────────────────────────────────┘
```

## Event Sourcing Pattern

```
┌─────────────────────────────────────────────────────────────┐
│                    EVENT LOG                                 │
│              (Immutable Append-Only)                         │
│                                                              │
│  Seq | Event ID        | Type           | Aggregate         │
│  ────┼─────────────────┼────────────────┼──────────────────│
│  001 | evt-001-abc123  | camera.created | camera-uuid-1    │
│  002 | evt-002-def456  | alert.created  | alert-uuid-1     │
│  003 | evt-003-ghi789  | camera.updated | camera-uuid-1    │
│  004 | evt-004-jkl012  | incident.creat | incident-uuid-1  │
│  ... | ...             | ...            | ...              │
│                                                              │
│  Properties:                                                 │
│  • Never deleted                                            │
│  • Never updated (immutable)                                │
│  • Monotonic sequence per origin_server                    │
│  • Complete audit trail                                     │
│  • Point-in-time recovery                                   │
│  • Event replay capability                                  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## Outbox/Inbox Pattern

```
┌────────────────────────────────────────────────────────────────┐
│                    OUTBOX PATTERN                               │
│               (Reliable Publishing)                             │
│                                                                 │
│  ┌────────────────────┐                                        │
│  │ Business Transaction│                                        │
│  │                    │                                        │
│  │ BEGIN              │                                        │
│  │   UPDATE cameras   │                                        │
│  │   INSERT INTO      │                                        │
│  │     event_log      │◄──────── Atomic Transaction           │
│  │   INSERT INTO      │                                        │
│  │     outbox         │                                        │
│  │ COMMIT             │                                        │
│  └───────┬────────────┘                                        │
│          │                                                      │
│          ▼                                                      │
│  ┌────────────────────┐                                        │
│  │ Outbox Processor   │                                        │
│  │ (Background Worker)│                                        │
│  │                    │                                        │
│  │ Every 2 seconds:   │                                        │
│  │  • SELECT pending  │                                        │
│  │  • POST to remote  │                                        │
│  │  • Mark completed  │                                        │
│  │  • Retry failures  │                                        │
│  └────────────────────┘                                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    INBOX PATTERN                                 │
│              (Idempotent Reception)                              │
│                                                                  │
│  ┌────────────────────┐                                         │
│  │ HTTP Endpoint      │                                         │
│  │ /events/receive    │                                         │
│  │                    │                                         │
│  │ • Verify source    │                                         │
│  │ • Verify checksum  │                                         │
│  │ • Check duplicate  │◄───── Idempotency Key Check            │
│  │ • INSERT inbox     │                                         │
│  └───────┬────────────┘                                         │
│          │                                                       │
│          ▼                                                       │
│  ┌────────────────────┐                                         │
│  │ Inbox Processor    │                                         │
│  │ (Background Worker)│                                         │
│  │                    │                                         │
│  │ Every 1 second:    │                                         │
│  │  • SELECT received │                                         │
│  │  • Apply to DB     │                                         │
│  │  • Emit locally    │                                         │
│  │  • Mark applied    │                                         │
│  └────────────────────┘                                         │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

## Multi-Server Synchronization

```
┌────────────────────────────────────────────────────────────────┐
│                                                                 │
│     Control Center A         Control Center B                  │
│     (Global Command)         (Regional West)                   │
│            │                         │                         │
│            │                         │                         │
│      [Event Log A]             [Event Log B]                   │
│       seq: 1-1000               seq: 1-500                     │
│            │                         │                         │
│            │◄──────sync──────────────┤                         │
│            │                         │                         │
│            │                         │                         │
│            │                         │                         │
│            └────────┬────────────────┘                         │
│                     │                                          │
│                     │                                          │
│              Federation Bus                                    │
│         (Event Distribution)                                   │
│                     │                                          │
│                     │                                          │
│            ┌────────┴────────┐                                │
│            │                 │                                 │
│            ▼                 ▼                                 │
│      Control Center C   Control Center D                      │
│      (Regional East)    (Backup)                              │
│                                                                │
│       [Event Log C]      [Event Log D]                        │
│        seq: 1-300         seq: 1-1000                         │
│                                                                │
│                                                                │
│  All servers maintain their own event log                     │
│  All servers sync events from all other servers               │
│  Eventual consistency achieved through event replay           │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

## Sequence Numbering

```
Server A Event Log:
┌───────────────────────────────────────────────────┐
│ Seq │ Event ID    │ Origin  │ Event Type         │
├─────┼─────────────┼─────────┼────────────────────┤
│ 001 │ A-evt-001   │ A       │ camera.created     │
│ 002 │ A-evt-002   │ A       │ alert.created      │
│ 003 │ A-evt-003   │ A       │ incident.created   │
│ 004 │ B-evt-001   │ B       │ camera.created     │  ← From Server B
│ 005 │ A-evt-004   │ A       │ camera.updated     │
│ 006 │ C-evt-001   │ C       │ alert.created      │  ← From Server C
│ 007 │ A-evt-005   │ A       │ recording.started  │
│ 008 │ B-evt-002   │ B       │ incident.updated   │  ← From Server B
└───────────────────────────────────────────────────┘

Key Points:
• Each server maintains its own monotonic sequence
• Events from other servers are appended as received
• Ordering within origin_server is guaranteed
• Cross-server ordering is eventual
```

## Idempotency Pattern

```
┌──────────────────────────────────────────────────────────┐
│         Event Arrives at Server B                         │
│                                                           │
│  Event: {                                                │
│    event_id: "evt-abc123",                              │
│    origin_server: "server-A",                           │
│    sequence_number: 42                                  │
│  }                                                       │
│                                                           │
│           ▼                                              │
│                                                           │
│  1. Generate Idempotency Key                             │
│     key = "server-A:evt-abc123:42"                      │
│                                                           │
│           ▼                                              │
│                                                           │
│  2. Check Inbox for Duplicate                            │
│     SELECT 1 FROM inbox                                  │
│     WHERE idempotency_key = 'server-A:evt-abc123:42'    │
│                                                           │
│           ▼                                              │
│                                                           │
│  ┌──────────────────────────────────┐                   │
│  │ Found?                            │                   │
│  └───┬──────────────────────┬────────┘                   │
│      │ YES                  │ NO                         │
│      │                      │                            │
│      ▼                      ▼                            │
│  Return 409 Conflict    Insert to Inbox                 │
│  (duplicate)            status = 'received'              │
│                                                           │
│  Result: Exactly-once processing guaranteed              │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

## Retry and Circuit Breaker

```
┌──────────────────────────────────────────────────────────┐
│            Outbox Retry Logic                             │
│                                                           │
│  Event in Outbox: status = 'pending'                     │
│           │                                               │
│           ▼                                               │
│  Attempt 1: POST to Server B                             │
│           │                                               │
│    ┌──────┴──────┐                                       │
│    │ Success?    │                                       │
│    └─┬────────┬──┘                                       │
│      │ YES    │ NO                                       │
│      │        │                                          │
│      ▼        ▼                                          │
│   Mark     retry_count++                                 │
│   completed  next_retry_at = now() + 30s                │
│              status = 'pending'                          │
│                     │                                    │
│                     ▼                                    │
│              Wait 30 seconds                             │
│                     │                                    │
│                     ▼                                    │
│              Attempt 2: POST to Server B                 │
│                     │                                    │
│              ... continue ...                            │
│                     │                                    │
│                     ▼                                    │
│              After 5 retries:                            │
│              status = 'failed'                           │
│              (manual intervention or alert)              │
│                                                          │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│          Circuit Breaker Pattern                          │
│                                                           │
│  Server B State Machine:                                 │
│                                                           │
│     CLOSED ──failure──▶ OPEN ──timeout──▶ HALF-OPEN     │
│       ▲                   │                    │         │
│       │                   │                    │         │
│       └──────success──────┴────success────────┘         │
│                                                           │
│  States:                                                 │
│  • CLOSED: Normal operation, requests allowed           │
│  • OPEN: Too many failures, requests blocked            │
│  • HALF-OPEN: Testing recovery, limited requests        │
│                                                           │
│  Thresholds:                                             │
│  • Failure count: 5 consecutive failures                │
│  • Timeout: 60 seconds before retry                     │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

## Synchronization Flow

```
┌──────────────────────────────────────────────────────────┐
│      New Server C Joins Federation                        │
│                                                           │
│  Step 1: Register with existing servers                  │
│          POST /v1/federation/servers                     │
│                                                           │
│  Step 2: Pull historical events                          │
│          ┌────────────────┐                              │
│          │ For each server│                              │
│          │ (A, B, D):     │                              │
│          │                │                              │
│          │ POST /events   │                              │
│          │ {              │                              │
│          │   fromSeq: 0   │                              │
│          │   limit: 1000  │                              │
│          │ }              │                              │
│          └────────────────┘                              │
│                │                                          │
│                ▼                                          │
│          Receive events in batches                       │
│          Apply to local database                         │
│          Update sync_state                               │
│                │                                          │
│                ▼                                          │
│  Step 3: Start real-time subscriptions                   │
│          Outbox/Inbox processors running                 │
│          Receiving events as they occur                  │
│                │                                          │
│                ▼                                          │
│          Fully synchronized ✓                            │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

## Key Takeaways

1. **Outbox Pattern** guarantees events are never lost
2. **Inbox Pattern** guarantees exactly-once processing
3. **Sequence Numbers** maintain ordering per server
4. **Idempotency Keys** prevent duplicate processing
5. **Checksums** verify data integrity
6. **Circuit Breakers** prevent cascade failures
7. **Event Log** provides complete audit trail
8. **Background Processors** decouple pub/sub from business logic

This architecture ensures **reliable, consistent, and traceable** multi-control-center synchronization.
