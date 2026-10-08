# Digital Twin REST API Documentation

## Base URL
```
/api/digital-twin
```

## Authentication
All endpoints require the `x-analytics-source-key` header with a valid shared key.

## Endpoints

### 1. Get Enterprise Root
Get the top-level enterprise asset.

**GET** `/api/digital-twin`

**Response:**
```json
{
  "id": "enterprise_12345",
  "type": "enterprise",
  "name": "My Enterprise",
  "status": "healthy",
  "health": {
    "score": 95,
    "issues": []
  },
  "security": {
    "score": 88,
    "vulnerabilities": 3
  },
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z"
}
```

---

### 2. Get Specific Asset
Get detailed information about a specific asset.

**GET** `/api/digital-twin/assets/:assetId`

**Parameters:**
- `assetId` (path, required): Asset identifier

**Response:**
```json
{
  "id": "camera_cam_123",
  "type": "camera",
  "name": "Entrance Camera",
  "parentId": "branch_branch_001",
  "status": "healthy",
  "metadata": {
    "ipAddress": "10.20.4.18",
    "manufacturer": "Hikvision",
    "model": "DS-2CD2345",
    "firmware": "5.7.12"
  },
  "health": {
    "score": 100,
    "lastSeen": "2024-01-15T10:29:00.000Z",
    "issues": []
  },
  "security": {
    "score": 85,
    "vulnerabilities": 0,
    "configurationIssues": 1
  },
  "location": "Main Entrance",
  "criticality": "critical"
}
```

---

### 3. Get Asset Children
Get all direct children of an asset.

**GET** `/api/digital-twin/assets/:assetId/children`

**Response:**
```json
{
  "assetId": "branch_branch_001",
  "children": [
    {
      "id": "camera_cam_123",
      "name": "Entrance Camera",
      "type": "camera",
      "status": "healthy"
    }
  ],
  "count": 25
}
```

---

### 4. Get Asset Dependencies
Get complete dependency information for an asset.

**GET** `/api/digital-twin/assets/:assetId/dependencies`

**Response:**
```json
{
  "assetId": "camera_cam_123",
  "assetName": "Entrance Camera",
  "directDependencies": [
    {
      "assetId": "switch_sw_001",
      "assetName": "PoE Switch 1",
      "relationshipType": "connected_to",
      "criticality": "high"
    },
    {
      "assetId": "nvr_nvr_001",
      "assetName": "NVR 1",
      "relationshipType": "records_to",
      "criticality": "critical"
    }
  ],
  "directDependents": [],
  "allDependencies": ["switch_sw_001", "nvr_nvr_001", "storage_storage_001"],
  "allDependents": []
}
```

---

### 5. Get Asset Relationships
Get all relationships for an asset.

**GET** `/api/digital-twin/assets/:assetId/relationships`

**Response:**
```json
{
  "assetId": "camera_cam_123",
  "relationships": [
    {
      "id": "rel_xyz",
      "sourceId": "camera_cam_123",
      "targetId": "switch_sw_001",
      "type": "connected_to",
      "criticality": "high",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "count": 2
}
```

---

### 6. Get Topology Graph
Get the complete topology graph for visualization.

**GET** `/api/digital-twin/topology`

**Query Parameters:**
- `rootId` (optional): Start from specific asset
- `depth` (optional): Maximum depth to traverse (default: unlimited, max: 10)

**Response:**
```json
{
  "nodes": [
    {
      "id": "camera_cam_123",
      "type": "camera",
      "label": "Entrance Camera",
      "status": "healthy",
      "healthScore": 100,
      "securityScore": 85,
      "metadata": {
        "ipAddress": "10.20.4.18",
        "location": "Main Entrance"
      }
    }
  ],
  "edges": [
    {
      "id": "edge_camera_cam_123_switch_sw_001_connected_to",
      "source": "camera_cam_123",
      "target": "switch_sw_001",
      "type": "connected_to",
      "criticality": "high"
    }
  ],
  "totalAssets": 150,
  "healthySummary": {
    "healthy": 140,
    "warning": 5,
    "critical": 3,
    "offline": 2
  }
}
```

