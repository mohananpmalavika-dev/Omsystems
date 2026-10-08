# Twin Observation Model

## Overview

The **TwinObservation** model handles live telemetry and state observations with **freshness tracking**, **expiry management**, and **multi-source correlation**. This ensures stale data is never treated as current state.

## Core Principle

> **HEALTHY observed 8 hours ago ≠ HEALTHY now**

Observations must expire. Without freshness tracking, the system would treat old data as current truth.

## TwinObservation Structure

```typescript
interface TwinObservation {
  nodeId: string;
  metric: TwinObservationMetric;      // What was measured
  state: TwinObservationState;        // HEALTHY, DEGRADED, FAILED, UNKNOWN
  value?: unknown;                    // Raw value
  source: TwinObservationSource;      // ONVIF, SNMP, RTSP, etc.
  confidence: number;                 // 0.0 to 1.0
  
  observedAt: Date;                   // When was this measured?
  expiresAt: Date;                    // When does this expire?
  
  metadata?: {
    error?: string;
    warnings?: string[];
    collectionMethod?: string;
  };
}
```

## Observation Sources

### High Reliability
- `ONVIF` - ONVIF device queries
- `SNMP` - SNMP polling
- `RTSP` - RTSP stream verification
- `HTTP_API` - Device HTTP APIs
- `TPM_ATTESTATION` - TPM attestation

### Medium Reliability
- `EDGE_AGENT` - Edge agent telemetry
- `NVR_API` - NVR/DVR APIs
- `RECORDING_VERIFIER` - Recording verification service
- `SECURITY_COLLECTOR` - Security posture scans
- `ANALYTICS_ENGINE` - Analytics engine health

### Low Reliability
- `PING` - ICMP ping only
- `SYNTHETIC` - Synthetic monitoring
- `MANUAL` - Manual operator input

## Observation Metrics

### Connectivity
- `connectivity` - Network reachability
- `network_latency` - Round-trip time
- `packet_loss` - Packet loss percentage

### Video
- `video_stream` - RTSP stream health
- `video_quality` - Visual quality assessment
- `frame_rate` - FPS
- `bitrate` - Stream bitrate
- `resolution` - Video resolution

### Recording
- `recording_active` - Is recording happening?
- `recording_quality` - Recording quality check
- `storage_writing` - Is storage receiving data?

### Storage
- `disk_health` - SMART health status
- `disk_temperature` - Disk temperature
- `disk_usage` - Used capacity
- `raid_status` - RAID array status
- `storage_capacity` - Available space

### Power
- `power_status` - Power availability
- `battery_level` - UPS battery level
- `voltage` - Input voltage
- `current` - Current draw

### Security
- `firmware_version` - Firmware version
- `certificate_status` - Certificate validity
- `tls_version` - TLS protocol version
- `authentication_status` - Auth status
- `encryption_status` - Encryption enabled
- `secure_boot` - Secure boot status
- `tpm_attestation` - TPM attestation valid

### Analytics
- `analytics_active` - Analytics running
- `detection_count` - Detection throughput
- `model_health` - Model health status

### System
- `uptime` - System uptime
- `time_sync` - Clock synchronization
- `service_status` - Service health

## Freshness Policies

Different metrics have different freshness requirements:

```typescript
DEFAULT_FRESHNESS_POLICIES = {
  // Critical - 30-60 seconds
  connectivity: 60_000,
  video_stream: 30_000,
  recording_active: 120_000,
  
  // Performance - 60 seconds
  cpu_usage: 60_000,
  memory_usage: 60_000,
  
  // Storage - 5 minutes
  disk_health: 300_000,
  disk_usage: 300_000,
  
  // Security - 1 hour
  firmware_version: 3_600_000,
  certificate_status: 3_600_000,
  tpm_attestation: 600_000,
  
  // System - varies
  uptime: 600_000,
  time_sync: 3_600_000
}
```

### Why This Matters

**Connectivity observation:**
- Observed: `2024-08-13 08:00:00`
- Expires: `2024-08-13 08:01:00` (60 seconds)
- Current time: `2024-08-13 10:00:00`

**Result:**
```
STALE → state becomes UNKNOWN
```

Without expiry, a connectivity check from 2 hours ago would still report HEALTHY even though the device might be offline now.

## Multi-Source Correlation

Multiple sources may observe the same metric with different results:

### Example: Conflicting Observations

