# Digital Twin Domain Models

## Overview

The Digital Twin domain models define the **canonical infrastructure graph** that serves as the backbone for the entire VMS platform. These models unify monitoring, recording, security, incidents, AI, and predictive capabilities through a single, authoritative dependency representation.

## Architecture Principle

**The Digital Twin is not a visualization feature—it is the source of truth for infrastructure state and relationships.**

```
                ┌──────────────────────┐
                │   DIGITAL TWIN       │
                │ Infrastructure Graph │
                └──────────┬───────────┘
                           │
       ┌───────────────────┼────────────────────┐
       │                   │                    │
 Provisioning          Monitoring          Recording
       │                   │                    │
       ├───────────────────┼────────────────────┤
       │                   │                    │
 Security Posture     Incident Engine     Predictive Failure
       │                   │                    │
       ├───────────────────┼────────────────────┤
                           │
                     AI Commander
```

## Core Concepts

### 1. TwinNode - Infrastructure Elements

A **TwinNode** represents any infrastructure element in the system:

- **Physical devices**: Cameras, NVRs, switches, routers, UPS, doors, ATMs
- **Logical components**: Channels, VLANs, storage pools, services
- **Business capabilities**: ATM surveillance, vault monitoring, evidence capability
- **Organizational structure**: Enterprise, regions, branches

**Key Properties:**

```typescript
interface TwinNode {
  id: string;                           // Unique identifier
  tenantId: string;                     // Multi-tenant scope
  type: TwinNodeType;                   // CAMERA, NVR, SWITCH, etc.
  externalRef?: TwinNodeExternalRef;    // Reference to domain service
  
  lifecycle: TwinNodeLifecycle;         // ACTIVE, DISABLED, MAINTENANCE
  operationalState: TwinNodeOperationalState; // HEALTHY, DEGRADED, FAILED
  criticality: TwinNodeCriticality;     // CRITICAL, HIGH, MEDIUM, LOW
  
  health: { score, status, issues };    // Health assessment
  security: { score, status, issues };  // Security posture
  capabilities?: TwinNodeCapability[];  // AI capabilities
  
  attributes: Record<string, unknown>;  // Type-specific data
}
```

**External Reference Pattern:**

The Twin doesn't duplicate full device records. Instead, it references the authoritative domain:

```typescript
{
  id: "camera_cam_123",
  type: "CAMERA",
  externalRef: {
    domain: "camera",       // Camera service owns this
    id: "cam_123",          // Primary key in camera table
    table: "cameras"        // Optional for direct queries
  }
}
```

This keeps the Twin lightweight while maintaining a single source of truth.

### 2. TwinRelationship - Dependencies and Connections

A **TwinRelationship** represents a directed edge between two nodes:

```typescript
interface TwinRelationship {
  sourceNodeId: string;               // Node that has the dependency
  targetNodeId: string;               // Node being depended upon
  type: TwinRelationshipType;         // DEPENDS_ON, CONNECTED_TO, etc.
  
  criticality: TwinRelationshipCriticality; // CRITICAL, HIGH, MEDIUM, LOW
  confidence: number;                 // 0.0 to 1.0
  source: TwinRelationshipSource;     // DISCOVERY, CONFIGURATION, INFERRED
  
  dependencySemantics?: {             // For impact analysis
    required: boolean;
    redundancyGroup?: string;
    minimumHealthy?: number;
    failureEffect: 'UNAVAILABLE' | 'DEGRADED' | 'AT_RISK';
  };
  
  validFrom: Date;                    // Temporal validity
  validUntil?: Date;
}
```

**Relationship Categories:**

1. **Structural** (CONTAINS, LOCATED_AT, BELONGS_TO)
   - Organizational hierarchy
   - No failure propagation

2. **Network** (CONNECTED_TO, CONNECTED_THROUGH, ROUTES_THROUGH)
   - Network connectivity
   - Bidirectional or target-to-source propagation

3. **Power** (POWERED_BY, BACKED_UP_BY)
   - Power dependencies
   - Target-to-source propagation

4. **Video** (RECORDED_BY, USES_CHANNEL, STREAMS_TO)
   - Recording infrastructure
   - Target-to-source propagation

5. **Storage** (STORES_ON, MIRRORS_TO, REPLICATES_TO)
   - Data storage
   - Variable propagation based on redundancy

