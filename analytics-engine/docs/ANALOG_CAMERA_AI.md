# Analog Camera AI Features

Comprehensive AI analytics for analog, HD-analog, and mixed camera deployments.

## Overview

**Almost every AI feature in Sentinel Grid works with analog cameras** because the AI analyzes the video stream, not whether the camera is analog or IP.

The architecture is:

```
Analog Camera
      │
Coax Cable
      │
DVR/XVR
      │
RTSP Stream
      │
Sentinel AI Engine
      │
AI Analytics
```

Once the DVR provides an RTSP/ONVIF stream, the AI treats it exactly like an IP camera.

## AI Features

### 1. Analog Video Quality Detection

**Endpoint**: `GET /v1/analog/quality/:cameraId`

Detects analog camera video artifacts and quality issues:

- ✅ Snow/Noise
- ✅ Rolling lines
- ✅ Signal loss
- ✅ Ghosting
- ✅ Color distortion
- ✅ Weak signal
- ✅ Blur/Defocus
- ✅ Dirty lens
- ✅ Water drops
- ✅ Cobwebs
- ✅ Interlacing artifacts
- ✅ Frozen frames
- ✅ Blank screens

**Example Response**:
```json
{
  "cameraId": "camera-123",
  "qualityScore": 75,
  "degradationTrend": "stable",
  "currentMetrics": {
    "brightness": 128.5,
    "contrast": 42.3,
    "sharpness": 35.2,
    "noise": 12.5,
    "colorSaturation": 65.4,
    "blockiness": 8.2,
    "interlacing": 3.1
  },
  "currentIssues": [
    {
      "type": "weak-signal",
      "severity": "medium",
      "confidence": 0.75,
      "description": "Weak analog signal with visible noise"
    }
  ],
  "consecutiveIssueFrames": 3,
  "frozenFrameCount": 0
}
```

### 2. Camera Aging & Health Prediction

**Endpoints**:
- `GET /v1/analog/aging/:cameraId` - Get aging metrics
- `GET /v1/analog/aging/:cameraId/recommendations` - Get maintenance recommendations
- `GET /v1/analog/aging/priority` - Get all cameras sorted by replacement priority

Predicts camera failure risk and provides maintenance recommendations:

- Camera age estimation
- Failure risk prediction (0-100%)
- Health degradation tracking
- Maintenance recommendations
- Replacement priority scoring

**Example Response**:
```json
{
  "estimatedAgeYears": 9.2,
  "failureRiskScore": 82,
  "healthScore": 35,
  "degradationRate": 8.5
}
```

**Maintenance Recommendations**:
```json
{
  "cameraId": "camera-123",
  "count": 2,
  "recommendations": [
    {
      "priority": "critical",
      "action": "Replace camera immediately",
      "estimatedCostUSD": 150,
      "urgencyDays": 7,
      "reason": "Camera age: 9.2 years, failure risk: 82%"
    },
    {
      "priority": "high",
      "action": "Check cable connections and signal quality",
      "estimatedCostUSD": 75,
      "urgencyDays": 30,
      "reason": "12 signal dropout events detected"
    }
  ]
}
```

### 3. Camera Type Classification

**Endpoints**:
- `GET /v1/analog/classification/:cameraId` - Get camera classification
- `GET /v1/analog/classification` - Get all camera classifications

Automatically classifies cameras and estimates AI performance:

- **Camera Types**: Standard Analog, HD-Analog (HD-TVI/HD-CVI/AHD), IP Camera
- **Resolution Detection**: Automatic resolution estimation
- **AI Accuracy Estimation**: Predicts AI performance based on camera type and quality
- **Features Detection**: Night vision, WDR, PTZ, etc.

**Example Response**:
```json
{
  "cameraId": "camera-123",
  "cameraType": "standard-analog",
  "analogStandard": "composite",
  "estimatedResolution": {
    "width": 720,
    "height": 576,
    "megapixels": 0.4
  },
  "signalType": "analog",
  "videoQualityScore": 72,
  "aiAccuracyEstimate": 70,
  "features": {
    "nightVision": true,
    "wdr": false,
    "colorMode": "day-night",
    "ptz": false
  },
  "connectionType": "dvr-channel"
}
```

