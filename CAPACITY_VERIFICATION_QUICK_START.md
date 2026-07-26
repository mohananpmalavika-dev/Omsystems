# Capacity Verification Quick Start Guide

**Goal:** Move from 45% to 100% verified capacity for 400 branches / 5,000 cameras

**Current Status:** Architecture exists, but NO load testing or capacity proof has been completed.

---

## TL;DR — What You Need to Do

1. **Run Phase 1 benchmark** → Validate control plane with 5,000 camera heartbeats
2. **Run Phase 2 benchmark** → Validate event processing at 500 events/second
3. **Run Phase 3 benchmark** → Validate recording with 500-1,000 concurrent streams
4. **Run Phase 4 tests** → Validate failure recovery and resilience
5. **Deploy to production** → Prove capacity with real 200+ branch deployment for 30+ days

**Estimated Time:** 8-12 weeks

---

## Prerequisites

### Infrastructure Required

```yaml
Control Plane Cluster:
  - 2× API nodes (4 vCPU, 16GB RAM)
  - 1× PostgreSQL (8 vCPU, 32GB RAM, 500GB SSD)
  - 1× Redis (2GB RAM)

Recording Workers:
  - 3-5× nodes (8 vCPU, 16GB RAM, 1TB storage)
  - 10Gbps network

Analytics Workers:
  - 2-3× GPU workers (NVIDIA T4 or better)
  - 3-5× CPU workers (4 vCPU, 8GB RAM)

Monitoring:
  - Prometheus + Grafana
  - ELK or Loki for logs
```

### Software Requirements

- Node.js ≥ 22
- Docker + docker-compose
- PostgreSQL 14+
- Redis 7+
- FFmpeg (for recording tests)
- RTSP stream simulator (ffmpeg-based)

---

## Phase 1: Control Plane Benchmark (Week 1-2)

**Goal:** Prove the platform can handle 5,000 camera heartbeats and 400 branches

### Step 1: Setup

```bash
cd load-testing
npm install

# Copy and configure
cp config.example.yaml config.yaml
# Edit config.yaml with your endpoints
```

### Step 2: Start Small

```bash
# Test with 100 cameras first
npm run test:control-plane -- --cameras 100 --branches 10 --duration 5m
```

### Step 3: Scale Progressively

```bash
# 500 cameras
npm run test:control-plane -- --cameras 500 --branches 50 --duration 15m

# 1,000 cameras
npm run test:control-plane -- --cameras 1000 --branches 100 --duration 30m

# 2,500 cameras
npm run test:control-plane -- --cameras 2500 --branches 250 --duration 1h

# Full test: 5,000 cameras
npm run test:control-plane -- --cameras 5000 --branches 400 --duration 1h
```

### Step 4: Check Results

```bash
# Reports are generated in ./reports/
# Open the HTML report in your browser
open reports/phase1-report-*.html
```

### Acceptance Criteria

- ✅ Dashboard load < 2 seconds
- ✅ API P95 < 500ms
- ✅ Heartbeat loss < 0.1%
- ✅ No cross-tenant data leakage
- ✅ DB CPU < 70%, Memory < 80%

**If Tests Fail:**
1. Check database connection pool settings
2. Optimize slow queries (add indexes)
3. Scale API nodes horizontally
4. Tune PostgreSQL configuration

---

## Phase 2: Event Load Benchmark (Week 3)

**Goal:** Prove the platform can handle 500 events/second with correlation and deduplication

### Step 1: Implement Event Generator

```bash
# TODO: Create src/phase2-events.ts
# Event generator with:
# - Motion, person, vehicle, zone events
# - Burst traffic patterns
# - Multi-camera correlation
```

### Step 2: Run Event Tests

```bash
# Sustained load
npm run test:events -- --rate 50 --duration 10m

# Moderate load
npm run test:events -- --rate 100 --duration 10m

# Burst test
npm run test:events -- --rate 500 --duration 5m --burst
```

### Acceptance Criteria