6. **Security** (AUTHENTICATED_BY, PROTECTED_BY, SECURES)
   - Security relationships
   - Bidirectional or specific direction

7. **Business** (PROVIDES_EVIDENCE_FOR, COVERS, SUPPORTS_CAPABILITY)
   - Business semantics
   - Source-to-target propagation (infrastructure → business)

8. **Policy** (GOVERNED_BY, SUBJECT_TO, AUDITED_BY)
   - Compliance and governance
   - No failure propagation

9. **Dependency** (DEPENDS_ON, REQUIRED_FOR, FAILS_WITH)
   - Generic operational dependencies
   - Variable propagation

### 3. Relationship Semantics

Each relationship type has defined failure propagation semantics:

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
    failurePropagation: 'BIDIRECTIONAL',     // Failures propagate both ways
    category: 'network'
  },
  
  CONTAINS: {
    failurePropagation: 'NONE',              // No propagation
    category: 'structural'
  }
}
```

**Impact Analysis Example:**

```
Switch-7 FAILED
     ↓ (CONNECTED_THROUGH, TARGET_TO_SOURCE)
Camera-17 affected
     ↓ (PROVIDES_EVIDENCE_FOR, SOURCE_TO_TARGET)
ATM-42 monitoring degraded
```

### 4. Confidence and Provenance

Relationships track **how they were established**:

- `DISCOVERY` - Automatically discovered (ONVIF, SNMP, LLDP)
- `CONFIGURATION` - Explicitly configured by operator
- `TELEMETRY` - Inferred from telemetry (ARP, MAC tables)
- `OPERATOR` - Manually created
- `INFERRED` - Algorithmically inferred
- `IMPORTED` - Imported from external system

Confidence ranges from 0.0 to 1.0:

```typescript
{
  type: 'CONNECTED_THROUGH',
  source: 'DISCOVERY',
  confidence: 0.99  // High confidence from SNMP
}

{
  type: 'CONNECTED_THROUGH',
  source: 'INFERRED',
  confidence: 0.63  // Lower confidence from inference
}
```

**Never silently convert inference into fact.**

### 5. Temporal Validity

Relationships have temporal bounds:

```typescript
{
  validFrom: new Date('2024-08-01'),
  validUntil: new Date('2024-08-31')  // Temporary relationship
}

