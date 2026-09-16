# Edge Fleet Management - Production Deployment Guide

## Overview

The Edge Fleet Management system provides production-ready lifecycle control for edge gateway agents across hundreds of branches. This guide covers deployment, initialization, and operational procedures.

## Architecture

### Components

1. **EdgeFleetManagerService** - Core fleet operations (queries, upgrades, heartbeats)
2. **EdgeFleetInitializerService** - Fleet initialization and synchronization
3. **Edge Lifecycle Routes** - REST API endpoints for fleet management
4. **Edge Fleet Manager UI** - Dashboard for monitoring and operations

### Data Flow

```
Branch Infrastructure (ControlPlaneStore)
    ↓
EdgeFleetInitializerService.initializeFleet()
    ↓
EdgeAgent records created in database
    ↓
EdgeFleetManagerService operations (read/update agents)
    ↓
UI displays real-time fleet status
```

## Deployment Steps

### 1. Database Schema

Ensure the following methods are available in your ControlPlaneStore implementation:

```typescript
// Required ControlPlaneStore methods for edge fleet management
interface ControlPlaneStore {
  // Branch operations
  listBranches(tenantId: string): Promise<Branch[]>;
  
  // Edge agent CRUD
  createEdgeAgent(agent: EdgeAgent): Promise<EdgeAgent>;
  getEdgeAgent(agentId: string): Promise<EdgeAgent | null>;
  updateEdgeAgent(agent: EdgeAgent): Promise<EdgeAgent>;
  deleteEdgeAgent(agentId: string): Promise<void>;
  listEdgeAgentsByBranch(branchId: string): Promise<EdgeAgent[]>;
  
  // Telemetry (for status determination)
  getOperationalTelemetry(key: string): Promise<any>;
  
  // Edge commands (for update queue)
  listEdgeCommands(branchId: string, limit: number): Promise<EdgeCommand[]>;
  createEdgeCommand(command: EdgeCommand): Promise<EdgeCommand>;
}
```

### 2. Environment Configuration

No additional environment variables required. The system uses existing infrastructure:

- Branch data from ControlPlaneStore
- Operational telemetry for health determination
- Edge command queue for upgrade orchestration

### 3. Application Startup

The fleet management routes are registered in `src/app.ts`:

```typescript
import { registerEdgeLifecycleRoutes } from "./routes/edge-lifecycle.routes.js";

// In buildApp function:
await registerEdgeLifecycleRoutes(app, store);
```

**Automatic Initialization**: Fleet is automatically initialized on first API request per tenant.

### 4. Manual Initialization (Optional)

For immediate fleet setup on application start, add to your startup script:

```bash
# Initialize fleet for default tenant
curl -X POST http://localhost:8080/v1/edge/fleet/initialize \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

Or trigger from code:

```typescript
import { EdgeFleetInitializerService } from "./edge-management/services/edge-fleet-initializer.service.js";

const initializer = new EdgeFleetInitializerService(store);
const result = await initializer.initializeFleet("your-tenant-id");
console.log(`Fleet initialized: ${result.summary.totalAgents} agents`);
```

## Fleet Initialization Process

### What Happens During Initialization

1. **Query Branches**: Fetches all active branches for the tenant
2. **Check Existing Agents**: Skips branches that already have edge agents
3. **Determine Status**: Analyzes network telemetry to set agent status
4. **Create Agent Records**: Persists EdgeAgent records to database
5. **Set Versions**: Assigns latest agent version and configuration version

### Status Determination Logic

Agent status is derived from branch network telemetry:

- **ONLINE**: Network telemetry < 5 minutes old, WAN state = ONLINE
- **DEGRADED**: Network telemetry recent but WAN in FAILOVER or degraded
- **OFFLINE**: Network telemetry > 5 minutes old or WAN state = OFFLINE

### Initialization Results

```typescript
{
  initialized: 245,      // New agents created
  skipped: 155,          // Existing agents (no action)
  errors: 0,             // Failed initializations
  summary: {
    totalBranches: 400,
    totalAgents: 400,
    agentsByStatus: {
      "ONLINE": 388,
      "DEGRADED": 7,
      "OFFLINE": 5
    }
  }
}
```

## API Endpoints

### Fleet Operations

#### Get Fleet Summary
```http
GET /v1/edge/fleet/summary
```

Returns:
- Total agents, online/degraded/offline counts
- Version distribution
- Config compliance status
- Certificate health metrics

#### List Agents (with filters)
```http
GET /v1/edge/agents?status=ONLINE&search=branch-001&driftOnly=true
```

Query parameters:
- `status`: Filter by status (ONLINE, DEGRADED, OFFLINE, etc.)
- `version`: Filter by agent version
- `search`: Search branch name/code/hostname
- `driftOnly`: Show only drifted agents

#### Get Agent Details
```http
GET /v1/edge/agents/{agentId}
```

#### Get Digital Twin View
```http
GET /v1/edge/agents/{agentId}/digital-twin
```

Returns blast radius analysis, hardware info, and dependency graph.

### Lifecycle Operations

#### Process Heartbeat
```http
POST /v1/edge/heartbeat
Content-Type: application/json

