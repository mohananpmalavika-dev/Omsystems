# Recorder Integration Framework - Deployment Checklist

## Pre-Deployment Validation

### 1. Code Review
- [ ] All evidence helpers return proper `EvidenceValue<T>`
- [ ] No adapters invent values (all return OBSERVED or error states)
- [ ] Unknown ≠ False throughout codebase
- [ ] Policy decisions only in `RecorderEvidenceEvaluator`
- [ ] Credentials never logged or persisted in evidence
- [ ] Error handling complete for all adapter operations
- [ ] TypeScript compiles without errors
- [ ] ESLint passes without warnings

### 2. Database Setup
- [ ] Run migration: `001_evidence_tables.sql`
- [ ] Verify enum type: `evidence_state`
- [ ] Verify tables exist:
  - `recorder_evidence_snapshots`
  - `recorder_channel_evidence`
- [ ] Verify views created:
  - `recorder_latest_evidence`
  - `recorder_latest_channel_evidence`
  - `recorder_recording_compliance`
  - `recorder_storage_health`
- [ ] Verify functions exist:
  - `get_evidence_freshness()`
  - `clean_old_evidence()`
- [ ] Check indexes created on:
  - `recorder_id, collected_at`
  - `tenant_id, collected_at`
  - `branch_id, collected_at`
- [ ] Test foreign key constraints work
- [ ] Verify retention cleanup works

### 3. Unit Tests
- [ ] Evidence helper tests pass
- [ ] ONVIF SOAP builder tests pass
- [ ] ONVIF parser tests pass (with fixtures)
- [ ] Hikvision parser tests pass (with fixtures)
- [ ] Transport error mapping tests pass
- [ ] Request limiter tests pass
- [ ] Evidence evaluator tests pass
- [ ] Repository tests pass

### 4. Integration Tests
- [ ] ONVIF adapter can probe test device
- [ ] ONVIF adapter can get device info
- [ ] ONVIF adapter can enumerate channels
- [ ] ONVIF adapter handles auth failures correctly
- [ ] ONVIF adapter handles timeouts correctly
- [ ] Hikvision adapter can probe test device
- [ ] Hikvision adapter can get device info
- [ ] Hikvision adapter can enumerate channels
- [ ] Evidence service can collect complete snapshot
- [ ] Evidence repository can persist/retrieve
- [ ] Evaluator produces correct assessments

### 5. Performance Tests
- [ ] Single recorder evidence collection < 5 seconds
- [ ] 10 concurrent recorders complete within 10 seconds
- [ ] Request limiter enforces per-recorder limits
- [ ] Request limiter enforces global limits
- [ ] Database queries < 50ms
- [ ] No memory leaks in long-running collection
- [ ] Connection pooling works correctly

## Deployment Steps

### Phase 1: Infrastructure Deployment (Week 1)

#### Day 1: Database
- [ ] Create database backup
- [ ] Run migrations in staging
- [ ] Verify schema correctness
- [ ] Test rollback procedure
- [ ] Run migrations in production
- [ ] Monitor database performance

#### Day 2-3: Application Deployment
- [ ] Deploy recorder module to staging
- [ ] Verify imports resolve correctly
- [ ] Check no breaking changes to existing code
- [ ] Run smoke tests
- [ ] Deploy to production (blue-green)
- [ ] Monitor error logs

#### Day 4-5: Evidence Collection
- [ ] Configure evidence collection scheduler
  ```typescript
  // Schedule evidence collection every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    await evidenceCollectionJob.run();
  });
  ```
- [ ] Start collecting evidence for 10% of recorders
- [ ] Monitor collection success rate
- [ ] Check evidence persistence
- [ ] Verify evidence freshness

### Phase 2: Parallel Running (Week 2)

#### Validation
- [ ] Run old and new systems in parallel
- [ ] Compare compliance results
- [ ] Identify discrepancies
- [ ] Document differences (unknown vs false)
- [ ] Validate new system is more accurate

#### Monitoring
- [ ] Set up metrics dashboards
  - Evidence collection rate
  - Collection duration
  - Error rates by type
  - Evidence state distribution
- [ ] Configure alerts
  - Collection failures > 5%
  - Evidence age > 15 minutes
  - Request queue depth > 100
- [ ] Review logs daily

### Phase 3: Service Migration (Week 3)

