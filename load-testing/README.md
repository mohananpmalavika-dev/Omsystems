# Sentinel Load Testing & Benchmarking Framework

> Phase 5 authoritative runner: `src/phase1-control-plane.ts`. It calls the current control-plane contracts and reports only observed measurements. Older phase names in this document are historical; missing scripts are not release evidence.

Run with `npm run test:phase5`. The runner requires enough existing inventory or `PHASE5_PROVISION=true` plus `PHASE5_PARENT_NODE_ID`. It intentionally returns exit code 2 when a test finishes without satisfying the complete 400-branch, 5,000-camera, 100-user, 24-hour certification gate. See `docs/PHASE_5_ENTERPRISE_READINESS.md` for the controlled procedure.

**Objective:** Verify platform capacity claims for **400 branches** and **5,000 cameras**

**Current Status:** 45% — Architecture exists, capacity unproven

---

## Overview

This framework provides progressive load testing to validate the Sentinel platform at scale:

- **Phase 1:** Control Plane (400 branches, 5,000 camera metadata)
- **Phase 2:** Event & Incident Load (100–500 events/second bursts)
- **Phase 3:** Recording Benchmark (50 → 1,000+ concurrent streams)
- **Phase 4:** Failure & Recovery Testing

Each phase includes synthetic test generators, monitoring dashboards, and acceptance criteria.

---

## Infrastructure Requirements

### Minimum Testing Environment

```yaml
Control Plane Cluster:
  - 2× API/Backend nodes (4 vCPU, 16GB RAM each)
  - 1× PostgreSQL primary (8 vCPU, 32GB RAM, 500GB SSD)
  - 1× Redis cluster (2GB RAM minimum)
  - 1× Message broker (RabbitMQ/NATS)

Recording Workers:
  - 5× Recording nodes (8 vCPU, 16GB RAM, 1TB storage each)
  - Network: 10Gbps minimum

Analytics Workers:
  - 3× GPU workers (NVIDIA T4 or better, 16GB VRAM)
  - CPU workers for non-GPU detections

Monitoring Stack:
  - Prometheus + Grafana
  - ELK or Loki for log aggregation
  - Custom metrics exporter
```

### Recommended Production Architecture

```
400 Branch Edge Agents (distributed)
        ↓
Branch-local or regional recording clusters
        ↓
Central Control Plane (active-active cluster)
        ↓
Centralized metadata, incidents & compliance platform
        ↓
Analytics GPU worker pool (auto-scaling)
        ↓
Object storage cluster (S3-compatible)
```

---

## Phase 1: Control Plane Scale Test

**Goal:** Verify 400 branches, 5,000 cameras, 400 edge agents with continuous heartbeats and status updates

### Test Scenarios

1. **Baseline Metadata Load**
   - 400 branches across multiple regions
   - 5,000 cameras registered
   - 400 edge agents reporting
   - Camera heartbeat every 30 seconds
   - Status update every 60 seconds
   - 5% cameras changing state periodically

2. **Dashboard Concurrent Users**
   - 100 concurrent dashboard users
   - Real-time branch health monitoring
   - Camera status drill-down
   - Alert stream consumption

3. **Tenant Isolation**
   - 10 tenants with varying sizes (50–150 branches each)
   - Cross-tenant query verification
   - Data leakage checks

### Metrics to Capture

```javascript
{
  "api_response_time": {
    "p50": "< 200ms",
    "p95": "< 500ms",
    "p99": "< 1000ms"
  },
  "database": {
    "cpu_usage": "< 70%",
    "memory_usage": "< 80%",
    "connection_pool_usage": "< 75%",
    "query_latency_p95": "< 100ms"
  },
  "websocket": {
    "concurrent_connections": ">= 100",
    "message_throughput": ">= 1000/sec",
    "reconnection_success_rate": ">= 99%"
  },
  "dashboard": {
    "initial_load_time": "< 2s",
    "branch_drill_down": "< 3s",
    "camera_health_update_delay": "< 30s"
  },
  "heartbeat_processing": {
    "queue_lag": "< 5s",
    "lost_heartbeats": "< 0.1%",
    "processing_rate": ">= 200/sec"
  }
}
```

### Acceptance Criteria

- ✅ All 5,000 cameras visible in dashboard
- ✅ Branch health scores calculate within 60 seconds
- ✅ No heartbeat loss > 0.1%
- ✅ Dashboard responsive under 100 concurrent users
- ✅ No cross-tenant data visibility
- ✅ Alert processing delay < 15 seconds

