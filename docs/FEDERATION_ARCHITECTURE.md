# Sentinel Grid Federation System v2.0 - Architecture Guide

## Overview

The Federation System transforms Sentinel Grid from a centralized VMS into an **enterprise-grade federated platform** capable of managing multiple regional control centers with global monitoring, disaster recovery, and unified authentication.

## Architecture Diagram

```
                    ┌─────────────────────────────────┐
                    │   Global Command Center (GCC)   │
                    │   - Global Dashboard            │
                    │   - SSO Authentication          │
                    │   - Cross-Region Search         │
                    │   - Alert Correlation           │
                    └──────────────┬──────────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │   Federation Gateway         │
                    │   - Request Routing          │
                    │   - Load Balancing           │
                    │   - Circuit Breakers         │
                    └──────────────┬──────────────┘
                                   │
        ┌──────────────────────────┼──────────────────────────┐
        │                          │                          │
┌───────▼──────────┐   ┌──────────▼───────────┐   ┌─────────▼─────────┐
│  South Region    │   │   North Region       │   │   West Region     │
│  Control Center  │   │   Control Center     │   │   Control Center  │
│  150 Branches    │   │   118 Branches       │   │   130 Branches    │
│  2,250 Cameras   │   │   1,770 Cameras      │   │   1,950 Cameras   │
└──────────────────┘   └──────────────────────┘   └───────────────────┘
```

## Core Components

### 1. Federation Manager (`federation-manager.service.ts`)

**Purpose**: Central registry and health monitor for all federated servers.

**Key Features**:
- Server registration and discovery
- Real-time health monitoring
- Automatic failover detection
- Routing decisions based on resource location
- Capacity tracking (cameras, storage, bandwidth)

**Database Tables**:
- `federated_servers` - Server registry
- `regional_server_mappings` - Resource-to-server mappings
- `federation_server_health_history` - Historical health metrics

**API Endpoints**:
- `POST /v1/federation/servers` - Register new server
- `GET /v1/federation/servers` - List all servers
- `POST /v1/federation/servers/:id/heartbeat` - Process heartbeat
- `GET /v1/federation/dashboard` - Dashboard summary

### 2. Federation Gateway (`federation-gateway.service.ts`)

**Purpose**: Intelligent request routing and aggregation layer.

**Key Features**:
- Automatic server routing based on resource scope
- Broadcast requests to multiple servers
- Result aggregation and normalization
- Circuit breaker pattern for fault tolerance
- Request caching for performance

**Routing Logic**:
```typescript
// Route to specific server for a resource
const routing = await federationManager.routeToServer(tenantId, scopeNodeId);

// Broadcast to all servers in region
const results = await gateway.broadcastRequest(tenantId, request, {
  regions: ['south', 'north']
});
```

### 3. Global Authentication Service (`global-authentication.service.ts`)

**Purpose**: Single Sign-On (SSO) across all federated servers.

**Key Features**:
- Unified user identity management
- JWT token-based authentication
- Cross-server session validation
- Token federation (extend validity to additional servers)
- Automatic session cleanup

**Database Tables**:
- `global_user_identities` - Unified user records
- `global_user_sessions` - Active sessions
- `regional_server_mappings` - User-to-server affinity

**Authentication Flow**:
```
1. User logs in to Regional Server A
2. Global Auth creates global identity
3. JWT token issued with server list
4. Token valid on all federated servers
5. Automatic SSO when accessing Regional Server B
```

### 4. Federation Search Service (`federation-search.service.ts`)

**Purpose**: Cross-server search for vehicles, faces, objects, and incidents.

**Key Features**:
- Parallel search across all regional servers
- Result aggregation and ranking
- Journey reconstruction (track entity across regions)
- Coordinated activity detection
- Search result caching

**Search Flow**:
```typescript
// Search for vehicle across all regions
const results = await searchService.searchAcrossServers(tenantId, {
  queryType: 'vehicle',
  timeRange: { from, to },
  filters: { vehiclePlate: 'MH12AB1234' }
});

// Reconstruct journey
const journey = await searchService.reconstructJourney(
  tenantId,
  'vehicle',
  'MH12AB1234',
  timeRange
);
```