#### Recording Compliance Service
- [ ] Create feature flag: `USE_EVIDENCE_BASED_COMPLIANCE`
- [ ] Update RecordingComplianceService (see INTEGRATION_GUIDE.md)
- [ ] Test with feature flag OFF (old path)
- [ ] Test with feature flag ON (new path)
- [ ] Enable for 10% of tenants
- [ ] Monitor compliance decisions
- [ ] Compare old vs new results
- [ ] Enable for 50% of tenants
- [ ] Enable for 100% of tenants
- [ ] Remove old code path

#### Health Dashboard
- [ ] Update health endpoints to use evidence
- [ ] Update dashboard queries
- [ ] Test operational status display
- [ ] Verify issue reasons shown correctly
- [ ] Deploy to staging
- [ ] User acceptance testing
- [ ] Deploy to production

### Phase 4: Deprecation (Week 4)

#### Old Adapter Cleanup
- [ ] Mark old adapters as deprecated
- [ ] Remove direct adapter calls from services
- [ ] Remove old health check code
- [ ] Remove old compliance logic
- [ ] Update API documentation
- [ ] Delete deprecated code

## Configuration

### Environment Variables

```bash
# Evidence Collection
EVIDENCE_COLLECTION_ENABLED=true
EVIDENCE_COLLECTION_INTERVAL_MS=300000     # 5 minutes
EVIDENCE_MAX_AGE_MS=600000                 # 10 minutes
EVIDENCE_RETENTION_DAYS=90

# Request Limits
RECORDER_MAX_CONCURRENT_PER_DEVICE=4
RECORDER_MAX_CONCURRENT_GLOBAL=50
RECORDER_REQUEST_TIMEOUT_MS=10000
RECORDER_REQUEST_MAX_RETRIES=3

# Database
DATABASE_POOL_SIZE=20
DATABASE_QUERY_TIMEOUT_MS=5000

# Feature Flags
USE_EVIDENCE_BASED_COMPLIANCE=true
ENABLE_MULTI_ADAPTER_FALLBACK=false        # Future
ENABLE_STREAM_VERIFICATION=false           # Future
```

### Recorder Configuration

```typescript
// Add adapter type to recorder records
interface Recorder {
  id: string;
  url: string;
  credentials: {
    username: string;
    password: string;
  };
  adapterType: 'onvif' | 'hikvision' | 'dahua' | 'auto';
  tlsVerify: boolean;
}
```

## Post-Deployment Validation

### Day 1
- [ ] Evidence collection running for all recorders
- [ ] No critical errors in logs
- [ ] Database growing as expected
- [ ] API response times acceptable
- [ ] No service disruptions

### Day 2-3
- [ ] Review evidence state distribution
  ```sql
  SELECT
    reachable_state,
    COUNT(*) as count,
    ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as percent
  FROM recorder_evidence_snapshots
  WHERE collected_at > NOW() - INTERVAL '24 hours'
  GROUP BY reachable_state
  ORDER BY count DESC;
  ```
- [ ] Check compliance accuracy
- [ ] Verify historical data accumulating
- [ ] Review alert quality (false positive rate)

### Week 1
- [ ] Evidence collection success rate > 95%
- [ ] Average evidence age < 10 minutes
- [ ] No performance degradation
- [ ] Database size within expectations
- [ ] User feedback positive

### Week 2
- [ ] Compliance determination accurate
- [ ] Unknown properly distinguished from non-compliant
- [ ] Historical analysis working
- [ ] Trends visible in dashboards
- [ ] Gap detection functioning

## Rollback Procedures

### If Critical Issues Detected

#### Option 1: Feature Flag Rollback
```typescript
// Immediately disable new path
process.env.USE_EVIDENCE_BASED_COMPLIANCE = 'false';
```

#### Option 2: Service Rollback
```bash
# Revert to previous deployment
kubectl rollout undo deployment/surveillance-backend

# Or redeploy previous version
git checkout v1.2.3
npm run deploy
```

#### Option 3: Database Rollback
```sql
-- Only if migrations cause issues
-- Drop new tables (data loss!)
DROP TABLE IF EXISTS recorder_channel_evidence CASCADE;
DROP TABLE IF EXISTS recorder_evidence_snapshots CASCADE;
DROP TYPE IF EXISTS evidence_state;
```

## Monitoring Dashboards

### Evidence Collection Dashboard

Metrics to display:
- Evidence collection rate (per minute)
- Collection success rate (%)
- Average collection duration (ms)
- Evidence state distribution (pie chart)
- Top errors (bar chart)
- Queue depth (line chart)
- Active requests (gauge)

