# KryptoVision Connect — Telemetry and Observability

## Overview

Comprehensive Prometheus metrics for the KryptoVision Connect communication subsystem.

All metrics follow the naming convention:

```text
kryptovision_comm_<domain>_<metric>_<unit>
```

## Metric Categories

### 1. Device Metrics

Track device lifecycle and health.

#### kryptovision_comm_device_enrollments_total

Counter tracking device enrollment events.

**Labels:**
- `tenant_id`: Tenant UUID
- `device_type`: BRANCH_SHARED | BRANCH_MOBILE | EMPLOYEE_MOBILE | EMPLOYEE_DESKTOP | EMERGENCY_DEVICE

**Use cases:**
- Monitor enrollment rate
- Track adoption per tenant
- Alert on unusual enrollment spikes

---

#### kryptovision_comm_device_revocations_total

Counter tracking device revocation events.

**Labels:**
- `tenant_id`: Tenant UUID
- `device_type`: Device type

**Use cases:**
- Security monitoring
- Track lost/compromised device rate
- Audit device lifecycle

---

#### kryptovision_comm_device_heartbeats_total

Counter tracking heartbeat messages received.

**Labels:**
- `tenant_id`: Tenant UUID
- `device_type`: Device type

**Use cases:**
- Validate device connectivity
- Correlate with call quality
- Detect degraded network conditions

---

#### kryptovision_comm_devices_online

Gauge showing current number of online devices.

**Labels:**
- `tenant_id`: Tenant UUID

**Use cases:**
- Branch connectivity dashboard
- Capacity planning
- Incident detection (sudden drops)

**Example queries:**

```promql
# Online devices per tenant
kryptovision_comm_devices_online{tenant_id="..."}

# Total online devices
sum(kryptovision_comm_devices_online)

# Alert: Branch offline (no devices)
kryptovision_comm_devices_online{tenant_id="..."} == 0
```

---

### 2. Presence Metrics

Track branch and employee availability.

#### kryptovision_comm_branch_presence

Gauge showing branch online status.

**Value:**
- `1`: Online (at least one device reachable)
- `0`: Offline

**Labels:**
- `tenant_id`: Tenant UUID
- `branch_id`: Branch UUID

**Use cases:**
- Branch status dashboard
- Routing decisions
- Alert on prolonged offline

---

#### kryptovision_comm_employee_presence

Gauge showing employee online status.

**Value:**
- `1`: Online
- `0`: Offline

**Labels:**
- `tenant_id`: Tenant UUID
- `employee_id`: Employee UUID

**Use cases:**
- Employee availability
- Routing decisions
- Activity monitoring

---

### 3. Call Metrics

Track call lifecycle and quality.

#### kryptovision_comm_calls_started_total

Counter tracking call initiation.

**Labels:**
- `tenant_id`: Tenant UUID
- `direction`: INBOUND | OUTBOUND

**Use cases:**
- Call volume monitoring
- Peak load analysis
- Capacity planning

**Example queries:**

```promql
# Call rate per second
rate(kryptovision_comm_calls_started_total[5m])

# Inbound vs outbound ratio
sum by (direction) (rate(kryptovision_comm_calls_started_total[1h]))
```

---

#### kryptovision_comm_calls_connected_total

Counter tracking successfully connected calls.

**Labels:**
- `tenant_id`: Tenant UUID

**Use cases:**
- Success rate calculation
- SLA monitoring

**Example queries:**

```promql
# Call success rate
rate(kryptovision_comm_calls_connected_total[5m]) / 
rate(kryptovision_comm_calls_started_total[5m])

# Alert: Low success rate
(rate(kryptovision_comm_calls_connected_total[5m]) / 
 rate(kryptovision_comm_calls_started_total[5m])) < 0.95
```

---

#### kryptovision_comm_calls_failed_total

Counter tracking failed calls.

**Labels:**
- `tenant_id`: Tenant UUID
- `status`: Call status at failure (RINGING, CONNECTING, etc.)
- `reason`: Failure reason (NETWORK_ERROR, TIMEOUT, etc.)

