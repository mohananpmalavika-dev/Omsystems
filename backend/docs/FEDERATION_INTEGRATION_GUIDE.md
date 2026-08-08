# Federation Integration Guide

## Setting Up Multi-Control-Center Architecture

This guide shows how to integrate the federation system into your OM Systems deployment.

## Prerequisites

- PostgreSQL 14+ with JSONB support
- Node.js 18+ with TypeScript
- HTTPS certificates for inter-server communication
- Network connectivity between control centers

## Step 1: Database Setup

Run the federation event sourcing migration:

```bash
psql -U postgres -d omsystems -f migrations/[timestamp]_federation_event_sourcing.sql
```

Verify tables created:

```sql
SELECT tablename FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename LIKE 'federation_%';
```

Expected output:
```
federation_event_log
federation_event_outbox
federation_event_inbox
federation_event_subscriptions
federation_event_metrics
federation_event_replay_log
federation_sync_state
```

## Step 2: Initialize Federation Services

### Server Configuration

Each control center needs a unique server ID:

```typescript
// config/federation.config.ts
export const federationConfig = {
  localServerId: process.env.FEDERATION_SERVER_ID || 'server-001',
  
  // Server identity
  serverName: 'Global Command Center',
  serverRole: 'global_command_center', // or 'regional_control_center'
  region: 'us-east',
  countryCode: 'US',
  timezone: 'America/New_York',
  
  // API endpoints
  baseUrl: process.env.PUBLIC_BASE_URL || 'https://control.example.com',
  apiUrl: process.env.PUBLIC_API_URL || 'https://control.example.com/api',
  
  // Processing intervals
  outboxIntervalMs: 2000,  // 2 seconds
  inboxIntervalMs: 1000,   // 1 second
  syncIntervalMs: 60000,   // 1 minute
  
  // Retry configuration
  maxRetries: 5,
  retryBackoffMs: 30000,   // 30 seconds
  
  // Cache TTL
  cacheTtlSeconds: 300,    // 5 minutes
};
```

### Service Initialization

```typescript
// src/index.ts or src/app.ts
import { Pool } from 'pg';
import { getFederationBus } from './services/federation-bus.service.js';
import { getFederationManager } from './services/federation-manager.service.js';
import { getFederationSyncService } from './services/federation-sync.service.js';
import { getFederationGateway } from './services/federation-gateway.service.js';
import { federationConfig } from './config/federation.config.js';

async function initializeFederation(pool: Pool) {
  const { localServerId } = federationConfig;
  
  // Initialize services
  const federationBus = getFederationBus(pool, localServerId);
  const federationManager = getFederationManager(pool);
  const federationSync = getFederationSyncService(pool, localServerId);
  const federationGateway = getFederationGateway(pool);
  
  // Start federation bus (event sourcing engine)
  await federationBus.start();
  
  // Start federation manager (server health monitoring)
  await federationManager.start();
  
  // Start sync service (event subscriptions)
  await federationSync.start();
  
  console.log('✓ Federation services started');
  
  return {
    federationBus,
    federationManager,
    federationSync,
    federationGateway
  };
}
```

## Step 3: Register Remote Servers

Each control center must register other federated servers:

```typescript
// scripts/register-federated-servers.ts
import { getFederationManager } from './services/federation-manager.service.js';

async function registerServers(pool: Pool, tenantId: string) {
  const federationManager = getFederationManager(pool);
  
  // Register West Coast regional center
  await federationManager.registerServer({
    externalId: 'control-center-west',
    tenantId,
    name: 'West Coast Control Center',
    role: 'regional_control_center',
    countryCode: 'US',
    region: 'us-west',
    area: 'San Francisco Bay Area',
    timezone: 'America/Los_Angeles',
    baseUrl: 'https://west-control.example.com',
    apiUrl: 'https://west-control.example.com/api',
    websocketUrl: 'wss://west-control.example.com/ws',
    sharedSecret: process.env.WEST_SHARED_SECRET!,
    metadata: {
      location: 'San Francisco, CA',
      capacity: 500,
      contact: 'ops-west@example.com'
    }
  });
  
  // Register East Coast regional center
  await federationManager.registerServer({
    externalId: 'control-center-east',
    tenantId,
    name: 'East Coast Control Center',
    role: 'regional_control_center',
    countryCode: 'US',
    region: 'us-east',
    area: 'New York Metro',
    timezone: 'America/New_York',
    baseUrl: 'https://east-control.example.com',
    apiUrl: 'https://east-control.example.com/api',
    websocketUrl: 'wss://east-control.example.com/ws',
    sharedSecret: process.env.EAST_SHARED_SECRET!,
    metadata: {
      location: 'New York, NY',
      capacity: 500,
      contact: 'ops-east@example.com'
    }
  });
  
  // Register backup server
  await federationManager.registerServer({
    externalId: 'backup-server-001',
    tenantId,
    name: 'Backup Control Center',
    role: 'backup_server',
    countryCode: 'US',
    region: 'us-central',
    timezone: 'America/Chicago',
    baseUrl: 'https://backup.example.com',
    apiUrl: 'https://backup.example.com/api',
    sharedSecret: process.env.BACKUP_SHARED_SECRET!,
    primaryServerId: 'global-command-center-id', // ID of primary server
    metadata: {
      location: 'Chicago, IL',
      capacity: 1000
    }
  });
  
  console.log('✓ Federated servers registered');
}
```