---

### 7. Calculate Blast Radius
Calculate the impact of an asset failure.

**GET** `/api/digital-twin/assets/:assetId/blast-radius`

**Response:**
```json
{
  "sourceAssetId": "switch_sw_001",
  "sourceAssetName": "PoE Switch 1",
  "sourceAssetType": "switch",
  "totalAffected": 28,
  "byType": {
    "camera": 25,
    "nvr": 2,
    "storage": 1
  },
  "bySeverity": {
    "critical": 20,
    "high": 5,
    "medium": 3,
    "low": 0
  },
  "affectedBranches": ["branch_branch_001"],
  "affectedRegions": [],
  "criticalServices": [
    {
      "service": "Camera Surveillance",
      "impact": "25 camera surveillance components affected",
      "affectedAssets": 25
    }
  ],
  "affectedAssets": [
    {
      "assetId": "camera_cam_123",
      "assetName": "Entrance Camera",
      "assetType": "camera",
      "dependencyDepth": 1,
      "dependencyPath": [
        {
          "assetId": "camera_cam_123",
          "assetName": "Entrance Camera",
          "assetType": "camera",
          "relationshipType": "connected_to"
        }
      ],
      "impact": "Camera offline - network connectivity lost",
      "impactLevel": "critical",
      "reason": "Entrance Camera → connected_to → PoE Switch 1"
    }
  ],
  "businessImpact": {
    "coverageLoss": "25 cameras offline",
    "complianceRisk": true,
    "operationalImpact": "Severe",
    "estimatedDowntime": "2-4 hours"
  },
  "calculatedAt": "2024-01-15T10:30:00.000Z"
}
```

---

### 8. Simulate Failure
Simulate an asset failure scenario.

**POST** `/api/digital-twin/simulate`

**Request Body:**
```json
{
  "assetId": "switch_sw_001",
  "failureType": "offline",
  "duration": "2h",
  "cascadeFailures": false
}
```

**Response:**
```json
{
  "simulation": {
    "assetId": "switch_sw_001",
    "failureType": "offline"
  },
  "blastRadius": { /* same as blast radius endpoint */ },
  "predictedStateChanges": [
    {
      "assetId": "camera_cam_123",
      "assetName": "Entrance Camera",
      "currentStatus": "healthy",
      "predictedStatus": "offline",
      "reason": "Camera offline - network connectivity lost"
    }
  ],
  "mitigationSuggestions": [
    "Deploy redundant network switches with automatic failover",
    "Configure VLAN redundancy and link aggregation"
  ],
  "estimatedRecoveryTime": "2-4 hours"
}
```

---

### 9. Get Asset History
Get historical state snapshots for an asset.

**GET** `/api/digital-twin/assets/:assetId/history`

**Query Parameters:**
- `from` (required): Start timestamp (ISO 8601)
- `to` (required): End timestamp (ISO 8601)
- `limit` (optional): Maximum snapshots to return (default: 100, max: 1000)

**Response:**
```json
{
  "assetId": "camera_cam_123",
  "from": "2024-01-14T00:00:00.000Z",
  "to": "2024-01-15T00:00:00.000Z",
  "snapshots": [
    {
      "id": "snap_xyz",
      "assetId": "camera_cam_123",
      "timestamp": "2024-01-14T10:30:00.000Z",
      "status": "healthy",
      "healthScore": 100,
      "securityScore": 85,
      "metrics": {}
    }
  ],
  "count": 48
}
```

---

### 10. Get Recent Events
Get recent digital twin events.

**GET** `/api/digital-twin/events`