### 4. AI Upgrade Advisor ⭐⭐⭐⭐⭐

**Endpoints**:
- `GET /v1/analog/upgrade/:cameraId?location=entrance` - Get upgrade recommendation for specific camera
- `GET /v1/analog/upgrade/recommendations?priority=high` - Get all recommendations (filtered)
- `GET /v1/analog/upgrade/summary` - Get upgrade summary and ROI analysis
- `POST /v1/analog/upgrade/plan` - Generate upgrade plan within budget

Strategic camera upgrade recommendations with ROI analysis:

**Example Recommendation**:
```json
{
  "cameraId": "camera-entrance-1",
  "currentType": "standard-analog",
  "currentResolution": { "width": 720, "height": 576, "megapixels": 0.4 },
  "currentAiAccuracy": 68,
  "recommendedUpgrade": {
    "type": "ip-camera",
    "resolution": { "width": 2560, "height": 1920, "megapixels": 5.0 },
    "estimatedAiAccuracy": 95,
    "estimatedCostUSD": 150
  },
  "roi": {
    "accuracyGainPercent": 27,
    "costEffectiveness": "high",
    "priority": "high",
    "paybackMonths": 11
  },
  "reason": "Standard analog camera at critical location (entrance) with 68% AI accuracy. Upgrading to 5MP IP camera will improve accuracy to 95% for face recognition and ANPR."
}
```

**Upgrade Summary**:
```json
{
  "totalCameras": 45,
  "needsUpgrade": 28,
  "highPriorityUpgrades": 8,
  "mediumPriorityUpgrades": 15,
  "totalEstimatedCostUSD": 3450,
  "averageAccuracyGain": 22,
  "breakdown": {
    "standardAnalog": 18,
    "hdAnalog": 15,
    "ipCamera": 12
  }
}
```

**Generate Upgrade Plan within Budget**:
```bash
POST /v1/analog/upgrade/plan
{
  "cameraIds": ["cam-1", "cam-2", "cam-3", "cam-4", "cam-5"],
  "budget": 500,
  "prioritizeCritical": true
}
```

Response:
```json
{
  "cameraCount": 5,
  "upgradesRecommended": 3,
  "totalCostUSD": 480,
  "budgetRemaining": 20,
  "avgAccuracyGain": 25,
  "upgrades": [
    { "cameraId": "cam-1", "priority": "high", "cost": 150, "accuracyGain": 27 },
    { "cameraId": "cam-3", "priority": "high", "cost": 150, "accuracyGain": 25 },
    { "cameraId": "cam-5", "priority": "medium", "cost": 180, "accuracyGain": 23 }
  ]
}
```

### 5. DVR Channel Health Monitoring

**Endpoints**:
- `GET /v1/analog/dvr/channel/:channelId` - Get channel status
- `GET /v1/analog/dvr/channels?status=error` - Get all channels (filtered)
- `GET /v1/analog/dvr/:dvrId/health` - Get DVR health summary

Monitors DVR/XVR recorder channel health:

- ✅ Frozen channels
- ✅ Blank channels
- ✅ Wrong camera connected
- ✅ Channel swapping
- ✅ Fake video feed (looping)
- ✅ Intermittent signal
- ✅ Recording failures

**Example Channel Status**:
```json
{
  "channelId": "channel-04",
  "cameraId": "camera-atm-1",
  "dvrId": "dvr-1",
  "status": "error",
  "issues": [
    {
      "type": "intermittent",
      "severity": "medium",
      "detectedAt": "2026-08-02T10:30:45Z",
      "description": "DVR channel channel-04 experiencing intermittent signal",
      "autoResolved": false
    }
  ],
  "lastFrameAt": "2026-08-02T10:35:12Z",
  "consecutiveFailures": 0,
  "recordingStatus": "unknown",
  "storageStatus": "ok"
}
```

