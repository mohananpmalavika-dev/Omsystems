# Video Analytics Quick Start Guide

## 🚀 Get Started in 5 Minutes

### 1. Start the Analytics Engine

```bash
# Development mode
cd analytics-engine
npm install
npm run dev

# Production mode
docker-compose up -d analytics-engine
```

### 2. Verify Health

```bash
curl http://localhost:8092/health
```

Expected response:
```json
{
  "status": "ok",
  "service": "sentinel-analytics-engine",
  "pipeline": {
    "initialized": true,
    "detectors": {
      "motion": { "status": "healthy" },
      "object": { "status": "healthy" },
      "zone": { "status": "healthy" },
      "camera-health": { "status": "healthy" }
    }
  }
}
```

### 3. Access the Dashboard

Open browser: `http://localhost:3000/analytics`

- Select a branch
- Select a camera
- Click "New rule" to configure detection

### 4. Create Your First Rule

**Example: Detect people in restricted area**

1. Go to `/analytics` in dashboard
2. Select branch and camera
3. Click "New rule"
4. Configure:
   - **Name**: "Person in vault"
   - **Detection**: Person detection
   - **Priority**: P1 (Critical)
   - **Confidence**: 75%
   - **Duration**: 2 seconds
   - **Cooldown**: 60 seconds
   - **Recording**: Create protected incident
   - **Check** "Use line / polygon region"
   - **Zone points**: `0.1,0.1; 0.9,0.1; 0.9,0.9; 0.1,0.9`
5. Click "Create rule"

### 5. Test Detection

Send a test event:

```bash
curl -X POST http://localhost:8092/v1/detect \
  -H "Content-Type: application/json" \
  -H "x-analytics-source-key: development-analytics-source-key-change-me" \
  -d '{
    "tenantId": "your-tenant-id",
    "cameraId": "your-camera-id",
    "sourceEventId": "test-event-1",
    "detectionType": "person",
    "occurredAt": "2026-07-22T10:30:00Z",
    "confidence": 0.85,
    "durationSeconds": 5,
    "modelVersion": "1.0.0",
    "objects": [
      {
        "label": "person",
        "confidence": 0.85,
        "boundingBox": {"x": 0.5, "y": 0.5, "width": 0.15, "height": 0.4}
      }
    ]
  }'
```

### 6. View Alert

1. Go to `/analytics` dashboard
2. Check "Alert Queue" on the right
3. You should see the new alert
4. Click "Acknowledge" to acknowledge it

## 🎯 Common Use Cases

### Intrusion Detection

**Scenario**: Alert when someone enters a restricted area after hours

```javascript
{
  "name": "After-hours vault intrusion",
  "detectionType": "intrusion",
  "severity": "P1",
  "minConfidence": 0.75,
  "objectClasses": ["person"],
  "schedule": {
    "days": [0,1,2,3,4,5,6],
    "start": "18:00",
    "end": "06:00",
    "timezone": "Asia/Kolkata"
  },
  "recipients": ["security@example.com"]
}
```

### Footfall Counting

**Scenario**: Count people entering/exiting through a doorway

```javascript
{
  "name": "Main entrance counter",
  "detectionType": "line-crossing",
  "severity": "P5",
  "minConfidence": 0.70,
  "direction": "any",
  "cooldownSeconds": 2,
  "recordingPolicy": "none"
}
```

### Loitering Detection

**Scenario**: Alert when someone stays near ATM for too long

```javascript
{
  "name": "ATM loitering",
  "detectionType": "loitering",
  "severity": "P3",
  "minConfidence": 0.70,
  "minDurationSeconds": 300, // 5 minutes
  "objectClasses": ["person"]
}
```

### Fire Detection

**Scenario**: Immediate alert on fire or smoke

```javascript
{
  "name": "Fire emergency",
  "detectionType": "fire-smoke",
  "severity": "P1",
  "minConfidence": 0.80,
  "minDurationSeconds": 3,
  "cooldownSeconds": 10,
  "recipients": ["fire-alarm@example.com", "+91234567890"],
  "escalateAfterSeconds": 60
}
```

## 📊 View Analytics

### Metrics Dashboard

Go to: `http://localhost:3000/analytics/dashboard`

