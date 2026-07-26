# Scale Verification Roadmap: 400 Branches / 5,000 Cameras

**Current Status:** 45% — Architecturally Possible, Capacity Unverified  
**Target:** 100% — Production-Proven at Scale  
**Last Updated:** 2026-07-26

---

## Executive Summary

The Sentinel platform has the **correct architectural building blocks** for large-scale deployment:
- ✅ Central multi-branch control plane
- ✅ Distributed edge-agent architecture  
- ✅ Independent media and recording services
- ✅ Comprehensive analytics engine (30 streams/instance default)
- ✅ Centralized monitoring and incident management

**However:** Capacity is **NOT proven** simply because the architecture exists.

This document tracks the roadmap from 45% to 100% verification through **measurable benchmarks**, not feature additions.

---

## Completion Percentage Scale

| % | Milestone | Proof Required | Status |
|---|-----------|----------------|--------|
| **45%** | Architecture & Core Services | Services deployed, APIs functional | ✅ **CURRENT** |
| **60%** | Small-Scale Validation | 1,000-camera synthetic test passing | 🔄 In Progress |
| **70%** | Medium-Scale Validation | 2,500-camera metadata + events test | ⏳ Pending |
| **80%** | Control Plane at Scale | 5,000-camera control-plane benchmark | ⏳ Pending |
| **90%** | Recording at Scale | 500–1,000 real/simulated streams with failover | ⏳ Pending |
| **100%** | Production Proven | 400-branch field deployment with SLA/DR proof | ⏳ Pending |

---

## Why Only 45%?

### What IS Implemented ✅

1. **Multi-Tenant Hierarchy**
   - Tenant → Region → Branch → Camera structure
   - Role-based access control
   - Cross-tenant isolation

2. **Edge Architecture**
   - Edge agents for branch autonomy
   - Local processing capability
   - Heartbeat and health reporting

3. **Core Services**
   - Control plane API (backend)
   - Media gateway (streaming)
   - Recording engine (HLS/segment storage)
   - Analytics engine (AI detection, 30 streams/instance)
   - Dashboard (monitoring UI)

4. **Database Schema**
   - Camera registration and health
   - Incident management
   - Recording metadata
   - Compliance and SLA tracking

5. **Deployment Infrastructure**
   - Docker containerization
   - docker-compose orchestration
   - Environment configuration

### What IS NOT Verified ❌

1. **Scale Benchmarks**
   - ❌ No 400-branch load test
   - ❌ No 5,000-camera heartbeat test
   - ❌ No high-volume event ingestion proof
   - ❌ No concurrent stream capacity test
   - ❌ No dashboard performance at scale

2. **Capacity Evidence**
   - ❌ Database performance under production load unknown
   - ❌ Network bandwidth requirements unproven
   - ❌ Storage throughput limits untested
   - ❌ Multi-node scaling not validated
   - ❌ Resource consumption per camera/branch unknown

3. **Resilience Testing**
   - ❌ No failover testing
   - ❌ No disaster recovery proof
   - ❌ No mass reconnection test (100+ branches)
   - ❌ No long-duration endurance test
   - ❌ No chaos engineering validation

4. **Analytics Capacity**
   - ⚠️ Default: 30 streams per analytics-engine instance
   - ❌ 5,000 cameras would require **167 GPU workers** at 100% coverage
   - ❌ No workload scheduling or auto-scaling implemented
   - ❌ Capacity planning documentation incomplete

---

## Critical Architectural Constraint

### Analytics Throughput Limitation

```javascript
Current Configuration:
  analytics-engine: 30 concurrent streams per instance

For 5,000 Cameras:
  100% coverage → 167 GPU workers required
  50% coverage  → 84 GPU workers required
  30% coverage  → 50 GPU workers required  
  10% coverage  → 17 GPU workers required
```

**Recommended Approach:**
- Deploy 10-20 GPU workers (300-600 cameras, ~12% coverage)
- Deploy 20-30 CPU workers (200-300 cameras, ~5% coverage)
- Use edge analytics for branch-specific detections
- Implement dynamic workload scheduling
- Prioritize critical cameras (entrances, high-risk zones)

**Total Realistic Coverage:** ~15-20% of cameras with real-time AI analytics

---

## Test Phase Roadmap

### Phase 1: Control Plane Scale Test (60% → 70%)

**Duration:** 1-2 weeks  
**Goal:** Validate 400 branches, 5,000 cameras, continuous metadata flow

#### Test Scenarios

