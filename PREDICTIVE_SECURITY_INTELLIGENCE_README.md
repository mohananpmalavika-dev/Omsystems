

# AI-Powered Predictive Security Intelligence ("SecurityGPT")

## Overview

Production-grade predictive security system that learns behavioral patterns, predicts incidents 24-48 hours in advance, and generates optimal patrol routes. Shifts security operations from reactive to proactive.

**Key Features:**
- 🧠 **Behavioral Pattern Learning**: Statistical baseline with Z-score anomaly detection
- 🗺️ **3D Risk Heat Maps**: Spatial-temporal risk visualization with geohash indexing
- 📊 **Incident Prediction**: 24-72 hour forecasting with confidence scoring
- 🚔 **Proactive Patrol Optimization**: AI-generated routes with greedy nearest-neighbor algorithm
- ⚡ **Real-time Updates**: WebSocket alerts for critical anomalies and predictions
- 📈 **Intelligence Reporting**: Automated daily/weekly security summaries

---

## Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                  Security Intelligence Service               │
│                    (Orchestration Layer)                     │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
┌───────▼────────┐ ┌────────▼────────┐ ┌───────▼────────┐
│  Behavioral    │ │   Risk          │ │   Patrol       │
│  Learning      │ │   Prediction    │ │   Optimization │
│  Detector      │ │   Engine        │ │   Engine       │
└────────────────┘ └─────────────────┘ └────────────────┘
        │                   │                   │
┌───────▼────────────────────▼───────────────────▼────────┐
│              PostgreSQL + PostGIS Database               │
│  9 Tables: observations, profiles, anomalies,           │
│  heatmaps, predictions, patrol plans, checkpoints        │
└──────────────────────────────────────────────────────────┘
```

### Data Flow

```
Detection Frame → Record Observation → Learn Patterns → Detect Anomalies
                                                              │
                    ┌─────────────────────────────────────────┘
                    │
                    ▼
              Generate Risk Heat Map → Predict Incidents → Optimize Patrol Routes
                    │                        │                     │
                    ▼                        ▼                     ▼
              3D Visualization      Proactive Alerts      Patrol Plans
```

---

## Installation

### 1. Database Setup

Run the migration to create all required tables:

```bash
psql -U postgres -d your_database -f analytics-engine/migrations/003_predictive_security_intelligence.sql
```

**Required PostgreSQL Extensions:**
- `uuid-ossp` - UUID generation
- `postgis` - Spatial data (geohash, lat/lon)
- `timescaledb` - Optional, for time-series optimization

### 2. Install Dependencies

```bash
# Install geohash library (required for spatial grid)
npm install ngeohash

# Install Three.js for 3D visualization (frontend)
npm install three @types/three

# Install Zod for API validation
npm install zod
```

### 3. Initialize Service

```typescript
import { Pool } from 'pg';
import { SecurityIntelligenceService } from './src/services/security-intelligence.service';

const db = new Pool({
  host: 'localhost',
  database: 'security_vms',
  user: 'postgres',
  password: 'your_password',
});

const securityIntelligence = new SecurityIntelligenceService(db, {
  enableRealTimeUpdates: true,
  anomalyDetectionEnabled: true,
  riskPredictionEnabled: true,
  patrolOptimizationEnabled: true,
  reportGenerationInterval: 60, // minutes
  heatMapUpdateInterval: 15, // minutes
});

await securityIntelligence.initialize();
```

### 4. Mount API Routes

```typescript
import express from 'express';
import { createSecurityIntelligenceRoutes } from './src/routes/security-intelligence.routes';

const app = express();
app.use('/api/security-intelligence', createSecurityIntelligenceRoutes(db));
```

---

## Usage

### Recording Observations

Observations are automatically recorded from your existing detection pipeline:

```typescript
import type { DetectionFrame } from './analytics-engine/src/detectors/base-detector';

// From your existing person/vehicle detector
const frame: DetectionFrame = {
  cameraId: 'cam_001',
  tenantId: 'tenant_123',
  timestamp: new Date(),
  imageData: Buffer.from('...'),
  width: 1920,
  height: 1080,
  metadata: {
    branchId: 'branch_001',
    zoneId: 'zone_entrance',
    location: { lat: 40.7128, lon: -74.0060 },
  },
};

