# Video Analytics & AI Integration Guide

## Architecture Overview

The Video Analytics & AI module is now fully implemented as an **independent service** that runs parallel to live streaming and recording. AI failures never interrupt video capture.

```
Camera / DVR / NVR
        │
        ▼
   Media Gateway (Stream Manager)
        │
        ├── Live Monitoring (WebRTC/HLS)
        ├── Recording Engine (Evidence Storage)
        └── Analytics Engine (AI Detection) ← INDEPENDENT SERVICE
                  │
                  ├── Motion Detector
                  ├── Object Detector (Person/Vehicle/Fire-Smoke)
                  ├── Zone Detector (Line-Crossing/Intrusion/Loitering)
                  ├── Camera Health Detector (Tampering/Video-Loss)
                  └── Notification Engine
                        │
                        ▼
                  Alert Management
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
    Dashboard        Email/SMS      Webhooks
```

## Components Implemented

### 1. Analytics Engine Service (`analytics-engine/`)

**Core Detection Capabilities (Phase 1):**
- ✅ Motion detection (first-stage trigger)
- ✅ Person detection
- ✅ Vehicle detection (car, motorcycle, bus, truck, bicycle)
- ✅ Object detection (bag, package, fire, smoke)
- ✅ Line crossing (directional counting)
- ✅ Intrusion-zone detection (polygon zones)
- ✅ Loitering detection (dwell time tracking)
- ✅ Crowd-density detection
- ✅ Camera tampering (covered lens, defocus, spray)
- ✅ Video-loss detection
- ✅ Fire and smoke detection

**Key Files:**
- `src/detectors/base-detector.ts` - Base interface for all detectors
- `src/detectors/motion-detector.ts` - Motion detection
- `src/detectors/object-detector.ts` - ML object detection (YOLO-ready)
- `src/detectors/zone-detector.ts` - Zone-based analytics
- `src/detectors/camera-health-detector.ts` - Camera health monitoring
- `src/analytics-pipeline.ts` - Orchestrates all detectors
- `src/notification-engine.ts` - Multi-channel notifications
- `src/stream-processor.ts` - Video stream processing
- `src/app.ts` - FastAPI service

### 2. Control Plane API (`src/routes/`)

**Analytics Configuration:**
- ✅ Analytics models management
- ✅ Analytics rules (per-camera configuration)
- ✅ Analytics zones (polygon/line drawing)
- ✅ Alert management (acknowledge, escalate, resolve)
- ✅ Event submission and validation

**Analytics Metrics:**
- ✅ Footfall counting (entries/exits)
- ✅ Dwell time analysis
- ✅ Queue metrics
- ✅ Heat map generation
- ✅ Branch analytics summary
- ✅ Trend analysis

**Key Files:**
- `src/routes/analytics.routes.ts` - Core analytics API
- `src/routes/analytics-metrics.routes.ts` - Metrics and reporting
- `src/analytics/rule-engine.ts` - Rule matching logic

### 3. Database Schema (`database/migrations/012_video_analytics.sql`)

**Tables Created:**
- `analytics_models` - AI model configurations
- `analytics_zones` - Detection zones (polygon/line)
- `analytics_rules` - Per-camera detection rules
- `analytics_events` - Normalized detection events
- `detected_objects` - Objects in each event
- `object_tracks` - Object tracking across frames
- `analytics_alerts` - Operator alerts
- `analytics_notifications` - Multi-channel notifications
- `analytics_escalations` - Alert escalation history
- `analytics_acknowledgements` - Alert acknowledgment logs
- `analytics_footfall_metrics` - Entry/exit counting
- `analytics_dwell_metrics` - Dwell time statistics
- `analytics_queue_metrics` - Queue analysis
- `analytics_heatmap_metrics` - Movement heat maps

**Permissions Configured:**
- `analytics:view` - View analytics data
- `analytics:configure` - Configure rules and zones
- `alerts:acknowledge` - Acknowledge alerts
- `alerts:escalate` - Escalate alerts
- `analytics:export` - Export analytics data

