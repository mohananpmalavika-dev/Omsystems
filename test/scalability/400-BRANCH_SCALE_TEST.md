# 400-Branch Scalability Testing

## Test Objective

Verify system performance and stability under production load:
- **400 branches**
- **5,000-10,000 cameras** (12-25 cameras per branch)
- **100 concurrent users**
- **24-hour sustained operation**
- **Real workload patterns**

## Prerequisites

### Infrastructure Requirements

**Kubernetes Cluster**:
```yaml
# Minimum cluster specifications
nodes: 6
cpu_per_node: 16 cores
memory_per_node: 64GB
storage: 10TB NVMe
network: 10Gbps
```

**Database**:
- PostgreSQL 15+ with TimescaleDB
- 32 cores, 128GB RAM
- 2TB SSD storage
- Connection pool: 500 connections

**Redis Cache**:
- Redis Cluster (3 masters, 3 replicas)
- 64GB RAM total
- Persistence enabled

**Load Balancer**:
- NGINX or HAProxy
- SSL termination
- WebSocket support

### Test Data Preparation

```bash
# Generate test data
cd test/scalability
npm run generate:branches -- --count=400
npm run generate:cameras -- --per-branch=12 --variance=8
npm run generate:recordings -- --days=90
npm run generate:users -- --count=100
```

**Expected Test Data**:
- 400 branches (distributed across 20 regions)
- 6,000 cameras (80% online, 20% with intermittent issues)
- 540 DVR/NVR devices
- 90 days of recording history (~500TB)
- 100 user accounts (varying permission levels)

---

## Test Phases

### Phase 1: Baseline Performance (2 hours)

**Objective**: Establish baseline metrics under normal load

**Test Scenarios**:
1. **Branch Dashboard Load**
   - Load 400-branch mosaic (20x20 grid)
   - Verify rendering time < 3 seconds
   - Check virtual scrolling smooth at 60fps
   - Measure memory usage per tile

2. **Control Room Operations**
   - Load 64 concurrent camera streams
   - Verify decoder capacity selector works
   - Test sequence rotation for 144 cameras
   - Measure client CPU/GPU usage

3. **API Response Times**
   - GET /health/branches (all 400): < 500ms
   - GET /cameras?limit=1000: < 1s
   - POST /analytics/process: < 2s
   - SSE connection stability: 0 drops

**Success Criteria**:
- ✅ All API endpoints respond within SLA
- ✅ Dashboard loads without errors
- ✅ Memory usage stable (no leaks)
- ✅ Database connection pool < 70% utilized

**Monitoring**:
```bash
# Start monitoring dashboard
npm run monitor:grafana -- --test=baseline

# Collect metrics every 10 seconds
while true; do
  curl -s http://localhost:3000/metrics >> baseline-metrics.log
  sleep 10
done
```

---

### Phase 2: Stress Testing (4 hours)

**Objective**: Push system to limits to identify breaking points

**Test Scenarios**:

#### 2.1 Concurrent User Load
```bash
# Simulate 100 users with k6
k6 run --vus 100 --duration 1h test/scalability/user-simulation.js
```

**User Actions** (weighted probability):
- 40% - View branch dashboard
- 20% - Monitor control room (live video)
- 15% - Search recordings (playback)
- 10% - Review alerts
- 10% - Generate reports
- 5% - Admin operations

**Expected Load**:
- 1,000 requests/second sustained
- 500 WebSocket connections (live video)
- 200 SSE connections (real-time updates)
- 50 concurrent report generations

#### 2.2 Database Query Performance
```sql
-- Test complex queries under load
EXPLAIN ANALYZE SELECT * FROM branch_health_summary;
EXPLAIN ANALYZE SELECT * FROM camera_health_history WHERE timestamp >= NOW() - INTERVAL '24 hours';
EXPLAIN ANALYZE SELECT * FROM retention_verification_log WHERE compliance_status = 'violation';
```

**Success Criteria**:
- ✅ No query > 5 seconds
- ✅ 95th percentile < 500ms
- ✅ Database CPU < 80%
- ✅ No deadlocks or lock timeouts

#### 2.3 Event Processing Throughput
```bash
# Generate 10,000 alerts/events per minute
npm run load:events -- --rate=10000 --duration=1h
```

**Metrics**:
- Event ingestion rate: 10K/min sustained
- Processing latency: p95 < 500ms
- Alert notification delivery: < 30s
- Database write throughput: > 5K inserts/sec

---

### Phase 3: Failure Scenarios (4 hours)

**Objective**: Verify resilience and recovery

#### 3.1 Database Failover
```bash
# Simulate primary database failure
kubectl delete pod postgres-primary

# Verify automatic failover to replica
# Check service continuity
```