- ✅ Sustain 500 events/sec for 5 minutes
- ✅ Event processing P95 < 500ms
- ✅ Incident creation < 2 seconds
- ✅ Correlation accuracy ≥ 95%
- ✅ Duplicate rate < 1%
- ✅ Queue lag < 5 seconds

---

## Phase 3: Recording Benchmark (Week 4-6)

**Goal:** Prove the platform can handle 500-1,000 concurrent recording streams

⚠️ **CRITICAL:** Do NOT start with 5,000 streams. Test progressively.

### Step 1: Setup RTSP Test Streams

```bash
# Install ffmpeg if not already available
# Create synthetic test streams

# Start test stream server
docker run --rm -p 8554:8554 \
  aler9/rtsp-simple-server
```

### Step 2: Progressive Stream Testing

```bash
# Stage 1: 50 streams for 1 hour
npm run test:recording -- --streams 50 --duration 1h

# Stage 2: 100 streams for 2 hours
npm run test:recording -- --streams 100 --duration 2h

# Stage 3: 250 streams for 4 hours
npm run test:recording -- --streams 250 --duration 4h

# Stage 4: 500 streams for 8 hours
npm run test:recording -- --streams 500 --duration 8h

# Stage 5: 1,000 streams for 24 hours (endurance)
npm run test:recording -- --streams 1000 --duration 24h
```

### Acceptance Criteria

- ✅ Stream failure rate < 0.5%
- ✅ Recording gap rate < 0.1%
- ✅ CPU per stream < 0.5 vCPU
- ✅ Memory per stream < 50MB
- ✅ Reconnection success ≥ 99%
- ✅ No data loss on failure

### Architecture Decision

**5,000 cameras at 2 Mbps average = 10 Gbps bandwidth**

**Options:**
1. ❌ **Central recording** → Requires 10 Gbps bandwidth, single point of failure
2. ✅ **Branch-local recording** → Distributed load, autonomous operation
   - Record locally at each branch
   - Forward only evidence clips to central storage
   - Central platform handles metadata + incidents
   - Bandwidth requirement: ~1-2 Gbps for evidence

**Recommendation:** Use branch-local recording architecture

---

## Phase 4: Failure Testing (Week 7)

**Goal:** Prove the platform recovers from failures automatically

### Test Scenarios

```bash
# Component failures
npm run test:failure -- --scenario api-node-failure
npm run test:failure -- --scenario database-failover
npm run test:failure -- --scenario redis-restart

# Network failures
npm run test:failure -- --scenario branch-offline --branches 1
npm run test:failure -- --scenario mass-reconnect --branches 100

# Load spikes
npm run test:failure -- --scenario event-burst --multiplier 10
npm run test:failure -- --scenario camera-churn --cameras 1000
```

### Acceptance Criteria

- ✅ API failover < 60 seconds
- ✅ Database failover < 90 seconds
- ✅ No data loss during failover
- ✅ Branch reconnection ≥ 99%
- ✅ Auto-recovery from transient failures

---

## Phase 5: Production Deployment (Week 8+)

**Goal:** Prove capacity in real field deployment

### Requirements for 100% Verification

1. **Deploy to Production**
   - At least 200 branches
   - At least 2,500 cameras
   - Multiple geographic regions
   - Run for 30+ consecutive days

2. **Define SLAs**
   ```yaml
   Control Plane Availability: 99.9%
   API Response Time P95: < 500ms
   Heartbeat Processing Delay: < 30s
   Incident Alert Delivery: < 15s
   Recording Uptime: 99.5% per camera
   Dashboard Availability: 99.9%
   ```

3. **Prove SLA Compliance**
   - Monitor with Prometheus + Grafana
   - Generate weekly SLA reports
   - Document any incidents and resolution time

4. **Test Disaster Recovery**
   - Primary datacenter failover
   - Regional failover
   - Backup and restore procedures
   - RPO < 5 minutes, RTO < 15 minutes

---

## Analytics Capacity Planning

**Current Limitation:** 30 concurrent streams per analytics-engine instance

### Realistic Capacity