{
  validFrom: new Date('2024-08-01'),
  validUntil: null  // Indefinite
}
```

This enables:
- Historical queries: "What did the infrastructure look like when the incident happened?"
- Time-travel analysis
- Forensic investigation
- Configuration change tracking

### 6. Redundancy Groups

Multiple relationships can form redundancy groups:

```typescript
// Camera recorded by both NVR-1 and NVR-2
[
  {
    sourceNodeId: 'camera_17',
    targetNodeId: 'nvr_1',
    type: 'RECORDED_BY',
    dependencySemantics: {
      required: true,
      redundancyGroup: 'camera_17_recording',
      minimumHealthy: 1,
      failureEffect: 'DEGRADED'  // One NVR can fail
    }
  },
  {
    sourceNodeId: 'camera_17',
    targetNodeId: 'nvr_2',
    type: 'RECORDED_BY',
    dependencySemantics: {
      required: true,
      redundancyGroup: 'camera_17_recording',
      minimumHealthy: 1,
      failureEffect: 'DEGRADED'
    }
  }
]
```

If one NVR fails → DEGRADED (still recording)
If both NVRs fail → UNAVAILABLE (not recording)

## Node Types

### Hierarchy
- `ENTERPRISE` - Top-level organization
- `REGION` - Geographic region
- `BRANCH` - Physical branch/site

### Network
- `ISP` - Internet service provider
- `ROUTER` - Network router
- `FIREWALL` - Firewall device
- `SWITCH` - Network switch
- `VLAN` - Virtual LAN
- `GATEWAY` - Network gateway
- `ACCESS_POINT` - WiFi access point
- `NETWORK_SEGMENT` - Logical network segment

### Power
- `UPS` - Uninterruptible power supply
- `PDU` - Power distribution unit
- `GENERATOR` - Backup generator
- `POWER_CIRCUIT` - Electrical circuit

### Video
- `CAMERA` - IP camera
- `NVR` - Network video recorder
- `DVR` - Digital video recorder
- `CHANNEL` - Recorder channel
- `VIDEO_ENCODER` - Video encoder
- `VIDEO_DECODER` - Video decoder

### Storage
- `STORAGE_ARRAY` - Storage array
- `DISK` - Physical disk
- `RAID_GROUP` - RAID group
- `STORAGE_POOL` - Storage pool
- `NAS` - Network-attached storage
- `SAN` - Storage area network

### Security
- `ACCESS_CONTROLLER` - Access control panel
- `DOOR` - Physical door
- `DOOR_LOCK` - Electronic lock
- `CARD_READER` - Card reader
- `BIOMETRIC_READER` - Fingerprint/face reader
- `BARRIER` - Vehicle barrier
- `TURNSTILE` - Entrance turnstile

### Banking
- `ATM` - Automated teller machine
- `VAULT` - Bank vault
- `VAULT_DOOR` - Vault door
- `CASH_COUNTER` - Cash counting area
- `TELLER_STATION` - Teller workstation
- `STRONG_ROOM` - Strong room
- `CASH_VAN` - Cash transport vehicle

### Sensors
- `FIRE_SENSOR` - Fire detector
- `SMOKE_SENSOR` - Smoke detector
- `MOTION_SENSOR` - Motion detector
- `TEMPERATURE_SENSOR` - Temperature sensor
- `HUMIDITY_SENSOR` - Humidity sensor
- `PANIC_BUTTON` - Emergency button
- `WATER_SENSOR` - Water leak sensor
- `GAS_SENSOR` - Gas detector

### Services
- `SERVICE` - Software service
- `APPLICATION` - Application
- `EDGE_AGENT` - Edge agent
- `ANALYTICS_ENGINE` - Analytics engine
- `VMS_SERVER` - VMS server
- `DATABASE` - Database server
- `WEB_SERVER` - Web server

### Business Capabilities (Abstract)
- `ATM_SURVEILLANCE` - ATM monitoring capability
- `VAULT_MONITORING` - Vault security capability
- `ENTRANCE_MONITORING` - Entrance surveillance
- `CASH_COUNTER_MONITORING` - Cash counter oversight
- `PERIMETER_SECURITY` - Perimeter protection
- `PARKING_MONITORING` - Parking surveillance
- `LOBBY_SURVEILLANCE` - Lobby monitoring
- `RECORDING_CAPABILITY` - Recording service
- `EVIDENCE_CAPABILITY` - Evidence preservation
- `REMOTE_GUARD_CAPABILITY` - Remote guard service

## Design Patterns

### Pattern 1: Infrastructure Stack

```
Branch-18
   ↓ (CONTAINS)
ISP-1
   ↓ (CONNECTED_TO)
Router-1
   ↓ (CONNECTED_TO)
Switch-7
   ├─ (CONNECTED_THROUGH) ─> Camera-17
   ├─ (CONNECTED_THROUGH) ─> Camera-18
   └─ (CONNECTED_THROUGH) ─> NVR-3
```

### Pattern 2: Recording Chain

```
Camera-17
   ↓ (RECORDED_BY)
NVR-3
   ↓ (USES_CHANNEL)
Channel-17
   ↓ (STORES_ON)
Storage-Array-2
   ↓ (PART_OF)
Disk-23
```

### Pattern 3: Business Capability

```
ATM-42
   ↓ (REQUIRES_COVERAGE)
ATM-Surveillance-Capability
   ↓ (SUPPORTS_CAPABILITY)
Camera-17
   ↓ (PROVIDES_EVIDENCE_FOR)
ATM-42
```

### Pattern 4: Power Dependency

```
Camera-17
   ↓ (POWERED_BY, PRIMARY)
Mains-Power
   
Camera-17
   ↓ (BACKED_UP_BY)
UPS-2
```

### Pattern 5: Security Chain

```
Camera-17
   ↓ (AUTHENTICATED_BY)
Certificate-Authority
   
Camera-17
   ↓ (PROTECTED_BY)
Firewall-1
   
Camera-17
   ↓ (SECURED_BY)