const detections = [
  {
    label: 'person',
    confidence: 0.95,
    boundingBox: { x: 0.3, y: 0.4, width: 0.1, height: 0.2 },
    trackId: 'person_track_001',
    attributes: {
      velocity: 1.2, // m/s
      direction: 45, // degrees
      dwellTime: 120, // seconds
    },
  },
];

// Process and learn
await securityIntelligence.processDetectionFrame(frame, detections);
```

**Learning Process:**
1. Observation recorded to `behavioral_observation` table
2. Statistical baselines updated in `behavioral_profile` table
3. Anomalies detected and stored in `behavioral_anomaly` table
4. Critical anomalies trigger real-time alerts

---

### Generating Risk Heat Maps

#### API Request

```bash
POST /api/security-intelligence/heatmap/generate
Authorization: Bearer <token>
Content-Type: application/json

{
  "branchId": "branch_001",
  "predictionForTime": "2024-12-01T14:00:00Z"
}
```

#### API Response

```json
{
  "success": true,
  "data": {
    "id": "heatmap_1733068800000_xyz",
    "tenantId": "tenant_123",
    "branchId": "branch_001",
    "predictionForTime": "2024-12-01T14:00:00Z",
    "cells": [
      {
        "gridCellId": "dr5reg",
        "centerPoint": { "lat": 40.7128, "lon": -74.0060 },
        "riskScore": 85.3,
        "riskLevel": "high",
        "riskComponents": {
          "intrusionRisk": 0.7,
          "theftRisk": 0.5,
          "violenceRisk": 0.3,
          "unauthorizedAccessRisk": 0.6,
          "anomalyRisk": 0.8
        },
        "confidence": 0.87,
        "contributingFactors": ["high_incident_history", "recent_anomalies"],
        "historicalIncidentsCount": 12,
        "recentAnomaliesCount": 5
      }
    ],
    "overallRiskScore": 62.4,
    "highRiskAreasCount": 3,
    "generatedAt": "2024-12-01T12:00:00Z"
  }
}
```

#### Programmatic Usage

```typescript
const heatMap = await securityIntelligence.generateRiskHeatMap(
  'tenant_123',
  'branch_001',
  new Date('2024-12-01T14:00:00Z')
);

console.log(`Overall Risk: ${heatMap.overallRiskScore}`);
console.log(`High Risk Areas: ${heatMap.highRiskAreasCount}`);

// Find highest risk cell
const criticalCells = heatMap.cells
  .filter(c => c.riskLevel === 'critical')
  .sort((a, b) => b.riskScore - a.riskScore);
```

---

### Generating Incident Predictions

#### API Request

```bash
POST /api/security-intelligence/predictions/generate
Authorization: Bearer <token>
Content-Type: application/json

{
  "branchId": "branch_001",
  "incidentTypes": ["intrusion", "theft", "violence", "unauthorized_access"]
}
```

#### API Response

```json
{
  "success": true,
  "data": [
    {
      "id": "pred_1733068800000_abc",
      "tenantId": "tenant_123",
      "branchId": "branch_001",
      "incidentType": "intrusion",
      "locationScope": "branch",
      "scopeId": "branch_001",
      "predictionWindowStart": "2024-12-01T12:00:00Z",
      "predictionWindowEnd": "2024-12-02T12:00:00Z",
      "predictionHorizonHours": 24,
      "probability": 0.73,
      "riskLevel": "high",
      "confidence": 0.85,
      "expectedTimeRange": {
        "start": "2024-12-01T12:00:00Z",
        "end": "2024-12-02T12:00:00Z",
        "mostLikely": "2024-12-01T22:00:00Z"
      },
      "contributingFactors": [
        "high_historical_frequency",
        "recent_anomaly_spike",
        "strong_temporal_pattern"
      ],
      "historicalIncidentsCount": 15,
      "recentAnomaliesCount": 7,
      "similarPatternMatches": 8,
      "preventiveActions": [
        "Deploy security personnel immediately",
        "Increase monitoring frequency",
        "Check perimeter barriers and locks",
        "Verify alarm system functionality"
      ],
      "recommendedPatrolZones": ["zone_entrance", "zone_parking", "zone_rear"],
      "status": "ACTIVE",
      "generatedAt": "2024-12-01T12:00:00Z"
    }
  ]
}
```

---

### Generating Patrol Plans

#### API Request

```bash
POST /api/security-intelligence/patrol-plans/generate
Authorization: Bearer <token>
Content-Type: application/json