```typescript
[
  {
    nodeId: "camera_17",
    metric: "connectivity",
    state: "HEALTHY",
    source: "PING",
    confidence: 0.6,
    observedAt: "2024-08-13T10:00:00Z"
  },
  {
    nodeId: "camera_17",
    metric: "connectivity",
    state: "FAILED",
    source: "ONVIF",
    confidence: 0.9,
    observedAt: "2024-08-13T10:00:05Z"
  }
]
```

**Correlation Result:**
```typescript
{
  consensusState: "FAILED",
  consensusConfidence: 0.75,
  hasConflicts: true,
  conflictDetails: [
    "HEALTHY: 40% (PING)",
    "FAILED: 60% (ONVIF)"
  ]
}
```

The weighted consensus prefers the higher-confidence ONVIF observation.

### Correlation Algorithm

1. Filter to fresh observations only
2. Weight each observation by confidence
3. Calculate weighted majority
4. Detect conflicts (multiple distinct states)
5. If no fresh observations, downgrade confidence by 50%

## Node State Determination

Observations are aggregated into node operational state:

### Rules

1. **Any FAILED observation** → node is FAILED
2. **Multiple DEGRADED observations** → node is DEGRADED
3. **All HEALTHY** → node is HEALTHY
4. **Missing critical metrics** → UNKNOWN
5. **Only stale observations** → UNKNOWN

### Example

**Observations:**
```typescript
[
  { metric: "connectivity", state: "HEALTHY", fresh: true },
  { metric: "video_stream", state: "HEALTHY", fresh: true },
  { metric: "recording_active", state: "DEGRADED", fresh: true },
  { metric: "disk_health", state: "HEALTHY", fresh: false }
]
```

**Result:**
```typescript
{
  operationalState: "DEGRADED",  // recording_active is DEGRADED
  confidence: 0.85,
  issues: ["recording_active: DEGRADED"],
  staleMetrics: ["disk_health"]
}
```

### Critical Metrics

Certain metrics are **critical** for determining node state:

**Camera critical metrics:**
- `connectivity`
- `video_stream`
- `recording_active`

**NVR critical metrics:**
- `connectivity`
- `recording_active`
- `storage_writing`

**Switch critical metrics:**
- `connectivity`
- `network_throughput`

Missing any critical metric results in UNKNOWN state.

## Observation Quality Assessment

Each observation has a quality score:

```typescript
interface ObservationQuality {
  trustworthy: boolean;
  qualityScore: number;          // 0-100
  freshness: 'FRESH' | 'AGING' | 'STALE' | 'EXPIRED';
  sourceReliability: 'HIGH' | 'MEDIUM' | 'LOW';
}
```

### Quality Calculation

**Base score: 100**

**Penalties:**
- EXPIRED: -100 (unusable)
- STALE: -40
- AGING: -20
- LOW reliability source: -20
- MEDIUM reliability source: -10

**Confidence multiplier:** `score * confidence`

### Example

```typescript
{
  metric: "connectivity",
  source: "PING",              // LOW reliability
  confidence: 0.8,
  observedAt: "2 hours ago",   // STALE
  
  → qualityScore: (100 - 40 - 20) * 0.8 = 32
  → trustworthy: false
}
```

## Observation Lifecycle

```
1. Collect
   ↓
2. Create Observation
   {
     state: "HEALTHY",
     observedAt: now,
     expiresAt: now + 60s
   }
   ↓
3. Store in database
   ↓
4. Emit event
   ↓
5. Update node state
   ↓
6. Wait for expiry
   ↓
7. Mark as stale
   ↓
8. Node state becomes UNKNOWN
```

## Integration with Twin Nodes

Observations update node operational state:

```typescript
// Collect observations
const observations = await observationRepository.getRecentObservations(
  nodeId,
  ['connectivity', 'video_stream', 'recording_active']
);

// Determine node state
const nodeState = determineNodeState(
  nodeId,
  observations,
  ['connectivity', 'video_stream', 'recording_active'] // critical metrics
);

// Update node
await twinNodeRepository.updateOperationalState(
  nodeId,
  nodeState.operationalState,
  nodeState.determinedAt
);
```

## Observation Storage

### Table: `twin_observations`

