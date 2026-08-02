# Analog Camera AI - Quick Reference

## Quick Start

```bash
# Get comprehensive dashboard
GET /v1/analog/dashboard

# Get quality issues
GET /v1/analog/quality/issues

# Get upgrade recommendations
GET /v1/analog/upgrade/summary

# Get cameras needing replacement
GET /v1/analog/aging/priority
```

## Common API Calls

### 1. Check Camera Quality
```bash
curl http://localhost:3000/v1/analog/quality/camera-123
```

### 2. Get Upgrade Recommendation
```bash
curl "http://localhost:3000/v1/analog/upgrade/camera-123?location=entrance"
```

### 3. Generate Upgrade Plan
```bash
curl -X POST http://localhost:3000/v1/analog/upgrade/plan \
  -H "Content-Type: application/json" \
  -d '{
    "cameraIds": ["cam-1", "cam-2", "cam-3"],
    "budget": 1000,
    "prioritizeCritical": true
  }'
```

### 4. Check DVR Health
```bash
curl http://localhost:3000/v1/analog/dvr/dvr-1/health
```

### 5. Get Maintenance Recommendations
```bash
curl http://localhost:3000/v1/analog/aging/camera-123/recommendations
```

## Response Examples

### Quality Status
```json
{
  "qualityScore": 75,
  "degradationTrend": "stable",
  "currentIssues": [
    {
      "type": "weak-signal",
      "severity": "medium",
      "description": "Weak analog signal with visible noise"
    }
  ]
}
```

### Upgrade Recommendation
```json
{
  "currentType": "standard-analog",
  "currentAiAccuracy": 68,
  "recommendedUpgrade": {
    "type": "ip-camera",
    "estimatedAiAccuracy": 95,
    "estimatedCostUSD": 150
  },
  "roi": {
    "accuracyGainPercent": 27,
    "priority": "high",
    "costEffectiveness": "high"
  }
}
```

### Aging Metrics
```json
{
  "estimatedAgeYears": 9.2,
  "failureRiskScore": 82,
  "healthScore": 35,
  "degradationRate": 8.5
}
```

## Key Metrics

### Quality Metrics
- `qualityScore`: 0-100 (higher is better)
- `noise`: 0-50+ (lower is better)
- `sharpness`: 0-50+ (higher is better)
- `contrast`: 0-50+ (higher is better)

### Aging Metrics
- `failureRiskScore`: 0-100 (lower is better)
- `healthScore`: 0-100 (higher is better)
- `degradationRate`: Quality decline per month

### AI Accuracy by Type
- Standard Analog: ~70%
- HD-Analog (720p): ~85%
- HD-Analog (1080p): ~90%
- IP Camera (2MP+): ~90-95%

## Issue Severity Levels

| Severity | Description | Action Required |
|----------|-------------|-----------------|
| **Critical** | Immediate failure risk | Replace within 7 days |
| **High** | Significant degradation | Replace within 6 months |
| **Medium** | Moderate issues | Schedule inspection |
| **Low** | Minor issues | Monitor |

## Upgrade Priority Logic

**High Priority**:
- Critical locations (entrance, ATM, vault)
- Current accuracy < 70%
- Age > 8 years
- Failure risk > 60%

**Medium Priority**:
- Semi-critical locations
- Current accuracy 70-85%
- Age 5-8 years
- Failure risk 40-60%

**Low Priority**:
- Non-critical locations
- Current accuracy > 85%
- Age < 5 years
- Failure risk < 40%

## Critical Locations

Always prioritize upgrades for:
- Entrance/Exit
- ATM
- Vault
- Cash Counter
- Teller Windows
- Main Lobby
- Reception

## Cost Estimates

| Upgrade Type | Typical Cost (USD) |
|-------------|-------------------|
| Standard Analog → HD-Analog | $80 |
| Standard Analog → IP (2MP) | $120 |
| Standard Analog → IP (5MP) | $150 |
| HD-Analog → IP (5MP) | $120 |
| Cable Repair | $75 |
| Lens Cleaning | $25 |
| Complete Replacement | $200+ |

## DVR Channel Status

| Status | Meaning | Action |
|--------|---------|--------|
| **healthy** | Normal operation | None |
| **warning** | Minor issues | Monitor |
| **error** | Significant issues | Investigate |
| **offline** | No signal | Immediate action |

## Integration Code Examples