### 4. Frontend Dashboard (`dashboard/`)

**Components:**
- ✅ `components/analytics-console.tsx` - Alert queue and rule management
- ✅ `components/analytics-dashboard.tsx` - Metrics visualization
- ✅ `components/analytics-zone-editor.tsx` - Visual zone drawing
- ✅ `app/analytics/dashboard/page.tsx` - Dashboard page

**Features:**
- Real-time alert acknowledgment
- Rule configuration per camera
- Visual zone drawing (polygon/line)
- Footfall charts and trends
- Dwell time analysis
- Queue metrics visualization
- Branch-level analytics summary

## Integration Steps

### Step 1: Install ML Dependencies (Optional)

The analytics engine is built with placeholders for actual ML models. To enable real detection:

```bash
# For TensorFlow.js
npm install @tensorflow/tfjs @tensorflow/tfjs-node

# For ONNX Runtime
npm install onnxruntime-node

# For OpenCV (advanced)
npm install opencv4nodejs
```

### Step 2: Configure Analytics Engine

Update `.env`:

```env
# Analytics Engine
ANALYTICS_ENGINE_PORT=4003
ANALYTICS_SOURCE_SHARED_KEY=your-source-key-here
ANALYTICS_ENGINE_SHARED_KEY=your-engine-key-here
CONTROL_PLANE_URL=http://localhost:4000

# Optional: ML Model Paths
YOLO_MODEL_PATH=/models/yolov8n.onnx
FACE_MODEL_PATH=/models/face-detection.onnx
```

### Step 3: Start Analytics Engine

```bash
cd analytics-engine
npm install
npm run build
npm start
```

The service will start on port 4003 and connect to the control plane.

### Step 4: Configure Camera Analytics Rules

1. Navigate to `/analytics` in the dashboard
2. Select a branch and camera
3. Click "New rule" to create detection rules
4. Configure:
   - Detection type (person, vehicle, intrusion, etc.)
   - Confidence threshold (default 70%)
   - Minimum duration (seconds)
   - Cooldown period (seconds)
   - Severity level (P1-P5)
   - Recording policy (alert only, event recording, protected incident)
   - Recipients (email/SMS)
   - Optional: Zone (polygon or line)
   - Optional: Schedule (time-based activation)

### Step 5: Test Detection Pipeline

Send a test detection event:

```bash
curl -X POST http://localhost:4003/v1/detect \
  -H "Content-Type: application/json" \
  -H "x-analytics-source-key: your-source-key-here" \
  -d '{
    "tenantId": "tenant-uuid",
    "cameraId": "camera-uuid",
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
        "boundingBox": {"x": 0.2, "y": 0.3, "width": 0.15, "height": 0.4}
      }
    ],
    "metadata": {}
  }'
```

### Step 6: Monitor Analytics Health

Check analytics engine health:

```bash
curl http://localhost:4003/health
```

Response includes:
- Pipeline status
- Detector health
- Active stream count
- Notification queue status

### Step 7: View Analytics Dashboard

Navigate to `/analytics/dashboard` to see:
- Total alerts by severity
- Footfall trends (entries/exits)
- Average dwell time
- Queue analysis
- Active rules count
- Branch-level summaries

## Real ML Model Integration

### Object Detection (YOLO)

Replace the placeholder in `object-detector.ts`:

```typescript
async initialize(): Promise<void> {
  // Load YOLO model
  const model = await tf.loadGraphModel('file:///models/yolov8n/model.json');
  this.model = model;
  this.isInitialized = true;
}

async detect(frame: DetectionFrame): Promise<DetectionResult[]> {
  // Prepare input tensor
  const input = tf.browser.fromPixels(frame.imageData)
    .resizeBilinear([640, 640])
    .div(255.0)
    .expandDims(0);

  // Run inference
  const predictions = await this.model.predict(input) as tf.Tensor;
  const [boxes, scores, classes] = await Promise.all([
    predictions.slice([0, 0], [1, -1, 4]).squeeze().array(),
    predictions.slice([0, 0, 4], [1, -1, 1]).squeeze().array(),
    predictions.slice([0, 0, 5], [1, -1, -1]).argMax(-1).array(),
  ]);

  // Process detections...
}
```