### 5. Federation Playback Service (`federation-playback.service.ts`)

**Purpose**: Seamless video playback across multiple servers.

**Key Features**:
- Cross-server timeline generation
- Gap detection and handling
- Multi-camera synchronized playback
- Transparent server switching
- Bandwidth optimization

**Timeline Structure**:
```typescript
interface CrossServerTimeline {
  cameraId: string;
  timeRange: { from: Date; to: Date };
  segments: PlaybackSegment[]; // From multiple servers
  gaps: Array<{ from: Date; to: Date; reason: string }>;
}
```

### 6. Global Alert Correlation Engine (`global-alert-correlation.service.ts`)

**Purpose**: Detect coordinated incidents across regions.

**Correlation Types**:
- **Temporal**: Alerts within same time window
- **Spatial**: Alerts in nearby locations
- **Entity**: Same vehicle/person across regions
- **Pattern**: Similar alert patterns

**Use Cases**:
- Detect coordinated bank fraud across branches
- Track suspicious vehicle movement across states
- Identify organized crime patterns
- ATM tampering across regions

### 7. Federation Sync Service (`federation-sync.service.ts`)

**Purpose**: Metadata replication and event synchronization.

**Sync Types**:
- **Full Sync**: Complete dataset synchronization
- **Incremental Sync**: Only changed records
- **Realtime**: Event-driven replication

**Database Tables**:
- `federation_sync_jobs` - Sync job tracking
- `federation_replication_queue` - Realtime replication queue

## Database Schema

### Core Tables

```sql
-- Server Registry
federated_servers (
  id, external_id, tenant_id, name, role, region,
  base_url, api_url, status, health_score,
  total_cameras, online_cameras, total_branches,
  primary_server_id, backup_server_id
)

-- Global Authentication
global_user_identities (
  id, tenant_id, global_user_id, username, email,
  local_user_id, preferred_server_id, global_role
)

global_user_sessions (
  id, global_user_id, token_hash,
  originating_server_id, valid_on_servers[],
  expires_at
)

-- Alert Correlation
global_alert_correlations (
  id, correlation_type, confidence_score,
  regions[], server_ids[], alert_count,
  tracked_entity_type, tracked_entity_id
)

-- Search Cache
cross_server_search_cache (
  id, query_hash, server_id,
  result_count, results, expires_at
)

-- Sync Jobs
federation_sync_jobs (
  id, source_server_id, destination_server_id,
  entity_type, status, synced_records, failed_records
)
```

## Deployment Models

### Model 1: Regional Federation (India)

```
Global Command Center (Mumbai)
├── South Region (Bangalore) - 150 branches
├── North Region (Delhi) - 118 branches
├── West Region (Pune) - 130 branches
└── East Region (Kolkata) - 97 branches

Total: 495 branches, ~7,500 cameras
```

### Model 2: Multi-Country Federation

```
Global Command Center (Singapore)
├── India (Mumbai) - 450 branches
├── UAE (Dubai) - 80 branches
├── Singapore (Local) - 45 branches
└── Malaysia (Kuala Lumpur) - 60 branches

Total: 635 branches, ~10,000 cameras
```

### Model 3: Disaster Recovery

```
Primary: Mumbai Data Center
├── Regional Servers: 4 regions
└── Backup: Bangalore Data Center (Hot Standby)

Failover Time: < 30 seconds
RPO: 5 minutes
RTO: 2 minutes
```

## Performance Characteristics

### Scalability

| Metric | Single Server | Federated (4 Regions) |
|--------|---------------|----------------------|
| Max Cameras | 2,000 | 10,000+ |
| Max Concurrent Streams | 500 | 2,000+ |
| Search Response Time | 100ms | 250ms |
| Playback Latency | 50ms | 150ms |
| Failover Time | N/A | 30s |

### Network Requirements

- **Inter-server Bandwidth**: 100 Mbps minimum, 1 Gbps recommended
- **Latency**: < 50ms between regional servers
- **Sync Traffic**: ~10-50 Mbps per server pair
- **Search Queries**: ~1-5 Mbps burst traffic

