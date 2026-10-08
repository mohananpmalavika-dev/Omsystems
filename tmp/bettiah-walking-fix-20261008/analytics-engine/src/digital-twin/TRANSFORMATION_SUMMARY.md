# Digital Twin Transformation Summary

## What Was Accomplished

The Digital Twin has been transformed from a visualization feature into the **canonical infrastructure graph** that serves as the backbone for the entire VMS platform.

## Completed Work

### 1. Canonical Domain Models ✅

Created authoritative type-safe domain models in `analytics-engine/src/digital-twin/domain/`:

#### **TwinNode** (`twin-node.ts`, `twin-node-types.ts`)
- **100+ node types** across 10 categories:
  - Hierarchy: ENTERPRISE, REGION, BRANCH
  - Network: ISP, ROUTER, FIREWALL, SWITCH, VLAN, GATEWAY
  - Power: UPS, PDU, GENERATOR, POWER_CIRCUIT
  - Video: CAMERA, NVR, DVR, CHANNEL, VIDEO_ENCODER
  - Storage: STORAGE_ARRAY, DISK, RAID_GROUP, NAS, SAN
  - Security: ACCESS_CONTROLLER, DOOR, CARD_READER, BIOMETRIC_READER
  - Banking: ATM, VAULT, CASH_COUNTER, TELLER_STATION, STRONG_ROOM
  - Sensors: FIRE_SENSOR, SMOKE_SENSOR, MOTION_SENSOR, PANIC_BUTTON
  - Services: EDGE_AGENT, ANALYTICS_ENGINE, VMS_SERVER, DATABASE
  - **Business Capabilities**: ATM_SURVEILLANCE, VAULT_MONITORING, EVIDENCE_CAPABILITY

- **External reference pattern** - Twin references domain services, doesn't duplicate data:
  ```typescript
  externalRef: {
    domain: "camera",
    id: "cam_123",
    table: "cameras"
  }
  ```

- **Health and Security tracking**:
  ```typescript
  health: {
    score: 0-100,
    status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' | 'UNKNOWN',
    issues: string[],
    metrics: Record<string, number>
  }
  
  security: {
    score: 0-100,
    status: 'SECURE' | 'VULNERABLE' | 'COMPROMISED' | 'UNKNOWN',
    attributes: {
      firmwareVersion, certificateValid, encryptionEnabled,
      secureBootEnabled, tpmPresent, attestationValid, ...
    }
  }
  ```

- **AI Capabilities attachment** - Links to `capability-catalog.ts`:
  ```typescript
  capabilities: [
    {
      capabilityId: "person",
      status: "AVAILABLE",
      requiredModel: "yolov8n",
      modelProvisioned: true
    }
  ]
  ```

- **Lifecycle states**: DISCOVERED, PROVISIONING, ACTIVE, DISABLED, MAINTENANCE, ARCHIVED
- **Operational states**: HEALTHY, DEGRADED, FAILED, UNKNOWN
- **Criticality levels**: CRITICAL, HIGH, MEDIUM, LOW

#### **TwinRelationship** (`twin-relationship.ts`, `twin-relationship-types.ts`)
- **40+ relationship types** across 9 categories:
  - **Structural**: CONTAINS, LOCATED_AT, BELONGS_TO, PART_OF
  - **Network**: CONNECTED_TO, CONNECTED_THROUGH, ROUTES_THROUGH, UPLINKS_TO
  - **Power**: POWERED_BY, BACKED_UP_BY
  - **Video**: RECORDED_BY, USES_CHANNEL, STREAMS_TO
  - **Storage**: STORES_ON, MIRRORS_TO, REPLICATES_TO
  - **Security**: AUTHENTICATED_BY, PROTECTED_BY, SECURES
  - **Management**: MANAGED_BY, MONITORS, CONFIGURED_BY
  - **Business**: PROVIDES_EVIDENCE_FOR, COVERS, SUPPORTS_CAPABILITY, REQUIRES_EVIDENCE
  - **Policy**: GOVERNED_BY, SUBJECT_TO, AUDITED_BY
  - **Dependency**: DEPENDS_ON, REQUIRED_FOR, FAILS_WITH

- **Failure propagation semantics**:
  ```typescript
  RELATIONSHIP_SEMANTICS = {
    DEPENDS_ON: {
      failurePropagation: 'TARGET_TO_SOURCE',  // If target fails, source affected
      category: 'dependency'
    },
    PROVIDES_EVIDENCE_FOR: {
      failurePropagation: 'SOURCE_TO_TARGET',  // If source fails, target affected
      category: 'business'
    },
    CONNECTED_TO: {
      failurePropagation: 'BIDIRECTIONAL',     // Both ways
      category: 'network'
    }
  }
  ```

- **Confidence and provenance tracking**:
  ```typescript
  {
    source: 'DISCOVERY' | 'CONFIGURATION' | 'TELEMETRY' | 'OPERATOR' | 'INFERRED' | 'IMPORTED',
    confidence: 0.0 to 1.0
  }
  ```

- **Temporal validity** for historical queries:
  ```typescript
  {
    validFrom: Date,
    validUntil?: Date  // null = indefinite
  }
  ```