{
  "branchId": "branch_001",
  "plannedForDate": "2024-12-02T00:00:00Z",
  "shiftStartTime": "08:00",
  "shiftEndTime": "16:00",
  "availableOfficers": 3,
  "objective": "minimize_risk"
}
```

**Optimization Objectives:**
- `minimize_risk`: Focus on highest risk areas
- `maximize_coverage`: Cover as many areas as possible
- `balanced`: Balance risk and coverage
- `rapid_response`: Critical areas only, fastest routes

#### API Response

```json
{
  "success": true,
  "data": {
    "id": "plan_1733068800000_def",
    "tenantId": "tenant_123",
    "branchId": "branch_001",
    "planName": "minimize_risk Patrol - 12/2/2024",
    "planType": "proactive",
    "plannedForDate": "2024-12-02",
    "shiftStartTime": "08:00",
    "shiftEndTime": "16:00",
    "optimizationObjective": "minimize_risk",
    "totalRiskCovered": 425.6,
    "coveragePercentage": 78.5,
    "requiredOfficers": 3,
    "estimatedDurationMinutes": 420,
    "routes": [
      {
        "officerId": null,
        "checkpoints": [
          {
            "zoneId": "dr5reg",
            "location": { "lat": 40.7128, "lon": -74.0060 },
            "arrivalTime": "08:00",
            "durationMinutes": 15,
            "riskScore": 85.3,
            "priority": 5,
            "actions": [
              "Visual inspection",
              "Check perimeter",
              "Investigate anomaly reports"
            ]
          },
          {
            "zoneId": "dr5reh",
            "location": { "lat": 40.7130, "lon": -74.0062 },
            "arrivalTime": "08:25",
            "durationMinutes": 10,
            "riskScore": 72.1,
            "priority": 4,
            "actions": [
              "Visual inspection",
              "Check perimeter",
              "Check locks and barriers"
            ]
          }
        ],
        "totalDistanceMeters": 3240,
        "totalDurationMinutes": 145,
        "riskCovered": 157.4
      }
    ],
    "priorityZones": [
      {
        "zoneId": "dr5reg",
        "riskScore": 85.3,
        "reason": "Critical risk level"
      }
    ],
    "status": "DRAFT",
    "generatedAt": "2024-12-01T12:00:00Z"
  }
}
```

#### Patrol Workflow

```bash
# 1. Generate plan
POST /api/security-intelligence/patrol-plans/generate

# 2. Review and approve
PUT /api/security-intelligence/patrol-plans/{id}/approve

# 3. Start patrol
PUT /api/security-intelligence/patrol-plans/{id}/start