## Step 4: Subscribe to Entity Events

Configure automatic synchronization for entity changes:

```typescript
// src/services/entity-sync-handlers.ts
import { getFederationSyncService } from './federation-sync.service.js';

export function setupEntitySyncHandlers(pool: Pool, localServerId: string) {
  const syncService = getFederationSyncService(pool, localServerId);
  
  // Camera lifecycle events
  syncService.on('camera:created', async (data) => {
    console.log('Camera created, will sync to federation:', data.cameraId);
  });
  
  syncService.on('camera:updated', async (data) => {
    console.log('Camera updated, will sync to federation:', data.cameraId);
  });
  
  syncService.on('camera:deleted', async (data) => {
    console.log('Camera deleted, will sync to federation:', data.cameraId);
  });
  
  // Alert events
  syncService.on('alert:created', async (data) => {
    console.log('Alert created, will sync to federation:', data.alertId);
  });
  
  // Incident events
  syncService.on('incident:created', async (data) => {
    console.log('Incident created, will sync to federation:', data.incidentId);
  });
  
  syncService.on('incident:updated', async (data) => {
    console.log('Incident updated, will sync to federation:', data.incidentId);
  });
  
  // Recording events
  syncService.on('recording:started', async (data) => {
    console.log('Recording started, will sync to federation:', data.recordingId);
  });
  
  syncService.on('recording:completed', async (data) => {
    console.log('Recording completed, will sync to federation:', data.recordingId);
  });
  
  // Analytics detection events
  syncService.on('analytics:detection', async (data) => {
    console.log('Analytics detection, will sync to federation:', data.eventId);
  });
}
```

## Step 5: Create Federation API Endpoints

```typescript
// src/routes/federation.routes.ts
import { Router } from 'express';
import { Pool } from 'pg';
import { getFederationBus } from '../services/federation-bus.service.js';
import { getFederationManager } from '../services/federation-manager.service.js';

export function createFederationRoutes(pool: Pool, localServerId: string): Router {
  const router = Router();
  const federationBus = getFederationBus(pool, localServerId);
  const federationManager = getFederationManager(pool);
  
  // Receive events from remote servers (inbox endpoint)
  router.post('/events/receive', async (req, res) => {
    try {
      const sourceServerId = req.headers['x-source-server-id'] as string;
      const event = req.body;
      
      if (!sourceServerId) {
        return res.status(400).json({ error: 'Missing X-Source-Server-Id header' });
      }
      
      // Verify server is registered
      const server = await federationManager.getServerByExternalId(sourceServerId);
      if (!server) {
        return res.status(403).json({ error: 'Unknown server' });
      }
      
      // Receive event into inbox
      await federationBus.receiveEvent(event, server.id);
      
      res.status(200).json({ status: 'received', eventId: event.event_id });
      
    } catch (error) {
      console.error('Failed to receive event:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // Query events for synchronization
  router.post('/events', async (req, res) => {
    try {
      const { fromSequence, limit = 1000 } = req.body;
      
      const events = await federationBus.queryEvents({
        fromSequence: fromSequence ? BigInt(fromSequence) : 0n,
        limit: Math.min(limit, 1000)
      });
      
      res.json({
        events,
        count: events.length,
        serverSequence: (await federationBus.getSequencePosition()).toString()
      });
      
    } catch (error) {
      console.error('Failed to query events:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // Health check
  router.get('/health', async (req, res) => {
    try {
      const currentSequence = await federationBus.getSequencePosition();
      
      // Get sync state
      const syncState = await pool.query(
        `SELECT 
          remote_server_id,
          sync_lag_seconds,
          is_healthy
         FROM federation_sync_state
         WHERE local_server_id = $1`,
        [localServerId]
      );
      
      const lag: Record<string, number> = {};
      syncState.rows.forEach(row => {
        lag[row.remote_server_id] = row.sync_lag_seconds;
      });
      
      res.json({
        serverId: localServerId,
        status: 'healthy',
        sequence: currentSequence.toString(),
        lag
      });
      
    } catch (error) {
      console.error('Health check failed:', error);
      res.status(500).json({ status: 'unhealthy' });
    }
  });
  
  return router;
}

// Mount routes
// app.use('/v1/federation', createFederationRoutes(pool, localServerId));
```