**Use cases:**
- Failure analysis
- Root cause identification
- Quality degradation detection

**Example queries:**

```promql
# Failure rate by reason
sum by (reason) (rate(kryptovision_comm_calls_failed_total[5m]))

# Alert: High failure rate
rate(kryptovision_comm_calls_failed_total[5m]) > 0.1
```

---

#### kryptovision_comm_calls_missed_total

Counter tracking missed calls.

**Labels:**
- `tenant_id`: Tenant UUID

**Use cases:**
- Response time monitoring
- Staffing analysis
- Branch responsiveness

**Example queries:**

```promql
# Missed call rate
rate(kryptovision_comm_calls_missed_total[5m])

# Missed percentage
rate(kryptovision_comm_calls_missed_total[5m]) / 
rate(kryptovision_comm_calls_started_total[5m]) * 100
```

---

#### kryptovision_comm_call_setup_duration_seconds

Histogram tracking time from initiation to connection.

**Labels:**
- `tenant_id`: Tenant UUID

**Buckets:** 0.5s, 1s, 2s, 3s, 5s, 10s, 15s, 30s

**Use cases:**
- User experience monitoring
- Network performance
- WebRTC signaling latency

**Example queries:**

```promql
# Average setup time
rate(kryptovision_comm_call_setup_duration_seconds_sum[5m]) / 
rate(kryptovision_comm_call_setup_duration_seconds_count[5m])

# 95th percentile setup time
histogram_quantile(0.95, 
  rate(kryptovision_comm_call_setup_duration_seconds_bucket[5m]))

# Alert: Slow setup
histogram_quantile(0.95, 
  rate(kryptovision_comm_call_setup_duration_seconds_bucket[5m])) > 5
```

---

#### kryptovision_comm_call_duration_seconds

Histogram tracking connected call duration.

**Labels:**
- `tenant_id`: Tenant UUID
- `quality`: GOOD | DEGRADED | POOR

**Buckets:** 10s, 30s, 1m, 2m, 5m, 10m, 30m, 1h

**Use cases:**
- Call pattern analysis
- Quality correlation
- Capacity planning

**Example queries:**

```promql
# Average call duration by quality
avg by (quality) (
  rate(kryptovision_comm_call_duration_seconds_sum[1h]) / 
  rate(kryptovision_comm_call_duration_seconds_count[1h])
)

# Calls shorter than 30 seconds (potential issues)
rate(kryptovision_comm_call_duration_seconds_bucket{le="30"}[5m])
```

---

### 4. Call Quality Metrics

WebRTC quality measurements.

#### kryptovision_comm_call_rtt_milliseconds

Histogram tracking round-trip time.

**Labels:**
- `tenant_id`: Tenant UUID

**Buckets:** 10ms, 25ms, 50ms, 100ms, 150ms, 200ms, 300ms, 500ms

**ITU-T G.114 Thresholds:**
- < 150ms: Acceptable
- 150-400ms: Degraded
- > 400ms: Poor

**Example queries:**

```promql
# Average RTT
rate(kryptovision_comm_call_rtt_milliseconds_sum[5m]) / 
rate(kryptovision_comm_call_rtt_milliseconds_count[5m])

# Percentage above 150ms
sum(rate(kryptovision_comm_call_rtt_milliseconds_bucket{le="150"}[5m])) / 
sum(rate(kryptovision_comm_call_rtt_milliseconds_count[5m]))
```

---

#### kryptovision_comm_call_jitter_milliseconds

Histogram tracking jitter (packet delay variation).

**Labels:**
- `tenant_id`: Tenant UUID

**Buckets:** 5ms, 10ms, 20ms, 30ms, 50ms, 75ms, 100ms, 150ms

**Thresholds:**
- < 30ms: Good
- 30-50ms: Acceptable
- > 50ms: Poor

---

#### kryptovision_comm_call_packet_loss_percent

Histogram tracking packet loss percentage.

**Labels:**
- `tenant_id`: Tenant UUID

**Buckets:** 0.1%, 0.5%, 1%, 2%, 3%, 5%, 10%, 15%