### JavaScript/TypeScript
```typescript
// Get dashboard
const response = await fetch('http://localhost:3000/v1/analog/dashboard');
const dashboard = await response.json();

// Get upgrade recommendations with filters
const upgrades = await fetch(
  'http://localhost:3000/v1/analog/upgrade/recommendations?priority=high'
);
const recommendations = await upgrades.json();

// Generate upgrade plan
const plan = await fetch('http://localhost:3000/v1/analog/upgrade/plan', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    cameraIds: ['cam-1', 'cam-2', 'cam-3'],
    budget: 1000,
    prioritizeCritical: true
  })
});
const upgradePlan = await plan.json();
```

### Python
```python
import requests

# Get dashboard
dashboard = requests.get('http://localhost:3000/v1/analog/dashboard').json()

# Get high priority upgrades
upgrades = requests.get(
    'http://localhost:3000/v1/analog/upgrade/recommendations',
    params={'priority': 'high'}
).json()

# Generate upgrade plan
plan = requests.post(
    'http://localhost:3000/v1/analog/upgrade/plan',
    json={
        'cameraIds': ['cam-1', 'cam-2', 'cam-3'],
        'budget': 1000,
        'prioritizeCritical': True
    }
).json()
```

## Monitoring Recommendations

### Daily
- Check `/v1/analog/dashboard` for overview
- Monitor `/v1/analog/quality/issues` for new problems
- Review `/v1/analog/dvr/channels?status=error`

### Weekly
- Review `/v1/analog/aging/priority` for aging trends
- Check `/v1/analog/upgrade/recommendations` for new recommendations
- Generate `/v1/analog/report` for management

### Monthly
- Plan upgrades based on budget
- Review maintenance recommendations
- Update camera installation dates

## Troubleshooting

### Camera Not Classified
**Issue**: `GET /v1/analog/classification/:cameraId` returns 404

**Solution**: The classifier needs at least 3 frame samples. Wait a few seconds for the camera to be analyzed.

### Inaccurate AI Accuracy Estimate
**Issue**: Estimated accuracy doesn't match real-world performance

**Solution**: The estimate is based on resolution and quality. Factors like lighting, camera angle, and lens quality also affect accuracy. Use actual detection results for precise measurements.

### No Upgrade Recommendations
**Issue**: Camera shows "no-upgrade" recommendation

**Solution**: This means the camera is performing adequately for its location. To force an upgrade recommendation, specify a critical location parameter.

### DVR Channel Always Showing "unknown" Recording Status
**Issue**: Recording status shows "unknown"

**Solution**: Direct DVR API integration is not implemented yet. This requires DVR-specific API credentials and access.

## Performance Tips

1. **Batch Queries**: Use `/v1/analog/dashboard` instead of multiple individual calls
2. **Filter Results**: Use query parameters (`?status=error`, `?priority=high`) to reduce payload
3. **Cache Results**: Dashboard data can be cached for 30-60 seconds
4. **Paginate Large Lists**: For deployments with 100+ cameras, implement pagination

## Environment Variables

```bash
# Enable features
ENABLE_ANALOG_VIDEO_QUALITY=true
ENABLE_CAMERA_AGING_PREDICTION=true
ENABLE_CAMERA_TYPE_CLASSIFIER=true
ENABLE_DVR_CHANNEL_HEALTH=true

# Tune thresholds (optional)
ANALOG_NOISE_THRESHOLD_LOW=15
ANALOG_NOISE_THRESHOLD_HIGH=30
CAMERA_HIGH_RISK_AGE_YEARS=7
CAMERA_CRITICAL_RISK_AGE_YEARS=10
```

## Testing Endpoints

```bash
# Health check (includes analog detectors)
GET /health

# Get detector health
GET /v1/detectors/health

# Check specific analog detector
GET /v1/detectors/analog-video-quality/health
GET /v1/detectors/camera-aging/health
GET /v1/detectors/camera-type-classifier/health
GET /v1/detectors/dvr-channel-health/health
```

## Support

For detailed documentation, see:
- `ANALOG_CAMERA_AI.md` - Complete feature documentation
- `ANALOG_AI_IMPLEMENTATION_SUMMARY.md` - Technical implementation details

For issues:
1. Check `/health` endpoint for detector status
2. Review logs for error messages
3. Verify camera streams are providing RTSP feeds
4. Ensure DVR is accessible from analytics engine

---

**Quick Reference Version**: 1.0
**Last Updated**: August 2, 2026