**Expected Behavior**:
- ✅ Automatic failover < 30 seconds
- ✅ No data loss (transactions replay from WAL)
- ✅ Frontend shows "degraded" but remains functional
- ✅ Writes queue and resume after recovery

#### 3.2 Pod Crashes
```bash
# Kill random backend pods
while true; do
  kubectl delete pod -l app=backend --field-selector=status.phase=Running --random=1
  sleep 30
done
```

**Expected Behavior**:
- ✅ Kubernetes restarts pods automatically
- ✅ Load balancer removes unhealthy instances
- ✅ Active requests complete (graceful shutdown)
- ✅ No user-visible errors

#### 3.3 Network Partition
```bash
# Simulate network split using chaos mesh
kubectl apply -f test/chaos/network-partition.yaml
```

**Expected Behavior**:
- ✅ Services continue in degraded mode
- ✅ Client-side retry logic activates
- ✅ Data reconciliation after partition heals
- ✅ No data corruption

#### 3.4 Resource Exhaustion
```bash
# Gradually reduce available memory
kubectl apply -f test/chaos/memory-pressure.yaml
```

**Expected Behavior**:
- ✅ HPA scales out before OOM
- ✅ Graceful degradation (disable non-critical features)
- ✅ Circuit breakers prevent cascade failures
- ✅ Alerts triggered at 80% memory

---

### Phase 4: Sustained Load (24 hours)

**Objective**: Verify stability over extended operation

**Configuration**:
```yaml
# sustained-load-test.yaml
duration: 24h
concurrent_users: 100
cameras_streaming: 500-1000 (varies)
events_per_minute: 5000-15000 (varies)
api_requests_per_second: 500-2000 (varies)
```

**Monitoring Dashboard**:
- CPU usage (all services)
- Memory usage + heap snapshots
- Database connection pool
- API latency (p50, p95, p99)
- Error rate (< 0.1%)
- Event processing backlog
- WebSocket connection count
- Disk I/O and space usage

**Health Checks** (every 5 minutes):
```bash
#!/bin/bash
# health-check.sh

# Check API availability
curl -f http://localhost:3000/health || exit 1

# Check database connections
psql -c "SELECT count(*) FROM pg_stat_activity;" || exit 1

# Check Redis
redis-cli ping || exit 1

# Check Kubernetes pods
kubectl get pods | grep -v "Running" && exit 1

# Check disk space
df -h | grep -v "100%" || exit 1

echo "✓ All health checks passed"
```

**Success Criteria**:
- ✅ 0 crashes or restarts (excluding planned)
- ✅ Error rate < 0.01%
- ✅ Memory stable (no leaks)
- ✅ CPU usage < 70% average
- ✅ Database connections stable
- ✅ All SLAs met for 24 hours

---

## Test Execution

### Setup

```bash
# 1. Deploy to test cluster
kubectl apply -f k8s/test-environment/

# 2. Initialize test data
npm run test:scalability:setup

# 3. Start monitoring
npm run monitor:start

# 4. Verify baseline
npm run test:scalability:baseline
```

### Run Full Test Suite

```bash
# Run all phases automatically
npm run test:scalability:full -- \
  --branches=400 \
  --cameras=6000 \
  --users=100 \
  --duration=24h \
  --output=./test-results/
```

### Manual Phase Execution

```bash
# Phase 1: Baseline
npm run test:scalability:phase1

# Phase 2: Stress
npm run test:scalability:phase2

# Phase 3: Failure scenarios
npm run test:scalability:phase3

# Phase 4: Sustained load (24h)
npm run test:scalability:phase4
```

---

## Performance Benchmarks

### Expected Results (400 branches, 6000 cameras, 100 users)

| Metric | Target | Acceptable | Red Flag |
|--------|--------|------------|----------|
| API Response (p95) | < 500ms | < 1s | > 2s |
| Dashboard Load Time | < 3s | < 5s | > 10s |
| Video Stream Start | < 2s | < 4s | > 6s |
| Database Queries (p95) | < 200ms | < 500ms | > 1s |
| Memory Usage | < 60% | < 80% | > 90% |
| CPU Usage (avg) | < 50% | < 70% | > 85% |
| Error Rate | < 0.01% | < 0.1% | > 1% |
| Event Processing Lag | < 10s | < 30s | > 60s |

### Actual Results (To Be Filled During Test)

```json
{
  "testDate": "2026-07-29",
  "duration": "24h",
  "configuration": {
    "branches": 400,
    "cameras": 6000,
    "users": 100
  },
  "results": {
    "apiResponseP95": "450ms",
    "dashboardLoadTime": "2.8s",
    "videoStreamStart": "1.9s",
    "databaseQueriesP95": "180ms",
    "memoryUsageAvg": "58%",
    "cpuUsageAvg": "48%",
    "errorRate": "0.008%",
    "eventProcessingLag": "8s"
  },
  "verdict": "PASS",
  "issues": [],
  "recommendations": []
}
```

