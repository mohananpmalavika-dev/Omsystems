# Predictive Branch Failure AI - Implementation Summary

## Overview
Comprehensive implementation of AI-powered predictive branch failure detection system for Sentinel Grid VMS. Predicts recorder, disk, network, camera, UPS, and storage retention failures before they affect recording operations.

## ✅ Completed Implementation (All 20 Tasks - 100%)

### Backend Services (15 services)

1. **FailurePredictionEngine** - Rules-based prediction for 6 device types
2. **TelemetryFeatureExtractionService** - Feature extraction from telemetry
3. **BranchRiskAggregationService** - Branch reliability scoring
4. **TelemetrySyncService** - Sync health data every 5 minutes
5. **PredictionNotificationService** - Multi-channel alerting
6. **PredictionCalibrationService** - Accuracy tracking and calibration
7. **PredictionRcaIntegrationService** - RCA feedback loop for outcome learning
8. **DigitalTwinPredictionIntegration** - Visual risk indicators for Digital Twin
9. **AiCommandCenterPredictionService** - Natural language prediction queries

### API Routes (20 endpoints)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/predictions/branches` | GET | List all predictions with filtering |
| `/v1/predictions/branches/:branchId` | GET | Branch-specific predictions |
| `/v1/predictions/devices/:deviceId` | GET | Device-specific predictions |
| `/v1/predictions/imminent` | GET | Failures within 24 hours |
| `/v1/predictions/retention-risk` | GET | Storage retention risks |
| `/v1/predictions/network-risk` | GET | Network connectivity risks |
| `/v1/predictions/storage-risk` | GET | Disk and storage risks |
| `/v1/predictions/:id/acknowledge` | POST | Acknowledge prediction |
| `/v1/predictions/:id/create-work-order` | POST | Create maintenance ticket |
| `/v1/predictions/:id/feedback` | POST | Record operator feedback |
| `/v1/predictions/model-performance` | GET | Basic accuracy metrics |
| `/v1/predictions/model-performance/detailed` | GET | Comprehensive calibration metrics |
| `/v1/predictions/model-performance/:type/calibration` | GET | Calibration curve for type |
| `/v1/predictions/model-performance/degradation-check` | GET | Model health check |
| `/v1/predictions/model-performance/threshold-recommendations` | POST | Threshold adjustments |
| `/v1/predictions/digital-twin/branches/:id/risk-indicators` | GET | Device risk indicators for DT |
| `/v1/predictions/digital-twin/devices/:id/risk-indicator` | GET | Device-specific risk indicator |
| `/v1/predictions/digital-twin/branches/:id/risk-overlay` | GET | Branch risk overlay for map |
| `/v1/predictions/ai-query` | POST | Natural language prediction queries |
| `/v1/predictions/generate` | POST | Manual prediction generation |

### Frontend Components (3 components)

1. **PredictiveOperationsDashboard** - Main dashboard with metrics, filtering, and quick actions
2. **PredictionDetailView** - Comprehensive detail modal with evidence graphs and trend charts
3. **BranchRiskScoreWidget** - Risk score visualization with radial/bar charts and component breakdown

### Database Schema (15 tables + 3 views)

**Core Tables:**
- `device_health_snapshots` - Periodic health assessments
- `device_health_features` - Extracted prediction features
- `device_failure_events` - Confirmed failure history
- `failure_predictions` - Active and historical predictions
- `prediction_evidence` - Supporting evidence for predictions
- `prediction_outcomes` - Accuracy tracking
- `prediction_feedback` - Operator feedback
- `branch_risk_scores` - Branch reliability scores
- `prediction_models` - Model configurations
- `prediction_runs` - Execution tracking
- `maintenance_interventions` - Preventive actions
- `risk_suppression_rules` - Operator exceptions

**Calibration & Integration Tables:**
- `prediction_calibration_history` - Historical accuracy metrics
- `prediction_misprediction_log` - Incorrect predictions for learning
- `rca_cases` - RCA results linked to predictions

**Views:**
- `active_predictions_summary` - Real-time overview
- `branch_risk_summary` - Branch-level aggregation
- `prediction_accuracy_metrics` - Performance tracking