---

## Phase 2: Event & Incident Load Test

**Goal:** Validate high-volume AI event ingestion, correlation, deduplication, and incident creation

### Test Scenarios

1. **Sustained Event Load**
   - 50 events/second baseline
   - 100 events/second moderate
   - 500 events/second burst (5-minute duration)
   
2. **Event Types Distribution**
   - 40% Motion detection
   - 20% Person detection
   - 15% Vehicle detection
   - 10% Zone intrusion
   - 10% Behavior anomalies
   - 5% Critical alerts (fire, fall, tailgating)

3. **Correlation & Deduplication**
   - Related events from same camera
   - Multi-camera incident correlation
   - Duplicate event suppression

4. **Evidence Reservation**
   - Pre-event + post-event clip generation
   - Snapshot capture
   - Storage reservation for compliance

### Metrics to Capture

```javascript
{
  "event_ingestion": {
    "throughput": ">= 500 events/sec",
    "queue_lag": "< 5s",
    "processing_latency_p95": "< 500ms"
  },
  "incident_creation": {
    "creation_latency": "< 2s",
    "correlation_accuracy": ">= 95%",
    "duplicate_rate": "< 1%"
  },
  "notifications": {
    "delivery_success_rate": ">= 99%",
    "delivery_latency_p95": "< 5s",
    "retry_success_rate": ">= 98%"
  },
  "database_writes": {
    "insert_throughput": ">= 1000/sec",
    "write_latency_p95": "< 50ms",
    "connection_pool_saturation": "< 80%"
  },
  "evidence_reservation": {
    "success_rate": ">= 99%",
    "reservation_latency": "< 1s"
  }
}
```

### Acceptance Criteria

- ✅ Sustain 500 events/sec for 5 minutes without data loss
- ✅ Incident correlation accuracy ≥ 95%
- ✅ Duplicate events < 1%
- ✅ Notification delivery ≥ 99%
- ✅ Evidence reservation success ≥ 99%
- ✅ No database deadlocks or connection exhaustion

---

## Phase 3: Recording Benchmark

**Goal:** Validate recording capacity with progressive stream count testing

⚠️ **CRITICAL:** Do not start with 5,000 real streams. Test progressively.

### Progressive Test Plan

```
Stage 1:  50 concurrent streams   (1 hour stability)
Stage 2:  100 concurrent streams  (2 hour stability)
Stage 3:  250 concurrent streams  (4 hour stability)
Stage 4:  500 concurrent streams  (8 hour stability)
Stage 5:  1,000 concurrent streams (24 hour endurance)
```

### Stream Profiles

```javascript
const streamProfiles = [
  { resolution: "1080p", bitrate: "2Mbps", fps: 25, percentage: 60 },
  { resolution: "720p",  bitrate: "1Mbps", fps: 15, percentage: 30 },
  { resolution: "4K",    bitrate: "8Mbps", fps: 30, percentage: 10 }
];
```

### Metrics to Capture

```javascript
{
  "stream_health": {
    "active_streams": "target count",
    "failed_streams": "< 0.5%",
    "reconnection_success_rate": ">= 99%",
    "stream_startup_time": "< 5s"
  },
  "recording_quality": {
    "segment_write_success": ">= 99.9%",
    "missing_segments": "< 0.1%",
    "recording_gaps": "< 1 per 1000 hours",
    "segment_write_latency_p95": "< 2s"
  },
  "system_resources": {
    "cpu_per_stream": "< 0.5 vCPU",
    "memory_per_stream": "< 50MB",
    "network_throughput": "measured",
    "disk_write_iops": "measured",
    "disk_write_throughput": "measured"
  },
  "storage": {
    "growth_rate_per_day": "measured",
    "compression_ratio": "measured",
    "retention_enforcement": "verified"
  },
  "failure_recovery": {
    "stream_loss_recovery_time": "< 30s",
    "recording_resume_accuracy": "100%",
    "data_loss_on_failure": "0 segments"
  }
}
```

### Network Bandwidth Calculation

```
5,000 cameras × 2 Mbps average = 10 Gbps
```

**Recommended:** Use branch-local recording to avoid central bandwidth bottleneck.

### Acceptance Criteria