1. **Baseline Metadata Load**
   - 400 branches across 8-10 regions
   - 5,000 cameras registered and reporting
   - 400 edge agents with heartbeats every 30s
   - Camera status updates every 60s
   - 5% cameras changing state periodically

2. **Dashboard Load**
   - 100 concurrent dashboard users
   - Real-time branch health monitoring
   - Camera status drill-downs
   - Alert stream consumption

3. **Tenant Isolation**
   - 10 tenants with 20-100 branches each
   - Cross-tenant query verification
   - Data leakage prevention tests

#### Acceptance Criteria

- ✅ Dashboard summary load < 2 seconds
- ✅ Branch drill-down < 3 seconds  
- ✅ Camera health updates visible < 30 seconds
- ✅ Heartbeat loss rate < 0.1%
- ✅ API P95 response time < 500ms
- ✅ No cross-tenant data visibility
- ✅ Database CPU < 70%, Memory < 80%
- ✅ Connection pool usage < 75%

#### Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| Test Framework | ✅ Complete | `/load-testing/src/phase1-control-plane.ts` |
| Synthetic Data Generator | ✅ Complete | Faker integration |
| Metrics Collection | ✅ Complete | Prometheus + custom collectors |
| Report Generation | 🔄 In Progress | HTML/JSON/CSV output |
| Utilities (metrics, reporting) | ⏳ TODO | Need implementation |

**Next Steps:**
1. Create utility classes (`metrics-collector.ts`, `report-generator.ts`)
2. Run initial 100-camera test for validation
3. Progressive scale: 500 → 1,000 → 2,500 → 5,000 cameras
4. Document bottlenecks and optimizations

---

### Phase 2: Event & Incident Load Test (70% → 75%)

**Duration:** 1 week  
**Goal:** Validate high-volume AI event ingestion and incident correlation

#### Test Scenarios

1. **Event Load Profiles**
   - Baseline: 50 events/second sustained
   - Moderate: 100 events/second sustained  
   - Burst: 500 events/second for 5 minutes

2. **Event Distribution**
   - 40% Motion detection
   - 20% Person detection
   - 15% Vehicle detection
   - 10% Zone intrusion
   - 10% Behavior anomalies
   - 5% Critical alerts (fire, fall, tailgating)

3. **Correlation Tests**
   - Multi-camera incident correlation
   - Duplicate event suppression
   - Related event grouping (30s window)
   - Evidence reservation

#### Acceptance Criteria

- ✅ Sustain 500 events/sec for 5+ minutes
- ✅ Event processing latency P95 < 500ms
- ✅ Incident creation latency < 2 seconds
- ✅ Correlation accuracy ≥ 95%
- ✅ Duplicate event rate < 1%
- ✅ Notification delivery ≥ 99%
- ✅ Evidence reservation success ≥ 99%
- ✅ Queue lag < 5 seconds
- ✅ No database deadlocks

#### Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| Event Generator | ⏳ TODO | Synthetic AI event creation |
| Correlation Testing | ⏳ TODO | Multi-camera incident validation |
| Load Profiles | ⏳ TODO | Sustained + burst patterns |
| Metrics | ⏳ TODO | Event throughput, latency tracking |

**Next Steps:**
1. Implement event generator with realistic distributions
2. Create incident correlation validator
3. Build burst traffic simulator
4. Test evidence reservation under load

---

### Phase 3: Recording Benchmark (75% → 90%)

**Duration:** 2-3 weeks  
**Goal:** Validate recording capacity with progressive stream testing

⚠️ **CRITICAL:** Do NOT start with 5,000 streams. Test progressively.

#### Progressive Test Plan

```
Stage 1:   50 streams  ×  1 hour  → Validate baseline
Stage 2:  100 streams  ×  2 hours → Detect early issues  
Stage 3:  250 streams  ×  4 hours → Medium-scale stability
Stage 4:  500 streams  ×  8 hours → Production-like load
Stage 5: 1000 streams  × 24 hours → Endurance test
```

#### Stream Profiles

```yaml
1080p @ 2Mbps, 25fps: 60% of streams
720p  @ 1Mbps, 15fps: 30% of streams
4K    @ 8Mbps, 30fps: 10% of streams
```

#### Network Bandwidth Calculation

```
5,000 cameras × 2 Mbps average = 10 Gbps incoming
```

**Architecture Decision Required:**
- ❌ Central recording server = 10 Gbps + single point of failure
- ✅ **Branch-local recording** = distributed load, autonomous operation
  - Only forward evidence clips to central storage
  - Central platform handles metadata + incidents
  - Bandwidth requirement: ~1-2 Gbps for evidence/analytics