**DVR Health Summary**:
```json
{
  "dvrId": "dvr-1",
  "totalChannels": 16,
  "healthyChannels": 12,
  "warningChannels": 2,
  "errorChannels": 2,
  "offlineChannels": 0,
  "totalIssues": 4,
  "channels": [...]
}
```

### 6. Comprehensive Dashboard

**Endpoint**: `GET /v1/analog/dashboard`

Single endpoint for complete analog camera analytics:

```json
{
  "summary": {
    "totalCameras": 45,
    "standardAnalog": 18,
    "hdAnalog": 15,
    "ipCamera": 12,
    "avgAiAccuracy": 82
  },
  "qualityIssues": {
    "count": 8,
    "cameras": [...]
  },
  "aging": {
    "criticalRisk": 5,
    "highRisk": 8,
    "topPriority": [...]
  },
  "upgrades": {
    "totalCameras": 45,
    "needsUpgrade": 28,
    "highPriorityUpgrades": 8,
    "totalEstimatedCostUSD": 3450
  },
  "dvrHealth": {
    "totalChannels": 48,
    "healthy": 40,
    "warning": 4,
    "error": 2,
    "offline": 2
  }
}
```

## AI Accuracy by Camera Type

| Camera Type | Resolution | AI Accuracy | Face Recognition | ANPR | Notes |
|-------------|-----------|-------------|------------------|------|-------|
| **Standard Analog** | 720×576 (D1) | 70% | ⚠️ Limited | ⚠️ Limited | Good for basic detection |
| **Standard Analog** | 960×576 (960H) | 73% | ⚠️ Limited | ⚠️ Limited | Slightly better |
| **HD-Analog (720p)** | 1280×720 | 85% | ✅ Good | ✅ Good | HD-TVI/HD-CVI/AHD |
| **HD-Analog (1080p)** | 1920×1080 | 90% | ✅ Excellent | ✅ Excellent | Best HD-analog |
| **IP Camera (2MP)** | 1920×1080 | 90% | ✅ Excellent | ✅ Excellent | Digital quality |
| **IP Camera (5MP)** | 2560×1920 | 95% | ✅ Excellent | ✅ Excellent | Recommended |
| **IP Camera (8MP)** | 3840×2160 | 95% | ✅ Excellent | ✅ Excellent | 4K quality |

## Banking-Specific Use Cases

### ATM Monitoring
All work with analog cameras via DVR:
- ✅ Person loitering near ATM
- ✅ ATM queue detection
- ✅ ATM crowding
- ✅ Mask detection
- ✅ ATM vandalism detection
- ✅ Cash loading monitoring
- ✅ Unauthorized access

### Cash Counter AI
- ✅ Occupancy tracking
- ✅ Queue length
- ✅ Customer waiting time
- ✅ Employee absence detection
- ✅ Suspicious behaviour
- ✅ After-hours movement

### Vault Monitoring
- ✅ Vault door opened
- ✅ Unauthorized entry
- ✅ Multiple persons entering
- ✅ Restricted-area access

## Integration Examples

### 1. Get Camera Quality Issues

```bash
GET /v1/analog/quality/issues
```

Returns all cameras with quality issues, sorted by severity.

### 2. Plan Budget-Conscious Upgrade

```bash
POST /v1/analog/upgrade/plan
{
  "cameraIds": ["cam-1", "cam-2", ... "cam-50"],
  "budget": 5000,
  "prioritizeCritical": true
}
```

Automatically selects highest-priority cameras within budget.

### 3. Monitor DVR Health

```bash
GET /v1/analog/dvr/channels?status=error
```

Get all channels with errors for immediate attention.

### 4. Track Camera Aging

```bash
GET /v1/analog/aging/priority
```

Get all cameras sorted by replacement priority for proactive maintenance.

## Key Value Propositions

### 1. **Legacy Analog AI Enhancement** ⭐⭐⭐⭐⭐

Organizations with hundreds of legacy analog cameras can:
- ✅ Gain AI capabilities immediately
- ✅ Upgrade only cameras where higher resolution materially improves outcomes
- ✅ Save costs by avoiding unnecessary upgrades
- ✅ Get ROI analysis for every camera

