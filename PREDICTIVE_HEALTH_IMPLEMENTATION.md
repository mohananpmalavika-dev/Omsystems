# Predictive Branch Health - Complete Implementation Guide

## Overview

This guide documents the complete Predictive Branch Health system for Sentinel Grid, enabling predictions like:

> **"Branch 214 has a 78% probability of recording failure within 72 hours."**

## Architecture

```
Telemetry Collection
        ↓
Branch Health Snapshot
        ↓
Feature Engineering (30+ features)
        ↓
Risk Engine (Weighted Rules V1)
        ↓
Risk Prediction + Explainability
        ↓
Command Center Integration
        ↓
Dashboard + Recommendations
```

## Implemented Components

### 1. Type Definitions ✅
**File**: `src/services/predictive-health/types.ts`

Defines:
- `BranchHealthSnapshot` - Normalized telemetry from 7 domains
- `BranchRiskPrediction` - Complete prediction with explainability
- `RiskFactor` - Individual risk contributions
- `PredictionOutcome` - Ground truth tracking
- `CalibrationMetrics` - Model performance metrics

### 2. Snapshot Service ✅
**File**: `src/services/predictive-health/snapshot.service.ts`

Aggregates telemetry:
- Recording coverage and gaps
- Storage consumption and growth rate
- HDD SMART data and health scoring
- Network latency, packet loss, disconnects
- Camera instability scoring
- DVR temperature and resource utilization
- Historical failure patterns

Key method:
```typescript
await snapshotService.generateSnapshot(tenantId, branchId, options)
```

### 3. Feature Engineering ✅
**File**: `src/services/predictive-health/feature-engine.ts`

Extracts 30+ predictive features:
- **HDD**: Degradation rates (7d, 30d), trend acceleration, sector errors
- **Network**: Latency/packet loss trends, disconn

ect rate, stability
- **Cameras**: Instability score, offline rate, reconnect frequency
- **Storage**: Fill rate, exhaustion days, retention risk, growth acceleration
- **DVR**: Thermal risk, resource utilization, restart frequency
- **Historical**: Failure frequency, recency, MTBF, component patterns
- **Composite**: Overall health, degradation velocity, multi-component risk

### 4. Risk Engine (V1) ⚠️ PARTIAL
**File**: `src/services/predictive-health/risk-engine.ts`

Weighted rule-based scoring:
```typescript
const DEFAULT_WEIGHTS = {
  hdd: 0.25,          // Strongest predictor
  storage: 0.20,
  cameras: 0.15,
  network: 0.15,
  historical: 0.15,
  dvr: 0.10,
};
```

**Status**: Core structure created, needs completion of:
- Network risk calculation
- Camera risk calculation  
- Storage risk calculation
- DVR risk calculation
- Historical risk calculation
- Helper methods (scoreToProbability, buildRiskFactors, etc.)

## Next Steps to Complete

### 5. Complete Risk Engine
Add remaining risk calculation methods and helpers to `risk-engine.ts`

### 6. Main Prediction Service
**File**: `src/services/predictive-health/prediction.service.ts`

Main orchestration service:
```typescript
class PredictionService {
  async predictBranchRisk(branchId, options): Promise<BranchRiskPrediction[]>
  async getPrediction(predictionId): Promise<BranchRiskPrediction>
  async getFleetSummary(tenantId): Promise<FleetRiskSummary>
}
```

### 7. Outcome Tracking Service
**File**: `src/services/predictive-health/outcome.service.ts`

Tracks prediction accuracy:
```typescript
class OutcomeService {
  async recordOutcome(predictionId, actual, intervention)
  async calculateMetrics(modelVersion): Promise<CalibrationMetrics>
}
```

### 8. Database Migration
**File**: `migrations/XXX-predictive-health-tables.sql`