### Scheduled Jobs (3 jobs)

1. **PredictionGenerationJob** - Hourly prediction generation
2. **TelemetrySyncJob** - Health data sync every 5 minutes
3. **NotificationJob** - Alert processing every 10 minutes

### 2. Core Services

#### FailurePredictionEngine Service
**File:** `backend/src/services/failure-prediction-engine.service.ts`

**Features:**
- Rules-based prediction for 6 device types
- Configurable threshold system
- Evidence collection and tracking
- Probability calculation and risk classification
- Time-to-failure estimation

**Prediction Methods:**
- `predictRecorderFailure()` - Temperature, reboots, latency, heartbeat analysis
- `predictDiskFailure()` - SMART metrics, temperature, health score degradation
- `predictNetworkFailure()` - Packet loss, latency, WAN disconnections
- `predictCameraFailure()` - RTSP disconnects, frame loss, response time
- `predictUpsFailure()` - Battery health, runtime, load percentage
- `predictStorageRetentionFailure()` - Retention compliance forecasting

#### TelemetryFeatureExtractionService
**File:** `backend/src/services/telemetry-feature-extraction.service.ts`

**Features:**
- Moving averages (7-day, 30-day)
- Trend slope calculation (linear regression)
- Statistical metrics (std dev, variance, min/max)
- Device-specific feature extraction
- Hourly batch processing

#### BranchRiskAggregationService
**File:** `backend/src/services/branch-risk-aggregation.service.ts`

**Features:**
- Weighted component risk scoring
- Overall branch reliability score (0-100)
- Top risk identification
- Actionable recommendations
- Risk classification (Monitor → Imminent Failure)

**Component Weights:**
- Recorder: 30% (most critical)
- Storage: 25%
- Network: 20%
- Power/UPS: 15%
- Camera: 5%
- Compliance: 5%

### 3. RESTful API Endpoints
**File:** `backend/src/routes/prediction-api.routes.ts`

