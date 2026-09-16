# Edge Fleet Management - Production Deployment Checklist

Use this checklist to ensure a successful production deployment of the fleet management system.

## Pre-Deployment Validation

- [x] **Run validation script**
  ```bash
  npx tsx src/edge-management/scripts/validate-fleet-deployment.ts
  ```
  Expected: All 12 checks pass ✅

- [ ] **Review code changes**
  - [ ] `src/edge-management/services/edge-fleet-manager.service.ts` - Uses ControlPlaneStore
  - [ ] `src/edge-management/services/edge-fleet-initializer.service.ts` - Created
  - [ ] `src/routes/edge-lifecycle.routes.ts` - Initializes with store
  - [ ] `dashboard/components/edge-fleet-manager.tsx` - No demo values

- [ ] **Verify ControlPlaneStore implementation**
  - [ ] `createEdgeAgent()` method exists
  - [ ] `getEdgeAgent()` method exists
  - [ ] `updateEdgeAgent()` method exists
  - [ ] `deleteEdgeAgent()` method exists
  - [ ] `listEdgeAgentsByBranch()` method exists
  - [ ] `listBranches()` method exists
  - [ ] `getOperationalTelemetry()` method exists

## Database Preparation

- [ ] **Schema verification**
  - [ ] `edge_agents` table exists
  - [ ] All EdgeAgent fields are columns
  - [ ] Foreign key to branches table (if applicable)

- [ ] **Index creation** (for performance)
  ```sql
  CREATE INDEX idx_edge_agents_branch ON edge_agents(branchId);
  CREATE INDEX idx_edge_agents_tenant ON edge_agents(tenantId);
  CREATE INDEX idx_edge_agents_status ON edge_agents(status);
  CREATE INDEX idx_edge_agents_heartbeat ON edge_agents(lastHeartbeatAt);
  CREATE INDEX idx_edge_agents_version ON edge_agents(agentVersion);
  ```

- [ ] **Test data cleanup** (if needed)
  - [ ] Remove any manually inserted test edge agents
  - [ ] Verify branch data is accurate

## Development Testing

- [ ] **Local deployment test**
  ```bash
  npm run dev
  # Wait for startup
  curl http://localhost:8080/v1/edge/fleet/summary
  ```

- [ ] **Verify fleet initialization**
  - [ ] Check logs for: `[EdgeFleet] Initializing fleet for tenant:`
  - [ ] Fleet summary returns actual branch count (not 400)
  - [ ] No errors in initialization logs

- [ ] **UI verification**
  - [ ] Navigate to `/operations/edge-fleet`
  - [ ] Confirm no hardcoded values (400, 388, 315, etc.)
  - [ ] Loading state appears briefly
  - [ ] Empty state shows if no branches exist
  - [ ] Real data populates when branches exist

- [ ] **API endpoint tests**
  ```bash
  # Get fleet summary
  curl http://localhost:8080/v1/edge/fleet/summary | jq
  
  # List agents
  curl http://localhost:8080/v1/edge/agents | jq '.count'
  
  # Search agents
  curl "http://localhost:8080/v1/edge/agents?search=branch" | jq
  
  # Get specific agent
  curl http://localhost:8080/v1/edge/agents/edge-agent-branch-001 | jq
  
  # Manual fleet initialization (admin)
  curl -X POST http://localhost:8080/v1/edge/fleet/initialize | jq
  ```

- [ ] **Heartbeat processing test**
  ```bash
  curl -X POST http://localhost:8080/v1/edge/heartbeat \
    -H "Content-Type: application/json" \
    -d '{
      "agentId": "test-agent",
      "branchId": "test-branch",
      "agentVersion": "3.7.2",
      "configurationVersion": "v34",
      "startedAt": "2026-09-16T10:00:00Z",
      "serviceUptimeSeconds": 3600,
      "system": {
        "cpuPercent": 25,
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
    }' | jq
  ```
  Expected: `{"success": true, "desiredState": {...}}`

## Staging Environment

- [ ] **Deploy to staging**
  - [ ] Application starts without errors
  - [ ] Fleet initializes on first request
  - [ ] Logs show successful initialization

- [ ] **Load testing** (if >200 branches)
  ```bash
  # Simulate concurrent heartbeats
  # Should handle 13+ heartbeats/second for 400 branches
  ```

- [ ] **Performance verification**
  - [ ] Fleet summary < 200ms
  - [ ] List agents < 500ms
  - [ ] Heartbeat processing < 100ms
  - [ ] No database deadlocks or timeouts

- [ ] **Multi-tenant testing** (if applicable)
  - [ ] Each tenant sees only their agents
  - [ ] Fleet initialization per tenant works
  - [ ] No cross-tenant data leakage