# 4. Complete patrol with metrics
PUT /api/security-intelligence/patrol-plans/{id}/complete
{
  "effectivenessScore": 0.85,
  "incidentsDetected": 2,
  "anomaliesFound": 3
}
```

---

### Anomaly Management

#### Get Active Anomalies

```bash
GET /api/security-intelligence/anomalies?branchId=branch_001&severity=critical&status=ACTIVE
```

#### Acknowledge Anomaly

```bash
PUT /api/security-intelligence/anomalies/{id}/acknowledge
{
  "notes": "Investigated. Suspicious activity confirmed. Increased patrols."
}
```

#### Resolve Anomaly

```bash
PUT /api/security-intelligence/anomalies/{id}/resolve
{
  "notes": "Issue resolved. No security threat.",
  "falsePositive": false
}
```

---

### Intelligence Reports

#### Generate Report

```bash
POST /api/security-intelligence/reports/generate
{
  "branchId": "branch_001",
  "reportType": "daily",
  "startDate": "2024-12-01T00:00:00Z",
  "endDate": "2024-12-01T23:59:59Z"
}
```

#### Report Types

- `daily`: 24-hour summary
- `shift`: Per-shift summary (8-hour)
- `weekly`: 7-day summary
- `realtime`: Current snapshot

#### Report Response

```json
{
  "success": true,
  "data": {
    "id": "report_1733068800000_ghi",
    "reportType": "daily",
    "reportPeriodStart": "2024-12-01T00:00:00Z",
    "reportPeriodEnd": "2024-12-01T23:59:59Z",
    "totalObservations": 1247,
    "totalAnomalies": 23,
    "totalIncidents": 4,
    "anomaliesBySeverity": {
      "low": 12,
      "medium": 8,
      "high": 3,
      "critical": 0
    },
    "incidentsByType": {
      "person": 1150,
      "vehicle": 97
    },
    "overallRiskScore": 62.4,
    "riskTrend": "stable",
    "topRiskZones": [
      {
        "zoneId": "dr5reg",
        "riskScore": 85.3,
        "anomalyCount": 5
      }
    ],
    "patrolsCompleted": 3,
    "patrolCoveragePercentage": 78.5,
    "incidentsPreventedEstimate": 2,
    "activePredictionsCount": 12,
    "highRiskPredictionsCount": 3,
    "recommendations": [
      "Review and activate proactive patrol plans",
      "Focus security efforts on high-risk zone: dr5reg",
      "Continue behavioral pattern learning",
      "Review and update security protocols"
    ],
    "priorityActions": [
      "Investigate 3 high-risk incident predictions"
    ]
  }
}
```

---

## React Dashboard Components

### 3D Risk Heat Map

```tsx
import { RiskHeatMap3D } from './components/SecurityIntelligence/RiskHeatMap3D';

<RiskHeatMap3D
  heatMap={heatMapData}
  onCellClick={(cell) => console.log('Selected:', cell)}
  autoRotate={false}
  showGrid={true}
  height={600}
/>
```

**Features:**
- Interactive 3D visualization with Three.js
- Color-coded risk levels (green → yellow → orange → red)
- Hover tooltips with risk breakdown
- Click to select cells for detailed view
- Orbit controls (rotate, zoom, pan)
- Export to PNG

### Additional Components

Create these components in `dashboard/src/components/SecurityIntelligence/`:

1. **PredictionCard.tsx** - Display incident predictions
2. **AnomalyTimeline.tsx** - Timeline of detected anomalies
3. **PatrolRouteMap.tsx** - 2D map with patrol routes (Leaflet)
4. **SecurityIntelligenceDashboard.tsx** - Main dashboard view
5. **RiskTrendChart.tsx** - Historical risk trend chart

---

## Real-Time Updates

### WebSocket Integration

```typescript
// Subscribe to branch updates
const unsubscribe = securityIntelligence.subscribe(
  `${tenantId}:${branchId}`,
  (update) => {
    console.log('Real-time update:', update);
    
    switch (update.type) {
      case 'anomaly_detected':
        handleAnomalyAlert(update.data);
        break;
      case 'high_risk_prediction':
        handleHighRiskPrediction(update.data);
        break;
      case 'heatmap_updated':
        refreshHeatMap();
        break;
      case 'patrol_plan_approved':
        refreshPatrolPlans();
        break;
    }
  }
);