Tables:
```sql
CREATE TABLE branch_health_snapshots (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  snapshot_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE branch_risk_predictions (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  target VARCHAR(50) NOT NULL,
  horizon_hours INTEGER NOT NULL,
  probability DECIMAL(5,4) NOT NULL,
  risk_level VARCHAR(20) NOT NULL,
  confidence VARCHAR(20) NOT NULL,
  data_quality DECIMAL(3,2) NOT NULL,
  predicted_window_start TIMESTAMPTZ,
  predicted_window_end TIMESTAMPTZ,
  model_version VARCHAR(50) NOT NULL,
  model_type VARCHAR(20) NOT NULL,
  prediction_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE prediction_outcomes (
  id UUID PRIMARY KEY,
  prediction_id UUID NOT NULL REFERENCES branch_risk_predictions(id),
  branch_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  predicted_at TIMESTAMPTZ NOT NULL,
  evaluated_at TIMESTAMPTZ NOT NULL,
  actual_failure BOOLEAN NOT NULL,
  failure_time TIMESTAMPTZ,
  outcome VARCHAR(30) NOT NULL,
  outcome_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE failure_events (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  failure_type VARCHAR(50) NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ,
  severity VARCHAR(20) NOT NULL,
  root_cause TEXT,
  event_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_predictions_branch ON branch_risk_predictions(branch_id, created_at DESC);
CREATE INDEX idx_predictions_tenant ON branch_risk_predictions(tenant_id, created_at DESC);
CREATE INDEX idx_snapshots_branch_time ON branch_health_snapshots(branch_id, timestamp DESC);
CREATE INDEX idx_outcomes_prediction ON prediction_outcomes(prediction_id);
```

### 9. API Routes
**File**: `src/routes/predictive-health.routes.ts`

```typescript
router.get('/api/v1/predictive-health/branches/:branchId/risk', 
  async (req, res) => {
    // Get current risk prediction
  });

router.get('/api/v1/predictive-health/branches/:branchId/history',
  async (req, res) => {
    // Get risk history timeline
  });

router.get('/api/v1/predictive-health/fleet/summary',
  async (req, res) => {
    // Get fleet-wide risk summary
  });

router.post('/api/v1/predictive-health/outcomes/:predictionId',
  async (req, res) => {
    // Record prediction outcome
  });
```

### 10. Background Worker
**File**: `src/workers/predictive-health-worker.ts`

Periodic prediction generation:
```typescript
// Run every 10 minutes
setInterval(async () => {
  const branches = await getBranchesNeedingUpdate();
  
  for (const branch of branches) {
    try {
      // Generate snapshot
      const snapshot = await snapshotService.generateSnapshot(
        branch.tenantId,
        branch.id
      );
      
      // Extract features
      const features = await featureEngine.extractFeatures(snapshot);
      
      // Generate predictions for multiple horizons
      const predictions = await Promise.all([
        riskEngine.predict(snapshot, features, 24),
        riskEngine.predict(snapshot, features, 72),
        riskEngine.predict(snapshot, features, 168),
      ]);
      
      // Store predictions
      await predictionService.storePredictions(predictions);
      
      // Emit real-time event
      websocketService.emit('branch.health.prediction.updated', {
        branchId: branch.id,
        predictions,
      });
    } catch (error) {
      logger.error('Prediction generation failed', { branch, error });
    }
  }
}, 10 * 60 * 1000);
```

### 11. Command Center Integration
**File**: Update `src/services/command-center/service.ts`

Add predictive health to diagnosis:
```typescript
async diagnosis(user, branchId, options) {
  // ... existing code ...
  
  // Add predictive health
  const predictions = await predictionService.predictBranchRisk(
    user.tenantId,
    branchId,
    { horizons: [24, 72, 168] }
  );
  
  return {
    ...existingDiagnosis,
    predictiveHealth: predictions,
  };
}
```

### 12. Frontend Components

#### Branch Risk Card Component
**File**: `src/components/PredictiveBranchHealth.tsx`