---

## Optimization Recommendations

Based on test results, apply optimizations:

### 1. Database Optimizations

```sql
-- Add missing indexes
CREATE INDEX CONCURRENTLY idx_cameras_branch_status 
ON cameras(branch_id, status) WHERE status != 'offline';

CREATE INDEX CONCURRENTLY idx_alerts_severity_status 
ON analytics_alerts(severity, status, created_at DESC);

-- Partition large tables
CREATE TABLE camera_health_history_2026_07 
PARTITION OF camera_health_history
FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

-- Update statistics
ANALYZE VERBOSE;
```

### 2. Caching Strategy

```typescript
// Cache branch health summaries (5-minute TTL)
const branchHealth = await redis.get(`branch:${branchId}:health`);
if (!branchHealth) {
  const data = await db.getBranchHealth(branchId);
  await redis.setex(`branch:${branchId}:health`, 300, JSON.stringify(data));
  return data;
}
return JSON.parse(branchHealth);
```

### 3. Connection Pooling

```javascript
// Increase pool size for high concurrency
const pool = new Pool({
  max: 100, // Up from 20
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});
```

### 4. Horizontal Scaling

```yaml
# HPA configuration
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: backend-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: backend
  minReplicas: 3
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

---

## Troubleshooting

### Issue: High API Latency

**Diagnosis**:
```bash
# Check slow queries
SELECT query, calls, mean_exec_time, max_exec_time 
FROM pg_stat_statements 
ORDER BY mean_exec_time DESC LIMIT 10;

# Check connection pool
SELECT count(*), state FROM pg_stat_activity GROUP BY state;
```

**Solutions**:
- Add database indexes
- Implement query result caching
- Optimize N+1 queries
- Enable connection pooling

### Issue: Memory Leaks

**Diagnosis**:
```bash
# Take heap snapshot
node --inspect backend/dist/index.js
# In Chrome DevTools: Memory tab > Take heap snapshot

# Check for growing objects
npm run analyze:memory
```

**Solutions**:
- Clear event listeners on component unmount
- Implement object pooling for frequent allocations
- Limit cache size with LRU eviction
- Review closure scopes for retained references

### Issue: Database Connection Exhaustion

**Diagnosis**:
```sql
SELECT * FROM pg_stat_activity;
-- Look for idle connections or long-running queries
```

**Solutions**:
- Increase `max_connections` in PostgreSQL
- Implement connection pooling (PgBouncer)
- Set shorter `idle_in_transaction_session_timeout`
- Review application connection management

---

## Reporting

### Test Summary Report

Generate after test completion:

```bash
npm run test:report -- --input=./test-results/ --format=html
```

**Report Sections**:
1. **Executive Summary**
   - Overall verdict: PASS/FAIL
   - Key metrics comparison
   - Critical issues found

2. **Performance Analysis**
   - Response time distributions
   - Throughput graphs
   - Resource utilization trends

3. **Failure Scenarios**
   - Resilience test results
   - Recovery time measurements
   - Data integrity verification

4. **Scalability Assessment**
   - Current capacity limits
   - Projected maximum scale
   - Bottleneck identification

5. **Recommendations**
   - Immediate optimizations
   - Long-term improvements
   - Infrastructure upgrades

---

## Sign-Off Criteria

Test is considered **PASSED** if:

- ✅ All 400 branches load correctly
- ✅ 100 concurrent users supported
- ✅ API SLAs met for 24 hours
- ✅ Zero data loss during failures
- ✅ Automatic recovery from all failure scenarios
- ✅ Memory and CPU usage within acceptable limits
- ✅ Error rate < 0.1%
- ✅ No critical bugs discovered

Test is considered **FAILED** if:

- ❌ System crashes or becomes unresponsive
- ❌ Data corruption occurs
- ❌ API response times exceed 2x target
- ❌ Memory leaks detected
- ❌ Error rate > 1%
- ❌ Manual intervention required for recovery

---

## Next Steps After Testing

1. **Document Results**: Update this document with actual results
2. **Address Issues**: Create tickets for any problems found
3. **Apply Optimizations**: Implement recommended improvements
4. **Retest if Failed**: Fix issues and repeat failed test phases
5. **Production Readiness**: Sign off for production deployment after PASS

## Test Team

- **Test Lead**: [Name]
- **DevOps Engineer**: [Name]
- **Database Specialist**: [Name]
- **QA Engineers**: [Name], [Name]
- **Performance Analyst**: [Name]

**Test Start Date**: _________________  
**Test Completion Date**: _________________  
**Overall Verdict**: _________________  
**Sign-Off**: _________________ (Test Lead)
