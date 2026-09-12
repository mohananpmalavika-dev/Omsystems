# Automatic Media Gateway Failover Architecture

**Capability ID:** `ha.media_failover`  
**Maturity:** `PRODUCTION`  
**Owner:** `infrastructure-team`  
**Dependencies:** `media-gateway`, `control-plane`, `postgres`

---

## 1. Overview & Problem Statement

In enterprise multi-camera surveillance grids and high-security operations (e.g. banking branches, airports, and data centers), media gateways are responsible for ingesting, transcoding, and relaying live RTSP, WebRTC, and HLS streams from cameras to control room video walls and recording engines.

Media gateway failures can be triggered by:
1. **Network Partition or Host Unresponsiveness:** Physical NIC failures, network switch partitions, or host kernel panics causing the gateway to drop off the network.
2. **Process Crashes / FFmpeg OOM:** Transcoding pipelines exceeding memory thresholds or crashing due to corrupted camera bitstreams.
3. **Hardware Maintenance:** Planned server migrations, kernel updates, or OS upgrades requiring zero-downtime node evacuation.

The **Automatic Media Gateway Failover (`ha.media_failover`)** subsystem delivers **sub-second stream redirection** to healthy media gateway instances during node impairment, with:
- **Zero Mock Data:** Powered by real PostgreSQL persistence, active heartbeat watchdogs, and monotonic fencing epochs.
- **Split-Brain Elimination:** Incrementing generation tokens (epochs) prevent conflicting stream ingest if a partitioned node recovers unexpectedly.
- **Capacity-Weighted Routing:** Redistributes streams according to available CPU, RAM, network bandwidth, and stream slots rather than naive round-robin.
- **Operator Graceful Drain:** Clean maintenance evacuation without stream disruption or alerts.

---

## 2. High Availability Architecture

```mermaid
graph TD
    A[IP Camera RTSP Stream] --> B[Media Gateway Alpha (Primary)]
    A -.-> C[Media Gateway Beta (Standby)]
    A -.-> D[Media Gateway Gamma (Standby)]
    
    B -->|Periodic Telemetry Heartbeat: 2s| E[MediaGatewayFailoverService Watchdog]
    C -->|Periodic Telemetry Heartbeat: 2s| E
    D -->|Periodic Telemetry Heartbeat: 2s| E
    
    B -.->|Heartbeat Timeout: > 5000ms| F{Node Alpha Failed?}
    F -- Yes --> G[Watchdog Declares Gateway Alpha FAILED]
    G --> H[Query Affected Stream Routes for Node Alpha]
    H --> I[Capacity-Weighted Gateway Scoring Algorithm]
    I -->|Select Best Available Nodes| J[Target Gateways Beta & Gamma]
    
    J --> K[Increment Monotonic Fencing Epoch: v1 -> v2]
    K --> L[Update Media Stream Route & Redirection URL]
    L --> M[Emit stream:redirected & failover:completed]
    M --> N[Real-Time Viewer Client Reconnection]
    
    O[Operator Maintenance] -->|POST /drain| P[Graceful Stream Evacuation to Healthy Nodes]
```

---

## 3. Split-Brain Prevention via Monotonic Fencing Tokens

When a media gateway experiences network degradation, it may become unreachable by the control plane while still communicating with cameras on an isolated subnet. To prevent **split-brain ingest** (two gateways publishing or writing identical camera streams concurrently):

1. Every camera stream route in `media_stream_routes` carries an authoritative `fencing_token` (integer epoch, starting at 1).
2. Upon initiating failover, the control plane atomically increments `fencing_token = fencing_token + 1`.
3. The new target media gateway is provisioned with this incremented epoch token.
4. If the impaired gateway subsequently recovers, any media segment commits or routing updates with a stale fencing token are rejected with HTTP 409 Conflict:
   ```json
   {
     "error": "stale_epoch_rejected",
     "message": "Stale owner epoch rejected. Split-brain prevented.",
     "currentAuthoritativeEpoch": 2
   }
   ```

---

## 4. Capacity-Weighted Gateway Selection Algorithm

When a node with multiple camera streams fails, redistributing streams randomly or with basic round-robin risks overwhelming a single healthy node. The `MediaGatewayFailoverService` ranks healthy standby candidates according to multi-dimensional capacity:

$$\text{Score} = (W_{\text{streams}} \cdot R_{\text{streams}}) + (W_{\text{net}} \cdot R_{\text{net}}) + (W_{\text{cpu}} \cdot R_{\text{cpu}}) + (W_{\text{mem}} \cdot R_{\text{mem}})$$

Where:
- $R_{\text{streams}} = \frac{\text{maxStreams} - \text{activeStreams}}{\text{maxStreams}}$ (Weight: 40%)
- $R_{\text{net}} = \frac{\text{maxNetworkMbps} - \text{currentNetworkMbps}}{\text{maxNetworkMbps}}$ (Weight: 30%)
- $R_{\text{cpu}} = \frac{100 - \text{cpuPercent}}{100}$ (Weight: 15%)
- $R_{\text{mem}} = \frac{100 - \text{memoryPercent}}{100}$ (Weight: 15%)

If an instance is already operating above `maxLoadPercent` (default: 85%), a load penalty is applied to avoid hot-spotting.

---

## 5. Graceful Maintenance Draining