### Compliance Dashboard

Metrics to display:
- Overall compliance rate (%)
- Compliant recorders (count)
- Non-compliant recorders (count)
- Unknown recorders (count)
- Compliance by branch (bar chart)
- Compliance trend (line chart)
- Top non-compliance reasons (bar chart)

### Performance Dashboard

Metrics to display:
- API response time (p50, p95, p99)
- Database query time
- Memory usage
- CPU usage
- Error rate
- Request queue depth

## Alerts

### Critical Alerts (Page immediately)

```typescript
const criticalAlerts = [
  {
    name: 'Evidence Collection Failing',
    condition: 'collection_success_rate < 80% for 10 minutes',
    action: 'Page on-call engineer'
  },
  {
    name: 'Database Unreachable',
    condition: 'database_connection_errors > 0',
    action: 'Page on-call engineer'
  },
  {
    name: 'Evidence Extremely Stale',
    condition: 'evidence_age > 30 minutes for 50% of recorders',
    action: 'Page on-call engineer'
  }
];
```

### Warning Alerts (Notify team)

```typescript
const warningAlerts = [
  {
    name: 'Evidence Collection Degraded',
    condition: 'collection_success_rate < 95% for 30 minutes',
    action: 'Notify team channel'
  },
  {
    name: 'Evidence Stale',
    condition: 'evidence_age > 15 minutes for 20% of recorders',
    action: 'Notify team channel'
  },
  {
    name: 'High Queue Depth',
    condition: 'request_queue_depth > 50',
    action: 'Notify team channel'
  },
  {
    name: 'High Unknown Rate',
    condition: 'unknown_evidence_percent > 30%',
    action: 'Notify team channel'
  }
];
```

## Success Criteria

### Technical Metrics
- [x] Evidence collection implemented
- [x] ONVIF adapter complete
- [x] Hikvision adapter complete
- [x] Evidence persistence working
- [ ] Collection success rate > 95%
- [ ] Evidence freshness < 10 minutes
- [ ] Database queries < 50ms
- [ ] No memory leaks
- [ ] No performance degradation

### Business Metrics
- [ ] Compliance determination accurate
- [ ] False alert rate < 1%
- [ ] Unknown distinguished from non-compliant
- [ ] Historical analysis functional
- [ ] User feedback positive
- [ ] Support tickets not increasing

## Troubleshooting Guide

### Issue: Evidence Collection Failing

**Symptoms:**
- High error rates
- Evidence age increasing
- Collection success rate dropping

**Investigation:**
1. Check recorder connectivity: `ping <recorder-ip>`
2. Check credentials: test in browser
3. Review adapter logs for specific errors
4. Check database connectivity
5. Verify network/firewall rules

**Resolution:**
- Fix network issues
- Update credentials
- Adjust timeouts if needed
- Increase concurrency limits if queue backing up

### Issue: Unknown Rate Too High

**Symptoms:**
- > 30% of evidence in UNKNOWN state
- Cannot verify compliance
- Dashboards showing incomplete data

**Investigation:**
1. Check evidence state distribution by recorder
2. Review error logs for patterns
3. Test adapters against affected recorders
4. Verify adapter type matches device

**Resolution:**
- Fix adapter implementation issues
- Update recorder adapter type configuration
- Add missing capabilities
- Document unsupported features

### Issue: Performance Degradation

**Symptoms:**
- Slow API responses
- High CPU/memory usage
- Database queries slow

**Investigation:**
1. Check database query performance
2. Review connection pool usage
3. Check for memory leaks
4. Analyze slow queries
5. Review concurrency limits

**Resolution:**
- Add database indexes
- Increase pool size
- Reduce collection frequency
- Optimize queries
- Add caching layer

## Documentation Updates

Post-deployment, update:
- [ ] API documentation with new endpoints
- [ ] User guide with evidence-based features
- [ ] Operations runbook with new procedures
- [ ] Architecture diagrams
- [ ] Training materials for support team

## Sign-Off

- [ ] Technical Lead approval
- [ ] QA sign-off
- [ ] Security review complete
- [ ] Performance benchmarks met
- [ ] Documentation updated
- [ ] Deployment plan reviewed
- [ ] Rollback plan tested
- [ ] Monitoring configured
- [ ] Alerts configured
- [ ] Team trained

---

**Deployment Date:** __________________

**Deployed By:** __________________

**Verified By:** __________________

**Notes:** __________________