## Step 6: Emit Events from Business Logic

Integrate event emission into your existing services:

```typescript
// src/services/camera.service.ts
import { getFederationSyncService } from './federation-sync.service.js';

export class CameraService {
  private syncService: ReturnType<typeof getFederationSyncService>;
  
  constructor(pool: Pool, localServerId: string) {
    this.syncService = getFederationSyncService(pool, localServerId);
  }
  
  async createCamera(tenantId: string, branchId: string, cameraData: any) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Create camera in local database
      const result = await client.query(
        `INSERT INTO cameras (tenant_id, branch_id, name, ip_address, ...)
         VALUES ($1::uuid, $2::uuid, $3, $4, ...)
         RETURNING id::text, ...`,
        [tenantId, branchId, cameraData.name, cameraData.ipAddress, ...]
      );
      
      const camera = result.rows[0];
      
      await client.query('COMMIT');
      
      // Emit event for federation sync
      this.syncService.emit('camera:created', {
        tenantId,
        cameraId: camera.id,
        branchId,
        cameraName: camera.name,
        ipAddress: camera.ipAddress,
        metadata: cameraData
      });
      
      return camera;
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  async updateCamera(cameraId: string, updates: any) {
    // Similar pattern: update locally, then emit event
    const camera = await this.updateCameraInDb(cameraId, updates);
    
    this.syncService.emit('camera:updated', {
      tenantId: camera.tenantId,
      cameraId: camera.id,
      updates
    });
    
    return camera;
  }
}
```

## Step 7: Initial Synchronization

When bringing a new server online, perform initial sync:

```typescript
// scripts/initial-federation-sync.ts
import { getFederationBus } from '../services/federation-bus.service.js';
import { getFederationManager } from '../services/federation-manager.service.js';

async function performInitialSync(pool: Pool, localServerId: string) {
  const federationBus = getFederationBus(pool, localServerId);
  const federationManager = getFederationManager(pool);
  
  // Get all registered remote servers
  const servers = await pool.query(
    `SELECT id::text, external_id, api_url, name
     FROM federated_servers
     WHERE id::text != $1
       AND sync_enabled = true`,
    [localServerId]
  );
  
  console.log(`Starting initial sync from ${servers.rows.length} servers...`);
  
  for (const server of servers.rows) {
    console.log(`\nSyncing from ${server.name} (${server.external_id})...`);
    
    try {
      const eventCount = await federationBus.syncFromServer(
        server.id,
        server.api_url,
        0n // Start from sequence 0
      );
      
      console.log(`✓ Synced ${eventCount} events from ${server.name}`);
      
    } catch (error) {
      console.error(`✗ Failed to sync from ${server.name}:`, error);
    }
  }
  
  console.log('\n✓ Initial synchronization complete');
}

// Run: ts-node scripts/initial-federation-sync.ts
```

## Step 8: Monitoring and Observability

### View Sync Health

```sql
-- Check overall sync health
SELECT * FROM federation_sync_lag_monitor
ORDER BY 
  CASE health_status
    WHEN 'critical' THEN 1
    WHEN 'warning' THEN 2
    WHEN 'healthy' THEN 3
  END;
```

### Monitor Outbox Processing

```sql
-- Outbox stats
SELECT * FROM federation_outbox_stats;

-- Stuck outbox entries
SELECT 
  id,
  event_id,
  target_servers,
  retry_count,
  error_message,
  created_at
FROM federation_event_outbox
WHERE status = 'failed'
  AND retry_count >= max_retries
ORDER BY created_at DESC;
```

### Monitor Inbox Processing

```sql
-- Inbox stats by source
SELECT * FROM federation_inbox_stats;

-- Failed inbox entries
SELECT 
  id,
  event_id,
  source_server,
  error_message,
  received_at
FROM federation_event_inbox
WHERE status = 'failed'
ORDER BY received_at DESC;
```