```sql
CREATE TABLE twin_observations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  node_id TEXT NOT NULL REFERENCES twin_nodes(id),
  
  metric TEXT NOT NULL,
  state TEXT NOT NULL,
  value JSONB,
  units TEXT,
  
  source TEXT NOT NULL,
  confidence REAL NOT NULL,
  
  observed_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  
  metadata JSONB,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_observations_node_metric ON twin_observations(node_id, metric);
CREATE INDEX idx_observations_expires ON twin_observations(expires_at);
CREATE INDEX idx_observations_observed ON twin_observations(observed_at DESC);
CREATE INDEX idx_observations_tenant ON twin_observations(tenant_id);
```

### Partitioning Strategy

For large deployments, partition by time:

```sql
CREATE TABLE twin_observations (
  ...
) PARTITION BY RANGE (observed_at);

CREATE TABLE twin_observations_2024_08 PARTITION OF twin_observations
  FOR VALUES FROM ('2024-08-01') TO ('2024-09-01');

CREATE TABLE twin_observations_2024_09 PARTITION OF twin_observations
  FOR VALUES FROM ('2024-09-01') TO ('2024-10-01');
```

### Retention Policy

Stale observations should be archived or deleted:

```sql
-- Delete observations older than 7 days
DELETE FROM twin_observations
WHERE observed_at < NOW() - INTERVAL '7 days';

-- Or archive to history table
INSERT INTO twin_observations_archive
SELECT * FROM twin_observations
WHERE observed_at < NOW() - INTERVAL '7 days';

DELETE FROM twin_observations
WHERE observed_at < NOW() - INTERVAL '7 days';
```

## Collector Integration

### Example: ONVIF Connectivity Collector

```typescript
class OnvifConnectivityCollector {
  async collect(camera: TwinNode): Promise<TwinObservation> {
    try {
      const response = await onvifClient.getDeviceInformation(camera.attributes.ip);
      
      return createTwinObservation(
        generateId(),
        camera.tenantId,
        camera.id,
        'connectivity',
        'HEALTHY',
        'ONVIF',
        {
          value: true,
          confidence: 0.99,
          metadata: {
            collectionMethod: 'GetDeviceInformation',
            responseTime: response.latency
          }
        }
      );
    } catch (error) {
      return createTwinObservation(
        generateId(),
        camera.tenantId,
        camera.id,
        'connectivity',
        'FAILED',
        'ONVIF',
        {
          value: false,
          confidence: 0.95,
          metadata: {
            error: error.message
          }
        }
      );
    }
  }
}
```

### Example: RTSP Stream Verifier

```typescript
class RtspStreamCollector {
  async collect(camera: TwinNode): Promise<TwinObservation> {
    const streamUrl = camera.attributes.rtspUrl;
    
    try {
      const verification = await rtspVerifier.verifyStream(streamUrl);
      
      const state = verification.framesReceived > 0 ? 'HEALTHY' : 'DEGRADED';
      
      return createTwinObservation(
        generateId(),
        camera.tenantId,
        camera.id,
        'video_stream',
        state,
        'RTSP',
        {
          value: verification.framesReceived,
          units: 'frames',
          confidence: verification.framesReceived >= 10 ? 0.95 : 0.7,
          metadata: {
            frameRate: verification.frameRate,
            bitrate: verification.bitrate,
            duration: verification.testDuration
          }
        }
      );
    } catch (error) {
      return createTwinObservation(
        generateId(),
        camera.tenantId,
        camera.id,
        'video_stream',
        'FAILED',
        'RTSP',
        {
          confidence: 0.9,
          metadata: { error: error.message }
        }
      );
    }
  }
}
```

## Benefits

### 1. Accurate State Representation

The system never confuses old data with current state.

### 2. Multi-Source Resilience

If one collector fails, others can provide observations.

### 3. Conflict Detection

Disagreements between sources are surfaced, not hidden.

### 4. Provenance Tracking

Every observation knows where it came from and how reliable it is.

### 5. Temporal Queries

"What was the state at the time of the incident?" is answerable.

### 6. Evidence Quality

Recording verification results become observable evidence, not just boolean flags.

## Next Steps

This observation model will integrate with:

1. **Node State Updates** - Feed observations into node operational state
2. **Relationship Health** - Observations verify relationship validity
3. **Impact Engine** - Stale observations trigger UNKNOWN propagation
4. **Incident Correlation** - Observation timestamps establish incident timelines
5. **Evidence Assessment** - Recording observations prove evidence availability
6. **Security Posture** - Security observations track certificate/firmware/TPM state
7. **Predictive Failure** - Observation trends feed prediction models