Edge-Agent-7 (TPM attestation)
```

## Integration Points

### 1. Capability Registry Integration

Nodes can have AI capabilities attached:

```typescript
{
  id: "camera_17",
  type: "CAMERA",
  capabilities: [
    {
      capabilityId: "person",
      status: "AVAILABLE",
      requiredModel: "yolov8n",
      modelProvisioned: true
    },
    {
      capabilityId: "face-recognition",
      status: "NOT_PROVISIONED",
      requiredModel: "facenet",
      modelProvisioned: false,
      configurationRequired: true
    }
  ]
}
```

### 2. Recording Verification Integration

Recording relationships track evidence health:

```typescript
{
  sourceNodeId: "camera_17",
  targetNodeId: "nvr_3",
  type: "RECORDED_BY",
  metadata: {
    rtspVerified: true,
    recordingVerified: true,
    lastVerification: "2024-08-13T10:30:00Z",
    verificationMethod: "RTSP_FRAME_CHECK"
  }
}
```

### 3. Security Posture Integration

Nodes track security attributes:

```typescript
{
  id: "nvr_3",
  security: {
    score: 72,
    status: "VULNERABLE",
    attributes: {
      firmwareUpToDate: false,
      certificateValid: true,
      encryptionEnabled: true,
      defaultCredentials: false,
      secureBootEnabled: true,
      tpmPresent: true
    }
  }
}
```

### 4. Predictive Failure Integration

Predictions become metadata on nodes:

```typescript
{
  id: "disk_23",
  attributes: {
    predictedFailure: {
      probability: 0.78,
      horizon: "7 days",
      indicators: ["SMART warnings", "high error rate"]
    }
  }
}
```

## Benefits

### 1. Unified Infrastructure View

Every subsystem sees the same infrastructure model. No duplicate device lists, no synchronization issues.

### 2. Intelligent Impact Analysis

```
Switch-7 fails
  ↓
17 cameras affected
  ↓
5 ATM monitoring capabilities degraded
  ↓
Recording SLA at risk
  ↓
Evidence availability compromised
```

The system understands the full impact chain automatically.

### 3. Root Cause Correlation

Instead of:
```
Alert: Camera-1 offline
Alert: Camera-2 offline
Alert: Camera-3 offline
Alert: NVR-3 unreachable
```

Get:
```
Root Cause: Switch-7 connectivity failure
Affected: 17 cameras, 1 NVR
Impact: 5 ATM surveillance capabilities degraded
```

### 4. Evidence Trust

The graph can answer:
```
Can I trust evidence from Camera-17?

Camera-17:         HEALTHY
Recording:         VERIFIED
Storage:           HEALTHY
Security posture:  DEGRADED (firmware outdated)
Time sync:         HEALTHY

Evidence Trust: AVAILABLE, but security posture requires attention
```

### 5. What-If Simulation

```
Query: What happens if I reboot NVR-3?

Impact:
- 17 cameras lose recording
- 5 ATM evidence paths affected
- Vault coverage unaffected
- Expected recovery: 4 minutes

Recommendation: Move cameras to NVR-4 before maintenance
```

### 6. AI Commander Integration

The AI assistant queries the graph instead of inventing answers:

```
User: Why is ATM-42 monitoring degraded?

Assistant:
  TwinService.getImpact('atm_42')
  TwinService.getDependencyPaths('atm_42')
  
Response:
  ATM-42 monitoring is degraded because:
  
  Camera-17 and Camera-18 depend on Switch-7.
  Switch-7 became unreachable at 08:14.
  Camera-17 lost connectivity at 08:14:07.
  Camera-18 lost connectivity at 08:14:11.
  
  Both cameras provide evidence for ATM-42.
  ATM surveillance capability is now degraded.