- ✅ Sustain target stream count for full test duration
- ✅ Stream failure rate < 0.5%
- ✅ Recording gap rate < 0.1%
- ✅ CPU per stream < 0.5 vCPU average
- ✅ Memory per stream < 50MB average
- ✅ No storage saturation during test
- ✅ Recovery from stream loss < 30 seconds
- ✅ No recording data loss on clean shutdown

---

## Phase 4: Failure & Recovery Testing

**Goal:** Validate system resilience under adverse conditions

### Failure Scenarios

1. **Component Failures**
   ```
   - Single API node failure
   - Database primary failover
   - Redis/message broker restart
   - Recording node failure
   - Analytics worker crash
   - Storage volume full simulation
   ```

2. **Network Failures**
   ```
   - Single branch offline (5 minutes)
   - 100 branches reconnect simultaneously
   - Network partition (split brain)
   - Packet loss (5%, 10%, 20%)
   - Latency injection (100ms, 500ms, 1000ms)
   ```

3. **Load Spikes**
   ```
   - 10× event burst
   - 1,000 cameras go offline/online simultaneously
   - 500 new camera registrations in 1 minute
   - 100 concurrent large video exports
   ```

4. **Data Failures**
   ```
   - Corrupted database record
   - Missing recording segments
   - Invalid event payload
   - Malformed RTSP stream
   ```

### Metrics to Capture

```javascript
{
  "failover": {
    "detection_time": "< 10s",
    "failover_completion": "< 60s",
    "data_loss": "0 records",
    "service_downtime": "< 2 minutes"
  },
  "recovery": {
    "service_restart_time": "< 30s",
    "connection_re-establishment": "< 60s",
    "backlog_processing": "< 5 minutes",
    "data_consistency": "verified"
  },
  "resilience": {
    "cascading_failure_prevention": "verified",
    "circuit_breaker_activation": "< 1s",
    "degraded_mode_functionality": "verified",
    "automatic_recovery": "verified"
  }
}
```

### Acceptance Criteria

- ✅ API failover within 60 seconds
- ✅ Database failover within 90 seconds
- ✅ No data loss during planned failover
- ✅ Branch reconnection success rate ≥ 99%
- ✅ Recording recovery without data loss
- ✅ System remains functional with 1 node down
- ✅ Alert delivery continues during degradation
- ✅ Auto-recovery from transient failures

---

## Completion Percentage Mapping

| % Complete | Proof Required |
|-----------|----------------|
| **45%** | Architecture and core services exist *(current state)* |
| **60%** | 1,000-camera synthetic test passing |
| **70%** | 2,500-camera metadata, heartbeat and event test |
| **80%** | 5,000-camera control-plane benchmark |
| **90%** | 500–1,000 real/simulated recording streams with failover |
| **100%** | 400-branch field deployment with defined SLA and DR proof |

---

## Test Execution Workflow

### 1. Environment Setup

```bash
# Clone load testing tools
cd load-testing
npm install

# Configure test parameters
cp config.example.yaml config.yaml
# Edit config.yaml with target endpoints and credentials

# Deploy monitoring stack
cd monitoring
docker-compose up -d
```

### 2. Run Phase 1

```bash
# Start control plane load test
npm run test:control-plane -- --branches 400 --cameras 5000 --duration 1h

# Monitor in real-time
open http://localhost:3000/dashboards/control-plane
```

### 3. Analyze Results

```bash
# Generate test report
npm run report:generate -- --phase 1 --output reports/phase1-results.html

# Compare against acceptance criteria
npm run report:validate -- --phase 1
```

### 4. Iterate and Scale

```bash
# If Phase 1 passes, proceed to Phase 2
npm run test:events -- --rate 100 --duration 30m

# Continue through all phases
npm run test:all -- --full-suite
```

---

## Analytics Capacity Planning

**Current Default:** 30 concurrent streams per analytics-engine instance

### Scaling Analytics Workers

```javascript
const analyticsCapacity = {
  perWorkerCapacity: 30,  // concurrent streams
  targetCameras: 5000,
  coveragePercentage: 0.3,  // 30% cameras with analytics
  
  requiredWorkers: Math.ceil(
    (5000 * 0.3) / 30
  ) // = 50 workers for 30% coverage
};
```

**Recommended Configuration:**