#### Acceptance Criteria

- ✅ Sustain target stream count for full duration
- ✅ Stream failure rate < 0.5%
- ✅ Recording gap rate < 0.1%  
- ✅ Missing segments < 0.1%
- ✅ CPU per stream < 0.5 vCPU
- ✅ Memory per stream < 50 MB
- ✅ Stream startup time < 5 seconds
- ✅ Reconnection success ≥ 99%
- ✅ Recovery from stream loss < 30 seconds
- ✅ No data loss on clean shutdown

#### Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| RTSP Stream Simulator | ⏳ TODO | Synthetic video streams |
| Recording Load Test | ⏳ TODO | Progressive stream scaling |
| Storage Monitoring | ⏳ TODO | Throughput, IOPS tracking |
| Failover Testing | ⏳ TODO | Stream loss recovery |

**Next Steps:**
1. Set up RTSP test stream generator (ffmpeg-based)
2. Implement progressive load testing framework
3. Monitor resource consumption per stream
4. Test recording recovery scenarios
5. Validate storage retention policies

---

### Phase 4: Failure & Recovery Testing (90% → 95%)

**Duration:** 1-2 weeks  
**Goal:** Validate system resilience under adverse conditions

#### Failure Scenarios

1. **Component Failures**
   - Single API node failure
   - Database primary failover
   - Redis/message broker restart
   - Recording node crash
   - Analytics worker failure
   - Storage volume full

2. **Network Failures**
   - Single branch offline (5 minutes)
   - 100 branches reconnect simultaneously
   - Network partition (split-brain scenario)
   - Packet loss injection (5%, 10%, 20%)
   - Latency injection (100ms, 500ms, 1000ms)

3. **Load Spikes**
   - 10× event burst
   - 1,000 cameras offline/online simultaneously
   - 500 new camera registrations in 60 seconds
   - 100 concurrent large video exports

4. **Data Failures**
   - Corrupted database records
   - Missing recording segments
   - Invalid event payloads
   - Malformed RTSP streams

#### Acceptance Criteria

- ✅ API failover < 60 seconds
- ✅ Database failover < 90 seconds
- ✅ No data loss during planned failover
- ✅ Branch reconnection success ≥ 99%
- ✅ Recording recovery without data loss
- ✅ System functional with 1 node down
- ✅ Alert delivery continues during degradation
- ✅ Auto-recovery from transient failures
- ✅ Circuit breakers activate < 1 second
- ✅ Cascading failures prevented

#### Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| Chaos Engineering Tools | ⏳ TODO | Network/component failure injection |
| Failover Automation | ⏳ TODO | Automated recovery testing |
| Split-Brain Testing | ⏳ TODO | Network partition handling |
| Load Spike Generator | ⏳ TODO | Burst traffic simulation |

**Next Steps:**
1. Implement chaos engineering toolkit
2. Automate failover scenarios
3. Test mass reconnection handling
4. Validate circuit breaker behavior
5. Document disaster recovery procedures

---

### Phase 5: Production Deployment (95% → 100%)

**Duration:** Ongoing  
**Goal:** Prove scale in real field deployment with defined SLAs

#### Requirements for 100% Status

1. **Field Deployment**
   - At least 200 branches deployed
   - At least 2,500 cameras in production
   - Multiple geographic regions
   - Production traffic for 30+ days

2. **SLA Definition & Proof**
   ```yaml
   Control Plane Availability: 99.9% uptime
   API Response Time P95: < 500ms
   Heartbeat Processing: < 30s delay
   Incident Alert Delivery: < 15s latency
   Recording Uptime: 99.5% per camera
   Dashboard Availability: 99.9% uptime
   ```

3. **Disaster Recovery**
   - Primary datacenter failover tested
   - Regional failover validated
   - Backup and restore procedures proven
   - RPO < 5 minutes, RTO < 15 minutes

4. **Monitoring & Observability**
   - Prometheus + Grafana dashboards
   - Log aggregation (ELK/Loki)
   - Distributed tracing (Jaeger/Tempo)
   - Alert escalation workflows
   - On-call runbooks

5. **Documentation**
   - Architecture decision records
   - Scaling playbooks
   - Troubleshooting guides
   - Capacity planning models
   - Incident response procedures

#### Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| Production Infrastructure | 🔄 Partial | Docker compose not production-ready |
| Kubernetes Manifests | ⏳ TODO | For multi-node deployment |
| Monitoring Stack | ✅ Complete | Prometheus metrics exist |
| DR Procedures | ⏳ TODO | Need documentation + testing |
| Capacity Models | ⏳ TODO | Based on benchmark results |