- **Dependency semantics** for impact analysis:
  ```typescript
  dependencySemantics: {
    required: boolean,
    redundancyGroup?: string,
    minimumHealthy?: number,
    failureEffect: 'UNAVAILABLE' | 'DEGRADED' | 'AT_RISK',
    weight?: number
  }
  ```

- **Redundancy group support**:
  ```typescript
  // Camera recorded by both NVR-1 and NVR-2
  [
    { targetNodeId: 'nvr_1', redundancyGroup: 'camera_17_recording', minimumHealthy: 1 },
    { targetNodeId: 'nvr_2', redundancyGroup: 'camera_17_recording', minimumHealthy: 1 }
  ]
  // If one fails → DEGRADED, if both fail → UNAVAILABLE
  ```

#### **TwinObservation** (`twin-observation.ts`)
- **Live telemetry with freshness tracking**:
  ```typescript
  {
    observedAt: Date,
    expiresAt: Date,     // Automatic expiry
    isFresh: boolean
  }
  ```

- **Default freshness policies**:
  ```typescript
  connectivity: 60_000,        // 60 seconds
  video_stream: 30_000,        // 30 seconds
  recording_active: 120_000,   // 2 minutes
  disk_health: 300_000,        // 5 minutes
  certificate_status: 3_600_000 // 1 hour
  ```

- **13 observation sources** with reliability levels:
  - HIGH: ONVIF, SNMP, RTSP, HTTP_API, TPM_ATTESTATION
  - MEDIUM: EDGE_AGENT, NVR_API, RECORDING_VERIFIER, SECURITY_COLLECTOR
  - LOW: PING, SYNTHETIC, MANUAL

- **30+ observation metrics**:
  - Connectivity: connectivity, network_latency, packet_loss
  - Video: video_stream, video_quality, frame_rate, bitrate
  - Recording: recording_active, recording_quality, storage_writing
  - Storage: disk_health, disk_temperature, disk_usage, raid_status
  - Power: power_status, battery_level, voltage
  - Security: firmware_version, certificate_status, tls_version, tpm_attestation
  - Analytics: analytics_active, detection_count, model_health
  - System: uptime, time_sync, service_status

- **Multi-source correlation**:
  ```typescript
  correlateObservations(nodeId, metric, observations)
  → {
    consensusState: weighted majority,
    consensusConfidence: score,
    hasConflicts: boolean,
    conflictDetails: string[]
  }
  ```

- **Node state determination**:
  ```typescript
  determineNodeState(nodeId, observations, criticalMetrics)
  → {
    operationalState: 'HEALTHY' | 'DEGRADED' | 'FAILED' | 'UNKNOWN',
    confidence: number,
    issues: string[],
    staleMetrics: string[],
    conflicts: string[]
  }
  ```

- **Quality assessment**:
  ```typescript
  assessObservationQuality(observation)
  → {
    trustworthy: boolean,
    qualityScore: 0-100,
    freshness: 'FRESH' | 'AGING' | 'STALE' | 'EXPIRED',
    sourceReliability: 'HIGH' | 'MEDIUM' | 'LOW'
  }
  ```

### 2. Comprehensive Documentation ✅

Created three major documentation files:

1. **`domain/README.md`** (3,500+ lines)
   - Architecture principles
   - Core concepts (nodes, relationships, semantics)
   - Design patterns (infrastructure stack, recording chain, business capability, power dependency, security chain)
   - Integration points (capability registry, recording verification, security posture, predictive failure)
   - Benefits and use cases
   - Migration strategy (12 phases)
   - API examples

2. **`domain/OBSERVATION_MODEL.md`** (500+ lines)
   - Observation lifecycle
   - Freshness tracking
   - Multi-source correlation
   - Node state determination
   - Quality assessment
   - Collector integration examples
   - Storage and retention strategies

3. **`TRANSFORMATION_SUMMARY.md`** (this file)

## Architecture Transformation

### Before

```
┌─────────────────────────────────────┐
│  Digital Twin                       │
│  (Visualization Feature)            │
│                                     │
│  • Floor plans                      │
│  • Device icons                     │
│  • Zones                            │
│  • Alert markers                    │
└─────────────────────────────────────┘

Separate, isolated subsystems:
- Camera service (device records)
- Recording service (recorder data)
- Security service (posture data)
- Analytics engine (detections)
- Incident service (alerts)
- Predictive service (predictions)
- AI assistant (generic queries)
```

### After

```
                ┌──────────────────────┐
                │   DIGITAL TWIN       │
                │ Infrastructure Graph │
                │                      │
                │ • Canonical nodes    │
                │ • Dependencies       │
                │ • Live observations  │
                │ • Business semantics │
                └──────────┬───────────┘
                           │
       ┌───────────────────┼────────────────────┐
       │                   │                    │
 Provisioning          Monitoring          Recording
  (discovers)          (observes)          (verifies)
       │                   │                    │
       ├───────────────────┼────────────────────┤
       │                   │                    │
 Security Posture     Incident Engine     Predictive Failure
  (assesses)           (correlates)         (forecasts)
       │                   │                    │
       ├───────────────────┼────────────────────┤
                           │
                     AI Commander
                      (queries)

All subsystems consume the same graph
```