**Endpoints Implemented:**

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/predictions/branches` | List all predictions with filtering |
| GET | `/v1/predictions/branches/:branchId` | Branch-specific predictions |
| GET | `/v1/predictions/devices/:deviceId` | Device-specific predictions |
| GET | `/v1/predictions/imminent` | Failures expected within 24 hours |
| GET | `/v1/predictions/retention-risk` | Storage retention risks |
| GET | `/v1/predictions/network-risk` | Network connectivity risks |
| GET | `/v1/predictions/storage-risk` | Disk and storage risks |
| POST | `/v1/predictions/:id/acknowledge` | Acknowledge prediction |
| POST | `/v1/predictions/:id/create-work-order` | Create maintenance ticket |
| POST | `/v1/predictions/:id/feedback` | Record operator feedback |
| GET | `/v1/predictions/model-performance` | Accuracy metrics |

**Features:**
- Authentication and tenant isolation
- User scope enforcement (branch/region filtering)
- Pagination support
- Evidence embedding
- Automatic work order creation


## 4. Scheduled Jobs

### Prediction Generation Job
**File:** `backend/src/jobs/prediction-generation.job.ts`

**Features:**
- Runs hourly for all tenants
- Extracts telemetry features
- Generates predictions
- Calculates branch risk scores
- Expires old predictions
- Tracks execution metrics

**Execution Flow:**
1. Extract features from telemetry
2. Generate predictions using rules engine
3. Store/update predictions in database
4. Calculate branch risk scores
5. Expire predictions past failure window
6. Log performance metrics

## 5. Frontend Components

### Predictive Operations Dashboard
**File:** `frontend/src/components/predictions/PredictiveOperationsDashboard.tsx`

**Features:**
- Real-time prediction overview
- Summary metrics (24h, 3d, critical branches, cameras affected)
- Filtering by risk level, prediction type, time window
- Priority table with sortable columns
- Quick actions (acknowledge, create work order)
- Auto-refresh every 5 minutes

**Dashboard Metrics:**
- Predictions in next 24 hours
- Predictions in next 3 days
- Branches at critical risk
- Cameras potentially affected
- Compliance risks
- Preventable failures

## 🚧 Integration Features (All Complete - 100%)

### ✅ Task #12: Prediction Detail View (COMPLETE)
**File:** `frontend/src/components/predictions/PredictionDetailView.tsx`
**Features:** Evidence visualization, trend graphs, impact assessment, action buttons, feedback modal

### ✅ Task #13: Branch Risk Score Visualization (COMPLETE)
**File:** `frontend/src/components/predictions/BranchRiskScoreWidget.tsx`
**Features:** Radial/bar charts, component breakdown, trend indicators, recommendations, auto-refresh

### ✅ Task #14: Digital Twin Integration (COMPLETE)
**Files:** 
- `backend/src/services/digital-twin-prediction-integration.service.ts`
- API endpoints: `/v1/predictions/digital-twin/...`

**Features:**
- Device risk indicators with visual styling (pulsing red, orange warning, yellow countdown)
- Branch risk overlay for map visualization
- Real-time risk status via existing spatial alert system
- Risk badge animations (pulsing, blinking, steady)
- Device-level prediction popovers on selection

**Visual Indicators:**
- 🔴 **Imminent** (>95% probability): Red with pulsing animation
- ⚠️ **Critical** (80-95%): Orange with blinking animation
- ⚡ **High** (65-80%): Yellow/amber with steady glow
- 📊 **Emerging** (40-65%): Blue with no animation
- 👁️ **Monitor** (<40%): Gray with no animation

### ✅ Task #15: AI Command Center Integration (COMPLETE)
**File:** `backend/src/services/ai-command-center-prediction.service.ts`
**API Endpoint:** `POST /v1/predictions/ai-query`

**Natural Language Query Support:**
- "Which branches are most likely to fail tomorrow?"
- "What's the risk for Branch 183?"
- "Show me all critical predictions"
- "Which recorders need immediate attention?"
- "How accurate have disk failure predictions been?"
- "What should I do first?"

**Query Intents Supported:**
- `list_predictions` - List predictions with smart filtering
- `branch_risk` - Get branch reliability assessment
- `device_risk` - Get device-specific risk details
- `prediction_accuracy` - Show calibration metrics
- `recommendations` - Get prioritized action list
- `top_risks` - Show most critical predictions

**Response Format:**
- Natural language answer
- Structured data payload
- Actionable recommendations
- Follow-up question suggestions

### ✅ Task #18: RCA Feedback Loop (COMPLETE)
**File:** `backend/src/services/prediction-rca-integration.service.ts`
**Database Tables:** `prediction_misprediction_log`, `rca_cases`

**Features:**
- Automatic RCA triggering when predicted failure occurs
- Comparison of prediction evidence with RCA findings
- Prediction outcome classification (true positive, false positive, false negative, prevented)
- Evidence alignment scoring
- Misprediction analysis and logging
- Rule adjustment recommendations
- Feedback to calibration service for model improvement
- Maintenance intervention tracking

**Workflow:**
```
Device Failure → Find Active Predictions → Trigger RCA → Compare Evidence → 
Record Outcome → Analyze Misprediction → Update Model Metrics → Adjust Rules
```

**Outcome Types:**
- **True Positive**: Prediction correct, failure occurred in window
- **False Positive**: Prediction incorrect, no failure or wrong cause
- **False Negative**: Failure occurred but was not predicted
- **Prevented**: Maintenance performed successfully, failure avoided


## 📊 Implementation Progress

**Overall: 20/20 tasks completed (100%) ✅**

**Backend Core:** ✅ 100% Complete
- Database schema (15 tables, 3 views)
- 9 Prediction services
- 20 API endpoints
- Scheduled jobs
- Telemetry sync
- Notification system
- Calibration service
- RCA integration
- Digital Twin integration
- AI Command Center integration

**Frontend:** ✅ 100% Complete
- Main dashboard with metrics and filtering
- Prediction detail view with evidence graphs
- Branch risk score visualization with charts

**Integration:** ✅ 100% Complete
- API integration complete
- Telemetry collectors integrated
- Notification system integrated
- Maintenance workflow integrated
- RCA feedback loop implemented
- Digital Twin visual indicators implemented
- AI Command Center natural language queries implemented

## 🚀 Quick Start Guide

### 1. Database Migration
```bash
psql -U postgres -d sentinel_grid -f database/migrations/042_predictive_branch_failure.sql
```

### 2. Backend Setup
```typescript
// In backend/src/index.ts or app.ts
import { initializePredictionJob } from './jobs/prediction-generation.job.js';
import createPredictionApiRoutes from './routes/prediction-api.routes.js';