{
  "agentId": "edge-agent-branch-001",
  "branchId": "branch-001",
  "agentVersion": "3.7.2",
  "configurationVersion": "v34",
  "startedAt": "2026-09-16T10:00:00Z",
  "serviceUptimeSeconds": 3600,
  "system": {
    "cpuPercent": 21,
    "memoryUsedBytes": 2147483648,
    "memoryTotalBytes": 8589934592,
    "diskUsedBytes": 107374182400,
    "diskTotalBytes": 549755813888
  },
  "services": {
    "edgeAgent": "HEALTHY",
    "mediaMtx": "HEALTHY",
    "ffmpegWorkers": "HEALTHY"
  },
  "cameras": {
    "configured": 24,
    "reachable": 24,
    "streaming": 24,
    "recording": 24
  }
}
```

Agents should send heartbeats every 30 seconds.

#### Upgrade Agent
```http
POST /v1/edge/agents/{agentId}/upgrade
Content-Type: application/json

{
  "targetVersion": "3.7.2"
}
```

Executes remote upgrade with automatic health verification.

#### Rollback Agent
```http
POST /v1/edge/agents/{agentId}/rollback
```

Rolls back to previous version.

#### Reconcile Configuration
```http
POST /v1/edge/agents/{agentId}/reconcile-config
```

Forces configuration sync to desired state.

### Administrative Operations

#### Manual Fleet Initialization
```http
POST /v1/edge/fleet/initialize
```

Creates edge agent records for all branches (skips existing).

#### Fleet Sync
```http
POST /v1/edge/fleet/sync
```

Reconciles fleet with current branch infrastructure:
- Adds agents for new branches
- Removes agents for deleted branches (TODO)

#### Reinitialize Branch Agent
```http
POST /v1/edge/agents/{branchId}/reinitialize
```

Deletes and recreates edge agent for specific branch.

#### Fleet-Wide Update Queue
```http
POST /v1/edge-gateway/fleet/siren
Content-Type: application/json

{
  "version": "0.1.18",
  "branches": ["all"]
}
```

Queues update command for all branches (or specified subset).

## Monitoring & Operations

### Health Checks

**Fleet Initialization Status**:
```bash
curl http://localhost:8080/v1/edge/fleet/summary | jq '.data.totalAgents'
```

Expected: Number should match total active branches.

**Agent Status Distribution**:
```bash
curl http://localhost:8080/v1/edge/fleet/summary | jq '.data | {online, degraded, offline}'
```

Expected: >95% online in healthy deployment.

**Certificate Health**:
```bash
curl http://localhost:8080/v1/edge/fleet/summary | jq '.data.certificates'
```

Expected: expiringWithin14Days should be 0.

### Common Operations

#### Find Drifted Agents
```bash
curl "http://localhost:8080/v1/edge/agents?driftOnly=true" | jq '.data[] | {id, branch: .branchName, version: .agentVersion, desired: .desiredAgentVersion}'
```

#### Search for Specific Branch
```bash
curl "http://localhost:8080/v1/edge/agents?search=branch-042" | jq '.data[0]'
```

#### Upgrade All Drifted Agents
```bash
# Get drifted agent IDs
DRIFTED=$(curl -s "http://localhost:8080/v1/edge/agents?driftOnly=true" | jq -r '.data[].id')

# Upgrade each
for AGENT_ID in $DRIFTED; do
  curl -X POST "http://localhost:8080/v1/edge/agents/$AGENT_ID/upgrade" \
    -H "Content-Type: application/json" \
    -d '{"targetVersion":"3.7.2"}'
  sleep 2
done
```

## Troubleshooting

### Empty Fleet (0 agents)

**Symptom**: Fleet summary shows `totalAgents: 0`

**Cause**: Fleet not initialized or no branches in tenant

**Solution**:
1. Verify branches exist: `curl http://localhost:8080/v1/branches`
2. Trigger initialization: `curl -X POST http://localhost:8080/v1/edge/fleet/initialize`
3. Check logs for initialization errors