**Thresholds:**
- < 1%: Good
- 1-3%: Degraded
- > 3%: Poor

**Example queries:**

```promql
# Alert: High packet loss
histogram_quantile(0.95, 
  rate(kryptovision_comm_call_packet_loss_percent_bucket[5m])) > 3
```

---

### 5. Messaging Metrics

Track message delivery and latency.

#### kryptovision_comm_messages_sent_total

Counter tracking sent messages.

**Labels:**
- `tenant_id`: Tenant UUID
- `conversation_type`: BRANCH_SOC | EMPLOYEE_SOC | INCIDENT

**Use cases:**
- Message volume monitoring
- Communication pattern analysis

---

#### kryptovision_comm_messages_delivered_total

Counter tracking delivered messages.

**Labels:**
- `tenant_id`: Tenant UUID

**Use cases:**
- Delivery success rate
- Offline device detection

**Example queries:**

```promql
# Delivery rate
rate(kryptovision_comm_messages_delivered_total[5m]) / 
rate(kryptovision_comm_messages_sent_total[5m])
```

---

#### kryptovision_comm_messages_read_total

Counter tracking read messages.

**Labels:**
- `tenant_id`: Tenant UUID

**Use cases:**
- Engagement monitoring
- Response time analysis

---

#### kryptovision_comm_message_delivery_latency_seconds

Histogram tracking time from sent to delivered.

**Labels:**
- `tenant_id`: Tenant UUID

**Buckets:** 0.1s, 0.5s, 1s, 2s, 5s, 10s, 30s, 60s

**Use cases:**
- Real-time delivery monitoring
- Network performance
- Offline delivery detection

---

#### kryptovision_comm_message_read_latency_seconds

Histogram tracking time from sent to read.

**Labels:**
- `tenant_id`: Tenant UUID

**Buckets:** 1s, 5s, 10s, 30s, 1m, 5m, 10m, 30m

**Use cases:**
- Response time monitoring
- User engagement

---

### 6. WebSocket Metrics

Track signaling infrastructure.

#### kryptovision_comm_websocket_connections

Gauge showing current WebSocket connection count.

**Labels:**
- `tenant_id`: Tenant UUID

**Use cases:**
- Load monitoring
- Connection stability
- Capacity planning

---

#### kryptovision_comm_signaling_events_total

Counter tracking signaling events.

**Labels:**
- `tenant_id`: Tenant UUID
- `event`: Event type (CALL_INVITE, CALL_ACCEPT, MESSAGE_CREATED, etc.)

**Use cases:**
- Event rate monitoring
- Protocol debugging
- Load characterization

---

### 7. WebRTC Media Metrics

Track media session state.

#### kryptovision_comm_media_sessions_active

Gauge showing current active media sessions.

**Labels:**
- `tenant_id`: Tenant UUID

**Use cases:**
- Concurrent call monitoring
- Resource utilization
- Capacity planning

---

#### kryptovision_comm_media_sessions_total

Counter tracking media sessions created.

**Labels:**
- `tenant_id`: Tenant UUID

**Use cases:**
- Media session rate
- TURN server load estimation

---

#### kryptovision_comm_media_participants_active

Gauge showing current active participants.

**Labels:**
- `tenant_id`: Tenant UUID

**Use cases:**
- Participant count monitoring
- Multi-party call detection

---

## Grafana Dashboard Queries

### High-Level KPIs

```promql
# Total devices online
sum(kryptovision_comm_devices_online)

# Call success rate (last hour)
sum(rate(kryptovision_comm_calls_connected_total[1h])) / 
sum(rate(kryptovision_comm_calls_started_total[1h])) * 100

# Average call setup time
avg(rate(kryptovision_comm_call_setup_duration_seconds_sum[5m]) / 
    rate(kryptovision_comm_call_setup_duration_seconds_count[5m]))

# Active calls
sum(kryptovision_comm_media_sessions_active)
```

### Quality Monitoring