### 2. **Gradual Modernization**

The platform tells customers:
```
Branch 183
16 Analog Cameras
AI Accuracy: 73%

Recommendation:
Replace ONLY Entrance Camera
With 5MP IP Camera

AI Accuracy: 95%
Estimated Cost: ₹8,500
Priority: High
```

This lets customers modernize gradually instead of replacing every camera.

### 3. **Proactive Maintenance**

- Predict camera failures before they happen
- Track video quality degradation
- Schedule maintenance based on actual need
- Reduce downtime with early warnings

### 4. **Comprehensive Monitoring**

Single API for:
- Video quality
- Camera health
- DVR channel status
- Upgrade recommendations
- AI accuracy tracking

## Configuration

### Environment Variables

```bash
# Enable analog camera features
ENABLE_ANALOG_VIDEO_QUALITY=true
ENABLE_CAMERA_AGING_PREDICTION=true
ENABLE_CAMERA_TYPE_CLASSIFIER=true
ENABLE_DVR_CHANNEL_HEALTH=true

# Quality thresholds
ANALOG_NOISE_THRESHOLD_LOW=15
ANALOG_NOISE_THRESHOLD_HIGH=30
ANALOG_SHARPNESS_THRESHOLD=20

# Aging thresholds
CAMERA_HIGH_RISK_AGE_YEARS=7
CAMERA_CRITICAL_RISK_AGE_YEARS=10
CAMERA_DEGRADATION_THRESHOLD=5

# Upgrade recommendations
UPGRADE_PRIORITIZE_CRITICAL_LOCATIONS=true
```

## Performance

- **Video Quality Analysis**: ~5ms per frame
- **Aging Prediction**: ~1ms per frame
- **Type Classification**: ~2ms per frame (after sampling)
- **DVR Channel Health**: ~3ms per frame

All detectors run in parallel with existing AI analytics with minimal overhead.

## Supported DVR/XVR Systems

The system works with any DVR/XVR that provides RTSP streams:

- ✅ Hikvision DVR/XVR
- ✅ Dahua XVR/HCVR
- ✅ CP Plus DVR
- ✅ Uniview NVR/XVR
- ✅ Samsung DVR
- ✅ Generic ONVIF DVRs

## Recommendations

### For New Deployments
1. Use IP cameras where AI accuracy is critical (entrances, ATMs, vaults)
2. Use HD-analog cameras for general surveillance (hallways, parking)
3. Keep standard analog only where basic motion detection suffices

### For Existing Deployments
1. Run classification and upgrade advisor
2. Replace standard analog cameras at critical locations first
3. Upgrade to HD-analog for cost-effective improvement
4. Monitor aging and quality to plan proactive replacements

### Critical Locations (High Priority for Upgrade)
- Entrance/Exit
- ATM
- Vault
- Cash Counter
- Teller Windows
- Main Lobby
- Reception

### Non-Critical Locations (Can Keep Analog)
- Back Office
- Hallways
- Parking Lot (except entrance)
- Storage Areas
- Break Rooms

## Report Generation

```bash
GET /v1/analog/report?format=json&includeQuality=true&includeAging=true&includeUpgrades=true
```

Generates comprehensive report including:
- Quality analysis for all cameras
- Aging analysis and replacement priorities
- Upgrade recommendations with ROI
- DVR channel health status
- Cost estimates and timelines

## Future Enhancements

Planned features:
- [ ] Analog cable health prediction (signal degradation analysis)
- [ ] DVR recording optimization recommendations
- [ ] Automatic camera swap detection
- [ ] Integration with DVR APIs for storage and recording status
- [ ] CSV export for reports
- [ ] Scheduled maintenance alerts
- [ ] Multi-site comparison dashboards

## Support

For issues or questions:
- API Documentation: `/v1/analog/dashboard`
- Health Check: `/health` (includes analog detector status)
- Logs: Check `analytics-engine` service logs

## License

Copyright © 2026 Sentinel Grid. All rights reserved.