## Security

### Authentication
- JWT tokens with RS256 signing
- Token validity scoped to specific servers
- Automatic token rotation every 24 hours
- Session revocation support

### Authorization
- Role-based access control (RBAC)
- Regional access restrictions
- Camera-level permissions
- Audit trail for all cross-server operations

### Data Protection
- TLS 1.3 for all inter-server communication
- Encrypted token storage
- Secret key rotation
- Network isolation between regions

## Monitoring

### Health Metrics
- Server online/offline status
- Response time and latency
- Request success/failure rates
- Circuit breaker status
- Replication lag

### Alerts
- Server offline detection
- High latency warnings
- Replication failures
- Circuit breaker opens
- Correlation detection

## API Reference

### Server Management

```bash
# Register new server
POST /v1/federation/servers
{
  "externalId": "south-region-01",
  "name": "South Region Control Center",
  "role": "regional_control_center",
  "region": "south",
  "baseUrl": "https://south.example.com",
  "apiUrl": "https://south.example.com/api",
  "sharedSecret": "..."
}

# List servers
GET /v1/federation/servers?region=south&status=online
```

### Authentication

```bash
# Login
POST /v1/federation/auth/login
{
  "username": "admin@example.com",
  "password": "...",
  "serverId": "..."
}

# Verify token
POST /v1/federation/auth/verify
{
  "token": "eyJhbGc..."
}
```

### Search

```bash
# Cross-server search
POST /v1/federation/search
{
  "queryType": "vehicle",
  "timeRange": { "from": "2024-01-01", "to": "2024-01-31" },
  "filters": { "vehiclePlate": "MH12AB1234" }
}

# Journey reconstruction
POST /v1/federation/search/journey
{
  "entityType": "vehicle",
  "entityId": "MH12AB1234",
  "timeRange": { ... }
}
```

### Playback

```bash
# Build timeline
POST /v1/federation/playback/timeline
{
  "cameraId": "...",
  "timeRange": { "from": "...", "to": "..." }
}

# Multi-camera playback
POST /v1/federation/playback/multi-camera
{
  "cameraIds": ["...", "..."],
  "timeRange": { ... }
}
```

## Troubleshooting

### Common Issues

**Issue**: Server showing as offline
- Check network connectivity
- Verify heartbeat is being sent
- Check shared secret configuration
- Review server logs

**Issue**: High replication lag
- Check network bandwidth
- Review sync job status
- Increase worker count
- Optimize payload size

**Issue**: Search results incomplete
- Verify all servers are online
- Check circuit breaker status
- Review timeout settings
- Check cache expiration

## Best Practices

1. **Deploy regional servers close to branches** for minimal latency
2. **Use dedicated network links** between regional servers
3. **Configure backup servers** for critical regions
4. **Monitor replication lag** and set alerts
5. **Regular disaster recovery testing** (monthly recommended)
6. **Implement rate limiting** on cross-server APIs
7. **Cache frequently accessed data** at regional level
8. **Use compression** for inter-server communication

## Migration Path

### From Centralized to Federated

1. **Phase 1**: Deploy Global Command Center
2. **Phase 2**: Deploy first regional server
3. **Phase 3**: Migrate branches to regional server
4. **Phase 4**: Enable federation features
5. **Phase 5**: Deploy additional regional servers
6. **Phase 6**: Enable disaster recovery

## Conclusion

The Federation System transforms Sentinel Grid into an enterprise-grade VMS capable of competing with Genetec Security Center and Milestone XProtect Corporate. It provides:

- ✅ **Scalability**: Support for 10,000+ cameras across multiple regions
- ✅ **Reliability**: Automatic failover and disaster recovery
- ✅ **Performance**: Distributed processing and intelligent caching
- ✅ **Security**: Unified authentication and authorization
- ✅ **Flexibility**: Support for multi-country deployments

This positions Sentinel Grid for deployment in:
- **Banking**: RBI-compliant multi-branch surveillance
- **Government**: Multi-agency coordination
- **Enterprise**: Global corporate security
- **Smart Cities**: City-wide integrated surveillance
- **Railways/Airports**: Multi-site transportation security