```promql
# Calls by quality (last hour)
sum by (quality) (rate(kryptovision_comm_call_duration_seconds_count[1h]))

# Poor quality percentage
sum(rate(kryptovision_comm_call_duration_seconds_count{quality="POOR"}[1h])) / 
sum(rate(kryptovision_comm_call_duration_seconds_count[1h])) * 100

# Average RTT
avg(rate(kryptovision_comm_call_rtt_milliseconds_sum[5m]) / 
    rate(kryptovision_comm_call_rtt_milliseconds_count[5m]))
```

### Branch Connectivity

```promql
# Branches online by tenant
count by (tenant_id) (kryptovision_comm_branch_presence == 1)

# Offline branches
kryptovision_comm_branch_presence{branch_id=~".*"} == 0
```

### Failure Analysis

```promql
# Top failure reasons
topk(5, sum by (reason) (rate(kryptovision_comm_calls_failed_total[1h])))

# Failed calls per tenant
sum by (tenant_id) (rate(kryptovision_comm_calls_failed_total[5m]))
```

---

## Alerting Rules

### Critical Alerts

```yaml
# Branch offline for extended period
- alert: BranchOfflineExtended
  expr: kryptovision_comm_branch_presence == 0
  for: 15m
  labels:
    severity: critical
  annotations:
    summary: "Branch {{ $labels.branch_id }} offline for 15+ minutes"

# High call failure rate
- alert: HighCallFailureRate
  expr: |
    rate(kryptovision_comm_calls_failed_total[5m]) / 
    rate(kryptovision_comm_calls_started_total[5m]) > 0.2
  for: 10m
  labels:
    severity: critical
  annotations:
    summary: "Call failure rate above 20% for tenant {{ $labels.tenant_id }}"

# No devices online for tenant
- alert: NoDevicesOnline
  expr: kryptovision_comm_devices_online == 0
  for: 10m
  labels:
    severity: critical
  annotations:
    summary: "Tenant {{ $labels.tenant_id }} has no online devices"
```

### Warning Alerts

```yaml
# Degraded call quality
- alert: DegradedCallQuality
  expr: |
    histogram_quantile(0.95, 
      rate(kryptovision_comm_call_rtt_milliseconds_bucket[5m])) > 200
  for: 15m
  labels:
    severity: warning
  annotations:
    summary: "95th percentile RTT above 200ms for tenant {{ $labels.tenant_id }}"

# High missed call rate
- alert: HighMissedCallRate
  expr: |
    rate(kryptovision_comm_calls_missed_total[10m]) / 
    rate(kryptovision_comm_calls_started_total[10m]) > 0.15
  for: 15m
  labels:
    severity: warning
  annotations:
    summary: "Missed call rate above 15% for tenant {{ $labels.tenant_id }}"

# Slow call setup
- alert: SlowCallSetup
  expr: |
    histogram_quantile(0.95, 
      rate(kryptovision_comm_call_setup_duration_seconds_bucket[5m])) > 5
  for: 10m
  labels:
    severity: warning
  annotations:
    summary: "95th percentile call setup time above 5s"
```

---

## Logging Strategy

### Structured Logging

All communication services use structured JSON logging via Pino.

**Standard fields:**
- `timestamp`: ISO 8601
- `level`: debug | info | warn | error
- `service`: communication-subsystem
- `tenantId`: Tenant UUID
- `branchId`: Branch UUID (when applicable)
- `deviceId`: Device UUID (when applicable)
- `callId`: Call UUID (when applicable)

**Privacy rules:**
- NEVER log message body
- NEVER log audio/media data
- NEVER log private keys or credentials
- NEVER log enrollment secrets
- NEVER log plaintext passwords or PINs

### Log Levels

**DEBUG:**
- WebRTC signaling messages
- Redis state transitions
- Presence updates

**INFO:**
- Device enrollment
- Call started/ended
- Message sent/delivered
- Device heartbeat (sampled)

**WARN:**
- Call setup timeout
- WebSocket reconnection
- Redis failover
- Degraded call quality

**ERROR:**
- Authentication failure
- Database query failure
- WebRTC session creation failure
- Cross-tenant access attempt