```javascript
For 5,000 cameras:

Scenario 1: 100% Analytics Coverage
  Required: 167 GPU workers
  Cost: $$$$$  (IMPRACTICAL)

Scenario 2: 30% Analytics Coverage
  Required: 50 GPU workers
  Cost: $$$$  (EXPENSIVE)

Scenario 3: 15-20% Coverage (RECOMMENDED)
  GPU workers: 10-15 (300-450 cameras)
  CPU workers: 10-15 (100-150 cameras)
  Total coverage: 400-600 cameras (8-12%)
  Cost: $$  (AFFORDABLE)
  
Approach:
  - Prioritize critical cameras (entrances, high-risk zones)
  - Use edge analytics for basic detection (motion, person)
  - Use central GPU analytics for complex detection (behavior, anomalies)
  - Implement dynamic workload scheduling
```

### Configuration Example

```yaml
# config.yaml
analytics:
  gpu_workers: 12
  cpu_workers: 15
  
  priority_cameras:
    critical: 200    # Entrances, exits, high-value areas
    high: 300        # Secondary monitoring zones
    medium: 100      # General coverage
    low: 0           # On-demand only
    
  coverage_target: 15%  # 750 of 5,000 cameras
```

---

## Common Bottlenecks & Solutions

### 1. Database Connection Pool Exhaustion

**Symptom:** API errors, timeouts, "too many connections"

**Solution:**
```sql
-- Increase max connections
ALTER SYSTEM SET max_connections = 500;

-- Optimize connection pooling
-- In backend config:
pool:
  min: 10
  max: 50
  idleTimeoutMillis: 30000
```

### 2. Slow Dashboard Queries

**Symptom:** Dashboard takes > 2 seconds to load

**Solution:**
```sql
-- Add indexes for common queries
CREATE INDEX idx_camera_status_branch_updated 
  ON camera_status (branch_id, updated_at DESC);

CREATE INDEX idx_incidents_branch_created 
  ON incidents (branch_id, created_at DESC);

-- Partition large tables
ALTER TABLE camera_status 
  PARTITION BY HASH (branch_id);
```

### 3. High Heartbeat Processing Delay

**Symptom:** Camera status updates delayed > 30 seconds

**Solution:**
- Increase API worker count
- Use Redis pub/sub for real-time updates
- Batch heartbeat processing (process 100 at a time)
- Use WebSocket for push updates instead of polling

### 4. Recording Stream Failures

**Symptom:** Streams fail to start or drop frequently

**Solution:**
- Check network bandwidth and latency
- Increase FFmpeg worker timeout
- Implement exponential backoff for reconnections
- Use lower bitrate for unstable connections
- Deploy regional recording nodes closer to cameras

### 5. Event Queue Backlog

**Symptom:** Queue lag > 5 seconds, events delayed

**Solution:**
- Scale event processor workers horizontally
- Use message broker (RabbitMQ/NATS) for distribution
- Implement batch processing for non-critical events
- Add queue monitoring and auto-scaling

---

## Progress Tracking

Use this checklist to track your verification progress:

### Phase 1: Control Plane (45% → 70%)
- [ ] Setup load testing environment
- [ ] Run 100-camera test successfully
- [ ] Run 500-camera test successfully
- [ ] Run 1,000-camera test successfully
- [ ] Run 2,500-camera test successfully
- [ ] Run 5,000-camera test successfully
- [ ] All acceptance criteria met
- [ ] Bottlenecks documented and optimized
- [ ] Report generated and reviewed

### Phase 2: Events (70% → 75%)
- [ ] Implement event generator
- [ ] Run sustained 50 events/sec test
- [ ] Run sustained 100 events/sec test
- [ ] Run burst 500 events/sec test
- [ ] Correlation accuracy ≥ 95%
- [ ] All acceptance criteria met
- [ ] Report generated and reviewed