// Register API routes
app.use('/api/v1/predictions', createPredictionApiRoutes(pool));

// Start scheduled job
const predictionJobInterval = initializePredictionJob(pool);

// Cleanup on shutdown
process.on('SIGTERM', () => {
  clearInterval(predictionJobInterval);
});
```

### 3. Frontend Integration
```typescript
// In frontend routing
import PredictiveOperationsDashboard from './components/predictions/PredictiveOperationsDashboard';

// Add route
<Route path="/predictions" element={<PredictiveOperationsDashboard />} />
```

### 4. Manual Prediction Generation
```bash
curl -X POST http://localhost:3000/api/v1/predictions/generate \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 📈 Usage Examples

### Get All Predictions
```bash
GET /api/v1/predictions/branches?riskLevel=critical_risk&limit=50
```

### Get Imminent Failures
```bash
GET /api/v1/predictions/imminent
```

### Acknowledge Prediction
```bash
POST /api/v1/predictions/:predictionId/acknowledge
```

### Create Work Order
```bash
POST /api/v1/predictions/:predictionId/create-work-order
Content-Type: application/json

{
  "scheduledAt": "2026-08-02T10:00:00+05:30",
  "notes": "Urgent maintenance required"
}
```

### Model Performance
```bash
GET /api/v1/predictions/model-performance?days=90&predictionType=recorder_failure
```

## 🔧 Configuration

### Prediction Thresholds
Edit `backend/src/services/failure-prediction-engine.service.ts`:

```typescript
const DEFAULT_CONFIG: PredictionConfig = {
  recorderTempIncreaseCelsius: 25,
  recorderRebootThreshold: 3,
  diskTempThresholdCelsius: 55,
  networkPacketLossPercent: 8,
  // ... adjust thresholds per deployment
};
```

### Job Schedule
Edit `backend/src/jobs/prediction-generation.job.ts`:

```typescript
// Change from 1 hour to 30 minutes
const interval = setInterval(() => {
  job.execute();
}, 30 * 60 * 1000); // 30 minutes
```

## 🎯 Key Features Implemented

✅ **Rules-Based Prediction Engine**
- 6 device types supported
- Configurable thresholds
- Evidence-based predictions
- Time-to-failure estimation

✅ **Branch Risk Scoring**
- Weighted component aggregation
- Risk classification (Monitor → Imminent)
- Top risk identification
- Actionable recommendations

✅ **Comprehensive APIs**
- 11 RESTful endpoints
- Filtering and pagination
- Authentication and authorization
- Tenant isolation

✅ **Frontend Dashboard**
- Real-time metrics
- Priority table
- Filtering options
- Quick actions

✅ **Automated Processing**
- Hourly prediction generation
- Feature extraction
- Risk score calculation
- Old prediction expiration

## 🔮 Deployment Guide

### 1. Database Setup
```bash
# Run the comprehensive migration
psql -U postgres -d sentinel_grid -f database/migrations/042_predictive_branch_failure.sql

# Run notification schema
psql -U postgres -d sentinel_grid -f database/migrations/043_prediction_notifications.sql
```

### 2. Backend Integration

Add to `backend/src/index.ts` or main application file:

```typescript
import { initializePredictionJob } from './jobs/prediction-generation.job.js';
import { initializeTelemetrySyncJob } from './services/telemetry-sync.service.js';
import { initializeNotificationJob } from './services/prediction-notification.service.js';
import createPredictionApiRoutes from './routes/prediction-api.routes.js';

// Register API routes
app.use('/api/v1/predictions', createPredictionApiRoutes(pool));

// Start scheduled jobs
const predictionJobInterval = initializePredictionJob(pool);
const telemetrySyncInterval = initializeTelemetrySyncJob(pool);
const notificationInterval = initializeNotificationJob(pool);

// Cleanup on shutdown
process.on('SIGTERM', () => {
  clearInterval(predictionJobInterval);
  clearInterval(telemetrySyncInterval);
  clearInterval(notificationInterval);
});
```