### Fire/Smoke Detection

Use a specialized model or image classification:

```typescript
const smokeModel = await tf.loadLayersModel('file:///models/smoke-detection/model.json');
const result = await smokeModel.predict(inputTensor);
```

### Face Detection (Phase 2)

```typescript
import * as faceapi from 'face-api.js';
await faceapi.nets.ssdMobilenetv1.loadFromDisk('/models/face');
const detections = await faceapi.detectAllFaces(image);
```

## Stream Processing Integration

### Connect to Media Gateway

The stream processor can consume video streams from:

1. **RTSP streams** (DVR/NVR/IP cameras)
2. **HLS streams** (from media gateway)
3. **WebRTC streams** (for real-time processing)

Example RTSP integration with FFmpeg:

```typescript
import ffmpeg from 'fluent-ffmpeg';

private async fetchFrame(source: StreamSource): Promise<DetectionFrame | null> {
  return new Promise((resolve, reject) => {
    ffmpeg(source.streamUrl)
      .outputOptions([
        '-f image2pipe',
        '-vframes 1',
        '-vcodec mjpeg',
      ])
      .on('error', reject)
      .pipe()
      .on('data', (chunk) => {
        // Convert chunk to DetectionFrame
        resolve({
          cameraId: source.cameraId,
          tenantId: source.tenantId,
          timestamp: new Date(),
          imageData: chunk,
          width: 1920,
          height: 1080,
        });
      });
  });
}
```

## Notification Configuration

### Email (via SendGrid/AWS SES)

Update control plane with email service:

```typescript
// src/routes/internal-notifications.ts
app.post("/internal/email", async (request, reply) => {
  const { to, subject, html } = request.body;
  
  // SendGrid example
  await sgMail.send({
    to,
    from: 'alerts@aditisentinel.com',
    subject,
    html,
  });
  
  return { status: "sent" };
});
```

### SMS (via Twilio/AWS SNS)

```typescript
app.post("/internal/sms", async (request, reply) => {
  const { to, message } = request.body;
  
  // Twilio example
  await twilioClient.messages.create({
    to,
    from: '+1234567890',
    body: message,
  });
  
  return { status: "sent" };
});
```

### Push Notifications (via Firebase)

```typescript
app.post("/internal/push", async (request, reply) => {
  const { userId, title, body, data } = request.body;
  
  // Firebase example
  await admin.messaging().send({
    token: userFCMToken,
    notification: { title, body },
    data,
  });
  
  return { status: "sent" };
});
```

## Alert Workflow

```
Detection Event
      ↓
Rule Matching (confidence, duration, schedule, zone)
      ↓
Duplicate Filtering (cooldown period)
      ↓
Alert Creation (new status)
      ↓
Notification Sent (email/SMS/push/webhook)
      ↓
Operator Acknowledges
      ↓
Investigation / Escalation
      ↓
Resolution / False Alarm / Incident Creation
```

## Performance Optimization

### Edge vs Cloud

**Edge Processing (Recommended for Phase 1):**
- Motion detection
- Person/vehicle detection
- Line crossing
- Intrusion detection
- Low latency (<200ms)
- Works during internet outages

**Cloud Processing (Phase 2):**
- Face recognition
- ANPR (License Plate Recognition)
- Advanced behavior analysis
- Cross-branch analytics
- Model updates

### Frame Rate Configuration

Adjust processing frame rate per camera:

```typescript
await streamProcessor.startStream({
  cameraId: "camera-uuid",
  tenantId: "tenant-uuid",
  streamUrl: "rtsp://camera/stream",
  enabled: true,
  frameRate: 1, // 1 FPS for analytics (vs 25-30 FPS for recording)
}, rules);
```