### Phase 3: Recording (75% → 90%)
- [ ] Setup RTSP test stream server
- [ ] Run 50-stream test (1 hour)
- [ ] Run 100-stream test (2 hours)
- [ ] Run 250-stream test (4 hours)
- [ ] Run 500-stream test (8 hours)
- [ ] Run 1,000-stream test (24 hours)
- [ ] All acceptance criteria met
- [ ] Architecture decision documented
- [ ] Report generated and reviewed

### Phase 4: Failure Testing (90% → 95%)
- [ ] Implement chaos testing toolkit
- [ ] Test API node failure
- [ ] Test database failover
- [ ] Test mass reconnection
- [ ] Test network partition
- [ ] Test load spikes
- [ ] All acceptance criteria met
- [ ] DR procedures documented

### Phase 5: Production (95% → 100%)
- [ ] Deploy to 200+ branches
- [ ] Run for 30+ consecutive days
- [ ] SLA compliance proven
- [ ] Disaster recovery tested
- [ ] Monitoring dashboards operational
- [ ] Runbooks and documentation complete
- [ ] **100% VERIFICATION ACHIEVED** 🎉

---

## Key Reminders

### DO NOT Raise Percentage Based On:
- ❌ Adding more features
- ❌ Writing more code
- ❌ Creating documentation
- ❌ Implementing new detectors
- ❌ UI improvements

### ONLY Raise Percentage Based On:
- ✅ Passing measurable benchmarks
- ✅ Production deployment evidence
- ✅ Endurance testing (24+ hours)
- ✅ Disaster recovery validation
- ✅ Real-world capacity proof

---

## Support & Troubleshooting

### Before Running Tests

1. **Check infrastructure readiness**
   ```bash
   # Database available?
   psql -h localhost -U postgres -c "SELECT version();"
   
   # Redis available?
   redis-cli ping
   
   # API reachable?
   curl http://localhost:4000/health
   ```

2. **Validate configuration**
   ```bash
   # Load testing config
   cat load-testing/config.yaml
   
   # Ensure endpoints are correct
   # Ensure authentication is configured
   ```

3. **Start monitoring**
   ```bash
   # Prometheus + Grafana
   cd load-testing/monitoring
   docker-compose up -d
   
   # Open Grafana
   open http://localhost:3000
   ```

### During Tests

- Monitor dashboard: http://localhost:3000
- Watch API logs: `docker logs -f sentinel-api`
- Watch database: `pg_top -h localhost -U postgres`
- Watch Redis: `redis-cli --stat`

### After Tests

- Review generated reports in `load-testing/reports/`
- Check for errors in logs
- Analyze Prometheus metrics
- Document any issues found
- Plan optimizations for next run

---

## Expected Timeline

```
Week 1-2:  Phase 1 (Control Plane)
Week 3:    Phase 2 (Events)  
Week 4-6:  Phase 3 (Recording)
Week 7:    Phase 4 (Failure Testing)
Week 8:    Production deployment setup
Week 9-12: Production monitoring (30 days)

Total: 8-12 weeks to 100% verification
```

---

## Success Criteria Summary

The platform achieves **100% verified capacity** when:

1. ✅ Control plane handles 5,000 camera heartbeats with <0.1% loss
2. ✅ Dashboard responsive (<2s) with 100+ concurrent users
3. ✅ Event processing sustains 500/sec with <1% loss
4. ✅ Recording proves 500-1,000 concurrent streams
5. ✅ Failover recovers within SLAs
6. ✅ Mass reconnection succeeds ≥99%
7. ✅ No cross-tenant data leakage
8. ✅ Compliance policies enforced
9. ✅ Analytics achieves planned coverage
10. ✅ Production deployment proves architecture (30+ days, 200+ branches)

---

## Next Steps

1. **Right now:** Review `SCALE_VERIFICATION_ROADMAP.md` for full details
2. **Today:** Set up load testing environment
3. **This week:** Run Phase 1 with 100 cameras
4. **Next week:** Scale to 1,000 cameras
5. **Month 1:** Complete Phase 1-2 benchmarks
6. **Month 2:** Complete Phase 3-4 benchmarks
7. **Month 3:** Production deployment and validation

**Let's move from 45% to 100% verified capacity! 🚀**