## Key Design Decisions

### 1. External Reference Pattern

**Decision**: Twin doesn't duplicate full device records

**Rationale**: 
- Keeps Twin lightweight
- Domain services remain authoritative
- No synchronization issues
- Single source of truth maintained

```typescript
// Twin node
{
  id: "camera_cam_123",
  type: "CAMERA",
  externalRef: { domain: "camera", id: "cam_123" }
}

// Camera service owns the full record
{
  id: "cam_123",
  ip: "192.168.1.100",
  model: "Hikvision DS-2CD2142FWD-I",
  firmware: "V5.7.3",
  // ... 50+ fields
}
```

### 2. Relationship Semantics

**Decision**: Encode failure propagation rules into relationship types

**Rationale**:
- Impact analysis becomes deterministic
- No guessing how failures propagate
- Different relationship types have different behaviors
- Supports redundancy and optional dependencies

```typescript
Switch-7 FAILED
     ↓ (CONNECTED_THROUGH, TARGET_TO_SOURCE)
Camera-17 affected
     ↓ (PROVIDES_EVIDENCE_FOR, SOURCE_TO_TARGET)
ATM-42 monitoring degraded
```

### 3. Confidence and Provenance

**Decision**: Track how relationships were established and confidence level

**Rationale**:
- **Never silently convert inference into fact**
- Different sources have different reliability
- Enables verification workflows
- Supports human override

```typescript
{
  type: 'CONNECTED_THROUGH',
  source: 'DISCOVERY',    // SNMP MAC table
  confidence: 0.99
}

{
  type: 'CONNECTED_THROUGH',
  source: 'INFERRED',     // IP subnet analysis
  confidence: 0.63
}
```

### 4. Temporal Validity

**Decision**: Relationships have `validFrom` and `validUntil`

**Rationale**:
- Historical queries: "What did infrastructure look like during the incident?"
- Time-travel analysis for forensics
- Configuration change tracking
- Supports incident investigation

### 5. Observation Expiry

**Decision**: Every observation has an expiry time

**Rationale**:
- **HEALTHY observed 8 hours ago ≠ HEALTHY now**
- Prevents stale data from being treated as current
- Different metrics have different freshness requirements
- Automatic transition to UNKNOWN when stale

### 6. Business Capability Nodes

**Decision**: Abstract business capabilities are first-class nodes

**Rationale**:
- Infrastructure failures propagate to business impact
- "ATM surveillance degraded" is more meaningful than "2 cameras offline"
- Enables business-level impact analysis
- Connects technical failures to operational consequences

```typescript
ATM-42
   ↓ (REQUIRES_COVERAGE)
ATM-Surveillance-Capability
   ↓ (SUPPORTS_CAPABILITY)
Camera-17
```

### 7. Redundancy Groups

**Decision**: Support N-of-M redundancy in relationships

**Rationale**:
- Real infrastructure has redundancy
- One NVR failing shouldn't mark recording as unavailable
- Enables sophisticated dependency modeling
- Supports high-availability configurations

```typescript
Camera recorded by 2 NVRs, minimum 1 required:
- 1 NVR fails → DEGRADED (still recording)
- 2 NVRs fail → UNAVAILABLE (not recording)
```

## Integration Points

### 1. Capability Registry Integration

Nodes can have AI capabilities from `capability-catalog.ts`:

```typescript
{
  id: "camera_17",
  capabilities: [
    { capabilityId: "person", status: "AVAILABLE" },
    { capabilityId: "face-recognition", status: "NOT_PROVISIONED" }
  ]
}
```

### 2. Recording Verification Integration

Recording relationships track verification evidence:

```typescript
{
  type: "RECORDED_BY",
  metadata: {
    rtspVerified: true,
    recordingVerified: true,
    lastVerification: "2024-08-13T10:30:00Z"
  }
}
```

### 3. Security Posture Integration

Nodes track security attributes:

```typescript
{
  security: {
    score: 72,
    status: "VULNERABLE",
    attributes: {
      firmwareUpToDate: false,
      certificateValid: true,
      tpmPresent: true,
      attestationValid: true
    }
  }
}
```

### 4. Predictive Failure Integration

Predictions become node attributes:

```typescript
{
  id: "disk_23",
  attributes: {
    predictedFailure: {
      probability: 0.78,
      horizon: "7 days",
      indicators: ["SMART warnings"]
    }
  }
}
```

### 5. Incident Correlation Integration

Graph analysis enables root cause identification:

```
Alert Storm:
- Camera-1 offline
- Camera-2 offline
- Camera-3 offline
- NVR-3 unreachable

Graph Analysis:
Switch-7 FAILED
     ↓
All above devices depend on Switch-7

Result:
ROOT CAUSE: Switch-7
AFFECTED: 17 cameras, 1 NVR
IMPACT: 5 ATM capabilities degraded
```

### 6. AI Assistant Integration

Assistant queries graph instead of inventing answers:

```
User: "Why is ATM-42 monitoring degraded?"