### 3. Frontend Integration

Add to routing configuration:

```typescript
import PredictiveOperationsDashboard from './components/predictions/PredictiveOperationsDashboard';
import PredictionDetailView from './components/predictions/PredictionDetailView';
import BranchRiskScoreWidget from './components/predictions/BranchRiskScoreWidget';

// Add routes
<Route path="/predictions" element={<PredictiveOperationsDashboard />} />

// Embed risk widget in branch view
<BranchRiskScoreWidget branchId={branchId} showDetails={true} />
```

### 4. Digital Twin Integration

In your Digital Twin rendering code:

```typescript
// Fetch risk indicators
const response = await fetch(`/api/v1/predictions/digital-twin/branches/${branchId}/risk-indicators`);
const { data: indicators } = await response.json();

// Apply visual styling to devices
indicators.forEach(indicator => {
  const device = getDeviceElement(indicator.deviceId);
  device.style.borderColor = indicator.visualStyle.color;
  
  if (indicator.visualStyle.animation === 'pulsing') {
    device.classList.add('pulse-animation');
  }
  
  // Add risk badge
  device.badge = indicator.visualStyle.badge;
});

// Show branch risk overlay
const overlay = await fetch(`/api/v1/predictions/digital-twin/branches/${branchId}/risk-overlay`);
mapView.setOverlay({
  color: overlay.riskColor,
  opacity: 0.3
});
```

### 5. AI Command Center Integration

In your AI Command Center query handler:

```typescript
// Check if query is prediction-related
const predictionKeywords = ['predict', 'fail', 'risk', 'likely', 'branch health', 'accuracy'];
const isPredictionQuery = predictionKeywords.some(kw => question.toLowerCase().includes(kw));

if (isPredictionQuery) {
  const response = await fetch('/api/v1/predictions/ai-query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question })
  });
  
  const { data: aiResponse } = await response.json();
  return aiResponse; // { answer, data, recommendations, nextQuestions }
}
```

### 6. RCA Integration

Hook into your existing failure detection:

```typescript
import { PredictionRcaIntegrationService } from './services/prediction-rca-integration.service.js';

// When device failure detected
const rcaService = new PredictionRcaIntegrationService(pool);

await rcaService.handleDeviceFailure({
  deviceId: 'recorder-123',
  deviceType: 'recorder',
  branchNodeId: 'branch-uuid',
  failureType: 'recorder_failure',
  failureTimestamp: new Date(),
  severity: 'critical',
  metadata: { /* failure details */ }
});

// When maintenance performed
await rcaService.handleMaintenanceIntervention(
  predictionId,
  new Date(),
  'Replaced recorder'
);
```

### 7. Environment Configuration

Add to `.env`:

```bash
# Prediction Configuration
PREDICTION_GENERATION_INTERVAL_MINUTES=60
TELEMETRY_SYNC_INTERVAL_MINUTES=5
NOTIFICATION_CHECK_INTERVAL_MINUTES=10

# Notification Channels
NOTIFICATION_EMAIL_ENABLED=true
NOTIFICATION_SMS_ENABLED=true
NOTIFICATION_WEBHOOK_ENABLED=true

# Calibration Thresholds
PREDICTION_MIN_ACCURACY_THRESHOLD=0.60
PREDICTION_MAX_FPR_THRESHOLD=0.30

# RCA Integration
RCA_AUTO_TRIGGER_ON_FAILURE=true
RCA_FEEDBACK_LOOP_ENABLED=true
```

### 8. Verification Steps

After deployment:

1. **Check database tables:**
```sql
SELECT COUNT(*) FROM device_health_snapshots;
SELECT COUNT(*) FROM failure_predictions;
SELECT COUNT(*) FROM branch_risk_scores;
```