Lower frame rates (1-2 FPS) are sufficient for most analytics while reducing CPU load.

## Privacy & Compliance

### Data Retention

Configure in `.env`:

```env
# Analytics data retention
ANALYTICS_EVENTS_RETENTION_DAYS=90
ANALYTICS_ALERTS_RETENTION_DAYS=365
ANALYTICS_METRICS_RETENTION_DAYS=730
```

### Face Recognition Controls

Face recognition requires additional permissions:

```sql
-- Add face recognition permissions
INSERT INTO role_permissions (role, action, resource_type, description)
VALUES
  ('super_admin', 'face:view', NULL, 'View face detection results'),
  ('super_admin', 'face:enrol', NULL, 'Enrol faces in watchlist'),
  ('super_admin', 'face:search', NULL, 'Search face database');
```

### Audit Logging

All analytics operations are logged:
- Alert acknowledgments
- Rule changes
- Zone modifications
- Face searches (Phase 2)
- ANPR queries (Phase 2)

## Troubleshooting

### Analytics Engine Not Starting

Check logs:
```bash
cd analytics-engine
npm run build
node dist/index.js
```

Common issues:
- Missing `CONTROL_PLANE_URL` environment variable
- Incorrect shared keys
- Port 4003 already in use

### No Alerts Generated

1. Check rule configuration:
   - Is the rule enabled?
   - Is confidence threshold too high?
   - Is the camera within schedule?
   - Is cooldown period blocking alerts?

2. Check event submission:
   ```bash
   curl http://localhost:4003/health
   ```
   Look for `received` and `accepted` counts.

3. Check control plane logs for validation errors.

### Detection Accuracy Issues

1. Lower confidence threshold (try 60% instead of 70%)
2. Increase minimum duration (reduce false positives)
3. Use zone filtering to reduce irrelevant areas
4. Adjust motion sensitivity threshold
5. Consider better-lit camera placement

### High CPU Usage

1. Reduce frame rate (1 FPS is usually sufficient)
2. Process only motion-detected frames
3. Use hardware acceleration (GPU/NPU)
4. Scale horizontally (multiple analytics engines)
5. Use lower-resolution sub-streams

## Next Steps (Phase 2)

Ready to implement:
- Face detection and recognition
- ANPR (License Plate Recognition)
- Unattended object detection
- Removed object detection
- Advanced behavior analysis
- Queue management alerts
- Heat map visualization
- Cross-branch correlation

Contact the development team for Phase 2 implementation guidance.

## Production Deployment

### Docker Compose

Add analytics engine to `compose.yaml`:

```yaml
analytics-engine:
  build: ./analytics-engine
  ports:
    - "4003:4003"
  environment:
    - ANALYTICS_ENGINE_PORT=4003
    - CONTROL_PLANE_URL=http://control-plane:4000
    - ANALYTICS_SOURCE_SHARED_KEY=${ANALYTICS_SOURCE_SHARED_KEY}
    - ANALYTICS_ENGINE_SHARED_KEY=${ANALYTICS_ENGINE_SHARED_KEY}
  volumes:
    - ./models:/models:ro
  depends_on:
    - control-plane
  restart: unless-stopped
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: analytics-engine
spec:
  replicas: 3
  selector:
    matchLabels:
      app: analytics-engine
  template:
    spec:
      containers:
      - name: analytics-engine
        image: aditisentinel/analytics-engine:latest
        ports:
        - containerPort: 4003
        env:
        - name: CONTROL_PLANE_URL
          value: "http://control-plane:4000"
        volumeMounts:
        - name: models
          mountPath: /models
          readOnly: true
      volumes:
      - name: models
        persistentVolumeClaim:
          claimName: ml-models-pvc
```

## Support

For issues or questions:
- Check logs: `docker-compose logs analytics-engine`
- Review API docs: http://localhost:4003/docs
- Open GitHub issue with reproduction steps

---

**Aditi Sentinel Video Analytics & AI** - Intelligent security operations for modern enterprises.