### Event Type Distribution

```sql
SELECT * FROM federation_event_type_stats
ORDER BY count DESC
LIMIT 20;
```

## Step 9: Operational Procedures

### Daily Maintenance

```sql
-- Run daily (can be automated via cron)
SELECT cleanup_federation_outbox(7);
SELECT cleanup_federation_inbox(7);
```

### Monthly Archival

```sql
-- Run monthly
SELECT archive_federation_events(90);
```

### Manual Event Replay

If you need to replay events after a bug fix:

```typescript
async function replayEvents(
  pool: Pool,
  localServerId: string,
  fromTimestamp: Date,
  toTimestamp: Date
) {
  const federationBus = getFederationBus(pool, localServerId);
  
  const events = await federationBus.queryEvents({
    fromTimestamp,
    toTimestamp,
    limit: 10000
  });
  
  console.log(`Replaying ${events.length} events...`);
  
  for (const event of events) {
    // Re-emit to local subscribers
    await federationBus['emitToLocalSubscribers'](event);
    
    // Log replay
    await pool.query(
      `INSERT INTO federation_event_replay_log (
        event_id, replay_reason, replayed_by,
        original_timestamp, replay_result
      ) VALUES ($1, $2, $3, $4, $5)`,
      [
        event.event_id,
        'Manual replay for bug fix',
        process.env.USER || 'system',
        event.timestamp,
        'success'
      ]
    );
  }
  
  console.log('✓ Replay complete');
}
```

## Troubleshooting

### Issue: Events not reaching remote servers

**Check:**
1. Outbox processor is running: `SELECT * FROM federation_outbox_stats WHERE status = 'pending';`
2. Network connectivity to remote servers
3. Shared secret authentication is correct
4. Remote server's `/v1/federation/events/receive` endpoint is accessible

**Fix:**
```sql
-- Retry failed outbox entries
UPDATE federation_event_outbox
SET status = 'pending',
    retry_count = 0,
    next_retry_at = NULL
WHERE status = 'failed';
```

### Issue: High sync lag

**Check:**
```sql
SELECT * FROM federation_sync_lag_monitor
WHERE sync_lag_seconds > 300;
```

**Fix:**
- Increase outbox/inbox processing intervals
- Scale processing workers
- Check database performance
- Verify network latency between servers

### Issue: Duplicate events

**Check:**
```sql
SELECT 
  idempotency_key,
  COUNT(*)
FROM federation_event_inbox
GROUP BY idempotency_key
HAVING COUNT(*) > 1;
```

This should never happen due to unique constraint, but if it does, investigate application logic.

## Best Practices

1. **Always use federation bus for cross-server changes**
2. **Never bypass the outbox pattern** (direct HTTP calls lose guarantees)
3. **Monitor sync lag continuously** (alert if > 5 minutes)
4. **Test failover procedures regularly**
5. **Keep event payloads small** (< 100KB)
6. **Version your event schemas** (use schema_version field)
7. **Set up automated cleanup jobs**
8. **Enable detailed logging in production**

## Security Checklist

- [ ] HTTPS enforced for all inter-server communication
- [ ] Shared secrets rotated regularly
- [ ] Tenant isolation verified in event log queries
- [ ] Network firewall rules restrict federation endpoints
- [ ] Event checksums verified on reception
- [ ] Audit logs enabled for all federation operations

## Performance Tuning

### Database Indexes
All critical indexes are created by the migration, but monitor:
```sql
SELECT * FROM pg_stat_user_indexes 
WHERE schemaname = 'public' 
  AND relname LIKE 'federation_%'
ORDER BY idx_scan;
```

### Connection Pooling
Configure appropriate pool sizes:
```typescript
const pool = new Pool({
  max: 20, // Adjust based on workload
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

### Batch Processing
Adjust batch sizes based on throughput:
```typescript
private readonly BATCH_SIZE = 100; // Increase for higher throughput
```

## Next Steps

1. Set up monitoring dashboards (Grafana + Prometheus)
2. Configure alerting for sync lag and failures
3. Implement automated failover testing
4. Set up cross-region disaster recovery
5. Enable event stream analytics

## Support

For issues or questions:
- GitHub: [OM Systems Federation](https://github.com/omsystems/federation)
- Docs: [Federation Architecture](./FEDERATION_ARCHITECTURE.md)
- Email: support@omsystems.com