```yaml
Analytics GPU Workers:
  count: 20
  streams_per_worker: 30
  coverage: 600 cameras (12%)

Analytics CPU Workers:
  count: 30
  streams_per_worker: 10
  coverage: 300 cameras (6%)

Total Coverage: 900 cameras (18%)
```

For higher analytics coverage:

- Deploy additional GPU workers (expensive but performant)
- Use CPU-based detection for non-critical cameras
- Implement dynamic workload scheduling
- Use edge analytics for branch-specific detections

---

## Key Architectural Notes

### Recording Architecture

**DO NOT** use a single central recording server for 5,000 cameras.

```
✅ RECOMMENDED:
├── 400 Branch Edge Agents
│   └── Local recording (per branch)
│       └── Branch-local storage
│           └── Evidence forwarding only
│
└── Central Control Plane
    └── Metadata aggregation
    └── Incident management
    └── Compliance enforcement
    └── Evidence storage
```

```
❌ NOT RECOMMENDED:
└── Single Central Recording Server
    └── 10 Gbps bandwidth required
    └── Single point of failure
    └── No branch autonomy
```

### Database Optimization

For 5,000 cameras and 400 branches:

```sql
-- Partition camera_status by branch_id
CREATE TABLE camera_status (
  id UUID PRIMARY KEY,
  branch_id UUID NOT NULL,
  camera_id UUID NOT NULL,
  status VARCHAR(20),
  updated_at TIMESTAMP
) PARTITION BY HASH (branch_id);

-- Create 16 partitions for load distribution
CREATE TABLE camera_status_p0 PARTITION OF camera_status
  FOR VALUES WITH (MODULUS 16, REMAINDER 0);
-- ... repeat for p1 through p15

-- Index strategy
CREATE INDEX idx_camera_status_updated ON camera_status (updated_at DESC);
CREATE INDEX idx_camera_status_branch ON camera_status (branch_id, updated_at DESC);
```

---

## Reporting Templates

### Phase Completion Report

```markdown
# Phase [N] Load Test Results

**Test Date:** YYYY-MM-DD
**Duration:** [X] hours
**Environment:** [Production-like / Staging / Test]

## Configuration
- Branches: [count]
- Cameras: [count]
- Concurrent Users: [count]
- Target Load: [description]

## Results Summary
- ✅ / ❌ Overall: [PASS/FAIL]
- Acceptance Criteria Met: [X/Y]

## Detailed Metrics
[Table of all captured metrics vs. targets]

## Issues Identified
1. [Issue description]
   - Severity: [Critical/Major/Minor]
   - Impact: [description]
   - Recommendation: [action items]

## Next Steps
- [ ] Fix identified issues
- [ ] Re-run failed scenarios
- [ ] Proceed to Phase [N+1]
```

---

## Timeline Estimate

```
Phase 1 (Control Plane):     1-2 weeks
  ├── Test development:        3 days
  ├── Environment setup:       2 days
  ├── Test execution:          2 days
  └── Analysis & fixes:        5 days

Phase 2 (Events):            1 week
  ├── Test development:        2 days
  ├── Test execution:          1 day
  └── Analysis & fixes:        4 days

Phase 3 (Recording):         2-3 weeks
  ├── Test development:        3 days
  ├── Progressive testing:     10 days
  └── Analysis & fixes:        7 days

Phase 4 (Failure):          1-2 weeks
  ├── Scenario development:    3 days
  ├── Chaos testing:           4 days
  └── Recovery validation:     5 days

Total Estimated Time:        6-8 weeks
```

---

## Success Criteria

The platform can claim **100% verified support for 400 branches / 5,000 cameras** when:

1. ✅ Control plane handles 5,000 camera heartbeats continuously
2. ✅ Dashboard remains responsive with 100+ concurrent users
3. ✅ Event processing sustains 500 events/sec with <1% loss
4. ✅ Recording subsystem proven for 500-1,000 concurrent streams
5. ✅ Failure scenarios recover automatically within SLA
6. ✅ Branch reconnection succeeds at 99%+ rate
7. ✅ No cross-tenant data leakage observed
8. ✅ Storage and retention policies enforced accurately
9. ✅ Analytics coverage achieves target percentage
10. ✅ Production deployment proves architecture at scale

---

## Contact & Support

For questions about load testing:
- Review this guide thoroughly first
- Check existing test results in `/reports`
- Consult architecture docs in `/docs`
- Reach out to platform team with specific blockers