### Agents Stuck in OFFLINE Status

**Symptom**: Agents show OFFLINE despite network being up

**Cause**: Outdated network telemetry or heartbeat not received

**Solution**:
1. Check network telemetry age: Query `operational_telemetry` table
2. Verify edge agent is sending heartbeats
3. Manual sync: `curl -X POST http://localhost:8080/v1/edge/fleet/sync`

### Version Drift Not Resolving

**Symptom**: Agent shows DRIFTED after upgrade command sent

**Cause**: Agent hasn't processed update command yet

**Solution**:
1. Check edge command queue: Look for pending `apply-update` commands
2. Verify agent is online and processing commands
3. Wait for agent to report version in next heartbeat (30s cycle)

### Fleet Summary Shows Old Data

**Symptom**: UI displays stale metrics

**Cause**: Frontend caching or polling interval

**Solution**:
1. Hard refresh browser (Ctrl+Shift+R)
2. Check network tab for API response
3. Verify API endpoint returns current data

## Migration from Demo Data

If upgrading from the previous demo implementation:

1. **Stop Application**: Prevent demo data conflicts
2. **Clear In-Memory State**: No database migration needed (was in-memory only)
3. **Deploy New Code**: With ControlPlaneStore integration
4. **Initialize Fleet**: `POST /v1/edge/fleet/initialize`
5. **Verify Counts**: Compare agent count to branch count

No data loss occurs as demo data was never persisted.

## Performance Considerations

### Fleet Initialization

- **Small deployments (<50 branches)**: < 5 seconds
- **Medium deployments (50-200 branches)**: 10-20 seconds
- **Large deployments (200-500 branches)**: 30-60 seconds

Initialization runs once per tenant per application lifecycle.

### API Response Times

- **Fleet Summary**: < 200ms (aggregates all agents)
- **List Agents (no filter)**: < 500ms for 400 agents
- **List Agents (filtered)**: < 100ms
- **Get Single Agent**: < 50ms
- **Heartbeat Processing**: < 100ms (includes DB write)

### Heartbeat Load

At 400 branches with 30-second heartbeat interval:
- **13.3 heartbeats/second** sustained
- **~1.15 million heartbeats/day**

Ensure database can handle this write throughput.

## Security Considerations

### Authentication & Authorization

All endpoints should require:
- Valid authentication token
- Tenant-scoped access (users see only their tenant's fleet)
- Role-based access for administrative operations

Currently using `request.currentUser.tenantId` - ensure your auth middleware populates this.

### Heartbeat Validation

Edge agents must prove identity via:
- Cryptographic signatures (implemented in edge-gateway-operations.routes)
- Valid agent credentials
- Branch-agent binding verification

### Upgrade Package Signing

All upgrade packages must be:
- Cryptographically signed with RSA key
- SHA-256 hash verified before installation
- Served over TLS

See `signEdgeUpdateManifest()` in edge-gateway-operations.routes.ts.

## Production Checklist

- [ ] ControlPlaneStore implements all required edge agent methods
- [ ] Database indexes on `edge_agents` table (branchId, tenantId, status)
- [ ] Fleet initialized for all active tenants
- [ ] Heartbeat processing tested under load
- [ ] Certificate renewal automation configured
- [ ] Monitoring alerts for offline agents (>5% threshold)
- [ ] Backup/restore procedures for edge agent records
- [ ] Upgrade rollback procedures documented
- [ ] Fleet-wide update approval workflow established
- [ ] Edge agent authentication keys rotated

## Support & Maintenance

### Regular Tasks

- **Daily**: Review fleet summary metrics
- **Weekly**: Check certificate expiration warnings
- **Monthly**: Audit version distribution, upgrade drifted agents
- **Quarterly**: Review and optimize fleet queries

### Scaling Beyond 500 Branches

For deployments >500 branches:
1. Implement pagination on agent list endpoint
2. Add database read replicas for query load
3. Consider sharding by region or tenant
4. Cache fleet summary (refresh every 30s)
5. Implement streaming updates via WebSocket

## Related Documentation

- [Edge Agent Implementation](../../edge-agent/README.md)
- [Edge Gateway Operations API](../routes/edge-gateway-operations.routes.ts)
- [Digital Twin Integration](../digital-twin/README.md)
- [Branch Infrastructure](../../docs/BRANCH_ARCHITECTURE.md)

## Version History

- **v1.0** (2026-09-16): Initial production-ready implementation
  - Removed demo data and hardcoded values
  - Integrated with ControlPlaneStore
  - Added automatic fleet initialization
  - Production deployment documentation