---

## Integration

### Exposing Metrics

Communication telemetry is integrated with the existing observability system.

Register in `src/app.ts`:

```typescript
import { createCommunicationTelemetryService } from './communications/services/communication-telemetry.service.js';

const commTelemetry = createCommunicationTelemetryService(
  registry,
  promClient
);

// Pass to communication services
```

Metrics endpoint:

```http
GET /metrics
```

Returns Prometheus exposition format including all `kryptovision_comm_*` metrics.

---

## Cardinality Management

**Safe high-cardinality labels:**
- `tenant_id`: Limited by customer count (~10-1000)
- `device_type`: Fixed enum (5 values)
- `direction`: Fixed enum (2 values)
- `quality`: Fixed enum (3 values)
- `status`: Fixed enum (~10 values)
- `event`: Fixed enum (~15 events)

**UUID labels used sparingly:**
- `branch_id`: Used only in presence gauges (removed on delete)
- `employee_id`: Used only in presence gauges (removed on delete)
- `device_id`, `call_id`: NOT used in metrics (logged only)

**Estimated cardinality:**
- Device metrics: ~50 series per tenant
- Call metrics: ~30 series per tenant
- Messaging metrics: ~15 series per tenant
- WebSocket metrics: ~20 series per tenant
- **Total: ~115 series per tenant**

For 100 tenants: ~11,500 time series (well within Prometheus limits).

---

## Production Deployment

### Prometheus Configuration

```yaml
scrape_configs:
  - job_name: 'kryptovision-api'
    scrape_interval: 15s
    static_configs:
      - targets:
          - 'api-node-1:3000'
          - 'api-node-2:3000'
    metrics_path: '/metrics'
```

### Retention Policy

Recommended:
- Raw metrics: 30 days
- Aggregated (5m): 180 days
- Aggregated (1h): 2 years

---

## Privacy Compliance

All telemetry follows KryptoVision privacy principles:

✓ No PII in metric labels
✓ No message content logged
✓ No biometric data logged
✓ No authentication credentials logged
✓ Tenant isolation enforced
✓ Audit events privacy-safe
✓ Aggregated metrics only

**GDPR compliance:**
- Metrics contain no personal data
- UUIDs are pseudonymous identifiers
- Retention aligns with operational requirements
- Data subject access does not apply to aggregated metrics

---

## Monitoring Checklist

### Daily
- [ ] Device online count stable
- [ ] Call success rate > 95%
- [ ] No sustained branch offline alerts
- [ ] Average call quality GOOD

### Weekly
- [ ] Review missed call trends
- [ ] Analyze failure reason distribution
- [ ] Check message delivery latency
- [ ] Validate device heartbeat rate

### Monthly
- [ ] Capacity planning review
- [ ] Quality trend analysis
- [ ] Tenant growth tracking
- [ ] Alert tuning

---

## Support and Troubleshooting

### Common Queries

**"Why are calls failing?"**

```promql
topk(5, sum by (reason, status) (
  rate(kryptovision_comm_calls_failed_total[1h])
))
```

**"Which branches are offline?"**

```promql
kryptovision_comm_branch_presence{branch_id=~".*"} == 0
```

**"What's the call quality distribution?"**

```promql
sum by (quality) (
  rate(kryptovision_comm_call_duration_seconds_count[1h])
)
```

**"How many devices enrolled today?"**

```promql
increase(kryptovision_comm_device_enrollments_total[24h])
```

---

## Roadmap

Future enhancements:

1. **Distributed tracing** (OpenTelemetry)
   - End-to-end call setup tracing
   - Cross-service message flow
   - WebRTC session lifecycle

2. **Advanced quality metrics**
   - MOS (Mean Opinion Score) estimation
   - Per-participant quality breakout
   - Network path analysis

3. **ML-based anomaly detection**
   - Unusual call patterns
   - Quality degradation prediction
   - Device health scoring

4. **Real-time dashboards**
   - Live call monitoring
   - Operator workload visualization
   - Branch connectivity map

---

**End of Telemetry Documentation**