For planned server reboots or hardware upgrades:
1. Operator invokes `POST /api/v1/ha/media-gateways/:gatewayId/drain`.
2. The gateway transitions to `DRAINING` state: it rejects new incoming stream assignments.
3. The service systematically iterates through all active streams on the gateway, provisions paths on optimal standby gateways, and seamlessly updates client redirection pointers.
4. Once all active streams reach 0, the node status transitions to `OFFLINE` cleanly without triggering critical alarms or SLA penalties.

---

## 6. Flap Dampening & Recovery Stabilization

If a gateway flaps (repeatedly drops and regains network connectivity):
1. When heartbeats resume from a failed node, the service does not immediately reassign high-priority camera streams to it.
2. The node transitions to `DEGRADED` (stabilizing) for the duration of `flapDampingSeconds` (default: 30 seconds).
3. Once the quiet stabilization window expires with consecutive successful heartbeats, the node is marked `HEALTHY` and becomes eligible for new stream allocations and load rebalancing.

---

## 7. Database Persistence (Migration 138)

```sql
-- Gateway node cluster registry
CREATE TABLE media_gateway_nodes (
    gateway_id VARCHAR(128) PRIMARY KEY,
    gateway_name VARCHAR(128) NOT NULL,
    ip_address VARCHAR(64) NOT NULL,
    port INT NOT NULL DEFAULT 8554,
    api_port INT NOT NULL DEFAULT 9997,
    public_url VARCHAR(255),
    region VARCHAR(64) NOT NULL DEFAULT 'default',
    status VARCHAR(32) NOT NULL DEFAULT 'HEALTHY',
    max_streams INT NOT NULL DEFAULT 250,
    active_streams INT NOT NULL DEFAULT 0,
    max_network_mbps DOUBLE PRECISION NOT NULL DEFAULT 1000.0,
    current_network_mbps DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    cpu_percent DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    memory_percent DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    consecutive_failures INT NOT NULL DEFAULT 0,
    last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Active camera stream routes with fencing epochs
CREATE TABLE media_stream_routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    camera_id VARCHAR(128) NOT NULL,
    stream_profile VARCHAR(32) NOT NULL DEFAULT 'main',
    assigned_gateway_id VARCHAR(128) NOT NULL REFERENCES media_gateway_nodes(gateway_id) ON DELETE CASCADE,
    standby_gateway_id VARCHAR(128) REFERENCES media_gateway_nodes(gateway_id) ON DELETE SET NULL,
    source_uri VARCHAR(512) NOT NULL,
    stream_path VARCHAR(255) NOT NULL,
    redirect_url VARCHAR(512) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    fencing_token BIGINT NOT NULL DEFAULT 1,
    viewer_count INT NOT NULL DEFAULT 0,
    bitrate_kbps INT NOT NULL DEFAULT 2048,
    fps INT NOT NULL DEFAULT 25,
    last_failover_at TIMESTAMPTZ,
    failover_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_camera_stream_profile UNIQUE (camera_id, stream_profile)
);

-- Forensic failover audit event logs
CREATE TABLE media_gateway_failover_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(64) NOT NULL,
    severity VARCHAR(32) NOT NULL DEFAULT 'INFO',
    failed_gateway_id VARCHAR(128) NOT NULL,
    target_gateway_id VARCHAR(128),
    affected_streams INT NOT NULL DEFAULT 0,
    redirected_streams INT NOT NULL DEFAULT 0,
    failed_redirects INT NOT NULL DEFAULT 0,
    rto_ms INT NOT NULL DEFAULT 0,
    reason VARCHAR(255) NOT NULL,
    details JSONB,
    triggered_by VARCHAR(64) NOT NULL DEFAULT 'SYSTEM_WATCHDOG',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 8. REST API Reference

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/v1/ha/media-gateways` | `GET` | List all cluster gateway instances, health, and capacity |
| `/api/v1/ha/media-gateways/register` | `POST` | Register a new media gateway node |
| `/api/v1/ha/media-gateways/heartbeat` | `POST` | Ingest real-time heartbeat and system telemetry |
| `/api/v1/ha/media-gateways/streams` | `GET` | List active camera stream route assignments |
| `/api/v1/ha/media-gateways/streams/route` | `POST` | Route a camera stream to optimal gateway |
| `/api/v1/ha/media-gateways/streams/:cameraId/redirect` | `POST` | Force redirect a stream to a target gateway |
| `/api/v1/ha/media-gateways/:gatewayId/failover` | `POST` | Trigger immediate node failover (chaos drill) |
| `/api/v1/ha/media-gateways/:gatewayId/drain` | `POST` | Gracefully evacuate streams for maintenance |
| `/api/v1/ha/media-gateways/rebalance` | `POST` | Rebalance cluster load across nodes |
| `/api/v1/ha/media-gateways/events` | `GET` | Retrieve failover audit log |
| `/api/v1/ha/media-gateways/metrics` | `GET` | Live SLA metrics (RTO, continuity %, node health) |
| `/api/v1/ha/media-gateways/policy` | `GET` | Get active failover policy |
| `/api/v1/ha/media-gateways/policy` | `PUT` | Update active failover policy |
| `/api/v1/ha/media-gateways/probe` | `POST` | Trigger on-demand cluster watchdog cycle |