```tsx
export function PredictiveBranchHealth({ branchId }: Props) {
  const { data: prediction } = usePrediction(branchId, 72);
  
  if (!prediction) return <LoadingState />;
  
  const riskColor = getRiskColor(prediction.riskLevel);
  const riskIcon = getRiskIcon(prediction.riskLevel);
  
  return (
    <Card>
      <CardHeader>
        <h3>Predictive Branch Health</h3>
      </CardHeader>
      <CardContent>
        <div className="risk-score">
          <span className={`icon ${riskColor}`}>{riskIcon}</span>
          <span className="probability">
            {(prediction.probability * 100).toFixed(0)}%
          </span>
        </div>
        <p className="risk-description">
          probability of recording failure within {prediction.horizonHours} hours
        </p>
        
        <Separator />
        
        <div className="metrics">
          <MetricRow label="Risk" value={prediction.riskLevel} />
          <MetricRow label="Confidence" value={prediction.confidence} />
          <MetricRow label="Data Quality" 
            value={`${(prediction.dataQuality * 100).toFixed(0)}%`} />
        </div>
        
        {prediction.predictedWindow && (
          <>
            <Separator />
            <div className="predicted-window">
              <label>Most likely failure window</label>
              <TimeRange 
                start={prediction.predictedWindow.start}
                end={prediction.predictedWindow.end}
              />
            </div>
          </>
        )}
        
        <div className="actions">
          <Button onClick={() => setShowDetails(true)}>
            Investigate
          </Button>
          <Button 
            variant="primary"
            onClick={() => createWorkOrder(prediction)}
          >
            Create Work Order
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

#### Risk Factors Breakdown
**File**: `src/components/RiskFactorsBreakdown.tsx`

```tsx
export function RiskFactorsBreakdown({ prediction }: Props) {
  return (
    <div className="risk-factors">
      <h4>Why is this branch at risk?</h4>
      
      {prediction.riskFactors.map((factor) => (
        <div key={factor.factor} className="factor">
          <div className="factor-header">
            <span className="factor-name">{factor.factor}</span>
            <span className={`severity ${factor.severity.toLowerCase()}`}>
              {factor.severity}
            </span>
          </div>
          
          <ProgressBar 
            value={factor.contribution * 100}
            className={`severity-${factor.severity.toLowerCase()}`}
          />
          
          <div className="factor-details">
            <div>Current: {formatValue(factor.currentValue)}</div>
            {factor.threshold && (
              <div>Threshold: {formatValue(factor.threshold)}</div>
            )}
            <div>Trend: {factor.trend}</div>
          </div>
          
          {factor.evidence.length > 0 && (
            <ul className="evidence">
              {factor.evidence.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
      
      <div className="primary-driver">
        <AlertCircle />
        <span>
          Primary risk driver: <strong>{prediction.primaryRiskDriver}</strong>
        </span>
      </div>
    </div>
  );
}
```

#### Fleet Risk Dashboard
**File**: `src/pages/FleetPredictiveHealth.tsx`

```tsx
export function FleetPredictiveHealth() {
  const { data: summary } = useFleetSummary();
  
  return (
    <div className="fleet-dashboard">
      <h1>Predictive Security Operations</h1>
      
      <div className="risk-distribution">
        <StatCard 
          icon="🔴"
          label="Critical"
          value={summary.riskDistribution.critical}
        />
        <StatCard 
          icon="🟠"
          label="High"
          value={summary.riskDistribution.high}
        />
        <StatCard 
          icon="🟡"
          label="Medium"
          value={summary.riskDistribution.medium}
        />
        <StatCard 
          icon="🟢"
          label="Healthy"
          value={summary.riskDistribution.healthy}
        />
      </div>
      
      <Card>
        <CardHeader>
          <h3>Top Predicted Failures</h3>
          <p>Branches most likely to experience recording failure</p>
        </CardHeader>
        <CardContent>
          <Table>
            <thead>
              <tr>
                <th>Branch</th>
                <th>Risk</th>
                <th>Probability</th>
                <th>Type</th>
                <th>Horizon</th>
                <th>Primary Driver</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {summary.topRisks.map((risk) => (
                <tr key={risk.branchId}>
                  <td>
                    <Link to={`/branches/${risk.branchId}`}>
                      {risk.branchName}
                    </Link>
                  </td>
                  <td>
                    <Badge variant={risk.riskLevel.toLowerCase()}>
                      {risk.riskLevel}
                    </Badge>
                  </td>
                  <td>{(risk.probability * 100).toFixed(0)}%</td>
                  <td>{formatTarget(risk.target)}</td>
                  <td>{risk.urgency}h</td>
                  <td>{risk.primaryDriver}</td>
                  <td>
                    <Button 
                      size="sm"
                      onClick={() => navigate(`/branches/${risk.branchId}#predictive`)}
                    >
                      Investigate
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
```

## Integration with Existing Systems

### 1. Command Center Integration
Predictions appear in branch diagnosis alongside RCA:

```typescript
// In Command Center diagnosis response
{
  "branch": { "id": "214", "name": "Branch 214" },
  "status": { "label": "Degraded" },
  "rootCause": { "code": "hdd_degradation", "certainty": "likely" },
  "predictiveHealth": {
    "72h": {
      "probability": 0.78,
      "riskLevel": "HIGH",
      "primaryDriver": "HDD degradation"
    }
  },
  "recommendedActions": [
    {
      "title": "Inspect DVR HDD within 24 hours",
      "reason": "78% probability of recording failure due to HDD degradation",
      "priority": 1
    }
  ]
}
```

### 2. Timeline Integration
Prediction events appear in Command Center timeline:

```typescript
{
  "eventType": "predictive_maintenance",
  "title": "High risk prediction generated",
  "detail": "78% probability of recording failure within 72 hours",
  "severity": "warning",
  "category": "predictive"
}
```

### 3. Work Order Integration
High-risk predictions can automatically create work order recommendations:

```typescript
if (prediction.probability >= 0.75 && prediction.confidence === "HIGH") {
  await commandCenterService.recommendAction({
    caseId,
    actionType: "create_work_order",
    title: `Inspect ${prediction.primaryRiskDriver} at ${branchName}`,
    reason: prediction.riskFactors[0].evidence.join("; "),
    priority: calculatePriority(prediction),
    approvalRequired: true,
  });
}
```

## Operational Workflow

```
1. Background Worker
   ↓ (every 10 min)
2. Generate Snapshot
   ↓
3. Extract Features
   ↓
4. Calculate Risk
   ↓
5. Store Prediction
   ↓
6. Emit WebSocket Event
   ↓
7. Update Dashboard (real-time)
   ↓
8. Operator Reviews
   ↓
9. [If High Risk] Create Work Order
   ↓
10. Technician Repairs
    ↓
11. Record Outcome
    ↓
12. Model Learns
```

## Future Enhancements (V2/V3)

### V2 - ML Model
- Train gradient-boosted tree model on historical data
- Feature importance analysis
- Calibration and validation
- A/B testing against rules engine

### V3 - Autonomous Operations
- Scenario analysis ("what if we replace HDD?")
- Automated intervention recommendations
- Closed-loop outcome learning
- Branch clustering for cross-branch learning

## Testing Strategy

1. **Unit Tests**: Test individual risk calculations
2. **Integration Tests**: Test full prediction pipeline
3. **Calibration Tests**: Validate probability calibration
4. **Performance Tests**: Ensure <5s prediction time
5. **Outcome Tracking**: Monitor precision/recall in production

## Deployment Checklist

- [ ] Complete risk-engine.ts implementation
- [ ] Create prediction.service.ts
- [ ] Create outcome.service.ts
- [ ] Create database migration
- [ ] Create API routes
- [ ] Implement background worker
- [ ] Build frontend components
- [ ] Integrate with Command Center
- [ ] Add WebSocket real-time updates
- [ ] Write tests
- [ ] Deploy to staging
- [ ] Monitor initial predictions
- [ ] Enable for production tenants

## Success Metrics

- **Coverage**: % of branches with active predictions
- **Timeliness**: Prediction generation latency
- **Accuracy**: Precision, recall, calibration error
- **Adoption**: % of high-risk predictions that trigger work orders
- **Impact**: % of failures prevented through early intervention

---

**Status**: Core infrastructure complete (types, snapshot, features, partial risk engine)
**Next**: Complete risk engine → prediction service → database → API → frontend → integration