```

## Migration Strategy

### Phase 1: Core Models (This Task)
- ✅ Define TwinNode and TwinRelationship domain models
- ✅ Type system with 100+ node types and 40+ relationship types
- ✅ Relationship semantics and failure propagation rules
- ✅ Confidence, provenance, and temporal validity

### Phase 2: Repositories & Schema
- Update database schema with new fields
- Add temporal tables for historical queries
- Implement confidence tracking
- Add capability attachment tables

### Phase 3: Observation Model
- Live telemetry integration
- Observation freshness and expiry
- Multiple source correlation
- Stale data detection

### Phase 4: Impact Engine
- Dependency traversal with semantics
- Propagation rules implementation
- Redundancy group handling
- Path explanation

### Phase 5: Topology Discovery
- ONVIF topology provider
- SNMP network discovery
- Recorder channel enumeration
- Automatic relationship building

### Phase 6: Capability Integration
- Attach AI capabilities to nodes
- Model provisioning status
- Configuration requirements
- Capability health monitoring

### Phase 7: Business Capabilities
- ATM surveillance nodes
- Vault monitoring nodes
- Evidence capability nodes
- Coverage requirement modeling

### Phase 8: Evidence Dependencies
- Camera → NVR → Storage chains
- Recording verification integration
- Evidence trust assessment
- Compliance mapping

### Phase 9: Incident Correlation
- Root cause identification
- Alert storm collapse
- Dependency path explanation
- Automated incident creation

### Phase 10: Security Integration
- TPM/attestation status
- Certificate validity
- Firmware currency
- Secure boot status

### Phase 11: Predictive Impact
- Failure prediction → impact
- Maintenance planning
- Risk assessment
- Business exposure calculation

### Phase 12: AI Assistant
- Graph query integration
- Natural language → graph traversal
- Impact explanation
- What-if simulation

## API Examples

### Query Node with Full Context

```typescript
GET /twin/nodes/camera_17

Response:
{
  "id": "camera_17",
  "type": "CAMERA",
  "name": "ATM Lobby Camera",
  "operationalState": "HEALTHY",
  
  "dependencies": [
    { "nodeId": "switch_7", "type": "CONNECTED_THROUGH" },
    { "nodeId": "nvr_3", "type": "RECORDED_BY" },
    { "nodeId": "ups_2", "type": "BACKED_UP_BY" }
  ],
  
  "dependents": [
    { "nodeId": "atm_42", "type": "PROVIDES_EVIDENCE_FOR" }
  ],
  
  "capabilities": [
    { "capabilityId": "person", "status": "AVAILABLE" },
    { "capabilityId": "face-recognition", "status": "NOT_PROVISIONED" }
  ],
  
  "health": { "score": 95, "status": "HEALTHY" },
  "security": { "score": 72, "status": "VULNERABLE" }
}
```

### Calculate Impact

```typescript
POST /twin/impact-analysis

Body:
{
  "nodeId": "switch_7",
  "hypotheticalState": "FAILED"
}

Response:
{
  "directImpact": ["nvr_3"],
  "dependentImpact": ["camera_1", ..., "camera_17"],
  "businessImpact": ["atm_42_monitoring", "vault_monitoring"],
  "complianceImpact": ["recording_sla"],
  "evidenceImpact": ["atm_42_evidence"],
  
  "paths": [
    {
      "nodes": ["switch_7", "nvr_3", "camera_17", "atm_42"],
      "relationships": ["CONNECTED_THROUGH", "RECORDED_BY", "PROVIDES_EVIDENCE_FOR"],
      "impactType": "EVIDENCE"
    }
  ]
}
```

### Get Evidence Chain

```typescript
GET /twin/nodes/atm_42/evidence-chain

Response:
{
  "asset": "atm_42",
  "evidenceSources": [
    {
      "camera": "camera_17",
      "availability": "HEALTHY",
      "recording": "VERIFIED",
      "storage": "HEALTHY",
      "security": "DEGRADED",
      "evidenceTrust": "AVAILABLE_WITH_WARNINGS",
      "chain": [
        "camera_17 (HEALTHY)",
        "→ nvr_3 (HEALTHY)",
        "→ storage_array_2 (HEALTHY)"
      ]
    }
  ]
}
```

## Conclusion

These domain models transform the Digital Twin from a visualization feature into the **canonical infrastructure graph** that powers the entire VMS platform.

Every major subsystem—provisioning, monitoring, recording, security, incidents, prediction, and AI—will consume this graph as the single source of truth for infrastructure state, dependencies, and impact.

This architecture enables:
- ✅ Intelligent impact analysis
- ✅ Root cause correlation
- ✅ Evidence trust assessment
- ✅ Security posture tracking
- ✅ Predictive failure with business context
- ✅ AI commander with real dependency data
- ✅ What-if simulation for maintenance planning

The platform now has the backbone needed to become **more interesting than conventional VMS architecture**.