---

## Infrastructure Requirements

### Testing Environment

```yaml
Control Plane Cluster:
  - 2× API nodes (4 vCPU, 16GB RAM each)
  - 1× PostgreSQL (8 vCPU, 32GB RAM, 500GB SSD)
  - 1× Redis (2GB RAM)
  - 1× Message broker (NATS/RabbitMQ)

Recording Workers:
  - 5× nodes (8 vCPU, 16GB RAM, 1TB storage each)
  - Network: 10Gbps capable

Analytics Workers:
  - 3× GPU workers (NVIDIA T4 or better, 16GB VRAM)
  - 5× CPU workers (4 vCPU, 8GB RAM each)

Monitoring:
  - Prometheus + Grafana
  - ELK or Loki
  - Metrics exporter nodes
```

### Production Architecture

```
┌─────────────────────────────────────────────────────┐
│           400 Branch Edge Agents (Distributed)      │
│  • Local camera management                          │
│  • Branch-local recording (optional)                │
│  • Edge analytics (motion, basic detection)         │
└─────────────────┬───────────────────────────────────┘
                  │
                  ↓
┌─────────────────────────────────────────────────────┐
│    Regional Recording Clusters (3-5 regions)        │
│  • Centralized recording for region                 │
│  • Local storage with cloud backup                  │
│  • Evidence clip generation                         │
└─────────────────┬───────────────────────────────────┘
                  │
                  ↓
┌─────────────────────────────────────────────────────┐
│      Central Control Plane (Active-Active)          │
│  • 3+ API replicas (load balanced)                  │
│  • PostgreSQL primary + 2 replicas                  │
│  • Redis cluster (3 nodes)                          │
│  • Message broker cluster                           │
│  • WebSocket/event service                          │
└─────────────────┬───────────────────────────────────┘
                  │
                  ↓
┌─────────────────────────────────────────────────────┐
│        Centralized Services                         │
│  • Metadata aggregation & incident management       │
│  • Compliance and SLA tracking                      │
│  • Analytics GPU worker pool (auto-scaling)         │
│  • Object storage (S3-compatible)                   │
│  • Dashboard and API gateway                        │
└─────────────────────────────────────────────────────┘
```

---

## Database Optimization for Scale

### Partitioning Strategy

```sql
-- Partition camera_status by branch_id for horizontal scaling
CREATE TABLE camera_status (
  id UUID PRIMARY KEY,
  branch_id UUID NOT NULL,
  camera_id UUID NOT NULL,
  status VARCHAR(20),
  heartbeat_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW()
) PARTITION BY HASH (branch_id);

-- Create 16 partitions for load distribution
CREATE TABLE camera_status_p0 PARTITION OF camera_status
  FOR VALUES WITH (MODULUS 16, REMAINDER 0);
-- ... repeat for p1 through p15

-- Partition incidents by created_at for time-series queries
CREATE TABLE incidents (
  id UUID PRIMARY KEY,
  branch_id UUID NOT NULL,
  camera_id UUID NOT NULL,
  type VARCHAR(50),
  severity VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- Monthly partitions
CREATE TABLE incidents_2026_07 PARTITION OF incidents
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
```

### Index Strategy

```sql
-- Camera status queries
CREATE INDEX idx_camera_status_branch_updated 
  ON camera_status (branch_id, updated_at DESC);

CREATE INDEX idx_camera_status_heartbeat 
  ON camera_status (heartbeat_at DESC) 
  WHERE status = 'online';

-- Incident queries
CREATE INDEX idx_incidents_branch_created 
  ON incidents (branch_id, created_at DESC);

CREATE INDEX idx_incidents_severity 
  ON incidents (severity, created_at DESC) 
  WHERE severity IN ('critical', 'high');

-- Recording metadata
CREATE INDEX idx_recordings_camera_time 
  ON recordings (camera_id, start_time DESC);
```

---

## Timeline & Resource Estimate

```
Phase 1 (Control Plane):      1-2 weeks
  ├── Implementation:           3 days ✅ DONE
  ├── Environment setup:        2 days
  ├── Test execution:           2 days
  └── Analysis & fixes:         5 days

Phase 2 (Events):             1 week
  ├── Implementation:           2 days
  ├── Test execution:           1 day
  └── Analysis & fixes:         4 days

Phase 3 (Recording):          2-3 weeks
  ├── Stream simulator:         3 days
  ├── Progressive testing:     10 days
  └── Analysis & optimization:  7 days

Phase 4 (Failure):            1-2 weeks
  ├── Chaos toolkit:            3 days
  ├── Scenario execution:       4 days
  └── Recovery validation:      5 days

Phase 5 (Production):         Ongoing (30+ days)
  ├── Infrastructure setup:     1 week
  ├── Initial deployment:       1 week
  ├── Monitoring & tuning:      2 weeks
  └── SLA validation:          30+ days

───────────────────────────────────────────
Total Development Time:       6-8 weeks
Total Validation Time:        8-12 weeks (including production soak)
```