**Available Metrics**:
- Total alerts (by severity)
- Footfall trends (entries/exits)
- Average dwell time
- Queue analysis
- Active rules count

**Time Ranges**:
- Last 24 hours
- Last 7 days
- Last 30 days
- Last 90 days

### API Access

```bash
# Get footfall metrics
curl "http://localhost:8080/v1/cameras/{cameraId}/analytics/footfall?from=2026-07-20T00:00:00Z&to=2026-07-22T23:59:59Z"

# Get dwell time
curl "http://localhost:8080/v1/cameras/{cameraId}/analytics/dwell-time?from=2026-07-20T00:00:00Z&to=2026-07-22T23:59:59Z"

# Get queue metrics
curl "http://localhost:8080/v1/cameras/{cameraId}/analytics/queue?from=2026-07-20T00:00:00Z&to=2026-07-22T23:59:59Z"
```

## ⚙️ Configuration Tips

### Reduce False Alarms

1. **Increase confidence threshold**: 70% → 80%
2. **Add minimum duration**: Require 2-3 seconds
3. **Use zone filtering**: Exclude irrelevant areas
4. **Increase cooldown**: 60s → 120s
5. **Use schedules**: Only alert during specific times

### Improve Detection Accuracy

1. **Better camera placement**: Clear view, good lighting
2. **Use sub-streams**: Lower resolution for analytics
3. **Adjust frame rate**: 1-2 FPS is sufficient
4. **Fine-tune zones**: Precise polygon boundaries
5. **Test different thresholds**: Start at 70%, adjust based on results

### Optimize Performance

1. **Frame rate**: Use 1 FPS for analytics
2. **Resolution**: Process 640x480 or 1280x720
3. **Motion trigger**: Only run ML on motion-detected frames
4. **GPU acceleration**: Enable CUDA or OpenVINO
5. **Horizontal scaling**: Run multiple analytics engines

## 🔧 Troubleshooting

### No Alerts Generated

**Check**:
1. Is the rule enabled?
2. Is the camera within schedule?
3. Is confidence threshold too high?
4. Is cooldown blocking duplicate alerts?

**Fix**:
```bash
# Check analytics engine logs
docker-compose logs analytics-engine

# Check event submission
curl http://localhost:8092/health
```

### High CPU Usage

**Solutions**:
1. Reduce frame rate to 1 FPS
2. Use lower resolution sub-streams
3. Enable GPU acceleration
4. Process fewer cameras per engine
5. Scale horizontally with multiple engines

### Missed Detections

**Solutions**:
1. Lower confidence threshold (try 60%)
2. Reduce minimum duration (try 1 second)
3. Check camera angle and lighting
4. Verify zone coverage
5. Test with manual event submission

## 📚 Documentation

- **Full Guide**: `ANALYTICS_INTEGRATION_GUIDE.md`
- **Implementation Summary**: `VIDEO_ANALYTICS_IMPLEMENTATION_SUMMARY.md`
- **Analytics Engine README**: `analytics-engine/README.md`
- **API Documentation**: http://localhost:8092/docs (Swagger)

## 🆘 Support

**Check Logs**:
```bash
# Analytics engine
docker-compose logs -f analytics-engine

# Control plane
docker-compose logs -f api

# All services
docker-compose logs -f
```

**Health Checks**:
```bash
# Analytics engine
curl http://localhost:8092/health

# Control plane
curl http://localhost:8080/health
```

## 🎓 Training Resources

### Video Tutorials (Coming Soon)
1. Creating your first detection rule
2. Drawing detection zones visually
3. Configuring alert escalation
4. Viewing analytics dashboards

### Example Scenarios
- Bank vault monitoring
- ATM security
- Crowd management
- Perimeter security
- Fire safety
- Parking management

## ⏭️ Next Steps

1. **Review Alerts**: Check alert queue daily
2. **Tune Rules**: Adjust thresholds based on false alarms
3. **Add Zones**: Define critical areas for monitoring
4. **Configure Notifications**: Set up email/SMS alerts
5. **Export Reports**: Use analytics dashboard for insights

---

**Ready to detect!** Start with a single camera and one simple rule, then expand as you learn the system.