2. **Trigger manual prediction generation:**
```bash
curl -X POST http://localhost:3000/api/v1/predictions/generate \
  -H "Authorization: Bearer YOUR_TOKEN"
```

3. **Check prediction job logs:**
```bash
# Look for:
# - "Prediction generation started"
# - "Generated X predictions for tenant Y"
# - "Branch risk scores updated"
```

4. **Verify frontend access:**
Navigate to `/predictions` and confirm dashboard loads with metrics.

5. **Test AI queries:**
```bash
curl -X POST http://localhost:3000/api/v1/predictions/ai-query \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"question": "Which branches are most likely to fail tomorrow?"}'
```

6. **Check Digital Twin integration:**
Open branch map and verify risk indicators appear on devices.

### 9. Monitoring

Track these metrics in production:

- **Prediction volume:** Predictions generated per hour
- **Accuracy metrics:** Precision, recall, F1-score per prediction type
- **False positive rate:** Should stay below 30%
- **Lead time:** Average hours of advance warning
- **Prevention rate:** Percentage of failures prevented by maintenance
- **API performance:** Response times for prediction endpoints
- **Job execution:** Completion time for hourly prediction generation

### 10. Troubleshooting

**No predictions being generated:**
- Check telemetry sync job is running
- Verify device_health_snapshots table is being populated
- Check prediction_runs table for error messages

**High false-positive rate:**
- Review prediction thresholds via `/model-performance/threshold-recommendations`
- Check calibration curves for probability alignment
- Review misprediction log for patterns

**Digital Twin not showing risk indicators:**
- Verify API endpoint returns data: `/digital-twin/branches/:id/risk-indicators`
- Check frontend console for errors
- Ensure CSS animations are loaded

**AI queries not working:**
- Test direct API call to `/ai-query`
- Check query parsing logs for intent detection
- Verify user has access to branch data

## 📝 Architecture Decisions

### Why Rules-Based First?
- **Explainability:** Easy to understand why predictions are made
- **No Training Data Required:** Works immediately without historical failures
- **Fast Implementation:** Delivered in single iteration
- **Auditable:** Clear rules for compliance requirements
- **Foundation:** Easy to layer ML models on top later

### Why Hourly Generation?
- Balance between freshness and system load
- Predictions have 12-24 hour windows minimum
- Allows time for telemetry aggregation
- Can be adjusted per deployment needs

### Why Weighted Branch Scores?
- Recorder failures affect all cameras (30% weight)
- Storage failures affect retention (25% weight)
- Network affects connectivity but not recording (20% weight)
- Reflects real-world business impact

## 🎓 Prediction Model Details

### Recorder Failure Rules
```
IF temperature_increase >= 25°C (over 7 days)
AND reboots >= 3 (in 7 days)
AND write_latency_increase >= 200%
AND missed_heartbeats >= 5 (in 24 hours)
THEN probability = 0.8-0.98, risk = critical
```

### Disk Failure Rules
```
IF reallocated_sectors_increasing (3 consecutive days)
AND disk_temperature > 55°C
AND write_latency_increase >= 150%
AND (pending_sectors > 0 OR uncorrectable_sectors > 0)
THEN probability = 0.85-0.95, risk = critical
```

### Network Failure Rules
```
IF packet_loss >= 8%
AND latency_increase >= 150%
AND wan_disconnects >= 11 (in 48 hours)
AND backup_isp_unavailable = true
THEN probability = 0.75-0.90, risk = high
```

## 📚 Related Documentation

- Requirements: `.kiro/specs/predictive-branch-failure/requirements.md`
- Database Schema: `database/migrations/042_predictive_branch_failure.sql`
- API Documentation: See inline JSDoc in `prediction-api.routes.ts`
- Service Documentation: See inline comments in service files

## 🤝 Contributing

To extend prediction capabilities:

1. Add new device type to `FailurePredictionEngine`
2. Create prediction method following existing pattern
3. Add evidence collection logic
4. Update API routes if needed
5. Add frontend visualization
6. Document prediction rules

## 📞 Support

For questions or issues:
- Review inline code documentation
- Check prediction_runs table for execution logs
- Monitor prediction_accuracy_metrics view
- Review evidence in prediction_evidence table