## Pre-Production Checklist

- [ ] **Security review**
  - [ ] Authentication required on all endpoints
  - [ ] Tenant isolation verified
  - [ ] Admin endpoints have elevated permissions
  - [ ] Heartbeat authentication in place (see edge-gateway-operations)

- [ ] **Monitoring setup**
  - [ ] Alert: Offline agents > 5%
  - [ ] Alert: Certificate expiring < 14 days
  - [ ] Alert: Fleet initialization failures
  - [ ] Dashboard: Fleet health metrics
  - [ ] Log aggregation for edge fleet operations

- [ ] **Backup procedures**
  - [ ] Edge agent records included in database backups
  - [ ] Recovery procedure documented
  - [ ] Test restore process

- [ ] **Documentation review**
  - [ ] Operations team trained on fleet management
  - [ ] Troubleshooting guide accessible
  - [ ] Escalation procedures defined

## Production Deployment

- [ ] **Deploy application**
  - [ ] Standard deployment process
  - [ ] Health checks pass
  - [ ] Application logs clean

- [ ] **Initial fleet state**
  - [ ] Access fleet UI: `/operations/edge-fleet`
  - [ ] Verify agent count matches branch count
  - [ ] Note baseline metrics (online %, version distribution)

- [ ] **Monitor first hour**
  - [ ] Watch for heartbeat ingestion
  - [ ] Check agent status transitions (OFFLINE → ONLINE)
  - [ ] Verify no initialization errors
  - [ ] Database query performance acceptable

- [ ] **Smoke tests**
  ```bash
  # Production API tests (use actual domain)
  PROD_URL="https://your-domain.com"
  
  # Fleet summary
  curl $PROD_URL/v1/edge/fleet/summary | jq '.data.totalAgents'
  
  # Agent search
  curl "$PROD_URL/v1/edge/agents?status=ONLINE" | jq '.count'
  
  # Check version distribution
  curl $PROD_URL/v1/edge/fleet/summary | jq '.data.versionDistribution'
  ```

## Post-Deployment Verification

- [ ] **Day 1 checks**
  - [ ] All branches have edge agents enrolled
  - [ ] Heartbeat processing stable
  - [ ] No error spikes in logs
  - [ ] UI displays accurate real-time data

- [ ] **Week 1 checks**
  - [ ] Version distribution matches expectations
  - [ ] Certificate health within normal ranges
  - [ ] No degraded agents without resolution
  - [ ] Upgrade/rollback operations tested

- [ ] **Month 1 checks**
  - [ ] Performance metrics stable
  - [ ] No slow query complaints
  - [ ] Fleet sync successful
  - [ ] Operations team comfortable with system

## Rollback Plan

If issues occur, rollback steps:

1. **Immediate**: Revert to previous version
   - Previous version used in-memory state (no persistence)
   - No data migration needed
   - No database changes to revert

2. **Data**: Edge agent records remain in database
   - Leave records for future retry
   - Or: `DELETE FROM edge_agents WHERE createdAt > 'deployment-time'`

3. **UI**: Users may see empty fleet
   - Expected if previous version had in-memory demo data
   - Inform users fleet will repopulate on next deployment

## Common Issues & Resolutions

### Issue: Fleet shows 0 agents after deployment

**Check**:
```bash
# Verify branches exist
curl $API_URL/v1/branches | jq '.data | length'

# Check logs for initialization
grep "EdgeFleet" application.log

# Manual initialization
curl -X POST $API_URL/v1/edge/fleet/initialize
```

### Issue: UI shows loading forever

**Check**:
- Network tab in browser dev tools
- API endpoint responding?
- CORS configured correctly?
- Authentication token valid?

### Issue: Agents not transitioning to ONLINE

**Check**:
- Edge agents actually sending heartbeats?
- Heartbeat endpoint authentication working?
- Database write permissions?
- Check agent logs on edge devices

### Issue: Database performance degraded

**Check**:
- Indexes created? (see Database Preparation above)
- Query plan analysis: `EXPLAIN ANALYZE SELECT * FROM edge_agents ...`
- Connection pool size adequate?
- Consider read replicas for query load

## Support Contacts

- **Technical Lead**: [Name] - [Email]
- **Database Admin**: [Name] - [Email]
- **On-Call Engineer**: [Rotation]
- **Documentation**: `src/edge-management/FLEET_MANAGEMENT_PRODUCTION_GUIDE.md`

## Sign-Off

**Validated by**: _____________________ Date: _____

**Deployed by**: _____________________ Date: _____

**Production verified**: _____________________ Date: _____

---

**Status**: Ready for production deployment ✅

All demo data removed, production infrastructure integrated, validation passed.