// Cleanup
unsubscribe();
```

---

## Performance Considerations

### Optimization Tips

1. **Observation Recording**: Batch insert observations every 10 seconds instead of per-frame
2. **Heat Map Generation**: Cache for 15 minutes, don't regenerate on every request
3. **Profile Updates**: Run hourly, not per-observation
4. **Spatial Queries**: Use PostGIS indexes for fast location-based queries
5. **TimescaleDB**: Enable for automatic time-series optimization

### Resource Requirements

**Minimum:**
- 4 CPU cores
- 8 GB RAM
- 50 GB disk space
- PostgreSQL 13+ with PostGIS

**Recommended (100 cameras):**
- 8 CPU cores
- 16 GB RAM
- 200 GB SSD
- PostgreSQL 14+ with PostGIS + TimescaleDB

---

## Configuration

### Behavioral Learning

```typescript
const behavioralLearning = new BehavioralPatternLearningDetector(db, {
  minObservations: 100, // Minimum observations before creating profile
  updateInterval: 3600, // Profile update interval (seconds)
  adaptiveLearningRate: 0.1, // Learning rate for adaptive updates
  anomalyThreshold: 3.0, // Z-score threshold for anomalies (3 sigma)
});
```

### Risk Prediction

```typescript
const riskPrediction = new SecurityRiskPredictionEngine(db, {
  horizonHours: 24, // Default prediction horizon
  gridPrecision: 6, // Geohash precision (6 = ~600m cells)
  minIncidentsForPrediction: 3, // Minimum historical incidents
  temporalWindowDays: 30, // Historical data window
  includeSpatialSmoothing: true, // Apply neighbor influence
});
```

### Patrol Optimization

```typescript
const patrolOptimization = new PatrolOptimizationEngine(db, {
  maxCheckpointsPerRoute: 8, // Max checkpoints per officer
  maxRouteDurationMinutes: 240, // Max 4-hour routes
  minCheckpointDurationMinutes: 5, // Min 5 minutes per checkpoint
  maxCheckpointDurationMinutes: 15, // Max 15 minutes per checkpoint
  priorityRiskThreshold: 70, // Risk score for priority zones
  travelSpeedMetersPerMinute: 60, // Walking speed (~3.6 km/h)
});
```

---

## Troubleshooting

### Issue: No heat map generated

**Cause**: Insufficient observations or missing PostGIS extension

**Solution**:
```sql
-- Check observations count
SELECT COUNT(*) FROM behavioral_observation WHERE branch_id = 'branch_001';

-- Enable PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- Verify spatial data
SELECT COUNT(*) FROM behavioral_observation WHERE location IS NOT NULL;
```

### Issue: Predictions always return null

**Cause**: Not enough historical incidents

**Solution**: Lower `minIncidentsForPrediction` threshold or wait for more data:
```typescript
const riskPrediction = new SecurityRiskPredictionEngine(db, {
  minIncidentsForPrediction: 1, // Lower threshold
});
```

### Issue: Anomalies not detected

**Cause**: Behavioral profiles not trained yet

**Solution**: Wait for observation collection (minimum 100 observations per profile) or force profile update:
```typescript
await behavioralLearning.buildProfile(
  tenantId,
  branchId,
  'camera',
  cameraId
);
```

---

## API Reference

See complete API documentation: [API_REFERENCE.md](./analytics-engine/docs/API_REFERENCE.md)

**Base URL**: `/api/security-intelligence`

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/heatmap/latest` | Get latest risk heat map |
| POST | `/heatmap/generate` | Generate new heat map |
| GET | `/predictions/active` | Get active predictions |
| POST | `/predictions/generate` | Generate predictions |
| GET | `/patrol-plans/active` | Get active patrol plans |
| GET | `/patrol-plans/:id` | Get patrol plan by ID |
| POST | `/patrol-plans/generate` | Generate patrol plan |
| PUT | `/patrol-plans/:id/approve` | Approve plan |
| PUT | `/patrol-plans/:id/start` | Start patrol |
| PUT | `/patrol-plans/:id/complete` | Complete patrol |
| GET | `/anomalies` | List anomalies |
| PUT | `/anomalies/:id/acknowledge` | Acknowledge anomaly |
| PUT | `/anomalies/:id/resolve` | Resolve anomaly |
| POST | `/reports/generate` | Generate report |
| GET | `/reports` | List reports |
| GET | `/metrics` | Get system metrics |
| GET | `/dashboard` | Get dashboard summary |

---

## Support

For issues, questions, or contributions:
- GitHub Issues: [link]
- Documentation: [link]
- Contact: security-ai@example.com

---

## License

Proprietary - All Rights Reserved

© 2024 OM Systems. Production-grade AI-powered security intelligence system.