**Response:**
```json
{
  "events": [
    {
      "id": "evt_xyz",
      "eventType": "asset_status_changed",
      "assetId": "camera_cam_123",
      "assetName": "Entrance Camera",
      "timestamp": "2024-01-15T10:30:00.000Z",
      "previousState": { "status": "healthy" },
      "newState": { "status": "offline" }
    }
  ],
  "count": 100
}
```

---

### 11. Refresh Digital Twin
Trigger a full refresh of the digital twin from infrastructure.

**POST** `/api/digital-twin/refresh`

**Response:**
```json
{
  "success": true,
  "result": {
    "assetsCreated": 15,
    "assetsUpdated": 135,
    "relationshipsCreated": 45,
    "errors": 0
  }
}
```

---

### 12. Get Security Posture
Get security posture for a scope (enterprise, region, branch, or asset).

**GET** `/api/digital-twin/security-posture/:assetId`

**Response:**
```json
{
  "scopeId": "branch_branch_001",
  "scopeName": "Mumbai Branch",
  "scopeType": "branch",
  "score": 82,
  "grade": "B",
  "vulnerabilities": {
    "critical": 2,
    "high": 5,
    "medium": 12,
    "low": 8,
    "total": 27
  },
  "issues": {
    "outdatedFirmware": 8,
    "defaultCredentials": 2,
    "exposedDevices": 3,
    "insecureProtocols": 5,
    "unreachableDevices": 1,
    "misconfigurations": 6,
    "expiredCertificates": 2
  },
  "compliance": {
    "compliant": false,
    "requirementsMet": 7,
    "totalRequirements": 10,
    "failedChecks": [
      "Less than 90% of devices use encryption",
      "Some devices still use default credentials"
    ]
  },
  "weakestAssets": [
    {
      "assetId": "camera_cam_456",
      "assetName": "Parking Camera",
      "assetType": "camera",
      "score": 45,
      "criticalVulnerabilities": 2
    }
  ],
  "recommendations": [
    {
      "priority": "critical",
      "category": "Authentication",
      "title": "Change Default Credentials",
      "description": "2 devices still using default credentials.",
      "affectedAssets": 2,
      "estimatedImpact": 20,
      "effort": "low",
      "actionItems": [
        "Identify all devices with default credentials",
        "Generate strong unique passwords",
        "Update credentials on all affected devices"
      ]
    }
  ],
  "lastAssessed": "2024-01-15T10:30:00.000Z"
}
```

---

### 13. Get Security Trend
Get security trend over time.

**GET** `/api/digital-twin/security-posture/:assetId/trend`

**Query Parameters:**
- `days` (optional): Number of days to retrieve (default: 30, max: 365)

**Response:**
```json
{
  "scopeId": "branch_branch_001",
  "dataPoints": [
    {
      "timestamp": "2024-01-01T00:00:00.000Z",
      "score": 78,
      "vulnerabilities": 32,
      "issues": 15
    },
    {
      "timestamp": "2024-01-08T00:00:00.000Z",
      "score": 82,
      "vulnerabilities": 27,
      "issues": 12
    }
  ]
}
```

---

### 14. Health Check
Check if the Digital Twin subsystem is operational.

**GET** `/api/digital-twin/health`

**Response:**
```json
{
  "status": "healthy",
  "hasEnterprise": true,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

## Error Responses

All endpoints may return the following error responses:

### 400 Bad Request
```json
{
  "error": "validation_error",
  "details": [
    {
      "path": ["assetId"],
      "message": "Required"
    }
  ]
}
```

### 401 Unauthorized
```json
{
  "error": "invalid_analytics_source_identity"
}
```

### 404 Not Found
```json
{
  "error": "not_found",
  "message": "Asset camera_xyz not found"
}
```

### 500 Internal Server Error
```json
{
  "error": "internal_error",
  "message": "Database connection failed"
}
```

### 503 Service Unavailable
```json
{
  "status": "unhealthy",
  "error": "Database unavailable",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```