---

## Success Metrics

The platform achieves **100% verified capacity** when:

1. ✅ **Control plane** handles 5,000 camera heartbeats with <0.1% loss
2. ✅ **Dashboard** remains responsive (<2s load) with 100+ concurrent users
3. ✅ **Event processing** sustains 500 events/sec with <1% loss
4. ✅ **Recording** proves 500-1,000 concurrent streams with <0.5% failure
5. ✅ **Failover** recovers automatically within documented SLAs
6. ✅ **Mass reconnection** succeeds at ≥99% rate (100+ branches)
7. ✅ **Security** shows no cross-tenant data leakage
8. ✅ **Compliance** enforces retention policies accurately
9. ✅ **Analytics** achieves planned coverage (10-20% cameras)
10. ✅ **Production** deployment proves architecture with ≥200 branches, 30+ days

---

## Current Recommendation

### Update Platform Capability Statement

**From:**
> ✅ Support approximately 400 branches / 5,000 cameras

**To:**
> ⚠️ **Support approximately 400 branches / 5,000 cameras**  
> **Status:** Architecturally Possible — 45% Verified  
> **Note:** Distributed architecture exists with all required components. Capacity has NOT been verified through 400-branch, 5,000-camera load testing, endurance benchmarks, or production-scale deployment.

### Do NOT Raise Percentage Based On:

- ❌ Adding more features
- ❌ Implementing additional analytics detectors
- ❌ Creating more API endpoints
- ❌ Writing documentation
- ❌ Code refactoring
- ❌ UI improvements

### ONLY Raise Percentage Based On:

- ✅ Passing measurable scale benchmarks
- ✅ Production deployment evidence
- ✅ Endurance testing (24+ hour stability)
- ✅ Disaster recovery validation
- ✅ Real-world capacity proof with metrics

---

## Questions & Clarifications

### Q: Can the platform handle 5,000 cameras today?

**A:** Unknown. The architecture is designed for it, but it has never been tested at that scale. Start with 100-500 cameras and scale progressively.

### Q: What's the main bottleneck?

**A:** Likely candidates:
1. **Database connection pool** (PostgreSQL max_connections)
2. **Network bandwidth** (if centralized recording)
3. **Analytics GPU workers** (30 streams/instance limit)
4. **WebSocket connections** (if too many concurrent dashboard users)
5. **Storage I/O** (IOPS limitations for concurrent recording)

### Q: What's the fastest path to 100%?

**A:** 
1. Complete Phase 1 benchmark (1 week)
2. Identify bottlenecks, optimize (1 week)
3. Complete Phase 2-3 benchmarks (3 weeks)
4. Deploy to pilot site with 50-100 branches (1 week)
5. Run for 30 days, collect SLA data
6. **Total: ~8-10 weeks**

### Q: Is 5,000 cameras realistic?

**A:** Yes, IF:
- ✅ Recording is distributed (branch-local)
- ✅ Analytics coverage is 10-20%, not 100%
- ✅ Database is properly indexed and partitioned
- ✅ Control plane is clustered (multi-node)
- ✅ Infrastructure is sized appropriately

---

## Appendix: Load Testing Commands

```bash
# Phase 1: Control Plane
cd load-testing
npm run test:control-plane -- \
  --branches 400 \
  --cameras 5000 \
  --duration 1h

# Phase 2: Events
npm run test:events -- \
  --rate 500 \
  --duration 30m \
  --burst

# Phase 3: Recording (progressive)
npm run test:recording -- \
  --streams 50 \
  --duration 1h

npm run test:recording -- \
  --streams 500 \
  --duration 8h

# Phase 4: Failure scenarios
npm run test:failure -- \
  --scenario mass-reconnect \
  --branches 100

# Generate reports
npm run report:generate -- \
  --phase 1 \
  --output reports/phase1-$(date +%Y%m%d).html
```

---

## Document History

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2026-07-26 | 1.0 | Initial roadmap created | Platform Team |

---

**Next Review:** After Phase 1 completion  
**Owner:** Platform Engineering Team  
**Stakeholders:** Product, Engineering, Operations
